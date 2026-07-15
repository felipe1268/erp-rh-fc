import { router, protectedProcedure } from "../_core/trpc";
import { getDb, createAuditLog, getUserCompanyLinks, getCompaniesForUser } from "../db";
import { resolveCompanyIds } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";

const CC_MINUSCULAS = new Set(["e","de","da","do","das","dos","em","a","o","as","os","por","para","com","ao","na","no","nas","nos"]);
function normalizarNomeCC(nome: string): string {
  return nome.trim().split(/\s+/).map((w, i) => {
    const lower = w.toLowerCase();
    return (i === 0 || !CC_MINUSCULAS.has(lower))
      ? lower.charAt(0).toUpperCase() + lower.slice(1)
      : lower;
  }).join(" ");
}
import { z } from "zod";
import { sql } from "drizzle-orm";
import { storagePut, dbRetrieve } from "../storage";
import { invokeGeminiVision, invokeLLM } from "../_core/llm";
import { assertAiModuleEnabled } from "../_core/aiConfig";
import { seedPlanoDeConta, ensureTaxConfig } from "../services/financialSeedAccounts";
import { autoVincularNfsPorLinhas } from "../services/autoVincularNfService";
import { runAllAutoImports } from "../services/financialAutoImport";
// Rev. 3147 — TRAVA "Financeiro só real": fonte única das origens de projeção +
// flag global. Quando FINANCEIRO_SOMENTE_REAL, os endpoints de leitura escondem
// TODAS as projeções (cronograma/PCP/folha projetada/etc.), não só o cronograma.
import { sqlNotProjecao, FINANCEIRO_SOMENTE_REAL } from "../../shared/financeiroProjecao";
import { detectarParesEstorno, pareceCompensacaoCheque, pareceDevolucaoCheque, parseDocNumero, parseChequeNumero, parseMotivoDevolucao, type LinhaEstornoMin } from "../../shared/chequeMotivos";
import {
  runAllDespesasImport,
  runAllReceitasImport,
  verificarImpactoFinanceiro,
  solicitarAprovacaoPorAlcada,
  rollbackFinanceiroPorOrigem,
  sincronizarStatusPagamento,
  gerarAlertasVencimento,
  importAllMedicoesPrevistaToFinancial,
  importAllMedicoesPrevistaToRevenue,
  importAtividadesCronogramaToFinancial,
} from "../services/financialIntegrationBridge";
import {
  calcularKpis,
  calcularDRE,
  calcularDRELinhaDetalhe,
  dreDisponibilidade,
  projetarFluxoCaixa90Dias,
  gerarEFDReinf,
  dreRange,
} from "../services/financialKpiService";
import { runFinancialJobNow } from "../services/financialAutoImportJob";
import { parseCaixaExtratoPdf } from "../services/caixaPdfParser";
import { parseSantanderExtratoPdf, type RendimentoAplicacao } from "../services/santanderPdfParser";
import { parseSantanderIbpjPdf } from "../services/santanderIbpjParser";
import { parseBancoBrasilExtratoPdf } from "../services/bbPdfParser";
import { parseExtratoComIA } from "../services/extratoIaParser";
import { detectarTemplateExtrato } from "./bankStatementTemplates";
import {
  computeThreeWayMatch, blockPaymentByThreeWay, releasePaymentByThreeWay,
  parseOFX, parseCNAB, suggestReconciliation, applyReconciliation,
  computeDynamicDiscounting, computeDREDual,
  generateFinancialAlerts, getAlertsForCompany, markAlertRead,
} from "../services/cfoPhase2";

// ============================================================
// MÓDULO FINANCEIRO — Router tRPC
// ============================================================

// Rev. 3803 — Normaliza nome de conta para detecção de similares:
// remove acentos, preposições curtas e não-alfanuméricos.
// "SEGURO DE VEÍCULOS" == "Seguro Veículos" == "seguroveiculos"
function _normalizeAccountName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+(de|do|da|dos|das|e|s|a|o)\s+/gi, " ")
    .replace(/^(de|do|da|dos|das|e|s|a|o)\s+/gi, "")
    .replace(/\s+(de|do|da|dos|das|e|s|a|o)$/gi, "")
    .replace(/[^a-z0-9]/g, "");
}

function rows(res: any): any[] {
  return (res as any)?.rows ?? (res as any) ?? [];
}

/**
 * Guarda de acesso por empresa (anti-IDOR) p/ endpoints de leitura financeira
 * que recebem `companyId` no input. Mesma regra do `_assertCompanyAccess` de
 * Terceiros: admin/admin_master liberam; usuário COM vínculos em
 * `user_companies` enforça membership; usuário SEM vínculos (config global por
 * grupo/módulo) libera.
 */
async function _assertFinanceiroCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

// Rev. 3216 — garante que a conta bancária pertence à empresa antes de
// ler/gravar os demonstrativos consolidados. Evita persistir registros órfãos
// (conta de outra empresa) via chamada direta da API (defesa em profundidade,
// além do _assertFinanceiroCompanyAccess que já barra acesso cross-tenant).
async function _assertContaBancariaPertenceEmpresa(db: any, contaBancariaId: number, companyId: number) {
  const res = await dbExecute(db,
    `SELECT id FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
    [contaBancariaId, companyId]
  );
  if (!rows(res)[0]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa." });
  }
}

// Rev. 3743 — Recalcula o ROLLUP de um lançamento a partir das suas baixas ATIVAS:
//   valor_realizado = SUM(valor das baixas não estornadas)
//   status = derivado (tipo-aware): quitado se SUM>=previsto OU houver baixa quitou_total=1;
//            parcial (recebido_parcial p/ receita; despesa segue 'a_pagar'); zerado volta ao aberto.
//   data_pagamento = data da última baixa quando quitado; NULL enquanto parcial.
// dbExecute liga params por ORDEM DE APARIÇÃO — placeholders e array seguem a mesma ordem.
// Rev. 3743 — serializa todas as operações de baixa/estorno/rollup do MESMO lançamento
// (registrarBaixa, estornarBaixaItem, estornarPagamento, estornarReceber). Usado DENTRO de
// uma transação (lock de transação) para impedir corrida no BACKFILL (duplo "Baixa anterior")
// e no rollup (duas baixas concorrentes somando estado defasado). hashtext→int4, aceito por
// pg_advisory_xact_lock(bigint); a chave inclui companyId p/ não colidir entre empresas.
async function _lockEntryBaixas(tx: any, companyId: number, entryId: number) {
  await dbExecute(tx, `SELECT pg_advisory_xact_lock(hashtext($1))`, [`feb:${companyId}:${entryId}`]);
}

// Rev. 3743 — soft-estorna TODAS as baixas ativas de um lançamento (usado pelos estornos
// legados estornarPagamento/estornarReceber, p/ que o histórico de baixas fique consistente
// com o entry reaberto — senão ficam linhas ativas órfãs que o rollup re-somaria na próxima baixa).
async function _estornarBaixasAtivasDoEntry(tx: any, entryId: number, companyId: number, userId: any, userName: any, motivo: string) {
  await dbExecute(tx,
    `UPDATE financial_entry_baixas
     SET estornada_em=NOW(), estornada_por_id=$1, estornada_por_nome=$2, estorno_motivo=$3
     WHERE entry_id=$4 AND company_id=$5 AND estornada_em IS NULL`,
    [userId ?? null, userName ?? null, motivo, entryId, companyId]
  );
}

async function _aplicarRollupBaixas(db: any, entryId: number, companyId: number) {
  const [entry]: any = await dbExecute(db,
    `SELECT id, tipo, valor_previsto FROM financial_entries WHERE id=$1 AND company_id=$2`,
    [entryId, companyId]
  ).then((r: any) => (Array.isArray(r) ? r : r?.rows ?? []));
  if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
  const agg: any = rows(await dbExecute(db,
    `SELECT COALESCE(SUM(valor),0) AS soma,
            MAX(CASE WHEN quitou_total=1 THEN 1 ELSE 0 END) AS tem_quitacao,
            MAX(data) AS ultima_data
     FROM financial_entry_baixas
     WHERE entry_id=$1 AND company_id=$2 AND estornada_em IS NULL`,
    [entryId, companyId]
  ))[0] ?? {};
  const previsto = Number(entry.valor_previsto ?? 0);
  const acumulado = Math.round(Number(agg.soma ?? 0) * 100) / 100;
  const forceQuit = Number(agg.tem_quitacao ?? 0) === 1;
  const temBaixa = acumulado > 0 || forceQuit;
  const quitado = temBaixa && (forceQuit || acumulado + 0.005 >= previsto);
  const isReceita = entry.tipo === "receita";
  let novoStatus: string;
  if (quitado) novoStatus = isReceita ? "recebido" : "pago";
  else if (acumulado > 0) novoStatus = isReceita ? "recebido_parcial" : "a_pagar";
  else novoStatus = isReceita ? "a_receber" : "a_pagar";
  const dataPag = quitado
    ? (agg.ultima_data ? String(agg.ultima_data).slice(0, 10) : new Date().toISOString().slice(0, 10))
    : null;
  // Propaga a conta bancária da última baixa ativa (com conta) para o ENTRY. Sem isto o
  // lançamento fica conta_bancaria_id=NULL e cai em "Sem conta definida" na Conciliação,
  // mesmo quando o recebimento/baixa informou a conta. COALESCE: nunca sobrescreve com NULL.
  const contaRow: any = rows(await dbExecute(db,
    `SELECT conta_bancaria_id AS "contaBancariaId" FROM financial_entry_baixas
     WHERE entry_id=$1 AND company_id=$2 AND estornada_em IS NULL AND conta_bancaria_id IS NOT NULL
     ORDER BY data DESC, id DESC LIMIT 1`,
    [entryId, companyId]
  ))[0] ?? {};
  const ultimaConta = contaRow.contaBancariaId != null ? Number(contaRow.contaBancariaId) : null;
  await dbExecute(db,
    `UPDATE financial_entries
     SET valor_realizado=$1, status=$2, data_pagamento=$3, conta_bancaria_id=COALESCE($4, conta_bancaria_id), updated_at=NOW()
     WHERE id=$5 AND company_id=$6`,
    [acumulado > 0 ? acumulado : null, novoStatus, dataPag, ultimaConta, entryId, companyId]
  );
  return {
    acumulado, previsto, quitado, status: novoStatus,
    saldo: Math.max(0, Math.round((previsto - acumulado) * 100) / 100),
  };
}

// Executa queries parametrizadas corretamente no Drizzle ORM
// dbExecute(db, string, array) ignora o array — é preciso usar sql template
//
// Rev. 2170 — DIAGNÓSTICO: try/catch ao redor do execute. Lilian (financeiro,
// company 60002) reportou que editar Plano de Contas falha com toast
// "Failed query: UPDATE financial_accounts SET ...", mas a mensagem real do
// Postgres (code 23xxx/42xxx + detail + constraint) estava sendo engolida pelo
// wrapper DrizzleQueryError. Agora: log no servidor com causa COMPLETA (code,
// detail, constraint, column, hint, schema, table) + re-throw com mensagem
// enriquecida pra surgir no toast do front. Comportamento de sucesso intacto.
async function dbExecute(db: any, query: string, params: unknown[] = []): Promise<{ rows: any[] }> {
  const parts = query.split(/\$\d+/g);
  let built: any = sql.raw(parts[0] ?? "");
  for (let i = 1; i < parts.length; i++) {
    const paramVal = params[i - 1];
    const tail = parts[i] ?? "";
    built = tail ? sql`${built}${paramVal}${sql.raw(tail)}` : sql`${built}${paramVal}`;
  }
  try {
    const res = await db.execute(built);
    const rowsArr: any[] = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
    return { rows: rowsArr };
  } catch (e: any) {
    const cause: any = e?.cause ?? e;
    const bits = [
      cause?.code ? `code=${cause.code}` : null,
      cause?.constraint ? `constraint=${cause.constraint}` : null,
      cause?.column ? `column=${cause.column}` : null,
      cause?.table ? `table=${cause.table}` : null,
      cause?.detail ? `detail=${cause.detail}` : null,
      cause?.hint ? `hint=${cause.hint}` : null,
      cause?.message ? `msg=${cause.message}` : null,
    ].filter(Boolean);
    const diag = bits.length ? bits.join(" | ") : (e?.message ?? "erro desconhecido");
    console.error("[dbExecute][PG ERROR]", diag, "\n  Q:", query, "\n  P:", JSON.stringify(params));
    const enriched = new Error(`DB: ${diag}`);
    (enriched as any).cause = e;
    throw enriched;
  }
}


// Safe inline of integer IDs to avoid pg-driver array literal issues
function inlineIds(ids: number[]): string {
  if (!ids || !ids.length) return "0";
  return ids.map(Number).join(",");
}

// Rev. 3750 — COBERTURA de cheque devolvido por IDENTIDADE do cheque (doc/nº + valor),
// não pelo id volátil da linha do extrato. Re-imports de extrato CRIAM linhas novas e
// EXCLUEM as antigas (rotação de bank_statement_lines.id); um vínculo ancorado numa linha
// antiga ficava órfão e a cobertura lia 0 ("vinculado, mas valor zerado") mesmo com o
// vínculo gravado. Aqui casamos os vínculos pela linha de débito EXATA (compat.) OU pela
// mesma identidade de cheque (doc/nº parseado da descrição da linha de débito + valor abs).
// READ-ONLY: só lê/soma; não cria/altera linha de extrato (regra de ouro Rev. 3747).
async function _coberturaChequeDevolvido(db: any, companyId: number, debitoLineId: number) {
  const dSel = await dbExecute(db,
    `SELECT valor, descricao FROM bank_statement_lines WHERE id=$1 AND company_id=$2`,
    [debitoLineId, companyId]);
  const d = rows(dSel)[0] as any;
  const cents = Math.round(Math.abs(Number(d?.valor ?? 0)) * 100);
  const doc = parseDocNumero(d?.descricao);
  const chq = parseChequeNumero(d?.descricao);
  const vSel = await dbExecute(db,
    `SELECT v.id, v.debito_line_id AS "debitoLineId", v.pix_line_id AS "pixLineId", v.valor,
            dl.descricao AS "debDescricao", dl.valor AS "debValor"
       FROM bank_cheque_vinculos v
       LEFT JOIN bank_statement_lines dl ON dl.id = v.debito_line_id
      WHERE v.company_id=$1 AND v.estornado_em IS NULL`,
    [companyId]);
  const todos = rows(vSel) as any[];
  const meus = todos.filter((v) => _mesmoChequeDevolvido(
    { debitoLineId, cents, doc, chq },
    { debitoLineId: Number(v.debitoLineId), cents: Math.round(Math.abs(Number(v.debValor ?? 0)) * 100), doc: parseDocNumero(v.debDescricao), chq: parseChequeNumero(v.debDescricao) },
  ));
  const acumCents = meus.reduce((s, v) => s + Math.round(Number(v.valor) * 100), 0);
  return { cents, doc, chq, meus, acumCents };
}

// Rev. 4081 — rótulos das formas de pagamento de um vínculo tipo 'ajuste' (sem linha de
// extrato): usado tanto na descrição-padrão gravada quanto no audit log.
const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  dinheiro: "Pago em dinheiro",
  deposito: "Pago via depósito",
  cheque_proprio: "Quitado com outro cheque (compensação)",
  outro: "Quitação de saldo (ajuste manual)",
};

// Casa duas referências de cheque devolvido: mesma linha de débito (exata) OU mesma
// identidade lógica (valor abs igual + mesmo doc OU mesmo nº de cheque). Usado tanto na
// cobertura por linha (helper acima) quanto no lote (getChequeDevolvidoVinculacao).
function _mesmoChequeDevolvido(
  a: { debitoLineId: number; cents: number; doc: string | null; chq: string | null },
  b: { debitoLineId: number; cents: number; doc: string | null; chq: string | null },
): boolean {
  if (Number.isFinite(a.debitoLineId) && a.debitoLineId === b.debitoLineId) return true;
  if (!a.cents || a.cents !== b.cents) return false;
  if (a.doc && b.doc && a.doc === b.doc) return true;
  if (a.chq && b.chq && a.chq === b.chq) return true;
  return false;
}

// Rev. 3239 — Normaliza nome de fornecedor p/ AGRUPAR variações de caixa/acento como
// um mesmo emissor (ex.: "Auto Peças Mecânica Guincho Jefcar" == "AUTO PEÇAS MECANICA
// GUINCHO JEFCAR"). Só p/ a CHAVE de grupo; a exibição usa a grafia original mais
// frequente.
function _normNomeConc(s: any): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Rev. 3239 — UNIFICA na Conciliação Bancária os lançamentos que no EXTRATO aparecem
// como UM ÚNICO valor total (mas no ERP vivem pulverizados em N linhas):
//   • Vale Refeição (RH, origem `beneficio_vr`) → 1 total por MÊS (YYYY-MM).
//   • Combustível (Frota, `frota_abastecimento`) → agrupado pelo POSTO (fornecedor).
//   • Manutenção (Frota, `frota_manutencao`)    → agrupado pelo FORNECEDOR cadastrado.
// As demais linhas passam intactas. A SOMA é preservada (KPI não muda); só a CONTAGEM
// cai (objetivo: a lista deixa de ter centenas de linhas). Cada grupo é uma linha
// SINTÉTICA {id:"grp:…" (string), agrupado:true, itensIds:[…], qtd, valor=soma, …}.
// READ-ONLY (só formata o retorno; nada é gravado aqui).
// Rev. 3437 — Calcula a janela de fechamento de um lançamento dado o ciclo do fornecedor.
// Rev. 3514 — adicionado suporte a "quinzenal_semana": ciclo quinzenal ancorado num dia
//             da semana específico a partir de uma data de referência.
function _cicloWindow(dateStr: string, ciclo: string, refDate?: string | null): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = d.getUTCDate();
  if (ciclo === "mensal" || ciclo === "personalizado") return `${yyyy}-${mm}`;
  if (ciclo === "quinzenal") return `${yyyy}-${mm}-${day <= 15 ? "01" : "16"}`;
  if (ciclo === "quinzenal_semana") {
    // refDate é uma data (YYYY-MM-DD) que foi um dia de fechamento real.
    // Fechamentos ocorrem a cada 14 dias a partir dela.
    // A janela de um lançamento = a data de fechamento que "cobre" o lançamento,
    // ou seja, o menor múltiplo-de-14-dias-a-partir-de-ref ≥ dataStr.
    const ref = new Date((refDate || dateStr) + "T12:00:00Z");
    const diffDays = (d.getTime() - ref.getTime()) / 86400000;
    const period = Math.ceil(diffDays / 14);
    const closing = new Date(ref.getTime() + period * 14 * 86400000);
    return closing.toISOString().slice(0, 10);
  }
  if (ciclo === "semanal") {
    const jan1 = new Date(Date.UTC(yyyy, 0, 1));
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
    return `${yyyy}-W${String(week).padStart(2, "0")}`;
  }
  return `${yyyy}-${mm}`;
}

// Rev. 3437 — Etiqueta legível da janela de fechamento.
function _cicloWindowLabel(window: string, ciclo: string): string {
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  if (ciclo === "semanal" && window.includes("W")) {
    const [yyyy, w] = window.split("-W");
    return `Sem. ${w}/${yyyy}`;
  }
  if (ciclo === "quinzenal_semana" && window.length === 10) {
    const [yyyy, mm, dd] = window.split("-");
    const mes = MESES[parseInt(mm, 10) - 1] ?? mm;
    return `Quinz. até ${dd}/${mes.slice(0,3)} ${yyyy}`;
  }
  if (ciclo === "quinzenal" && window.length === 10) {
    const [yyyy, mm, dd] = window.split("-");
    const mes = MESES[parseInt(mm, 10) - 1] ?? mm;
    return `${dd === "01" ? "1ª" : "2ª"} quinz. ${mes} ${yyyy}`;
  }
  if (window.length === 7) {
    const [yyyy, mm] = window.split("-");
    return `${MESES[parseInt(mm, 10) - 1] ?? mm} ${yyyy}`;
  }
  return window;
}

// Rev. 3437 — Calcula o último dia da janela de fechamento (data de referência para vencimentos).
function _cicloFechamentoDate(window: string, ciclo: string): string {
  if (ciclo === "semanal" && window.includes("W")) {
    const [yyyy, ww] = window.split("-W");
    const jan4 = new Date(Date.UTC(parseInt(yyyy), 0, 4));
    const startOfWeek = new Date(jan4.getTime() - (jan4.getUTCDay() || 7) * 86400000 + parseInt(ww) * 7 * 86400000);
    const sun = new Date(startOfWeek.getTime() + 6 * 86400000);
    return sun.toISOString().slice(0, 10);
  }
  // Rev. 3514 — para quinzenal_semana a janela já É a data de fechamento (YYYY-MM-DD).
  if (ciclo === "quinzenal_semana" && window.length === 10) return window;
  if (ciclo === "quinzenal" && window.length === 10) {
    const [yyyy, mm, dd] = window.split("-");
    if (dd === "01") return `${yyyy}-${mm}-15`;
    const lastDay = new Date(Date.UTC(parseInt(yyyy), parseInt(mm), 0));
    return lastDay.toISOString().slice(0, 10);
  }
  if (window.length === 7) {
    const [yyyy, mm] = window.split("-");
    const lastDay = new Date(Date.UTC(parseInt(yyyy), parseInt(mm), 0));
    return lastDay.toISOString().slice(0, 10);
  }
  return window;
}

// Rev. 3437 — Gera array de parcelas de pagamento do fechamento.
function _calcParcelas(total: number, numParcelas: number, prazoDias: number, dataFechamento: string): any[] {
  if (!numParcelas || numParcelas <= 1) return [];
  const parcelas: any[] = [];
  const valorBase = Math.floor((total / numParcelas) * 100) / 100;
  const resto = Math.round((total - valorBase * numParcelas) * 100) / 100;
  const dtFech = new Date(dataFechamento + "T12:00:00Z");
  for (let i = 0; i < numParcelas; i++) {
    const dt = new Date(dtFech.getTime() + prazoDias * i * 86400000);
    const venc = dt.toISOString().slice(0, 10);
    const valor = i === numParcelas - 1 ? valorBase + resto : valorBase;
    parcelas.push({ num: i + 1, total: numParcelas, valor, vencimento: venc });
  }
  return parcelas;
}

// Rev. 4070 — Contas a Pagar: consolida por FORNECEDOR + CICLO DE FECHAMENTO (config no
// cadastro do fornecedor, empresas_terceiras.ciclo_*). Compras de várias obras/OCs do mesmo
// fornecedor dentro da mesma janela de fechamento viram UMA linha sintética "grp:fech|..."
// (mesmo padrão de _agruparConciliacao), expandível pra ver os lançamentos originais. Só
// agrupa fornecedores COM ciclo configurado (≠ 'avista') e só títulos NÃO PAGOS (pago/
// cancelado passam intactos — já liquidados, não há o que consolidar pra pagamento).
// Grupos com 1 único item voltam a ser individuais (não vale a pena consolidar 1 título).
// READ-ONLY (só formata o retorno da query; nada é gravado aqui).
// Rev. 4072 — Faturamento Direto (modalidade_fd IN fd_cliente/fd_terceiro/fd_fc) é
// dinheiro que o CLIENTE paga diretamente ao fornecedor — a FC nunca desembolsa esse
// valor, então NUNCA pode entrar no agrupamento/consolidação por ciclo de fechamento
// do fornecedor (misturaria valor de terceiro com o fluxo de caixa da empresa).
function _isFdModalidade(v: any): boolean {
  return v === "fd_cliente" || v === "fd_terceiro" || v === "fd_fc";
}

function _agruparContasPagarPorCicloForn(arr: any[], supplierCycleMap: Map<string, any>): any[] {
  if (!supplierCycleMap.size) return arr;
  // Rev. 4070 — os lançamentos vindos de OC costumam gravar fornecedor_nome como
  // "OC OC-2026-585 — FERRAGENS SANTA RITA" (descrição completa, não só o nome do
  // fornecedor cadastrado); um match EXATO contra empresas_terceiras nunca bate.
  // Fix: além do match exato, tenta achar o nome do fornecedor cadastrado como
  // SUBSTRING do texto (maior nome primeiro, pra evitar colisão entre fornecedores
  // com nomes parecidos).
  const candidatesByLen = Array.from(supplierCycleMap.entries()).sort((a, b) => b[0].length - a[0].length);
  function _matchCycleConfig(fornNormRaw: string): { key: string; config: any } | null {
    if (!fornNormRaw) return null;
    const exact = supplierCycleMap.get(fornNormRaw);
    if (exact) return { key: fornNormRaw, config: exact };
    for (const [key, config] of candidatesByLen) {
      if (key.length >= 4 && fornNormRaw.includes(key)) return { key, config };
    }
    return null;
  }
  const out: any[] = [];
  const groups = new Map<string, any>();
  for (const r of arr) {
    if (r.status === "pago" || r.status === "cancelado") { out.push(r); continue; }
    // Rev. 4072 — FD (Faturamento Direto) nunca entra no consolidado do fornecedor:
    // é o cliente quem paga o fornecedor diretamente, não a FC.
    if (_isFdModalidade(r.modalidadeFd)) { out.push(r); continue; }
    const fornNormRaw = _normNomeConc(String(r.fornecedorNome || ""));
    const match = _matchCycleConfig(fornNormRaw);
    const cycleConfig = match?.config;
    if (!cycleConfig || !cycleConfig.cicloPagamento || cycleConfig.cicloPagamento === "avista") {
      out.push(r); continue;
    }
    const fornNorm = match!.key;
    const fornecedorLabel = cycleConfig.nome || r.fornecedorNome || "Fornecedor";
    // Rev. 4071 — a janela de fechamento deve ser calculada pela data da COMPRA
    // (data_competencia, gravada no lançamento do OC), NÃO pelo vencimento
    // individual do título. O vencimento de cada OC é calculado com prazo próprio
    // (ex.: 15/30/45 dias) e varia item a item — usá-lo como base do fechamento
    // espalhava compras do MESMO ciclo em janelas diferentes (ou coincidiam por
    // acaso), fragmentando o agrupamento. A data de competência é sempre a data em
    // que a OC foi lançada no financeiro, então reflete o "quando comprou" real.
    const dataStr = String(r.dataCompetencia ?? r.dataVencimento ?? "").slice(0, 10);
    const win = dataStr ? _cicloWindow(dataStr, cycleConfig.cicloPagamento, cycleConfig.cicloDataReferencia) : "0000-00";
    const chave = `fech|${fornNorm}|${win}`;
    let g = groups.get(chave);
    if (!g) {
      g = {
        id: `grp:${chave}`,
        agrupado: true,
        grupoTipo: "fechamento_forn",
        obraId: null, obraNome: null,
        descricao: `${fornecedorLabel} · ${_cicloWindowLabel(win, cycleConfig.cicloPagamento)}`,
        fornecedorNome: fornecedorLabel,
        contaId: null, contaNome: null, centroCustoId: null, centroCustoNome: null,
        valorPrevisto: 0, valorRealizado: 0, status: "a_pagar",
        dataVencimento: _cicloFechamentoDate(win, cycleConfig.cicloPagamento),
        dataPagamento: null, dataCompetencia: null,
        formaPagamento: cycleConfig.cicloFormaPagamento || null,
        origemModulo: "consolidado_fornecedor", origemId: null, origemDescricao: null,
        anexoUrl: null, anexoNome: null, contaBancariaId: null,
        tipo: "despesa",
        diasAtraso: 0,
        itensIds: [] as number[],
        itens: [] as any[],
        _cicloConfig: cycleConfig,
        _cicloWindow: win,
      };
      groups.set(chave, g);
    }
    g.valorPrevisto += Number(r.valorPrevisto) || 0;
    g.itensIds.push(r.id);
    g.itens.push(r);
    if (Number(r.diasAtraso || 0) > g.diasAtraso) g.diasAtraso = Number(r.diasAtraso || 0);
  }
  for (const g of groups.values()) {
    if (g.itensIds.length < 2) { out.push(...g.itens); continue; }
    out.push(g);
  }
  return out;
}

function _agruparConciliacao(arr: any[], supplierCycleMap: Map<string, any> = new Map()): any[] {
  const GRUP: Record<string, string> = {
    beneficio_vr: "vr",
    beneficio_va: "va",
    beneficio_va_projetado: "va",
    frota_abastecimento: "combustivel",
    frota_manutencao: "manutencao",
    parceiro_lancamento: "parceiro",
    pagamento_pj: "pj",
  };
  const passthrough: any[] = [];
  const groups = new Map<string, any>();
  const cycleGroups = new Map<string, any>(); // Rev. 3437 — fechamento_forn
  for (const r of arr) {
    const tipoG = GRUP[String(r.origemModulo ?? "")];
    if (!tipoG) {
      // Rev. 3437 — checar se o fornecedor tem ciclo de fechamento configurado
      // Rev. 4072 — FD (Faturamento Direto) nunca entra no consolidado do fornecedor.
      if (supplierCycleMap.size && !_isFdModalidade(r.modalidadeFd)) {
        const fornNorm = _normNomeConc(String(r.fornecedorNome || ""));
        const cycleConfig = fornNorm ? supplierCycleMap.get(fornNorm) : undefined;
        if (cycleConfig && cycleConfig.cicloPagamento && cycleConfig.cicloPagamento !== "avista") {
          const dataStr = typeof r.data === "string"
            ? r.data.slice(0, 10)
            : (r.data ? new Date(r.data).toISOString().slice(0, 10) : "");
          const win = dataStr ? _cicloWindow(dataStr, cycleConfig.cicloPagamento, cycleConfig.cicloDataReferencia) : "0000-00";
          const chave = `fech|${fornNorm}|${win}`;
          let cg = cycleGroups.get(chave);
          if (!cg) {
            cg = {
              id: `grp:${chave}`,
              agrupado: true,
              grupoTipo: "fechamento_forn",
              descricao: `${r.fornecedorNome || "Fornecedor"} · ${_cicloWindowLabel(win, cycleConfig.cicloPagamento)}`,
              fornecedorNome: r.fornecedorNome || null,
              obraNome: null,
              valor: 0,
              tipo: "despesa",
              status: r.status,
              data: dataStr,
              dataMin: dataStr || "9999-12-31",
              dataMax: dataStr || "0000-01-01",
              qtd: 0,
              itensIds: [] as number[],
              itens: [] as any[],
              _cicloConfig: cycleConfig,
              _cicloWindow: win,
            };
            cycleGroups.set(chave, cg);
          }
          cg.valor += Number(r.valor) || 0;
          cg.qtd += 1;
          cg.itensIds.push(r.id);
          cg.itens.push({ id: r.id, descricao: r.descricao, fornecedorNome: r.fornecedorNome, valor: Number(r.valor) || 0, data: dataStr });
          if (dataStr && dataStr < cg.dataMin) cg.dataMin = dataStr;
          if (dataStr && dataStr > cg.dataMax) { cg.dataMax = dataStr; cg.data = dataStr; }
          continue;
        }
      }
      passthrough.push(r); continue;
    }
    const dataStr = typeof r.data === "string"
      ? r.data.slice(0, 10)
      : (r.data ? new Date(r.data).toISOString().slice(0, 10) : "");
    const ym = dataStr.slice(0, 7);
    let chave: string; let label: string;
    if (tipoG === "vr" || tipoG === "va") {
      chave = `${tipoG}|${ym}`;
      label = tipoG === "va" ? `Vale Alimentação ${ym}` : `Vale Refeição ${ym}`;
    } else {
      // combustível / manutenção → fornecedor da Frota; parceiro → parceiro conveniado;
      // pj → prestador (contratado PJ — pj_payments→employees/pj_contracts). Rev. 3261.
      const fornRaw = (tipoG === "parceiro"
        ? (r.parceiroFornecedor && String(r.parceiroFornecedor).trim())
        : tipoG === "pj"
        ? (r.pjFornecedor && String(r.pjFornecedor).trim())
        : (r.frotaFornecedor && String(r.frotaFornecedor).trim())) || "";
      const fn = _normNomeConc(fornRaw);
      // Parceiro e PJ fecham por MÊS (no extrato paga-se por prestador/mês — adiantamento +
      // fechamento somam numa única linha do terceiro); Frota agrupa pelo fornecedor dentro
      // do período já filtrado.
      const porMes = tipoG === "parceiro" || tipoG === "pj";
      chave = porMes ? `${tipoG}|${fn || "SEM"}|${ym}` : `${tipoG}|${fn || "SEM"}`;
      const pre = tipoG === "combustivel" ? "Combustível" : tipoG === "manutencao" ? "Manutenção" : tipoG === "pj" ? "Pagamento PJ" : "Parceiro";
      const semLabel = tipoG === "pj" ? `${pre} (sem prestador)` : `${pre} (sem fornecedor)`;
      label = fornRaw ? `${pre} · ${fornRaw}` : semLabel;
    }
    let g = groups.get(chave);
    if (!g) {
      g = {
        id: `grp:${chave}`,
        agrupado: true,
        grupoTipo: tipoG,
        descricao: label,
        fornecedorNome: tipoG === "vr" ? null : null,
        obraNome: null,
        valor: 0,
        tipo: r.tipo || "despesa",
        status: r.status,
        data: dataStr,
        dataMin: dataStr || "9999-12-31",
        dataMax: dataStr || "0000-01-01",
        qtd: 0,
        itensIds: [] as number[],
        itens: [] as any[],
        _fornCount: new Map<string, number>(),
        _pjSeenKeys: tipoG === "pj" ? new Set<string>() : undefined,
      };
      groups.set(chave, g);
    }
    // Rev. 3444 — PJ: dedup por (data, |valor|, descricao) dentro do grupo p/ absorver
    // duplicatas que existem no banco (geradas por revisão de contrato com novo contractId).
    // A entrada duplicada NÃO entra nos itens nem no valor total do grupo.
    if (tipoG === "pj" && g._pjSeenKeys) {
      const dupKey = `${dataStr}|${Math.abs(Number(r.valor))}|${String(r.descricao ?? "").trim()}`;
      if ((g._pjSeenKeys as Set<string>).has(dupKey)) continue;
      (g._pjSeenKeys as Set<string>).add(dupKey);
    }
    g.valor += Number(r.valor) || 0;
    g.qtd += 1;
    g.itensIds.push(r.id);
    g.itens.push({ id: r.id, descricao: r.descricao, fornecedorNome: r.fornecedorNome, valor: Number(r.valor) || 0, data: dataStr });
    if (dataStr && dataStr < g.dataMin) g.dataMin = dataStr;
    if (dataStr && dataStr > g.dataMax) { g.dataMax = dataStr; g.data = dataStr; }
    if (tipoG !== "vr") {
      const fornForCount = tipoG === "parceiro" ? r.parceiroFornecedor : tipoG === "pj" ? r.pjFornecedor : r.frotaFornecedor;
      if (fornForCount) {
        const k = String(fornForCount).trim();
        if (k) g._fornCount.set(k, (g._fornCount.get(k) || 0) + 1);
      }
    }
  }
  const out: any[] = [...passthrough];
  for (const g of groups.values()) {
    if (g.grupoTipo === "vr" || g.grupoTipo === "va") {
      g.fornecedorNome = null;
    } else if (g._fornCount.size) {
      let best = ""; let bestN = -1;
      for (const [k, n] of g._fornCount) if (n > bestN) { best = k; bestN = n; }
      g.fornecedorNome = best || null;
      const pre = g.grupoTipo === "combustivel" ? "Combustível" : g.grupoTipo === "manutencao" ? "Manutenção" : g.grupoTipo === "pj" ? "Pagamento PJ" : "Parceiro";
      g.descricao = best ? `${pre} · ${best}` : (g.grupoTipo === "pj" ? `${pre} (sem prestador)` : `${pre} (sem fornecedor)`);
    }
    delete g._fornCount;
    out.push(g);
  }
  // Rev. 3437 — finalizar grupos de fechamento de fornecedor (ciclo configurado)
  for (const cg of cycleGroups.values()) {
    const cfg = cg._cicloConfig;
    const win = cg._cicloWindow;
    const dataFech = _cicloFechamentoDate(win, cfg.cicloPagamento);
    const numParcelas = Number(cfg.cicloNumParcelas) || 1;
    const prazoDias = Number(cfg.cicloPrazoParcela) || 30;
    cg.cicloFormaPagamento = cfg.cicloFormaPagamento || null;
    cg.cicloNumParcelas = numParcelas;
    cg.parcelas = _calcParcelas(cg.valor, numParcelas, prazoDias, dataFech);
    delete cg._cicloConfig;
    delete cg._cicloWindow;
    out.push(cg);
  }
  out.sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")) || String(a.id).localeCompare(String(b.id)));
  return out;
}

// Rev. 2214 — Helper compartilhado: materializa recorrências ativas em
// `financial_entries` até um horizonte (em meses a partir de hoje).
// Idempotente: pula meses já materializados (checagem por
// origem_id + YYYY-MM). Usado tanto pela mutation `generateRecurringEntries`
// (botão "Gerar Pendentes") quanto pela auto-geração lazy no
// `getContasAPagarByYear` (pra recorrência futura aparecer sem clique).
async function materializeRecorrentes(
  db: any,
  companyId: number,
  horizonteMeses: number,
): Promise<number> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const horizonte = new Date(today.getFullYear(), today.getMonth() + horizonteMeses + 1, 0);

  const recRes = await dbExecute(db,
    `SELECT * FROM financial_recurring_entries WHERE company_id=$1 AND ativo=1`,
    [companyId]
  );
  const recs = rows(recRes);
  let count = 0;

  for (const rec of recs) {
    // Começa do proximo_vencimento OU calcula a partir de hoje usando dia_vencimento
    let venc: Date;
    if (rec.proximo_vencimento) {
      venc = new Date(rec.proximo_vencimento);
    } else {
      const dia = Math.min(Number(rec.dia_vencimento) || 5, 28);
      venc = new Date(today.getFullYear(), today.getMonth(), dia);
      if (venc < today) venc = new Date(today.getFullYear(), today.getMonth() + 1, dia);
    }

    // Para semanal/quinzenal a chave de dedupe é a DATA exata (múltiplos
    // lançamentos no mesmo mês). Para mensal/trimestral/anual, o YYYY-MM
    // já é único por natureza e é o que existia historicamente.
    const dedupePorData = rec.frequencia === "semanal" || rec.frequencia === "quinzenal";

    // Loop materializando até passar do horizonte
    let lastMaterialized: Date | null = null;
    let iter = 0;
    while (venc <= horizonte && iter < 200) {
      iter++;
      const vencStr = venc.toISOString().split("T")[0];
      // Rev. 2945 — ATÔMICO: INSERT ... SELECT ... WHERE NOT EXISTS num único
      // statement (antes era SELECT-then-INSERT em 2 idas-e-voltas, que sob
      // chamadas CONCORRENTES de getContasAPagarByYear — agora também disparado
      // pelo Fluxo de Caixa — passava pela checagem em ambas e inseria 2x,
      // gerando as duplicatas de "recorrente"). Sem DDL. NB: dbExecute liga
      // parâmetros por ORDEM DE APARIÇÃO ($N é ignorado) → numerar sequencial.
      const dedupeCond = dedupePorData
        ? `data_vencimento=$18`
        : `TO_CHAR(data_vencimento,'YYYY-MM')=$18`;
      const dedupeParam = dedupePorData ? vencStr : vencStr.slice(0, 7);
      const ins = await dbExecute(db,
        `INSERT INTO financial_entries
          (company_id, obra_id, obra_nome, conta_id, conta_nome, tipo, natureza,
           valor_previsto, data_competencia, data_vencimento, status,
           origem_modulo, origem_id, origem_descricao, descricao, fornecedor_nome)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'recorrente',$12,$13,$14,$15
         WHERE NOT EXISTS (
           SELECT 1 FROM financial_entries
           WHERE company_id=$16 AND origem_modulo='recorrente' AND origem_id=$17 AND ${dedupeCond}
         )
         RETURNING id`,
        [companyId, rec.obra_id, rec.obra_nome, rec.conta_id, rec.conta_nome,
         rec.tipo, rec.natureza ?? "fixo", rec.valor, vencStr, vencStr,
         rec.tipo === "receita" ? "a_receber" : "a_pagar",
         rec.id, `Recorrência: ${rec.descricao}`, rec.descricao,
         rec.fornecedor_nome ?? null,
         companyId, rec.id, dedupeParam]
      );
      if (rows(ins).length > 0) count++;
      lastMaterialized = venc;
      const nextVenc = new Date(venc);
      if (rec.frequencia === "mensal") nextVenc.setMonth(nextVenc.getMonth() + 1);
      else if (rec.frequencia === "quinzenal") nextVenc.setDate(nextVenc.getDate() + 15);
      else if (rec.frequencia === "semanal") nextVenc.setDate(nextVenc.getDate() + 7);
      else if (rec.frequencia === "trimestral") nextVenc.setMonth(nextVenc.getMonth() + 3);
      else if (rec.frequencia === "anual") nextVenc.setFullYear(nextVenc.getFullYear() + 1);
      else break; // frequência desconhecida — não loopar infinito
      venc = nextVenc;
    }

    // SAFETY: só atualiza `proximo_vencimento` se efetivamente entramos no
    // loop (lastMaterialized != null). Se a recorrência já estava com
    // `proximo_vencimento` ALÉM do horizonte (caso comum quando rec foi
    // criada recentemente apontando pro futuro), NÃO mexemos no agendamento
    // — evitando que múltiplas chamadas "empurrem" a data pra frente e
    // pulem competências.
    if (lastMaterialized) {
      const nextAfter = new Date(lastMaterialized);
      if (rec.frequencia === "mensal") nextAfter.setMonth(nextAfter.getMonth() + 1);
      else if (rec.frequencia === "quinzenal") nextAfter.setDate(nextAfter.getDate() + 15);
      else if (rec.frequencia === "semanal") nextAfter.setDate(nextAfter.getDate() + 7);
      else if (rec.frequencia === "trimestral") nextAfter.setMonth(nextAfter.getMonth() + 3);
      else if (rec.frequencia === "anual") nextAfter.setFullYear(nextAfter.getFullYear() + 1);
      else continue;
      await dbExecute(db,
        `UPDATE financial_recurring_entries SET proximo_vencimento=$1, ultimo_gerado=$2, updated_at=NOW() WHERE id=$3`,
        [nextAfter.toISOString().split("T")[0], todayStr, rec.id]
      );
    }
  }
  return count;
}

// ─────────────────── PARSE DE EXTRATO (OFX/CSV/PDF) ───────────────────
// Helper de módulo (puro: não toca DB) reusado pelo importBankStatement legado
// e pelo fluxo em 2 fases (analyzeBankStatement + insertBankStatementBatch) que
// dá progresso real (0–100%) no cliente.
type ExtratoLine = { data: string; descricao: string; valor: number; saldo: number | null };

async function parseExtratoLines(input: {
  formato: "ofx" | "csv" | "pdf";
  conteudo: string;
  csvSeparador?: string;
  csvColunaData?: number;
  csvColunaDescricao?: number;
  csvColunaValor?: number;
  csvColunaSaldo?: number;
  companyId?: number; // usado p/ carregar templates de extrato da empresa
}): Promise<{ lines: ExtratoLine[]; rendimentoAplicacao: RendimentoAplicacao | null; templateDetectado: boolean | null }> {
  let lines: ExtratoLine[] = [];
  let rendimentoAplicacao: RendimentoAplicacao | null = null;
  // null = N/A (OFX/CSV ou parser determinístico, sem gate de template)
  // true = template encontrado (ou parser determinístico reconheceu o banco)
  // false = empresa tem templates mas nenhum bateu → bloquear import
  let templateDetectado: boolean | null = null;

  if (input.formato === "pdf") {
    // 1) Caminho determinístico: layout em colunas da CAIXA (rápido, sem IA).
    let caixaErr: any = null;
    try {
      lines = await parseCaixaExtratoPdf(input.conteudo);
    } catch (err: any) {
      caixaErr = err;
      // "não é um PDF válido" é fatal — não adianta tentar a IA.
      if (/não é um PDF válido/i.test(err?.message || "")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
      }
    }
    // 2) Caminho determinístico do BANCO DO BRASIL: o "Extrato de conta corrente" do BB
    //    é PDF de TEXTO selecionável (uma linha por lançamento) — parser próprio, SEM IA
    //    (não consome cota do Gemini). Também detecta "conta não movimentada".
    if (lines.length === 0) {
      try {
        const bb = await parseBancoBrasilExtratoPdf(input.conteudo);
        if (bb.isBancoBrasil && bb.lines.length === 0 && bb.semMovimento) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Este extrato do Banco do Brasil não tem lançamentos no período: a conta não foi movimentada. Confira o período/conta selecionados e tente outro extrato.",
          });
        }
        // SÓ confiar no parser determinístico do BB quando o PDF É MESMO do BB.
        // Para outros bancos (texto selecionável), as linhas extraídas pela heurística
        // genérica não são confiáveis — deixa vazio p/ cair no fallback de IA (etapa 3).
        if (bb.isBancoBrasil) lines = bb.lines;
      } catch (bbErr: any) {
        if (bbErr instanceof TRPCError) throw bbErr;
        if (/não é um PDF válido/i.test(bbErr?.message || "")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: bbErr.message });
        }
        // qualquer outra falha do parser BB: segue pro fallback de IA.
      }
    }
    // 2.5) SANTANDER: "Extrato Consolidado Inteligente" PJ — PDF de TEXTO selecionável,
    //    mas grande (10+ páginas / centenas de lançamentos). Pelo fallback de IA o JSON
    //    estourava o `maxTokens` e vinha truncado ("Não consegui interpretar o JSON da
    //    IA"). Parser determinístico próprio (SEM IA, sem limite de tamanho).
    if (lines.length === 0) {
      try {
        const st = await parseSantanderExtratoPdf(input.conteudo);
        // SÓ confiar no parser quando o PDF É MESMO do Santander (per-bank gate).
        if (st.isSantander) {
          lines = st.lines;
          // Rev. 3363 — rendimento de aplicação/resgate automático (CDB ContaMax), se houver.
          rendimentoAplicacao = st.rendimentoAplicacao ?? null;
        }
      } catch (stErr: any) {
        if (/não é um PDF válido/i.test(stErr?.message || "")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: stErr.message });
        }
        // qualquer outra falha do parser Santander: segue pro fallback de IA.
      }
    }
    // 2.7) SANTANDER IBPJ: "Internet Banking Empresarial" (IBPJ) — formato diferente
    //    do Extrato Consolidado (data completa DD/MM/AAAA por linha, "- R$" = débito).
    //    Deve rodar DEPOIS do Consolidado para não capturar PDFs do Consolidado que
    //    por acaso tenham "IBPJ" no nome do arquivo, pois o Consolidado tem gating
    //    próprio via "EXTRATO CONSOLIDADO INTELIGENTE".
    if (lines.length === 0) {
      try {
        const ibpj = await parseSantanderIbpjPdf(input.conteudo);
        if (ibpj.isIbpj) {
          lines = ibpj.lines.map(l => ({
            data:      l.data,
            descricao: l.descricao,
            valor:     l.valor,
            saldo:     l.saldo,
          }));
        }
      } catch (ibpjErr: any) {
        if (/não é um PDF válido/i.test(ibpjErr?.message || "")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: ibpjErr.message });
        }
        // qualquer outra falha: segue pro fallback de IA.
      }
    }
    // 3) FALLBACK IA: qualquer outro banco (Itaú, Bradesco...) tem layout
    //    diferente e os parsers determinísticos devolvem 0 linhas. Aí lemos via IA.
    //    Rev. 3877: carrega template cadastrado em Configurações p/ enriquecer o prompt.
    if (lines.length === 0) {
      // Extrai texto do PDF para detecção de template (sem re-parse pesado).
      let extraInstructions: string | undefined;
      if (input.companyId) {
        try {
          // Usamos o conteúdo base64 como chave: extrai texto via pdf-parse para detectar template.
          const pdfParse: any = (await import("pdf-parse/lib/pdf-parse.js")).default;
          const buf = Buffer.from(
            input.conteudo.replace(/^data:[^,]*,/, "").trim(),
            "base64"
          );
          const pdfData = await pdfParse(buf);
          const pdfText = pdfData?.text || "";
          const template = await detectarTemplateExtrato(input.companyId, pdfText);
          if (template?.instrucoesIa) {
            extraInstructions = `\n\n### Instruções específicas para este banco (${template.bancoNome}):\n${template.instrucoesIa}`;
          }
          // Rev. 3886 — gate de template: se empresa tem templates mas nenhum bateu → false.
          if (template) {
            templateDetectado = true;
          } else {
            // Verifica se a empresa tem algum template ativo cadastrado.
            try {
              const db2 = await getDb();
              const cr = await db2.execute(sql`
                SELECT COUNT(*) as cnt FROM bank_statement_templates
                WHERE company_id = ${input.companyId} AND ativo = 1
              `);
              const nTemplates = parseInt((cr.rows?.[0] as any)?.cnt ?? "0", 10);
              templateDetectado = nTemplates > 0 ? false : null;
            } catch { /* falha silenciosa, não gateia */ }
          }
        } catch {
          // falha silenciosa — fallback sem template
        }
      }
      try {
        lines = await parseExtratoComIA(input.conteudo, "application/pdf", extraInstructions);
      } catch (iaErr: any) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Não foi possível extrair transações do PDF. Tente novamente em instantes; se persistir, envie o extrato em OFX/CSV (extratos digitalizados/foto têm leitura limitada). Detalhe: " +
            (iaErr?.message || caixaErr?.message || "falha na leitura"),
        });
      }
      if (lines.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não foi possível extrair transações do PDF. Confira se o arquivo é um extrato bancário (e não comprovante/fatura) ou envie em OFX/CSV.",
        });
      }
    }
  } else if (input.formato === "ofx") {
    const content = input.conteudo;
    const stmtTrnMatch = content.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi);
    if (!stmtTrnMatch || stmtTrnMatch.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma transação encontrada no arquivo OFX" });
    }
    for (const trn of stmtTrnMatch) {
      const dtposted = trn.match(/<DTPOSTED>(\d{8})/)?.[1] ?? "";
      const trnamt = trn.match(/<TRNAMT>([-\d.,]+)/)?.[1] ?? "0";
      const memo = trn.match(/<MEMO>([^<\n]+)/)?.[1]?.trim() ?? "";
      const name = trn.match(/<NAME>([^<\n]+)/)?.[1]?.trim() ?? "";
      // Rev. 4133 — extratos OFX mais novos trazem o Nº do cheque no campo estruturado
      // CHECKNUM (coluna "Docto." da tela do banco), separado da descrição/MEMO. Quando
      // presente e ≠ "00000000"/zero, prioriza sobre qualquer extração por regex do texto:
      // anexa " Nº <num>" na descrição, formato que extrairNumCheque já reconhece.
      const checknumRaw = trn.match(/<CHECKNUM>(\d+)/)?.[1] ?? "";
      const checknum = checknumRaw.replace(/^0+/, "");
      let descricaoFinal = memo || name || "Sem descrição";
      if (checknum && /cheq/i.test(descricaoFinal) && !new RegExp(`\\b${checknum}\\b`).test(descricaoFinal)) {
        descricaoFinal = `${descricaoFinal} Nº ${checknum}`;
      }
      if (!dtposted) continue;
      const y = dtposted.slice(0, 4);
      const m = dtposted.slice(4, 6);
      const d = dtposted.slice(6, 8);
      const dataStr = `${y}-${m}-${d}`;
      // OFX BR: "1.234,56" (ponto=milhar, vírgula=decimal) → normaliza p/ float
      let rawAmt = trnamt.trim();
      if (rawAmt.includes(",") && rawAmt.includes(".")) rawAmt = rawAmt.replace(/\./g, "").replace(",", ".");
      else if (rawAmt.includes(",")) rawAmt = rawAmt.replace(",", ".");
      const valor = parseFloat(rawAmt);
      lines.push({
        data: dataStr,
        descricao: descricaoFinal,
        valor: isNaN(valor) ? 0 : valor,
        saldo: null,
      });
    }
    const balMatch = content.match(/<BALAMT>([-\d.,]+)/);
    if (balMatch && lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      lastLine.saldo = parseFloat(balMatch[1].replace(",", "."));
    }
  } else {
    const sep = input.csvSeparador ?? ";";
    const colData = input.csvColunaData ?? 0;
    const colDesc = input.csvColunaDescricao ?? 1;
    const colValor = input.csvColunaValor ?? 2;
    const colSaldo = input.csvColunaSaldo ?? -1;
    const rawLines = input.conteudo.split(/\r?\n/).filter(l => l.trim().length > 0);
    for (let i = 1; i < rawLines.length; i++) {
      const cols = rawLines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 3) continue;
      const rawData = cols[colData] ?? "";
      let dataStr = rawData;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawData)) {
        const [dd, mm, yyyy] = rawData.split("/");
        dataStr = `${yyyy}-${mm}-${dd}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) continue;
      const rawValor = (cols[colValor] ?? "0").replace(/\./g, "").replace(",", ".");
      const valor = parseFloat(rawValor);
      const saldoRaw = colSaldo >= 0 ? (cols[colSaldo] ?? "") : "";
      const saldo = saldoRaw ? parseFloat(saldoRaw.replace(/\./g, "").replace(",", ".")) : null;
      lines.push({
        data: dataStr,
        descricao: cols[colDesc] ?? "Sem descrição",
        valor: isNaN(valor) ? 0 : valor,
        saldo: saldo !== null && isNaN(saldo) ? null : saldo,
      });
    }
  }

  if (lines.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma linha válida encontrada no arquivo" });
  }
  return { lines, rendimentoAplicacao, templateDetectado };
}

// ─────────────────── Rev. 3193 — LEITURA DE COMPROVANTE (IA de visão) ───────────────────
// O extrato de PIX/boleto é ANÔNIMO (não diz quem recebeu). O comprovante traz o
// identificador que falta — beneficiário, CNPJ/CPF, ID da transação (e2e do PIX /
// nosso número do boleto). Lemos isso com o Gemini Vision e usamos SÓ como DESEMPATE
// no match extrato×ERP (nunca concilia pelo nome sozinho — exige valor batendo).
type ComprovanteExtraido = {
  beneficiario: string | null;
  documento: string | null; // só dígitos (CNPJ/CPF)
  txid: string | null;      // e2e PIX / nosso número / autenticação
  valor: number | null;
  data: string | null;      // YYYY-MM-DD
  tipoDoc: string | null;   // pix | boleto | ted | outro
};

// Normaliza texto p/ comparação tolerante (sem acento, sem ruído, minúsculo).
function _normTxt(s: any): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function _soDigitos(s: any): string { return String(s ?? "").replace(/[^0-9]/g, ""); }

// Parser BR-aware de número monetário vindo da IA ("2.500,00", "2500.00", "R$ 2.500,00").
function _parseValorBR(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isNaN(v) ? null : Math.abs(v);
  let s = String(v).replace(/[^0-9.,-]/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) {
    // vírgula = decimal BR → remove pontos de milhar, troca vírgula por ponto
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.abs(n);
}

// Normaliza/sanitiza os campos de identificação de um comprovante — vindos da IA OU do
// cliente (write path). Whitelist de chaves + clip de tamanho + data/valor BR-aware. Usado
// tanto por `_lerComprovanteIA` quanto por `anexarComprovanteEntry` (não confiar no cliente).
function _sanitizeComprovante(obj: any): ComprovanteExtraido {
  const clip = (v: any, n: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, n) : null; };
  const doc = _soDigitos(obj?.documento);
  const tipo = _normTxt(obj?.tipoDoc);
  const tipoDoc = ["pix", "boleto", "ted", "outro"].includes(tipo) ? tipo : (tipo ? "outro" : null);
  let data: string | null = null;
  const dRaw = String(obj?.data ?? "").trim();
  const dm = dRaw.match(/(\d{4})-(\d{2})-(\d{2})/) || dRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dm) data = dm[0].includes("/") ? `${dm[3]}-${dm[2]}-${dm[1]}` : `${dm[1]}-${dm[2]}-${dm[3]}`;
  return {
    beneficiario: clip(obj?.beneficiario, 255),
    documento: doc ? doc.slice(0, 20) : null,
    txid: clip(obj?.txid, 140),
    valor: _parseValorBR(obj?.valor),
    data,
    tipoDoc,
  };
}

// MIME suportado pelo Gemini Vision (PDF + imagens estáticas). Word não é OCR-ável aqui.
const _VISION_MIME = new Set([
  "application/pdf", "image/jpeg", "image/jpg", "image/png",
  "image/gif", "image/webp", "image/heic", "image/heif",
]);

// Roda o Gemini Vision sobre o comprovante e devolve os campos sanitizados.
// Gateado pelo chamador via assertAiModuleEnabled(companyId,"financeiro").
async function _lerComprovanteIA(base64: string, mimeType: string): Promise<ComprovanteExtraido> {
  const mt = (mimeType || "").toLowerCase().split(";")[0].trim();
  if (!_VISION_MIME.has(mt)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo não suportado para leitura por IA. Use PDF, JPG, PNG ou WEBP." });
  }
  const prompt = [
    "Você é um leitor de COMPROVANTES bancários brasileiros (PIX, boleto, TED, transferência).",
    "Extraia APENAS o que estiver explícito no documento. NÃO invente dados.",
    "Campos:",
    "- beneficiario: nome de quem RECEBEU o dinheiro (favorecido/recebedor). Se for boleto, o BENEFICIÁRIO/cedente. Ignore o pagador.",
    "- documento: CNPJ ou CPF do beneficiário (apenas dígitos, sem pontuação). Se não houver, null.",
    "- txid: identificador da transação — ID/E2E do PIX, 'nosso número' do boleto, ou código de autenticação. Se não houver, null.",
    "- valor: valor pago (número). Use ponto como separador decimal.",
    "- data: data do pagamento no formato YYYY-MM-DD. Se não houver, null.",
    "- tipoDoc: um de pix, boleto, ted, outro.",
    "Responda SOMENTE o JSON.",
  ].join("\n");
  const responseSchema = {
    type: "object",
    properties: {
      beneficiario: { type: "string", nullable: true },
      documento: { type: "string", nullable: true },
      txid: { type: "string", nullable: true },
      valor: { type: "number", nullable: true },
      data: { type: "string", nullable: true },
      tipoDoc: { type: "string", nullable: true },
    },
  };
  let raw = "";
  try {
    raw = await invokeGeminiVision({ prompt, base64, mimeType: mt, responseSchema, maxTokens: 1024, thinking: "off" });
  } catch (err: any) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao ler o comprovante por IA: " + String(err?.message ?? "").slice(0, 160) });
  }
  // Salvagem robusta: o modelo às vezes embrulha em ```json ... ``` ou texto.
  let obj: any = {};
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch { obj = {}; } }
  }
  // Sanitização (whitelist de chaves + normalização defensiva da saída da IA).
  return _sanitizeComprovante(obj);
}

// Rev. 3220 — Lê um DEMONSTRATIVO CONSOLIDADO (1 PDF com VÁRIOS PIX ou VÁRIOS boletos
// pagos do mês) e devolve a LISTA de TODOS os pagamentos extraídos (não 1 só, como o
// _lerComprovanteIA). Cada item é sanitizado pela MESMA whitelist defensiva. Gateado pelo
// chamador via assertAiModuleEnabled(companyId,"financeiro").
async function _lerDemonstrativoIA(base64: string, mimeType: string): Promise<ComprovanteExtraido[]> {
  const mt = (mimeType || "").toLowerCase().split(";")[0].trim();
  if (!_VISION_MIME.has(mt)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo não suportado para leitura por IA. Use PDF, JPG, PNG ou WEBP." });
  }
  const prompt = [
    "Você é um leitor de DEMONSTRATIVOS CONSOLIDADOS de pagamento bancário brasileiros.",
    "O documento contém VÁRIOS pagamentos (vários PIX OU vários boletos pagos no mês).",
    "Extraia TODOS os pagamentos listados — um item por pagamento. NÃO invente dados; use null quando não souber.",
    "Para CADA pagamento:",
    "- beneficiario: nome de quem RECEBEU o dinheiro (favorecido/recebedor). Em boleto, o BENEFICIÁRIO/cedente. Ignore o pagador.",
    "- documento: CNPJ ou CPF do beneficiário (apenas dígitos, sem pontuação). Se não houver, null.",
    "- txid: identificador da transação — ID/E2E do PIX, 'nosso número' do boleto, ou código de autenticação. Se não houver, null.",
    "- valor: valor pago (número). Use ponto como separador decimal, SEM separador de milhar.",
    "- data: data do pagamento no formato YYYY-MM-DD. Se não houver, null.",
    "- tipoDoc: um de pix, boleto, ted, outro.",
    "Responda SOMENTE o JSON no formato {\"itens\":[ ... ]}.",
  ].join("\n");
  const responseSchema = {
    type: "object",
    properties: {
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            beneficiario: { type: "string", nullable: true },
            documento: { type: "string", nullable: true },
            txid: { type: "string", nullable: true },
            valor: { type: "number", nullable: true },
            data: { type: "string", nullable: true },
            tipoDoc: { type: "string", nullable: true },
          },
        },
      },
    },
  };
  let raw = "";
  try {
    raw = await invokeGeminiVision({ prompt, base64, mimeType: mt, responseSchema, maxTokens: 16384, thinking: "off" });
  } catch (err: any) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao ler o demonstrativo por IA: " + String(err?.message ?? "").slice(0, 160) });
  }
  // Salvagem robusta: o modelo às vezes embrulha em ```json ... ``` ou texto.
  let obj: any = {};
  try {
    obj = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch { obj = {}; } }
  }
  const arr = Array.isArray(obj?.itens) ? obj.itens : (Array.isArray(obj) ? obj : []);
  // Sanitiza cada item + descarta linhas totalmente vazias (sem nome, valor e doc).
  return arr
    .map((it: any) => _sanitizeComprovante(it))
    .filter((it: ComprovanteExtraido) => it.beneficiario || it.valor != null || it.documento || it.txid);
}

// Rev. 3236 — Demonstrativos passam a aceitar VÁRIOS PDFs por tipo (PIX/boleto). A lista
// de arquivos vive em `pix_arquivos_json` / `boleto_arquivos_json` (TEXT = JSON [{url,nome}]).
// Este helper carrega essa lista JÁ NORMALIZADA, com FALLBACK pro modelo antigo de 1 PDF
// (pix_url/pix_nome) — assim demonstrativos anexados antes da Rev. 3236 continuam visíveis
// e legíveis (índice 0). Tipo via enum (whitelist de identificador, sem interpolação livre).
async function _carregarDemoArquivos(
  db: any, companyId: number, contaBancariaId: number, ano: number, mes: number, tipo: "pix" | "boleto"
): Promise<{ url: string; nome: string | null }[]> {
  const colArr = tipo === "pix" ? "pix_arquivos_json" : "boleto_arquivos_json";
  const colUrl = tipo === "pix" ? "pix_url" : "boleto_url";
  const colNome = tipo === "pix" ? "pix_nome" : "boleto_nome";
  const res = await dbExecute(db,
    `SELECT ${colArr} AS arr, ${colUrl} AS url, ${colNome} AS nome
       FROM financial_conciliacao_demonstrativos
      WHERE company_id=$1 AND conta_bancaria_id=$2 AND ano=$3 AND mes=$4`,
    [companyId, contaBancariaId, ano, mes]);
  const r = (rows(res)[0] as any) ?? {};
  let arr: any[] = [];
  if (r.arr) { try { const p = JSON.parse(r.arr); if (Array.isArray(p)) arr = p; } catch { arr = []; } }
  arr = arr
    .filter((x: any) => x && x.url)
    .map((x: any) => ({ url: String(x.url), nome: x.nome != null ? String(x.nome) : null }));
  if (arr.length === 0 && r.url) arr = [{ url: String(r.url), nome: r.nome != null ? String(r.nome) : null }];
  return arr;
}

// Recupera os BYTES de um comprovante JÁ ANEXADO (p/ reler por IA). SÓ resolve anexos
// INTERNOS via /uploads/<key> → uploaded_files. NUNCA faz fetch de URL arbitrária: o
// `comprovante_url` é gravado pelo cliente, então um fetch genérico abriria SSRF (alcance a
// serviços internos / metadata). URL não-interna → retorna null (não lança).
async function _baixarComprovante(url: string): Promise<{ base64: string; contentType: string } | null> {
  if (!url) return null;
  const m = url.match(/\/uploads\/(.+)$/);
  if (!m) return null;
  try {
    const key = decodeURIComponent(m[1]);
    const got = await dbRetrieve(key);
    if (got) return { base64: got.buffer.toString("base64"), contentType: got.contentType };
  } catch { /* anexo indisponível */ }
  return null;
}

// Rev. 3319 — Motor de conciliação extraído de getConciliacaoReport p/ reuso no panorama
// geral do mês (getConciliacaoReportGeral roda este motor por conta). READ-ONLY.
// Rev. 3349 — HEURÍSTICA ÚNICA de "MOVIMENTAÇÃO INTERNA" (transferência entre contas
// próprias da FC, varredura automática de aplicação/resgate e PIX/TED intra-FC). Fonte
// ÚNICA: a mesma lista de padrões gera o predicado SQL (`descricao ~* '<src>'`) e o helper
// JS (`_isLancInterno`), p/ o Dashboard de Conciliação e o Panorama Geral NÃO divergirem.
// READ-ONLY · só CLASSIFICA p/ separar "caixa real (externo)" da movimentação interna —
// não concilia/baixa/oculta nada. O usuário confere a lista completa pelo drill-in.
const _INTERNO_PATTERNS = [
  // Rev. 3368 — REMOVIDO "credito transf internet": é um rótulo GENÉRICO do banco (Caixa)
  // que também aparece em TED de CLIENTE (ex.: recebimento da Arquidiocese de Aparecida,
  // R$ 53.344,75) → vazava receita real p/ dentro de "movimentação interna". As transferências
  // internas LEGÍTIMAS já carregam o nome/CNPJ do grupo ("fc engenharia" abaixo OU CNPJ
  // cadastrado), então continuam sendo classificadas como internas por esses casadores — sem
  // depender deste rótulo genérico. (Caso precise reclassificar 1 linha pontual, use a exceção
  // por lançamento em financial_internal_overrides.)
  // Rev. 3592 — "cdb" e "rdb" agora usam \y (word-boundary PostgreSQL) para não casar
  // strings hexadecimais em IDs de transação PIX (ex: "...96cdbb15bad..." contém "cdb"
  // mas não é CDB financeiro). Auditoria detectou 2 falsos positivos (Kelbem / Kellen).
  "transfer.*entre contas", "transf interna", "transferencia interna",
  "aplica", "resgate", "contamax", "\\yrdb\\y", "\\ycdb\\y",
  "fundo de invest", "fc engenharia",
  // Rev. 3848 — CHEQUE DEVOLVIDO: par crédito+débito é estorno puro (net=0), não receita/despesa real.
  // "cheque devol" captura "CHEQUE DEVOLVIDO MOT 11", "CHEQUE DEVOLUCAO", etc. de qualquer banco.
  // "dev.*cheq" captura variantes invertidas (ex.: "DEVOLUCAO CHEQUE"). Ambas as pernas do par
  // ficam em "movimentação interna" e saem do caixa real, idêntico ao tratamento de aplica/resgate.
  "cheque devol", "dev.*cheq",
  // Rev. 3941 — sync com pareceDevolucaoCheque: bancos que descrevem como "ESTORNO CHEQUE" ou
  // "CHEQUE ESTORNADO" / "CHEQUE SUSTADO" não eram capturados → crédito aparecia como receita
  // real no engine de sugestões. Alinhado com a regex de pareceDevolucaoCheque (shared/).
  "estorn.*cheq", "cheq.*estorn",
  "cheq.*sust", "sust.*cheq",
];
const _INTERNO_REGEX_SRC = _INTERNO_PATTERNS.join("|");
const _internoRegex = new RegExp(_INTERNO_REGEX_SRC, "i");
function _isLancInterno(descricao: any): boolean {
  return _internoRegex.test(String(descricao || ""));
}

// Rev. 3366 — Token DISTINTIVO do nome de uma empresa do grupo (financial_internal_cnpjs.nome),
// usado p/ classificar como MOVIMENTAÇÃO INTERNA as linhas em que o banco traz só o NOME (sem o
// CNPJ) — ex.: "PIX ENVIADO LOCNOW LOCACOES" (o "pix recebido" da mesma empresa casa pelo CNPJ,
// mas o "pix enviado" às vezes vem sem dígitos → vazava p/ "caixa real"). Pega o 1º token "forte"
// (≥5 alfanuméricos, sem acento, FORA da stop-list de termos genéricos de razão social), evitando
// casar um fornecedor qualquer. Empresas com nome só genérico (ex.: "FC Engenharia (própria)" —
// já coberta pelo regex + CNPJ) devolvem null.
const _NAME_STOP_TOKENS = new Set([
  "ltda", "eireli", "epp", "comercio", "comercial", "servicos", "servico", "locacoes",
  "locacao", "construcao", "construtora", "engenharia", "maquinas", "veiculos", "equipamentos",
  "transportes", "transporte", "materiais", "material", "industria", "industrias",
  "empreendimentos", "participacoes", "propria", "proprio", "grupo", "companhia",
  "representacoes", "distribuidora", "comercializacao", "sociedade", "limitada", "filial",
  "matriz", "brasil",
]);
function _nameTokenForte(nome: any): string | null {
  const toks = String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
  for (const t of toks) {
    if (/^[a-z0-9]{5,}$/.test(t) && !_NAME_STOP_TOKENS.has(t)) return t;
  }
  return null;
}

// Rev. 3351 — Config de MOVIMENTAÇÃO INTERNA por empresa: a base de CNPJs/CPFs cadastrada
// (financial_internal_cnpjs, ativos) + as exceções por lançamento (financial_internal_overrides).
// Tudo num único load por request p/ o SQL agregado e o JS NÃO divergirem. Tolerante a tabela
// ausente (ambiente antes do self-heal) → devolve config vazia.
async function _loadInternoConfig(db: any, companyId: number): Promise<{ cnpjDigits: string[]; nameTokens: string[]; overrides: Map<number, string> }> {
  const cnpjDigits: string[] = [];
  const nameTokens: string[] = [];
  const overrides = new Map<number, string>();
  try {
    const r = await dbExecute(db, `SELECT cnpj, nome FROM financial_internal_cnpjs WHERE company_id=$1 AND COALESCE(ativo,1)=1`, [companyId]);
    for (const x of rows(r)) {
      const d = _soDigitos(x.cnpj);
      if (d.length >= 6) cnpjDigits.push(d); // guarda mínimo p/ não casar lixo
      // Rev. 3366 — token "forte" do nome p/ casar quando o banco não traz o CNPJ na linha.
      const tk = _nameTokenForte(x.nome);
      if (tk) nameTokens.push(tk);
    }
  } catch (e: any) { console.warn(`[internoConfig] skip cnpjs:`, e?.message); }
  try {
    const r = await dbExecute(db, `SELECT line_id AS "lineId", natureza FROM financial_internal_overrides WHERE company_id=$1 AND natureza IN ('efetivo','interno')`, [companyId]);
    for (const x of rows(r)) overrides.set(Number(x.lineId), String(x.natureza));
  } catch (e: any) { console.warn(`[internoConfig] skip overrides:`, e?.message); }
  return { cnpjDigits, nameTokens: Array.from(new Set(nameTokens)), overrides };
}

// Rev. 3351 — Predicado SQL "é movimentação interna" (regex base OR dígitos da descrição
// CONTÊM algum CNPJ/CPF cadastrado). `cnpjDigits` é SANITIZADO (só dígitos) antes de chegar
// aqui → inlining seguro. NÃO inclui a exceção por lançamento (essa entra via LEFT JOIN no
// CASE de quem usa, pois depende do id da linha).
// Rev. 3366 — expressão SQL que tira acentos + lowercase de `col`, p/ espelhar EXATAMENTE a
// normalização do JS (`desc.normalize("NFD").replace(diacríticos).toLowerCase()`) no match por NOME
// do grupo. Não usa a extensão `unaccent` (criá-la exigiria ALTER/CREATE EXTENSION — proibido);
// `translate` cobre os diacríticos do português. Os `nameTokens` são puro ASCII minúsculo.
function _sqlUnaccentLower(col: string): string {
  return `lower(translate(${col}, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))`;
}
function _internoSqlPredicate(cnpjDigits: string[], col = "descricao", nameTokens: string[] = []): string {
  const parts: string[] = [`${col} ~* '${_INTERNO_REGEX_SRC}'`];
  // Rev. 3366 — nomes "fortes" das empresas do grupo (casa quando a linha NÃO traz o CNPJ).
  // `nameTokens` já vem sanitizado (alfanum ≥5); re-filtra por segurança antes do inlining.
  // Normaliza acentos+caixa no SQL (`_sqlUnaccentLower`) p/ ESPELHAR o caminho JS (paridade).
  const safeTok = nameTokens.filter((t) => /^[a-z0-9]{5,}$/.test(t));
  if (safeTok.length) parts.push(`${_sqlUnaccentLower(col)} ~ '${safeTok.join("|")}'`);
  const safe = cnpjDigits.filter((d) => /^[0-9]{6,20}$/.test(d));
  if (safe.length) parts.push(...safe.map((d) => `regexp_replace(${col},'[^0-9]','','g') LIKE '%${d}%'`));
  return `(${parts.join(" OR ")})`;
}

// Rev. 3351/3366 — Classificação "é interno" de UMA linha já carregada, respeitando a exceção:
// override 'efetivo' → NÃO interno · 'interno' → interno · senão regex base + NOME forte do grupo
// (Rev. 3366) + CNPJ cadastrado.
function _isLancInternoRow(row: any, cfg: { cnpjDigits: string[]; nameTokens?: string[]; overrides: Map<number, string> }): boolean {
  const id = Number(row?.id);
  if (Number.isFinite(id)) {
    const ov = cfg.overrides.get(id);
    if (ov === "efetivo") return false;
    if (ov === "interno") return true;
  }
  const desc = String(row?.descricao || "");
  if (_internoRegex.test(desc)) return true;
  // Rev. 3366 — nome "forte" da empresa do grupo (linha sem o CNPJ — ex.: "PIX ENVIADO LOCNOW").
  if (cfg.nameTokens && cfg.nameTokens.length) {
    const norm = desc.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (cfg.nameTokens.some((t) => t && norm.includes(t))) return true;
  }
  if (cfg.cnpjDigits.length) {
    const d = _soDigitos(desc);
    if (d && cfg.cnpjDigits.some((c) => d.includes(c))) return true;
  }
  return false;
}

async function _computeConciliacaoReport(db: any, companyId: number, contaBancariaId: number, dataInicio: string, dataFim: string) {
  const input = { companyId, contaBancariaId, dataInicio, dataFim };
    const p = [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim];

    // 1) Extrato conciliado + lançamento casado
    const concRes = await dbExecute(db,
      `SELECT b.id, b.data, b.descricao, b.valor, b.tipo, b.entry_id AS "entryId",
              e.descricao AS "entryDescricao", e.fornecedor_nome AS "entryFornecedor",
              e.obra_nome AS "entryObra",
              COALESCE(e.valor_realizado, e.valor_previsto) AS "entryValor",
              COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia) AS "entryData"
         FROM bank_statement_lines b
         LEFT JOIN financial_entries e ON e.id = b.entry_id AND e.company_id = b.company_id
        WHERE b.company_id=$1 AND b.conta_bancaria_id=$2 AND b.data>=$3 AND b.data<=$4
          AND COALESCE(b.conciliado,0)=1 AND b.excluido_em IS NULL
        ORDER BY b.data ASC, b.id ASC`, p);

    // 2) Extrato SEM lançamento (pendências)
    const pendRes = await dbExecute(db,
      `SELECT id, data, descricao, valor, tipo, saldo_apos AS "saldoApos",
              desconsiderado_em AS "desconsideradoEm"
         FROM bank_statement_lines
        WHERE company_id=$1 AND conta_bancaria_id=$2 AND data>=$3 AND data<=$4
          AND COALESCE(conciliado,0)=0 AND excluido_em IS NULL
        ORDER BY data ASC, id ASC`, p);

    // 2b) Rev. 3229 — CRUZAMENTO TOTAL COM O CONTROLE DE CHEQUES. Para cada linha do
    // extrato AINDA sem lançamento, tenta identificar de QUAL cheque ela é a compensação
    // (o cheque NÃO é lançamento; serve p/ dizer QUEM é o favorecido + obra/NF/vencimento).
    // Assim a tela aponta a ORIGEM da despesa e o "Lançar no ERP" já vem pré-preenchido
    // (fornecedor/obra/forma) p/ o cadastro correto. Estratégia de match, da mais forte
    // p/ a mais fraca: (1) nº do cheque extraído da descrição + VALOR; (2) fallback VALOR
    // + DATA de compensação == data do extrato, QUANDO ÚNICO (descrições da Caixa que não
    // trazem o número). Só leitura — não grava nada.
    const chqRes = await dbExecute(db,
      `SELECT numero_cheque AS "numeroCheque", valor, fornecedor_nome AS "fornecedorNome",
              fornecedor_id AS "fornecedorId", obra_id AS "obraId", obra_nome AS "obraNome",
              nf, data_vencimento AS "dataVencimento", data_compensacao AS "dataCompensacao",
              banco_nome AS "bancoNome", status
         FROM financial_cheques
        WHERE company_id=$1 AND excluido_em IS NULL`,
      [input.companyId]);
    const chequesRep = rows(chqRes) as any[];
    const chqCents = (v: any) => v != null ? Math.round(Math.abs(Number(v)) * 100) : null;
    const chqDia = (v: any) => v ? String(v).slice(0, 10) : null;
    const chqByNumVal = new Map<string, any>();
    const chqByNum = new Map<string, any[]>();
    const chqByValData = new Map<string, any[]>();
    for (const c of chequesRep) {
      const cts = chqCents(c.valor);
      if (cts == null) continue;
      const num = String(c.numeroCheque ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
      if (num) {
        chqByNumVal.set(`${num}|${cts}`, c);
        if (!chqByNum.has(num)) chqByNum.set(num, []);
        chqByNum.get(num)!.push(c);
      }
      const dc = chqDia(c.dataCompensacao);
      if (dc) { const k = `${cts}|${dc}`; if (!chqByValData.has(k)) chqByValData.set(k, []); chqByValData.get(k)!.push(c); }
    }
    // Rev. 4136 — usa parseChequeNumero (shared/chequeMotivos.ts) que entende tanto
    // "CHEQUE Nº 001392" quanto "CHEQUE EMITIDO/DEBITADO 001392" (formato Santander).
    const extrNumChq = (descricao: any): string | null => parseChequeNumero(descricao);
    // Rev. 3263 — A Caixa identifica o cheque na descrição como "Doc NNNNNN"
    // ("CHEQUE COMPENSADO · Doc 000990", "DEBITO CHEQUE PAG AGENCIA ... Doc 000981"),
    // sem a palavra "cheque nº". Esse extrator pega o número do "Doc" — mas SÓ é usado
    // quando a linha já pareceCheque (senão "Doc" de PIX/boleto casaria por engano).
    const extrDocNum = (descricao: any): string | null => {
      const m = String(descricao ?? "").match(/\bdoc(?:umento)?\.?\s*0*(\d{1,12})/i);
      if (m && m[1]) return m[1].replace(/^0+/, "") || m[1];
      return null;
    };
    // Rev. 3229 — só consideramos o fallback VALOR+DATA quando a descrição TEM indício de
    // cheque/compensação. Sem essa trava, qualquer linha (PIX/tarifa/transferência) com o
    // mesmo valor+data de UM cheque seria marcada como cheque e pré-preencheria fornecedor/
    // obra ERRADOS. O caminho nº+valor já é seguro (a regex exige a palavra "cheque").
    const pareceCheque = (descricao: any) => /cheq|compensa/i.test(String(descricao ?? ""));
    // Rev. 4140 — índice auxiliar: número → lista de cheques (todos, sem filtro de valor)
    // Usado no fallback 3 (número + data de compensação) e no fallback 4 (número único).
    // O chqByNum já existe — não recriamos; adicionamos só o índice por compensação.
    const chqByNumComp = new Map<string, any[]>();
    for (const c of chequesRep) {
      const num = String(c.numeroCheque ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
      if (!num) continue;
      const dc = chqDia(c.dataCompensacao);
      if (dc) {
        const k = `${num}|${dc}`;
        if (!chqByNumComp.has(k)) chqByNumComp.set(k, []);
        chqByNumComp.get(k)!.push(c);
      }
    }
    const matchChequeLinha = (l: any): any | null => {
      const cts = chqCents(l.valor);
      if (cts == null || cts === 0) return null;
      const ehCheque = pareceCheque(l.descricao);
      // 1) número do cheque ("cheque nº NNN") OU número do documento "Doc NNN" (Caixa) quando
      //    a linha parece cheque. Rev. 3263 — o banco às vezes arredonda 1 centavo na
      //    compensação (cheque R$ 2.410,12 → extrato R$ 2.410,13); então, achado o número,
      //    casa por VALOR EXATO e, se falhar, por número com tolerância de ≤2 centavos ÚNICO.
      const num = extrNumChq(l.descricao) ?? (ehCheque ? extrDocNum(l.descricao) : null);
      const dia = chqDia(l.data);
      if (num) {
        const exato = chqByNumVal.get(`${num}|${cts}`);
        if (exato) return exato;
        const arr = chqByNum.get(num);
        if (arr) {
          const perto = arr.filter((c) => { const v = chqCents(c.valor); return v != null && Math.abs(v - cts) <= 2; });
          if (perto.length === 1) return perto[0];
          // Rev. 4140 — Fallback 3: número + data_compensacao bate com data do extrato
          // (valor pode diferir — ex.: erro de digitação no talão). Sinaliza como "fraco"
          // para o front exibir aviso âmbar ("Possível cheque nº X · Fornecedor").
          if (dia) {
            const porNumComp = chqByNumComp.get(`${num}|${dia}`);
            if (porNumComp && porNumComp.length === 1) return { ...porNumComp[0], matchFraco: true };
          }
          // Rev. 4140 — Fallback 4: número existe UMA ÚNICA VEZ no BD (talão sem data
          // de compensação cadastrada). Só sinaliza quando há exatamente 1 cheque com esse nº.
          if (arr.length === 1) return { ...arr[0], matchFraco: true };
        }
      }
      if (dia && ehCheque) { const arr = chqByValData.get(`${cts}|${dia}`); if (arr && arr.length === 1) return arr[0]; }
      return null;
    };

    // 2c) Rev. 3230 — CRUZAMENTO COM O CONTROLE DE CARTÃO DE CRÉDITO. Mesma filosofia do
    // cheque, MAS para o cartão o ERP só considera o VALOR TOTAL DA FATURA (pra dizer se a
    // fatura foi paga ou não). O detalhe dos gastos (por obra/centro de custo) vive no módulo
    // Cartão de Crédito — aqui na conciliação a fatura é UM pagamento só (saída). READ-ONLY.
    const fatRes = await dbExecute(db,
      `SELECT f.id, f.total, f.vencimento, f.fechamento, f.mes_ref AS "mesRef", f.ano_ref AS "anoRef",
              COALESCE(f.conciliado,0) AS conciliado,
              c.banco AS "cartaoBanco", c.bandeira AS "cartaoBandeira", c.final4 AS "cartaoFinal4"
         FROM financial_cartao_faturas f
         LEFT JOIN financial_cartoes c ON c.id = f.cartao_id AND c.company_id = f.company_id
        WHERE f.company_id=$1 AND f.excluido_em IS NULL AND f.total IS NOT NULL`,
      [input.companyId]);
    const faturasRep = rows(fatRes) as any[];
    const fatByTotal = new Map<string, any[]>();
    const fatByTotalVenc = new Map<string, any[]>();
    for (const f of faturasRep) {
      const cts = chqCents(f.total);
      if (cts == null || cts === 0) continue;
      { const k = `${cts}`; if (!fatByTotal.has(k)) fatByTotal.set(k, []); fatByTotal.get(k)!.push(f); }
      const v = chqDia(f.vencimento);
      if (v) { const k = `${cts}|${v}`; if (!fatByTotalVenc.has(k)) fatByTotalVenc.set(k, []); fatByTotalVenc.get(k)!.push(f); }
    }
    const pareceCartao = (descricao: any) => /cart[aã]o|fatura|cr[eé]dito|visa|master|elo\b|amex|hipercard/i.test(String(descricao ?? ""));
    // Janela temporal p/ o fallback médio: vencimento da fatura perto da linha do extrato (±45d),
    // ou — sem vencimento — competência (mês/ano ref) compatível com a data da linha.
    const faturaDentroJanela = (f: any, diaLinha: string | null): boolean => {
      if (!diaLinha) return false;
      const venc = chqDia(f.vencimento);
      if (venc) {
        const ms = Date.parse(`${diaLinha}T00:00:00Z`) - Date.parse(`${venc}T00:00:00Z`);
        if (Number.isNaN(ms)) return false;
        return Math.abs(ms) <= 45 * 24 * 60 * 60 * 1000;
      }
      const mes = Number(f.mesRef), ano = Number(f.anoRef);
      if (mes >= 1 && mes <= 12 && ano >= 2000) {
        const ly = Number(diaLinha.slice(0, 4)), lm = Number(diaLinha.slice(5, 7));
        const diffMeses = Math.abs((ly * 12 + lm) - (ano * 12 + mes));
        return diffMeses <= 1;
      }
      return false;
    };
    const matchFaturaLinha = (l: any): any | null => {
      const cts = chqCents(l.valor);
      if (cts == null || cts === 0) return null;
      // Pagamento de fatura = SAÍDA (valor negativo no extrato). Evita casar "entrada".
      if (Number(l.valor) >= 0) return null;
      const dia = chqDia(l.data);
      // (1) forte: VALOR TOTAL + data do extrato == vencimento da fatura, quando ÚNICO.
      if (dia) { const arr = fatByTotalVenc.get(`${cts}|${dia}`); if (arr && arr.length === 1) return arr[0]; }
      // (2) médio: VALOR TOTAL + descrição com indício de cartão/fatura, quando ÚNICO E na janela temporal.
      if (pareceCartao(l.descricao)) {
        const arr = fatByTotal.get(`${cts}`);
        if (arr && arr.length === 1 && faturaDentroJanela(arr[0], dia)) return arr[0];
      }
      return null;
    };

    // 2c-bis) Rev. 3238 — SEGUNDA VERIFICAÇÃO PELOS DEMONSTRATIVOS DE PAGAMENTO (PIX/BOLETO
    // lidos por IA — a lista "Tudo que a IA leu nos demonstrativos"). Quando a linha do extrato
    // NÃO casou com lançamento, cheque NEM fatura, o ERP é OBRIGADO a consultar os comprovantes
    // PIX/boletos do mês p/ tentar dizer QUEM recebeu e SE foi PIX ou boleto — o extrato de
    // PIX/boleto é anônimo, mas o demonstrativo traz beneficiário/CNPJ/txid. READ-ONLY: só
    // identifica/sugere, NÃO concilia nem baixa nada (honra "conciliação só sugestiva"). Match,
    // do mais forte p/ o mais fraco: (1) txid/e2e/nosso número presente na descrição + valor;
    // (2) VALOR + DATA exatos, quando ÚNICO; (3) VALOR ÚNICO no período (rótulo "provável").
    // Só SAÍDAS — demonstrativo = pagamento FEITO.
    // Rev. 3266 — o DemoItem agora carrega TAMBÉM a referência do demonstrativo-pai
    // (id/ano/mês) e a lista de PDFs daquele tipo, p/ o diálogo de conferência abrir o
    // documento certo e o cliente saber de QUAL leitura veio a identificação.
    type DemoItem = { beneficiario: string | null; documento: string | null; txid: string | null; valor: number | null; data: string | null; tipoDoc: string | null; origemTipo: "pix" | "boleto"; demId: number; demAno: number; demMes: number; arquivos: { url: string; nome: string | null }[] };
    const ymOf = (s: string) => { const y = Number(String(s).slice(0, 4)); const m = Number(String(s).slice(5, 7)); return (y >= 2000 && m >= 1 && m <= 12) ? y * 12 + m : null; };
    const startYM = ymOf(input.dataInicio), endYM = ymOf(input.dataFim);
    const _parseArqDemo = (v: any, legacyUrl: any, legacyNome: any): { url: string; nome: string | null }[] => {
      let a: any[] = [];
      if (v) { try { const p = JSON.parse(v); if (Array.isArray(p)) a = p; } catch { a = []; } }
      a = a.filter((x: any) => x && x.url).map((x: any) => ({ url: String(x.url), nome: x.nome != null ? String(x.nome) : null }));
      if (a.length === 0 && legacyUrl) a = [{ url: String(legacyUrl), nome: legacyNome != null ? String(legacyNome) : null }];
      return a;
    };
    const demoItens: DemoItem[] = [];
    if (startYM != null && endYM != null) {
      const demoRes = await dbExecute(db,
        `SELECT id, ano, mes,
                pix_extraido_json AS "pixJson", boleto_extraido_json AS "boletoJson",
                pix_url AS "pixUrl", pix_nome AS "pixNome", pix_arquivos_json AS "pixArqJson",
                boleto_url AS "boletoUrl", boleto_nome AS "boletoNome", boleto_arquivos_json AS "boletoArqJson"
           FROM financial_conciliacao_demonstrativos
          WHERE company_id=$1 AND conta_bancaria_id=$2 AND (ano*12+mes) >= $3 AND (ano*12+mes) <= $4`,
        [input.companyId, input.contaBancariaId, startYM, endYM]);
      for (const row of (rows(demoRes) as any[])) {
        const arqByTipo: Record<"pix" | "boleto", { url: string; nome: string | null }[]> = {
          pix: _parseArqDemo(row.pixArqJson, row.pixUrl, row.pixNome),
          boleto: _parseArqDemo(row.boletoArqJson, row.boletoUrl, row.boletoNome),
        };
        for (const [json, origemTipo] of [[row.pixJson, "pix"], [row.boletoJson, "boleto"]] as [any, "pix" | "boleto"][]) {
          if (!json) continue;
          let arr: any[] = [];
          try { const pj = JSON.parse(json); if (Array.isArray(pj)) arr = pj; } catch { arr = []; }
          for (const it of arr) {
            if (!it) continue;
            demoItens.push({
              beneficiario: it.beneficiario != null ? String(it.beneficiario) : null,
              documento: it.documento != null ? String(it.documento) : null,
              txid: it.txid != null ? String(it.txid) : null,
              valor: it.valor != null && !Number.isNaN(Number(it.valor)) ? Math.abs(Number(it.valor)) : null,
              data: it.data ? String(it.data).slice(0, 10) : null,
              tipoDoc: it.tipoDoc != null ? String(it.tipoDoc) : null,
              origemTipo,
              demId: Number(row.id),
              demAno: Number(row.ano),
              demMes: Number(row.mes),
              arquivos: arqByTipo[origemTipo],
            });
          }
        }
      }
    }
    const demoByValData = new Map<string, DemoItem[]>();
    const demoByVal = new Map<string, DemoItem[]>();
    const demoTxids: { txid: string; cents: number | null; it: DemoItem }[] = [];
    const normAlnum = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const it of demoItens) {
      const cts = it.valor != null ? Math.round(it.valor * 100) : null;
      if (cts == null || cts === 0) continue;
      { const k = `${cts}`; if (!demoByVal.has(k)) demoByVal.set(k, []); demoByVal.get(k)!.push(it); }
      if (it.data) { const k = `${cts}|${it.data}`; if (!demoByValData.has(k)) demoByValData.set(k, []); demoByValData.get(k)!.push(it); }
      const tx = normAlnum(it.txid);
      if (tx.length >= 6) demoTxids.push({ txid: tx, cents: cts, it });
    }
    const matchDemonstrativoLinha = (l: any): { it: DemoItem; origem: "txid" | "data" | "valor" } | null => {
      if (Number(l.valor) >= 0) return null; // só saídas (pagamento feito)
      const cts = chqCents(l.valor);
      if (cts == null || cts === 0) return null;
      // (1) txid/e2e/nosso número na descrição + valor (forte)
      if (demoTxids.length) {
        const desc = normAlnum(l.descricao);
        if (desc) {
          const hit = demoTxids.find((t) => desc.includes(t.txid) && (t.cents == null || t.cents === cts));
          if (hit) return { it: hit.it, origem: "txid" };
        }
      }
      // (2) valor + data exatos, quando único (forte)
      const dia = chqDia(l.data);
      if (dia) { const arr = demoByValData.get(`${cts}|${dia}`); if (arr && arr.length === 1) return { it: arr[0], origem: "data" }; }
      // (3) valor único no período (provável)
      const arrV = demoByVal.get(`${cts}`); if (arrV && arrV.length === 1) return { it: arrV[0], origem: "valor" };
      return null;
    };

    // 2c-ter) Rev. 3265 — VÍNCULO DA LINHA DO EXTRATO COM O CADASTRO (mesma filosofia do
    // cheque, agora p/ os DEMAIS pagamentos/recebimentos): SAÍDA → tenta amarrar a um
    // FORNECEDOR cadastrado; ENTRADA → tenta amarrar a um CLIENTE (recebível). Sinal FORTE =
    // CNPJ presente na descrição do extrato casa com o cadastro (badge "cadastro"); FRACO =
    // nome do beneficiário (vindo do demonstrativo) OU da própria descrição casa por nome
    // (rótulo "sugestão", p/ o usuário confirmar). READ-ONLY: só identifica/sugere — não grava
    // nem concilia nada (honra "conciliação só sugestiva"). Espelha `normCnpj`/`matchFornecedor`
    // do módulo PJ (Rev. 3262).
    const _normCnpj = (v: any) => String(v ?? "").replace(/\D/g, "");
    const _normNome = (v: any) => {
      let s = String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
        .replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      return s.replace(/\b(LTDA|EIRELI|EPP|MEI|ME|SA)\b/g, " ").replace(/\s+/g, " ").trim();
    };
    type CadHit = { id: number; nome: string };
    type CadIdx = { porCnpj: Map<string, CadHit>; porNome: Map<string, CadHit> };
    const buildCadIdx = (arr: any[]): CadIdx => {
      const porCnpj = new Map<string, CadHit>();
      const porNome = new Map<string, CadHit>();
      for (const f of arr) {
        const nome = f.razaoSocial || f.nomeFantasia || "";
        const c = _normCnpj(f.cnpj);
        if (c.length === 14 && !porCnpj.has(c)) porCnpj.set(c, { id: f.id, nome });
        const rz = _normNome(f.razaoSocial); if (rz && !porNome.has(rz)) porNome.set(rz, { id: f.id, nome });
        const nf = _normNome(f.nomeFantasia); if (nf && !porNome.has(nf)) porNome.set(nf, { id: f.id, nome });
      }
      return { porCnpj, porNome };
    };
    const fornRes = await dbExecute(db,
      `SELECT id, cnpj, razao_social AS "razaoSocial", nome_fantasia AS "nomeFantasia"
         FROM fornecedores WHERE company_id=$1 AND COALESCE(ativo,true)=true`,
      [input.companyId]);
    const cliRes = await dbExecute(db,
      `SELECT id, cnpj, razao_social AS "razaoSocial", nome_fantasia AS "nomeFantasia"
         FROM clientes WHERE company_id=$1 AND COALESCE(ativo,true)=true`,
      [input.companyId]);
    const fornIdx = buildCadIdx(rows(fornRes) as any[]);
    const cliIdx = buildCadIdx(rows(cliRes) as any[]);
    const extrCnpj = (descricao: any): string | null => {
      const m = String(descricao ?? "").match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/);
      if (m && m[1]) { const c = m[1].replace(/\D/g, ""); return c.length === 14 ? c : null; }
      return null;
    };
    // Rev. 3357 — MATCHER DE CADASTRO PONTUADO (substitui o "1º substring vence", que escolhia
    // qualquer fornecedor curto presente em qualquer pedaço da descrição). Agora tokeniza a
    // descrição e o nome do cadastro, descarta o RUÍDO bancário/societário (PAG, BOLETO, IBC,
    // LTDA, COMERCIO…) e pontua cada candidato pelo PESO (tamanho) dos tokens que casam —
    // exato, prefixo ou similaridade (Dice de bigramas). Vence o de MAIOR peso; só sugere se
    // casou um token forte (≥4) e ≥50% do peso do nome. A confiança ("media"/"baixa") sai da
    // folga vs o 2º colocado, p/ a tela mostrar "confira" e o usuário poder corrigir ao lançar.
    const _STOP_TOKENS = new Set<string>([
      "PAG","PG","PGTO","PGT","PAGTO","PAGAMENTO","PAGAM","BOLETO","BOL","TIT","TITULO","TITULOS",
      "IBC","TED","DOC","PIX","TEF","TRANSF","TRANSFERENCIA","COMPENSACAO","COMPENS","CONV","CONVENIO",
      "REF","REFERENTE","CONTA","CONTAS","DEPOSITO","DEP","SAQUE","CRED","CREDITO","DEB","DEBITO",
      "FATURA","FAT","NFE","DARF","GPS","FGTS","INSS","COBR","COBRANCA","RECEB","RECEBIMENTO",
      "LIQ","LIQUIDACAO","CIP","SISPAG","CNPJ","CPF","LTDA","EPP","EIRELI","MEI","CIA",
      "COM","COMERCIO","COMERCIAL","IND","INDUSTRIA","INDUSTRIAL","SERV","SERVICO","SERVICOS",
      "DISTRIBUIDORA","REPRESENTACAO","REPRESENTACOES","PRODUTOS","PECAS","MATERIAIS","MATERIAL",
      "PARA","POR","DAS","DOS","EM","NA","NO",
    ]);
    const _tokset = (v: any): string[] =>
      _normNome(v).split(" ").filter(t => t.length >= 3 && !_STOP_TOKENS.has(t) && !/^\d+$/.test(t));
    const _bigrams = (s: string): Set<string> => { const g = new Set<string>(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
    const _dice = (a: string, b: string): number => {
      if (a === b) return 1;
      if (a.length < 3 || b.length < 3) return 0;
      const ga = _bigrams(a), gb = _bigrams(b); let inter = 0;
      for (const g of ga) if (gb.has(g)) inter++;
      return (2 * inter) / (ga.size + gb.size);
    };
    const matchCadastro = (l: any, beneficiario: string | null): { tipo: "fornecedor" | "cliente"; id: number; nome: string; via: "cnpj" | "nome"; confianca: "alta" | "media" | "baixa" } | null => {
      const isEntrada = Number(l.valor) >= 0;
      const idx = isEntrada ? cliIdx : fornIdx;
      const tipo: "fornecedor" | "cliente" = isEntrada ? "cliente" : "fornecedor";
      // 1) CNPJ na descrição do extrato (forte → alta)
      const c = extrCnpj(l.descricao);
      if (c) { const hit = idx.porCnpj.get(c); if (hit) return { tipo, id: hit.id, nome: hit.nome, via: "cnpj", confianca: "alta" }; }
      // 2) melhor casamento por NOME, pontuado por tokens (beneficiário do demonstrativo + descrição)
      const descToks = new Set<string>();
      for (const src of [beneficiario, l.descricao]) for (const t of _tokset(src)) descToks.add(t);
      if (descToks.size === 0) return null;
      const perId = new Map<number, { nome: string; weight: number; ratio: number }>();
      for (const [nm, hit] of idx.porNome) {
        const candToks = nm.split(" ").filter(t => t.length >= 3 && !_STOP_TOKENS.has(t) && !/^\d+$/.test(t));
        if (candToks.length === 0) continue;
        let matched = 0, total = 0, strong = false;
        for (const ct of candToks) {
          total += ct.length;
          let ok = descToks.has(ct);
          if (!ok) {
            for (const dt of descToks) {
              if (ct.length >= 4 && dt.length >= 4 && (dt.startsWith(ct) || ct.startsWith(dt) || _dice(ct, dt) >= 0.82)) { ok = true; break; }
            }
          }
          if (ok) { matched += ct.length; if (ct.length >= 4) strong = true; }
        }
        if (total === 0) continue;
        const ratio = matched / total;
        if (!strong || ratio < 0.5) continue; // descarta casamentos fracos/genéricos
        const prev = perId.get(hit.id);
        if (!prev || matched > prev.weight) perId.set(hit.id, { nome: hit.nome, weight: matched, ratio });
      }
      if (perId.size === 0) return null;
      const ranked = [...perId.entries()].sort((a, b) => (b[1].weight - a[1].weight) || (b[1].ratio - a[1].ratio));
      const [bestId, best] = ranked[0];
      const second = ranked[1]?.[1];
      const margem = best.weight - (second?.weight ?? 0);
      const confianca: "media" | "baixa" = (best.ratio >= 0.9 && margem >= 4) ? "media" : "baixa";
      return { tipo, id: bestId, nome: best.nome, via: "nome", confianca };
    };

    // Rev. 3266 — VEREDICTO do usuário sobre a identificação por IA (texto roxo): confirmado
    // ou errado, por LINHA do extrato. Só LEITURA aqui — anexa ao retorno p/ a tela refletir
    // o estado da conferência (✓ conferido / ✗ marcado errado). try/catch defensivo caso a
    // tabela ainda não exista (o self-heal a cria no boot).
    const veredictoByLinha = new Map<number, { veredicto: string; em: string | null; por: string | null }>();
    try {
      const vRes = await dbExecute(db,
        `SELECT extrato_linha_id AS "linhaId", veredicto, atualizado_em AS "em", criado_em AS "criadoEm", usuario_nome AS "por"
           FROM financial_conciliacao_demo_confirmacoes
          WHERE company_id=$1 AND conta_bancaria_id=$2`,
        [input.companyId, input.contaBancariaId]);
      for (const v of (rows(vRes) as any[])) {
        if (v.veredicto === "confirmado" || v.veredicto === "errado")
          veredictoByLinha.set(Number(v.linhaId), { veredicto: String(v.veredicto), em: (v.em ?? v.criadoEm) ?? null, por: v.por ?? null });
      }
    } catch { /* tabela ainda não materializada — sem veredictos */ }

    const extratoSemLancamento = rows(pendRes).map((l: any) => {
      let out: any = l;
      const c = matchChequeLinha(l);
      if (c) {
        const num = String(c.numeroCheque ?? "").replace(/^0+/, "") || (c.numeroCheque ?? null);
        out = {
          ...l,
          chequeNumero: num ?? null,
          chequeFornecedor: c.fornecedorNome ?? null,
          chequeFornecedorId: c.fornecedorId ?? null,
          chequeObraId: c.obraId ?? null,
          chequeObraNome: c.obraNome ?? null,
          chequeNf: c.nf ?? null,
          chequeVencimento: c.dataVencimento ?? null,
          chequeBanco: c.bancoNome ?? null,
          // Rev. 4140 — true quando o match é por nº+data ou nº-único (valor diferente
          // do extrato). Front exibe visual âmbar em vez do verde confirmado.
          chequeFraco: c.matchFraco === true,
        };
      } else {
        const f = matchFaturaLinha(l);
        if (f) {
          const label = [f.cartaoBanco, f.cartaoBandeira, f.cartaoFinal4 ? `final ${f.cartaoFinal4}` : ""].filter(Boolean).join(" ").trim();
          out = {
            ...l,
            faturaId: f.id,
            faturaCartao: label || "Cartão",
            faturaVencimento: f.vencimento ?? null,
            faturaTotal: f.total ?? null,
            faturaMesRef: f.mesRef ?? null,
            faturaAnoRef: f.anoRef ?? null,
            faturaConciliado: Number(f.conciliado) === 1 ? 1 : 0,
          };
        } else {
          // Rev. 3238 — SEGUNDA VERIFICAÇÃO: nada casou (lançamento/cheque/fatura). Consulta os
          // demonstrativos de pagamento (PIX/boleto lidos por IA) p/ identificar beneficiário + tipo.
          const d = matchDemonstrativoLinha(l);
          if (d) {
            const tipo = d.it.tipoDoc && /pix|boleto|ted/i.test(d.it.tipoDoc) ? d.it.tipoDoc.toLowerCase() : d.it.origemTipo;
            const ver = veredictoByLinha.get(Number(l.id));
            out = {
              ...l,
              demoBeneficiario: d.it.beneficiario ?? null,
              demoDocumento: d.it.documento ?? null,
              demoTxid: d.it.txid ?? null,
              demoTipo: tipo,        // "pix" | "boleto" | "ted"
              demoData: d.it.data ?? null,
              demoMatch: d.origem,   // "txid" | "data" | "valor"
              // Rev. 3266 — dados p/ o diálogo de conferência (valor lido, PDF do mês) + veredicto.
              demoValor: d.it.valor ?? null,
              demoDemonstrativoId: d.it.demId,
              demoAno: d.it.demAno,
              demoMes: d.it.demMes,
              demoArquivos: d.it.arquivos,
              demoVeredicto: ver?.veredicto ?? null,   // "confirmado" | "errado" | null
              demoVeredictoEm: ver?.em ?? null,
              demoVeredictoPor: ver?.por ?? null,
            };
          }
        }
      }
      // Rev. 3265 — vínculo com o cadastro (fornecedor p/ saída, cliente p/ entrada). Pulado
      // quando o cheque já amarrou um fornecedor (`chequeFornecedorId`) ou quando é fatura de
      // cartão (`faturaId`) — ali o fornecedor não se aplica.
      if (!out.chequeFornecedorId && !out.faturaId) {
        const vinc = matchCadastro(l, out.demoBeneficiario ?? null);
        if (vinc) out = { ...out, vinculoTipo: vinc.tipo, vinculoId: vinc.id, vinculoNome: vinc.nome, vinculoVia: vinc.via, vinculoConfianca: vinc.confianca };
      }
      return out;
    });

    // 2d) Rev. 3235 — TENTATIVA DE PAGAMENTO FRUSTRADA (cheque devolvido/sustado).
    // No extrato, o cheque aparece como DÉBITO (compensação) e, dias depois, volta como
    // CRÉDITO (devolução) do MESMO valor/doc. Esse par tem saldo ZERO: NÃO é saída real
    // nem entrada real — foi um pagamento que não se concretizou. O ERP pareia os dois,
    // traduz o motivo (alínea Bacen — biblioteca shared/chequeMotivos) e PROCURA a quitação
    // real: (a) reapresentação do cheque que compensou depois, ou (b) PIX/TED de mesmo valor.
    // Tudo READ-ONLY — só sinaliza p/ o usuário analisar e decidir. Não grava/baixa nada.
    const linhaById = new Map<any, any>(extratoSemLancamento.map((l: any) => [l.id, l]));
    const linhasMin: LinhaEstornoMin[] = extratoSemLancamento.map((l: any) => ({
      id: l.id,
      valorCents: chqCents(l.valor),
      isCredito: Number(l.valor) >= 0,
      descricao: l.descricao,
      data: chqDia(l.data),
    }));
    const paresEstorno = detectarParesEstorno(linhasMin);
    const minById = new Map<any, LinhaEstornoMin>(linhasMin.map((l) => [l.id, l]));
    const consumidos = new Set<any>();
    for (const p of paresEstorno) { consumidos.add(p.debitoId); consumidos.add(p.creditoId); }
    const livres = linhasMin.filter((l) => !consumidos.has(l.id));
    // Rev. 3792 — Pré-carrega vínculos ativos (bank_cheque_vinculos) p/ classificar pares
    // "pendente" cujo PIX substituto já foi conciliado (saiu de extratoSemLancamento mas
    // o vínculo existe no controle de cheques). Casa por identidade: doc/nº + valor.
    const _vincResRes = await dbExecute(db,
      `SELECT v.id, v.debito_line_id AS "debitoLineId", v.valor,
              to_char(v.data,'YYYY-MM-DD') AS data, v.descricao,
              dl.descricao AS "debDescricao", dl.valor AS "debValor",
              v.pix_line_id AS "pixLineId",
              to_char(px.data,'YYYY-MM-DD') AS "pixData",
              px.descricao AS "pixDescricao", px.valor AS "pixValor"
         FROM bank_cheque_vinculos v
         LEFT JOIN bank_statement_lines dl ON dl.id = v.debito_line_id
         LEFT JOIN bank_statement_lines px ON px.id = v.pix_line_id
        WHERE v.company_id=$1 AND v.estornado_em IS NULL`,
      [companyId]);
    const vincResRows = (rows(_vincResRes) as any[]).map((v) => ({
      ...v,
      _idDoc: parseDocNumero(v.debDescricao),
      _idChq: parseChequeNumero(v.debDescricao),
      _idCents: Math.round(Math.abs(Number(v.debValor ?? 0)) * 100),
    }));
    const chequesDevolvidos = paresEstorno.map((p, idx) => {
      const grupoId = `dev-${idx}`;
      const deb: any = linhaById.get(p.debitoId);
      const cred: any = linhaById.get(p.creditoId);
      const cMatch = deb ? matchChequeLinha(deb) : null;
      // Busca da quitação real entre as linhas LIVRES (não pertencentes a outro par).
      // (a) Reapresentação: outro DÉBITO de cheque de mesmo valor, em data >= devolução.
      let resolucao: any = { tipo: "pendente" };
      const reap = livres.find((l) =>
        !consumidos.has(l.id) && !l.isCredito && l.valorCents === p.valorCents &&
        pareceCompensacaoCheque(l.descricao) && (!l.data || !p.dataCredito || l.data >= p.dataCredito));
      if (reap) {
        const rl: any = linhaById.get(reap.id);
        consumidos.add(reap.id);
        if (rl) { rl.reversalResolveGrupo = grupoId; rl.reversalResolveTipo = "reapresentado"; }
        resolucao = { tipo: "reapresentado", lineId: reap.id, data: rl?.data ?? null, descricao: rl?.descricao ?? null, valor: rl?.valor ?? null };
      } else {
        // (b) Substituição por PIX/TED/transferência de MESMO valor (saída), em data >= débito.
        const pix = livres.find((l) =>
          !consumidos.has(l.id) && !l.isCredito && l.valorCents === p.valorCents &&
          /pix|ted\b|doc\b|transf/i.test(String(l.descricao ?? "")) &&
          (!l.data || !p.dataDebito || l.data >= p.dataDebito));
        if (pix) {
          const pl: any = linhaById.get(pix.id);
          consumidos.add(pix.id);
          if (pl) { pl.reversalResolveGrupo = grupoId; pl.reversalResolveTipo = "pix"; }
          resolucao = { tipo: "pix", lineId: pix.id, data: pl?.data ?? null, descricao: pl?.descricao ?? null, valor: pl?.valor ?? null };
        }
      }
      // Rev. 3792 — (c) Vínculo registrado em bank_cheque_vinculos (cobre o caso em que o
      // PIX/TED substituto já foi conciliado — saiu de extratoSemLancamento — mas o vínculo
      // existe no controle de cheques). Isso resolve o caso de cheque devolvido MÚLTIPLAS
      // VEZES: o vínculo está registrado numa das ocorrências; as demais são cobertas por
      // identidade (doc/nº + valor). READ-ONLY — não grava nada.
      if (resolucao.tipo === "pendente" && p.valorCents) {
        const covering = vincResRows.filter((x: any) => _mesmoChequeDevolvido(
          { debitoLineId: Number(p.debitoId), cents: p.valorCents, doc: p.doc ?? null, chq: p.chequeNumero ?? null },
          { debitoLineId: Number(x.debitoLineId), cents: x._idCents, doc: x._idDoc, chq: x._idChq },
        ));
        const acumV = covering.reduce((s: number, x: any) => s + Math.round(Number(x.valor) * 100), 0);
        if (acumV > 0 && acumV >= (p.valorCents - 1)) {
          const best = covering[covering.length - 1];
          resolucao = {
            tipo: "vinculado",
            lineId: best.pixLineId ?? null,
            data: best.pixData ?? best.data ?? null,
            descricao: best.pixDescricao ?? best.descricao ?? null,
            valor: best.pixValor ?? best.valor ?? null,
          };
        }
      }
      // Marca as duas linhas do par como estorno (saem da lista normal no front).
      if (deb) deb.reversal = { papel: "debito", grupoId, doc: p.doc, motivoCodigo: p.motivo?.codigo ?? null };
      if (cred) cred.reversal = { papel: "credito", grupoId, doc: p.doc, motivoCodigo: p.motivo?.codigo ?? null };
      return {
        grupoId,
        doc: p.doc,
        chequeNumero: p.chequeNumero,
        valor: deb?.valor ?? cred?.valor ?? null,
        valorCents: p.valorCents,
        motivoCodigo: p.motivo?.codigo ?? null,
        motivoTexto: p.motivo?.motivo ?? null,
        motivoGrupo: p.motivo?.grupo ?? null,
        motivoSustado: !!p.motivo?.sustado,
        motivoReapresentavel: p.motivo?.reapresentavel ?? null,
        dataDebito: p.dataDebito,
        dataCredito: p.dataCredito,
        descricaoDebito: p.descricaoDebito,
        descricaoCredito: p.descricaoCredito,
        fornecedor: cMatch?.fornecedorNome ?? null,
        obraNome: cMatch?.obraNome ?? null,
        nf: cMatch?.nf ?? null,
        debitoId: p.debitoId,
        creditoId: p.creditoId,
        resolucao,
        // Rev. 3742 — par DESCONSIDERADO do cálculo do % (cheque devolvido já pago por
        // PIX/TED conciliado em OUTRA conta). Continua visível no painel, mas com badge e
        // fora da conta do percentual. Marca se QUALQUER das duas linhas estiver desconsiderada.
        desconsiderado: !!(deb?.desconsideradoEm || cred?.desconsideradoEm),
      };
    });
    void minById;

    // 2e) Rev. 3763 — CHEQUES DEVOLVIDOS JÁ CONCILIADOS. Quando as DUAS linhas de um cheque
    // devolvido (compensação + devolução) já foram conciliadas, elas saem de `pendRes` e o
    // par deixa de ser detectado — o cheque "some" do painel mesmo tendo voltado de verdade
    // (e tendo sido substituído por PIX/TED). Para preservar o histórico, detectamos os pares
    // de estorno TAMBÉM entre as linhas conciliadas (`concRes`) e os acrescentamos ao painel
    // marcados como RESOLVIDOS (`resolucao.tipo="conciliado"`, `jaConciliado=true`). NÃO altera
    // o cálculo do % (estas linhas já estão do lado conciliado) — é só visibilidade. READ-ONLY.
    const concLinhas = rows(concRes) as any[];
    const concById = new Map<any, any>(concLinhas.map((l: any) => [l.id, l]));
    const concMin: LinhaEstornoMin[] = concLinhas.map((l: any) => ({
      id: l.id,
      valorCents: chqCents(l.valor),
      isCredito: Number(l.valor) >= 0,
      descricao: l.descricao,
      data: chqDia(l.data),
    }));
    const paresConc = detectarParesEstorno(concMin);
    const chequesDevolvidosConc = paresConc.map((p, idx) => {
      const deb: any = concById.get(p.debitoId);
      const cred: any = concById.get(p.creditoId);
      const cMatch = deb ? matchChequeLinha(deb) : null;
      return {
        grupoId: `devc-${idx}`,
        doc: p.doc,
        chequeNumero: p.chequeNumero,
        valor: deb?.valor ?? cred?.valor ?? null,
        valorCents: p.valorCents,
        motivoCodigo: p.motivo?.codigo ?? null,
        motivoTexto: p.motivo?.motivo ?? null,
        motivoGrupo: p.motivo?.grupo ?? null,
        motivoSustado: !!p.motivo?.sustado,
        motivoReapresentavel: p.motivo?.reapresentavel ?? null,
        dataDebito: p.dataDebito,
        dataCredito: p.dataCredito,
        descricaoDebito: p.descricaoDebito,
        descricaoCredito: p.descricaoCredito,
        fornecedor: cMatch?.fornecedorNome ?? null,
        obraNome: cMatch?.obraNome ?? null,
        nf: cMatch?.nf ?? null,
        debitoId: p.debitoId,
        creditoId: p.creditoId,
        resolucao: { tipo: "conciliado" },
        desconsiderado: false,
        jaConciliado: true,
      };
    });
    if (chequesDevolvidosConc.length) chequesDevolvidos.push(...chequesDevolvidosConc);

    // 3) Lançamentos do sistema sem conciliação no período — APENAS desta conta.
    // Rev. 3188 — antes incluía também os lançamentos SEM conta (conta_bancaria_id IS
    // NULL), que apareciam (e eram contados) em TODAS as contas, inflando o KPI "ERP sem
    // extrato" e fazendo o número variar conforme a conta selecionada. Agora o bloco
    // específico da conta traz só `conta_bancaria_id=$2`; os "sem conta" saem num bloco
    // próprio (lancamentosSemConta) que NÃO entra na contagem por conta.
    // Rev. 3239 — além das colunas do lançamento, traz `origem_modulo` e o FORNECEDOR REAL
    // da Frota (posto do abastecimento / fornecedor da manutenção) via LEFT JOIN por
    // origem_id, p/ o agrupador (_agruparConciliacao) unificar combustível/manutenção pelo
    // NOME DO FORNECEDOR (o extrato mostra só o total). VR não precisa de join (agrupa por mês).
    const lancRes = await dbExecute(db,
      `SELECT e.id, e.descricao, e.fornecedor_nome AS "fornecedorNome", e.obra_nome AS "obraNome",
              COALESCE(e.valor_realizado, e.valor_previsto) AS valor, e.tipo, e.status,
              e.forma_pagamento AS "formaPagamento", e.comprovante_url AS "comprovanteUrl",
              e.comprovante_beneficiario AS "comprovanteBeneficiario",
              e.origem_modulo AS "origemModulo",
              e.origem_id AS "origemId",
              co.numero_oc AS "ocNumero",
              co.modalidade_fd AS "modalidadeFd",
              COALESCE(NULLIF(TRIM(ff.posto),''), NULLIF(TRIM(fm.fornecedor),'')) AS "frotaFornecedor",
              COALESCE(NULLIF(TRIM(pc.nome_fantasia),''), NULLIF(TRIM(pc.razao_social),'')) AS "parceiroFornecedor",
              COALESCE(NULLIF(TRIM(pjemp."nomeCompleto"),''), NULLIF(TRIM(pjc."razaoSocialPrestador"),'')) AS "pjFornecedor",
              COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia) AS data
         FROM financial_entries e
         LEFT JOIN fleet_fuel_records ff ON e.origem_modulo='frota_abastecimento' AND ff.id = e.origem_id
         LEFT JOIN fleet_maintenances fm ON e.origem_modulo='frota_manutencao' AND fm.id = e.origem_id
         LEFT JOIN lancamentos_parceiros lp ON e.origem_modulo='parceiro_lancamento' AND lp.id = e.origem_id AND lp."companyId" = e.company_id
         LEFT JOIN parceiros_conveniados pc ON pc.id = lp."parceiroId" AND pc."companyId" = e.company_id
         LEFT JOIN pj_payments pjp ON e.origem_modulo='pagamento_pj' AND pjp.id = e.origem_id AND pjp."companyId" = e.company_id
             AND pjp."mesReferencia" = TO_CHAR(e.data_competencia, 'YYYY-MM')
         LEFT JOIN employees pjemp ON pjemp.id = pjp."employeeId" AND pjemp."companyId" = e.company_id
         LEFT JOIN pj_contracts pjc ON pjc.id = pjp."contractId" AND pjc."companyId" = e.company_id
         LEFT JOIN compras_ordens co ON e.origem_modulo IN ('compras','compra_oc') AND co.id = e.origem_id AND co.company_id = e.company_id
        WHERE e.company_id=$1 AND COALESCE(e.conciliado,0)=0 AND e.status <> 'cancelado'
          AND e.conta_bancaria_id=$2
          AND ${sqlNotProjecao("e.origem_modulo")}
          AND e.origem_modulo NOT IN ('almoxarifado_saida','almoxarifado')
          AND COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia) >= $3
          AND COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia) <= $4
        ORDER BY data ASC, e.id ASC`, p);

    // 3b) Lançamentos sem conta bancária definida (conta_bancaria_id IS NULL) — Rev. 3188.
    // São candidatos a casar com o extrato de QUALQUER banco (o ERP não sabe a conta de
    // origem), por isso ficam num bloco à parte, idêntico em todas as contas, e NÃO são
    // somados ao número da conta. Independe de $2 (a conta selecionada).
    // Rev. 3191 — `dbExecute` liga params por ORDEM DE APARIÇÃO ($N é cosmético). Este
    // bloco filtra `conta_bancaria_id IS NULL` e NÃO usa a conta ($2), então o array
    // compartilhado `p` (4 itens, com a conta na posição 2) desalinhava: o contaBancariaId
    // caía na 1ª comparação de DATA → "invalid input syntax for type date: 2". Usa um array
    // dedicado SEM a conta e placeholders $1,$2,$3 em ordem.
    // Rev. 3399 — LATERAL: para cada lançamento sem conta, busca a melhor linha de extrato
    // (qualquer conta da empresa) que case pelo valor (±R$0,02) e data (±5 dias).
    // O ERP sugere o par, mas a conciliação só ocorre com confirmação explícita do usuário.
    const semContaRes = await dbExecute(db,
      `SELECT e.id, e.descricao, e.fornecedor_nome AS "fornecedorNome", e.obra_nome AS "obraNome",
              COALESCE(e.valor_realizado, e.valor_previsto) AS valor, e.tipo, e.status,
              e.forma_pagamento AS "formaPagamento", e.comprovante_url AS "comprovanteUrl",
              e.comprovante_beneficiario AS "comprovanteBeneficiario",
              e.origem_modulo AS "origemModulo",
              e.origem_id AS "origemId",
              co.numero_oc AS "ocNumero",
              co.modalidade_fd AS "modalidadeFd",
              COALESCE(NULLIF(TRIM(ff.posto),''), NULLIF(TRIM(fm.fornecedor),'')) AS "frotaFornecedor",
              COALESCE(NULLIF(TRIM(pc.nome_fantasia),''), NULLIF(TRIM(pc.razao_social),'')) AS "parceiroFornecedor",
              COALESCE(NULLIF(TRIM(pjemp."nomeCompleto"),''), NULLIF(TRIM(pjc."razaoSocialPrestador"),'')) AS "pjFornecedor",
              COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia) AS data,
              sug."sugLineId", sug."sugContaId", sug."sugBanco", sug."sugContaDesc",
              sug."sugData", sug."sugDesc", sug."sugValor"
         FROM financial_entries e
         LEFT JOIN fleet_fuel_records ff ON e.origem_modulo='frota_abastecimento' AND ff.id = e.origem_id
         LEFT JOIN fleet_maintenances fm ON e.origem_modulo='frota_manutencao' AND fm.id = e.origem_id
         LEFT JOIN lancamentos_parceiros lp ON e.origem_modulo='parceiro_lancamento' AND lp.id = e.origem_id AND lp."companyId" = e.company_id
         LEFT JOIN parceiros_conveniados pc ON pc.id = lp."parceiroId" AND pc."companyId" = e.company_id
         LEFT JOIN pj_payments pjp ON e.origem_modulo='pagamento_pj' AND pjp.id = e.origem_id AND pjp."companyId" = e.company_id
             AND pjp."mesReferencia" = TO_CHAR(e.data_competencia, 'YYYY-MM')
         LEFT JOIN employees pjemp ON pjemp.id = pjp."employeeId" AND pjemp."companyId" = e.company_id
         LEFT JOIN pj_contracts pjc ON pjc.id = pjp."contractId" AND pjc."companyId" = e.company_id
         LEFT JOIN compras_ordens co ON e.origem_modulo IN ('compras','compra_oc') AND co.id = e.origem_id AND co.company_id = e.company_id
         LEFT JOIN LATERAL (
           SELECT b.id AS "sugLineId",
                  b.conta_bancaria_id AS "sugContaId",
                  ba.banco AS "sugBanco",
                  COALESCE(NULLIF(TRIM(ba.apelido),''), ba.banco) AS "sugContaDesc",
                  b.data::text AS "sugData",
                  b.descricao AS "sugDesc",
                  b.valor AS "sugValor"
           FROM bank_statement_lines b
           JOIN company_bank_accounts ba ON ba.id = b.conta_bancaria_id
           WHERE b.company_id = e.company_id
             AND b.excluido_em IS NULL
             AND COALESCE(b.conciliado,0) = 0
             AND ABS(ABS(b.valor) - ABS(COALESCE(e.valor_realizado, e.valor_previsto))) <= 0.02
             AND ABS(b.data - COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia)) <= 5
           ORDER BY ABS(b.data - COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia)) ASC,
                    ABS(ABS(b.valor) - ABS(COALESCE(e.valor_realizado, e.valor_previsto))) ASC,
                    b.id ASC
           LIMIT 1
         ) sug ON TRUE
        WHERE e.company_id=$1 AND COALESCE(e.conciliado,0)=0 AND e.status <> 'cancelado'
          AND e.conta_bancaria_id IS NULL
          AND ${sqlNotProjecao("e.origem_modulo")}
          AND e.origem_modulo NOT IN ('almoxarifado_saida','almoxarifado')
          AND COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia) >= $2
          AND COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia) <= $3
        ORDER BY data ASC, e.id ASC`,
      [input.companyId, input.dataInicio, input.dataFim]);

    // Rev. 3437 — Carregar ciclos de fechamento de fornecedores configurados para o período.
    // Usado pelo agrupador para criar grupos "fechamento_forn" na conciliação.
    const cycleRows = await dbExecute(db,
      `SELECT COALESCE(NULLIF(TRIM(nome_fantasia),''), TRIM(razao_social)) AS nome,
              ciclo_pagamento AS "cicloPagamento",
              ciclo_dia_fechamento AS "cicloDiaFechamento",
              ciclo_num_parcelas AS "cicloNumParcelas",
              ciclo_prazo_parcela AS "cicloPrazoParcela",
              ciclo_forma_pagamento AS "cicloFormaPagamento",
              ciclo_data_referencia AS "cicloDataReferencia"
         FROM empresas_terceiras
        WHERE "companyId"=$1 AND deleted_at IS NULL
          AND ciclo_pagamento IS NOT NULL AND ciclo_pagamento <> 'avista'`,
      [input.companyId]);
    const supplierCycleMap = new Map<string, any>();
    for (const r of rows(cycleRows)) {
      if (r.nome) supplierCycleMap.set(_normNomeConc(String(r.nome)), r);
    }

    // Rev. 3767 — VÍNCULO CHEQUE DEVOLVIDO ↔ PIX/TED VISÍVEL NA CONCILIAÇÃO. O vínculo (gravado
    // em bank_cheque_vinculos por um usuário) marca um PIX/TED como pagamento SUBSTITUTO de um
    // cheque devolvido. Antes só aparecia dentro do diálogo do painel de cheques devolvidos; aqui
    // anexamos a identidade do cheque (doc/nº + valor + quem vinculou) na PRÓPRIA linha do extrato
    // (conciliada ou pendente) p/ a UI exibir um selo direto na conciliação. READ-ONLY.
    const vincPixRes = await dbExecute(db,
      `SELECT v.pix_line_id AS "pixLineId", v.valor, v.cheque_numero AS "chequeNumero",
              v.criado_por_nome AS "criadoPorNome", to_char(v.created_at,'YYYY-MM-DD') AS "criadoEm",
              dl.descricao AS "debDescricao", dl.valor AS "debValor"
         FROM bank_cheque_vinculos v
         LEFT JOIN bank_statement_lines dl ON dl.id = v.debito_line_id
        WHERE v.company_id=$1 AND v.estornado_em IS NULL AND v.pix_line_id IS NOT NULL`,
      [input.companyId]);
    const vincByPix = new Map<number, any>();
    for (const v of rows(vincPixRes) as any[]) {
      vincByPix.set(Number(v.pixLineId), {
        doc: parseDocNumero(v.debDescricao),
        chequeNumero: v.chequeNumero ?? parseChequeNumero(v.debDescricao) ?? null,
        valor: Number(v.valor),
        chequeValor: Math.abs(Number(v.debValor ?? 0)) || null,
        criadoPorNome: v.criadoPorNome ?? null,
        criadoEm: v.criadoEm ?? null,
      });
    }
    const _enrichVinc = (r: any) => ({ ...r, substituiChequeDevolvido: vincByPix.get(Number(r.id)) ?? null });

    return {
      conciliados: rows(concRes).map(_enrichVinc),
      extratoSemLancamento: extratoSemLancamento.map(_enrichVinc),
      chequesDevolvidos,
      // Rev. 3239 — UNIFICA VR (por mês) + combustível/manutenção (por fornecedor) nas duas
      // listas de pendência. SOMA preservada; só a contagem cai (lista enxuta).
      // Rev. 3437 — passa o mapa de ciclos de fornecedores para agrupamento por fechamento.
      lancamentosSemExtrato: _agruparConciliacao(rows(lancRes), supplierCycleMap),
      lancamentosSemConta: _agruparConciliacao(rows(semContaRes), supplierCycleMap),
    };
}

export const financialRouter = router({

  // ─────────────────── PLANO DE CONTAS ───────────────────

  getAccounts: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    tipo: z.string().optional(),
    ativo: z.boolean().optional(),
    escopo: z.enum(["plano","categoria","all"]).optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const ativoPart = input.ativo !== undefined ? `AND ativo = ${input.ativo ? 1 : 0}` : "";
    const tipoPart = input.tipo ? `AND tipo = '${input.tipo.replace(/'/g, "''")}'` : "";
    // Rev. 2157 — escopo separa Plano de Contas (contábil, ex.: "3.3") de
    // Categorias operacionais (AUTO-NNNN). 'all' mantém compatibilidade
    // com lugares que ainda misturam (dropdowns de lançamentos, DRE etc).
    const escopoPart = input.escopo === "plano"
      ? "AND codigo NOT LIKE 'AUTO-%'"
      : input.escopo === "categoria"
      ? "AND codigo LIKE 'AUTO-%'"
      : "";
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", codigo, nome, tipo, natureza, nivel,
              conta_pai_id AS "contaPaiId", classificacao_dre AS "classificacaoDRE",
              centro_custo_id AS "centroCustoId",
              codigo_contabilidade AS "codigoContabilidade",
              ativo, ordem
       FROM financial_accounts
       WHERE company_id IN (${inlineIds(ids)}) ${ativoPart} ${tipoPart} ${escopoPart}
              ORDER BY ordem ASC, codigo ASC`,
      []
    );
    return rows(res);
  }),

  // Rev. 2082 — `codigo` agora é opcional; o servidor gera automaticamente
  // (`AUTO-{maxId+1}`) quando o usuário cadastra uma categoria inline pelo
  // modal "Novo Lançamento" sem precisar pensar em código contábil. Também
  // aceita `centroCustoId` opcional pra já vincular a categoria a um centro
  // de custo existente.
  createAccount: protectedProcedure.input(z.object({
    companyId: z.number(),
    codigo: z.string().optional(),
    nome: z.string().min(2),
    tipo: z.string(),
    natureza: z.string(),
    nivel: z.number().default(1),
    contaPaiId: z.number().optional(),
    classificacaoDRE: z.string().optional(),
    centroCustoId: z.number().optional(),
    ordem: z.number().default(0),
    // Rev. 2157 — escopo informa de qual tela veio o insert. 'plano' valida
    // formato contábil (N.N…) e bloqueia AUTO-*; 'categoria' força AUTO-NNNN
    // mesmo se o usuário digitar algo no campo. Sem escopo: comportamento
    // legado (back-compat com modal inline de lançamento).
    escopo: z.enum(["plano","categoria"]).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Rev. 2157 — gate de escopo
    if (input.escopo === "plano") {
      const codigo = (input.codigo || "").trim();
      if (!codigo) throw new TRPCError({ code: "BAD_REQUEST", message: "Plano de Contas exige código contábil (ex.: 3.1, 4.2.1)." });
      if (/^AUTO-/i.test(codigo)) throw new TRPCError({ code: "BAD_REQUEST", message: "Plano de Contas não aceita códigos AUTO-*; use formato contábil (ex.: 3.1, 4.2.1)." });
      if (!/^[0-9]+(\.[0-9]+){0,4}$/.test(codigo)) throw new TRPCError({ code: "BAD_REQUEST", message: `Código contábil inválido: "${codigo}". Use formato N.N (ex.: 3.1, 4.2.1).` });
    } else if (input.escopo === "categoria") {
      // categorias sempre auto-geram AUTO-NNNN; ignora qualquer codigo enviado.
      input.codigo = undefined;
    }
    // Dedup: se já existe conta com mesmo nome (case-insensitive) na empresa.
    // Rev. 2176 — agora respeita `escopo`. Antes, dedup retornava silenciosamente
    // a conta existente independente do escopo — bug clássico: user cria "Mão de
    // Obra Direta" no Plano de Contas, mas já existia Categoria AUTO-* homônima,
    // backend devolvia o id da Categoria e a "nova" conta nunca aparecia no Plano
    // (filtro `codigo NOT LIKE 'AUTO-%'`). Agora, escopos cruzados viram erro.
    const dupe: any = rows(await dbExecute(db,
      `SELECT id, codigo FROM financial_accounts WHERE company_id=$1 AND LOWER(nome)=LOWER($2) AND ativo=1 LIMIT 1`,
      [input.companyId, input.nome]
    ))[0];
    if (dupe?.id) {
      const dupeIsAuto = /^AUTO-/i.test(String(dupe.codigo || ""));
      if (input.escopo === "plano" && dupeIsAuto) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Já existe uma **Categoria** chamada "${input.nome}" (código \`${dupe.codigo}\`, id #${dupe.id}) — ela bloqueia o cadastro no Plano de Contas. Vá em Financeiro → Categorias, renomeie ou exclua, e tente de novo.`,
        });
      }
      if (input.escopo === "categoria" && !dupeIsAuto) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Já existe uma conta no **Plano de Contas** chamada "${input.nome}" (código \`${dupe.codigo}\`, id #${dupe.id}) — ela bloqueia a criação de Categoria homônima. Renomeie ou exclua a conta do Plano antes.`,
        });
      }
      // Mesmo escopo (ou escopo legado/indefinido): comportamento idempotente.
      return { id: dupe.id, alreadyExists: true };
    }

    // Rev. 3803 — Dedup por SIMILARIDADE: após o dedup exato, verifica se existe
    // conta com nome normalizado idêntico (sem acentos, preposições, espaços).
    // Impede "Seguro Veículos" coexistir com "SEGURO DE VEÍCULOS".
    // Retorna a conta existente idempotentemente (mesmo comportamento do dedup exato).
    const normalizedInput = _normalizeAccountName(input.nome);
    if (normalizedInput.length >= 4) {
      const allActive: any[] = rows(await dbExecute(db,
        `SELECT id, nome, codigo FROM financial_accounts WHERE company_id=$1 AND ativo=1`,
        [input.companyId]
      ));
      const similar = allActive.find(r =>
        _normalizeAccountName(r.nome) === normalizedInput &&
        r.nome.toLowerCase() !== input.nome.toLowerCase()
      );
      if (similar) {
        const simIsAuto = /^AUTO-/i.test(String(similar.codigo || ""));
        if (input.escopo === "plano" && simIsAuto) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Já existe uma Categoria com nome muito parecido: "${similar.nome}" (id #${similar.id}). Use-a em vez de criar uma nova.`,
          });
        }
        if (input.escopo === "categoria" && !simIsAuto) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Já existe uma conta no Plano de Contas com nome muito parecido: "${similar.nome}" (id #${similar.id}). Use-a em vez de criar uma nova.`,
          });
        }
        return { id: Number(similar.id), alreadyExists: true, mergedInto: similar.nome };
      }
    }

    // Auto-gera código se não informado: `AUTO-{próximo}`.
    let codigo = (input.codigo || "").trim();
    if (!codigo) {
      const maxRes = rows(await dbExecute(db,
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(codigo,'[^0-9]','','g') AS INTEGER)),0) + 1 AS nxt
         FROM financial_accounts WHERE company_id=$1 AND codigo LIKE 'AUTO-%'`,
        [input.companyId]
      ));
      const nxt = Number(maxRes[0]?.nxt ?? 1);
      codigo = `AUTO-${String(nxt).padStart(4, "0")}`;
    }

    // Mesmo com o SELECT-dedup acima, INSERT pode ainda colidir com o índice único
    // parcial `uq_fa_company_lower_nome_ativo` em corrida concorrente — captura o
    // 23505 e devolve a categoria existente (idempotente, sem expor erro ao usuário).
    try {
      const res = await dbExecute(db,
        `INSERT INTO financial_accounts (company_id, codigo, nome, tipo, natureza, nivel, conta_pai_id, classificacao_dre, centro_custo_id, ativo, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10) RETURNING id`,
        [input.companyId, codigo, input.nome, input.tipo, input.natureza,
         input.nivel, input.contaPaiId ?? null, input.classificacaoDRE ?? null, input.centroCustoId ?? null, input.ordem]
      );
      const id = rows(res)[0]?.id;
      await createAuditLog({ action: "financial_account_created", userId: ctx.user?.id, companyId: input.companyId, details: `Conta ${codigo} - ${input.nome}` });
      return { id };
    } catch (e: any) {
      // Rev. 2176 — mesma regra de escopo no fallback de race condition.
      const msg = String(e?.message || "");
      const code = String((e as any)?.cause?.code || (e as any)?.code || "");
      if (code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
        const again: any = rows(await dbExecute(db,
          `SELECT id, codigo FROM financial_accounts WHERE company_id=$1 AND LOWER(nome)=LOWER($2) AND ativo=1 LIMIT 1`,
          [input.companyId, input.nome]
        ))[0];
        if (again?.id) {
          const againIsAuto = /^AUTO-/i.test(String(again.codigo || ""));
          if (input.escopo === "plano" && againIsAuto) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Já existe uma **Categoria** chamada "${input.nome}" (código \`${again.codigo}\`, id #${again.id}) — bloqueia o cadastro no Plano de Contas. Vá em Financeiro → Categorias e renomeie/exclua antes.`,
            });
          }
          if (input.escopo === "categoria" && !againIsAuto) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Já existe uma conta no **Plano de Contas** chamada "${input.nome}" (código \`${again.codigo}\`, id #${again.id}) — bloqueia a criação de Categoria homônima.`,
            });
          }
          return { id: again.id, alreadyExists: true };
        }
      }
      throw e;
    }
  }),

  // Rev. 2083 — `tipo`, `natureza` e `centroCustoId` agora editáveis pela tela "Categorias".
  updateAccount: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    nome: z.string().optional(),
    tipo: z.string().optional(),
    natureza: z.string().optional(),
    centroCustoId: z.number().nullable().optional(),
    contaPaiId: z.number().nullable().optional(),
    classificacaoDRE: z.string().optional(),
    ativo: z.boolean().optional(),
    ordem: z.number().optional(),
    nivel: z.number().optional(),
    // Rev. 2173 — código contábil agora é editável (até então o backend
    // ignorava silenciosamente, deixando filhos órfãos como "3.1.1" mesmo
    // depois de trocar a Conta Pai).
    codigo: z.string().optional(),
    // Rev. 4109 — código do plano de contas do contador (para exportações contábeis).
    codigoContabilidade: z.string().nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const parts: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (input.nome !== undefined) { parts.push(`nome=$${i++}`); vals.push(input.nome); }
    if (input.tipo !== undefined) { parts.push(`tipo=$${i++}`); vals.push(input.tipo); }
    if (input.natureza !== undefined) { parts.push(`natureza=$${i++}`); vals.push(input.natureza); }
    if (input.centroCustoId !== undefined) { parts.push(`centro_custo_id=$${i++}`); vals.push(input.centroCustoId); }
    if (input.contaPaiId !== undefined) { parts.push(`conta_pai_id=$${i++}`); vals.push(input.contaPaiId); }
    if (input.classificacaoDRE !== undefined) { parts.push(`classificacao_dre=$${i++}`); vals.push(input.classificacaoDRE); }
    if (input.ativo !== undefined) { parts.push(`ativo=$${i++}`); vals.push(input.ativo ? 1 : 0); }
    if (input.ordem !== undefined) { parts.push(`ordem=$${i++}`); vals.push(input.ordem); }
    if (input.nivel !== undefined) { parts.push(`nivel=$${i++}`); vals.push(input.nivel); }
    if (input.codigoContabilidade !== undefined) { parts.push(`codigo_contabilidade=$${i++}`); vals.push(input.codigoContabilidade ?? null); }
    if (input.codigo !== undefined) {
      // Rev. 2173 — mesma validação do create (formato contábil N.N.N até 5 níveis)
      const codigo = input.codigo.trim();
      if (!codigo) throw new TRPCError({ code: "BAD_REQUEST", message: "Código contábil obrigatório." });
      if (/^AUTO-/i.test(codigo)) throw new TRPCError({ code: "BAD_REQUEST", message: "Plano de Contas não aceita códigos AUTO-*; use formato contábil (ex.: 3.1, 4.2.1)." });
      if (!/^[0-9]+(\.[0-9]+){0,4}$/.test(codigo)) throw new TRPCError({ code: "BAD_REQUEST", message: `Código contábil inválido: "${codigo}". Use formato N.N (ex.: 3.1, 4.2.1).` });
      parts.push(`codigo=$${i++}`); vals.push(codigo);
    }
    if (!parts.length) return { ok: true };
    vals.push(input.id, input.companyId);
    try {
      await dbExecute(db, `UPDATE financial_accounts SET ${parts.join(",")} WHERE id=$${i++} AND company_id=$${i}`, vals);
    } catch (e: any) {
      // Rev. 2174 — traduz 23505 (constraint única) em mensagem amigável.
      // Rev. 2175 — agora também localiza a conta conflitante e diz onde
      // ela está (Plano de Contas vs Categorias / código AUTO-*).
      // dbExecute (Rev. 2170) já anexa code/constraint/detail em e.message.
      const msg = String(e?.message || "");
      const code = String((e as any)?.cause?.code || (e as any)?.code || "");
      const constraint = String((e as any)?.cause?.constraint || "");
      if (code === "23505" || /uq_fa_company_lower_nome_ativo|duplicate key|unique constraint/i.test(msg) || /uq_fa_/i.test(constraint)) {
        if (/uq_fa_company_lower_nome_ativo|nome/i.test(msg + constraint) && input.nome) {
          // Localiza a conta conflitante para mensagem rica.
          let where = "neste cadastro";
          try {
            const found = rows(await dbExecute(db,
              `SELECT id, codigo, nome FROM financial_accounts
               WHERE company_id=$1 AND LOWER(nome)=LOWER($2) AND ativo=1 AND id<>$3 LIMIT 1`,
              [input.companyId, input.nome, input.id]
            ));
            const dupe: any = found[0];
            if (dupe?.codigo) {
              const isCategoria = /^AUTO-/i.test(String(dupe.codigo));
              where = isCategoria
                ? `em **Categorias** (código \`${dupe.codigo}\`, id #${dupe.id}) — não aparece na tela do Plano de Contas`
                : `no **Plano de Contas** com o código \`${dupe.codigo}\` (id #${dupe.id})`;
            }
          } catch { /* fail-open: usa fallback genérico */ }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Já existe uma conta ATIVA chamada "${input.nome}" ${where}. Para liberar este nome, exclua ou renomeie a outra conta antes.`,
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Conflito de unicidade ao salvar conta (constraint: ${constraint || "?"}). Verifique se já existe registro duplicado.`,
        });
      }
      throw e;
    }
    return { ok: true };
  }),

  seedAccounts: protectedProcedure.input(z.object({ companyId: z.number() })).mutation(async ({ input }) => {
    await seedPlanoDeConta(input.companyId);
    await ensureTaxConfig(input.companyId);
    return { ok: true };
  }),

  // Rev. 2166 — Exclusão de conta contábil (Plano de Contas). Soft-delete
  // (ativo=0), com checagem de refs em lançamentos (financial_entries.conta_id)
  // e em filhas (financial_accounts.conta_pai_id). Estratégia defensiva igual
  // à da Rev. 2163: cada SELECT em try/catch próprio.
  deleteAccount: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const accRes = await dbExecute(db,
      `SELECT id, codigo, nome FROM financial_accounts WHERE id=$1 AND company_id=$2 AND ativo=1`,
      [input.id, input.companyId]
    );
    const acc = rows(accRes)[0];
    if (!acc) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada nesta empresa." });
    let nEnt = 0, nFilhas = 0;
    try {
      const r = await dbExecute(db,
        `SELECT COUNT(*)::int AS n FROM financial_entries WHERE conta_id=$1`,
        [input.id]);
      nEnt = rows(r)[0]?.n ?? 0;
    } catch (e: any) {
      console.warn(`[deleteAccount] skip financial_entries ref check:`, e?.message);
    }
    try {
      const r = await dbExecute(db,
        `SELECT COUNT(*)::int AS n FROM financial_accounts WHERE conta_pai_id=$1 AND ativo=1`,
        [input.id]);
      nFilhas = rows(r)[0]?.n ?? 0;
    } catch (e: any) {
      console.warn(`[deleteAccount] skip filhas ref check:`, e?.message);
    }
    if (nEnt > 0 || nFilhas > 0) {
      const partes: string[] = [];
      if (nFilhas > 0) partes.push(`${nFilhas} conta(s) filha(s)`);
      if (nEnt > 0) partes.push(`${nEnt} lançamento(s)`);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Não foi possível excluir "${acc.codigo} — ${acc.nome}": ainda existem ${partes.join(', ')} vinculados.`,
      });
    }
    await dbExecute(db,
      `UPDATE financial_accounts SET ativo=0 WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    await createAuditLog({ action: "financial_account_deleted", userId: (ctx as any).user?.id, companyId: input.companyId, details: `Conta ${acc.codigo} - ${acc.nome}` });
    return { ok: true, id: input.id, codigo: acc.codigo, nome: acc.nome };
  }),

  // ─────────────────── LANÇAMENTOS ───────────────────

  getEntries: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    obraId: z.number().optional(),
    tipo: z.string().optional(),
    status: z.string().optional(),
    mesCompetencia: z.string().optional(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
    origemModulo: z.string().optional(),
    // Rev. 3136 — exclui as PROJEÇÕES do cronograma da listagem (tela de Lançamentos),
    // que precisa mostrar só caixa REAL. Opcional → default mantém o comportamento atual.
    excluirCronograma: z.boolean().optional(),
    busca: z.string().optional(),
    limit: z.number().default(100),
    offset: z.number().default(0),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds: string[] = [`e.company_id IN (${inlineIds(ids)})`];
    const vals: any[] = [];
    let i = 1;
    if (input.obraId) { conds.push(`e.obra_id=$${i++}`); vals.push(input.obraId); }
    if (input.tipo) { conds.push(`e.tipo=$${i++}`); vals.push(input.tipo); }
    if (input.status) { conds.push(`e.status=$${i++}`); vals.push(input.status); }
    if (input.mesCompetencia) { conds.push(`TO_CHAR(e.data_competencia,'YYYY-MM')=$${i++}`); vals.push(input.mesCompetencia); }
    // Rev. 2656 — o filtro de período passa a ser de SOBREPOSIÇÃO: o lançamento
    // aparece se a competência OU o vencimento cai no intervalo (e, quando ambos
    // são NULL, a data de criação). Antes filtrava só por `data_competencia`, então
    // lançamentos com competência NULL ou com vencimento em outro mês apareciam no
    // Contas a Pagar (que filtra por VENCIMENTO) mas SUMIAM da tela de Lançamentos.
    // NB: `dbExecute` liga placeholders por ORDEM DE APARIÇÃO no texto (o nº de $N é
    // cosmético) — por isso cada aparição empurra seu próprio valor em `vals`.
    if (input.dataInicio || input.dataFim) {
      const rangeFor = (col: string) => {
        if (input.dataInicio && input.dataFim) { const c = `${col} BETWEEN $${i++} AND $${i++}`; vals.push(input.dataInicio, input.dataFim); return c; }
        if (input.dataInicio) { const c = `${col}>=$${i++}`; vals.push(input.dataInicio); return c; }
        const c = `${col}<=$${i++}`; vals.push(input.dataFim); return c;
      };
      const cCompetencia = rangeFor("e.data_competencia");
      const cVencimento = rangeFor("e.data_vencimento");
      const cCriacao = rangeFor("e.created_at::date");
      conds.push(
        `((e.data_competencia IS NOT NULL AND ${cCompetencia}) ` +
        `OR (e.data_vencimento IS NOT NULL AND ${cVencimento}) ` +
        `OR (e.data_competencia IS NULL AND e.data_vencimento IS NULL AND ${cCriacao}))`
      );
    }
    if (input.origemModulo) { conds.push(`e.origem_modulo=$${i++}`); vals.push(input.origemModulo); }
    // Rev. 3410 — busca textual em descrição e fornecedor (para trocar match de conciliação)
    if (input.busca) { conds.push(`(e.descricao ILIKE $${i++} OR COALESCE(e.fornecedor_nome,'') ILIKE $${i++})`); vals.push(`%${input.busca}%`, `%${input.busca}%`); }
    // Rev. 3136 — as projeções do cronograma (origem 'cronograma_atividade') NÃO são
    // caixa real (são o valor de contrato distribuído mês a mês), então saem da tela de
    // Lançamentos. Literal (sem placeholder) → não interfere na ligação posicional.
    // Rev. 3147 — com a TRAVA global ligada, exclui TODAS as projeções (não só o
    // cronograma); senão, mantém o comportamento por parâmetro (Rev. 3136).
    if (input.excluirCronograma || FINANCEIRO_SOMENTE_REAL) { conds.push(sqlNotProjecao("e.origem_modulo")); }
    vals.push(input.limit, input.offset);
    const res = await dbExecute(db, 
      `SELECT e.id, e.company_id AS "companyId", e.obra_id AS "obraId", e.obra_nome AS "obraNome",
              e.conta_id AS "contaId", e.conta_nome AS "contaNome", e.tipo, e.natureza,
              e.valor_previsto AS "valorPrevisto", e.valor_realizado AS "valorRealizado",
              e.data_competencia AS "dataCompetencia", e.data_vencimento AS "dataVencimento",
              e.data_pagamento AS "dataPagamento", e.status, e.origem_modulo AS "origemModulo",
              e.origem_descricao AS "origemDescricao", e.forma_pagamento AS "formaPagamento",
              e.descricao, e.observacoes, e.conciliado, e.parcela_numero AS "parcelaNumero",
              e.parcela_total AS "parcelaTotal", e.cheque_status AS "chequeStatus",
              -- Rev. 3752 — nº do cheque/Doc do lançamento p/ os diálogos de conciliação
              -- mostrarem QUAL cheque é cada candidato (evita conciliar o cheque errado
              -- quando o valor se repete). Costumam vir vazios → o front cai no parse da descrição.
              e.cheque_numero AS "chequeNumero", e.comprovante_documento AS "comprovanteDocumento",
              e.fornecedor_nome AS "fornecedorNome",
              -- Rev. 3155 — enriquece os lançamentos do módulo Frota com o POSTO
              -- (abastecimento) / FORNECEDOR (manutenção) que vive nas tabelas da Frota
              -- (financial_entries.fornecedor_nome chega vazio nesses), via origem_id.
              -- Read-only (LEFT JOIN 1:1 por PK + guarda de company); permite agrupar a
              -- lista por posto/fornecedor (não só por tipo).
              COALESCE(NULLIF(BTRIM(e.fornecedor_nome), ''), ffr.posto, fm.fornecedor) AS "frotaFornecedor",
              -- Rev. 3164 — enriquece os lançamentos de Pagamento PJ (origem 'pagamento_pj')
              -- com o NOME do contratado (pj_payments → employees), p/ a tela de Lançamentos
              -- agrupar os PJ por mês (igual à Folha) e o diálogo de detalhe mostrar CADA
              -- pagamento de forma rastreável. Read-only (LEFT JOIN 1:1 por PK + guarda de company).
              NULLIF(BTRIM(pjemp."nomeCompleto"), '') AS "pjFornecedor",
              e.criado_por_nome AS "criadoPorNome", e.created_at AS "createdAt"
       FROM financial_entries e
       LEFT JOIN fleet_fuel_records ffr ON e.origem_modulo = 'frota_abastecimento' AND ffr.id = e.origem_id AND ffr.company_id = e.company_id
       LEFT JOIN fleet_maintenances fm ON e.origem_modulo = 'frota_manutencao' AND fm.id = e.origem_id AND fm.company_id = e.company_id
       LEFT JOIN pj_payments pjp ON e.origem_modulo = 'pagamento_pj' AND pjp.id = e.origem_id AND pjp."companyId" = e.company_id
           AND pjp."mesReferencia" = TO_CHAR(e.data_competencia, 'YYYY-MM')
       LEFT JOIN employees pjemp ON pjemp.id = pjp."employeeId" AND pjemp."companyId" = e.company_id
       WHERE ${conds.join(" AND ")}
       ORDER BY COALESCE(e.data_competencia, e.data_vencimento, e.created_at::date) DESC, e.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      vals
    );
    const countRes = await dbExecute(db, 
      `SELECT COUNT(*) AS total FROM financial_entries e WHERE ${conds.join(" AND ")}`,
      vals.slice(0, -2)
    );
    return {
      data: rows(res),
      total: Number(rows(countRes)[0]?.total ?? 0),
    };
  }),

  // Rev. 3752 — CHEQUES do CONTROLE DE CHEQUES (financial_cheques) como CANDIDATOS de
  // conciliação. Os diálogos "Conciliar PIX no extrato" e "Trocar lançamento vinculado"
  // só buscavam `financial_entries` (OCs/lançamentos) → cheques rastreados SÓ no Controle
  // de Cheques (sem lançamento de despesa — na empresa real, 0 de ~4,7 mil têm
  // `lancamento_id`) NUNCA apareciam, e o usuário não via o nº do cheque/Doc p/ distinguir
  // valores repetidos (risco de conciliar o cheque ERRADO: ex. JEFCAR 903 × 902 ambos
  // R$2.050). Retorna só cheques AINDA não conciliados/vinculados. READ-ONLY · tenancy guard.
  getChequesParaConciliacao: protectedProcedure.input(z.object({
    companyId: z.number(),
    busca: z.string().optional(),
    // Rev. 3768 — valor de referência (PIX/linha do extrato): cheques de valor IGUAL
    // sobem para o topo, garantindo que o cheque-alvo apareça mesmo quando o fornecedor
    // tem centenas de cheques (FERRAGENS SANTA RITA = 928) e o teto `limit` o cortaria.
    valorRef: z.number().optional(),
    limit: z.number().default(30),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // NB: `dbExecute` liga placeholders por ORDEM DE APARIÇÃO no texto ($N é cosmético) —
    // por isso a ordem do array `vals` espelha 1:1 a ordem dos $N no texto.
    const conds: string[] = [`c.company_id=$1`, `c.excluido_em IS NULL`, `COALESCE(c.conciliado,0)=0`, `c.lancamento_id IS NULL`];
    const vals: any[] = [input.companyId];
    let i = 2;
    const busca = (input.busca ?? "").trim();
    if (busca) {
      const soNum = busca.replace(/\D/g, "").replace(/^0+/, "");
      const clauses = [`c.fornecedor_nome ILIKE $${i++}`, `c.numero_cheque ILIKE $${i++}`];
      vals.push(`%${busca}%`, `%${busca}%`);
      if (soNum) { clauses.push(`REGEXP_REPLACE(COALESCE(c.numero_cheque,''),'^0+','') = $${i++}`); vals.push(soNum); }
      conds.push(`(${clauses.join(" OR ")})`);
    }
    // Rev. 3768 — prefixo de ordenação: 0 = casa pelo valor de referência (topo), 1 = demais.
    // O placeholder aparece no texto ANTES do LIMIT, então empurra-se valorRef antes do limit.
    let orderPrefix = "";
    if (input.valorRef != null && input.valorRef > 0) {
      orderPrefix = `CASE WHEN ABS(c.valor - $${i}) < 0.015 THEN 0 ELSE 1 END, `;
      vals.push(input.valorRef);
      i++;
    }
    vals.push(input.limit);
    const res = await dbExecute(db,
      `SELECT c.id AS "chequeId", c.numero_cheque AS "numeroCheque", c.fornecedor_nome AS "fornecedorNome",
              c.valor, c.data_vencimento AS "dataVencimento", c.data_compensacao AS "dataCompensacao",
              c.obra_id AS "obraId", c.obra_nome AS "obraNome", c.status, c.conta_bancaria_id AS "contaBancariaId"
         FROM financial_cheques c
        WHERE ${conds.join(" AND ")}
        ORDER BY ${orderPrefix}c.data_compensacao DESC NULLS LAST, c.data_vencimento DESC NULLS LAST, c.id DESC
        LIMIT $${i}`,
      vals);
    return { data: rows(res) };
  }),

  // Rev. 3145 — Totais AGREGADOS do período (Receitas/Despesas) somando TODOS os
  // lançamentos no servidor, INDEPENDENTE do teto de paginação (`limit`) do
  // `getEntries`. Antes os cards "Total Despesas/Receitas/Resultado" da tela de
  // Lançamentos somavam só as ~500 linhas carregadas, então sub-relatavam o mês
  // (Fev/2026: mostrava R$ 2,20 mi sendo que o real é R$ 3,25 mi). Espelha 1:1 os
  // MESMOS filtros do `getEntries` (tenancy/obra/tipo/status/período por sobreposição
  // competência↔vencimento↔criação/origem/excluirCronograma) + busca textual, e
  // SEMPRE ignora cancelados (igual ao card). Read-only, guardado por IDOR via tenancy.
  getEntriesTotais: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    obraId: z.number().optional(),
    tipo: z.string().optional(),
    status: z.string().optional(),
    mesCompetencia: z.string().optional(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
    origemModulo: z.string().optional(),
    excluirCronograma: z.boolean().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Tenant-guard anti-IDOR (Rev. 3145): valida acesso à empresa antes de agregar.
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const ids = resolveCompanyIds(input);
    const conds: string[] = [`e.company_id IN (${inlineIds(ids)})`];
    const vals: any[] = [];
    let i = 1;
    if (input.obraId) { conds.push(`e.obra_id=$${i++}`); vals.push(input.obraId); }
    if (input.tipo) { conds.push(`e.tipo=$${i++}`); vals.push(input.tipo); }
    if (input.status) { conds.push(`e.status=$${i++}`); vals.push(input.status); }
    if (input.mesCompetencia) { conds.push(`TO_CHAR(e.data_competencia,'YYYY-MM')=$${i++}`); vals.push(input.mesCompetencia); }
    // Mesmo filtro de período por SOBREPOSIÇÃO do getEntries (competência OU
    // vencimento; se ambos NULL → criação). NB: dbExecute liga placeholders por
    // ORDEM DE APARIÇÃO — cada aparição empurra seu valor em `vals`.
    if (input.dataInicio || input.dataFim) {
      const rangeFor = (col: string) => {
        if (input.dataInicio && input.dataFim) { const c = `${col} BETWEEN $${i++} AND $${i++}`; vals.push(input.dataInicio, input.dataFim); return c; }
        if (input.dataInicio) { const c = `${col}>=$${i++}`; vals.push(input.dataInicio); return c; }
        const c = `${col}<=$${i++}`; vals.push(input.dataFim); return c;
      };
      const cCompetencia = rangeFor("e.data_competencia");
      const cVencimento = rangeFor("e.data_vencimento");
      const cCriacao = rangeFor("e.created_at::date");
      conds.push(
        `((e.data_competencia IS NOT NULL AND ${cCompetencia}) ` +
        `OR (e.data_vencimento IS NOT NULL AND ${cVencimento}) ` +
        `OR (e.data_competencia IS NULL AND e.data_vencimento IS NULL AND ${cCriacao}))`
      );
    }
    if (input.origemModulo) { conds.push(`e.origem_modulo=$${i++}`); vals.push(input.origemModulo); }
    // Rev. 3147 — com a TRAVA global ligada, exclui TODAS as projeções (não só o
    // cronograma); senão, mantém o comportamento por parâmetro (Rev. 3136).
    if (input.excluirCronograma || FINANCEIRO_SOMENTE_REAL) { conds.push(sqlNotProjecao("e.origem_modulo")); }
    if (input.search && input.search.trim()) {
      const like = `%${input.search.trim()}%`;
      conds.push(`(e.descricao ILIKE $${i++} OR e.obra_nome ILIKE $${i++} OR e.conta_nome ILIKE $${i++})`);
      vals.push(like, like, like);
    }
    // Espelha o card: cancelados nunca entram no total.
    conds.push(`e.status <> 'cancelado'`);
    const res = await dbExecute(db,
      `SELECT e.tipo, COALESCE(SUM(e.valor_previsto), 0) AS total
       FROM financial_entries e
       WHERE ${conds.join(" AND ")}
       GROUP BY e.tipo`,
      vals
    );
    let receita = 0, despesa = 0;
    for (const r of rows(res)) {
      if (r.tipo === "receita") receita = Number(r.total ?? 0);
      else if (r.tipo === "despesa") despesa = Number(r.total ?? 0);
    }
    return { receita, despesa };
  }),

  // Rev. 3133 — Resumo por mês p/ a TIMELINE de meses (Jan–Dez) da tela de
  // Lançamentos — mesmo padrão visual do Contas a Pagar/Receber. Agrega só
  // CONTAGENS por mês (não puxa as ~milhares de linhas do ano), classificando
  // cada mês em: consolidado (tudo pago/recebido), com lançamento (tem aberto)
  // ou sem dados. Mesma âncora de data do `getEntries` (competência → vencimento
  // → criação) e MESMO escopo de tenancy. Read-only, guardado por IDOR.
  getEntriesResumoMensal: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number().int().min(2000).max(2100),
    tipo: z.string().optional(),
    excluirCronograma: z.boolean().optional(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Rev. 3133 — anti-IDOR: este endpoint NÃO aceita `companyIds` (que
    // `resolveCompanyIds` confiaria sem validar item a item). O escopo é
    // SEMPRE a única empresa pedida, já validada pelo assert acima.
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const conds: string[] = [
      `e.company_id = ${Number(input.companyId)}`,
      `e.status <> 'cancelado'`,
      `EXTRACT(YEAR FROM COALESCE(e.data_competencia, e.data_vencimento, e.created_at::date)) = $1`,
    ];
    const vals: any[] = [input.ano];
    if (input.tipo) { conds.push(`e.tipo = $2`); vals.push(input.tipo); }
    // Rev. 3136 — mesma exclusão da listagem: as bolinhas da timeline refletem só
    // caixa real (sem as projeções 'cronograma_atividade'). Literal, sem placeholder.
    // Rev. 3147 — com a TRAVA global ligada, exclui TODAS as projeções (não só o
    // cronograma); senão, mantém o comportamento por parâmetro (Rev. 3136).
    if (input.excluirCronograma || FINANCEIRO_SOMENTE_REAL) { conds.push(sqlNotProjecao("e.origem_modulo")); }
    const res = await dbExecute(db,
      `SELECT EXTRACT(MONTH FROM COALESCE(e.data_competencia, e.data_vencimento, e.created_at::date))::int AS mes,
              COUNT(*)::int AS total,
              SUM(CASE WHEN e.status NOT IN ('pago','recebido') THEN 1 ELSE 0 END)::int AS abertos
       FROM financial_entries e
       WHERE ${conds.join(" AND ")}
       GROUP BY 1`,
      vals
    );
    return rows(res).map((r: any) => ({
      mes: Number(r.mes),
      total: Number(r.total),
      abertos: Number(r.abertos),
    }));
  }),

  createEntry: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number().optional(),
    obraNome: z.string().optional(),
    contaId: z.number().optional(),
    contaNome: z.string().optional(),
    tipo: z.enum(["receita", "despesa", "transferencia", "imposto", "provisao"]),
    natureza: z.enum(["fixo", "variavel"]),
    valorPrevisto: z.number().positive(),
    valorRealizado: z.number().optional(),
    dataCompetencia: z.string(),
    dataVencimento: z.string().optional(),
    dataPagamento: z.string().optional(),
    status: z.string().default("previsto"),
    contaBancariaId: z.number().optional(),
    // Rev. 2693 — Transferência entre contas: origem (débito) + destino (crédito).
    contaBancariaOrigemId: z.number().optional(),
    contaBancariaDestinoId: z.number().optional(),
    formaPagamento: z.string().optional(),
    // Rev. 3211 — Gancho cartão: quando formaPagamento="cartao_credito", liga o
    // lançamento a um cartão cadastrado + nº parcelas + estabelecimento (onde comprou).
    cartaoId: z.number().nullable().optional(),
    cartaoParcelas: z.number().int().min(1).max(99).nullable().optional(),
    cartaoEstabelecimento: z.string().max(255).optional(),
    descricao: z.string().optional(),
    observacoes: z.string().optional(),
    parcelaNumero: z.number().optional(),
    parcelaTotal: z.number().optional(),
    parcelaGrupoId: z.string().optional(),
    chequeNumero: z.string().optional(),
    chequeBanco: z.string().optional(),
    chequeAgencia: z.string().optional(),
    chequeConta: z.string().optional(),
    chequeTitular: z.string().optional(),
    chequeDataEmissao: z.string().optional(),
    chequeDataBomPara: z.string().optional(),
    fornecedorNome: z.string().optional(),
    // Rev. 3002 — cliente do título (usado no Contas a Receber).
    clienteId: z.number().optional(),
    clienteNome: z.string().optional(),
    // Rev. 3198 — centro de custo explícito no lançamento (colunas já existentes em
    // financial_entries; Análise de Custos resolve explícito → derivado da categoria → nenhum).
    centroCustoId: z.number().optional(),
    centroCustoNome: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Rev. 3198 — tenant guard anti-IDOR: o chamador precisa ter acesso à empresa
    // alvo antes de criar QUALQUER lançamento (mesma proteção de updateEntry/conciliarLancamento).
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    // ── Rev. 2693 — TRANSFERÊNCIA ENTRE CONTAS ─────────────────────────────────
    // Quando origem+destino são informadas, gera DUAS pernas em financial_entries:
    //   1) SAÍDA na conta de origem  · 2) ENTRADA na conta de destino
    // Ambas tipo='transferencia', status='pago', conciliado=0 (aparecem na
    // conciliação das DUAS contas). Ligadas por transferencia_grupo_id, pra que
    // conciliar uma perna concilie a irmã automaticamente. NÃO gera Contas a Pagar
    // (filtra tipo='despesa') nem Contas a Receber (lê financial_revenue), nem entra
    // em fluxo/DRE/KPIs (que só somam receita/despesa). Movimento interno, líquido zero.
    if (input.tipo === "transferencia") {
      // CONTRATO: transferência SEMPRE exige origem+destino válidas e distintas.
      // Sem isso é erro de cliente (não cai no INSERT genérico, que criaria 1 perna órfã).
      const origemId = input.contaBancariaOrigemId;
      const destinoId = input.contaBancariaDestinoId;
      if (!origemId || !destinoId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Transferência exige conta de origem e conta de destino." });
      }
      if (origemId === destinoId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta de origem e destino devem ser diferentes." });
      }
      // Valida ownership/tenant: AS DUAS contas têm que existir e ser DESTA empresa.
      const contasRes = await dbExecute(db,
        `SELECT id, banco, apelido FROM company_bank_accounts WHERE "companyId"=$1 AND id IN ($2,$3)`,
        [input.companyId, origemId, destinoId]
      );
      const contasArr = rows(contasRes) as any[];
      if (contasArr.length !== 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta de origem ou destino inválida (não encontrada nesta empresa)." });
      }
      const contasMap: Record<number, string> = {};
      for (const c of contasArr) {
        contasMap[Number(c.id)] = String(c.apelido || c.banco || `Conta ${c.id}`);
      }
      const labelOrigem = contasMap[origemId] ?? `Conta ${origemId}`;
      const labelDestino = contasMap[destinoId] ?? `Conta ${destinoId}`;
      const grupoId = (globalThis as any).crypto?.randomUUID?.() ?? `tr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const data = input.dataPagamento || input.dataCompetencia;
      const forma = input.formaPagamento ?? null;
      const obs = input.observacoes ?? null;
      const obsSuffix = obs ? ` · ${obs}` : "";
      const descSaida = `Transferência enviada → ${labelDestino}${obsSuffix}`;
      const descEntrada = `Transferência recebida ← ${labelOrigem}${obsSuffix}`;
      // NOTA: dbExecute liga params por ORDEM DE APARIÇÃO do $N (o número é cosmético).
      const insertLeg = async (tx: any, contaBancariaId: number, descricao: string) => {
        const r = await dbExecute(tx,
          `INSERT INTO financial_entries
           (company_id, tipo, natureza, valor_previsto, valor_realizado,
            data_competencia, data_pagamento, status, conta_bancaria_id, forma_pagamento,
            descricao, observacoes, transferencia_grupo_id, conciliado,
            criado_por_id, criado_por_nome, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
           RETURNING id`,
          [
            input.companyId, "transferencia", input.natureza,
            input.valorPrevisto, input.valorPrevisto,
            input.dataCompetencia, data, "pago", contaBancariaId, forma,
            descricao, obs, grupoId, 0,
            ctx.user?.id ?? null, ctx.user?.name ?? null,
          ]
        );
        return rows(r)[0]?.id;
      };
      // ATOMICIDADE: as 2 pernas nascem juntas ou nenhuma (all-or-nothing).
      let idSaida: any, idEntrada: any;
      await db.transaction(async (tx: any) => {
        idSaida = await insertLeg(tx, origemId, descSaida);
        idEntrada = await insertLeg(tx, destinoId, descEntrada);
      });
      await createAuditLog({ action: "financial_transfer_created", userId: ctx.user?.id, companyId: input.companyId, details: `Transferência R$${input.valorPrevisto}: ${labelOrigem} → ${labelDestino}` });
      return { id: idSaida, idDestino: idEntrada };
    }

    const res = await dbExecute(db, 
      `INSERT INTO financial_entries
       (company_id, obra_id, obra_nome, conta_id, conta_nome, tipo, natureza,
        valor_previsto, valor_realizado, data_competencia, data_vencimento, data_pagamento,
        status, conta_bancaria_id, forma_pagamento, descricao, observacoes,
        parcela_numero, parcela_total, parcela_grupo_id,
        cheque_numero, cheque_banco, cheque_agencia, cheque_conta, cheque_titular,
        cheque_data_emissao, cheque_data_bom_para,
        criado_por_id, criado_por_nome, fornecedor_nome, cliente_id, cliente_nome,
        centro_custo_id, centro_custo_nome,
        cartao_id, cartao_parcelas, cartao_estabelecimento, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,NOW(),NOW())
       RETURNING id`,
      [
        input.companyId, input.obraId ?? null, input.obraNome ?? null,
        input.contaId ?? null, input.contaNome ?? null, input.tipo, input.natureza,
        input.valorPrevisto, input.valorRealizado ?? null,
        input.dataCompetencia, input.dataVencimento ?? null, input.dataPagamento ?? null,
        input.status, input.contaBancariaId ?? null, input.formaPagamento ?? null,
        input.descricao ?? null, input.observacoes ?? null,
        input.parcelaNumero ?? null, input.parcelaTotal ?? null, input.parcelaGrupoId ?? null,
        input.chequeNumero ?? null, input.chequeBanco ?? null, input.chequeAgencia ?? null,
        input.chequeConta ?? null, input.chequeTitular ?? null,
        input.chequeDataEmissao ?? null, input.chequeDataBomPara ?? null,
        ctx.user?.id ?? null, ctx.user?.name ?? null,
        input.fornecedorNome?.trim() || null,
        input.clienteId ?? null, input.clienteNome?.trim() || null,
        input.centroCustoId ?? null, input.centroCustoNome?.trim() || null,
        // Rev. 3211 — gancho cartão (só preenchido quando formaPagamento="cartao_credito").
        input.formaPagamento === "cartao_credito" ? (input.cartaoId ?? null) : null,
        input.formaPagamento === "cartao_credito" ? (input.cartaoParcelas ?? null) : null,
        input.formaPagamento === "cartao_credito" ? (input.cartaoEstabelecimento?.trim() || null) : null,
      ]
    );
    const id = rows(res)[0]?.id;
    await createAuditLog({ action: "financial_entry_created", userId: ctx.user?.id, companyId: input.companyId, details: `${input.tipo} R$${input.valorPrevisto} - ${input.descricao ?? ""}` });
    return { id };
  }),

  updateEntryStatus: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    status: z.string(),
    dataPagamento: z.string().optional(),
    valorRealizado: z.number().optional(),
    formaPagamento: z.string().optional(),
    comprovanteUrl: z.string().optional(),
    contaBancariaId: z.number().nullable().optional(),
    juros: z.number().optional(),
    descontos: z.number().optional(),
    outros: z.number().optional(),
    observacoes: z.string().optional(),
    chequeTipo: z.string().optional(),
    chequeNumero: z.string().optional(),
    chequeBanco: z.string().optional(),
    chequeAgencia: z.string().optional(),
    chequeConta: z.string().optional(),
    chequeTitular: z.string().optional(),
    chequeDataEmissao: z.string().optional(),
    chequeDataBomPara: z.string().optional(),
    chequeUrl: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db, 
      // NOTA: dbExecute vincula params por ORDEM DE APARIÇÃO (ignora o número do $N).
      // Por isso os placeholders são sequenciais e o array segue a mesma ordem.
      `UPDATE financial_entries
       SET status=$1, data_pagamento=COALESCE($2, data_pagamento),
           valor_realizado=COALESCE($3, valor_realizado),
           forma_pagamento=COALESCE($4, forma_pagamento),
           comprovante_url=COALESCE($5, comprovante_url),
           conta_bancaria_id=COALESCE($6, conta_bancaria_id),
           juros=COALESCE($7, juros),
           descontos=COALESCE($8, descontos),
           outros=COALESCE($9, outros),
           observacoes=COALESCE($10, observacoes),
           cheque_tipo=COALESCE($11, cheque_tipo),
           cheque_numero=COALESCE($12, cheque_numero),
           cheque_banco=COALESCE($13, cheque_banco),
           cheque_agencia=COALESCE($14, cheque_agencia),
           cheque_conta=COALESCE($15, cheque_conta),
           cheque_titular=COALESCE($16, cheque_titular),
           cheque_data_emissao=COALESCE($17, cheque_data_emissao),
           cheque_data_bom_para=COALESCE($18, cheque_data_bom_para),
           cheque_url=COALESCE($19, cheque_url),
           updated_at=NOW()
       WHERE id=$20 AND company_id=$21`,
      [input.status, input.dataPagamento ?? null, input.valorRealizado ?? null,
       input.formaPagamento ?? null, input.comprovanteUrl ?? null,
       input.contaBancariaId ?? null,
       input.juros ?? null, input.descontos ?? null, input.outros ?? null,
       input.observacoes ?? null, input.chequeTipo ?? null,
       input.chequeNumero ?? null, input.chequeBanco ?? null, input.chequeAgencia ?? null,
       input.chequeConta ?? null, input.chequeTitular ?? null,
       input.chequeDataEmissao ?? null, input.chequeDataBomPara ?? null, input.chequeUrl ?? null,
       input.id, input.companyId]
    );
    await createAuditLog({ action: "financial_entry_status_updated", userId: ctx.user?.id, companyId: input.companyId, details: `Entry ${input.id} → ${input.status}` });
    return { ok: true };
  }),

  // Rev. 2655 — Upload de comprovante/documento da baixa (PDF/Word/imagem)
  uploadComprovante: protectedProcedure.input(z.object({
    fileName: z.string(),
    fileBase64: z.string(),
    contentType: z.string(),
  })).mutation(async ({ input }) => {
    // Rev. 2655 — whitelist de tipos (PDF/Word/imagem estática) + limite de tamanho.
    // Rejeita conteúdo ativo (SVG/HTML) e payloads grandes (DoS).
    const ALLOWED = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
    ]);
    const ct = (input.contentType || "").toLowerCase().split(";")[0].trim();
    if (!ALLOWED.has(ct)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tipo de arquivo não permitido. Use PDF, Word ou imagem (JPG/PNG)." });
    }
    const buf = Buffer.from(input.fileBase64, "base64");
    const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
    if (buf.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio." });
    if (buf.length > MAX_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo excede o limite de 15 MB." });
    const safeName = input.fileName.replace(/[^\w.\-]+/g, "_");
    const key = `financeiro/comprovantes/${Date.now()}-${safeName}`;
    const { url } = await storagePut(key, buf, ct);
    return { url };
  }),

  // Rev. 3216 — Demonstrativos consolidados de pagamento (1 PDF com TODOS os PIX +
  // 1 PDF com TODOS os boletos pagos do mês), por conta+ano+mês. INFORMAÇÃO DE APOIO
  // à conciliação: o extrato só mostra "PIX valor X" sem beneficiário; o usuário
  // consulta esses demonstrativos pra identificar quem recebeu. NÃO concilia nada
  // sozinho e NÃO é comprovante por lançamento.
  getConciliacaoDemonstrativos: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    ano: z.number(),
    mes: z.number().min(1).max(12),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);
    const res = await dbExecute(db,
      `SELECT pix_url AS "pixUrl", pix_nome AS "pixNome",
              boleto_url AS "boletoUrl", boleto_nome AS "boletoNome",
              pix_arquivos_json AS "pixArquivosJson", boleto_arquivos_json AS "boletoArquivosJson",
              pix_extraido_json AS "pixExtraidoJson", pix_lido_em AS "pixLidoEm",
              boleto_extraido_json AS "boletoExtraidoJson", boleto_lido_em AS "boletoLidoEm"
       FROM financial_conciliacao_demonstrativos
       WHERE company_id=$1 AND conta_bancaria_id=$2 AND ano=$3 AND mes=$4`,
      [input.companyId, input.contaBancariaId, input.ano, input.mes]
    );
    const r = (rows(res)[0] as any) ?? {};
    // Rev. 3220 — o JSON extraído fica como TEXT no banco; entrega já parseado p/ o cliente.
    const parse = (v: any) => { if (!v) return null; try { return JSON.parse(v); } catch { return null; } };
    // Rev. 3236 — lista de arquivos por tipo (vários PDFs), com FALLBACK pro modelo antigo
    // de 1 PDF (pix_url/pix_nome) p/ demonstrativos anexados antes desta revisão.
    const parseArr = (v: any, legacyUrl: any, legacyNome: any): { url: string; nome: string | null }[] => {
      let a: any[] = [];
      if (v) { try { const p = JSON.parse(v); if (Array.isArray(p)) a = p; } catch { a = []; } }
      a = a.filter((x: any) => x && x.url).map((x: any) => ({ url: String(x.url), nome: x.nome != null ? String(x.nome) : null }));
      if (a.length === 0 && legacyUrl) a = [{ url: String(legacyUrl), nome: legacyNome != null ? String(legacyNome) : null }];
      return a;
    };
    return {
      pixUrl: r.pixUrl ?? null, pixNome: r.pixNome ?? null,
      boletoUrl: r.boletoUrl ?? null, boletoNome: r.boletoNome ?? null,
      pixArquivos: parseArr(r.pixArquivosJson, r.pixUrl, r.pixNome),
      boletoArquivos: parseArr(r.boletoArquivosJson, r.boletoUrl, r.boletoNome),
      pixExtraido: parse(r.pixExtraidoJson), pixLidoEm: r.pixLidoEm ?? null,
      boletoExtraido: parse(r.boletoExtraidoJson), boletoLidoEm: r.boletoLidoEm ?? null,
    };
  }),

  salvarConciliacaoDemonstrativo: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    ano: z.number(),
    mes: z.number().min(1).max(12),
    tipo: z.enum(["pix", "boleto"]),
    // Rev. 3236 — agora aceita VÁRIOS arquivos de uma vez (append). `url`/`nome` ficam só
    // por retrocompatibilidade (chamada antiga de 1 PDF). Ao menos uma das fontes é exigida.
    url: z.string().min(1).optional(),
    nome: z.string().optional(),
    arquivos: z.array(z.object({ url: z.string().min(1), nome: z.string().optional() })).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);
    // Normaliza a entrada num array de novos arquivos (suporta o formato antigo de 1 PDF).
    const novos = (input.arquivos && input.arquivos.length
      ? input.arquivos
      : (input.url ? [{ url: input.url, nome: input.nome }] : []))
      .filter((x) => x && x.url)
      .map((x) => ({ url: String(x.url), nome: x.nome != null ? String(x.nome) : null }));
    if (novos.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum arquivo informado." });
    // Hardening Rev. 3236 — só aceita anexos do namespace interno `/uploads/<key>` (paridade
    // com `_baixarComprovante`): URL gravável pelo cliente fora disso = anexo inválido/SSRF.
    if (novos.some((x) => !/\/uploads\//.test(x.url)))
      throw new TRPCError({ code: "BAD_REQUEST", message: "Anexo inválido: URL fora do namespace de uploads." });
    // Colunas fixas por tipo (whitelist via enum) — sem interpolação de identificador do usuário.
    const colUrl = input.tipo === "pix" ? "pix_url" : "boleto_url";
    const colNome = input.tipo === "pix" ? "pix_nome" : "boleto_nome";
    const colArr = input.tipo === "pix" ? "pix_arquivos_json" : "boleto_arquivos_json";
    // Rev. 3220 — ao anexar/trocar o PDF, ZERA a leitura por IA anterior daquele tipo
    // (o conteúdo mudou → a extração antiga não vale mais; o cliente relê tudo em seguida).
    const colJson = input.tipo === "pix" ? "pix_extraido_json" : "boleto_extraido_json";
    const colLido = input.tipo === "pix" ? "pix_lido_em" : "boleto_lido_em";
    // APPEND: carrega o que já existe (com fallback do modelo antigo), concatena os novos e
    // deduplica por URL. O 1º arquivo é espelhado nas colunas legadas (compat com leitores antigos).
    const atual = await _carregarDemoArquivos(db, input.companyId, input.contaBancariaId, input.ano, input.mes, input.tipo);
    const seen = new Set<string>();
    const arr = [...atual, ...novos].filter((x) => { if (seen.has(x.url)) return false; seen.add(x.url); return true; });
    const arrJson = JSON.stringify(arr);
    const first = arr[0];
    // dbExecute liga params por ORDEM DE APARIÇÃO ($N é cosmético) → manter ascendente.
    await dbExecute(db,
      `INSERT INTO financial_conciliacao_demonstrativos
         (company_id, conta_bancaria_id, ano, mes, ${colArr}, ${colUrl}, ${colNome}, criado_em, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
       ON CONFLICT (company_id, conta_bancaria_id, ano, mes)
       DO UPDATE SET ${colArr}=EXCLUDED.${colArr}, ${colUrl}=EXCLUDED.${colUrl}, ${colNome}=EXCLUDED.${colNome},
                     ${colJson}=NULL, ${colLido}=NULL, atualizado_em=NOW()`,
      [input.companyId, input.contaBancariaId, input.ano, input.mes, arrJson, first.url, first.nome]
    );
    return { ok: true, total: arr.length };
  }),

  // Rev. 3266 — CONFERÊNCIA da identificação por IA dos demonstrativos. A partir do texto
  // roxo da Conciliação, o usuário abre o diálogo (dados lidos × extrato + PDF) e CONFIRMA
  // ou MARCA COMO ERRADO a leitura. Grava 1 veredicto por LINHA do extrato. NÃO concilia/
  // baixa nada (honra "conciliação só sugestiva"). Tenant + IDOR guard (linha ∈ empresa+conta).
  // ZERO ALTER/DROP/DELETE — só INSERT/UPDATE (upsert por linha; "pendente" = desfazer).
  confirmarDemonstrativo: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    extratoLinhaId: z.number().int(),
    veredicto: z.enum(["confirmado", "errado", "pendente"]),
    demonstrativoId: z.number().int().optional(),
    tipo: z.string().max(12).optional(),
    beneficiario: z.string().max(500).optional(),
    documento: z.string().max(120).optional(),
    txid: z.string().max(200).optional(),
    valor: z.number().optional(),
    dataPagamento: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);
    // IDOR guard — a linha do extrato precisa pertencer à empresa E à conta informadas.
    const lin = await dbExecute(db,
      `SELECT id FROM bank_statement_lines
        WHERE id=$1 AND company_id=$2 AND conta_bancaria_id=$3 AND excluido_em IS NULL`,
      [input.extratoLinhaId, input.companyId, input.contaBancariaId]);
    if (!rows(lin).length) throw new TRPCError({ code: "NOT_FOUND", message: "Linha do extrato não encontrada nesta conta." });
    const dataPg = input.dataPagamento && /^\d{4}-\d{2}-\d{2}/.test(input.dataPagamento) ? input.dataPagamento.slice(0, 10) : null;
    const usuarioNome = (String((ctx.user as any)?.name ?? (ctx.user as any)?.email ?? "").slice(0, 255)) || null;
    const usuarioId = Number((ctx.user as any)?.id) || null;
    // dbExecute liga params por ORDEM DE APARIÇÃO ($N é cosmético) → array na mesma ordem.
    await dbExecute(db,
      `INSERT INTO financial_conciliacao_demo_confirmacoes
         (company_id, conta_bancaria_id, extrato_linha_id, demonstrativo_id, tipo, veredicto,
          beneficiario, documento, txid, valor, data_pagamento, usuario_id, usuario_nome, criado_em, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
       ON CONFLICT (company_id, conta_bancaria_id, extrato_linha_id)
       DO UPDATE SET demonstrativo_id=EXCLUDED.demonstrativo_id, tipo=EXCLUDED.tipo, veredicto=EXCLUDED.veredicto,
                     beneficiario=EXCLUDED.beneficiario, documento=EXCLUDED.documento, txid=EXCLUDED.txid,
                     valor=EXCLUDED.valor, data_pagamento=EXCLUDED.data_pagamento,
                     usuario_id=EXCLUDED.usuario_id, usuario_nome=EXCLUDED.usuario_nome, atualizado_em=NOW()`,
      [input.companyId, input.contaBancariaId, input.extratoLinhaId,
       input.demonstrativoId ?? null, input.tipo ?? null, input.veredicto,
       input.beneficiario ?? null, input.documento ?? null, input.txid ?? null,
       input.valor ?? null, dataPg, usuarioId, usuarioNome]);
    return { ok: true, veredicto: input.veredicto };
  }),

  // Rev. 3236 — remove UM arquivo (por `indice`) da lista do tipo, ou TODOS (sem `indice`).
  // Reescreve o array, espelha o 1º restante nas colunas legadas e ZERA a leitura por IA
  // (o conjunto mudou). Tenant-safe. ZERO ALTER/DROP/DELETE (UPDATE de colunas).
  removerConciliacaoDemonstrativo: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    ano: z.number(),
    mes: z.number().min(1).max(12),
    tipo: z.enum(["pix", "boleto"]),
    indice: z.number().int().min(0).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);
    const colUrl = input.tipo === "pix" ? "pix_url" : "boleto_url";
    const colNome = input.tipo === "pix" ? "pix_nome" : "boleto_nome";
    const colArr = input.tipo === "pix" ? "pix_arquivos_json" : "boleto_arquivos_json";
    const colJson = input.tipo === "pix" ? "pix_extraido_json" : "boleto_extraido_json";
    const colLido = input.tipo === "pix" ? "pix_lido_em" : "boleto_lido_em";
    let arr: { url: string; nome: string | null }[] = [];
    if (input.indice != null) {
      arr = await _carregarDemoArquivos(db, input.companyId, input.contaBancariaId, input.ano, input.mes, input.tipo);
      // Hardening Rev. 3236 — índice fora da faixa = erro explícito (evita "sucesso" sem efeito).
      if (input.indice >= arr.length)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Índice de arquivo inválido." });
      arr.splice(input.indice, 1);
    }
    const arrJson = arr.length ? JSON.stringify(arr) : null;
    const first = arr[0] ?? null;
    // dbExecute liga params por ORDEM DE APARIÇÃO → array na mesma ordem dos placeholders.
    await dbExecute(db,
      `UPDATE financial_conciliacao_demonstrativos
       SET ${colArr}=$1, ${colUrl}=$2, ${colNome}=$3, ${colJson}=NULL, ${colLido}=NULL, atualizado_em=NOW()
       WHERE company_id=$4 AND conta_bancaria_id=$5 AND ano=$6 AND mes=$7`,
      [arrJson, first?.url ?? null, first?.nome ?? null, input.companyId, input.contaBancariaId, input.ano, input.mes]
    );
    return { ok: true, total: arr.length };
  }),

  // Rev. 3236 — LÊ COM IA UM arquivo (por `indice`) da lista do tipo e devolve seus itens —
  // SEM gravar nada (o cliente chama em loop p/ ter PROGRESSO REAL 0→100% e depois salva a
  // lista combinada via salvarDemonstrativoExtraido). A URL vem SEMPRE do banco (nunca do
  // cliente) → sem SSRF/IDOR; _baixarComprovante só resolve /uploads internos. Gateado pelo IA.
  lerDemonstrativoArquivoIA: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    ano: z.number(),
    mes: z.number().min(1).max(12),
    tipo: z.enum(["pix", "boleto"]),
    indice: z.number().int().min(0),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);
    await assertAiModuleEnabled(input.companyId, "financeiro");
    const arr = await _carregarDemoArquivos(db, input.companyId, input.contaBancariaId, input.ano, input.mes, input.tipo);
    const url = arr[input.indice]?.url;
    if (!url) throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado para leitura." });
    const bin = await _baixarComprovante(url);
    if (!bin) throw new TRPCError({ code: "BAD_REQUEST", message: "Não consegui acessar o PDF anexado para leitura." });
    const itens = await _lerDemonstrativoIA(bin.base64, bin.contentType);
    return { itens, indice: input.indice, count: itens.length };
  }),

  // Rev. 3236 — PERSISTE a lista combinada de pagamentos lida dos VÁRIOS PDFs do tipo
  // (o cliente acumula os itens do loop de lerDemonstrativoArquivoIA). RE-SANITIZA cada
  // item no servidor (defesa em profundidade: o cliente não é fonte confiável). ZERO ALTER/DROP.
  salvarDemonstrativoExtraido: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    ano: z.number(),
    mes: z.number().min(1).max(12),
    tipo: z.enum(["pix", "boleto"]),
    itens: z.array(z.any()),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);
    const clean = input.itens
      .map((it) => _sanitizeComprovante(it))
      .filter((it) => it.beneficiario || it.valor != null || it.documento || it.txid);
    const colJson = input.tipo === "pix" ? "pix_extraido_json" : "boleto_extraido_json";
    const colLido = input.tipo === "pix" ? "pix_lido_em" : "boleto_lido_em";
    // dbExecute liga params por ORDEM DE APARIÇÃO → o JSON ($1) vem PRIMEIRO no array.
    await dbExecute(db,
      `UPDATE financial_conciliacao_demonstrativos
       SET ${colJson}=$1, ${colLido}=NOW(), atualizado_em=NOW()
       WHERE company_id=$2 AND conta_bancaria_id=$3 AND ano=$4 AND mes=$5`,
      [JSON.stringify(clean), input.companyId, input.contaBancariaId, input.ano, input.mes]);
    return { ok: true, count: clean.length };
  }),

  // Rev. 3220 — LÊ COM IA o demonstrativo consolidado JÁ ANEXADO (PIX ou Boletos) daquela
  // conta+mês: baixa o PDF interno (/uploads → uploaded_files; NUNCA fetch de URL arbitrária),
  // roda o Gemini Vision e devolve a LISTA de TODOS os pagamentos (beneficiário, CPF/CNPJ,
  // valor, data, txid). Persiste o JSON extraído (coluna ADITIVA) p/ não reprocessar à toa.
  // Gateado pelo toggle de IA "financeiro". ZERO ALTER/DROP/DELETE.
  lerDemonstrativoComIA: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    ano: z.number(),
    mes: z.number().min(1).max(12),
    tipo: z.enum(["pix", "boleto"]),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);
    await assertAiModuleEnabled(input.companyId, "financeiro");
    const colUrl = input.tipo === "pix" ? "pix_url" : "boleto_url";
    const urlRes = await dbExecute(db,
      `SELECT ${colUrl} AS url FROM financial_conciliacao_demonstrativos
       WHERE company_id=$1 AND conta_bancaria_id=$2 AND ano=$3 AND mes=$4`,
      [input.companyId, input.contaBancariaId, input.ano, input.mes]);
    const url = (rows(urlRes)[0] as any)?.url as string | undefined;
    if (!url) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum PDF anexado para ler. Anexe o demonstrativo primeiro." });
    const bin = await _baixarComprovante(url);
    if (!bin) throw new TRPCError({ code: "BAD_REQUEST", message: "Não consegui acessar o PDF anexado para leitura." });
    const itens = await _lerDemonstrativoIA(bin.base64, bin.contentType);
    // Persiste a extração (coluna ADITIVA) — idempotente; sobrescreve a leitura anterior.
    const colJson = input.tipo === "pix" ? "pix_extraido_json" : "boleto_extraido_json";
    const colLido = input.tipo === "pix" ? "pix_lido_em" : "boleto_lido_em";
    // Persistência OBRIGATÓRIA: se o UPDATE falhar (ex.: coluna ausente) NÃO mascaramos
    // o erro — caso contrário a UI mostraria "lido em N", mas após um refresh a leitura
    // sumiria (getConciliacaoDemonstrativos lê do banco). Deixe o erro propagar.
    // ATENÇÃO: `dbExecute` liga params pela ORDEM DE APARIÇÃO do placeholder no texto
    // (ignora o número $N). Por isso o JSON ($1) vem PRIMEIRO no SET e no array.
    await dbExecute(db,
      `UPDATE financial_conciliacao_demonstrativos
       SET ${colJson}=$1, ${colLido}=NOW(), atualizado_em=NOW()
       WHERE company_id=$2 AND conta_bancaria_id=$3 AND ano=$4 AND mes=$5`,
      [JSON.stringify(itens), input.companyId, input.contaBancariaId, input.ano, input.mes]);
    const total = itens.reduce((s, it) => s + (it.valor ?? 0), 0);
    return { itens, total, count: itens.length };
  }),

  // Rev. 1621 — Detalhe completo de um título (Contas a Pagar drill-down)
  // Retorna entry + ordem de compra + itens + fornecedor + parcelas + auditoria
  getEntryDetalhe: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Rev. 3177 — tenant guard (anti-IDOR): só filtrava por company_id, sem checar
    // se o CHAMADOR tem acesso à empresa. Fecha a brecha agora que o detalhe é
    // consumido também pela Conciliação Bancária.
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    // 1) Entry principal (todos os campos)
    const entryRes = await dbExecute(db,
      `SELECT id, "company_id" AS "companyId", obra_id AS "obraId", obra_nome AS "obraNome",
              conta_id AS "contaId", conta_nome AS "contaNome",
              tipo, natureza,
              valor_previsto AS "valorPrevisto", valor_realizado AS "valorRealizado",
              data_competencia AS "dataCompetencia", data_vencimento AS "dataVencimento",
              data_pagamento AS "dataPagamento",
              status, conta_bancaria_id AS "contaBancariaId",
              origem_modulo AS "origemModulo", origem_id AS "origemId", origem_descricao AS "origemDescricao",
              parcela_numero AS "parcelaNumero", parcela_total AS "parcelaTotal",
              parcela_grupo_id AS "parcelaGrupoId",
              forma_pagamento AS "formaPagamento", comprovante_url AS "comprovanteUrl",
              codigo_barras AS "codigoBarras",
              cheque_numero AS "chequeNumero", cheque_banco AS "chequeBanco", cheque_data_bom_para AS "chequeDataBomPara",
              conciliado, data_conciliacao AS "dataConciliacao", extrato_banco_descricao AS "extratoBancoDescricao",
              conciliado_em AS "conciliadoEm", conciliado_por_id AS "conciliadoPorId", conciliado_por_nome AS "conciliadoPorNome",
              descricao, observacoes, motivo_cancelamento AS "motivoCancelamento",
              criado_por_id AS "criadoPorId", criado_por_nome AS "criadoPorNome",
              aprovado_por_id AS "aprovadoPorId", aprovado_por_nome AS "aprovadoPorNome",
              vehicle_id AS "vehicleId",
              fornecedor_nome AS "fornecedorNome",
              anexo_url AS "anexoUrl", anexo_nome AS "anexoNome",
              editado_por_id AS "editadoPorId", editado_por_nome AS "editadoPorNome", editado_em AS "editadoEm",
              created_at AS "createdAt", updated_at AS "updatedAt",
              CASE WHEN data_vencimento < CURRENT_DATE AND status != 'pago' THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
       FROM financial_entries
       WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    const entry = (rows(entryRes) as any[])[0];
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });

    let ordem: any = null;
    let itens: any[] = [];
    let fornecedor: any = null;
    let parcelas: any[] = [];
    let bancoEmpresa: any = null;

    // Rev. 1628 — origemDetalhes genérico para módulos não-Compras (cronograma, folha,
    // pj, frota, parceiro, beneficio, almoxarifado, medição, seguro, etc.). Retorna
    // {tipo, titulo, subtitulo?, campos: [{label, value}], link?} para o client renderizar.
    let origemDetalhes: any = null;

    // 2) Se vier de Compras → busca OC, itens, fornecedor
    if ((entry.origemModulo === "compras" || entry.origemModulo === "compra_oc") && entry.origemId) {
      const ordRes = await dbExecute(db,
        `SELECT id, numero_oc AS "numeroOc", fornecedor_id AS "fornecedorId", fornecedor_nome AS "fornecedorNome",
                obra_id AS "obraId", data_entrega_prevista AS "dataEntregaPrevista", data_vencimento AS "dataVencimento",
                tipo_pagamento AS "tipoPagamento", forma_pagamento AS "formaPagamento", numero_parcelas AS "numeroParcelas",
                condicao_pagamento AS "condicaoPagamento", numero_nf AS "numeroNf",
                subtotal, frete, frete_tipo AS "freteTipo", outras_despesas AS "outrasDespesas",
                impostos, desconto, total,
                status, aprovacao_status AS "aprovacaoStatus",
                aprovador_nome AS "aprovadorNome", aprovado_em AS "aprovadoEm",
                observacoes, anexos, pdf_url AS "pdfUrl",
                criado_por_nome AS "criadoPorNome", created_at AS "createdAt"
         FROM compras_ordens
         WHERE id=$1 AND company_id=$2`,
        [entry.origemId, input.companyId]
      );
      ordem = (rows(ordRes) as any[])[0] ?? null;

      if (ordem) {
        const itRes = await dbExecute(db,
          `SELECT id, insumo_codigo AS "insumoCodigo", descricao, unidade,
                  quantidade, quantidade_entregue AS "quantidadeEntregue",
                  preco_unitario AS "precoUnitario", total
           FROM compras_ordens_itens WHERE ordem_id=$1 ORDER BY id`,
          [ordem.id]
        );
        itens = rows(itRes) as any[];

        if (ordem.fornecedorId) {
          const fRes = await dbExecute(db,
            `SELECT id, cnpj, razao_social AS "razaoSocial", nome_fantasia AS "nomeFantasia",
                    telefone, email, contato_nome AS "contatoNome", contato_celular AS "contatoCelular",
                    banco, agencia, conta, pix, cidade, estado
             FROM fornecedores WHERE id=$1 AND company_id=$2`,
            [ordem.fornecedorId, input.companyId]
          );
          fornecedor = (rows(fRes) as any[])[0] ?? null;
        }
      }
    }

    // 2.5) Origens não-Compras → origemDetalhes genérico
    if (!ordem && entry.origemModulo && entry.origemId) {
      const om = entry.origemModulo;
      try {
        if (om === "cronograma_atividade") {
          const r = await dbExecute(db,
            `SELECT pa.eap_codigo AS "eapCodigo", pa.nome, pa.data_inicio AS "dataInicio",
                    pa.data_fim AS "dataFim", pa.duracao_dias AS "duracaoDias",
                    pa.peso_financeiro AS "pesoFinanceiro", pa.quantidade_planejada AS "quantidadePlanejada",
                    pa.unidade, pa.recurso_principal AS "recursoPrincipal", pa.is_indireta AS "isIndireta",
                    pa.projeto_id AS "projetoId", pp.nome AS "projetoNome", pp.cliente,
                    pp.valor_contrato AS "valorContrato"
             FROM planejamento_atividades pa
             LEFT JOIN planejamento_projetos pp ON pp.id = pa.projeto_id
             WHERE pa.id = $1 AND pp.company_id = $2`, [entry.origemId, input.companyId]);
          const a = (rows(r) as any[])[0];
          if (a) {
            origemDetalhes = {
              tipo: "cronograma",
              titulo: `Atividade ${a.eapCodigo ?? ""} — ${a.nome}`.trim(),
              subtitulo: a.projetoNome ? `📊 Projeto: ${a.projetoNome}${a.cliente ? ` · ${a.cliente}` : ""}` : null,
              campos: [
                { label: "EAP", value: a.eapCodigo ?? "—" },
                { label: "Início", value: a.dataInicio, kind: "date" },
                { label: "Fim", value: a.dataFim, kind: "date" },
                { label: "Duração (dias)", value: a.duracaoDias ?? "—" },
                { label: "Peso Financeiro", value: a.pesoFinanceiro != null ? `${Number(a.pesoFinanceiro).toFixed(4)}%` : "—" },
                { label: "Quantidade Planejada", value: a.quantidadePlanejada != null ? `${Number(a.quantidadePlanejada).toLocaleString("pt-BR")} ${a.unidade ?? ""}`.trim() : "—" },
                { label: "Recurso", value: a.recursoPrincipal ?? "—" },
                { label: "Tipo", value: a.isIndireta ? "Indireta" : "Direta" },
              ],
            };
          }
        } else if (om === "beneficio_vr" || om === "beneficio_va") {
          const r = await dbExecute(db,
            `SELECT vb."employeeId", vb."mesReferencia", vb."valorDiario", vb."diasUteis",
                    vb."valorTotal", vb.operadora, vb."valorVa", vb.status, vb."diasFerias",
                    vb."cidadeObra", e."nomeCompleto" AS employee_nome, e.matricula
             FROM vr_benefits vb
             LEFT JOIN employees e ON e.id = vb."employeeId"
             WHERE vb.id = $1 AND vb."companyId" = $2`, [entry.origemId, input.companyId]);
          const b = (rows(r) as any[])[0];
          if (b) {
            const isVa = om === "beneficio_va";
            origemDetalhes = {
              tipo: om,
              titulo: `${isVa ? "Vale Alimentação" : "Vale Refeição"} — ${b.employee_nome ?? "Funcionário " + b.employeeId}`,
              subtitulo: b.matricula ? `Matrícula: ${b.matricula}` : null,
              campos: [
                { label: "Competência", value: b.mesReferencia ?? "—" },
                { label: "Operadora", value: b.operadora ?? "—" },
                { label: "Valor Diário", value: b.valorDiario != null ? `R$ ${Number(b.valorDiario).toFixed(2)}` : "—" },
                { label: "Dias Úteis", value: b.diasUteis ?? "—" },
                { label: "Dias Férias", value: b.diasFerias ?? 0 },
                { label: "Valor Total", value: b.valorTotal != null ? `R$ ${Number(b.valorTotal).toFixed(2)}` : "—" },
                { label: "Cidade Obra", value: b.cidadeObra ?? "—" },
                { label: "Status", value: b.status ?? "—" },
              ],
            };
          }
        } else if (om === "frota_abastecimento" || om === "frota_manutencao") {
          // origemId pode apontar para registro de abastecimento/manutenção; vehicleId já vem do entry
          const vid = entry.vehicleId;
          if (vid) {
            const r = await dbExecute(db,
              `SELECT placa, modelo, marca, "anoFabricacao", cor, "tipoVeiculo",
                      "statusVeiculo", responsavel, km_atual, obra_id AS "obraId"
               FROM vehicles WHERE id=$1 AND "companyId"=$2`, [vid, input.companyId]);
            const v = (rows(r) as any[])[0];
            if (v) {
              origemDetalhes = {
                tipo: om,
                titulo: `${om === "frota_manutencao" ? "Manutenção" : "Abastecimento"} — ${v.placa ?? ""} ${v.modelo ?? ""}`.trim(),
                subtitulo: `${v.marca ?? ""} ${v.modelo ?? ""} ${v.anoFabricacao ?? ""}`.trim(),
                campos: [
                  { label: "Placa", value: v.placa ?? "—" },
                  { label: "Tipo", value: v.tipoVeiculo ?? "—" },
                  { label: "Cor", value: v.cor ?? "—" },
                  { label: "Status", value: v.statusVeiculo ?? "—" },
                  { label: "Responsável", value: v.responsavel ?? "—" },
                  { label: "KM Atual", value: v.km_atual != null ? Number(v.km_atual).toLocaleString("pt-BR") : "—" },
                ],
              };
            }
          }
        } else if (om === "pagamento_pj") {
          const r = await dbExecute(db,
            `SELECT pp.tipo, pp."mesReferencia", pp.valor, pp.descricao, pp.status,
                    pp."dataPagamento", pp.data_prevista AS "dataPrevista", pp.observacoes,
                    pc.id AS contract_id, pc."numeroContrato", pc."razaoSocialPrestador",
                    pc."cnpjPrestador", pc."valorMensal", pc."dataInicio", pc."dataFim",
                    e."nomeCompleto" AS employee_nome
             FROM pj_payments pp
             LEFT JOIN pj_contracts pc ON pc.id = pp."contractId"
             LEFT JOIN employees e ON e.id = pp."employeeId"
             WHERE pp.id = $1 AND pp."companyId" = $2`, [entry.origemId, input.companyId]);
          const p = (rows(r) as any[])[0];
          if (p) {
            origemDetalhes = {
              tipo: "pj",
              titulo: `Pagamento PJ (${p.tipo ?? "—"}) — ${p.employee_nome ?? p.razaoSocialPrestador ?? "—"}`,
              subtitulo: p.numeroContrato ? `Contrato ${p.numeroContrato}${p.cnpjPrestador ? ` · CNPJ ${p.cnpjPrestador}` : ""}` : null,
              campos: [
                { label: "Competência", value: p.mesReferencia ?? "—" },
                { label: "Tipo", value: p.tipo ?? "—" },
                { label: "Valor", value: p.valor != null ? `R$ ${Number(p.valor).toFixed(2)}` : "—" },
                { label: "Status", value: p.status ?? "—" },
                { label: "Data Prevista", value: p.dataPrevista, kind: "date" },
                { label: "Data Pagamento", value: p.dataPagamento, kind: "date" },
                { label: "Razão Social", value: p.razaoSocialPrestador ?? "—" },
                { label: "Contrato Vigência", value: p.dataInicio && p.dataFim ? `${String(p.dataInicio).slice(0,10)} a ${String(p.dataFim).slice(0,10)}` : "—" },
                ...(p.descricao ? [{ label: "Descrição", value: p.descricao }] : []),
              ],
            };
          }
        } else if (om === "parceiro_lancamento") {
          const r = await dbExecute(db,
            `SELECT lp."employeeId", lp.employee_nome, lp.data_compra AS "dataCompra",
                    lp.descricao_itens AS "descricaoItens", lp.valor, lp.status,
                    lp.competencia_desconto AS "competenciaDesconto",
                    lp.aprovado_por AS "aprovadoPor", lp.aprovado_em AS "aprovadoEm",
                    pc.razao_social AS parceiro_razao, pc.nome_fantasia AS parceiro_fantasia
             FROM lancamentos_parceiros lp
             LEFT JOIN parceiros_conveniados pc ON pc.id = lp."parceiroId"
             WHERE lp.id = $1 AND lp."companyId" = $2`, [entry.origemId, input.companyId]);
          const l = (rows(r) as any[])[0];
          if (l) {
            origemDetalhes = {
              tipo: "parceiro",
              titulo: `Parceiro Conveniado — ${l.parceiro_fantasia ?? l.parceiro_razao ?? "—"}`,
              subtitulo: `Funcionário: ${l.employee_nome}`,
              campos: [
                { label: "Data Compra", value: l.dataCompra, kind: "date" },
                { label: "Valor", value: l.valor != null ? `R$ ${Number(l.valor).toFixed(2)}` : "—" },
                { label: "Status", value: l.status ?? "—" },
                { label: "Competência Desconto", value: l.competenciaDesconto ?? "—" },
                { label: "Aprovado Por", value: l.aprovadoPor ?? "—" },
                ...(l.descricaoItens ? [{ label: "Descrição", value: l.descricaoItens }] : []),
              ],
            };
          }
        } else if (om === "almoxarifado_saida") {
          const r = await dbExecute(db,
            `SELECT item_nome AS "itemNome", unidade, quantidade, funcionario_nome AS "funcionarioNome",
                    funcionario_codigo AS "funcionarioCodigo", obra_nome AS "obraNome",
                    motivo, almoxarife_nome AS "almoxarifeNome", created_at AS "createdAt"
             FROM almoxarifado_saidas_insumo WHERE id=$1 AND company_id=$2`,
            [entry.origemId, input.companyId]);
          const s = (rows(r) as any[])[0];
          if (s) {
            origemDetalhes = {
              tipo: "almoxarifado",
              titulo: `Saída de Almoxarifado — ${s.itemNome}`,
              subtitulo: s.obraNome ? `📍 ${s.obraNome}` : null,
              campos: [
                { label: "Item", value: s.itemNome },
                { label: "Quantidade", value: `${Number(s.quantidade).toLocaleString("pt-BR")} ${s.unidade ?? ""}`.trim() },
                { label: "Funcionário", value: `${s.funcionarioNome ?? "—"}${s.funcionarioCodigo ? ` (${s.funcionarioCodigo})` : ""}` },
                { label: "Almoxarife", value: s.almoxarifeNome ?? "—" },
                ...(s.motivo ? [{ label: "Motivo", value: s.motivo }] : []),
              ],
            };
          }
        } else if (om === "planejamento_medicao") {
          const r = await dbExecute(db,
            `SELECT pm.numero, pm.competencia, pm.valor_previsto AS "valorPrevisto",
                    pm.valor_medido AS "valorMedido", pm.percentual_previsto AS "percentualPrevisto",
                    pm.percentual_medido AS "percentualMedido", pm.status,
                    pp.nome AS projeto_nome, pp.cliente
             FROM planejamento_medicoes pm
             LEFT JOIN planejamento_projetos pp ON pp.id = pm.projeto_id
             WHERE pm.id = $1 AND pm.company_id = $2`, [entry.origemId, input.companyId]);
          const m = (rows(r) as any[])[0];
          if (m) {
            origemDetalhes = {
              tipo: "medicao",
              titulo: `Medição #${m.numero} — ${m.competencia}`,
              subtitulo: m.projeto_nome ? `📊 ${m.projeto_nome}${m.cliente ? ` · ${m.cliente}` : ""}` : null,
              campos: [
                { label: "Número", value: m.numero ?? "—" },
                { label: "Competência", value: m.competencia ?? "—" },
                { label: "Status", value: m.status ?? "—" },
                { label: "Valor Previsto", value: m.valorPrevisto != null ? `R$ ${Number(m.valorPrevisto).toFixed(2)}` : "—" },
                { label: "Valor Medido", value: m.valorMedido != null ? `R$ ${Number(m.valorMedido).toFixed(2)}` : "—" },
                { label: "% Previsto", value: m.percentualPrevisto != null ? `${Number(m.percentualPrevisto).toFixed(2)}%` : "—" },
                { label: "% Medido", value: m.percentualMedido != null ? `${Number(m.percentualMedido).toFixed(2)}%` : "—" },
              ],
            };
          }
        } else if (om === "medicao_obra") {
          const r = await dbExecute(db,
            `SELECT tm.numero, tm.periodo, tm.data_referencia AS "dataReferencia",
                    tm.valor_medido AS "valorMedido", tm.valor_acumulado AS "valorAcumulado",
                    tm.percentual_global AS "percentualGlobal", tm.status,
                    et.razao_social AS empresa_terceira, et.cnpj
             FROM terceiro_medicoes tm
             LEFT JOIN empresas_terceiras et ON et.id = tm.empresa_terceira_id
             WHERE tm.id = $1 AND tm.company_id = $2`, [entry.origemId, input.companyId]);
          const m = (rows(r) as any[])[0];
          if (m) {
            origemDetalhes = {
              tipo: "medicao_terceiro",
              titulo: `Medição Terceiro #${m.numero} — ${m.periodo}`,
              subtitulo: m.empresa_terceira ? `${m.empresa_terceira}${m.cnpj ? ` · CNPJ ${m.cnpj}` : ""}` : null,
              campos: [
                { label: "Período", value: m.periodo ?? "—" },
                { label: "Data Ref.", value: m.dataReferencia, kind: "date" },
                { label: "Status", value: m.status ?? "—" },
                { label: "Valor Medido", value: m.valorMedido != null ? `R$ ${Number(m.valorMedido).toFixed(2)}` : "—" },
                { label: "Valor Acumulado", value: m.valorAcumulado != null ? `R$ ${Number(m.valorAcumulado).toFixed(2)}` : "—" },
                { label: "% Global", value: m.percentualGlobal != null ? `${Number(m.percentualGlobal).toFixed(2)}%` : "—" },
              ],
            };
          }
        } else if (
          om === "folha_projetada" ||
          om === "encargos_projetado" ||
          om === "beneficio_vr_projetado" ||
          om === "beneficio_va_projetado" ||
          om === "decimo_terceiro_projetado"
        ) {
          // Rev. 1634 — Memorial de cálculo das projeções de Folha/Benefícios/13º
          // Mostra lista COMPLETA de funcionários CLT ativos com salário base e
          // a parcela individual deste lançamento (rateio proporcional).
          // OBS: dbExecute renumera placeholders pela ordem de aparição, então
          // a constante 220h é inlinada no SQL e usamos apenas $1 (companyId).
          const ENCARGOS_PCT = 0.338;

          // Rev. 1636 — Folha mensal regular agora é só Ativo (Férias e Aviso saíram
          // para rubricas próprias `ferias_projetada` / `rescisao_projetada`). Mantém
          // exclusão de soft-deleted e registros de teste sem matrícula. Retorna
          // codigoInterno para exibir como "Código" (substitui matrícula eSocial COL...).
          const funcRes = await dbExecute(db,
            `SELECT id, "nomeCompleto" AS nome,
                    "codigoInterno" AS codigo,
                    matricula, cargo, "tipoContrato",
                    "tipoRemuneracao", "salarioBase", "valorHora",
                    "recebeComplemento", "valorComplemento", "status",
                    "dataAdmissao",
                    CASE
                      WHEN LOWER(COALESCE("tipoRemuneracao",'horista')) = 'mensalista'
                        THEN COALESCE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE("salarioBase"::text,'0'),'.',''),',','.'),'[^0-9.\\-]','','g')::numeric, 0)
                      ELSE COALESCE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE("valorHora"::text,'0'),'.',''),',','.'),'[^0-9.\\-]','','g')::numeric, 0) * 220
                    END
                    + CASE WHEN "recebeComplemento" = 1
                        THEN COALESCE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE("valorComplemento"::text,'0'),'.',''),',','.'),'[^0-9.\\-]','','g')::numeric, 0)
                        ELSE 0 END AS bruto_calc
             FROM employees
             WHERE "companyId" = $1
               AND "deletedAt" IS NULL
               AND "status" = 'Ativo'
               AND ("tipoContrato" IS NULL OR "tipoContrato" <> 'PJ')
               AND COALESCE(NULLIF(TRIM("matricula"), ''), NULLIF(TRIM("codigoInterno"), '')) IS NOT NULL
               AND UPPER("nomeCompleto") NOT LIKE '%TESTE%'
             ORDER BY "nomeCompleto" ASC`,
            [input.companyId]
          );
          const employees = (rows(funcRes) as any[]).map(r => ({
            ...r,
            bruto: Number(r.bruto_calc ?? 0),
          }));
          const totalBruto = employees.reduce((s, e) => s + e.bruto, 0);
          const valorEntry = Number(entry.valorPrevisto || 0);

          // Calcula parcela individual de cada funcionário neste lançamento
          const funcionarios = employees.map(emp => {
            const share = totalBruto > 0 ? emp.bruto / totalBruto : 0;
            const parcela = valorEntry * share;
            return {
              id: emp.id,
              nome: emp.nome,
              codigo: emp.codigo || emp.matricula || "—",
              matricula: emp.matricula ?? "—",
              cargo: emp.cargo ?? "—",
              tipoRemuneracao: emp.tipoRemuneracao ?? "horista",
              status: emp.status,
              obraAtual: "—",
              dataAdmissao: emp.dataAdmissao,
              salarioBruto: emp.bruto,
              parcelaLancamento: parcela,
              percentual: share * 100,
            };
          });

          let titulo = "Memorial de Cálculo da Projeção";
          let formula = "";
          if (om === "folha_projetada") {
            titulo = `Folha CLT — ${employees.length} funcionário(s)`;
            formula = `Soma dos salários brutos dos ${employees.length} CLT ativos (mensalista = salário base, horista = valor/h × 220h, + complemento se houver).`;
          } else if (om === "encargos_projetado") {
            titulo = `Encargos sobre Folha — ${employees.length} funcionário(s)`;
            formula = `Folha bruta R$ ${totalBruto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} × ${(ENCARGOS_PCT * 100).toFixed(1)}% (FGTS 8% + INSS pat. 20% + RAT/Terc. ~5,8%) = R$ ${(totalBruto * ENCARGOS_PCT).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`;
          } else if (om === "beneficio_vr_projetado") {
            titulo = `Vale Refeição — ${employees.length} funcionário(s)`;
            formula = `${employees.length} funcionário(s) × valor médio diário (café+lanche+janta) × dias úteis configurados em meal_benefit_configs.`;
          } else if (om === "beneficio_va_projetado") {
            titulo = `Vale Alimentação — ${employees.length} funcionário(s)`;
            formula = `${employees.length} funcionário(s) × valor mensal médio do cartão VA configurado em meal_benefit_configs.`;
          } else if (om === "decimo_terceiro_projetado") {
            titulo = `13º Salário — ${employees.length} funcionário(s)`;
            formula = `${entry.descricao?.includes("1ª") ? "1ª parcela: 50% do salário bruto (Lei 4.090/62 — pagar até 30/11)" : entry.descricao?.includes("2ª") ? "2ª parcela: 50% do bruto líquido de INSS (~8%, pagar até 20/12)" : "Encargos sobre 13º (FGTS + INSS pat. + RAT/Terc. sobre o bruto integral)"}.`;
          }

          origemDetalhes = {
            tipo: om,
            titulo,
            subtitulo: `📅 Competência ${entry.dataCompetencia ? String(entry.dataCompetencia).slice(0,10).split("-").reverse().join("/") : "—"} · Vencimento ${entry.dataVencimento ? String(entry.dataVencimento).slice(0,10).split("-").reverse().join("/") : "—"}`,
            formula,
            campos: [
              { label: "Funcionários considerados", value: employees.length },
              { label: "Folha bruta total", value: `R$ ${totalBruto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
              { label: "Valor deste lançamento", value: `R$ ${valorEntry.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
              { label: "Origem", value: entry.origemDescricao ?? "—" },
            ],
            funcionarios,
          };
        } else if (om === "pj_projetado") {
          // Rev. 1634 — Memorial PJ: contrato ativo + lista comparativa de PJs ativos
          const contractId = entry.origemId ? Math.floor(Number(entry.origemId) / 1000) : null;
          let pjAtual: any = null;
          if (contractId && contractId > 0) {
            const r = await dbExecute(db,
              `SELECT pc.id, pc."razaoSocialPrestador" AS razao, pc."cnpjPrestador" AS cnpj,
                      pc."valorMensal", pc."diaFechamento", pc."dataInicio", pc."dataFim", pc.status,
                      e."nomeCompleto" AS funcionario_nome, e.matricula AS funcionario_matricula,
                      e.cargo AS funcionario_cargo
               FROM pj_contracts pc
               LEFT JOIN employees e ON e.id = pc."employeeId"
               WHERE pc.id=$1 AND pc."companyId"=$2`,
              [contractId, input.companyId]);
            pjAtual = (rows(r) as any[])[0] ?? null;
          }
          const allRes = await dbExecute(db,
            `SELECT pc.id,
                    COALESCE(NULLIF(TRIM(e."nomeCompleto"), ''),
                             NULLIF(TRIM(pc."razaoSocialPrestador"), ''),
                             'Prestador PJ #' || pc.id) AS nome,
                    COALESCE(NULLIF(TRIM(pc."cnpjPrestador"), ''), '—') AS cnpj,
                    COALESCE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE(pc."valorMensal"::text,'0'),'.',''),',','.'),'[^0-9.\\-]','','g')::numeric, 0) AS valor,
                    pc.status, pc."dataInicio", pc."dataFim"
             FROM pj_contracts pc
             LEFT JOIN employees e ON e.id = pc."employeeId"
             WHERE pc."companyId"=$1 AND pc.status IN ('ativo','vigente','assinado')
             ORDER BY 2 ASC`,
            [input.companyId]);
          const pjs = (rows(allRes) as any[]).map(r => ({
            id: r.id, nome: r.nome, cnpj: r.cnpj,
            valor: Number(r.valor ?? 0), status: r.status,
            destacado: pjAtual && r.id === pjAtual.id,
          }));
          const nomePJ = pjAtual?.funcionario_nome || pjAtual?.razao || (pjAtual ? `Prestador PJ #${pjAtual.id}` : "Pagamento PJ Projetado");
          origemDetalhes = {
            tipo: om,
            titulo: pjAtual ? `Contrato PJ — ${nomePJ}` : `Pagamento PJ Projetado`,
            subtitulo: pjAtual ? [
              pjAtual.cnpj ? `CNPJ ${pjAtual.cnpj}` : null,
              pjAtual.funcionario_matricula ? `Matr. ${pjAtual.funcionario_matricula}` : null,
              pjAtual.dataInicio && pjAtual.dataFim ? `Vigência ${String(pjAtual.dataInicio).slice(0,10).split("-").reverse().join("/")} a ${String(pjAtual.dataFim).slice(0,10).split("-").reverse().join("/")}` : null,
            ].filter(Boolean).join(" · ") : null,
            formula: `Valor mensal contratado para o prestador, projetado para o vencimento configurado (dia ${pjAtual?.diaFechamento ?? 5} de cada mês, recuando para dia útil anterior).`,
            campos: pjAtual ? [
              { label: "Funcionário Vinculado", value: pjAtual.funcionario_nome ?? "—" },
              { label: "Matrícula", value: pjAtual.funcionario_matricula ?? "—" },
              { label: "Cargo", value: pjAtual.funcionario_cargo ?? "—" },
              { label: "Razão Social", value: pjAtual.razao || "—" },
              { label: "CNPJ", value: pjAtual.cnpj || "—" },
              { label: "Valor Mensal", value: `R$ ${Number(pjAtual.valorMensal ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
              { label: "Dia Fechamento", value: pjAtual.diaFechamento ?? 5 },
              { label: "Status Contrato", value: pjAtual.status ?? "—" },
            ] : [
              { label: "Origem", value: entry.origemDescricao ?? "—" },
            ],
            pjs,
          };
        } else if (om === "ferias_projetada") {
          // Rev. 1636 — Memorial de Férias projetadas (CLT 145).
          const vpId = Number(entry.origemId ?? 0);
          const r = await dbExecute(db,
            `SELECT vp.id, vp."employeeId" AS emp_id,
                    vp."dataInicio" AS d_ini, vp."dataFim" AS d_fim,
                    vp."dataPagamento" AS d_pgto,
                    COALESCE(vp."diasGozo", 30) AS dias_gozo,
                    vp.status, vp."abonoPecuniario",
                    vp."valorFerias", vp."valorTercoConstitucional",
                    vp."valorAbono", vp."valorTotal",
                    vp."periodoAquisitivoInicio" AS p_aq_ini,
                    vp."periodoAquisitivoFim" AS p_aq_fim,
                    vp."periodoConcessivoFim" AS p_conc_fim,
                    e."nomeCompleto" AS func_nome,
                    COALESCE(NULLIF(TRIM(e."codigoInterno"),''), NULLIF(TRIM(e.matricula),''), '—') AS func_codigo,
                    COALESCE(NULLIF(TRIM(e.cargo),''), '—') AS cargo,
                    e."dataAdmissao" AS d_adm, e.status AS func_status
               FROM vacation_periods vp
               LEFT JOIN employees e ON e.id = vp."employeeId"
              WHERE vp.id = $1 AND vp."companyId" = $2`,
            [vpId, input.companyId]);
          const f = (rows(r) as any[])[0];
          if (f) {
            const fmtBR = (s: any) => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—";
            const fmtMoney = (v: any) => `R$ ${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
            const valorEntry = Number(entry.valorPrevisto ?? 0);
            // Rev. 1636 — quando vp."dataPagamento" é NULL, o bridge usa
            // entry.dataVencimento (= início − 2 dias corridos, CLT 145).
            // Memorial deve refletir a MESMA data exibida no Contas a Pagar.
            const pgtoEfetivo: string | null = f.d_pgto
              ? String(f.d_pgto).slice(0, 10)
              : (entry.dataVencimento ? String(entry.dataVencimento).slice(0, 10) : null);
            const pgtoEstimado = !f.d_pgto;
            origemDetalhes = {
              tipo: "ferias_projetada",
              titulo: `Férias — ${f.func_nome ?? "Funcionário"} (${f.func_codigo})`,
              subtitulo: `🏖️ ${f.dias_gozo}d de gozo · Pagamento ${fmtBR(pgtoEfetivo)}${pgtoEstimado ? " (estimado — início −2d)" : ""} (CLT 145 — até 2 dias antes do início)`,
              formula: `Valor das férias = (Salário bruto × ${f.dias_gozo}/30) × (1 + 1/3 constitucional). Vencimento até 2 dias corridos antes do início do gozo (CLT 145). Cargo: ${f.cargo}.`,
              campos: [
                { label: "Funcionário", value: f.func_nome ?? "—" },
                { label: "Código", value: f.func_codigo },
                { label: "Cargo", value: f.cargo },
                { label: "Status atual", value: f.func_status ?? "—" },
                { label: "Período aquisitivo", value: `${fmtBR(f.p_aq_ini)} a ${fmtBR(f.p_aq_fim)}` },
                { label: "Limite concessivo", value: fmtBR(f.p_conc_fim) },
                { label: "Início do gozo", value: fmtBR(f.d_ini) },
                { label: "Término do gozo", value: fmtBR(f.d_fim) },
                { label: "Dias de gozo", value: `${f.dias_gozo}d` },
                { label: "Abono pecuniário", value: f.abonoPecuniario === 1 ? "Sim (1/3)" : "Não" },
                { label: "Status do agendamento", value: f.status ?? "—" },
                { label: "Data de pagamento", value: pgtoEstimado ? `${fmtBR(pgtoEfetivo)} (estimada)` : fmtBR(pgtoEfetivo) },
                { label: "Valor das férias", value: fmtMoney(f.valorFerias) },
                { label: "1/3 constitucional", value: fmtMoney(f.valorTercoConstitucional) },
                { label: "Abono", value: fmtMoney(f.valorAbono) },
                { label: "Valor deste lançamento", value: fmtMoney(valorEntry) },
              ],
            };
          }
        } else if (om === "rescisao_projetada") {
          // Rev. 1636 — Memorial de Rescisão de Aviso (CLT 477 §6º Lei 13.467/17).
          const empId = Number(entry.origemId ?? 0);
          const r = await dbExecute(db,
            `SELECT id, "nomeCompleto" AS nome,
                    COALESCE(NULLIF(TRIM("codigoInterno"),''), NULLIF(TRIM(matricula),''), '—') AS codigo,
                    COALESCE(NULLIF(TRIM(cargo),''), '—') AS cargo,
                    "dataAdmissao" AS d_adm,
                    "dataDesligamentoEfetiva" AS d_desl,
                    "motivoDesligamento" AS motivo,
                    "categoriaDesligamento" AS categoria,
                    status,
                    CASE
                      WHEN LOWER(COALESCE("tipoRemuneracao",'horista')) = 'mensalista'
                        THEN COALESCE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE("salarioBase"::text,'0'),'.',''),',','.'),'[^0-9.\\-]','','g')::numeric, 0)
                      ELSE COALESCE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE("valorHora"::text,'0'),'.',''),',','.'),'[^0-9.\\-]','','g')::numeric, 0) * 220
                    END
                    + CASE WHEN "recebeComplemento" = 1
                        THEN COALESCE(REGEXP_REPLACE(REPLACE(REPLACE(COALESCE("valorComplemento"::text,'0'),'.',''),',','.'),'[^0-9.\\-]','','g')::numeric, 0)
                        ELSE 0 END AS bruto_calc
               FROM employees
              WHERE id = $1 AND "companyId" = $2`,
            [empId, input.companyId]);
          const emp = (rows(r) as any[])[0];
          if (emp) {
            const fmtBR = (s: any) => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—";
            const fmtMoney = (v: any) => `R$ ${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
            const bruto = Number(emp.bruto_calc ?? 0);
            const saldo = bruto;
            const feriasProp = (bruto * 6 / 12) * (1 + 1 / 3);
            const treze = bruto * 6 / 12;
            const multaFgts = bruto * 0.08 * 12 * 0.40;
            const total = saldo + feriasProp + treze + multaFgts;
            const venc = entry.dataVencimento ? String(entry.dataVencimento).slice(0, 10) : null;
            const hasReal = !!emp.d_desl;
            // Rev. 1636 — quando dataDesligamentoEfetiva é NULL, o bridge
            // estima desligamento = vencimento − 10 dias (CLT 477 §6º).
            // Memorial deve mostrar essa mesma data estimada (com badge),
            // não "—".
            let dDeslShow: string | null = null;
            if (emp.d_desl) {
              dDeslShow = String(emp.d_desl).slice(0, 10);
            } else if (venc) {
              const v = new Date(venc + "T00:00:00Z");
              v.setUTCDate(v.getUTCDate() - 10);
              dDeslShow = v.toISOString().slice(0, 10);
            }
            origemDetalhes = {
              tipo: "rescisao_projetada",
              titulo: `Rescisão — ${emp.nome} (${emp.codigo})`,
              subtitulo: `📤 Aviso prévio · Desligamento ${fmtBR(dDeslShow)}${hasReal ? "" : " (estimado)"} · Pagamento até ${fmtBR(venc)} (CLT 477 §6º — 10 dias após término)`,
              formula: `Verbas estimadas = Saldo de salário (1 mês) + Férias proporcionais 6/12 × (1 + 1/3) + 13º proporcional 6/12 + Multa FGTS 40% sobre depósitos estimados (8% × 12 × salário). Valores pró-rata reais serão apurados na rescisão.`,
              campos: [
                { label: "Funcionário", value: emp.nome },
                { label: "Código", value: emp.codigo },
                { label: "Cargo", value: emp.cargo },
                { label: "Status atual", value: emp.status ?? "—" },
                { label: "Data de admissão", value: fmtBR(emp.d_adm) },
                { label: "Data de desligamento", value: hasReal ? fmtBR(dDeslShow) : `${fmtBR(dDeslShow)} (estimada — fim do aviso)` },
                { label: "Motivo", value: emp.motivo ?? "—" },
                { label: "Categoria", value: emp.categoria ?? "—" },
                { label: "Salário bruto base", value: fmtMoney(bruto) },
                { label: "Saldo de salário", value: fmtMoney(saldo) },
                { label: "Férias proporcionais (6/12 + 1/3)", value: fmtMoney(feriasProp) },
                { label: "13º proporcional (6/12)", value: fmtMoney(treze) },
                { label: "Multa FGTS 40%", value: fmtMoney(multaFgts) },
                { label: "Total estimado", value: fmtMoney(total) },
                { label: "Vencimento (CLT 477 §6º)", value: fmtBR(venc) },
              ],
            };
          }
        } else if (om === "seguro_vida") {
          const r = await dbExecute(db,
            `SELECT competencia, total_segurados AS "totalSegurados", total_ativos AS "totalAtivos",
                    total_ok AS "totalOk", total_sem_seguro AS "totalSemSeguro",
                    total_pagar_indevido AS "totalPagarIndevido", importado_por AS "importadoPor",
                    data_importacao AS "dataImportacao"
             FROM seguro_vida_importacoes WHERE id=$1 AND company_id=$2`,
            [entry.origemId, input.companyId]);
          const s = (rows(r) as any[])[0];
          if (s) {
            origemDetalhes = {
              tipo: "seguro_vida",
              titulo: `Seguro de Vida — ${s.competencia}`,
              subtitulo: s.importadoPor ? `Importado por ${s.importadoPor}` : null,
              campos: [
                { label: "Competência", value: s.competencia ?? "—" },
                { label: "Total Segurados", value: s.totalSegurados ?? 0 },
                { label: "Ativos", value: s.totalAtivos ?? 0 },
                { label: "OK", value: s.totalOk ?? 0 },
                { label: "Sem Seguro", value: s.totalSemSeguro ?? 0 },
                { label: "Pgto Indevido", value: s.totalPagarIndevido ?? 0 },
              ],
            };
          }
        }
      } catch (err: any) {
        console.error("[getEntryDetalhe] origemDetalhes error", om, entry.origemId, err?.message);
      }
      // fallback genérico — qualquer origem reconhecida sem fetch específico
      if (!origemDetalhes) {
        origemDetalhes = {
          tipo: om,
          titulo: entry.origemDescricao ?? `Lançamento de ${om}`,
          subtitulo: entry.obraNome ? `📍 ${entry.obraNome}` : null,
          campos: [
            { label: "Módulo de Origem", value: om },
            { label: "ID Origem", value: entry.origemId ?? "—" },
            { label: "Descrição", value: entry.origemDescricao ?? "—" },
          ],
        };
      }
    }

    // 3) Parcelas do mesmo grupo (se houver)
    if (entry.parcelaGrupoId) {
      const pRes = await dbExecute(db,
        `SELECT id, parcela_numero AS "parcelaNumero", parcela_total AS "parcelaTotal",
                valor_previsto AS "valorPrevisto", valor_realizado AS "valorRealizado",
                data_vencimento AS "dataVencimento", data_pagamento AS "dataPagamento",
                status, forma_pagamento AS "formaPagamento"
         FROM financial_entries
         WHERE parcela_grupo_id=$1 AND company_id=$2
         ORDER BY parcela_numero ASC NULLS LAST, data_vencimento ASC NULLS LAST`,
        [entry.parcelaGrupoId, input.companyId]
      );
      parcelas = rows(pRes) as any[];
    }

    // 4) Conta bancária da empresa (origem do pagamento, se já vinculada)
    if (entry.contaBancariaId) {
      const bRes = await dbExecute(db,
        `SELECT id, banco, agencia, conta, "tipoConta", apelido
         FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2`,
        [entry.contaBancariaId, input.companyId]
      );
      bancoEmpresa = (rows(bRes) as any[])[0] ?? null;
    }

    // 5) Histórico de auditoria (últimos 50 registros relativos ao entry id)
    // audit_logs usa identifiers camelCase ("companyId", "createdAt", "entityType", "entityId", "userName")
    const audRes = await dbExecute(db,
      `SELECT id, "userName", action, module, details, "createdAt"
       FROM audit_logs
       WHERE "companyId"=$1
         AND "entityType"='financial_entry'
         AND "entityId"=$2
       ORDER BY "createdAt" DESC
       LIMIT 50`,
      [input.companyId, input.id]
    );
    const auditoria = rows(audRes) as any[];

    // Rev. 1627 — pg/Neon retorna TIMESTAMP como string PG ("2026-04-22 14:44:06.518812"),
    // formato que o iOS Safari rejeita em new Date() com "The string did not match the
    // expected pattern.". Normalizamos para ISO-8601 antes de devolver pro client.
    const TS_FIELDS = [
      "createdAt", "updatedAt", "dataConciliacao", "chequeDataBomPara",
      "aprovadoEm", "dataEntregaPrevista", "dataCompra", "dataImportacao",
    ];
    const toIso = (v: any): any => {
      if (typeof v !== "string") return v;
      // só tratar timestamps PG ("YYYY-MM-DD HH:MM:SS[.ffffff][+/-tz]")
      const m = v.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?(.*)$/);
      if (!m) return v;
      const ms = m[3] ? m[3].slice(0, 4) : ".000"; // truncar microssegundos → ms
      const tz = m[4]?.trim() ? m[4].trim() : "Z";
      return `${m[1]}T${m[2]}${ms}${tz}`;
    };
    const normTs = <T extends Record<string, any> | null | undefined>(o: T): T => {
      if (!o || typeof o !== "object") return o;
      for (const k of TS_FIELDS) if (k in o) (o as any)[k] = toIso((o as any)[k]);
      return o;
    };
    normTs(entry);
    normTs(ordem);
    normTs(fornecedor);
    normTs(bancoEmpresa);
    (itens ?? []).forEach(normTs);
    (parcelas ?? []).forEach(normTs);
    (auditoria ?? []).forEach(normTs);
    if (origemDetalhes?.campos) {
      origemDetalhes.campos = origemDetalhes.campos.map((c: any) => ({
        ...c,
        value: c.kind === "date" ? toIso(c.value) : c.value,
      }));
    }

    return { entry, ordem, itens, fornecedor, parcelas, bancoEmpresa, auditoria, origemDetalhes };
  }),

  // Rev. 1620 — Pagamento em lote (Onda 2: APQC 8.7.5 — Process Payments)
  bulkUpdateStatus: protectedProcedure.input(z.object({
    ids: z.array(z.number()).min(1).max(500),
    companyId: z.number(),
    status: z.string(),
    dataPagamento: z.string().optional(),
    formaPagamento: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const idList = input.ids.filter(n => Number.isInteger(n) && n > 0);
    if (idList.length === 0) return { ok: true, updated: 0 };
    // Para "pago": força valor_realizado = valor_previsto (substituindo eventuais parciais).
    // Para outros status: preserva valor_realizado existente.
    const isPago = input.status === "pago";
    const res = await dbExecute(db,
      `UPDATE financial_entries
         SET status=$1,
             data_pagamento=COALESCE($2, data_pagamento),
             forma_pagamento=COALESCE($3, forma_pagamento),
             valor_realizado=${isPago ? "valor_previsto" : "valor_realizado"},
             updated_at=NOW()
       WHERE company_id=$4 AND id IN (${inlineIds(idList)}) AND status != 'cancelado'`,
      [input.status, input.dataPagamento ?? null, input.formaPagamento ?? null, input.companyId]
    );
    const updated = (res as any).rowCount ?? idList.length;
    await createAuditLog({
      action: "financial_entries_bulk_updated",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `${updated} título(s) atualizado(s) → ${input.status} (de ${idList.length} solicitado(s))`
    });
    return { ok: true, updated };
  }),

  // Rev. 3139 — BAIXA EM LOTE (multi-seleção da tela Lançamentos p/ conciliação
  // bancária). Marca vários lançamentos como efetivados de uma vez, respeitando
  // o tipo: receita → 'recebido', demais (despesa/imposto/transferência) → 'pago'.
  // Só atua em títulos AINDA NÃO efetivados (a_pagar/a_receber/previsto/provisionado)
  // — pulando já pagos/recebidos/cancelados. data_pagamento = data informada
  // (default hoje quando vazia) só preenche se nula; valor_realizado = valor_previsto.
  // Tenant-guard anti-IDOR via _assertFinanceiroCompanyAccess.
  bulkBaixa: protectedProcedure.input(z.object({
    ids: z.array(z.number()).min(1).max(500),
    companyId: z.number(),
    dataPagamento: z.string().optional(),
    formaPagamento: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const idList = input.ids.filter(n => Number.isInteger(n) && n > 0);
    if (idList.length === 0) return { ok: true, updated: 0 };
    const res = await dbExecute(db,
      `UPDATE financial_entries
         SET status = CASE WHEN tipo='receita' THEN 'recebido' ELSE 'pago' END,
             data_pagamento = COALESCE(data_pagamento, $1, CURRENT_DATE::text),
             forma_pagamento = COALESCE($2, forma_pagamento),
             valor_realizado = valor_previsto,
             updated_at = NOW()
       WHERE company_id = $3
         AND id IN (${inlineIds(idList)})
         AND status NOT IN ('pago','recebido','cancelado')
       RETURNING id`,
      [input.dataPagamento ?? null, input.formaPagamento ?? null, input.companyId]
    );
    const updated = ((res as any).rows ?? []).length;
    await createAuditLog({
      action: "financial_entries_bulk_baixa",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `${updated} título(s) baixado(s) como pago/recebido (de ${idList.length} selecionado(s)) por ${ctx.user?.name ?? "?"}`,
    });
    return { ok: true, updated };
  }),

  // Rev. 3139 — ESTORNO (CANCELAR A BAIXA) EM LOTE. Reverte vários lançamentos
  // pago→a_pagar / recebido→a_receber, limpando data_pagamento, valor_realizado,
  // forma_pagamento e comprovante_url (mesma limpeza do estornarPagamento single).
  // Só atua em títulos pago/recebido. Tenant-guard anti-IDOR.
  bulkEstornar: protectedProcedure.input(z.object({
    ids: z.array(z.number()).min(1).max(500),
    companyId: z.number(),
    motivo: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const idList = input.ids.filter(n => Number.isInteger(n) && n > 0);
    if (idList.length === 0) return { ok: true, updated: 0 };
    const motivo = (input.motivo ?? "").trim() || "Estorno em lote (conciliação bancária)";
    const res = await dbExecute(db,
      `UPDATE financial_entries
         SET status = CASE WHEN status='recebido' THEN 'a_receber' WHEN status='pago' THEN 'a_pagar' ELSE status END,
             data_pagamento = NULL,
             valor_realizado = NULL,
             forma_pagamento = NULL,
             comprovante_url = NULL,
             observacoes = CONCAT(COALESCE(observacoes,''), E'\n[ESTORNO LOTE ', TO_CHAR(NOW(),'DD/MM/YYYY HH24:MI'), ' por ', $1::text, ']: ', $2::text),
             updated_at = NOW()
       WHERE company_id = $3
         AND id IN (${inlineIds(idList)})
         AND status IN ('pago','recebido')
       RETURNING id`,
      [ctx.user?.name ?? "?", motivo, input.companyId]
    );
    const updated = ((res as any).rows ?? []).length;
    await createAuditLog({
      action: "financial_entries_bulk_estorno",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `${updated} baixa(s) estornada(s) (de ${idList.length} selecionado(s)) por ${ctx.user?.name ?? "?"} — motivo: "${motivo}"`,
    });
    return { ok: true, updated };
  }),

  // Rev. 3143 — EXCLUSÃO EM LOTE (multi-seleção da tela Lançamentos). Espelha o
  // deleteEntry single: hard-delete SÓ dos não-efetivados (status NOT IN
  // ('pago','recebido')) — pagos/recebidos são pulados (use 'Cancelar baixa'
  // p/ estornar antes). Tenant-guard anti-IDOR + auditoria com snapshot da
  // contagem. id IN (inlineIds) p/ não cair no bug de array-expansion do dbExecute.
  bulkDelete: protectedProcedure.input(z.object({
    ids: z.array(z.number()).min(1).max(500),
    companyId: z.number(),
    motivo: z.string().min(5, "Informe o motivo da exclusão (mín. 5 caracteres)"),
  })).mutation(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const idList = input.ids.filter(n => Number.isInteger(n) && n > 0);
    if (idList.length === 0) return { ok: true, deleted: 0 };
    const res = await dbExecute(db,
      `DELETE FROM financial_entries
        WHERE company_id = $1
          AND id IN (${inlineIds(idList)})
          AND status NOT IN ('pago','recebido')
        RETURNING id`,
      [input.companyId]
    );
    const deleted = ((res as any).rows ?? []).length;
    await createAuditLog({
      action: "financial_entries_bulk_deleted",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `${deleted} lançamento(s) EXCLUÍDO(s) em lote (de ${idList.length} selecionado(s); pagos/recebidos pulados) por ${ctx.user?.name ?? "?"} (id=${ctx.user?.id ?? "?"}) — motivo: "${input.motivo}"`,
    });
    return { ok: true, deleted };
  }),

  // Rev. 3148 — ZERAR MÊS (nuclear). Pedido user (iPad, tela Lançamentos):
  // "botão que SÓ o admin master, COM A SENHA dele conferida no BACKEND, apaga
  // TODOS os lançamentos do mês analisado p/ deixar o mês zerado". Blindagem
  // máxima: (1) role admin_master, (2) senha do master conferida via bcrypt no
  // servidor (OAuth sem senha local cai na própria sessão), (3) tenant-guard
  // anti-IDOR, (4) motivo obrigatório, (5) auditoria com snapshot (contagem +
  // total) ANTES de apagar. Escopo = MESMO conjunto da tela de Lançamentos:
  // período por SOBREPOSIÇÃO (competência↔vencimento↔criação) + exclui projeções
  // (sqlNotProjecao) — então NÃO toca as linhas de projeção que se regeneram, e
  // apaga TODAS as situações reais (inclusive pago/recebido) p/ zerar de fato.
  wipeMonthEntries: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string().min(8),
    dataFim: z.string().min(8),
    password: z.string().optional(),
    motivo: z.string().min(5, "Informe o motivo (mín. 5 caracteres)"),
  })).mutation(async ({ input, ctx }) => {
    // 1) Só admin master
    if ((ctx as any).user?.role !== 'admin_master') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o admin master pode zerar o mês.' });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // 2) Confere a senha do master NO BACKEND (bcrypt). Mesma semântica do
    //    _assertMasterComSenha (terceiroContratos): usuário OAuth sem senha
    //    local é liberado pela própria credencial de sessão.
    const ures = await dbExecute(db, `SELECT password FROM users WHERE id=$1`, [ctx.user?.id]);
    const urow = rows(ures)[0] as any;
    if (!urow) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não encontrado." });
    if (urow.password) {
      if (!input.password) throw new TRPCError({ code: "BAD_REQUEST", message: "Senha do master é obrigatória." });
      const bcrypt = await import("bcryptjs");
      if (!bcrypt.compareSync(input.password, urow.password)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta. Operação cancelada." });
      }
    }
    // 3) Tenant-guard anti-IDOR
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // 4) Período por SOBREPOSIÇÃO (espelha getEntries) + exclui projeções.
    //    dbExecute liga placeholders por ORDEM DE APARIÇÃO no texto, então `vals`
    //    segue exatamente a ordem em que cada $N aparece.
    const vals: any[] = [input.companyId];
    let i = 2;
    const rangeFor = (col: string) => {
      const c = `${col} BETWEEN $${i++} AND $${i++}`; vals.push(input.dataInicio, input.dataFim); return c;
    };
    const cCompetencia = rangeFor("data_competencia");
    const cVencimento = rangeFor("data_vencimento");
    const cCriacao = rangeFor("created_at::date");
    const periodo =
      `((data_competencia IS NOT NULL AND ${cCompetencia}) ` +
      `OR (data_vencimento IS NOT NULL AND ${cVencimento}) ` +
      `OR (data_competencia IS NULL AND data_vencimento IS NULL AND ${cCriacao}))`;
    const where = `company_id = $1 AND ${periodo} AND ${sqlNotProjecao("origem_modulo")}`;
    // Snapshot p/ auditoria ANTES de apagar (contagem + total).
    const snap = await dbExecute(db,
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries WHERE ${where}`,
      vals
    );
    const snapRow = (rows(snap)[0] ?? {}) as any;
    const res = await dbExecute(db,
      `DELETE FROM financial_entries WHERE ${where} RETURNING id`,
      vals
    );
    const deleted = ((res as any).rows ?? []).length;
    await createAuditLog({
      action: "financial_month_wiped",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `MÊS ZERADO (${input.dataInicio} a ${input.dataFim}): ${deleted} lançamento(s) EXCLUÍDO(s) — TODAS as situações (inclusive pago/recebido) — por ${ctx.user?.name ?? "?"} (id=${ctx.user?.id ?? "?"}) — total apagado ~${Number(snapRow.total ?? 0)} — motivo: "${input.motivo}"`,
    });
    return { ok: true, deleted };
  }),

  cancelEntry: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    motivoCancelamento: z.string().min(5),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db, 
      `UPDATE financial_entries SET status='cancelado', motivo_cancelamento=$1, updated_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status != 'cancelado'`,
      [input.motivoCancelamento, input.id, input.companyId]
    );
    await createAuditLog({ action: "financial_entry_cancelled", userId: ctx.user?.id, companyId: input.companyId, details: `Entry ${input.id}: ${input.motivoCancelamento}` });
    return { ok: true };
  }),

  // Rev. 2228 — ESTORNAR pagamento (reverte status='pago' → 'a_pagar').
  // Pedido Lilian: "na aba PAGOS precisa ter botão estornar, pois pode dar
  // baixa errado". Limpa data_pagamento, valor_realizado, forma_pagamento,
  // comprovante_url. Mantém histórico via audit log com snapshot.
  estornarPagamento: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    motivo: z.string().min(5, "Informe o motivo do estorno (mín. 5 caracteres)"),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const r: any = await dbExecute(db,
      `SELECT id, descricao, valor_realizado, data_pagamento, forma_pagamento, status
       FROM financial_entries WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    const entry: any = (Array.isArray(r) ? r : r?.rows ?? [])[0];
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
    if (entry.status !== "pago") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Lançamento não está pago (status=${entry.status}).` });
    }
    const snapshot = `desc="${entry.descricao ?? ""}" pago=${entry.data_pagamento ?? "-"} valor_realizado=${entry.valor_realizado ?? "-"} forma=${entry.forma_pagamento ?? "-"}`;
    // Rev. 3743 — numa transação com lock por lançamento, soft-estorna o histórico de baixas
    // (registrarBaixa) ANTES de zerar o entry, p/ não deixar linhas ativas órfãs que o rollup
    // re-somaria na próxima baixa. No-op para títulos pagos pela rota antiga (sem baixas).
    await (db as any).transaction(async (tx: any) => {
      await _lockEntryBaixas(tx, input.companyId, input.id);
      await _estornarBaixasAtivasDoEntry(tx, input.id, input.companyId, ctx.user?.id, ctx.user?.name, `Estorno do pagamento: ${input.motivo}`);
      await dbExecute(tx,
        `UPDATE financial_entries
           SET status='a_pagar',
               data_pagamento=NULL,
               valor_realizado=NULL,
               forma_pagamento=NULL,
               comprovante_url=NULL,
               observacoes=CONCAT(COALESCE(observacoes,''), E'\n[ESTORNO ', TO_CHAR(NOW(),'DD/MM/YYYY HH24:MI'), ' por ', $1::text, ']: ', $2::text),
               updated_at=NOW()
         WHERE id=$3 AND company_id=$4 AND status='pago'`,
        [ctx.user?.name ?? "?", input.motivo, input.id, input.companyId]
      );
    });
    await createAuditLog({
      action: "financial_entry_reversed",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Entry ${input.id} ESTORNADO por ${ctx.user?.name ?? "?"} (id=${ctx.user?.id ?? "?"}) — motivo: "${input.motivo}" — snapshot: ${snapshot}`,
    });
    return { ok: true };
  }),

  // Rev. 2228 — DELETE definitivo de lançamento (duplicidade). User-driven,
  // protegido por confirmação na UI + motivo obrigatório + audit log
  // (criadoPorNome + ctx.user). Snapshot dos campos críticos vai pro audit
  // log pra rastreabilidade total ("quem excluiu o quê").
  // Rev. 2398 — EDIÇÃO de lançamento manual. Permite alterar campos descritivos
  // (descricao, valor, datas, categoria, obra, forma de pagamento, fornecedor,
  // natureza, observacoes) em lançamentos NÃO pagos e NÃO cancelados.
  // Bloqueia edição em entries vindos de OUTROS módulos (origem != null) pra
  // evitar que user mascarem a origem (compras OC, folha, almox etc.) — única
  // exceção é "recorrente" (que pode ser editado na aba Recorrências).
  // Grava audit log com snapshot do antes pra rastrear "quem editou o quê".
  updateEntry: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    descricao: z.string().optional(),
    valorPrevisto: z.number().optional(),
    dataCompetencia: z.string().optional(),
    dataVencimento: z.string().optional(),
    contaNome: z.string().optional(),
    contaId: z.number().nullable().optional(),
    obraNome: z.string().optional(),
    obraId: z.number().nullable().optional(),
    centroCustoNome: z.string().nullable().optional(), // Rev. 3135
    centroCustoId: z.number().nullable().optional(),   // Rev. 3135
    formaPagamento: z.string().optional(),
    fornecedorNome: z.string().optional(),
    observacoes: z.string().optional(),
    natureza: z.string().optional(),
    tipo: z.string().optional(),
    clienteId: z.number().nullable().optional(),
    clienteNome: z.string().nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const r: any = await dbExecute(db,
      `SELECT id, descricao, valor_previsto, data_competencia, data_vencimento,
              conta_nome, obra_nome, forma_pagamento, fornecedor_nome, observacoes,
              natureza, tipo, status, origem_modulo, origem_id
       FROM financial_entries WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    const before: any = (Array.isArray(r) ? r : r?.rows ?? [])[0];
    if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
    if (before.status === "pago" || before.status === "recebido") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Lançamento já pago/recebido — estorne antes de editar." });
    }
    if (before.status === "cancelado") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Lançamento cancelado não pode ser editado." });
    }
    // Rev. 2661 — REVOGA o bloqueio "edite na origem". Títulos vinculados a outro
    // módulo passam a ser EDITÁVEIS aqui; quando a origem é Compras (OC), os campos
    // de METADADO que existem na OC são espelhados de volta na compras_ordens
    // (fornecedor, vencimento, forma de pagamento, observações). O VALOR/TOTAL da OC
    // NÃO é sobrescrito — ele é derivado dos itens da OC (subtotal+frete+impostos−desconto),
    // então alterá-lo direto criaria inconsistência com os itens; o valor financeiro
    // do título pode legitimamente divergir do total da OC (medição parcial etc.).
    // Builder dinâmico de SET — só sobrescreve o que veio.
    const sets: string[] = [];
    const vals: any[] = [];
    const push = (col: string, v: any) => { sets.push(`${col} = $${vals.length + 1}`); vals.push(v); };
    if (input.descricao !== undefined) push("descricao", input.descricao || null);
    if (input.valorPrevisto !== undefined) push("valor_previsto", input.valorPrevisto);
    if (input.dataCompetencia !== undefined) push("data_competencia", input.dataCompetencia);
    if (input.dataVencimento !== undefined) push("data_vencimento", input.dataVencimento || null);
    if (input.contaNome !== undefined) push("conta_nome", input.contaNome || null);
    if (input.contaId !== undefined) push("conta_id", input.contaId ?? null);
    if (input.obraNome !== undefined) push("obra_nome", input.obraNome || null);
    if (input.obraId !== undefined) push("obra_id", input.obraId ?? null);
    if (input.centroCustoNome !== undefined) push("centro_custo_nome", input.centroCustoNome || null);
    if (input.centroCustoId !== undefined) push("centro_custo_id", input.centroCustoId ?? null);
    if (input.formaPagamento !== undefined) push("forma_pagamento", input.formaPagamento || null);
    if (input.fornecedorNome !== undefined) push("fornecedor_nome", input.fornecedorNome?.trim() || null);
    if (input.observacoes !== undefined) push("observacoes", input.observacoes || null);
    if (input.natureza !== undefined) push("natureza", input.natureza);
    if (input.tipo !== undefined) push("tipo", input.tipo);
    if (input.clienteId !== undefined) push("cliente_id", input.clienteId ?? null);
    if (input.clienteNome !== undefined) push("cliente_nome", input.clienteNome?.trim() || null);
    if (sets.length === 0) return { ok: true, changed: false };
    // Rev. 2661 — registra QUEM editou e QUANDO no próprio título.
    push("editado_por_id", ctx.user?.id ?? null);
    push("editado_por_nome", ctx.user?.name ?? null);
    sets.push(`editado_em = NOW()`);
    sets.push(`updated_at = NOW()`);
    vals.push(input.id, input.companyId);

    // Rev. 2661 — Write-back para a Ordem de Compra de origem (somente Compras).
    // ATÔMICO: a edição do título e o espelhamento na OC vivem na MESMA transação.
    // Se a OC de origem não existir/não casar (origem_id obsoleto) OU o espelhamento
    // falhar, a transação faz ROLLBACK e a edição inteira aborta — financeiro e OC
    // JAMAIS divergem. Só espelha campos que existem na OC (fornecedor/vencimento/
    // forma/obs); valor/total da OC vêm dos itens e NÃO são tocados aqui.
    const ehOrigemCompras = (before.origem_modulo === "compras" || before.origem_modulo === "compra_oc") && !!before.origem_id;
    const ocSets: string[] = [];
    const ocVals: any[] = [];
    const ocPush = (col: string, v: any) => { ocSets.push(`${col} = $${ocVals.length + 1}`); ocVals.push(v); };
    if (ehOrigemCompras) {
      if (input.fornecedorNome !== undefined) ocPush("fornecedor_nome", input.fornecedorNome?.trim() || null);
      if (input.dataVencimento !== undefined) ocPush("data_vencimento", input.dataVencimento || null);
      if (input.formaPagamento !== undefined) ocPush("forma_pagamento", input.formaPagamento || null);
      if (input.observacoes !== undefined) ocPush("observacoes", input.observacoes || null);
    }
    const fazWriteBack = ehOrigemCompras && ocSets.length > 0;

    let origemSync = "";
    await db.transaction(async (tx: any) => {
      await dbExecute(tx,
        `UPDATE financial_entries SET ${sets.join(", ")}
         WHERE id = $${vals.length - 1} AND company_id = $${vals.length}`,
        vals
      );
      if (fazWriteBack) {
        ocSets.push(`updated_at = NOW()`);
        ocVals.push(before.origem_id, input.companyId);
        const ocRes = await dbExecute(tx,
          `UPDATE compras_ordens SET ${ocSets.join(", ")}
           WHERE id = $${ocVals.length - 1} AND company_id = $${ocVals.length}
           RETURNING id`,
          ocVals
        );
        if (rows(ocRes).length !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Não foi possível espelhar na Ordem de Compra de origem (OC#${before.origem_id} não encontrada). A edição foi cancelada para manter financeiro e Compras sincronizados.`,
          });
        }
        origemSync = ` | espelhado na OC#${before.origem_id} (fornecedor/vencimento/forma/obs)`;
      }
    });

    const snap = `desc="${before.descricao ?? ""}" valor=${before.valor_previsto} venc=${before.data_vencimento ?? "-"} categ="${before.conta_nome ?? "-"}" fornec="${before.fornecedor_nome ?? "-"}"`;
    const origemTxt = before.origem_modulo ? ` [origem=${before.origem_modulo}#${before.origem_id ?? "?"}]` : "";
    await createAuditLog({
      action: "financial_entry_updated",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Entry ${input.id} EDITADO por ${ctx.user?.name ?? "?"} (id=${ctx.user?.id ?? "?"})${origemTxt} — snapshot antes: ${snap}${origemSync}`,
    });
    return { ok: true, changed: true };
  }),

  // Rev. 3394 — CLASSIFICAÇÃO inline de um lançamento diretamente da Conciliação Bancária.
  // Permite corrigir conta, obra, conta bancária, forma de pagamento, fornecedor, descrição e
  // observações SEM restrição de status — mesmo pago/recebido pode ser reclassificado
  // contabilmente. NÃO toca valores nem datas.
  updateEntryClassificacao: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    companyId: z.number().int().positive(),
    contaId: z.number().nullable().optional(),
    contaNome: z.string().nullable().optional(),
    obraId: z.number().nullable().optional(),
    obraNome: z.string().nullable().optional(),
    contaBancariaId: z.number().nullable().optional(),
    formaPagamento: z.string().nullable().optional(),
    fornecedorNome: z.string().nullable().optional(),
    descricao: z.string().nullable().optional(),
    observacoes: z.string().nullable().optional(),
    tipo: z.enum(["despesa", "receita", "transferencia"]).optional(),
  })).mutation(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const chk = await dbExecute(db,
      `SELECT id FROM financial_entries WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    if (!rows(chk).length) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
    const sets: string[] = [];
    const vals: any[] = [];
    const push = (col: string, v: any) => { sets.push(`${col} = $${vals.length + 1}`); vals.push(v); };
    if (input.contaId !== undefined)         push("conta_id", input.contaId ?? null);
    if (input.contaNome !== undefined)       push("conta_nome", input.contaNome?.trim() || null);
    if (input.obraId !== undefined)          push("obra_id", input.obraId ?? null);
    if (input.obraNome !== undefined)        push("obra_nome", input.obraNome?.trim() || null);
    if (input.contaBancariaId !== undefined) push("conta_bancaria_id", input.contaBancariaId ?? null);
    if (input.formaPagamento !== undefined)  push("forma_pagamento", input.formaPagamento?.trim() || null);
    if (input.fornecedorNome !== undefined)  push("fornecedor_nome", input.fornecedorNome?.trim() || null);
    if (input.descricao !== undefined)       push("descricao", input.descricao?.trim() || null);
    if (input.observacoes !== undefined)     push("observacoes", input.observacoes?.trim() || null);
    if (input.tipo !== undefined)            push("tipo", input.tipo);
    if (sets.length === 0) return { ok: true, changed: false };
    push("editado_por_id", ctx.user?.id ?? null);
    push("editado_por_nome", ctx.user?.name ?? null);
    sets.push(`editado_em = NOW()`);
    sets.push(`updated_at = NOW()`);
    vals.push(input.id, input.companyId);
    await dbExecute(db,
      `UPDATE financial_entries SET ${sets.join(", ")}
       WHERE id = $${vals.length - 1} AND company_id = $${vals.length}`,
      vals
    );
    await createAuditLog({
      action: "financial_entry_classificacao_updated",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Entry ${input.id} RECLASSIFICADO por ${ctx.user?.name ?? "?"} (id=${ctx.user?.id ?? "?"})`,
    });
    return { ok: true, changed: true };
  }),

  // Rev. 3025 — RECLASSIFICAÇÃO EM MASSA (categoria=conta_nome/conta_id +
  // centro de custo=obra_nome/obra_id) de VÁRIOS títulos de uma vez, a partir da
  // tela "Lançamentos detalhados" (Análise de Custos → drill-down).
  // Só mexe em METADADO de classificação — NÃO toca valor/datas/status — então é
  // permitido inclusive em títulos já pagos/recebidos (correção contábil). Pula
  // somente os cancelados. Tenant-guard anti-IDOR via _assertFinanceiroCompanyAccess
  // + WHERE company_id. IDs validados como números → inlinados com segurança.
  bulkReclassificar: protectedProcedure.input(z.object({
    companyId: z.number(),
    ids: z.array(z.number().int().positive()).min(1).max(1000),
    contaNome: z.string().nullable().optional(),
    contaId: z.number().nullable().optional(),
    obraNome: z.string().nullable().optional(),
    obraId: z.number().nullable().optional(),
    // Rev. 3135 — centro de custo CADASTRADO (substitui obra na Análise de Custos).
    centroCustoNome: z.string().nullable().optional(),
    centroCustoId: z.number().nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const setCategoria = input.contaNome !== undefined || input.contaId !== undefined;
    const setCentro = input.obraNome !== undefined || input.obraId !== undefined
      || input.centroCustoNome !== undefined || input.centroCustoId !== undefined;
    if (!setCategoria && !setCentro) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe categoria e/ou centro de custo para aplicar." });
    }
    const sets: string[] = [];
    const vals: any[] = [];
    const push = (col: string, v: any) => { sets.push(`${col} = $${vals.length + 1}`); vals.push(v); };
    if (input.contaNome !== undefined) push("conta_nome", input.contaNome || null);
    if (input.contaId !== undefined) push("conta_id", input.contaId ?? null);
    if (input.obraNome !== undefined) push("obra_nome", input.obraNome || null);
    if (input.obraId !== undefined) push("obra_id", input.obraId ?? null);
    if (input.centroCustoNome !== undefined) push("centro_custo_nome", input.centroCustoNome || null);
    if (input.centroCustoId !== undefined) push("centro_custo_id", input.centroCustoId ?? null);
    push("editado_por_id", ctx.user?.id ?? null);
    push("editado_por_nome", ctx.user?.name ?? null);
    sets.push(`editado_em = NOW()`);
    sets.push(`updated_at = NOW()`);
    // IDs já validados como inteiros positivos pelo Zod → seguro inlinar (evita o
    // bind de array do dbExecute, que interpola params por ordem de aparição).
    const idList = Array.from(new Set(input.ids)).join(",");
    vals.push(input.companyId);
    const res: any = await dbExecute(db,
      `UPDATE financial_entries SET ${sets.join(", ")}
       WHERE company_id = $${vals.length} AND id IN (${idList}) AND status <> 'cancelado'
       RETURNING id`,
      vals
    );
    const changed = rows(res).length;
    const partes: string[] = [];
    if (setCategoria) partes.push(`categoria="${input.contaNome ?? ""}"`);
    if (setCentro) partes.push(`centroCusto/obra="${input.obraNome ?? ""}"`);
    await createAuditLog({
      action: "financial_entry_bulk_reclassify",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Reclassificação em massa de ${changed}/${input.ids.length} título(s) por ${ctx.user?.name ?? "?"} (id=${ctx.user?.id ?? "?"}) — ${partes.join(" ")}`,
    });
    return { ok: true, changed };
  }),

  // Rev. 3944 — ATUALIZAR VENCIMENTO EM MASSA (Contas a Receber multi-seleção).
  // Permite corrigir data_vencimento de vários títulos de uma vez, inclusive
  // recebidos (é metadado; não toca valor/status). Cancela são excluídos.
  bulkAtualizarVencimento: protectedProcedure.input(z.object({
    companyId: z.number(),
    ids: z.array(z.number().int().positive()).min(1).max(1000),
    dataVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })).mutation(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const idList = Array.from(new Set(input.ids)).join(",");
    const res: any = await dbExecute(db,
      `UPDATE financial_entries SET data_vencimento=$1, updated_at=NOW()
       WHERE company_id=$2 AND id IN (${idList}) AND status <> 'cancelado'
       RETURNING id`,
      [input.dataVencimento, input.companyId]
    );
    const changed = rows(res).length;
    await createAuditLog({
      action: "financial_entries_bulk_vencimento",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Vencimento em massa de ${changed}/${input.ids.length} → ${input.dataVencimento} por ${ctx.user?.name ?? "?"}`,
    });
    return { ok: true, changed };
  }),

  // Rev. 2657 — ANEXAR documento (boleto/NF/foto) a um título do Contas a Pagar.
  // Grava anexo_url/anexo_nome (já feito o upload via uploadComprovante → storagePut).
  // Diferente do comprovante_url (que é o comprovante DE PAGAMENTO, gravado na baixa):
  // este é o documento de origem do título (boleto, nota fiscal, contrato etc.).
  // Não bloqueia por status — pode-se anexar documento mesmo a título já pago.
  anexarDocumento: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    anexoUrl: z.string(),
    anexoNome: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const exists: any = await dbExecute(db,
      `SELECT id FROM financial_entries WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    ).then((r: any) => (Array.isArray(r) ? r : r?.rows ?? []));
    if (!exists[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
    await dbExecute(db,
      `UPDATE financial_entries SET anexo_url = $1, anexo_nome = $2, updated_at = NOW()
       WHERE id = $3 AND company_id = $4`,
      [input.anexoUrl || null, input.anexoNome?.trim() || null, input.id, input.companyId]
    );
    await createAuditLog({
      action: "financial_entry_anexo",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Entry ${input.id} ANEXO por ${ctx.user?.name ?? "?"} (id=${ctx.user?.id ?? "?"}) — "${input.anexoNome ?? input.anexoUrl}"`,
    });
    return { ok: true };
  }),

  // NÃO permite excluir status='pago' (proteção financeira — usar cancelEntry
  // pra estornar). Lançamentos vindos de OC/folha/etc podem ser excluídos
  // pra resolver duplicidade, mas o módulo de origem permanece intacto.
  deleteEntry: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    motivo: z.string().min(5, "Informe o motivo da exclusão (mín. 5 caracteres)"),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const [entry]: any = await dbExecute(db,
      `SELECT id, descricao, valor_previsto, data_vencimento, status, origem_modulo, origem_id, conta_nome
       FROM financial_entries WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    ).then((r: any) => (Array.isArray(r) ? r : r?.rows ?? []));
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
    if (entry.status === "pago" || entry.status === "recebido") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Lançamento já pago/recebido — use 'Cancelar' (estorno) em vez de excluir." });
    }
    const snapshot = `desc="${entry.descricao ?? ""}" valor=${entry.valor_previsto} venc=${entry.data_vencimento ?? "-"} origem=${entry.origem_modulo ?? "manual"}${entry.origem_id ? "#" + entry.origem_id : ""} categoria="${entry.conta_nome ?? "-"}"`;
    await dbExecute(db,
      `DELETE FROM financial_entries WHERE id=$1 AND company_id=$2 AND status NOT IN ('pago','recebido')`,
      [input.id, input.companyId]
    );
    await createAuditLog({
      action: "financial_entry_deleted",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Entry ${input.id} EXCLUÍDO por ${ctx.user?.name ?? "?"} (id=${ctx.user?.id ?? "?"}) — motivo: "${input.motivo}" — snapshot: ${snapshot}`,
    });
    return { ok: true };
  }),

  // ─────────────────── RESUMO / DASHBOARD ───────────────────

  getDashboardSummary: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    mesCompetencia: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const mes = input.mesCompetencia ?? new Date().toISOString().slice(0, 7);

    const [recRes, despRes, aReceberRes, apagarRes, vencRes] = await Promise.all([
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_realizado),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('recebido','pago')
           AND TO_CHAR(data_competencia,'YYYY-MM')=$1`,
        [mes]
      ),
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_realizado),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status IN ('pago','recebido')
           AND TO_CHAR(data_competencia,'YYYY-MM')=$1`,
        [mes]
      ),
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status='a_receber'`,
        []
      ),
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status='a_pagar'`,
        []
      ),
      dbExecute(db, 
        `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries
         WHERE company_id IN (${inlineIds(ids)}) AND status IN ('a_pagar','a_receber')
           AND data_vencimento < CURRENT_DATE`,
        []
      ),
    ]);

    const rec = Number(rows(recRes)[0]?.total ?? 0);
    const desp = Number(rows(despRes)[0]?.total ?? 0);
    const aReceber = Number(rows(aReceberRes)[0]?.total ?? 0);
    const aPagar = Number(rows(apagarRes)[0]?.total ?? 0);
    const vencidos = Number(rows(vencRes)[0]?.total ?? 0);

    return {
      receitaMes: rec,
      despesaMes: desp,
      resultadoMes: rec - desp,
      totalAReceber: aReceber,
      totalAPagar: aPagar,
      totalVencidos: vencidos,
      saldoLiquido: aReceber - aPagar,
    };
  }),

  // ─────────────────── RECEITAS DE OBRAS ───────────────────

  getRevenue: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    obraId: z.number().optional(),
    status: z.string().optional(),
    limit: z.number().default(50),
    offset: z.number().default(0),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    // Monta IN clause diretamente (ids são integers — sem risco de injection)
    const idList = ids.map(Number).join(",");
    const conds: string[] = [`company_id IN (${idList})`];
    const vals: any[] = [];
    let i = 1;
    if (input.obraId) { conds.push(`obra_id=$${i++}`); vals.push(input.obraId); }
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    vals.push(input.limit, input.offset);
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", obra_id AS "obraId", obra_nome AS "obraNome",
              cliente_nome AS "clienteNome", cliente_cnpj AS "clienteCnpj",
              valor_contrato AS "valorContrato", valor_aditivos AS "valorAditivos",
              valor_contrato_total AS "valorContratoTotal", medicao_numero AS "medicaoNumero",
              percentual_medicao AS "percentualMedicao", valor_medicao AS "valorMedicao",
              nf_numero AS "nfNumero", nf_emitida_em AS "nfEmitidaEm",
              data_vencimento AS "dataVencimento", data_recebimento AS "dataRecebimento",
              valor_recebido AS "valorRecebido", status, forma_pagamento AS "formaPagamento",
              retencao_iss AS "retencaoISS", retencao_inss AS "retencaoINSS",
              retencao_ir AS "retencaoIR", retencao_total AS "retencaoTotal",
              valor_liquido_receber AS "valorLiquidoReceber", observacoes,
              created_at AS "createdAt"
       FROM financial_revenue
       WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      vals
    );
    return rows(res);
  }),

  createRevenue: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    obraNome: z.string().optional(),
    clienteNome: z.string().optional(),
    clienteCnpj: z.string().optional(),
    valorContrato: z.number().optional(),
    valorMedicao: z.number(),
    medicaoNumero: z.number().optional(),
    percentualMedicao: z.number().optional(),
    dataVencimento: z.string().optional(),
    retencaoISS: z.number().default(0),
    retencaoINSS: z.number().default(0),
    retencaoIR: z.number().default(0),
    retencaoContratual: z.number().default(0),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const retTrib = input.retencaoISS + input.retencaoINSS + input.retencaoIR;
    const retTotal = retTrib + input.retencaoContratual;
    const vlq = input.valorMedicao - retTotal;
    const res = await dbExecute(db, 
      `INSERT INTO financial_revenue
       (company_id, obra_id, obra_nome, cliente_nome, cliente_cnpj, valor_contrato,
        valor_medicao, medicao_numero, percentual_medicao, data_vencimento,
        retencao_iss, retencao_inss, retencao_ir, retencao_contratual, retencao_total,
        valor_liquido_receber, status, observacoes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'a_faturar',$17,NOW(),NOW())
       RETURNING id`,
      [input.companyId, input.obraId, input.obraNome ?? null, input.clienteNome ?? null,
       input.clienteCnpj ?? null, input.valorContrato ?? null, input.valorMedicao,
       input.medicaoNumero ?? null, input.percentualMedicao ?? null, input.dataVencimento ?? null,
       input.retencaoISS, input.retencaoINSS, input.retencaoIR, input.retencaoContratual,
       retTotal, vlq, input.observacoes ?? null]
    );
    const id = rows(res)[0]?.id;

    // Rev. 3163 — NÃO materializar mais a receita automaticamente em
    // financial_entries (Contas a Receber). A receita prevista nasce SÓ em
    // financial_revenue (status 'a_faturar', inserido acima — a FONTE de
    // "Recebíveis Previstos") e só vira lançamento quando o usuário confirma na
    // tela "Recebíveis Previstos" (financial.transferirRecebiveisPrevistos).
    // Antes, criar uma receita aqui derrubava o previsto direto no livro.

    await createAuditLog({ action: "financial_revenue_created", userId: ctx.user?.id, companyId: input.companyId, details: `Receita obra ${input.obraId}: R$${input.valorMedicao}` });
    return { id };
  }),

  updateRevenueStatus: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number().optional(),
    status: z.string(),
    nfNumero: z.string().optional(),
    nfEmitidaEm: z.string().optional(),
    dataRecebimento: z.string().optional(),
    valorRecebido: z.number().optional(),
    formaPagamento: z.string().optional(),
    valorAprovado: z.number().optional(),
    dataAprovacao: z.string().optional(),
    medicaoEnviadaEm: z.string().optional(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Resolve companyId — use provided value or look up from the record itself
    let companyId = (input.companyId && input.companyId > 0) ? input.companyId : 0;
    if (!companyId) {
      const rec = rows(await dbExecute(db, `SELECT company_id FROM financial_revenue WHERE id=$1`, [input.id]));
      companyId = Number(rec[0]?.company_id ?? 0);
    }
    if (!companyId) throw new TRPCError({ code: "NOT_FOUND", message: "Registro financeiro não encontrado" });
    const glosa = input.valorAprovado != null
      ? (await dbExecute(db, `SELECT valor_medicao FROM financial_revenue WHERE id=$1`, [input.id]))
          .then((r: any) => {
            const vm = Number(rows(r)[0]?.valor_medicao ?? 0);
            return Math.max(0, vm - (input.valorAprovado ?? vm));
          })
      : Promise.resolve(0);
    const glosaVal = await glosa;
    await dbExecute(db, 
      `UPDATE financial_revenue
       SET status=$1,
           nf_numero=COALESCE($2,nf_numero),
           nf_emitida_em=COALESCE($3,nf_emitida_em),
           data_recebimento=COALESCE($4,data_recebimento),
           valor_recebido=COALESCE($5,valor_recebido),
           forma_pagamento=COALESCE($6,forma_pagamento),
           valor_aprovado=COALESCE($9,valor_aprovado),
           data_aprovacao=COALESCE($10,data_aprovacao),
           medicao_enviada_em=COALESCE($11,medicao_enviada_em),
           glosa=$12,
           observacoes=COALESCE($13,observacoes),
           updated_at=NOW()
       WHERE id=$7 AND company_id=$8`,
      [input.status, input.nfNumero ?? null, input.nfEmitidaEm ?? null,
       input.dataRecebimento ?? null, input.valorRecebido ?? null,
       input.formaPagamento ?? null, input.id, companyId,
       input.valorAprovado ?? null, input.dataAprovacao ?? null,
       input.medicaoEnviadaEm ?? null, glosaVal,
       input.observacoes || null]
    );

    // Sincronizar status no financial_entry correspondente
    const entryStatusMap: Record<string, string> = {
      a_faturar: "a_receber",
      faturado: "a_receber",
      a_receber: "a_receber",
      recebido_parcial: "recebido_parcial",
      recebido_total: "recebido",
      cancelado: "cancelado",
    };
    const entryStatus = entryStatusMap[input.status] ?? "a_receber";
    await dbExecute(db, 
      `UPDATE financial_entries
       SET status=$1,
           valor_realizado=CASE WHEN $2::numeric > 0 THEN $2::numeric ELSE valor_realizado END,
           data_pagamento=COALESCE($3, data_pagamento),
           updated_at=NOW()
       WHERE origem_modulo='revenue' AND origem_id=$4 AND company_id=$5`,
      [entryStatus, input.valorRecebido ?? 0, input.dataRecebimento ?? null, input.id, companyId]
    );

    await createAuditLog({ action: "financial_revenue_status_updated", userId: ctx.user?.id, companyId, details: `Revenue ${input.id} → ${input.status}` });
    return { ok: true };
  }),

  // ─── Dar Baixa — registra recebimento direto (sem burocracia de status) ─────
  registrarRecebimento: protectedProcedure.input(z.object({
    companyId:       z.number(),
    projetoId:       z.number(),
    obraId:          z.number().nullable().optional(),
    obraNome:        z.string().optional(),
    clienteNome:     z.string().optional(),
    competencia:     z.string(),  // "YYYY-MM"
    valorPrevisto:   z.number(),
    valorRecebido:   z.number(),
    dataRecebimento: z.string(),  // "YYYY-MM-DD"
    formaPagamento:  z.string().optional(),
    contaBancariaId: z.number().nullable().optional(),
    frId:            z.number().nullable().optional(),  // se já existe financial_revenue
    observacoes:     z.string().optional(),
    juros:           z.number().optional(),
    descontos:       z.number().optional(),
    outros:          z.number().optional(),
    comprovanteUrl:  z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Se já existe um financial_revenue para esta medição → apenas atualiza
    if (input.frId) {
      // NOTA: dbExecute vincula params por ORDEM DE APARIÇÃO (ignora o número do $N).
      // Placeholders sequenciais + array na mesma ordem.
      await dbExecute(db,
        `UPDATE financial_revenue
         SET status='recebido_total',
             valor_recebido=$1,
             data_recebimento=$2,
             forma_pagamento=COALESCE($3, forma_pagamento),
             conta_bancaria_id=COALESCE($4, conta_bancaria_id),
             juros=COALESCE($5, juros),
             descontos=COALESCE($6, descontos),
             outros=COALESCE($7, outros),
             observacoes=COALESCE($8, observacoes),
             comprovante_url=COALESCE($9, comprovante_url),
             updated_at=NOW()
         WHERE id=$10 AND company_id=$11`,
        [input.valorRecebido, input.dataRecebimento, input.formaPagamento ?? null,
         input.contaBancariaId ?? null,
         input.juros ?? null, input.descontos ?? null, input.outros ?? null,
         input.observacoes ?? null, input.comprovanteUrl ?? null,
         input.frId, input.companyId]
      );
      await dbExecute(db,
        `UPDATE financial_entries
         SET status='recebido',
             valor_realizado=$1,
             data_pagamento=$2,
             conta_bancaria_id=COALESCE($3, conta_bancaria_id),
             updated_at=NOW()
         WHERE origem_modulo='revenue' AND origem_id=$4 AND company_id=$5`,
        [input.valorRecebido, input.dataRecebimento, input.contaBancariaId ?? null,
         input.frId, input.companyId]
      );
      // Rev. 3163 — com a receita prevista NÃO sendo mais materializada
      // automaticamente (createRevenue desligado), a baixa pode incidir sobre um
      // previsto AINDA não lançado no livro. Garante o lançamento 'recebido' se
      // ele não existir (idempotente via WHERE NOT EXISTS — não duplica quando o
      // UPDATE acima já achou a linha). dbExecute liga params por ORDEM DE
      // APARIÇÃO do $N (o número é cosmético) → repetir o valor no array.
      {
        const _obraNomeBx = input.obraNome ?? `Projeto ${input.projetoId}`;
        const _mesDateBx = `${input.competencia}-01`;
        await dbExecute(db,
          `INSERT INTO financial_entries
           (company_id, obra_id, obra_nome, conta_nome, tipo, natureza,
            valor_previsto, valor_realizado, data_competencia, data_vencimento,
            data_pagamento, status, origem_modulo, origem_id, origem_descricao,
            descricao, conta_bancaria_id, created_at, updated_at)
           SELECT $1,$2,$3,'Faturamento de Obras','receita','variavel',
                  $4,$5,$6::date,$7::date,$8,'recebido',
                  'revenue',$9,$10,$11,$12,NOW(),NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM financial_entries fe
             WHERE fe.origem_modulo='revenue' AND fe.origem_id=$13 AND fe.company_id=$14
           )`,
          [input.companyId, input.obraId ?? null, _obraNomeBx,
           input.valorPrevisto, input.valorRecebido, _mesDateBx, _mesDateBx,
           input.dataRecebimento, input.frId,
           `Recebimento — ${_obraNomeBx}`, `Baixa: ${_obraNomeBx}`,
           input.contaBancariaId ?? null, input.frId, input.companyId]
        );
      }
      // Sync planejamento_medicoes → marcar competência como confirmada
      // Nota: parâmetros são listados com índices únicos ($4,$5,$6) para evitar
      // repetição que confunde o dbExecute (que trata $N como posição sequencial)
      await dbExecute(db,
        `WITH upd AS (
           UPDATE planejamento_medicoes
           SET valor_medido=$1, status='confirmado', atualizado_em=NOW()
           WHERE projeto_id=$2 AND competencia=$3
           RETURNING id
         )
         INSERT INTO planejamento_medicoes (projeto_id, competencia, numero, valor_medido, status, atualizado_em)
         SELECT $4::int, $5, 0, $6, 'confirmado', NOW()
         WHERE NOT EXISTS (SELECT 1 FROM upd)`,
        [input.valorRecebido, input.projetoId, input.competencia,
         input.projetoId, input.competencia, input.valorRecebido]
      );
      await createAuditLog({ action: "dar_baixa", userId: ctx.user?.id, companyId: input.companyId,
        details: `Baixa fr_id=${input.frId} R$${input.valorRecebido} em ${input.dataRecebimento}` });
      return { ok: true, frId: input.frId };
    }

    // Não existe registro → cria financial_revenue direto como recebido_total
    const obraId   = input.obraId ?? null;
    const obraNome = input.obraNome ?? `Projeto ${input.projetoId}`;
    const mesDate  = `${input.competencia}-01`;

    const revRes = await dbExecute(db,
      `INSERT INTO financial_revenue
       (company_id, obra_id, obra_nome, cliente_nome, valor_contrato,
        valor_medicao, valor_recebido, data_vencimento, data_recebimento,
        forma_pagamento, status, observacoes, conta_bancaria_id,
        juros, descontos, outros, comprovante_url, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NULL,$5,$6,$7::date,$8,$9,'recebido_total',$10,$11,
               $12,$13,$14,$15,NOW(),NOW())
       RETURNING id`,
      [input.companyId, obraId, obraNome, input.clienteNome ?? null,
       input.valorPrevisto, input.valorRecebido, mesDate,
       input.dataRecebimento, input.formaPagamento ?? null, input.observacoes ?? null,
       input.contaBancariaId ?? null,
       input.juros ?? null, input.descontos ?? null, input.outros ?? null,
       input.comprovanteUrl ?? null]
    );
    const newFrId = rows(revRes)[0]?.id;

    if (newFrId) {
      await dbExecute(db,
        `INSERT INTO financial_entries
         (company_id, obra_id, obra_nome, conta_nome, tipo, natureza,
          valor_previsto, valor_realizado, data_competencia, data_vencimento,
          data_pagamento, status, origem_modulo, origem_id, origem_descricao,
          descricao, conta_bancaria_id, created_at, updated_at)
         VALUES ($1,$2,$3,'Faturamento de Obras','receita','variavel',
                 $4,$5,$6::date,$7::date,$8,'recebido',
                 'revenue',$9,$10,$11,$12,NOW(),NOW())`,
        [input.companyId, obraId, obraNome,
         input.valorPrevisto, input.valorRecebido,
         mesDate, mesDate,
         input.dataRecebimento,
         newFrId,
         `Recebimento — ${obraNome}`,
         `Baixa: ${obraNome}`,
         input.contaBancariaId ?? null]
      );
    }

    // Sync planejamento_medicoes → marcar competência como confirmada
    await dbExecute(db,
      `WITH upd AS (
         UPDATE planejamento_medicoes
         SET valor_medido=$1, status='confirmado', atualizado_em=NOW()
         WHERE projeto_id=$2 AND competencia=$3
         RETURNING id
       )
       INSERT INTO planejamento_medicoes (projeto_id, competencia, numero, valor_medido, status, atualizado_em)
       SELECT $4::int, $5, 0, $6, 'confirmado', NOW()
       WHERE NOT EXISTS (SELECT 1 FROM upd)`,
      [input.valorRecebido, input.projetoId, input.competencia,
       input.projetoId, input.competencia, input.valorRecebido]
    );
    await createAuditLog({ action: "dar_baixa", userId: ctx.user?.id, companyId: input.companyId,
      details: `Nova baixa projeto ${input.projetoId} R$${input.valorRecebido} em ${input.dataRecebimento}` });
    return { ok: true, frId: newFrId };
  }),

  // ─── Cancelar Recebimento ─────────────────────────────────────────────────
  cancelarRecebimento: protectedProcedure.input(z.object({
    companyId:  z.number(),
    frId:       z.number(),
    medicaoId:  z.number().nullable().optional(),
    projetoId:  z.number().optional(),   // para resetar planejamento_medicoes
    competencia: z.string().optional(),  // "YYYY-MM"
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    if (input.medicaoId) {
      // FR vinculado a medição: reverte para "a_receber" (não exclui)
      await dbExecute(db,
        `UPDATE financial_revenue
         SET status='a_receber', valor_recebido=NULL, data_recebimento=NULL, updated_at=NOW()
         WHERE id=$1 AND company_id=$2`,
        [input.frId, input.companyId]
      );
      await dbExecute(db,
        `UPDATE financial_entries
         SET status='a_receber', valor_realizado=NULL, data_pagamento=NULL, updated_at=NOW()
         WHERE origem_modulo='revenue' AND origem_id=$1 AND company_id=$2`,
        [input.frId, input.companyId]
      );
    } else {
      // FR standalone (criado via Dar Baixa): exclui o registro
      await dbExecute(db,
        `DELETE FROM financial_entries
         WHERE origem_modulo='revenue' AND origem_id=$1 AND company_id=$2`,
        [input.frId, input.companyId]
      );
      await dbExecute(db,
        `DELETE FROM financial_revenue WHERE id=$1 AND company_id=$2`,
        [input.frId, input.companyId]
      );
    }

    // Sync planejamento_medicoes → resetar competência para pendente
    if (input.projetoId && input.competencia) {
      await dbExecute(db,
        `UPDATE planejamento_medicoes
         SET valor_medido=0, status='pendente', atualizado_em=NOW()
         WHERE projeto_id=$1 AND competencia=$2`,
        [input.projetoId, input.competencia]
      );
    }
    await createAuditLog({ action: "cancelar_baixa", userId: ctx.user?.id, companyId: input.companyId,
      details: `Cancelamento recebimento fr_id=${input.frId}` });
    return { ok: true };
  }),

  // ─────────────────── OBRIGAÇÕES FISCAIS ───────────────────

  getTaxObligations: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    mesCompetencia: z.string().optional(),
    status: z.string().optional(),
    tipo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds: string[] = [`company_id IN (${inlineIds(ids)})`];
    const vals: any[] = [];
    let i = 1;
    if (input.mesCompetencia) { conds.push(`mes_competencia=$${i++}`); vals.push(input.mesCompetencia); }
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    if (input.tipo) { conds.push(`tipo=$${i++}`); vals.push(input.tipo); }
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", tipo, mes_competencia AS "mesCompetencia",
              base_calculo AS "baseCalculo", aliquota, valor_principal AS "valorPrincipal",
              valor_multa AS "valorMulta", valor_juros AS "valorJuros", valor_total AS "valorTotal",
              data_vencimento AS "dataVencimento", data_pagamento AS "dataPagamento",
              codigo_receita AS "codigoReceita", codigo_barras AS "codigoBarras",
              guia_url AS "guiaUrl", status, gerada_automaticamente AS "geradaAutomaticamente",
              created_at AS "createdAt"
       FROM financial_tax_obligations
       WHERE ${conds.join(" AND ")}
       ORDER BY data_vencimento ASC`,
      vals
    );
    return rows(res);
  }),

  createTaxObligation: protectedProcedure.input(z.object({
    companyId: z.number(),
    tipo: z.string(),
    mesCompetencia: z.string(),
    baseCalculo: z.number().optional(),
    aliquota: z.number().optional(),
    valorPrincipal: z.number(),
    valorMulta: z.number().default(0),
    valorJuros: z.number().default(0),
    dataVencimento: z.string(),
    codigoReceita: z.string().optional(),
    status: z.string().default("a_pagar"),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const valorTotal = input.valorPrincipal + input.valorMulta + input.valorJuros;
    const res = await dbExecute(db, 
      `INSERT INTO financial_tax_obligations
       (company_id, tipo, mes_competencia, base_calculo, aliquota, valor_principal,
        valor_multa, valor_juros, valor_total, data_vencimento, codigo_receita, status, gerada_automaticamente)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0) RETURNING id`,
      [input.companyId, input.tipo, input.mesCompetencia, input.baseCalculo ?? null,
       input.aliquota ?? null, input.valorPrincipal, input.valorMulta, input.valorJuros,
       valorTotal, input.dataVencimento, input.codigoReceita ?? null, input.status]
    );
    return { id: rows(res)[0]?.id };
  }),

  payTaxObligation: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    dataPagamento: z.string(),
    guiaUrl: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db, 
      `UPDATE financial_tax_obligations
       SET status='pago', data_pagamento=$1, guia_url=COALESCE($2,guia_url)
       WHERE id=$3 AND company_id=$4`,
      [input.dataPagamento, input.guiaUrl ?? null, input.id, input.companyId]
    );
    await createAuditLog({ action: "tax_obligation_paid", userId: ctx.user?.id, companyId: input.companyId, details: `Obrigação ${input.id} paga em ${input.dataPagamento}` });
    return { ok: true };
  }),

  // ─────────────────── CONFIGURAÇÃO TRIBUTÁRIA ───────────────────

  getTaxConfig: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await ensureTaxConfig(input.companyId);
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", regime_tributario AS "regimeTributario",
              anexo_simples AS "anexoSimples", aliquota_simples AS "aliquotaSimples",
              aliquota_iss AS "aliquotaISS", aliquota_pis AS "aliquotaPIS",
              aliquota_cofins AS "aliquotaCOFINS", aliquota_irpj AS "aliquotaIRPJ",
              aliquota_csll AS "aliquotaCSLL", aliquota_inss_empresa AS "aliquotaINSSEmpresa",
              aliquota_fgts AS "aliquotaFGTS", aliquota_rat AS "aliquotaRAT",
              aliquota_sistema AS "aliquotaSistema",
              dia_pagamento_iss AS "diaPagamentoISS", dia_pagamento_pis AS "diaPagamentoPIS",
              dia_pagamento_cofins AS "diaPagamentoCOFINS", dia_pagamento_darf AS "diaPagamentoDARF",
              dia_pagamento_gps AS "diaPagamentoGPS", dia_pagamento_fgts AS "diaPagamentoFGTS",
              COALESCE(auto_import_enabled,0) AS "autoImportEnabled"
       FROM financial_tax_config WHERE company_id=$1 LIMIT 1`,
      [input.companyId]
    );
    return rows(res)[0] ?? null;
  }),

  updateTaxConfig: protectedProcedure.input(z.object({
    companyId: z.number(),
    regimeTributario: z.string().optional(),
    anexoSimples: z.string().optional(),
    aliquotaSimples: z.number().optional(),
    aliquotaISS: z.number().optional(),
    aliquotaPIS: z.number().optional(),
    aliquotaCOFINS: z.number().optional(),
    aliquotaIRPJ: z.number().optional(),
    aliquotaCSLL: z.number().optional(),
    aliquotaINSSEmpresa: z.number().optional(),
    aliquotaFGTS: z.number().optional(),
    aliquotaRAT: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const parts: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const map: Record<string, string> = {
      regimeTributario: "regime_tributario",
      anexoSimples: "anexo_simples",
      aliquotaSimples: "aliquota_simples",
      aliquotaISS: "aliquota_iss",
      aliquotaPIS: "aliquota_pis",
      aliquotaCOFINS: "aliquota_cofins",
      aliquotaIRPJ: "aliquota_irpj",
      aliquotaCSLL: "aliquota_csll",
      aliquotaINSSEmpresa: "aliquota_inss_empresa",
      aliquotaFGTS: "aliquota_fgts",
      aliquotaRAT: "aliquota_rat",
    };
    for (const [k, col] of Object.entries(map)) {
      if ((input as any)[k] !== undefined) {
        parts.push(`${col}=$${i++}`);
        vals.push((input as any)[k]);
      }
    }
    if (!parts.length) return { ok: true };
    vals.push(input.companyId);
    await dbExecute(db, 
      `UPDATE financial_tax_config SET ${parts.join(",")}, updated_at=NOW() WHERE company_id=$${i}`,
      vals
    );
    await createAuditLog({ action: "tax_config_updated", userId: ctx.user?.id, companyId: input.companyId, details: "Configuração tributária atualizada" });
    return { ok: true };
  }),

  // Rev. 3183 — Toggle por empresa: liga/desliga a importação automática de dados financeiros
  // (job agendado + gatilhos em tempo real). DEFAULT OFF — o usuário decide explicitamente.
  setAutoImport: protectedProcedure.input(z.object({
    companyId: z.number(),
    enabled: z.boolean(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await ensureTaxConfig(input.companyId);
    await dbExecute(db,
      `UPDATE financial_tax_config SET auto_import_enabled=$1, updated_at=NOW() WHERE company_id=$2`,
      [input.enabled ? 1 : 0, input.companyId]
    );
    await createAuditLog({
      action: "financial_auto_import_toggled",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Importação automática financeira ${input.enabled ? "ATIVADA" : "DESATIVADA"}`,
    });
    return { ok: true, enabled: input.enabled };
  }),

  // ─────────────────── CENTROS DE CUSTO ───────────────────

  getCostCenters: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    // Rev. 2088 — quando true, retorna ATIVOS + INATIVOS (tela de gestão).
    // Default false p/ preservar comportamento de selects/comboboxes existentes
    // (lançamentos, categorias etc.) que esperam só ativos.
    includeInactive: z.boolean().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const ativoFilter = input.includeInactive ? "" : "AND ativo=1";
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", codigo, nome, tipo, obra_id AS "obraId",
              responsavel_nome AS "responsavelNome", orcamento_mensal AS "orcamentoMensal", ativo
       FROM financial_cost_centers WHERE company_id IN (${inlineIds(ids)}) ${ativoFilter} ORDER BY codigo ASC`,
      []
    );
    return rows(res);
  }),

  // Rev. 2084 — `codigo` agora opcional; se ausente, gera `CC-{nnnn}` via MAX
  // (mesmo padrão de createAccount/AUTO-{nnnn} introduzido na Rev. 2082).
  createCostCenter: protectedProcedure.input(z.object({
    companyId: z.number(),
    codigo: z.string().optional(),
    nome: z.string().min(2),
    tipo: z.string(),
    obraId: z.number().optional(),
    responsavelNome: z.string().optional(),
    orcamentoMensal: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    let codigo = (input.codigo ?? "").trim();
    if (!codigo) {
      const maxRes = await dbExecute(db,
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(codigo, '\\D', '', 'g') AS INTEGER)), 0) AS m
         FROM financial_cost_centers
         WHERE company_id=$1 AND codigo ~ '^CC-[0-9]+$'`,
        [input.companyId]
      );
      const next = (rows(maxRes)[0]?.m ?? 0) + 1;
      codigo = `CC-${String(next).padStart(4, "0")}`;
    }
    const res = await dbExecute(db,
      `INSERT INTO financial_cost_centers (company_id, codigo, nome, tipo, obra_id, responsavel_nome, orcamento_mensal, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1) RETURNING id, codigo`,
      [input.companyId, codigo, normalizarNomeCC(input.nome), input.tipo, input.obraId ?? null,
       input.responsavelNome ?? null, input.orcamentoMensal ?? null]
    );
    return { id: rows(res)[0]?.id, codigo: rows(res)[0]?.codigo };
  }),

  // Rev. 2088 — Editar / inativar / reativar Centro de Custo.
  // Sem DELETE (R-007): inativação é soft (ativo=0). Campos opcionais —
  // só atualiza o que vier no input, igual ao updateAccount.
  updateCostCenter: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    nome: z.string().min(2).optional(),
    tipo: z.string().optional(),
    obraId: z.number().nullable().optional(),
    responsavelNome: z.string().nullable().optional(),
    orcamentoMensal: z.number().nullable().optional(),
    ativo: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (input.nome !== undefined)             { sets.push(`nome=$${i++}`);              vals.push(normalizarNomeCC(input.nome)); }
    if (input.tipo !== undefined)             { sets.push(`tipo=$${i++}`);              vals.push(input.tipo); }
    if (input.obraId !== undefined)           { sets.push(`obra_id=$${i++}`);           vals.push(input.obraId); }
    if (input.responsavelNome !== undefined)  { sets.push(`responsavel_nome=$${i++}`);  vals.push(input.responsavelNome); }
    if (input.orcamentoMensal !== undefined)  { sets.push(`orcamento_mensal=$${i++}`);  vals.push(input.orcamentoMensal); }
    if (input.ativo !== undefined)            { sets.push(`ativo=$${i++}`);             vals.push(input.ativo ? 1 : 0); }
    if (sets.length === 0) return { ok: true, noop: true };
    vals.push(input.id, input.companyId);
    const res = await dbExecute(db,
      `UPDATE financial_cost_centers SET ${sets.join(", ")} WHERE id=$${i++} AND company_id=$${i++} RETURNING id`,
      vals
    );
    if (rows(res).length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Centro de custo não encontrado" });
    return { ok: true };
  }),

  // Rev. 2164 — Lista vínculos de um Centro de Custo (categorias +
  // contadores de lançamentos/recorrências). Usado pelo AlertDialog
  // de exclusão pra mostrar exatamente o que está pendurado e
  // permitir o usuário reapontar antes de excluir.
  getCostCenterLinks: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    let categorias: any[] = [];
    let nEnt = 0, nRec = 0;
    try {
      const r = await dbExecute(db,
        `SELECT id, codigo, nome, tipo, ativo
           FROM financial_accounts
          WHERE company_id=$1 AND centro_custo_id=$2
          ORDER BY ativo DESC, codigo ASC`,
        [input.companyId, input.id]);
      categorias = rows(r);
    } catch (e: any) {
      console.warn(`[getCostCenterLinks] skip accounts:`, e?.message);
    }
    try {
      const r = await dbExecute(db,
        `SELECT COUNT(*)::int AS n FROM financial_entries
          WHERE company_id=$1 AND conta_id IN
            (SELECT id FROM financial_accounts WHERE centro_custo_id=$2)`,
        [input.companyId, input.id]);
      nEnt = rows(r)[0]?.n ?? 0;
    } catch (e: any) {
      console.warn(`[getCostCenterLinks] skip entries:`, e?.message);
    }
    try {
      const r = await dbExecute(db,
        `SELECT COUNT(*)::int AS n FROM financial_recurring_entries WHERE centro_custo_id=$1`,
        [input.id]);
      nRec = rows(r)[0]?.n ?? 0;
    } catch (e: any) {
      console.warn(`[getCostCenterLinks] skip recurring (coluna pode não existir):`, e?.message);
    }
    return { categorias, nEntries: nEnt, nRecurring: nRec, total: categorias.length + nEnt + nRec };
  }),

  // Rev. 2156 — Excluir definitivamente Centro de Custo (ADM Master).
  // Pedido user: "preciso ter um botao para excluir (apenas para login
  // adm master)". Hard-delete gated em ctx.user.role==='admin_master',
  // com checagem prévia de referências em financial_recurring_entries e
  // financial_accounts (centro_custo_id). Se houver vínculo, recusa
  // com mensagem explicativa pedindo pra inativar (Power) em vez de
  // excluir — preserva integridade referencial em prod.
  deleteCostCenter: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).mutation(async ({ ctx, input }) => {
    if ((ctx as any).user?.role !== 'admin_master') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas ADM Master pode excluir centros de custo.' });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Confirma escopo de empresa
    const ccRes = await dbExecute(db,
      `SELECT id, nome, codigo FROM financial_cost_centers WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    const cc = rows(ccRes)[0];
    if (!cc) throw new TRPCError({ code: "NOT_FOUND", message: "Centro de custo não encontrado nesta empresa." });
    // Checa referências em financial_accounts (categorias) e
    // financial_entries (lançamentos). Wrapping em try/catch porque
    // nem todas as instalações têm a coluna centro_custo_id em
    // todas as tabelas (Rev. 2082 só garantiu em financial_accounts).
    // Coluna ausente ⇒ trata como 0 refs em vez de explodir a request
    // com "column does not exist" (que chegava no browser como JSON
    // vazio — bug reportado Rev. 2163).
    let nAcc = 0, nEnt = 0, nRec = 0;
    try {
      const r = await dbExecute(db,
        `SELECT COUNT(*)::int AS n FROM financial_accounts WHERE centro_custo_id=$1`,
        [input.id]);
      nAcc = rows(r)[0]?.n ?? 0;
    } catch (e: any) {
      console.warn(`[deleteCostCenter] skip financial_accounts ref check:`, e?.message);
    }
    try {
      const r = await dbExecute(db,
        `SELECT COUNT(*)::int AS n FROM financial_entries WHERE conta_id IN (SELECT id FROM financial_accounts WHERE centro_custo_id=$1)`,
        [input.id]);
      nEnt = rows(r)[0]?.n ?? 0;
    } catch (e: any) {
      console.warn(`[deleteCostCenter] skip financial_entries ref check:`, e?.message);
    }
    try {
      const r = await dbExecute(db,
        `SELECT COUNT(*)::int AS n FROM financial_recurring_entries WHERE centro_custo_id=$1`,
        [input.id]);
      nRec = rows(r)[0]?.n ?? 0;
    } catch (e: any) {
      console.warn(`[deleteCostCenter] skip financial_recurring_entries ref check (coluna pode não existir):`, e?.message);
    }
    if (nRec > 0 || nAcc > 0 || nEnt > 0) {
      const partes: string[] = [];
      if (nAcc > 0) partes.push(`${nAcc} categoria(s) financeira(s)`);
      if (nEnt > 0) partes.push(`${nEnt} lançamento(s)`);
      if (nRec > 0) partes.push(`${nRec} recorrência(s)`);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Não foi possível excluir "${cc.codigo} — ${cc.nome}": ainda existem ${partes.join(', ')} vinculados. Inative o centro (botão "Power") em vez de excluir.`,
      });
    }
    await dbExecute(db,
      `DELETE FROM financial_cost_centers WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    return { ok: true, id: input.id, codigo: cc.codigo, nome: cc.nome };
  }),

  // ─────────────────── MEDIÇÕES DE OBRA ───────────────────

  getMedicoes: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number().optional(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conds: string[] = [`company_id=$1`];
    const vals: any[] = [input.companyId];
    let i = 2;
    if (input.obraId) { conds.push(`obra_id=$${i++}`); vals.push(input.obraId); }
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", obra_id AS "obraId", numero, data_referencia AS "dataReferencia",
              percentual_acumulado AS "percentualAcumulado", percentual_periodo AS "percentualPeriodo",
              valor_contrato AS "valorContrato", valor_medicao AS "valorMedicao",
              valor_acumulado AS "valorAcumulado", status, aprovado_por_id AS "aprovadoPorId",
              revenue_id AS "revenueId", observacoes, created_at AS "createdAt"
       FROM obra_medicoes WHERE ${conds.join(" AND ")} ORDER BY numero DESC`,
      vals
    );
    return rows(res);
  }),

  createMedicao: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    numero: z.number(),
    dataReferencia: z.string(),
    percentualPeriodo: z.number().optional(),
    percentualAcumulado: z.number().optional(),
    valorContrato: z.number().optional(),
    valorMedicao: z.number(),
    valorAcumulado: z.number().optional(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
      `INSERT INTO obra_medicoes (company_id, obra_id, numero, data_referencia, percentual_periodo,
       percentual_acumulado, valor_contrato, valor_medicao, valor_acumulado, status, observacoes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'rascunho',$10,NOW(),NOW()) RETURNING id`,
      [input.companyId, input.obraId, input.numero, input.dataReferencia,
       input.percentualPeriodo ?? null, input.percentualAcumulado ?? null,
       input.valorContrato ?? null, input.valorMedicao, input.valorAcumulado ?? null,
       input.observacoes ?? null]
    );
    return { id: rows(res)[0]?.id };
  }),

  // ─────────────────── CONTAS BANCÁRIAS ───────────────────

  getBankAccounts: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    for (const cid of ids) await _assertFinanceiroCompanyAccess(ctx.user, cid);
    // Rev. 3876 — inclui cheque especial + saldo acumulado (saldo abertura + total extrato).
    const res = await dbExecute(db,
      `SELECT cba.id, cba."companyId", cba.banco, cba."codigoBanco", cba.agencia, cba.conta,
              cba."tipoConta" AS tipo, cba.apelido AS descricao, cba.ativo, cba."temTalao", cba."caixaInterno",
              COALESCE(cba.cheque_especial_ativo, 0) AS "chequeEspecialAtivo",
              COALESCE(cba.cheque_especial_limite::numeric, 0)::float AS "chequeEspecialLimite",
              COALESCE((SELECT SUM(valor) FROM bank_statement_lines
                         WHERE conta_bancaria_id=cba.id AND company_id=cba."companyId" AND excluido_em IS NULL), 0)
              + COALESCE((SELECT valor FROM financial_opening_balances
                           WHERE conta_bancaria_id=cba.id AND company_id=cba."companyId" LIMIT 1), 0)
              AS "saldoAtual"
       FROM company_bank_accounts cba
       WHERE cba."companyId" IN (${inlineIds(ids)}) AND cba."deletedAt" IS NULL AND cba.ativo = 1
       ORDER BY cba.banco ASC`,
      []
    );
    return rows(res);
  }),

  // ─────────────────── SÓCIOS / PRÓ-LABORE ───────────────────

  getPartners: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", nome, cpf, cargo,
              percentual_sociedade AS "percentualSociedade",
              valor_pro_labore AS "valorProLabore",
              dia_vencimento AS "diaVencimento", pix_chave AS "pixChave", ativo
       FROM company_partners WHERE company_id=$1 AND ativo=1 ORDER BY nome ASC`,
      [input.companyId]
    );
    return rows(res);
  }),

  // Rev. 2093 — Lista funcionários com tipoContrato='Socio' (módulo Colaboradores)
  // para popular o seletor do modal "Novo Sócio" (evita re-digitar dados que já
  // existem). Marca `jaCadastrado=true` quando o CPF já está em company_partners
  // (matching com CPF normalizado: só dígitos). Sem ALTER/ADD — usa o CPF como
  // chave natural (R-001/R-007).
  listSociosFromEmployees: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
      `SELECT
         e.id, e."nomeCompleto" AS "nomeCompleto", e.cpf, e.cargo,
         e."tipoContrato" AS "tipoContrato",
         (
           SELECT 1 FROM company_partners cp
           WHERE cp.company_id = $1
             AND cp.ativo = 1
             AND regexp_replace(COALESCE(cp.cpf,''), '[^0-9]', '', 'g')
               = regexp_replace(COALESCE(e.cpf,''),  '[^0-9]', '', 'g')
             AND regexp_replace(COALESCE(e.cpf,''),  '[^0-9]', '', 'g') <> ''
           LIMIT 1
         ) IS NOT NULL AS "jaCadastrado"
       FROM employees e
       WHERE e."companyId" = $1
         AND e."tipoContrato" = 'Socio'
       ORDER BY e."nomeCompleto" ASC`,
      [input.companyId]
    );
    return rows(res);
  }),

  // ─────────────────── SÓCIO ADMINISTRADOR (assina contratos/docs online) ───────────────────
  // Rev. 3049 — Critério exclusivo de sócios: define qual sócio é o "administrador
  // atual", responsável por assinar todos os contratos/documentos online
  // (IntegraSign/FCSign). Persiste em system_criteria (categoria 'societario',
  // chave 'socio_administrador_employee_id', valor = employee.id). ZERO ALTER/DROP/DELETE.

  getSocioAdministrador: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem consultar o sócio administrador." });
    }
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const cr = await dbExecute(db,
      `SELECT valor FROM system_criteria WHERE "companyId"=$1 AND chave='socio_administrador_employee_id' LIMIT 1`,
      [input.companyId]
    );
    const valor = rows(cr)[0]?.valor;
    const empId = valor ? Number(valor) : null;
    if (!empId || Number.isNaN(empId)) return { employeeId: null, nome: null, cpf: null, cargo: null };
    const er = await dbExecute(db,
      `SELECT id, "nomeCompleto" AS nome, cpf, cargo FROM employees WHERE id=$1 AND "companyId"=$2 AND "tipoContrato"='Socio' LIMIT 1`,
      [empId, input.companyId]
    );
    const e = rows(er)[0];
    if (!e) return { employeeId: null, nome: null, cpf: null, cargo: null };
    return { employeeId: e.id, nome: e.nome, cpf: e.cpf, cargo: e.cargo };
  }),

  setSocioAdministrador: protectedProcedure.input(z.object({
    companyId: z.number(),
    employeeId: z.number().nullable(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem definir o sócio administrador." });
    }
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (input.employeeId != null) {
      const chk = await dbExecute(db,
        `SELECT id FROM employees WHERE id=$1 AND "companyId"=$2 AND "tipoContrato"='Socio' LIMIT 1`,
        [input.employeeId, input.companyId]
      );
      if (!rows(chk).length) throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário não é sócio desta empresa." });
    }
    const valor = input.employeeId != null ? String(input.employeeId) : "";
    const quem = ctx.user?.name ?? "Sistema";
    const ex = await dbExecute(db,
      `SELECT id FROM system_criteria WHERE "companyId"=$1 AND chave='socio_administrador_employee_id' LIMIT 1`,
      [input.companyId]
    );
    const existing = rows(ex)[0];
    if (existing) {
      await dbExecute(db,
        `UPDATE system_criteria SET valor=$1, "atualizadoPor"=$2, "updatedAt"=NOW() WHERE id=$3`,
        [valor, quem, existing.id]
      );
    } else {
      await dbExecute(db,
        `INSERT INTO system_criteria ("companyId", categoria, chave, valor, descricao, unidade, "atualizadoPor")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [input.companyId, "societario", "socio_administrador_employee_id", valor,
         "Sócio administrador responsável por assinar contratos e documentos online (IntegraSign/FCSign).", "id", quem]
      );
    }
    return { ok: true };
  }),

  createPartner: protectedProcedure.input(z.object({
    companyId: z.number(),
    nome: z.string().min(2),
    cpf: z.string().optional(),
    cargo: z.string().optional(),
    percentualSociedade: z.number().optional(),
    valorProLabore: z.number().optional(),
    diaVencimento: z.number().default(5),
    pixChave: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem cadastrar sócios." });
    }
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
      `INSERT INTO company_partners (company_id, nome, cpf, cargo, percentual_sociedade, valor_pro_labore, dia_vencimento, pix_chave, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1) RETURNING id`,
      [input.companyId, input.nome, input.cpf ?? null, input.cargo ?? null,
       input.percentualSociedade ?? null, input.valorProLabore ?? null,
       input.diaVencimento, input.pixChave ?? null]
    );
    return { id: rows(res)[0]?.id };
  }),

  updatePartner: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    nome: z.string().optional(),
    cpf: z.string().optional(),
    cargo: z.string().optional(),
    percentualSociedade: z.number().optional(),
    valorProLabore: z.number().optional(),
    diaVencimento: z.number().optional(),
    pixChave: z.string().optional(),
    ativo: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar sócios." });
    }
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const parts: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const map: Record<string, string> = {
      nome: "nome", cpf: "cpf", cargo: "cargo",
      percentualSociedade: "percentual_sociedade", valorProLabore: "valor_pro_labore",
      diaVencimento: "dia_vencimento", pixChave: "pix_chave",
    };
    for (const [k, col] of Object.entries(map)) {
      if ((input as any)[k] !== undefined) { parts.push(`${col}=$${i++}`); vals.push((input as any)[k]); }
    }
    if (input.ativo !== undefined) { parts.push(`ativo=$${i++}`); vals.push(input.ativo ? 1 : 0); }
    if (!parts.length) return { ok: true };
    vals.push(input.id, input.companyId);
    await dbExecute(db, `UPDATE company_partners SET ${parts.join(",")}, updated_at=NOW() WHERE id=$${i++} AND company_id=$${i}`, vals);
    return { ok: true };
  }),

  // ─────────────────── SÓCIOS UNIFICADOS (Rev. 3051) ───────────────────
  // Fonte única do painel "Configurações → Sócios": o CADASTRO vem dos colaboradores
  // (employees tipoContrato='Socio') e os dados FINANCEIROS (pró-labore/%/PIX/venc.)
  // ficam em company_partners VINCULADOS por employee_id (fallback CPF normalizado).
  // Lista cada sócio do RH já mesclado com seu registro financeiro (se houver).
  listSociosUnificado: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db,
      `SELECT
         e.id AS "employeeId", e."nomeCompleto" AS "nomeCompleto", e.cpf, e.cargo,
         cp.id AS "partnerId",
         cp.percentual_sociedade AS "percentualSociedade",
         cp.valor_pro_labore AS "valorProLabore",
         cp.dia_vencimento AS "diaVencimento",
         cp.pix_chave AS "pixChave"
       FROM employees e
       LEFT JOIN LATERAL (
         SELECT * FROM company_partners c
         WHERE c.company_id = $1 AND c.ativo = 1
           AND (
             c.employee_id = e.id
             OR (
               c.employee_id IS NULL
               AND regexp_replace(COALESCE(c.cpf,''), '[^0-9]', '', 'g')
                 = regexp_replace(COALESCE(e.cpf,''),  '[^0-9]', '', 'g')
               AND regexp_replace(COALESCE(e.cpf,''),  '[^0-9]', '', 'g') <> ''
             )
           )
         ORDER BY (c.employee_id = e.id) DESC, c.id ASC
         LIMIT 1
       ) cp ON TRUE
       WHERE e."companyId" = $2
         AND e."tipoContrato" = 'Socio'
       ORDER BY e."nomeCompleto" ASC`,
      [input.companyId, input.companyId]
    );
    return rows(res);
  }),

  // Upsert dos dados financeiros de um sócio, ancorado no colaborador (employee_id).
  // Reaproveita um registro company_partners existente (por employee_id ou CPF) e o
  // re-vincula; senão cria um novo já com employee_id + nome/cpf/cargo do RH.
  // ZERO ALTER/DROP/DELETE — só INSERT/UPDATE. Tenant guard + valida que o employee
  // é sócio desta empresa (evita IDOR).
  upsertPartnerByEmployee: protectedProcedure.input(z.object({
    companyId: z.number(),
    employeeId: z.number(),
    percentualSociedade: z.number().nullable().optional(),
    valorProLabore: z.number().nullable().optional(),
    diaVencimento: z.number().nullable().optional(),
    pixChave: z.string().nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem editar os dados financeiros dos sócios." });
    }
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const empR = await dbExecute(db,
      `SELECT id, "nomeCompleto" AS nome, cpf, cargo FROM employees
       WHERE id=$1 AND "companyId"=$2 AND "tipoContrato"='Socio' LIMIT 1`,
      [input.employeeId, input.companyId]
    );
    const emp = rows(empR)[0];
    if (!emp) throw new TRPCError({ code: "BAD_REQUEST", message: "Colaborador não é sócio desta empresa." });

    const perc = input.percentualSociedade ?? null;
    const prol = input.valorProLabore ?? null;
    const venc = input.diaVencimento ?? 5;
    const pix = (input.pixChave ?? "").trim() || null;
    const cpfLimpo = String(emp.cpf ?? "").replace(/[^0-9]/g, "");

    // Procura registro existente: 1º por employee_id; 2º por CPF (legado sem vínculo).
    const findR = await dbExecute(db,
      `SELECT id FROM company_partners
       WHERE company_id=$1 AND ativo=1
         AND (
           employee_id=$2
           OR (employee_id IS NULL AND $3 <> ''
               AND regexp_replace(COALESCE(cpf,''),'[^0-9]','','g')=$4)
         )
       ORDER BY (employee_id=$5) DESC, id ASC LIMIT 1`,
      [input.companyId, input.employeeId, cpfLimpo, cpfLimpo, input.employeeId]
    );
    const existing = rows(findR)[0];
    if (existing) {
      await dbExecute(db,
        `UPDATE company_partners SET
           employee_id=$1, nome=$2, cpf=$3, cargo=$4,
           percentual_sociedade=$5, valor_pro_labore=$6, dia_vencimento=$7, pix_chave=$8,
           updated_at=NOW()
         WHERE id=$9 AND company_id=$10`,
        [input.employeeId, emp.nome, emp.cpf ?? null, emp.cargo ?? null,
         perc, prol, venc, pix, existing.id, input.companyId]
      );
      return { id: existing.id, created: false };
    }
    const insR = await dbExecute(db,
      `INSERT INTO company_partners
         (company_id, employee_id, nome, cpf, cargo, percentual_sociedade, valor_pro_labore, dia_vencimento, pix_chave, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1) RETURNING id`,
      [input.companyId, input.employeeId, emp.nome, emp.cpf ?? null, emp.cargo ?? null,
       perc, prol, venc, pix]
    );
    return { id: rows(insR)[0]?.id, created: true };
  }),

  // ─────────────────── ORÇAMENTO ANUAL ───────────────────

  getBudget: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
    obraId: z.number().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conds = [`company_id=$1`, `ano=$2`];
    const vals: any[] = [input.companyId, input.ano];
    if (input.obraId) { conds.push(`obra_id=$3`); vals.push(input.obraId); }
    const res = await dbExecute(db, 
      `SELECT b.id, b.ano, b.mes, b.conta_id AS "contaId", b.obra_id AS "obraId",
              b.valor_orcado AS "valorOrcado", b.observacoes,
              fa.nome AS "contaNome", fa.tipo AS "contaTipo"
       FROM financial_budget b
       LEFT JOIN financial_accounts fa ON fa.id=b.conta_id
       WHERE ${conds.join(" AND ")} ORDER BY b.mes ASC, fa.ordem ASC`,
      vals
    );
    return rows(res);
  }),

  upsertBudget: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
    mes: z.number(),
    contaId: z.number().optional(),
    obraId: z.number().optional(),
    valorOrcado: z.number(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const existing = await dbExecute(db, 
      `SELECT id FROM financial_budget WHERE company_id=$1 AND ano=$2 AND mes=$3 AND (conta_id=$4 OR ($4 IS NULL AND conta_id IS NULL)) LIMIT 1`,
      [input.companyId, input.ano, input.mes, input.contaId ?? null]
    );
    if (rows(existing).length > 0) {
      await dbExecute(db, 
        `UPDATE financial_budget SET valor_orcado=$1, observacoes=COALESCE($2,observacoes), updated_at=NOW()
         WHERE company_id=$3 AND ano=$4 AND mes=$5 AND (conta_id=$6 OR ($6 IS NULL AND conta_id IS NULL))`,
        [input.valorOrcado, input.observacoes ?? null, input.companyId, input.ano, input.mes, input.contaId ?? null]
      );
    } else {
      await dbExecute(db, 
        `INSERT INTO financial_budget (company_id, ano, mes, conta_id, obra_id, valor_orcado, observacoes, criado_por_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [input.companyId, input.ano, input.mes, input.contaId ?? null, input.obraId ?? null,
         input.valorOrcado, input.observacoes ?? null, ctx.user?.id ?? null]
      );
    }
    return { ok: true };
  }),

  // ─────────────────── AUTO-IMPORTAÇÃO ───────────────────

  runAutoImport: protectedProcedure.input(z.object({
    companyId: z.number(),
    mesCompetencia: z.string().optional(),
  })).mutation(async ({ input }) => {
    const result = await runAllAutoImports(input.companyId, input.mesCompetencia);
    return result;
  }),

  // ─────────────────── CONCILIAÇÃO BANCÁRIA ───────────────────

  getBankStatements: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
    conciliado: z.boolean().optional(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const conds = [`company_id=$1`, `conta_bancaria_id=$2`, `excluido_em IS NULL`];
    const vals: any[] = [input.companyId, input.contaBancariaId];
    let i = 3;
    if (input.dataInicio) { conds.push(`data>=$${i++}`); vals.push(input.dataInicio); }
    if (input.dataFim) { conds.push(`data<=$${i++}`); vals.push(input.dataFim); }
    if (input.conciliado !== undefined) { conds.push(`conciliado=$${i++}`); vals.push(input.conciliado ? 1 : 0); }
    const res = await dbExecute(db, 
      `SELECT id, data, descricao, valor, tipo, saldo_apos AS "saldoApos", conciliado, entry_id AS "entryId"
       FROM bank_statement_lines WHERE ${conds.join(" AND ")} ORDER BY data DESC, id DESC`,
      vals
    );
    const stmtLines = rows(res);
    // Rev. 3864 — enriquecer com NF# vinculada (stmt_line_id direto OU entry_id indireto)
    if (stmtLines.length > 0) {
      const lineIds = stmtLines.map((l: any) => Number(l.id)).filter(Boolean);
      const entryIds = stmtLines.map((l: any) => Number(l.entryId)).filter(Boolean);
      const nfQ = await db.$client.query(
        `SELECT fn.stmt_line_id AS sid, fn.entry_id AS eid, fn.numero_nf AS "nfNumero"
         FROM fiscal_notes fn
         WHERE fn.company_id = $1
           AND (fn.stmt_line_id = ANY($2::int[]) OR fn.entry_id = ANY($3::int[]))
         ORDER BY (fn.stmt_line_id IS NOT NULL) DESC`,
        [input.companyId, lineIds.length ? lineIds : [0], entryIds.length ? entryIds : [0]]
      );
      const byLine = new Map<number, string>();
      const byEntry = new Map<number, string>();
      for (const r of nfQ.rows) {
        const sid = r.sid ? Number(r.sid) : null;
        const eid = r.eid ? Number(r.eid) : null;
        if (sid && !byLine.has(sid)) byLine.set(sid, r.nfNumero);
        if (eid && !byEntry.has(eid)) byEntry.set(eid, r.nfNumero);
      }
      for (const s of stmtLines) {
        (s as any).nfNumero = byLine.get(Number(s.id)) ?? (s.entryId ? byEntry.get(Number(s.entryId)) : null) ?? null;
      }
    }
    return stmtLines;
  }),

  // Rev. 3365 — STATUS POR MÊS p/ pintar as bolinhas da timeline de meses. Antes a tela
  // usava getBankStatements do ano da CONTA SELECIONADA (enabled só com conta escolhida),
  // então na visão "lista de contas" (sem conta selecionada) TODOS os meses ficavam cinza
  // mesmo havendo extrato. Aqui agregamos por mês do ano para a EMPRESA inteira (ou só
  // para uma conta, se informada), independente de conta selecionada. READ-ONLY.
  getBankStatementsMonthlyStatus: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
    contaBancariaId: z.number().optional(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // dbExecute liga params por ORDEM DE APARIÇÃO do $N. Mantemos a ordem:
    // [companyId, dataInicio, dataFim, (contaBancariaId)].
    const conds = [`company_id=$1`, `data>=$2`, `data<=$3`, `excluido_em IS NULL`, `desconsiderado_em IS NULL`];
    const vals: any[] = [input.companyId, `${input.ano}-01-01`, `${input.ano}-12-31`];
    if (input.contaBancariaId) { conds.push(`conta_bancaria_id=$4`); vals.push(input.contaBancariaId); }
    const res = await dbExecute(db,
      `SELECT EXTRACT(MONTH FROM data)::int AS mes,
              COUNT(*)::int AS total,
              SUM(CASE WHEN COALESCE(conciliado,0)=1 THEN 1 ELSE 0 END)::int AS conciliadas
         FROM bank_statement_lines
        WHERE ${conds.join(" AND ")}
        GROUP BY 1`,
      vals
    );
    return rows(res).map((r: any) => {
      const total = Number(r.total) || 0;
      const conciliadas = Number(r.conciliadas) || 0;
      return {
        mes: Number(r.mes),
        total,
        conciliadas,
        status: total === 0 ? "vazio" : conciliadas >= total ? "consolidado" : "lancamento",
      };
    });
  }),

  // Rev. 3178 — RELATÓRIO DE CONCILIAÇÃO (read-only) para o Workspace full-screen e PDF.
  // Devolve, para a conta + período: (1) linhas do extrato JÁ conciliadas com o lançamento
  // casado (descrição/fornecedor/valor/data), (2) linhas do extrato AINDA sem lançamento
  // ("o que falta") e (3) lançamentos do sistema sem extrato no período. Tenant guard.
  getConciliacaoReport: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Rev. 3390 — aplica a mesma classificação "interno" que o Panorama Geral já usa,
    // p/ o drill-in de conta individual também receber o flag e o front exibir o badge.
    const internoCfg = await _loadInternoConfig(db, input.companyId);
    const rep = await _computeConciliacaoReport(db, input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim);
    return {
      ...rep,
      extratoSemLancamento: rep.extratoSemLancamento.map((r: any) => ({
        ...r,
        interno: _isLancInternoRow(r, internoCfg),
        overrideNatureza: internoCfg.overrides.get(Number(r.id)) ?? null,
      })),
    };
  }),

  // Rev. 3398 — CAIXA INTERNO: lista todas as entradas de uma conta "caixa" (sem extrato).
  // Retorna entries divididas em: a_confirmar (conciliado=0) e confirmadas (conciliado=1).
  // READ-ONLY — não concilia nem baixa nada.
  getEntradasCaixaInterno: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Verifica que a conta existe, pertence à empresa e é caixaInterno.
    const contaRes = await dbExecute(db,
      `SELECT id, "caixaInterno" FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [input.contaBancariaId, input.companyId]);
    const conta = rows(contaRes)[0] as any;
    if (!conta) throw new TRPCError({ code: "NOT_FOUND", message: "Conta bancária não encontrada." });
    if (Number(conta.caixaInterno) !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta conta não é do tipo Caixa Interno." });
    const res = await dbExecute(db,
      `SELECT e.id,
              e.data_competencia    AS "dataCompetencia",
              e.descricao,
              e.tipo,
              e.natureza,
              e.valor_previsto      AS "valorPrevisto",
              e.valor_realizado     AS "valorRealizado",
              e.status,
              e.conciliado,
              e.fornecedor_nome     AS "fornecedorNome",
              e.cliente_nome        AS "clienteNome",
              e.obra_nome           AS "obraNome",
              e.forma_pagamento     AS "formaPagamento",
              e.criado_por_nome     AS "criadoPorNome",
              e.created_at          AS "createdAt"
         FROM financial_entries e
        WHERE e.company_id = $1
          AND e.conta_bancaria_id = $2
          AND e.status <> 'cancelado'
          AND e.data_competencia >= $3
          AND e.data_competencia <= $4
        ORDER BY e.data_competencia DESC, e.id DESC`,
      [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
    const entries = rows(res) as any[];
    const aConfirmar = entries.filter(e => Number(e.conciliado) !== 1);
    const confirmadas = entries.filter(e => Number(e.conciliado) === 1);
    const totalEntradas = entries.filter(e => e.tipo === "receita").reduce((s, e) => s + Math.abs(Number(e.valorRealizado ?? e.valorPrevisto) || 0), 0);
    const totalSaidas   = entries.filter(e => e.tipo === "despesa").reduce((s, e) => s + Math.abs(Number(e.valorRealizado ?? e.valorPrevisto) || 0), 0);
    return { aConfirmar, confirmadas, totalEntradas, totalSaidas, total: entries.length };
  }),

  // Rev. 3735 — ALERTA DE DUPLICIDADE no "Novo lançamento" do Caixa Interno. READ-ONLY:
  // dado conta + valor + data, devolve lançamentos NÃO cancelados já existentes na MESMA
  // conta com o MESMO valor (|previsto| ou |realizado|) e a MESMA data de competência.
  // O frontend usa isso só para AVISAR antes de criar (regra de ouro: não bloqueia/aplica
  // nada sozinho — o usuário decide criar mesmo assim ou cancelar).
  checkDuplicataCaixaInterno: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    valor: z.number(),
    dataCompetencia: z.string(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const valor = Math.abs(Number(input.valor) || 0);
    if (!valor) return { matches: [] as any[] };
    // dbExecute liga params por ORDEM DE APARIÇÃO do $N; o valor aparece 2x → $4 e $5
    // distintos (placeholder repetido quebra o split). data castada p/ ::date dos dois lados.
    const res = await dbExecute(db,
      `SELECT e.id,
              e.descricao,
              e.fornecedor_nome  AS "fornecedorNome",
              e.cliente_nome     AS "clienteNome",
              e.tipo,
              e.status,
              e.conciliado,
              e.valor_previsto   AS "valorPrevisto",
              e.valor_realizado  AS "valorRealizado",
              e.data_competencia AS "dataCompetencia",
              e.origem_modulo    AS "origemModulo"
         FROM financial_entries e
        WHERE e.company_id = $1
          AND e.conta_bancaria_id = $2
          AND e.status <> 'cancelado'
          AND e.data_competencia::date = $3::date
          AND (ABS(e.valor_previsto) = $4 OR ABS(e.valor_realizado) = $5)
        ORDER BY e.conciliado DESC, e.id DESC
        LIMIT 20`,
      [input.companyId, input.contaBancariaId, input.dataCompetencia, valor, valor]);
    return { matches: rows(res) as any[] };
  }),

  // Rev. 3398 — confirmar entrada de caixa interno: marca conciliado=1 sem extrato bancário.
  confirmarEntradaCaixa: protectedProcedure.input(z.object({
    companyId: z.number(),
    entryId: z.number(),
    // Rev. 3445 — obrigatório quando o lançamento é "sem conta" (conta_bancaria_id IS NULL);
    // será vinculado à conta Caixa Interno informada e conciliado em seguida.
    contaBancariaId: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Verifica a entry existe e pertence à empresa (LEFT JOIN p/ aceitar sem-conta).
    const entryRes = await dbExecute(db,
      `SELECT e.id, e.conta_bancaria_id AS "contaBancariaId", cba."caixaInterno"
         FROM financial_entries e
         LEFT JOIN company_bank_accounts cba ON cba.id = e.conta_bancaria_id
        WHERE e.id=$1 AND e.company_id=$2 AND e.status<>'cancelado' LIMIT 1`,
      [input.entryId, input.companyId]);
    const entry = rows(entryRes)[0] as any;
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
    if (entry.contaBancariaId != null) {
      // Lançamento já tem conta — deve ser caixaInterno (comportamento original).
      if (Number(entry.caixaInterno) !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta conta não é do tipo Caixa Interno." });
      await dbExecute(db,
        `UPDATE financial_entries SET conciliado=1, data_conciliacao=CURRENT_DATE, conciliado_em=NOW(), conciliado_por_id=$1, conciliado_por_nome=$2 WHERE id=$3 AND company_id=$4`,
        [ctx.user?.id ?? null, ctx.user?.name ?? null, input.entryId, input.companyId]);
    } else {
      // Rev. 3445 — sem conta: vincular à conta Caixa Interno informada e confirmar.
      if (!input.contaBancariaId) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a conta caixa para vincular este lançamento." });
      const cbaRes = await dbExecute(db,
        `SELECT id FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2 AND "caixaInterno"=1 LIMIT 1`,
        [input.contaBancariaId, input.companyId]);
      if (rows(cbaRes).length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta caixa inválida ou não é do tipo Caixa Interno." });
      await dbExecute(db,
        `UPDATE financial_entries SET conciliado=1, data_conciliacao=CURRENT_DATE, conciliado_em=NOW(), conciliado_por_id=$1, conciliado_por_nome=$2, conta_bancaria_id=$3 WHERE id=$4 AND company_id=$5`,
        [ctx.user?.id ?? null, ctx.user?.name ?? null, input.contaBancariaId, input.entryId, input.companyId]);
    }
    return { success: true };
  }),

  // Rev. 3398 — desfazer confirmação de entrada de caixa interno.
  desconciliarEntradaCaixa: protectedProcedure.input(z.object({
    companyId: z.number(),
    entryId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const entryRes = await dbExecute(db,
      `SELECT e.id, cba."caixaInterno"
         FROM financial_entries e
         JOIN company_bank_accounts cba ON cba.id = e.conta_bancaria_id
        WHERE e.id=$1 AND e.company_id=$2 LIMIT 1`,
      [input.entryId, input.companyId]);
    const entry = rows(entryRes)[0] as any;
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
    if (Number(entry.caixaInterno) !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta conta não é do tipo Caixa Interno." });
    await dbExecute(db,
      `UPDATE financial_entries SET conciliado=0, data_conciliacao=NULL WHERE id=$1 AND company_id=$2`,
      [input.entryId, input.companyId]);
    return { success: true };
  }),

  // Rev. 3319 — PANORAMA GERAL DO MÊS (sem conta selecionada). Roda o MESMO motor de
  // conciliação (_computeConciliacaoReport) para CADA conta com extrato no período e
  // devolve (a) os blocos por conta — cada linha tagueada com a conta de origem (o
  // vínculo no backend continua por conta) — e (b) os totais agregados da empresa. O
  // bloco "lançamentos sem conta" (conta_bancaria_id IS NULL) é IDÊNTICO em toda conta,
  // então é computado UMA vez (não some N vezes). READ-ONLY — não concilia/baixa nada.
  getConciliacaoReportGeral: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Rev. 3351 — base de CNPJs internos + exceções por lançamento (1 load p/ todo o motor).
    const internoCfg = await _loadInternoConfig(db, input.companyId);

    // Contas COM extrato (linhas não excluídas) no período + dados cadastrais p/ rótulo.
    // Rev. 3321 — `dbExecute` liga params por ORDEM DE APARIÇÃO do `$N` no texto ($N é
    // cosmético: o helper faz split(/\$\d+/g) e consome params[0..N] na sequência). Aqui
    // `b.data >= …`/`b.data <= …` aparecem ANTES do `cba."companyId" = …`, então o array
    // PRECISA seguir essa ordem: [dataInicio, dataFim, companyId]. (Antes estava
    // [companyId, dataInicio, dataFim] → companyId 60002 caía no `b.data >=` → 22007.)
    const contasRes = await dbExecute(db,
      `SELECT cba.id AS "id", cba.banco AS "banco", cba.apelido AS "descricao",
              cba.agencia AS "agencia", cba.conta AS "conta",
              COUNT(b.id)::int AS "linhas"
         FROM company_bank_accounts cba
         JOIN bank_statement_lines b
           ON b.conta_bancaria_id = cba.id AND b.company_id = cba."companyId"
          AND b.data >= $1 AND b.data <= $2 AND b.excluido_em IS NULL
        WHERE cba."companyId" = $3
        GROUP BY cba.id, cba.banco, cba.apelido, cba.agencia, cba.conta
        ORDER BY cba.banco ASC, cba.id ASC`,
      [input.dataInicio, input.dataFim, input.companyId]);
    const contas = rows(contasRes);

    const contasOut: any[] = [];
    const conciliados: any[] = [];
    const extratoSemLancamento: any[] = [];
    const chequesDevolvidos: any[] = [];
    const lancamentosSemExtrato: any[] = [];
    let lancamentosSemConta: any[] = [];

    // Rev. 3322 — TOTAL DE ENTRADAS/SAÍDAS movimentado no extrato (crédito = valor>0,
    // débito = valor<0). Considera TODO o extrato do mês (conciliado + pendente) — é a
    // movimentação REAL do banco, independe do status de conciliação. Helpers definidos
    // uma vez e reusados por conta e no agregado da empresa.
    const somaEntradas = (arr: any[]) => arr.reduce((a: number, x: any) => { const v = Number(x.valor) || 0; return v > 0 ? a + v : a; }, 0);
    const somaSaidas = (arr: any[]) => arr.reduce((a: number, x: any) => { const v = Number(x.valor) || 0; return v < 0 ? a + Math.abs(v) : a; }, 0);
    const qtdEntradas = (arr: any[]) => arr.reduce((a: number, x: any) => (Number(x.valor) || 0) > 0 ? a + 1 : a, 0);
    const qtdSaidas = (arr: any[]) => arr.reduce((a: number, x: any) => (Number(x.valor) || 0) < 0 ? a + 1 : a, 0);
    // Rev. 3349/3351 — separa "movimentação interna" (transf. entre contas, aplicação/resgate,
    // intra-FC + CNPJs do grupo cadastrados) do "caixa real (externo)", respeitando a exceção
    // por lançamento. `_isLancInternoRow` é a fonte única (mesma régua do JS dos drill-ins).
    const soInternas = (arr: any[]) => arr.filter((x: any) => _isLancInternoRow(x, internoCfg));

    for (const c of contas) {
      const contaId = Number(c.id);
      const contaLabel = `${c.banco ?? "Banco"}${c.descricao ? " · " + c.descricao : ""}`;
      const tag = { contaBancariaId: contaId, contaBanco: c.banco ?? null, contaDescricao: c.descricao ?? null, contaLabel };
      const rep: any = await _computeConciliacaoReport(db, input.companyId, contaId, input.dataInicio, input.dataFim);

      const conc = (rep.conciliados ?? []).map((r: any) => ({ ...r, ...tag, interno: _isLancInternoRow(r, internoCfg), overrideNatureza: internoCfg.overrides.get(Number(r.id)) ?? null }));
      const ext = (rep.extratoSemLancamento ?? []).map((r: any) => ({ ...r, ...tag, interno: _isLancInternoRow(r, internoCfg), overrideNatureza: internoCfg.overrides.get(Number(r.id)) ?? null }));
      const dev = (rep.chequesDevolvidos ?? []).map((r: any) => ({ ...r, ...tag }));
      // Rev. 3319 — grupos sintéticos (`grp:vr|YYYY-MM`, etc.) NÃO trazem a conta no id; no
      // panorama (várias contas concatenadas) dois grupos de contas diferentes colidiriam no
      // mesmo id e o `.find` do front casaria com o grupo errado. Re-chaveia o id sintético
      // por conta (`grp:…#cNN`) p/ unicidade global. `itensIds` (ids REAIS) ficam intactos —
      // a conciliação em grupo segue mandando os entryIds corretos.
      const lan = (rep.lancamentosSemExtrato ?? []).map((r: any) => (
        r.agrupado ? { ...r, ...tag, id: `${r.id}#c${contaId}` } : { ...r, ...tag }
      ));

      conciliados.push(...conc);
      extratoSemLancamento.push(...ext);
      chequesDevolvidos.push(...dev);
      lancamentosSemExtrato.push(...lan);
      // "Sem conta" é company-wide e idêntico em toda conta: pega o 1º não-vazio só uma vez.
      if (lancamentosSemConta.length === 0 && (rep.lancamentosSemConta ?? []).length > 0) {
        lancamentosSemConta = rep.lancamentosSemConta;
      }

      const somaAbs = (arr: any[]) => arr.reduce((a: number, x: any) => a + Math.abs(Number(x.valor) || 0), 0);
      // Extrato completo da conta (conciliado + pendente) p/ a movimentação entrada/saída.
      const extratoConta = [...conc, ...ext];
      // Rev. 3349 — subset interno desta conta (transf. entre contas/aplicação/intra-FC).
      const intConta = soInternas(extratoConta);
      contasOut.push({
        ...tag,
        linhas: Number(c.linhas) || 0,
        conciliados: conc,
        extratoSemLancamento: ext,
        chequesDevolvidos: dev,
        lancamentosSemExtrato: lan,
        totais: {
          conciliados: conc.length,
          extratoSemLancamento: ext.length,
          lancamentosSemExtrato: lan.length,
          chequesDevolvidos: dev.length,
          valorConciliado: somaAbs(conc),
          valorExtratoSemLancamento: somaAbs(ext),
          valorLancamentosSemExtrato: somaAbs(lan),
          // Rev. 3322 — movimentação do extrato desta conta no mês.
          valorEntradas: somaEntradas(extratoConta),
          valorSaidas: somaSaidas(extratoConta),
          qtdEntradas: qtdEntradas(extratoConta),
          qtdSaidas: qtdSaidas(extratoConta),
          // Rev. 3349 — split caixa real (externo) × movimentação interna.
          valorEntradasInternas: somaEntradas(intConta),
          valorSaidasInternas: somaSaidas(intConta),
          valorEntradasExternas: somaEntradas(extratoConta) - somaEntradas(intConta),
          valorSaidasExternas: somaSaidas(extratoConta) - somaSaidas(intConta),
          qtdEntradasInternas: qtdEntradas(intConta),
          qtdSaidasInternas: qtdSaidas(intConta),
        },
      });
    }

    const somaAbs = (arr: any[]) => arr.reduce((a: number, x: any) => a + Math.abs(Number(x.valor) || 0), 0);
    const totalExtrato = conciliados.length + extratoSemLancamento.length;
    // Rev. 3349 — extrato global p/ o split caixa real (externo) × movimentação interna.
    const extratoGlobal = [...conciliados, ...extratoSemLancamento];
    const intGlobal = soInternas(extratoGlobal);
    return {
      contas: contasOut,
      conciliados,
      extratoSemLancamento,
      chequesDevolvidos,
      lancamentosSemExtrato,
      lancamentosSemConta,
      totais: {
        contas: contasOut.length,
        totalExtrato,
        conciliados: conciliados.length,
        extratoSemLancamento: extratoSemLancamento.length,
        lancamentosSemExtrato: lancamentosSemExtrato.length,
        lancamentosSemConta: lancamentosSemConta.length,
        chequesDevolvidos: chequesDevolvidos.length,
        pctConciliado: totalExtrato > 0 ? Math.round((conciliados.length / totalExtrato) * 100) : 0,
        valorConciliado: somaAbs(conciliados),
        valorExtratoSemLancamento: somaAbs(extratoSemLancamento),
        valorLancamentosSemExtrato: somaAbs(lancamentosSemExtrato),
        valorLancamentosSemConta: somaAbs(lancamentosSemConta),
        // Rev. 3322 — movimentação agregada (todas as contas com extrato no mês).
        valorEntradas: somaEntradas(extratoGlobal),
        valorSaidas: somaSaidas(extratoGlobal),
        qtdEntradas: qtdEntradas(extratoGlobal),
        qtdSaidas: qtdSaidas(extratoGlobal),
        // Rev. 3349 — split caixa real (externo) × movimentação interna (agregado).
        valorEntradasInternas: somaEntradas(intGlobal),
        valorSaidasInternas: somaSaidas(intGlobal),
        valorEntradasExternas: somaEntradas(extratoGlobal) - somaEntradas(intGlobal),
        valorSaidasExternas: somaSaidas(extratoGlobal) - somaSaidas(intGlobal),
        qtdEntradasInternas: qtdEntradas(intGlobal),
        qtdSaidasInternas: qtdSaidas(intGlobal),
      },
    };
  }),

  // Rev. 3441 — Varredura de OC / OS / Locação por mês para o Panorama da Conciliação.
  // Agrupa TODAS as ordens ativas (não cancelada/rascunho) pelo mês de referência financeira:
  // prioridade dataVencimento → dataEntregaPrevista → created_at. READ-ONLY.
  getOcsPorMes: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string(),
    dataFim:    z.string(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    const res = await dbExecute(db,
      `WITH oc_data AS (
         SELECT co.id,
                co.numero_oc              AS "numeroOc",
                co.tipo,
                co.is_locacao             AS "isLocacao",
                co.obra_id                AS "obraId",
                co.fornecedor_nome        AS "fornecedorNome",
                COALESCE(co.total, 0)     AS total,
                co.status,
                co.aprovacao_status       AS "aprovacaoStatus",
                co.data_vencimento        AS "dataVencimento",
                co.data_entrega_prevista  AS "dataEntregaPrevista",
                CASE
                  WHEN co.data_vencimento::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                       THEN co.data_vencimento::text::date
                  WHEN co.data_vencimento::text ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
                       THEN to_date(co.data_vencimento::text, 'DD/MM/YYYY')
                  WHEN co.data_entrega_prevista::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                       THEN co.data_entrega_prevista::text::date
                  WHEN co.data_entrega_prevista::text ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
                       THEN to_date(co.data_entrega_prevista::text, 'DD/MM/YYYY')
                  ELSE DATE(co.created_at)
                END AS data_ref
           FROM compras_ordens co
          WHERE co.company_id = $1
            AND co.status NOT IN ('cancelada', 'rascunho')
       )
       SELECT *, to_char(data_ref, 'YYYY-MM') AS "mesRef"
         FROM oc_data
        WHERE data_ref BETWEEN $2::date AND $3::date
        ORDER BY data_ref ASC, id ASC`,
      [input.companyId, input.dataInicio, input.dataFim]);

    const itensFlat = rows(res);

    // Agrupar por mês
    const byMes: Record<string, any[]> = {};
    for (const r of itensFlat) {
      const m = String(r.mesRef);
      if (!byMes[m]) byMes[m] = [];
      byMes[m].push(r);
    }

    const meses = Object.keys(byMes).sort().map(mes => {
      const lista = byMes[mes];
      const isLoc  = (r: any) => r.isLocacao;
      const isOs   = (r: any) => !r.isLocacao && (r.tipo === "servico" || r.tipo === "pacote");
      const isOc   = (r: any) => !r.isLocacao && r.tipo !== "servico" && r.tipo !== "pacote";
      const soma   = (arr: any[]) => arr.reduce((a, r) => a + (Number(r.total) || 0), 0);

      const locacoes = lista.filter(isLoc);
      const os       = lista.filter(isOs);
      const ocs      = lista.filter(isOc);

      return {
        mes,
        itens: lista,
        qtd: lista.length,
        total: soma(lista),
        qtdOc: ocs.length,      totalOc: soma(ocs),
        qtdOs: os.length,       totalOs: soma(os),
        qtdLocacao: locacoes.length, totalLocacao: soma(locacoes),
      };
    });

    return {
      meses,
      qtdGeral: itensFlat.length,
      totalGeral: itensFlat.reduce((a, r) => a + (Number(r.total) || 0), 0),
    };
  }),

  // Rev. 3170 — Status de conciliação POR CONTA no período, p/ pintar cada card de conta
  // na tela de Conciliação: "consolidado" (tem extrato e 100% conciliado), "lancamento"
  // (tem extrato com pendências) ou "vazio" (sem linhas no período). READ-ONLY.
  getBankAccountsConciliacaoStatus: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Rev. 3351 — predicado de movimentação interna agora é DINÂMICO (regex base + CNPJs do
    // grupo cadastrados em financial_internal_cnpjs) e respeita a EXCEÇÃO por lançamento
    // (financial_internal_overrides via LEFT JOIN). `cnpjDigits` é sanitizado (só dígitos) →
    // inlining seguro; `internoExpr` é a fonte única do split caixa real × interno.
    const internoCfg = await _loadInternoConfig(db, input.companyId);
    const internoExpr = `(CASE WHEN ov.natureza='efetivo' THEN FALSE WHEN ov.natureza='interno' THEN TRUE ELSE ${_internoSqlPredicate(internoCfg.cnpjDigits, "b.descricao", internoCfg.nameTokens)} END)`;
    const res = await dbExecute(db,
      `SELECT b.conta_bancaria_id AS "contaBancariaId",
              COUNT(*)::int AS total,
              SUM(CASE WHEN COALESCE(b.conciliado,0)=1 THEN 1 ELSE 0 END)::int AS conciliadas,
              COALESCE(SUM(ABS(b.valor)),0) AS "valorTotal",
              COALESCE(SUM(CASE WHEN COALESCE(b.conciliado,0)=1 THEN ABS(b.valor) ELSE 0 END),0) AS "valorConciliado",
              -- Rev. 3282 — split p/ os cards "Entradas" e "Saídas" (giro bruto = entradas+saídas).
              COALESCE(SUM(CASE WHEN b.valor>=0 THEN b.valor ELSE 0 END),0) AS "valorEntradas",
              COALESCE(SUM(CASE WHEN b.valor<0 THEN ABS(b.valor) ELSE 0 END),0) AS "valorSaidas",
              -- Rev. 3316 — conciliado e pendente SEPARADOS por direção (crédito × débito)
              -- p/ o card "A conciliar" não somar entrada+saída como se fossem o mesmo sinal.
              COALESCE(SUM(CASE WHEN COALESCE(b.conciliado,0)=1 AND b.valor>=0 THEN b.valor ELSE 0 END),0) AS "valorConciliadoEntradas",
              COALESCE(SUM(CASE WHEN COALESCE(b.conciliado,0)=1 AND b.valor<0 THEN ABS(b.valor) ELSE 0 END),0) AS "valorConciliadoSaidas",
              SUM(CASE WHEN COALESCE(b.conciliado,0)<>1 AND b.valor>=0 THEN 1 ELSE 0 END)::int AS "pendentesEntradas",
              SUM(CASE WHEN COALESCE(b.conciliado,0)<>1 AND b.valor<0 THEN 1 ELSE 0 END)::int AS "pendentesSaidas",
              -- Rev. 3349/3351 — MOVIMENTAÇÃO INTERNA (transf. entre contas próprias, aplicação/
              -- resgate, PIX/TED intra-grupo + CNPJs cadastrados). Aplicado SIMETRICAMENTE em
              -- entrada E saída; a exceção por lançamento (ov) tem a palavra final. O front exibe
              -- "caixa real (externo)" = bruto − interno + card "Movimentação interna".
              COALESCE(SUM(CASE WHEN b.valor>=0 AND ${internoExpr} THEN b.valor ELSE 0 END),0) AS "valorEntradasInternas",
              COALESCE(SUM(CASE WHEN b.valor<0 AND ${internoExpr} THEN ABS(b.valor) ELSE 0 END),0) AS "valorSaidasInternas",
              SUM(CASE WHEN ${internoExpr} AND b.valor>=0 THEN 1 ELSE 0 END)::int AS "qtdEntradasInternas",
              SUM(CASE WHEN ${internoExpr} AND b.valor<0 THEN 1 ELSE 0 END)::int AS "qtdSaidasInternas"
         FROM bank_statement_lines b
         LEFT JOIN financial_internal_overrides ov
           ON ov.line_id=b.id AND ov.company_id=b.company_id AND ov.natureza IN ('efetivo','interno')
        WHERE b.company_id=$1 AND b.data>=$2 AND b.data<=$3 AND b.excluido_em IS NULL
          AND b.desconsiderado_em IS NULL
        GROUP BY b.conta_bancaria_id`,
      [input.companyId, input.dataInicio, input.dataFim]);
    // Rev. 3423 — Caixa Interno: segunda query separada p/ evitar UNION ALL com params reutilizados
    // (dbExecute renumera $N sequencialmente; UNION ALL com $1/$2/$3 repetidos causa syntax error).
    // Rev. 3758 — Caixa Interno tem lançamentos manuais em `financial_entries` (sem extrato),
    // então PRECISA devolver os valores em R$ (entradas/saídas/conciliado) p/ aparecer nos
    // gráficos "Por conta bancária" e nas KPIs — antes só vinha COUNT e o R$ ficava zerado,
    // deixando a conta com barra vazia. Agregação ESPELHA o getEntradasCaixaInterno (fonte
    // canônica da tela Caixa Interno): tipo receita/despesa, |valor_realizado ?? valor_previsto|,
    // status<>'cancelado', filtrado por data_competencia. Valores numeric → soma direta em SQL.
    const resCi = await dbExecute(db,
      `SELECT e.conta_bancaria_id AS "contaBancariaId",
              COUNT(*)::int AS total,
              SUM(CASE WHEN COALESCE(e.conciliado,0)=1 THEN 1 ELSE 0 END)::int AS conciliadas,
              COALESCE(SUM(ABS(COALESCE(e.valor_realizado, e.valor_previsto, 0))),0) AS "valorTotal",
              COALESCE(SUM(CASE WHEN COALESCE(e.conciliado,0)=1 THEN ABS(COALESCE(e.valor_realizado, e.valor_previsto, 0)) ELSE 0 END),0) AS "valorConciliado",
              COALESCE(SUM(CASE WHEN e.tipo='receita' THEN ABS(COALESCE(e.valor_realizado, e.valor_previsto, 0)) ELSE 0 END),0) AS "valorEntradas",
              COALESCE(SUM(CASE WHEN e.tipo='despesa' THEN ABS(COALESCE(e.valor_realizado, e.valor_previsto, 0)) ELSE 0 END),0) AS "valorSaidas",
              COALESCE(SUM(CASE WHEN COALESCE(e.conciliado,0)=1 AND e.tipo='receita' THEN ABS(COALESCE(e.valor_realizado, e.valor_previsto, 0)) ELSE 0 END),0) AS "valorConciliadoEntradas",
              COALESCE(SUM(CASE WHEN COALESCE(e.conciliado,0)=1 AND e.tipo='despesa' THEN ABS(COALESCE(e.valor_realizado, e.valor_previsto, 0)) ELSE 0 END),0) AS "valorConciliadoSaidas",
              SUM(CASE WHEN COALESCE(e.conciliado,0)<>1 AND e.tipo='receita' THEN 1 ELSE 0 END)::int AS "pendentesEntradas",
              SUM(CASE WHEN COALESCE(e.conciliado,0)<>1 AND e.tipo='despesa' THEN 1 ELSE 0 END)::int AS "pendentesSaidas"
         FROM financial_entries e
         JOIN company_bank_accounts cba ON cba.id=e.conta_bancaria_id
        WHERE e.company_id=$1
          AND cba."companyId"=$2
          AND cba."caixaInterno"=1
          AND cba."deletedAt" IS NULL
          AND e.status <> 'cancelado'
          AND e.data_competencia >= $3::date
          AND e.data_competencia <= $4::date
        GROUP BY e.conta_bancaria_id`,
      [input.companyId, input.companyId, input.dataInicio, input.dataFim]);
    type CiAgg = {
      total: number; conciliadas: number;
      valorTotal: number; valorConciliado: number;
      valorEntradas: number; valorSaidas: number;
      valorConciliadoEntradas: number; valorConciliadoSaidas: number;
      pendentesEntradas: number; pendentesSaidas: number;
    };
    const ciMap: Record<number, CiAgg> = {};
    for (const r of rows(resCi)) ciMap[Number(r.contaBancariaId)] = {
      total: Number(r.total) || 0,
      conciliadas: Number(r.conciliadas) || 0,
      valorTotal: Number(r.valorTotal) || 0,
      valorConciliado: Number(r.valorConciliado) || 0,
      valorEntradas: Number(r.valorEntradas) || 0,
      valorSaidas: Number(r.valorSaidas) || 0,
      valorConciliadoEntradas: Number(r.valorConciliadoEntradas) || 0,
      valorConciliadoSaidas: Number(r.valorConciliadoSaidas) || 0,
      pendentesEntradas: Number(r.pendentesEntradas) || 0,
      pendentesSaidas: Number(r.pendentesSaidas) || 0,
    };
    const seenIds = new Set<number>();
    const mapped = rows(res).map((r: any) => {
      const id = Number(r.contaBancariaId);
      seenIds.add(id);
      const total = Number(r.total) || 0;
      const conciliadas = Number(r.conciliadas) || 0;
      return {
        contaBancariaId: id,
        total,
        conciliadas,
        // Rev. 3248 — BRL movimentado p/ os dashboards (READ-ONLY; |valor| pois débito vem negativo).
        valorTotal: Number(r.valorTotal) || 0,
        valorConciliado: Number(r.valorConciliado) || 0,
        // Rev. 3282 — entradas (créditos) e saídas (débitos) separadas p/ os cards.
        valorEntradas: Number(r.valorEntradas) || 0,
        valorSaidas: Number(r.valorSaidas) || 0,
        // Rev. 3316 — conciliado/pendente por direção (crédito × débito).
        valorConciliadoEntradas: Number(r.valorConciliadoEntradas) || 0,
        valorConciliadoSaidas: Number(r.valorConciliadoSaidas) || 0,
        pendentesEntradas: Number(r.pendentesEntradas) || 0,
        pendentesSaidas: Number(r.pendentesSaidas) || 0,
        // Rev. 3349 — split caixa real (externo) × movimentação interna p/ os cards.
        valorEntradasInternas: Number(r.valorEntradasInternas) || 0,
        valorSaidasInternas: Number(r.valorSaidasInternas) || 0,
        qtdEntradasInternas: Number(r.qtdEntradasInternas) || 0,
        qtdSaidasInternas: Number(r.qtdSaidasInternas) || 0,
        status: total === 0 ? "vazio" : conciliadas >= total ? "consolidado" : "lancamento",
      };
    });
    // Rev. 3423 — acrescenta contas CI que só aparecem em ciMap (sem bank_statement_lines)
    for (const [idStr, ci] of Object.entries(ciMap)) {
      const id = Number(idStr);
      if (seenIds.has(id)) continue;
      mapped.push({
        contaBancariaId: id,
        total: ci.total, conciliadas: ci.conciliadas,
        // Rev. 3758 — R$ reais do Caixa Interno (antes zerado → barra vazia no gráfico).
        valorTotal: ci.valorTotal, valorConciliado: ci.valorConciliado,
        valorEntradas: ci.valorEntradas, valorSaidas: ci.valorSaidas,
        valorConciliadoEntradas: ci.valorConciliadoEntradas, valorConciliadoSaidas: ci.valorConciliadoSaidas,
        pendentesEntradas: ci.pendentesEntradas, pendentesSaidas: ci.pendentesSaidas,
        // Caixa Interno não é extrato bancário → sem split de movimentação interna (tudo "caixa real").
        valorEntradasInternas: 0, valorSaidasInternas: 0,
        qtdEntradasInternas: 0, qtdSaidasInternas: 0,
        status: ci.total === 0 ? "vazio" : ci.conciliadas >= ci.total ? "consolidado" : "lancamento",
      });
    }
    return mapped;
  }),

  // Rev. 3346 — CONFERÊNCIA TOTAL: lista TODAS as linhas do extrato (todas as contas) no
  // período p/ o drill-in dos cards Entradas/Saídas/Saldo líquido do Dashboard de Conciliação.
  // READ-ONLY · não concilia/baixa nada. Tenant guard. O cliente roteia o conta_bancaria_id
  // pelo cadastro já carregado (nomeConta), então só devolvemos o id da conta aqui.
  getConciliacaoLancamentos: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Rev. 3351 — base de CNPJs internos + exceções por lançamento p/ classificar cada linha.
    const internoCfg = await _loadInternoConfig(db, input.companyId);
    // dbExecute liga params por ORDEM DE APARIÇÃO do $N: [companyId, dataInicio, dataFim].
    const res = await dbExecute(db,
      `SELECT b.id, b.data, b.descricao, b.valor, b.tipo,
              COALESCE(b.conciliado,0) AS conciliado,
              b.conta_bancaria_id AS "contaBancariaId",
              ov.natureza AS "overrideNatureza", ov.motivo AS "overrideMotivo"
         FROM bank_statement_lines b
         LEFT JOIN financial_internal_overrides ov
           ON ov.line_id=b.id AND ov.company_id=b.company_id AND ov.natureza IN ('efetivo','interno')
        WHERE b.company_id=$1 AND b.data>=$2 AND b.data<=$3 AND b.excluido_em IS NULL
        ORDER BY b.data DESC, b.id DESC`,
      [input.companyId, input.dataInicio, input.dataFim]);
    return rows(res).map((r: any) => ({
      id: Number(r.id),
      data: r.data,
      descricao: r.descricao || "",
      valor: Number(r.valor) || 0,
      tipo: r.tipo || "",
      conciliado: Number(r.conciliado) === 1 ? 1 : 0,
      contaBancariaId: r.contaBancariaId == null ? null : Number(r.contaBancariaId),
      // Rev. 3349/3351 — flag p/ o drill-in separar "caixa real" da movimentação interna
      // (regex base + CNPJs cadastrados + exceção por lançamento).
      interno: _isLancInternoRow(r, internoCfg),
      // Rev. 3351 — exceção aplicada nessa linha (p/ o drill-in mostrar o selo + motivo).
      overrideNatureza: r.overrideNatureza || null,
      overrideMotivo: r.overrideMotivo || null,
    }));
  }),

  // Rev. 3368 — MAPA DE MOVIMENTAÇÃO INTERNA DO GRUPO. READ-ONLY · agrega a movimentação
  // interna do período POR CONTRAPARTE (cada empresa/CPF do grupo cadastrado + aplicação/
  // resgate + transferência entre contas próprias + outras), pra o gestor VER o montante
  // movimentado com cada uma enquanto separa as empresas. Usa a MESMA fonte única do split
  // caixa real × interno (`internoExpr`, exceção por lançamento + régua base) — não recalcula,
  // não concilia, não reclassifica nada. Os baldes por empresa são DINÂMICOS (vêm de
  // financial_internal_cnpjs), então empresas novas aparecem sozinhas no mapa.
  getMovimentacaoInternaGrupo: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const internoCfg = await _loadInternoConfig(db, input.companyId);
    // Exceção por lançamento (ov) tem a palavra final; senão a régua base (regex + nome + CNPJ).
    const internoExpr = `(CASE WHEN ov.natureza='efetivo' THEN FALSE WHEN ov.natureza='interno' THEN TRUE ELSE ${_internoSqlPredicate(internoCfg.cnpjDigits, "b.descricao", internoCfg.nameTokens)} END)`;
    // Baldes por contraparte — ordem = prioridade do CASE (1ª que casar vence):
    //   aplicação/resgate (próprio) → cada empresa cadastrada (CNPJ OU nome forte) →
    //   transferência entre contas próprias (rótulo genérico) → outras internas.
    const APLIC_LABEL = "Aplicação / Resgate (CDB próprio)";
    const TRANSF_LABEL = "Transferência entre contas próprias";
    const OUTRAS_LABEL = "Outras internas";
    const ents = rows(await dbExecute(db,
      `SELECT cnpj, nome FROM financial_internal_cnpjs WHERE company_id=$1 AND COALESCE(ativo,1)=1 ORDER BY id`,
      [input.companyId]));
    // Rev. 3368 — escapa aspas simples E neutraliza `$<dígito>` no label: o `dbExecute`
    // liga params varrendo o TEXTO da query por `$N`, então um nome cadastrado com "$1"
    // quebraria o bind. Removendo só o `$` quando seguido de dígito (raríssimo em razão
    // social) o label segue legível e a query, segura.
    const esc = (s: string) => String(s || "").replace(/\$(?=\d)/g, "").replace(/'/g, "''");
    const grupoLabels: string[] = [];
    const cases: string[] = [];
    cases.push(`WHEN b.descricao ~* 'aplica|resgate|contamax|rdb|cdb|fundo de invest' THEN '${esc(APLIC_LABEL)}'`);
    for (const e of ents) {
      const d = _soDigitos(e.cnpj);
      const tk = _nameTokenForte(e.nome);
      const conds: string[] = [];
      if (d.length >= 6) conds.push(`regexp_replace(b.descricao,'[^0-9]','','g') LIKE '%${d}%'`);
      if (tk && /^[a-z0-9]{5,}$/.test(tk)) conds.push(`${_sqlUnaccentLower("b.descricao")} ~ '${tk}'`);
      if (!conds.length) continue;
      const label = String(e.nome || "").trim() || `CNPJ ${d}`;
      grupoLabels.push(label);
      cases.push(`WHEN ${conds.join(" OR ")} THEN '${esc(label)}'`);
    }
    cases.push(`WHEN b.descricao ~* 'transfer.*entre contas|transf interna|transferencia interna|fc engenharia' THEN '${esc(TRANSF_LABEL)}'`);
    const bucketExpr = `CASE ${cases.join(" ")} ELSE '${esc(OUTRAS_LABEL)}' END`;
    // dbExecute liga params por ORDEM DE APARIÇÃO do $N: [companyId, dataInicio, dataFim].
    const res = await dbExecute(db,
      `SELECT b.id, b.data, b.descricao, b.valor,
              b.conta_bancaria_id AS "contaBancariaId",
              COALESCE(b.conciliado,0) AS conciliado,
              ov.natureza AS "overrideNatureza", ov.motivo AS "overrideMotivo",
              (${bucketExpr}) AS bucket
         FROM bank_statement_lines b
         LEFT JOIN financial_internal_overrides ov
           ON ov.line_id=b.id AND ov.company_id=b.company_id AND ov.natureza IN ('efetivo','interno')
        WHERE b.company_id=$1 AND b.data>=$2 AND b.data<=$3 AND b.excluido_em IS NULL
          AND ${internoExpr}
        ORDER BY b.data DESC, b.id DESC`,
      [input.companyId, input.dataInicio, input.dataFim]);
    const grupoSet = new Set(grupoLabels);
    const tipoDe = (label: string): "aplicacao" | "grupo" | "transf" | "outras" =>
      label === APLIC_LABEL ? "aplicacao" : label === TRANSF_LABEL ? "transf"
        : label === OUTRAS_LABEL ? "outras" : grupoSet.has(label) ? "grupo" : "outras";
    const map = new Map<string, { label: string; tipo: string; entrou: number; saiu: number; qtd: number }>();
    const lines = rows(res).map((r: any) => {
      const valor = Number(r.valor) || 0;
      const bucket = String(r.bucket || OUTRAS_LABEL);
      const b = map.get(bucket) || { label: bucket, tipo: tipoDe(bucket), entrou: 0, saiu: 0, qtd: 0 };
      if (valor >= 0) b.entrou += valor; else b.saiu += Math.abs(valor);
      b.qtd += 1;
      map.set(bucket, b);
      return {
        id: Number(r.id),
        data: r.data,
        descricao: r.descricao || "",
        valor,
        contaBancariaId: r.contaBancariaId == null ? null : Number(r.contaBancariaId),
        conciliado: Number(r.conciliado) === 1 ? 1 : 0,
        bucket,
        overrideNatureza: r.overrideNatureza || null,
        overrideMotivo: r.overrideMotivo || null,
      };
    });
    const buckets = Array.from(map.values())
      .map((b) => ({ ...b, liquido: b.entrou - b.saiu }))
      .sort((a, z) => (z.entrou + z.saiu) - (a.entrou + a.saiu));
    const totais = buckets.reduce(
      (acc, b) => ({ entrou: acc.entrou + b.entrou, saiu: acc.saiu + b.saiu, qtd: acc.qtd + b.qtd }),
      { entrou: 0, saiu: 0, qtd: 0 });
    return {
      periodo: { dataInicio: input.dataInicio, dataFim: input.dataFim },
      buckets,
      totais: { ...totais, liquido: totais.entrou - totais.saiu, bruto: totais.entrou + totais.saiu },
      lines,
    };
  }),

  // ─────────────────── MOVIMENTAÇÃO INTERNA (Rev. 3351) ───────────────────
  // Base configurável de CNPJs/CPFs do GRUPO (contrapartes cuja movimentação NÃO é caixa
  // real) + exceção por lançamento. R-007: sem DELETE em prod — inativação é soft (ativo=0).

  // Lista a base de CNPJs internos da empresa. `includeInactive` → tela de gestão.
  // Rev. 3353 — CONSULTA o nome de uma empresa pelo CNPJ/CPF digitado p/ AUTO-PREENCHER
  // o "Nome / Identificação" na Movimentação Interna. Ordem: BASE DE CADASTRO interna
  // (companies acessíveis ao usuário → fornecedores → empresas terceiras da empresa) e,
  // só se não achar E for CNPJ completo (14 díg.), cai na Receita via BrasilAPI (host
  // FIXO + cnpj só dígitos → sem SSRF). READ-ONLY, tenant-safe. Falha de qualquer fonte
  // nunca derruba a consulta (retorna nome=null). Aceita CNPJ (14), CPF (11) ou raiz (8).
  consultarCnpj: protectedProcedure.input(z.object({
    companyId: z.number(),
    cnpj: z.string().min(8),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const digits = _soDigitos(input.cnpj);
    if (![8, 11, 14].includes(digits.length)) return { nome: null, fantasia: null, fonte: null };
    const isRaiz = digits.length === 8;
    // normaliza o cnpj guardado e casa por igualdade (11/14) ou por prefixo da raiz (8).
    // O ordinal $N é passado por chamada para deixar a intenção explícita (não depende
    // do binding por ordem-de-aparição do dbExecute).
    const matchSql = (ph: string) => isRaiz
      ? `LEFT(regexp_replace(cnpj,'[^0-9]','','g'), 8) = ${ph}`
      : `regexp_replace(cnpj,'[^0-9]','','g') = ${ph}`;

    // 1) BASE DE CADASTRO — companies acessíveis ao usuário (nome = razão social).
    try {
      const comps = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const ids = (comps as any[]).map((c: any) => Number(c.id)).filter((n) => Number.isFinite(n));
      if (ids.length) {
        const idList = ids.join(",");
        const r = await dbExecute(db,
          `SELECT "razaoSocial" AS nome, "nomeFantasia" AS fantasia FROM companies
            WHERE ${matchSql("$1")} AND id IN (${idList}) LIMIT 1`,
          [digits]);
        const row = rows(r)[0] as any;
        if (row?.nome) return { nome: String(row.nome), fantasia: row.fantasia ?? null, fonte: "cadastro" as const };
      }
    } catch (e: any) { console.error("[consultarCnpj] companies:", e?.message); }

    // 2) Fornecedores da empresa.
    try {
      const r = await dbExecute(db,
        `SELECT razao_social AS nome, nome_fantasia AS fantasia FROM fornecedores
          WHERE company_id=$1 AND ${matchSql("$2")} LIMIT 1`,
        [input.companyId, digits]);
      const row = rows(r)[0] as any;
      if (row?.nome) return { nome: String(row.nome), fantasia: row.fantasia ?? null, fonte: "cadastro" as const };
    } catch (e: any) { console.error("[consultarCnpj] fornecedores:", e?.message); }

    // 3) Empresas terceiras da empresa.
    try {
      const r = await dbExecute(db,
        `SELECT razao_social AS nome, nome_fantasia AS fantasia FROM empresas_terceiras
          WHERE "companyId"=$1 AND ${matchSql("$2")} LIMIT 1`,
        [input.companyId, digits]);
      const row = rows(r)[0] as any;
      if (row?.nome) return { nome: String(row.nome), fantasia: row.fantasia ?? null, fonte: "cadastro" as const };
    } catch (e: any) { console.error("[consultarCnpj] empresas_terceiras:", e?.message); }

    // 4) Receita (BrasilAPI → ReceitaWS) — só CNPJ completo. Host FIXO + cnpj só dígitos → sem SSRF.
    // O User-Agent é OBRIGATÓRIO: o fetch do Node (undici) sem UA leva 403 do WAF da BrasilAPI
    // (curl passa porque manda `curl/x`). Sem o header a Receita devolvia 403 e o nome vinha null.
    if (digits.length === 14) {
      const headers = { "User-Agent": "FC-ERP/1.0 (financeiro)", Accept: "application/json" };
      // 4a) BrasilAPI (gratuita, sem rate-limit agressivo).
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 5000);
        const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { signal: ac.signal, headers });
        clearTimeout(t);
        if (resp.ok) {
          const j: any = await resp.json();
          const nome = j?.razao_social || j?.nome_fantasia;
          if (nome) return { nome: String(nome), fantasia: j?.nome_fantasia ?? null, fonte: "receita" as const };
        }
      } catch (e: any) { console.error("[consultarCnpj] brasilapi:", e?.message); }
      // 4b) Fallback ReceitaWS — se a BrasilAPI cair/voltar vazia.
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 5000);
        const resp = await fetch(`https://receitaws.com.br/v1/cnpj/${digits}`, { signal: ac.signal, headers });
        clearTimeout(t);
        if (resp.ok) {
          const j: any = await resp.json();
          const nome = j?.nome || j?.fantasia;
          if (nome && String(j?.status ?? "").toUpperCase() !== "ERROR") {
            return { nome: String(nome), fantasia: j?.fantasia ?? null, fonte: "receita" as const };
          }
        }
      } catch (e: any) { console.error("[consultarCnpj] receitaws:", e?.message); }
    }

    return { nome: null, fantasia: null, fonte: null };
  }),

  listInternalCnpjs: protectedProcedure.input(z.object({
    companyId: z.number(),
    includeInactive: z.boolean().optional(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const ativoFilter = input.includeInactive ? "" : "AND COALESCE(ativo,1)=1";
    const res = await dbExecute(db,
      `SELECT id, company_id AS "companyId", cnpj, nome, observacao, ativo,
              criado_por AS "criadoPor", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM financial_internal_cnpjs
        WHERE company_id=$1 ${ativoFilter}
        ORDER BY ativo DESC, nome ASC NULLS LAST, cnpj ASC`,
      [input.companyId]);
    return rows(res).map((r: any) => ({
      id: Number(r.id),
      companyId: Number(r.companyId),
      cnpj: r.cnpj || "",
      nome: r.nome || null,
      observacao: r.observacao || null,
      ativo: Number(r.ativo) === 0 ? 0 : 1,
      criadoPor: r.criadoPor || null,
      createdAt: r.createdAt || null,
      updatedAt: r.updatedAt || null,
    }));
  }),

  createInternalCnpj: protectedProcedure.input(z.object({
    companyId: z.number(),
    cnpj: z.string().min(6),
    nome: z.string().optional(),
    observacao: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const digits = _soDigitos(input.cnpj);
    if (digits.length < 6) throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ/CPF inválido (mínimo 6 dígitos)." });
    // Evita duplicata ATIVA do mesmo documento na empresa (reativa se existir inativo).
    const dup = await dbExecute(db,
      `SELECT id, ativo FROM financial_internal_cnpjs WHERE company_id=$1 AND cnpj=$2 ORDER BY id DESC LIMIT 1`,
      [input.companyId, digits]);
    const existing = rows(dup)[0];
    if (existing) {
      await dbExecute(db,
        `UPDATE financial_internal_cnpjs SET ativo=1, nome=$1, observacao=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4`,
        [input.nome ?? null, input.observacao ?? null, Number(existing.id), input.companyId]);
      return { id: Number(existing.id), reativado: true };
    }
    const res = await dbExecute(db,
      `INSERT INTO financial_internal_cnpjs (company_id, cnpj, nome, observacao, ativo, criado_por)
       VALUES ($1,$2,$3,$4,1,$5) RETURNING id`,
      [input.companyId, digits, input.nome ?? null, input.observacao ?? null, ctx.user?.name ?? null]);
    await createAuditLog({ action: "financial_internal_cnpj_created", userId: ctx.user?.id, companyId: input.companyId, details: `CNPJ interno cadastrado: ${digits}${input.nome ? ` (${input.nome})` : ""}` });
    return { id: rows(res)[0]?.id };
  }),

  updateInternalCnpj: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    cnpj: z.string().min(6).optional(),
    nome: z.string().nullable().optional(),
    observacao: z.string().nullable().optional(),
    ativo: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (input.cnpj !== undefined) {
      const d = _soDigitos(input.cnpj);
      if (d.length < 6) throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ/CPF inválido (mínimo 6 dígitos)." });
      sets.push(`cnpj=$${i++}`); vals.push(d);
    }
    if (input.nome !== undefined)       { sets.push(`nome=$${i++}`);       vals.push(input.nome); }
    if (input.observacao !== undefined) { sets.push(`observacao=$${i++}`); vals.push(input.observacao); }
    if (input.ativo !== undefined)      { sets.push(`ativo=$${i++}`);      vals.push(input.ativo ? 1 : 0); }
    if (sets.length === 0) return { ok: true, noop: true };
    sets.push(`updated_at=NOW()`);
    vals.push(input.id, input.companyId);
    const res = await dbExecute(db,
      `UPDATE financial_internal_cnpjs SET ${sets.join(", ")} WHERE id=$${i++} AND company_id=$${i++} RETURNING id`,
      vals);
    if (rows(res).length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "CNPJ interno não encontrado." });
    return { ok: true };
  }),

  // Soft-delete: inativa (ativo=0), nunca apaga. Reversível pelo botão "reativar".
  deleteInternalCnpj: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const res = await dbExecute(db,
      `UPDATE financial_internal_cnpjs SET ativo=0, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id`,
      [input.id, input.companyId]);
    if (rows(res).length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "CNPJ interno não encontrado." });
    return { ok: true };
  }),

  // Rev. 3362 — Exclusão DEFINITIVA (hard delete) a pedido EXPLÍCITO do usuário. Diferente do
  // soft-delete acima, apaga a linha de vez. Aplica-se SÓ a esta tabela de CADASTRO interno
  // (lista de CNPJs/CPFs do grupo p/ classificar movimentação interna) — é recadastrável e NÃO
  // toca dado transacional/financeiro. Escopo amarrado por id + company_id (tenant guard).
  purgeInternalCnpj: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const res = await dbExecute(db,
      `DELETE FROM financial_internal_cnpjs WHERE id=$1 AND company_id=$2 RETURNING id`,
      [input.id, input.companyId]);
    if (rows(res).length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "CNPJ interno não encontrado." });
    return { ok: true };
  }),

  // Exceção por lançamento: marca um crédito/débito como 'efetivo' (volta p/ caixa real,
  // ex.: empréstimo/capitalização), 'interno' (força interno) ou 'auto' (remove a exceção,
  // volta à regra automática). Upsert por (company, line). 'auto' grava natureza='auto'
  // (a config só lê 'efetivo'/'interno') em vez de DELETE — respeita R-007.
  setLancamentoNatureza: protectedProcedure.input(z.object({
    companyId: z.number(),
    lineId: z.number(),
    natureza: z.enum(["efetivo", "interno", "auto"]),
    motivo: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Garante que a linha pertence à empresa (tenant guard).
    const ln = await dbExecute(db,
      `SELECT id FROM bank_statement_lines WHERE id=$1 AND company_id=$2`,
      [input.lineId, input.companyId]);
    if (rows(ln).length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado nesta empresa." });
    // Rev. 3351 — motivo OBRIGATÓRIO p/ exceção manual (efetivo/interno); 'auto' limpa.
    // Validação no servidor (não só na UI) p/ não dar pra burlar via chamada direta da API.
    const motivoTrim = (input.motivo ?? "").trim();
    if (input.natureza !== "auto" && motivoTrim.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da classificação manual." });
    }
    const motivo = input.natureza === "auto" ? null : motivoTrim;
    // dbExecute liga params por ORDEM DE APARIÇÃO do $N: company, line, natureza, motivo,
    // criadoPor, natureza, motivo.
    await dbExecute(db,
      `INSERT INTO financial_internal_overrides (company_id, line_id, natureza, motivo, criado_por)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (company_id, line_id)
       DO UPDATE SET natureza=$6, motivo=$7, updated_at=NOW()`,
      [input.companyId, input.lineId, input.natureza, motivo, ctx.user?.name ?? null, input.natureza, motivo]);
    await createAuditLog({ action: "financial_lancamento_natureza_set", userId: ctx.user?.id, companyId: input.companyId, details: `Lançamento #${input.lineId} marcado como '${input.natureza}'${motivo ? `: ${motivo}` : ""}` });
    return { ok: true, natureza: input.natureza };
  }),

  // Rev. 3392 — Confirmar movimentação interna: marca + cria lançamento tipo "transferencia"/
  // natureza "interno" + concilia em 1 clique. Não cria título no Contas a Receber nem
  // Contas a Pagar; o lançamento fica catalogado como "Movimentação Interna — Grupo FC"
  // para relatórios excluírem pelo campo natureza="interno".
  // ZERO ALTER/DROP/DELETE — só INSERT + UPDATE.
  confirmarMovimentacaoInterna: protectedProcedure.input(z.object({
    companyId: z.number(),
    lineId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // 1. Lê a linha do extrato (tenant guard + dados para criar o lançamento).
    const lnRes = await dbExecute(db,
      `SELECT id, conta_bancaria_id AS "contaBancariaId", data, descricao, valor, conciliado
       FROM bank_statement_lines
       WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL`,
      [input.lineId, input.companyId]);
    if (rows(lnRes).length === 0)
      throw new TRPCError({ code: "NOT_FOUND", message: "Linha do extrato não encontrada." });
    const ln = rows(lnRes)[0] as any;
    if (Number(ln.conciliado) === 1)
      throw new TRPCError({ code: "CONFLICT", message: "Esta linha já está conciliada." });
    const contaBancariaId = Number(ln.contaBancariaId);
    const valor = Math.abs(Number(ln.valor));
    const data = (ln.data ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const descricao = `[Mov. Interna] ${(ln.descricao ?? "").trim()}`.trim();
    // 2. Cria o lançamento do tipo "transferencia" com natureza "interno".
    //    status "pago" = já realizado (veio do extrato bancário).
    //    conciliado=1 + data_conciliacao = hoje (concilia junto).
    // NOTA: dbExecute liga params por ORDEM DE APARIÇÃO do $N (o número é cosmético).
    const entryRes = await dbExecute(db,
      `INSERT INTO financial_entries
       (company_id, tipo, natureza, valor_previsto, valor_realizado,
        data_competencia, data_pagamento, status, conta_bancaria_id,
        descricao, conciliado, data_conciliacao,
        criado_por_id, criado_por_nome, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_DATE,$12,$13,NOW(),NOW())
       RETURNING id`,
      [
        input.companyId, "transferencia", "interno", valor, valor,
        data, data, "pago", contaBancariaId,
        descricao, 1,
        ctx.user?.id ?? null, ctx.user?.name ?? null,
      ]
    );
    const entryId = (rows(entryRes)[0] as any)?.id;
    if (!entryId)
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar lançamento interno." });
    // 3. Concilia a linha do extrato → entry_id aponta para o lançamento criado.
    const updRes = await dbExecute(db,
      `UPDATE bank_statement_lines SET conciliado=1, entry_id=$1
       WHERE id=$2 AND company_id=$3 AND excluido_em IS NULL RETURNING id`,
      [entryId, input.lineId, input.companyId]);
    if (rows(updRes).length === 0)
      throw new TRPCError({ code: "NOT_FOUND", message: "Linha do extrato não encontrada ao conciliar." });
    // 4. Grava override "interno" para badge + aviso em reaberturas futuras.
    const motivo = "Lançado automaticamente como movimentação interna — Grupo FC";
    await dbExecute(db,
      `INSERT INTO financial_internal_overrides (company_id, line_id, natureza, motivo, criado_por)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (company_id, line_id)
       DO UPDATE SET natureza=$6, motivo=$7, updated_at=NOW()`,
      [input.companyId, input.lineId, "interno", motivo, ctx.user?.name ?? null, "interno", motivo]);
    await createAuditLog({ action: "financial_mov_interna_confirmada", userId: ctx.user?.id, companyId: input.companyId, details: `Linha #${input.lineId} → Lançamento #${entryId} (Mov. Interna R$${valor})` });
    return { ok: true, entryId };
  }),

  // Rev. 3248 — Resumo MENSAL do extrato (BRL movimentado + conciliado por mês) p/ a
  // tabela comparativa mês×mês / ano×ano do Dashboard de Conciliação. READ-ONLY.
  getConciliacaoResumoMensal: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const res = await dbExecute(db,
      `SELECT EXTRACT(month FROM data)::int AS mes,
              COUNT(*)::int AS total,
              SUM(CASE WHEN COALESCE(conciliado,0)=1 THEN 1 ELSE 0 END)::int AS conciliadas,
              COALESCE(SUM(ABS(valor)),0) AS "valorTotal",
              COALESCE(SUM(CASE WHEN COALESCE(conciliado,0)=1 THEN ABS(valor) ELSE 0 END),0) AS "valorConciliado",
              -- Rev. 3300 — entradas/saídas separadas por mês p/ a régua de SALDO LÍQUIDO
              -- (entrou − saiu) mês a mês; substitui o "giro bruto" (entrada+saída somadas),
              -- que o usuário descartou por não fazer sentido contábil.
              COALESCE(SUM(CASE WHEN valor>=0 THEN valor ELSE 0 END),0) AS "valorEntradas",
              COALESCE(SUM(CASE WHEN valor<0 THEN ABS(valor) ELSE 0 END),0) AS "valorSaidas"
         FROM bank_statement_lines
        WHERE company_id=$1 AND excluido_em IS NULL AND desconsiderado_em IS NULL
          AND EXTRACT(year FROM data)=$2
        GROUP BY EXTRACT(month FROM data)
        ORDER BY 1`,
      [input.companyId, input.ano]);
    return rows(res).map((r: any) => ({
      mes: Number(r.mes) || 0,
      total: Number(r.total) || 0,
      conciliadas: Number(r.conciliadas) || 0,
      valorTotal: Number(r.valorTotal) || 0,
      valorConciliado: Number(r.valorConciliado) || 0,
      valorEntradas: Number(r.valorEntradas) || 0,
      valorSaidas: Number(r.valorSaidas) || 0,
    }));
  }),

  // Rev. 3742 — DESCONSIDERAR par de cheque devolvido do CÁLCULO do %. NÃO apaga nada:
  // marca as linhas (desconsiderado_em=NOW) p/ saírem da conta do percentual (todas as
  // agregações filtram `desconsiderado_em IS NULL`), mas elas seguem visíveis no painel
  // "Cheques devolvidos" com badge. Reversível via reconsiderarChequeDevolvido. Caso de
  // uso: cheque devolvido cujo pagamento real (PIX/TED) já foi conciliado em OUTRA conta —
  // o par compensação+devolução não casa aqui e impedia o % de chegar a 100%. Tenant guard.
  desconsiderarChequeDevolvido: protectedProcedure.input(z.object({
    companyId: z.number(),
    lineIds: z.array(z.number()).min(1),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const ids = Array.from(new Set(input.lineIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)));
    if (!ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma linha informada." });
    // Guard de ELEGIBILIDADE (Rev. 3742): o endpoint só desconsidera um PAR de estorno de cheque
    // devolvido (compensação=débito + devolução=crédito, mesmo valor absoluto), espelhando os
    // predicados de `detectarParesEstorno`. Sem isso, a API aceitaria lineIds arbitrários da
    // empresa e tiraria linhas quaisquer do cálculo do %, distorcendo o indicador.
    let debitoLinha: any = null;
    {
      const sel = await dbExecute(db,
        `SELECT id, valor, descricao, conciliado, conta_bancaria_id AS "contaBancariaId" FROM bank_statement_lines
          WHERE company_id=$1 AND excluido_em IS NULL AND id IN (${inlineIds(ids)})`,
        [input.companyId]);
      const linhas = rows(sel);
      if (linhas.length !== 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível desconsiderar o par (compensação + devolução) de um cheque devolvido." });
      const cents = (v: any) => Math.round(Math.abs(Number(v) || 0) * 100);
      const debito = linhas.find((l: any) => Number(l.valor) < 0);
      const credito = linhas.find((l: any) => Number(l.valor) >= 0);
      const elegivel = !!debito && !!credito
        && cents(debito.valor) === cents(credito.valor) && cents(credito.valor) > 0
        && pareceCompensacaoCheque(debito.descricao) && pareceDevolucaoCheque(credito.descricao)
        && Number(debito.conciliado) !== 1 && Number(credito.conciliado) !== 1;
      if (!elegivel) throw new TRPCError({ code: "BAD_REQUEST", message: "Estas linhas não formam um par de cheque devolvido elegível (ou já estão conciliadas)." });
      debitoLinha = debito;
    }
    const porNome = (ctx.user as any)?.nome ?? (ctx.user as any)?.name ?? null;
    // dbExecute liga params por ORDEM DE APARIÇÃO: $1=por_id, $2=por_nome, $3=company_id.
    // Os ids vão INLINE (números validados) — guard de empresa via company_id + excluido_em.
    const upd = await dbExecute(db,
      `UPDATE bank_statement_lines
          SET desconsiderado_em=NOW(), desconsiderado_por_id=$1, desconsiderado_por_nome=$2
        WHERE company_id=$3 AND excluido_em IS NULL AND desconsiderado_em IS NULL
          AND id IN (${inlineIds(ids)})
        RETURNING id`,
      [ctx.user?.id ?? null, porNome, input.companyId]);
    const afetados = rows(upd).length;
    // Rev. 4068 — Ao CONFIRMAR (ação explícita) que este par é um cheque devolvido e não
    // pago, persiste status='devolvido' + motivo (alínea Bacen) + conta bancária tentativa
    // no Controle de Cheques, casando por Nº do cheque/doc + valor (mesma identidade de
    // `detectarParesEstorno`). Ambíguo → não faz nada (não escreve no escuro).
    try {
      if (afetados > 0 && debitoLinha) {
        const motivo = parseMotivoDevolucao(debitoLinha.descricao) ?? null;
        const doc = parseDocNumero(debitoLinha.descricao);
        const chq = parseChequeNumero(debitoLinha.descricao);
        const cents = Math.round(Math.abs(Number(debitoLinha.valor) || 0) * 100);
        if ((doc || chq) && cents > 0) {
          const norm = (s: any) => String(s ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
          const alvo = norm(chq) || norm(doc);
          const candRes = await dbExecute(db,
            `SELECT id, numero_cheque AS "numeroCheque" FROM financial_cheques
              WHERE company_id=$1 AND excluido_em IS NULL AND status <> 'devolvido'
                AND ROUND(ABS(valor)*100)=$2`,
            [input.companyId, cents]);
          const cands = (rows(candRes) as any[]).filter((c) => norm(c.numeroCheque) === alvo);
          if (cands.length === 1) {
            let contaNome: string | null = null;
            const contaId = debitoLinha.contaBancariaId ?? null;
            if (contaId != null) {
              const cbRes = await dbExecute(db,
                `SELECT banco, agencia, conta, apelido FROM company_bank_accounts WHERE id=$1`,
                [contaId]);
              const cb: any = rows(cbRes)[0];
              if (cb) contaNome = cb.apelido || `${cb.banco} · Ag ${cb.agencia} · CC ${cb.conta}`;
            }
            await dbExecute(db,
              `UPDATE financial_cheques
                  SET status='devolvido', devolvido_em=NOW(),
                      motivo_devolucao_codigo=$1, motivo_devolucao_texto=$2,
                      conta_bancaria_tentativa_id=$3, conta_bancaria_tentativa_nome=$4,
                      updated_at=NOW()
                WHERE id=$5 AND company_id=$6 AND excluido_em IS NULL`,
              [motivo?.codigo ?? null, motivo?.motivo ?? null, contaId, contaNome, cands[0].id, input.companyId]);
          }
        }
      }
    } catch (e: any) { console.error("[desconsiderarChequeDevolvido] persistir motivo/devolvido falhou (não bloqueia):", e?.message || e); }
    await createAuditLog({
      userId: ctx.user?.id,
      action: "bank_statement_line_desconsiderar",
      details: `Desconsiderou ${afetados} linha(s) de extrato da conciliação (cheque devolvido): #${ids.join(", #")}`,
      companyId: input.companyId,
    });
    return { ok: true, afetados };
  }),

  // Rev. 4260 — AUTO-MARCAR cheques devolvidos: quando o extrato mostra um par comp+dev
  // para um cheque, mas o Controle ainda exibe 'compensado' (porque a auto-baixa de
  // conciliarLancamento rodou antes da devolução aparecer no extrato), esta procedure
  // atualiza o status para 'devolvido' SEM tocar as linhas do extrato (não desconsiderar).
  // IDEMPOTENTE: pode ser chamada múltiplas vezes sem efeito colateral.
  // Só altera status 'compensado'|'pendente' → 'devolvido'; nunca sobrescreve
  // 'devolvido', 'sustado', 'cancelado', 'compensado_pix'.
  // Ambíguo (mais de 1 cheque com mesmo nº+valor) → não toca.
  autoMarcarChequesDevolvidos: protectedProcedure.input(z.object({
    companyId: z.number(),
    pares: z.array(z.object({
      debitoId: z.number(),
      chequeNumero: z.string().nullable().optional(),
      doc: z.string().nullable().optional(),
      valorCents: z.number(),
    })).min(1).max(200),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const norm = (s: any) => String(s ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
    let atualizados = 0;
    for (const par of input.pares) {
      try {
        const alvo = norm(par.chequeNumero) || norm(par.doc);
        if (!alvo || par.valorCents <= 0) continue;
        const candRes = await dbExecute(db,
          `SELECT id, numero_cheque AS "numeroCheque"
             FROM financial_cheques
            WHERE company_id=$1 AND excluido_em IS NULL
              AND status IN ('compensado','pendente')
              AND ROUND(ABS(valor)*100)=$2`,
          [input.companyId, par.valorCents]);
        const cands = (rows(candRes) as any[]).filter((c) => norm(c.numeroCheque) === alvo);
        if (cands.length !== 1) continue;
        const upd = await dbExecute(db,
          `UPDATE financial_cheques
              SET status='devolvido',
                  devolvido_em=COALESCE(devolvido_em, NOW()),
                  updated_at=NOW()
            WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL
              AND status IN ('compensado','pendente')
            RETURNING id`,
          [cands[0].id, input.companyId]);
        atualizados += rows(upd).length;
      } catch (e: any) { console.error("[autoMarcarChequesDevolvidos] par", par.debitoId, "falhou:", e?.message || e); }
    }
    if (atualizados > 0) {
      await createAuditLog({
        userId: ctx.user?.id,
        action: "cheque_auto_marcado_devolvido",
        details: `${atualizados} cheque(s) marcado(s) automaticamente como devolvido (par comp+dev no extrato).`,
        companyId: input.companyId,
      });
    }
    return { atualizados };
  }),

  // Rev. 3742 — RECONSIDERAR (desfaz o desconsiderar): volta as linhas para a conta do %.
  reconsiderarChequeDevolvido: protectedProcedure.input(z.object({
    companyId: z.number(),
    lineIds: z.array(z.number()).min(1),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const ids = Array.from(new Set(input.lineIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)));
    if (!ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma linha informada." });
    const upd = await dbExecute(db,
      `UPDATE bank_statement_lines
          SET desconsiderado_em=NULL, desconsiderado_por_id=NULL, desconsiderado_por_nome=NULL
        WHERE company_id=$1 AND excluido_em IS NULL AND desconsiderado_em IS NOT NULL
          AND id IN (${inlineIds(ids)})
        RETURNING id`,
      [input.companyId]);
    const afetados = rows(upd).length;
    await createAuditLog({
      userId: ctx.user?.id,
      action: "bank_statement_line_reconsiderar",
      details: `Reconsiderou ${afetados} linha(s) de extrato na conciliação: #${ids.join(", #")}`,
      companyId: input.companyId,
    });
    return { ok: true, afetados };
  }),

  // Rev. 3940 — IGNORAR SUGESTÃO: persiste a decisão do usuário de não sugerir
  // automaticamente esta linha do extrato. A linha continua visível no painel e
  // no cálculo do %, mas sai do engine de sugestões automáticas.
  ignorarSugestao: protectedProcedure.input(z.object({
    companyId: z.number(),
    statementLineId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const id = Number(input.statementLineId);
    if (!Number.isFinite(id) || id <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "ID inválido." });
    const upd = await dbExecute(db,
      `UPDATE bank_statement_lines
          SET sugestao_ignorada_em = NOW()
        WHERE company_id=$1 AND id=$2 AND excluido_em IS NULL AND sugestao_ignorada_em IS NULL
        RETURNING id`,
      [input.companyId, id]);
    if (rows(upd).length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Linha não encontrada ou já ignorada." });
    await createAuditLog({
      userId: ctx.user?.id,
      action: "bank_statement_line_ignorar_sugestao",
      details: `Ignorou sugestão de conciliação para linha de extrato #${id}`,
      companyId: input.companyId,
    });
    return { ok: true };
  }),

  // Rev. 3940 — RESTAURAR SUGESTÃO: desfaz o "ignorar" — a linha volta a aparecer
  // no engine de sugestões automáticas no próximo "Reanalisar".
  restaurarSugestao: protectedProcedure.input(z.object({
    companyId: z.number(),
    statementLineId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const id = Number(input.statementLineId);
    if (!Number.isFinite(id) || id <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "ID inválido." });
    await dbExecute(db,
      `UPDATE bank_statement_lines SET sugestao_ignorada_em = NULL WHERE company_id=$1 AND id=$2`,
      [input.companyId, id]);
    return { ok: true };
  }),

  conciliarLancamento: protectedProcedure.input(z.object({
    statementLineId: z.number(),
    entryId: z.number(),
    companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Rev. 3319 — GUARD DE CONTA (server-side): a linha do extrato e o lançamento precisam
    // ser da MESMA conta bancária (ou o lançamento sem conta — conta_bancaria_id IS NULL —
    // que casa com qualquer banco). O guard do front (panorama) é bypassável por chamada
    // direta da API; aqui fechamos o cruzamento entre contas. No fluxo por-conta o lançamento
    // já vem filtrado pela conta selecionada, então NUNCA bloqueia conciliações legítimas.
    const lnContaRes = await dbExecute(db,
      `SELECT conta_bancaria_id AS "contaBancariaId" FROM bank_statement_lines
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL`,
      [input.statementLineId, input.companyId]);
    if (rows(lnContaRes).length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Linha do extrato não encontrada ou já removida." });
    }
    const lineConta = Number((rows(lnContaRes)[0] as any).contaBancariaId);
    const enContaRes = await dbExecute(db,
      `SELECT conta_bancaria_id AS "contaBancariaId" FROM financial_entries
        WHERE id=$1 AND company_id=$2`,
      [input.entryId, input.companyId]);
    if (rows(enContaRes).length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado nesta empresa." });
    }
    const entryConta = (rows(enContaRes)[0] as any).contaBancariaId;
    if (entryConta != null && Number(entryConta) !== lineConta) {
      throw new TRPCError({ code: "CONFLICT", message: "Este lançamento é de outra conta bancária — não pode ser conciliado com esta linha do extrato." });
    }
    // Rev. 3179 — NUNCA conciliar uma linha SOFT-DELETADA (excluido_em IS NULL). Usa
    // RETURNING + guard: se a linha foi limpa (ou não existe na empresa), ABORTA antes
    // de tocar o financial_entries (senão o lançamento ficaria conciliado=1 apontando
    // p/ uma linha invisível na tela — estado fantasma).
    const lnRes = await dbExecute(db,
      `UPDATE bank_statement_lines SET conciliado=1, entry_id=$1
        WHERE id=$2 AND company_id=$3 AND excluido_em IS NULL
        RETURNING id`,
      [input.entryId, input.statementLineId, input.companyId]
    );
    if (rows(lnRes).length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Linha do extrato não encontrada ou já removida." });
    }
    await dbExecute(db,
      `UPDATE financial_entries SET conciliado=1, data_conciliacao=CURRENT_DATE, conciliado_em=NOW(), conciliado_por_id=$1, conciliado_por_nome=$2 WHERE id=$3 AND company_id=$4`,
      [ctx.user?.id ?? null, ctx.user?.name ?? null, input.entryId, input.companyId]
    );
    // Rev. 3445 — sem conta: vincular à conta da linha do extrato após conciliação.
    if (entryConta == null) {
      await dbExecute(db,
        `UPDATE financial_entries SET conta_bancaria_id=$1 WHERE id=$2 AND company_id=$3 AND conta_bancaria_id IS NULL`,
        [lineConta, input.entryId, input.companyId]);
    }
    // Rev. 2693 — se for perna de transferência, concilia a perna irmã junto.
    await dbExecute(db,
      `UPDATE financial_entries sib SET conciliado=1, data_conciliacao=CURRENT_DATE, conciliado_em=NOW(), conciliado_por_id=$1, conciliado_por_nome=$2
       FROM financial_entries cur
       WHERE cur.id=$3 AND cur.company_id=$4
         AND cur.tipo='transferencia' AND cur.transferencia_grupo_id IS NOT NULL
         AND sib.transferencia_grupo_id = cur.transferencia_grupo_id
         AND sib.company_id = cur.company_id AND sib.id <> cur.id
         AND COALESCE(sib.conciliado,0)=0`,
      [ctx.user?.id ?? null, ctx.user?.name ?? null, input.entryId, input.companyId]
    );
    autoVincularNfsPorLinhas(input.companyId, [input.statementLineId]).catch(() => {});
    // Rev. 4068 — AUTO-BAIXA do cheque no Controle de Cheques quando o lançamento
    // conciliado é o pagamento de um cheque (forma_pagamento='cheque'). Antes, conciliar
    // aqui (fluxo principal de conciliação manual) nunca tocava financial_cheques — só
    // `conciliarChequeComLinha` (fluxo raro, sem lançamento prévio) baixava. Casa por
    // Nº do cheque (normalizado, sem zeros à esquerda) + VALOR (2 casas); ambíguo → não
    // faz nada (mesma filosofia de "conciliação só sugestiva" — nunca baixa no escuro).
    try {
      const entryChqRes = await dbExecute(db,
        `SELECT forma_pagamento AS "formaPagamento", cheque_numero AS "chequeNumero",
                COALESCE(valor_realizado, valor_previsto) AS valor
           FROM financial_entries WHERE id=$1 AND company_id=$2`,
        [input.entryId, input.companyId]);
      const entryChq: any = rows(entryChqRes)[0];
      const chequeNumNorm = String(entryChq?.chequeNumero ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
      const centsEntry = Math.round(Math.abs(Number(entryChq?.valor ?? 0)) * 100);
      if (chequeNumNorm && centsEntry > 0) {
        const candRes = await dbExecute(db,
          `SELECT id, numero_cheque AS "numeroCheque", lancamento_id AS "lancamentoId"
             FROM financial_cheques
            WHERE company_id=$1 AND excluido_em IS NULL AND COALESCE(conciliado,0)=0
              AND ROUND(ABS(valor)*100)=$2
              AND (lancamento_id IS NULL OR lancamento_id=$3)`,
          [input.companyId, centsEntry, input.entryId]);
        const norm = (s: any) => String(s ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
        const cands = (rows(candRes) as any[]).filter((c) => norm(c.numeroCheque) === chequeNumNorm);
        const linkedFirst = cands.find((c) => Number(c.lancamentoId) === input.entryId);
        const chequeMatch = linkedFirst ?? (cands.length === 1 ? cands[0] : null);
        if (chequeMatch) {
          let contaNome: string | null = null;
          if (lineConta != null) {
            const cbRes = await dbExecute(db,
              `SELECT banco, agencia, conta, apelido FROM company_bank_accounts WHERE id=$1`,
              [lineConta]);
            const cb: any = rows(cbRes)[0];
            if (cb) contaNome = cb.apelido || `${cb.banco} · Ag ${cb.agencia} · CC ${cb.conta}`;
          }
          await dbExecute(db,
            `UPDATE financial_cheques
                SET conciliado=1,
                    status = CASE WHEN status IN ('devolvido','sustado','cancelado') THEN status ELSE 'compensado' END,
                    data_conciliacao=CURRENT_DATE,
                    lancamento_id=$1,
                    conta_bancaria_tentativa_id=$2,
                    conta_bancaria_tentativa_nome=$3,
                    updated_at=NOW()
              WHERE id=$4 AND company_id=$5 AND excluido_em IS NULL AND COALESCE(conciliado,0)=0
              RETURNING id`,
            [input.entryId, lineConta, contaNome, chequeMatch.id, input.companyId]);
        }
      }
    } catch (e: any) { console.error("[conciliarLancamento] auto-baixa cheque falhou (não bloqueia conciliação):", e?.message || e); }
    return { ok: true };
  }),

  // Rev. 3752 — CONCILIAR uma LINHA do extrato contra um CHEQUE do Controle de Cheques que
  // NÃO tem lançamento de despesa correspondente. Opção A (escolha do piloto FC): em vez de
  // só vincular, CRIA a despesa (status "pago") espelhando o cheque, marca a linha do extrato
  // como conciliada (entry_id = nova despesa) e BAIXA o cheque (conciliado=1 + lancamento_id).
  // Tudo ATÔMICO (db.transaction): a despesa nasce, a linha reserva e o cheque baixa juntos —
  // ou nada. Guard de concorrência (linha conciliado=0 → vencedor único) + tenancy. AÇÃO
  // EXPLÍCITA do usuário ("conciliação só sugestiva": nada roda sozinho). ZERO ALTER/DROP/DELETE.
  conciliarChequeComLinha: protectedProcedure.input(z.object({
    statementLineId: z.number(),
    chequeId: z.number(),
    companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // 1) Cheque (tenancy + ainda NÃO conciliado/vinculado).
    const chqRes = await dbExecute(db,
      `SELECT id, numero_cheque AS "numeroCheque", fornecedor_nome AS "fornecedorNome",
              valor, data_vencimento AS "dataVencimento", data_compensacao AS "dataCompensacao",
              obra_id AS "obraId", obra_nome AS "obraNome", lancamento_id AS "lancamentoId",
              COALESCE(conciliado,0) AS conciliado
         FROM financial_cheques
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL`,
      [input.chequeId, input.companyId]);
    if (rows(chqRes).length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Cheque não encontrado nesta empresa." });
    const chq: any = rows(chqRes)[0];
    if (Number(chq.conciliado) === 1 || chq.lancamentoId != null) {
      throw new TRPCError({ code: "CONFLICT", message: "Este cheque já está conciliado / vinculado a um lançamento." });
    }
    // 2) Linha do extrato (tenancy + não removida) → conta bancária + data do pagamento.
    const lnRes = await dbExecute(db,
      `SELECT conta_bancaria_id AS "contaBancariaId", data, COALESCE(conciliado,0) AS conciliado
         FROM bank_statement_lines WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL`,
      [input.statementLineId, input.companyId]);
    if (rows(lnRes).length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Linha do extrato não encontrada ou já removida." });
    const ln: any = rows(lnRes)[0];
    if (Number(ln.conciliado) === 1) throw new TRPCError({ code: "CONFLICT", message: "Esta linha do extrato já está conciliada." });
    const lineConta = ln.contaBancariaId != null ? Number(ln.contaBancariaId) : null;
    const dataPg = typeof ln.data === "string" ? ln.data.slice(0, 10) : (ln.data ? new Date(ln.data).toISOString().slice(0, 10) : null);
    const valorNum = Math.abs(Number(chq.valor) || 0);
    const dataComp = chq.dataVencimento || dataPg;
    const desc = `Cheque nº ${chq.numeroCheque ?? "—"} — ${chq.fornecedorNome ?? "Fornecedor"}`.trim();
    let entryId: any;
    // NB: `dbExecute` liga params por ORDEM DE APARIÇÃO dos $N (o número é cosmético); o array
    // espelha 1:1 a ordem textual. Literais ('despesa','variavel',1,NOW()…) NÃO consomem item.
    await db.transaction(async (tx: any) => {
      const insRes = await dbExecute(tx,
        `INSERT INTO financial_entries
           (company_id, obra_id, obra_nome, tipo, natureza, valor_previsto, valor_realizado,
            data_competencia, data_vencimento, data_pagamento, status, conta_bancaria_id,
            forma_pagamento, descricao, fornecedor_nome, cheque_numero, cheque_status,
            origem_modulo, conciliado, data_conciliacao, conciliado_em, conciliado_por_id, conciliado_por_nome,
            criado_por_id, criado_por_nome, created_at, updated_at)
         VALUES ($1,$2,$3,'despesa','variavel',$4,$5,$6,$7,$8,'pago',$9,'cheque',$10,$11,$12,$13,
                 'cheque_conciliacao',1,CURRENT_DATE,NOW(),$14,$15,$16,$17,NOW(),NOW())
         RETURNING id`,
        [input.companyId, chq.obraId ?? null, chq.obraNome ?? null,
         valorNum, valorNum, dataComp, chq.dataVencimento ?? null, dataPg,
         lineConta, desc, chq.fornecedorNome ?? null, chq.numeroCheque ?? null, chq.dataCompensacao ? "compensado" : null,
         ctx.user?.id ?? null, ctx.user?.name ?? null, ctx.user?.id ?? null, ctx.user?.name ?? null]);
      entryId = rows(insRes)[0]?.id;
      if (!entryId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao criar o lançamento do cheque." });
      // Reserva ATÔMICA do CHEQUE primeiro (serializa por chequeId; vencedor único): se outra
      // requisição já baixou este cheque, `lancamento_id IS NULL` falha → 0 linhas → rollback de
      // tudo (despesa + linha). Sem checar rows-affected aqui, duas linhas distintas poderiam
      // conciliar o MESMO cheque (cada uma criando sua despesa) e só a 1ª baixaria o cheque.
      // Rev. 4068 — junto com a baixa, registra STATUS='compensado' (salvo devolvido/sustado/
      // cancelado) + a conta bancária TENTATIVA (a que recebeu a linha do extrato), espelhando
      // `conciliarLancamento`. Resolve o nome fora da transação não é necessário aqui pois é
      // read-only sobre uma tabela auxiliar.
      let contaTentativaNome: string | null = null;
      if (lineConta != null) {
        const cbRes = await dbExecute(tx,
          `SELECT banco, agencia, conta, apelido FROM company_bank_accounts WHERE id=$1`,
          [lineConta]);
        const cb: any = rows(cbRes)[0];
        if (cb) contaTentativaNome = cb.apelido || `${cb.banco} · Ag ${cb.agencia} · CC ${cb.conta}`;
      }
      const updChq = await dbExecute(tx,
        `UPDATE financial_cheques
            SET conciliado=1, data_conciliacao=CURRENT_DATE, lancamento_id=$1,
                status = CASE WHEN status IN ('devolvido','sustado','cancelado') THEN status ELSE 'compensado' END,
                conta_bancaria_tentativa_id=$2, conta_bancaria_tentativa_nome=$3, updated_at=NOW()
          WHERE id=$4 AND company_id=$5 AND excluido_em IS NULL AND lancamento_id IS NULL
          RETURNING id`,
        [entryId, lineConta, contaTentativaNome, input.chequeId, input.companyId]);
      if (rows(updChq).length === 0) throw new TRPCError({ code: "CONFLICT", message: "Este cheque já foi conciliado / vinculado a um lançamento." });
      // Reserva ATÔMICA da linha (vencedor único; se outro já conciliou → rollback de tudo).
      const updLn = await dbExecute(tx,
        `UPDATE bank_statement_lines SET conciliado=1, entry_id=$1
          WHERE id=$2 AND company_id=$3 AND excluido_em IS NULL AND COALESCE(conciliado,0)=0
          RETURNING id`,
        [entryId, input.statementLineId, input.companyId]);
      if (rows(updLn).length === 0) throw new TRPCError({ code: "CONFLICT", message: "Linha do extrato já conciliada ou removida." });
    });
    await createAuditLog({ action: "financial_cheque_conciliado", userId: ctx.user?.id, companyId: input.companyId, details: `Cheque nº ${chq.numeroCheque ?? "?"} (${chq.fornecedorNome ?? "—"}) R$${valorNum} → despesa ${entryId} + linha ${input.statementLineId}` });
    return { ok: true, entryId };
  }),

  // Rev. 3239 — CONCILIAÇÃO EM GRUPO (N lançamentos : 1 linha do extrato). Usada quando a
  // tela unifica VR / combustível / manutenção num único total (o extrato mostra só o valor
  // somado). Marca a linha do extrato como conciliada (entry_id = 1º membro, "representante")
  // e BAIXA todos os lançamentos-membro (conciliado + data_conciliacao + status pago/recebido).
  // Registra cada membro em `financial_conciliacao_grupo` (tabela-link AUTO-CRIADA) para o
  // "Desconsolidar mês" conseguir REVERTER o grupo inteiro depois — sem isso, só o
  // representante voltaria e o grupo reapareceria quebrado. AÇÃO EXPLÍCITA do usuário
  // ("conciliação só sugestiva"): nada roda sozinho. ZERO ALTER/DROP/DELETE.
  conciliarGrupoLancamentos: protectedProcedure.input(z.object({
    statementLineId: z.number(),
    entryIds: z.array(z.number().int()).min(1).max(5000),
    companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const ids = Array.from(new Set(input.entryIds)).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Grupo sem lançamentos válidos." });
    let conciliados = 0;
    await db.transaction(async (tx: any) => {
      // 0) Self-heal: tabela-link p/ reversibilidade (idempotente). `revertido_em` evita
      //    DELETE no undo (honra a regra JAMAIS DELETE).
      await dbExecute(tx,
        `CREATE TABLE IF NOT EXISTS financial_conciliacao_grupo (
           id serial PRIMARY KEY,
           company_id integer NOT NULL,
           statement_line_id integer NOT NULL,
           entry_id integer NOT NULL,
           created_at timestamp DEFAULT NOW(),
           revertido_em timestamp
         )`, []);
      await dbExecute(tx,
        `CREATE INDEX IF NOT EXISTS idx_fcg_line ON financial_conciliacao_grupo (company_id, statement_line_id)`, []);
      // 1) RESERVA ATÔMICA da linha (guard conciliado=0 → vencedor único sob concorrência).
      //    entry_id = representante (1º membro), só p/ ter um vínculo direto na linha.
      const lnRes = await dbExecute(tx,
        `UPDATE bank_statement_lines SET conciliado=1, entry_id=$1
          WHERE id=$2 AND company_id=$3 AND COALESCE(conciliado,0)=0 AND excluido_em IS NULL
          RETURNING data, conta_bancaria_id AS "contaBancariaId"`,
        [ids[0], input.statementLineId, input.companyId]);
      if (rows(lnRes).length === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Linha do extrato já conciliada ou removida." });
      }
      const ln = rows(lnRes)[0] as any;
      const dataPg = typeof ln.data === "string" ? ln.data.slice(0, 10) : new Date(ln.data).toISOString().slice(0, 10);
      // Rev. 3319 — GUARD DE CONTA: só baixa membros da MESMA conta da linha (ou sem conta).
      // `dbExecute` liga params por ORDEM DE APARIÇÃO ($N é cosmético), então o lineConta vai
      // como ÚLTIMO item do array (aparece por último no texto, na cláusula de conta).
      const lineConta = Number(ln.contaBancariaId);
      // 2) Baixa de TODOS os membros. CRÍTICO: `dbExecute` liga params por ORDEM DE APARIÇÃO
      //    TEXTUAL ($N é cosmético/ignorado). Ordem de aparição no texto (Rev. 3466+):
      //    $1=dataPg (SET data_pagamento), $2=lineConta (SET conta_bancaria_id COALESCE),
      //    $3=userId (SET conciliado_por_id), $4=userName (SET conciliado_por_nome),
      //    $5…$N+4=ids (IN), $N+5=companyId (WHERE), $N+6=lineConta (WHERE conta check).
      //    Rev. 3445 — conta_bancaria_id = COALESCE(...) vincula entradas sem-conta à conta da linha.
      const ph = ids.map((_, i) => `$${i + 5}`).join(",");
      const upd = await dbExecute(tx,
        `UPDATE financial_entries
            SET conciliado=1, data_conciliacao=CURRENT_DATE,
                status = CASE WHEN tipo='receita' THEN 'recebido' ELSE 'pago' END,
                data_pagamento = COALESCE(data_pagamento, $1::date),
                valor_realizado = COALESCE(valor_realizado, valor_previsto),
                conta_bancaria_id = COALESCE(conta_bancaria_id, $2),
                conciliado_em = NOW(), conciliado_por_id = $3, conciliado_por_nome = $4
          WHERE id IN (${ph}) AND company_id=$${ids.length + 5}
            AND COALESCE(conciliado,0)=0 AND status <> 'cancelado'
            AND (conta_bancaria_id IS NULL OR conta_bancaria_id = $${ids.length + 6})
          RETURNING id`,
        [dataPg, lineConta, ctx.user?.id ?? null, ctx.user?.name ?? null, ...ids, input.companyId, lineConta]);
      const okIds = rows(upd).map((r: any) => Number(r.id));
      conciliados = okIds.length;
      if (conciliados === 0) {
        // Nenhum membro pôde ser baixado (já conciliados/cancelados): desfaz a reserva da linha.
        throw new TRPCError({ code: "CONFLICT", message: "Nenhum lançamento do grupo pôde ser conciliado (já conciliados ou cancelados)." });
      }
      // Rev. 3319 — a reserva (passo 1) usou ids[0] como representante (entry_id), mas ids[0]
      // pode ser de OUTRA conta e ter sido PULADO pelo guard de conta do passo 2 (não baixado).
      // Reaponta o entry_id da linha p/ o 1º membro REALMENTE baixado (sempre da conta da linha
      // ou sem conta), evitando vínculo cross-account inconsistente em bank_statement_lines.
      if (okIds[0] !== ids[0]) {
        await dbExecute(tx,
          `UPDATE bank_statement_lines SET entry_id=$1 WHERE id=$2 AND company_id=$3`,
          [okIds[0], input.statementLineId, input.companyId]);
      }
      // 3) Registra os vínculos p/ undo (em lotes de 300 linhas).
      for (let i = 0; i < okIds.length; i += 300) {
        const chunk = okIds.slice(i, i + 300);
        const vals: string[] = [];
        const params: any[] = [];
        chunk.forEach((eid, j) => {
          vals.push(`($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`);
          params.push(input.companyId, input.statementLineId, eid);
        });
        await dbExecute(tx,
          `INSERT INTO financial_conciliacao_grupo (company_id, statement_line_id, entry_id) VALUES ${vals.join(",")}`,
          params);
      }
    });
    await createAuditLog({ action: "financial_conciliacao_grupo", userId: ctx.user?.id, companyId: input.companyId, details: `Linha ${input.statementLineId} conciliada com ${conciliados} lançamento(s) em grupo` });
    autoVincularNfsPorLinhas(input.companyId, [input.statementLineId]).catch(() => {});
    return { ok: true, conciliados, total: ids.length };
  }),

  // Rev. 3187 — Anexar comprovante (PIX / boleto / recibo) a um lançamento direto da
  // tela de Conciliação. O extrato de PIX/boleto é "anônimo" (não diz quem recebeu);
  // o comprovante garante a RASTREABILIDADE. Grava a URL (já enviada via uploadComprovante,
  // que valida tipo/tamanho) em financial_entries.comprovante_url. Aditivo, tenant-safe,
  // ZERO ALTER/DROP/DELETE.
  anexarComprovanteEntry: protectedProcedure.input(z.object({
    companyId: z.number(),
    entryId: z.number(),
    comprovanteUrl: z.string().min(1),
    // Rev. 3193 — campos OPCIONAIS já extraídos do comprovante por IA (via lerComprovante).
    // Quando presentes, gravam a IDENTIFICAÇÃO (beneficiário/doc/txid) usada no desempate.
    extraido: z.object({
      beneficiario: z.string().nullable().optional(),
      documento: z.string().nullable().optional(),
      txid: z.string().nullable().optional(),
      valor: z.number().nullable().optional(),
      data: z.string().nullable().optional(),
    }).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // dbExecute liga params por ORDEM DE APARIÇÃO ($N é cosmético) → montar na ordem.
    const sets: string[] = [`comprovante_url=$1`];
    const vals: any[] = [input.comprovanteUrl];
    let i = 2;
    if (input.extraido) {
      // NÃO confiar no cliente: sanitiza igual à saída da IA (clip/data/valor/doc BR-aware).
      const ex = _sanitizeComprovante(input.extraido);
      sets.push(`comprovante_beneficiario=$${i++}`); vals.push(ex.beneficiario);
      sets.push(`comprovante_documento=$${i++}`); vals.push(ex.documento);
      sets.push(`comprovante_txid=$${i++}`); vals.push(ex.txid);
      sets.push(`comprovante_valor=$${i++}`); vals.push(ex.valor);
      sets.push(`comprovante_data=$${i++}`); vals.push(ex.data);
      sets.push(`comprovante_extraido_em=NOW()`);
    }
    sets.push(`updated_at=NOW()`);
    const pId = i++, pCo = i++;
    vals.push(input.entryId, input.companyId);
    const res = await dbExecute(db,
      `UPDATE financial_entries SET ${sets.join(", ")}
        WHERE id=$${pId} AND company_id=$${pCo}
        RETURNING id`,
      vals);
    if (rows(res).length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado nesta empresa." });
    }
    await createAuditLog({ action: "financial_entry_comprovante_anexado", userId: ctx.user?.id, companyId: input.companyId, details: `Entry ${input.entryId} comprovante anexado` });
    return { ok: true };
  }),

  // Rev. 3193 — LÊ um comprovante por IA de visão (Gemini) e devolve os campos extraídos
  // (beneficiário / CNPJ-CPF / ID-transação / valor / data). NÃO grava nada — o cliente usa
  // o resultado pra anexar (com identificação) e pra casar em lote. Gateado pelo toggle de
  // IA "financeiro" (Configurações › Inteligência Artificial). ZERO ALTER/DROP/DELETE.
  lerComprovante: protectedProcedure.input(z.object({
    companyId: z.number(),
    fileBase64: z.string().min(1),
    contentType: z.string(),
  })).mutation(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await assertAiModuleEnabled(input.companyId, "financeiro");
    const dados = await _lerComprovanteIA(input.fileBase64, input.contentType);
    return { dados };
  }),

  // Rev. 3193 — RELÊ EM LOTE os comprovantes JÁ anexados que ainda não passaram pela IA
  // (comprovante_url preenchido + comprovante_extraido_em NULL). Processa um lote pequeno por
  // chamada (free-tier do Gemini); o cliente repete até `restantes`=0. Em falha por arquivo,
  // marca `comprovante_extraido_em=NOW()` (sem dados) p/ NÃO travar o loop num doc ilegível.
  // Gateado pelo toggle de IA "financeiro". ZERO ALTER/DROP/DELETE.
  relerComprovantesPendentes: protectedProcedure.input(z.object({
    companyId: z.number(),
    limite: z.number().int().min(1).max(20).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await assertAiModuleEnabled(input.companyId, "financeiro");
    const lim = input.limite ?? 6;
    const pendRes = await dbExecute(db,
      `SELECT id, comprovante_url AS "comprovanteUrl"
         FROM financial_entries
        WHERE company_id=$1 AND comprovante_url IS NOT NULL AND comprovante_url <> ''
          AND comprovante_extraido_em IS NULL
        ORDER BY id DESC LIMIT ${lim}`,
      [input.companyId]);
    const pend = rows(pendRes) as any[];
    let processados = 0, falhas = 0;
    for (const e of pend) {
      try {
        const bin = await _baixarComprovante(e.comprovanteUrl);
        if (!bin) throw new Error("download falhou");
        const dados = await _lerComprovanteIA(bin.base64, bin.contentType);
        await dbExecute(db,
          `UPDATE financial_entries
              SET comprovante_beneficiario=$1, comprovante_documento=$2, comprovante_txid=$3,
                  comprovante_valor=$4, comprovante_data=$5, comprovante_extraido_em=NOW(), updated_at=NOW()
            WHERE id=$6 AND company_id=$7`,
          [dados.beneficiario, dados.documento, dados.txid, dados.valor, dados.data, e.id, input.companyId]);
        processados++;
      } catch {
        falhas++;
        // Marca como "tentado" p/ não reprocessar o mesmo arquivo ilegível em loop.
        try {
          await dbExecute(db,
            `UPDATE financial_entries SET comprovante_extraido_em=NOW(), updated_at=NOW()
              WHERE id=$1 AND company_id=$2 AND comprovante_extraido_em IS NULL`,
            [e.id, input.companyId]);
        } catch { /* best-effort */ }
      }
    }
    const restRes = await dbExecute(db,
      `SELECT COUNT(*)::int AS n FROM financial_entries
        WHERE company_id=$1 AND comprovante_url IS NOT NULL AND comprovante_url <> ''
          AND comprovante_extraido_em IS NULL`,
      [input.companyId]);
    const restantes = Number((rows(restRes)[0] as any)?.n ?? 0);
    return { processados, falhas, restantes };
  }),

  // Rev. 3137 — SUGESTÃO AUTOMÁTICA DE CONCILIAÇÃO. Lê o extrato (linhas ainda NÃO
  // conciliadas) da conta + período e propõe, para CADA linha, o lançamento do
  // sistema que casa por VALOR (em centavos, evita ruído de float), DIREÇÃO
  // (crédito↔receita / débito↔despesa; transferência casa nos dois sentidos) e
  // PROXIMIDADE DE DATA (janela `toleranciaDias`). Greedy pelo menor delta: cada
  // linha e cada lançamento entram em no máx. 1 par. READ-ONLY (não grava nada).
  sugerirConciliacao: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    dataInicio: z.string().optional(),
    dataFim: z.string().optional(),
    toleranciaDias: z.number().int().min(0).max(60).optional(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const tol = input.toleranciaDias ?? 0;

    // dbExecute liga params por ORDEM DE APARIÇÃO ($N é cosmético) → manter ascendente.
    // Rev. 3914 — `desconsiderado_em IS NULL`: exclui linhas desconsideradas do % de
    // conciliação (cheques par devolvidos marcados como "desconsiderar"). Sem este filtro,
    // o engine sugeria conciliar linhas que já foram excluídas do cálculo, exibindo falsos
    // "33 linhas sem correspondência" no painel de sugestões.
    // Rev. 3940 — `sugestao_ignorada_em IS NULL`: exclui linhas em que o usuário clicou
    // "ignorar" na sugestão (persiste no banco; não volta no reload).
    const stConds = [`company_id=$1`, `conta_bancaria_id=$2`, `COALESCE(conciliado,0)=0`, `excluido_em IS NULL`, `desconsiderado_em IS NULL`, `sugestao_ignorada_em IS NULL`];
    const stVals: any[] = [input.companyId, input.contaBancariaId];
    let si = 3;
    if (input.dataInicio) { stConds.push(`data>=$${si++}`); stVals.push(input.dataInicio); }
    if (input.dataFim) { stConds.push(`data<=$${si++}`); stVals.push(input.dataFim); }
    const stRes = await dbExecute(db,
      `SELECT id, data, descricao, valor, tipo FROM bank_statement_lines
       WHERE ${stConds.join(" AND ")} ORDER BY data ASC, id ASC`, stVals);
    const linhas = rows(stRes) as any[];
    if (linhas.length === 0) return { sugestoes: [], semMatch: [], totalLinhas: 0 };

    // Lançamentos elegíveis: não conciliados, não cancelados, da conta (ou sem conta).
    // Rev. 3449 — filtro ESTRITO de data nos entries: apenas lançamentos cujo COALESCE
    // (data_pagamento, data_vencimento, data_competencia) cai dentro do período analisado
    // [dataInicio, dataFim] exato, sem buffer. Quando o usuário está em modo "Mês" (ex.:
    // Janeiro) só entries de janeiro entram no pool; entradas de dezembro ou fevereiro são
    // excluídas independente da tolerância configurada. Em modo "Ano todo" dataInicio=01/01
    // e dataFim=31/12, então o ano inteiro fica elegível. A tolerância (tol) continua
    // controlando apenas o δ de data permitido dentro de cada par extrato↔lançamento.
    const entConds: string[] = [
      `e.company_id=$1`,
      `COALESCE(e.conciliado,0)=0`,
      `e.status <> 'cancelado'`,
      sqlNotProjecao("e.origem_modulo"),
      `(e.conta_bancaria_id=$2 OR e.conta_bancaria_id IS NULL)`,
    ];
    const entVals: any[] = [input.companyId, input.contaBancariaId];
    let ei = 3;
    // Rev. 3736 — CHEQUES/BOLETOS COMPENSAM EM OUTRO MÊS. O Controle de Cheques lança o
    // cheque/boleto na data "bom para" (parcela), mas a compensação no extrato pode cair
    // num mês diferente (ex.: cheque de dez/fev compensando em jan). Por isso, além da
    // janela ESTRITA do período (Rev. 3449, para os demais lançamentos), abrimos uma janela
    // AMPLA de ±MESES_JANELA_CHEQUE meses SÓ para lançamentos com forma de pagamento
    // cheque/boleto. As demais formas continuam estritas ao período analisado.
    const MESES_JANELA_CHEQUE = 6;
    const addMonthsIso = (iso: string, n: number): string => {
      const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + n);
      return d.toISOString().slice(0, 10);
    };
    const DT_ENT = `COALESCE(e.data_pagamento, e.data_vencimento, e.data_competencia)`;
    const EH_CHEQUE_BOLETO_SQL = `LOWER(COALESCE(e.forma_pagamento,'')) IN ('cheque','boleto')`;
    if (input.dataInicio && input.dataFim) {
      const wIni = addMonthsIso(input.dataInicio, -MESES_JANELA_CHEQUE);
      const wFim = addMonthsIso(input.dataFim, MESES_JANELA_CHEQUE);
      // dbExecute liga params por ORDEM DE APARIÇÃO: estrito-ini, estrito-fim, amplo-ini, amplo-fim.
      entConds.push(
        `( (${DT_ENT} >= $${ei}::date AND ${DT_ENT} <= $${ei + 1}::date)
           OR (${EH_CHEQUE_BOLETO_SQL} AND ${DT_ENT} >= $${ei + 2}::date AND ${DT_ENT} <= $${ei + 3}::date) )`);
      entVals.push(input.dataInicio, input.dataFim, wIni, wFim);
      ei += 4;
    } else {
      if (input.dataInicio) { entConds.push(`${DT_ENT} >= $${ei++}::date`); entVals.push(input.dataInicio); }
      if (input.dataFim) { entConds.push(`${DT_ENT} <= $${ei++}::date`); entVals.push(input.dataFim); }
    }
    const entRes = await dbExecute(db,
      `SELECT e.id, e.tipo, e.valor_previsto AS "valorPrevisto", e.valor_realizado AS "valorRealizado",
              e.data_competencia AS "dataCompetencia", e.data_vencimento AS "dataVencimento",
              e.data_pagamento AS "dataPagamento", e.descricao, e.fornecedor_nome AS "fornecedorNome",
              e.conta_nome AS "contaNome", e.status, e.obra_nome AS "obraNome",
              e.comprovante_beneficiario AS "comprovanteBeneficiario",
              e.comprovante_documento AS "comprovanteDocumento",
              e.comprovante_txid AS "comprovanteTxid",
              e.cheque_numero AS "chequeNumero",
              e.forma_pagamento AS "formaPagamento"
       FROM financial_entries e
       WHERE ${entConds.join(" AND ")}`,
      entVals);
    const entries = rows(entRes) as any[];

    // Controle de Cheques — FONTE DE IDENTIFICAÇÃO p/ as linhas anônimas do extrato
    // da Caixa "COMPENSACAO CHEQUE NNN". O cheque NÃO é lançamento; serve só para
    // dizer QUEM é o favorecido. Identifica por nº + VALOR batendo (nunca pelo nome
    // sozinho). Indexado por `${numeroSemZeros}|${centavos}` e por nº (desempate visual).
    const chqRes = await dbExecute(db,
      `SELECT numero_cheque AS "numeroCheque", valor, fornecedor_nome AS "fornecedorNome", status,
              data_compensacao AS "dataCompensacao", data_vencimento AS "dataVencimento"
         FROM financial_cheques
        WHERE company_id=$1 AND excluido_em IS NULL AND numero_cheque IS NOT NULL`,
      [input.companyId]);
    const chequesArr = rows(chqRes) as any[];
    const chequesByNumVal = new Map<string, any>();
    const chequesByNum = new Map<string, any[]>();
    // Rev. 4132 — MUITOS bancos (ex.: Caixa) concatenam o nº do cheque ao final da
    // descrição SEM separador nem palavra "cheque" antes dele ("Cheque Emitido/Debitado"
    // + doc grudado noutra linha, ou nenhum nº quando o banco simplesmente não informa).
    // Sem nº algum na descrição, o único jeito de identificar o favorecido é por
    // VALOR + DATA DE COMPENSAÇÃO próxima — indexa por centavos p/ esse fallback.
    const chequesByValor = new Map<number, any[]>();
    for (const c of chequesArr) {
      const num = String(c.numeroCheque ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
      const cts = c.valor != null ? Math.round(Math.abs(Number(c.valor)) * 100) : null;
      if (cts != null) {
        if (!chequesByValor.has(cts)) chequesByValor.set(cts, []);
        chequesByValor.get(cts)!.push(c);
      }
      if (!num) continue;
      if (cts != null) {
        chequesByNumVal.set(`${num}|${cts}`, c);
        if (!chequesByNum.has(num)) chequesByNum.set(num, []);
        chequesByNum.get(num)!.push(c);
      }
    }
    const extrairNumCheque = (descricao: any): string | null => {
      const m = String(descricao ?? "").match(/cheque\s*n?[ºo°.]*\s*0*(\d{1,12})/i);
      if (m && m[1]) return m[1].replace(/^0+/, "") || m[1];
      return null;
    };
    // Rev. 3263 — mesma lógica do matchChequeLinha: número via "Doc NNN" (Caixa) quando a
    // linha parece cheque + tolerância de ≤2 centavos no valor (arredondamento bancário).
    const extrairDocCheque = (descricao: any): string | null => {
      const m = String(descricao ?? "").match(/\bdoc(?:umento)?\.?\s*0*(\d{1,12})/i);
      if (m && m[1]) return m[1].replace(/^0+/, "") || m[1];
      return null;
    };
    // Rev. 3748 — nº do cheque vindo dos CAMPOS ESTRUTURADOS do lançamento (não só da descrição).
    // Sem isto, a trava "lnNum !== eNum ⇒ não é o mesmo cheque" não dispara quando o número
    // mora em cheque_numero/comprovante_documento (e não no texto) → cheques de MESMO valor/data
    // (ex.: JEFCAR 902 × 903, ambos R$2.050 em 06/01) cruzam errado.
    const normNumDigits = (v: any): string | null => {
      const d = String(v ?? "").replace(/[^0-9]/g, "");
      if (!d) return null;
      return d.replace(/^0+/, "") || d;
    };
    const extrairNumEstruturado = (e: any): string | null => {
      const c = normNumDigits(e.chequeNumero); // campo dedicado: sempre vale como nº de cheque
      if (c) return c;
      const doc = normNumDigits(e.comprovanteDocumento); // só curto: longo = CNPJ/CPF (usado em matchId)
      if (doc && doc.length <= 8) return doc;
      return null;
    };
    // Rev. 4132 — fallback p/ quando o banco gruda o nº do cheque no FIM da descrição
    // SEM a palavra "cheque" ou "doc" na frente (ex.: "CHEQUE EMITIDO/DEBITADO001295").
    const extrairNumChequeSufixo = (descricao: any): string | null => {
      const s = String(descricao ?? "");
      if (!/cheq/i.test(s)) return null;
      const m = s.match(/(\d{3,12})\s*$/);
      if (m && m[1]) return m[1].replace(/^0+/, "") || m[1];
      return null;
    };
    const identificarCheque = (ln: any): { numero: string; fornecedor: string } | null => {
      const ehCheque = /cheq|compensa/i.test(String(ln.descricao ?? ""));
      const num = extrairNumCheque(ln.descricao)
        ?? (ehCheque ? extrairDocCheque(ln.descricao) : null)
        ?? (ehCheque ? extrairNumChequeSufixo(ln.descricao) : null);
      const cts = Math.round(Math.abs(Number(ln.valor) || 0) * 100);
      if (num) {
        let c = chequesByNumVal.get(`${num}|${cts}`); // exige nº + VALOR
        if (!c) {
          const arr = chequesByNum.get(num);
          if (arr) {
            const perto = arr.filter((x) => { const v = x.valor != null ? Math.round(Math.abs(Number(x.valor)) * 100) : null; return v != null && Math.abs(v - cts) <= 2; });
            if (perto.length === 1) c = perto[0];
          }
        }
        if (c) return { numero: num, fornecedor: c.fornecedorNome ?? "" };
      }
      // Rev. 4132 — sem nº ALGUM na descrição (ex.: "Cheque Emitido/Debitado" puro, banco
      // não informa nº nenhum): casa por VALOR + DATA DE COMPENSAÇÃO/VENCIMENTO próxima
      // (±15 dias), e SÓ se o resultado for ÚNICO (ambíguo nunca identifica — regra de ouro
      // da conciliação: nada é atribuído sem certeza).
      if (ehCheque && !num) {
        const candidatos = chequesByValor.get(cts) ?? [];
        if (candidatos.length) {
          const lnMs = Date.parse(String(ln.data ?? "").slice(0, 10) + "T00:00:00Z");
          if (!isNaN(lnMs)) {
            const perto = candidatos.filter((x: any) => {
              const ref = x.dataCompensacao ?? x.dataVencimento;
              if (!ref) return false;
              const cms = Date.parse(String(ref).slice(0, 10) + "T00:00:00Z");
              return !isNaN(cms) && Math.abs(cms - lnMs) <= 15 * 86400000;
            });
            if (perto.length === 1) {
              const c = perto[0];
              const numC = String(c.numeroCheque ?? "").replace(/[^0-9]/g, "").replace(/^0+/, "");
              return { numero: numC, fornecedor: c.fornecedorNome ?? "" };
            }
          }
        }
      }
      return null;
    };

    const toMs = (v: any) => {
      if (!v) return null;
      const s = typeof v === "string" ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10);
      const t = Date.parse(s + "T00:00:00Z");
      return isNaN(t) ? null : t;
    };
    const cents = (v: any) => Math.round(Math.abs(Number(v) || 0) * 100);
    const entDate = (e: any) => toMs(e.dataPagamento) ?? toMs(e.dataVencimento) ?? toMs(e.dataCompetencia);
    const entCents = (e: any) => cents(e.valorRealizado ?? e.valorPrevisto);
    // Rev. 3736 — lançamento cheque/boleto pode compensar fora do mês → no pareamento usa
    // tolerância de data AMPLA (TOL_CHEQUE_DIAS cobre ±MESES_JANELA_CHEQUE meses).
    const ehChequeBoletoEntry = (e: any) => /cheque|boleto/i.test(String(e.formaPagamento ?? ""));
    const TOL_CHEQUE_DIAS = MESES_JANELA_CHEQUE * 31;

    const byCents = new Map<number, any[]>();
    for (const e of entries) { const k = entCents(e); if (!byCents.has(k)) byCents.set(k, []); byCents.get(k)!.push(e); }

    // Rev. 3193 — DESEMPATE POR COMPROVANTE: o extrato de PIX/boleto é anônimo, mas o
    // comprovante anexado ao lançamento traz beneficiário / CNPJ-CPF / ID-da-transação.
    // Se algum desses identificadores aparece na DESCRIÇÃO da linha do extrato, é o mesmo
    // pagamento → marca `via` e ELEVA a confiança. TRAVA: a identidade só atua sobre
    // candidatos que JÁ casaram por VALOR + DATA (nunca concilia pelo nome sozinho).
    const matchId = (ln: any, e: any): string | null => {
      const d = _normTxt(ln.descricao);
      if (!d) return null;
      const dCompact = d.replace(/\s+/g, "");
      const txid = _normTxt(e.comprovanteTxid).replace(/\s+/g, "");
      if (txid && txid.length >= 8 && dCompact.includes(txid)) return "txid";
      const doc = _soDigitos(e.comprovanteDocumento);
      const dDigits = String(ln.descricao ?? "").replace(/[^0-9]/g, "");
      if (doc && doc.length >= 11 && dDigits.includes(doc)) return "documento";
      const benef = _normTxt(e.comprovanteBeneficiario);
      if (benef) {
        const toks = benef.split(" ").filter(t => t.length >= 4);
        const hits = toks.filter(t => d.includes(t)).length;
        if (toks.length > 0 && hits >= Math.min(2, toks.length)) return "beneficiario";
      }
      return null;
    };

    // Rev. 3855 — tipo estendido: diffPct presente quando o match é por tolerância percentual
    // (≤15% receita / ≤5% despesa) em vez de centavos exatos.
    type Cand = { linha: any; entry: any; delta: number; via: string | null; diffPct?: number };
    const cands: Cand[] = [];
    for (const ln of linhas) {
      const lc = cents(ln.valor);
      if (lc === 0) continue;
      const dir = Number(ln.valor) >= 0 ? "receita" : "despesa";
      const lms = toMs(ln.data);
      // Rev. 3736 — nº do cheque/doc na linha do extrato (p/ casar o cheque CERTO, não só por valor).
      const lnDesc = String(ln.descricao ?? "");
      const lnEhCheque = /cheq|compensa/i.test(lnDesc);
      const lnNum = extrairNumCheque(lnDesc) ?? (lnEhCheque ? extrairDocCheque(lnDesc) : null);
      for (const e of (byCents.get(lc) ?? [])) {
        if (e.tipo !== dir && e.tipo !== "transferencia") continue;
        const ems = entDate(e);
        const delta = (lms != null && ems != null) ? Math.round(Math.abs(lms - ems) / 86400000) : 9999;
        let via = matchId(ln, e);
        if (ehChequeBoletoEntry(e)) {
          // Rev. 3736 — casa pelo NÚMERO do cheque/doc quando ambos os lados o expõem:
          // números explícitos DIFERENTES ⇒ NÃO é o mesmo cheque (evita "903 = 902");
          // mesmo número ⇒ casamento forte (autoritativo, ignora distância de data).
          const eNum = extrairNumCheque(String(e.descricao ?? "")) ?? extrairDocCheque(String(e.descricao ?? "")) ?? extrairNumEstruturado(e);
          if (lnNum && eNum) {
            if (lnNum !== eNum) continue;
            via = via ?? "cheque";
          }
          // Sem casamento por número: aceita o par com tolerância AMPLA (compensação fora do mês).
          if (via !== "cheque" && delta > Math.max(tol, TOL_CHEQUE_DIAS)) continue;
        } else {
          if (delta > tol) continue;
        }
        cands.push({ linha: ln, entry: e, delta, via });
      }
    }

    // Rev. 3855 — PASSAGEM 2: tolerância percentual para linhas sem match exato.
    // Créditos (receita = NFS-e emitidas): ≤15% — cliente pode reter ISS+IR, reduzindo
    //   o crédito em até ~15% vs o valor bruto da nota.
    // Débitos (despesa = NF-e recebidas): ≤5% — você paga o valor exato da nota; aceita
    //   pequena variação só por arredondamento bancário ou multa/desconto mínimo.
    // Apenas entradas e linhas que NÃO tiveram match exato entram nessa passagem (evita
    // competição com os pares já fechados). Cheques/boletos mantêm a lógica de nº.
    {
      const exatoLinhaIds = new Set(cands.map(c => c.linha.id));
      const exatoEntryIds = new Set(cands.map(c => c.entry.id));
      for (const ln of linhas) {
        if (exatoLinhaIds.has(ln.id)) continue;
        const lc = cents(ln.valor);
        if (lc === 0) continue;
        const dir = Number(ln.valor) >= 0 ? "receita" : "despesa";
        // receita = emitidas (retenções ISS/IR chegam a 15%); despesa = recebidas (paga exato → 5%)
        const tolPct = dir === "receita" ? 0.15 : 0.05;
        const lms = toMs(ln.data);
        const lnDesc2 = String(ln.descricao ?? "");
        const lnEhCheque2 = /cheq|compensa/i.test(lnDesc2);
        const lnNum2 = extrairNumCheque(lnDesc2) ?? (lnEhCheque2 ? extrairDocCheque(lnDesc2) : null);
        for (const e of entries) {
          if (exatoEntryIds.has(e.id)) continue;
          if (e.tipo !== dir && e.tipo !== "transferencia") continue;
          const ec = entCents(e);
          if (ec === 0) continue;
          const diff = Math.abs(lc - ec) / Math.max(lc, ec);
          if (diff === 0 || diff > tolPct) continue; // diff=0 = exato (já tratado), diff>tol = fora
          const ems = entDate(e);
          const delta = (lms != null && ems != null) ? Math.round(Math.abs(lms - ems) / 86400000) : 9999;
          if (ehChequeBoletoEntry(e)) {
            const eNum2 = extrairNumCheque(String(e.descricao ?? "")) ?? extrairDocCheque(String(e.descricao ?? "")) ?? extrairNumEstruturado(e);
            if (lnNum2 && eNum2 && lnNum2 !== eNum2) continue;
            if (delta > TOL_CHEQUE_DIAS) continue;
          } else {
            if (delta > tol) continue;
          }
          cands.push({ linha: ln, entry: e, delta, via: matchId(ln, e), diffPct: diff });
        }
      }
    }

    const ambiguasPorLinha = new Map<number, number>();
    for (const c of cands) ambiguasPorLinha.set(c.linha.id, (ambiguasPorLinha.get(c.linha.id) ?? 0) + 1);

    // Ordena: comprovante (via) primeiro → match exato antes do fuzzy → menor delta → id.
    // O greedy abaixo fecha primeiro os pares de maior confiança.
    cands.sort((a, b) =>
      (a.via ? 0 : 1) - (b.via ? 0 : 1) ||
      (a.diffPct ? 1 : 0) - (b.diffPct ? 1 : 0) ||
      a.delta - b.delta ||
      a.linha.id - b.linha.id
    );
    const usadasLinha = new Set<number>(), usadasEntry = new Set<number>();
    const sugestoes: any[] = [];
    for (const c of cands) {
      if (usadasLinha.has(c.linha.id) || usadasEntry.has(c.entry.id)) continue;
      usadasLinha.add(c.linha.id); usadasEntry.add(c.entry.id);
      const ambiguo = (ambiguasPorLinha.get(c.linha.id) ?? 1) > 1;
      const ems = entDate(c.entry);
      const viaLabel = c.via === "txid" ? "ID da transação" : c.via === "documento" ? "CNPJ/CPF" : c.via === "beneficiario" ? "beneficiário" : null;
      // Rev. 3405 — score numérico de confiança (0-100).
      // Rev. 3855 — match fuzzy (diffPct > 0) penaliza score; nunca chega a "alta".
      const diffPctVal = (c as any).diffPct as number | undefined;
      const scoreConfianca = c.via
        ? Math.max(70, 95 - c.delta * 3)
        : diffPctVal != null
          // fuzzy: desconta pelo Δ% de valor + distância de data (teto 62, piso 30)
          ? Math.max(30, 62 - Math.round(diffPctVal * 100) * 2 - c.delta * 2)
          : ambiguo
            ? Math.max(40, 55 - c.delta * 3)
            : c.delta === 0 ? 85 : c.delta === 1 ? 78 : c.delta <= 3 ? 70 : Math.max(50, 65 - c.delta * 2);
      // Rev. 3855 — confiança fuzzy: sempre "media" (usuário deve confirmar que a diferença
      // de valor é retenção/desconto legítima, nunca auto-confirmar como "alta").
      const confianca = c.via
        ? "alta"
        : diffPctVal != null
          ? "media"
          : (!ambiguo && c.delta === 0 ? "alta" : "media");
      // Rótulo informativo do Δ% para matches fuzzy (ex.: "Δ valor: 6,3% — possível retenção")
      const diffLabel = diffPctVal != null
        ? `Δ valor: ${(diffPctVal * 100).toFixed(1)}% — ${(Number(c.linha.valor) >= 0 ? "possível retenção (ISS/IR)" : "possível desconto/multa")}`
        : null;
      sugestoes.push({
        statementLineId: c.linha.id, entryId: c.entry.id,
        extratoData: c.linha.data, extratoDescricao: c.linha.descricao, extratoValor: Number(c.linha.valor),
        entryDescricao: c.entry.descricao ?? c.entry.contaNome ?? "—",
        entryFornecedor: c.entry.fornecedorNome ?? "", entryObra: c.entry.obraNome ?? "",
        entryData: ems ? new Date(ems).toISOString().slice(0, 10) : null,
        entryValor: Number(c.entry.valorRealizado ?? c.entry.valorPrevisto), entryTipo: c.entry.tipo,
        deltaDias: c.delta,
        confianca,
        scoreConfianca,
        identificadoVia: diffLabel ?? viaLabel,
        entryComprovanteBeneficiario: c.entry.comprovanteBeneficiario ?? null,
        matchFuzzy: diffPctVal != null,
        diffPct: diffPctVal != null ? Math.round(diffPctVal * 1000) / 10 : null,
      });
    }
    // Enriquece as SUGESTÕES já pareadas: se a linha é compensação de cheque e bate
    // nº + valor com o Controle de Cheques, registra o favorecido (informativo).
    for (const s of sugestoes) {
      const chq = identificarCheque({ descricao: s.extratoDescricao, valor: s.extratoValor });
      if (chq) {
        s.chequeNumero = chq.numero;
        s.chequeFornecedor = chq.fornecedor;
        if (!s.identificadoVia) s.identificadoVia = `cheque nº ${chq.numero}`;
      }
    }
    // Rev. 3405 — Enriquece sugestões com padrão histórico de conciliações anteriores (sem IA).
    // Para cada descrição de extrato, busca qual (fornecedor, categoria) foi usado na maioria
    // das vezes que aquela descrição foi conciliada — sugere automaticamente sem chamar LLM.
    try {
      const uniquePrefixes = [...new Set(sugestoes.map((s: any) =>
        (String(s.extratoDescricao ?? "")).toUpperCase().trim().slice(0, 30)
      ))].filter(Boolean).filter(p => !/\$\d/.test(p)); // exclui $N que confunde dbExecute (split /\$\d+/g)
      if (uniquePrefixes.length > 0) {
        const safeEsc = (s: string) => s.replace(/'/g, "''");
        const valClauses = uniquePrefixes.map(p => `('${safeEsc(p)}')`).join(",");
        const histRes = await dbExecute(db, `
          WITH prefixes(p) AS (VALUES ${valClauses})
          SELECT p, e.fornecedor_nome, e.conta_id, fa.nome AS conta_nome, COUNT(*) AS freq
          FROM prefixes
          JOIN bank_statement_lines bsl ON UPPER(LEFT(TRIM(bsl.descricao), 30)) = p
          JOIN financial_entries e ON e.id = bsl.entry_id
          LEFT JOIN financial_accounts fa ON fa.id = e.conta_id
          WHERE bsl.company_id=$1 AND bsl.conciliado=1 AND bsl.excluido_em IS NULL
            AND e.fornecedor_nome IS NOT NULL AND e.company_id=$1
          GROUP BY p, e.fornecedor_nome, e.conta_id, fa.nome
          ORDER BY p, freq DESC
        `, [input.companyId]);
        // Mapa: prefix → melhor match histórico (1ª linha = maior freq)
        const histMap = new Map<string, { fornecedorNome: string; contaId: number | null; contaNome: string | null; freq: number }>();
        for (const r of rows(histRes) as any[]) {
          const p = String(r.p);
          if (!histMap.has(p)) histMap.set(p, { fornecedorNome: r.fornecedor_nome, contaId: r.conta_id ?? null, contaNome: r.conta_nome ?? null, freq: Number(r.freq) });
        }
        for (const s of sugestoes) {
          const prefix = (String(s.extratoDescricao ?? "")).toUpperCase().trim().slice(0, 30);
          const hist = histMap.get(prefix);
          if (hist) s.padraoErp = hist;
        }
      }
    } catch { /* não bloquear sugestões por falha no histórico */ }
    const matched = new Set(sugestoes.map(s => s.statementLineId));
    const semMatch = linhas.filter(l => !matched.has(l.id))
      .map(l => {
        const chq = identificarCheque(l);
        return {
          statementLineId: l.id, data: l.data, descricao: l.descricao, valor: Number(l.valor),
          chequeNumero: chq?.numero ?? null,
          chequeFornecedor: chq?.fornecedor ?? null,
        };
      });
    return { sugestoes, semMatch, totalLinhas: linhas.length };
  }),

  // Rev. 3137 — CONCILIAÇÃO EM LOTE a partir das sugestões. Para cada par marca a
  // linha do extrato + o lançamento como conciliados E dá BAIXA: status pago/recebido
  // e `data_pagamento = data do EXTRATO` (caixa REAL) quando ainda não houver data.
  // Best-effort por par (idempotente: pula o que já está conciliado/cancelado),
  // tenant-safe. ZERO ALTER/DROP/DELETE.
  conciliarSugestoes: protectedProcedure.input(z.object({
    companyId: z.number(),
    pares: z.array(z.object({ statementLineId: z.number(), entryId: z.number() })).min(1),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Rev. 3749 — ATÔMICO + 1 ROUND-TRIP. ANTES: loop com 2-3 round-trips POR PAR
    // (reserva linha → baixa lançamento → undo). Com VÁRIOS cheques o handler levava
    // ~1s+ até o 1º byte e a resposta às vezes se PERDIA no proxy do preview ("Failed to
    // execute 'json' on 'Response': Unexpected end of JSON input"), DEIXANDO estado PARCIAL
    // (parte já conciliada, mas a UI nunca recebia o sucesso). Agora UM ÚNICO statement
    // set-based (CTE) concilia todos os pares elegíveis de uma vez: idempotente (pula o que
    // já está conciliado/cancelado/excluído), tenant-safe, sem sucesso parcial percebido.
    // Elegibilidade exige AMBOS os lados livres (linha do extrato + lançamento) → não deixa
    // linha conciliada apontando p/ lançamento sem baixa (substitui o antigo undo). Usa
    // db.$client.query (raw pg) porque dbExecute liga params por ORDEM DE APARIÇÃO e aqui o
    // $1/$2/$3 reaparecem fora de ordem em relação ao VALUES.
    // Dedup defensivo: descarta pares que repetem uma linha OU um lançamento já visto.
    // Sem isso, um line_id/entry_id duplicado no payload faria o `UPDATE ... FROM elig`
    // ter mais de uma linha-fonte para o mesmo alvo (Postgres escolhe fonte indefinida →
    // linha conciliada sem baixa correspondente). A UI mapeia 1 linha→1 lançamento, então
    // na prática isto é um no-op de segurança.
    const seenLine = new Set<number>();
    const seenEntry = new Set<number>();
    const pares = input.pares.filter((p) => {
      if (seenLine.has(p.statementLineId) || seenEntry.has(p.entryId)) return false;
      seenLine.add(p.statementLineId);
      seenEntry.add(p.entryId);
      return true;
    });
    if (pares.length === 0) return { ok: true, conciliados: 0, total: input.pares.length, conciliadosLineIds: [] as number[] };
    const params: unknown[] = [input.companyId, ctx.user?.id ?? null, ctx.user?.name ?? null];
    const valuesSql = pares
      .map((_, i) => `($${4 + i * 2}::int,$${5 + i * 2}::int)`)
      .join(",");
    for (const p of pares) params.push(p.statementLineId, p.entryId);
    // `FOR UPDATE OF l, e` em `elig` SERIALIZA conciliações concorrentes do mesmo par: dois
    // requests simultâneos sobre a mesma linha/lançamento bloqueiam até o 1º commitar; o 2º
    // reavalia o guard (COALESCE(conciliado,0)=0) contra a versão já commitada → fica de fora
    // → nada de "linha conciliada apontando p/ lançamento já baixado". Como elig trava+confirma
    // ambos os lados, upd_l e upd_e aplicam SEMPRE os 2 juntos (sem o antigo undo).
    const sqlText = `
      WITH pares(line_id, entry_id) AS (VALUES ${valuesSql}),
      elig AS (
        SELECT p.line_id, p.entry_id, l.data AS ldata
          FROM pares p
          JOIN bank_statement_lines l ON l.id = p.line_id AND l.company_id = $1
           AND COALESCE(l.conciliado,0) = 0 AND l.excluido_em IS NULL
          JOIN financial_entries e ON e.id = p.entry_id AND e.company_id = $1
           AND COALESCE(e.conciliado,0) = 0 AND e.status <> 'cancelado'
         FOR UPDATE OF l, e
      ),
      upd_l AS (
        UPDATE bank_statement_lines l SET conciliado = 1, entry_id = el.entry_id
          FROM elig el
         WHERE l.id = el.line_id AND l.company_id = $1
           AND COALESCE(l.conciliado,0) = 0 AND l.excluido_em IS NULL
        RETURNING l.id AS line_id, l.entry_id AS entry_id
      ),
      upd_e AS (
        UPDATE financial_entries fe
           SET conciliado = 1, data_conciliacao = CURRENT_DATE,
               status = CASE WHEN fe.tipo='receita' THEN 'recebido' ELSE 'pago' END,
               data_pagamento = COALESCE(fe.data_pagamento, el.ldata::date),
               valor_realizado = COALESCE(fe.valor_realizado, fe.valor_previsto),
               conciliado_em = NOW(), conciliado_por_id = $2, conciliado_por_nome = $3
          FROM elig el
         WHERE fe.id = el.entry_id AND fe.company_id = $1
           AND COALESCE(fe.conciliado,0) = 0 AND fe.status <> 'cancelado'
        RETURNING fe.id AS entry_id
      ),
      -- Rev. 3751 — só conta/retorna os pares em que AMBOS os lados foram efetivamente
      -- gravados (linha conciliada E lançamento baixado). Retornar o array das LINHAS
      -- realmente conciliadas (não só a contagem) deixa o frontend esconder APENAS o que
      -- persistiu: pares pulados (lançamento já conciliado/indisponível p/ ex. cache de
      -- sugestão defasado) continuam visíveis em vez de "sumir e voltar no reload".
      ok AS (
        SELECT ul.line_id FROM upd_l ul JOIN upd_e ue ON ue.entry_id = ul.entry_id
      )
      SELECT (SELECT count(*)::int FROM ok) AS conciliados,
             COALESCE((SELECT array_agg(line_id) FROM ok), ARRAY[]::int[]) AS "conciliadosLineIds"`;
    const r = await db.$client.query<{ conciliados: number; conciliadosLineIds: number[] }>(sqlText, params);
    const row = r.rows?.[0];
    const conciliados = Number(row?.conciliados ?? 0);
    const conciliadosLineIds = (row?.conciliadosLineIds ?? []).map(Number);
    if (conciliadosLineIds.length > 0) {
      autoVincularNfsPorLinhas(input.companyId, conciliadosLineIds).catch(() => {});
    }
    return { ok: true, conciliados, total: input.pares.length, conciliadosLineIds };
  }),

  // Rev. 3169 — CONSOLIDAR O MÊS: marca TODAS as linhas do extrato da conta+período
  // (ainda pendentes) como conciliado=1, fechando o mês de uma vez (a bolinha do mês
  // fica VERDE/"Consolidado"). NÃO mexe em lançamentos (financial_entries) — é só o
  // flag da linha do extrato. Tenant-safe. ZERO ALTER/DROP/DELETE.
  consolidarMes: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // dbExecute liga params por ORDEM DE APARIÇÃO ($N é cosmético) → manter ascendente.
    const res = await dbExecute(db,
      `UPDATE bank_statement_lines SET conciliado=1
        WHERE company_id=$1 AND conta_bancaria_id=$2 AND data>=$3 AND data<=$4
          AND COALESCE(conciliado,0)=0 AND excluido_em IS NULL
        RETURNING id`,
      [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
    const lineIds = rows(res).map((r: any) => Number(r.id)).filter(Boolean);
    if (lineIds.length > 0) {
      autoVincularNfsPorLinhas(input.companyId, lineIds).catch(() => {});
    }
    return { ok: true, afetados: lineIds.length };
  }),

  // Rev. 3951 — CONSOLIDAR TODAS AS CONTAS DO MÊS: marca TODAS as linhas pendentes do
  // extrato (qualquer conta) no período como conciliado=1, fechando o mês de uma vez a
  // partir do PANORAMA GERAL (sem precisar entrar em cada conta individualmente).
  // Mesma lógica de consolidarMes, mas sem filtrar por conta_bancaria_id.
  // Tenant-safe. ZERO ALTER/DROP/DELETE.
  consolidarTodasContas: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const res = await dbExecute(db,
      `UPDATE bank_statement_lines SET conciliado=1
        WHERE company_id=$1 AND data>=$2 AND data<=$3
          AND COALESCE(conciliado,0)=0 AND excluido_em IS NULL
        RETURNING id`,
      [input.companyId, input.dataInicio, input.dataFim]);
    const lineIds = rows(res).map((r: any) => Number(r.id)).filter(Boolean);
    if (lineIds.length > 0) {
      autoVincularNfsPorLinhas(input.companyId, lineIds).catch(() => {});
    }
    return { ok: true, afetados: lineIds.length };
  }),

  // Rev. 3169 — DESCONSOLIDAR O MÊS: reabre o mês marcando TODAS as linhas conciliadas
  // da conta+período como conciliado=0. Para as linhas que estavam PAREADAS a um
  // lançamento (entry_id), também REVERTE o flag de conciliação do lançamento
  // (conciliado=0, data_conciliacao=NULL) e desfaz o vínculo (entry_id=NULL) — SEM
  // tocar em status/valor/baixa do lançamento (a baixa do caixa é preservada).
  // Tenant-safe. ZERO ALTER/DROP/DELETE.
  desconsolidarMes: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Rev. 3318 — A tabela de conciliação em GRUPO (`financial_conciliacao_grupo`) só
    // existe em empresas que JÁ usaram esse recurso (ela é auto-criada no primeiro uso).
    // NÃO dá pra "tolerar" a ausência com try/catch DENTRO da transação: no Postgres,
    // qualquer statement que falha (ex.: `relation ... does not exist`) ABORTA a transação
    // inteira → os comandos seguintes (passo 2) passam a falhar com SQLSTATE 25P02
    // ("current transaction is aborted, commands ignored until end of transaction block").
    // Era exatamente esse o erro ao Desconsolidar em empresas sem conciliação em grupo.
    // Solução: checar a existência da tabela ANTES da transação (to_regclass, fora dela)
    // e só rodar o passo 1b quando ela existir — assim a transação nunca é envenenada.
    const grupoChk = await dbExecute(db,
      `SELECT to_regclass('public.financial_conciliacao_grupo') AS reg`, []);
    const temGrupo = !!rows(grupoChk)[0]?.reg;
    // Os 2 UPDATEs rodam em UMA transação: a etapa 1 depende do entry_id que a etapa 2
    // apaga, então uma falha intermediária não pode deixar estado parcial.
    let afetados = 0;
    await db.transaction(async (tx: any) => {
      // 1) Reverte o flag de conciliação dos lançamentos AINDA vinculados (antes de
      //    limpar o entry_id das linhas). Só o flag — preserva status/valor/data_pagamento.
      await dbExecute(tx,
        `UPDATE financial_entries e SET conciliado=0, data_conciliacao=NULL
           FROM bank_statement_lines l
          WHERE l.company_id=$1 AND l.conta_bancaria_id=$2 AND l.data>=$3 AND l.data<=$4
            AND COALESCE(l.conciliado,0)=1 AND l.entry_id IS NOT NULL AND l.excluido_em IS NULL
            AND e.id=l.entry_id AND e.company_id=l.company_id`,
        [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
      // 1b) Rev. 3239/3318 — reverte os MEMBROS de conciliações EM GRUPO (VR/combustível/
      //     manutenção) via a tabela-link `financial_conciliacao_grupo`. O entry_id da linha
      //     só guarda o representante; sem isto os demais membros ficariam conciliado=1
      //     órfãos. Só roda quando a tabela existe (vide pré-checagem `temGrupo` acima).
      if (temGrupo) {
        await dbExecute(tx,
          `UPDATE financial_entries e SET conciliado=0, data_conciliacao=NULL
             FROM financial_conciliacao_grupo g
             JOIN bank_statement_lines l ON l.id=g.statement_line_id AND l.company_id=g.company_id
            WHERE g.company_id=$1 AND l.conta_bancaria_id=$2 AND l.data>=$3 AND l.data<=$4
              AND g.revertido_em IS NULL AND COALESCE(l.conciliado,0)=1 AND l.excluido_em IS NULL
              AND e.id=g.entry_id AND e.company_id=g.company_id`,
          [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
        // Marca os vínculos como revertidos (SEM DELETE — honra a regra).
        await dbExecute(tx,
          `UPDATE financial_conciliacao_grupo g SET revertido_em=NOW()
             FROM bank_statement_lines l
            WHERE l.id=g.statement_line_id AND l.company_id=g.company_id
              AND g.company_id=$1 AND l.conta_bancaria_id=$2 AND l.data>=$3 AND l.data<=$4
              AND g.revertido_em IS NULL AND COALESCE(l.conciliado,0)=1 AND l.excluido_em IS NULL`,
          [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
      }
      // 2) Desmarca as linhas do extrato e desfaz o vínculo.
      const res = await dbExecute(tx,
        `UPDATE bank_statement_lines SET conciliado=0, entry_id=NULL
          WHERE company_id=$1 AND conta_bancaria_id=$2 AND data>=$3 AND data<=$4
            AND COALESCE(conciliado,0)=1 AND excluido_em IS NULL
          RETURNING id`,
        [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
      afetados = rows(res).length;
    });
    return { ok: true, afetados };
  }),

  // Rev. 3179 — LIMPAR EXTRATO: remove o extrato importado errado de uma conta+período.
  // SOFT-DELETE (honra a regra JAMAIS DELETE): marca as linhas com excluido_em=NOW()
  // em vez de apagar — todas as leituras filtram `excluido_em IS NULL`, então some da
  // tela e o mesmo arquivo pode ser RE-importado limpo (o dedup também ignora excluídas).
  // Antes de marcar, REVERTE a conciliação dos lançamentos vinculados (conciliado=0,
  // data_conciliacao=NULL) — preserva status/valor/baixa — pra não deixar entry órfão.
  // Tenant-safe (_assertFinanceiroCompanyAccess + ownerCheck da conta). Tudo em transação.
  limparExtrato: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
    // REGRA DE OURO: force=true só depois que o usuário reconheceu explicitamente
    // quantas conciliações serão perdidas. Sem ele, a mutation BLOQUEIA se houver
    // linhas conciliadas no período — nunca destrói conciliações silenciosamente.
    force: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    const ownerCheck = await dbExecute(db,
      `SELECT id FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [input.contaBancariaId, input.companyId]);
    if (rows(ownerCheck).length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa" });
    }

    // REGRA DE OURO — conta conciliados antes de destruir.
    if (!input.force) {
      const cRes = await dbExecute(db,
        `SELECT COUNT(*)::int AS n FROM bank_statement_lines
          WHERE company_id=$1 AND conta_bancaria_id=$2 AND data>=$3 AND data<=$4
            AND excluido_em IS NULL AND COALESCE(conciliado,0)=1`,
        [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
      const conciliadosCount = Number((rows(cRes)[0] as any)?.n ?? 0);
      if (conciliadosCount > 0) return { ok: false as const, conciliadosCount, afetados: 0 };
    }

    let afetados = 0;
    // dbExecute liga params por ORDEM DE APARIÇÃO ($N é cosmético) → manter ascendente.
    await db.transaction(async (tx: any) => {
      // 1) Reverte o flag de conciliação dos lançamentos vinculados às linhas a remover
      //    (antes de soft-deletar). Só o flag — preserva status/valor/data_pagamento.
      await dbExecute(tx,
        `UPDATE financial_entries e SET conciliado=0, data_conciliacao=NULL
           FROM bank_statement_lines l
          WHERE l.company_id=$1 AND l.conta_bancaria_id=$2 AND l.data>=$3 AND l.data<=$4
            AND l.excluido_em IS NULL AND COALESCE(l.conciliado,0)=1 AND l.entry_id IS NOT NULL
            AND e.id=l.entry_id AND e.company_id=l.company_id`,
        [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
      // 2) Soft-delete das linhas do extrato no escopo (zera conciliado/entry_id também).
      const res = await dbExecute(tx,
        `UPDATE bank_statement_lines SET excluido_em=NOW(), conciliado=0, entry_id=NULL
          WHERE company_id=$1 AND conta_bancaria_id=$2 AND data>=$3 AND data<=$4
            AND excluido_em IS NULL
          RETURNING id`,
        [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
      afetados = rows(res).length;
    });

    await createAuditLog({
      userId: ctx.user?.id,
      action: "bank_statement_clear",
      details: `Limpeza de extrato (conta ${input.contaBancariaId}, ${input.dataInicio}..${input.dataFim}): ${afetados} linha(s) removida(s)`,
      companyId: input.companyId,
    });

    return { ok: true, afetados };
  }),

  // Rev. 3534 — Limpar extratos de TODAS as contas da empresa no período (bulk).
  // Mesmo mecanismo do limparExtrato, mas sem filtro de conta — afeta todas as contas.
  // Usado na fase de validação do sistema para reimportar extratos do mês zerado.
  limparExtratoMes: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
    // REGRA DE OURO: force=true só depois que o usuário reconheceu explicitamente
    // quantas conciliações serão perdidas. Sem ele, a mutation BLOQUEIA se houver
    // linhas conciliadas no período — nunca destrói conciliações silenciosamente.
    force: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    // REGRA DE OURO — conta conciliados antes de destruir.
    if (!input.force) {
      const cRes = await dbExecute(db,
        `SELECT COUNT(*)::int AS n FROM bank_statement_lines
          WHERE company_id=$1 AND data>=$2 AND data<=$3
            AND excluido_em IS NULL AND COALESCE(conciliado,0)=1`,
        [input.companyId, input.dataInicio, input.dataFim]);
      const conciliadosCount = Number((rows(cRes)[0] as any)?.n ?? 0);
      if (conciliadosCount > 0) return { ok: false as const, conciliadosCount, afetados: 0 };
    }

    let afetados = 0;
    await db.transaction(async (tx: any) => {
      // 1) Reverte conciliação dos lançamentos vinculados às linhas a remover.
      await dbExecute(tx,
        `UPDATE financial_entries e SET conciliado=0, data_conciliacao=NULL
           FROM bank_statement_lines l
          WHERE l.company_id=$1 AND l.data>=$2 AND l.data<=$3
            AND l.excluido_em IS NULL AND COALESCE(l.conciliado,0)=1 AND l.entry_id IS NOT NULL
            AND e.id=l.entry_id AND e.company_id=l.company_id`,
        [input.companyId, input.dataInicio, input.dataFim]);
      // 2) Soft-delete de todas as linhas do extrato no período.
      const res = await dbExecute(tx,
        `UPDATE bank_statement_lines SET excluido_em=NOW(), conciliado=0, entry_id=NULL
          WHERE company_id=$1 AND data>=$2 AND data<=$3 AND excluido_em IS NULL
          RETURNING id`,
        [input.companyId, input.dataInicio, input.dataFim]);
      afetados = rows(res).length;
    });

    await createAuditLog({
      userId: ctx.user?.id,
      action: "bank_statement_clear_all",
      details: `Limpeza TOTAL de extrato (empresa ${input.companyId}, ${input.dataInicio}..${input.dataFim}): ${afetados} linha(s) removida(s)`,
      companyId: input.companyId,
    });

    return { ok: true, afetados };
  }),

  // Rev. 3386 — Soft-delete de UMA linha do extrato (granular — sem limpar o período todo).
  // Mesmo mecanismo do limparExtrato: reverte conciliação vinculada + marca excluido_em.
  // Permite corrigir lançamentos importados errados sem apagar tudo.
  excluirLinhaExtrato: protectedProcedure.input(z.object({
    companyId: z.number(),
    linhaId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    // Verifica que a linha existe e pertence à empresa (tenant guard)
    const linhaRes = await dbExecute(db,
      `SELECT id, conta_bancaria_id AS "contaBancariaId", conciliado, entry_id AS "entryId"
         FROM bank_statement_lines
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL LIMIT 1`,
      [input.linhaId, input.companyId]);
    const linha = rows(linhaRes)[0] as any;
    if (!linha) throw new TRPCError({ code: "NOT_FOUND", message: "Linha não encontrada ou já excluída" });

    // REGRA DE OURO — linha conciliada só pode ser excluída após o usuário
    // desfazer a conciliação manualmente. Nunca destruir conciliações silenciosamente.
    if (Number(linha.conciliado) === 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Esta linha está conciliada. Desfaça a conciliação primeiro (botão 'desfazer') antes de excluí-la.",
      });
    }

    // Rev. 3393 — mesmo padrão do desconsolidarMes: checar a existência de
    // financial_conciliacao_grupo ANTES da transação (to_regclass), pois um statement
    // que falha dentro de uma transação Postgres a envenena inteira (SQLSTATE 25P02).
    const grupoChk = await dbExecute(db,
      `SELECT to_regclass('public.financial_conciliacao_grupo') AS reg`, []);
    const temGrupo = !!( rows(grupoChk)[0] as any)?.reg;

    await db.transaction(async (tx: any) => {
      // 1) Se estava conciliada, reverte o flag do lançamento vinculado
      if (linha.entryId) {
        await dbExecute(tx,
          `UPDATE financial_entries SET conciliado=0, data_conciliacao=NULL
            WHERE id=$1 AND company_id=$2`,
          [linha.entryId, input.companyId]);
        // Remove também da tabela de grupo (N:1) — só quando a tabela existe.
        if (temGrupo) {
          await dbExecute(tx,
            `DELETE FROM financial_conciliacao_grupo
              WHERE statement_line_id=$1 AND company_id=$2`,
            [input.linhaId, input.companyId]);
        }
      }
      // 2) Soft-delete da linha
      await dbExecute(tx,
        `UPDATE bank_statement_lines
            SET excluido_em=NOW(), conciliado=0, entry_id=NULL
          WHERE id=$1 AND company_id=$2`,
        [input.linhaId, input.companyId]);
    });

    await createAuditLog({
      userId: ctx.user?.id,
      action: "bank_statement_line_delete",
      details: `Exclusão de linha de extrato #${input.linhaId} (conta ${linha.contaBancariaId})`,
      companyId: input.companyId,
    });

    return { ok: true };
  }),

  // Rev. 3399 — Concilia um lançamento SEM conta bancária com uma linha do extrato.
  // Além da conciliação normal (conciliado=1 em ambos), atualiza conta_bancaria_id do
  // lançamento com a conta da linha do extrato (preenchendo o campo que estava vazio).
  // Guard: lançamento deve ter conta_bancaria_id IS NULL; linha deve não estar conciliada.
  // ZERO ALTER/DROP/DELETE.
  conciliarSemContaComExtrato: protectedProcedure.input(z.object({
    companyId: z.number(),
    entryId: z.number(),
    statementLineId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    // 1. Busca linha do extrato (tenant guard) → obtém conta_bancaria_id
    const lnRes = await dbExecute(db,
      `SELECT id, conta_bancaria_id AS "contaBancariaId"
       FROM bank_statement_lines
       WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL AND COALESCE(conciliado,0)=0`,
      [input.statementLineId, input.companyId]);
    if (rows(lnRes).length === 0)
      throw new TRPCError({ code: "NOT_FOUND", message: "Linha do extrato não encontrada ou já conciliada." });
    const contaBancariaId = Number((rows(lnRes)[0] as any).contaBancariaId);

    // 2. Busca lançamento (tenant guard) → deve estar sem conta + não conciliado
    const enRes = await dbExecute(db,
      `SELECT id, conta_bancaria_id AS "contaBancariaId"
       FROM financial_entries
       WHERE id=$1 AND company_id=$2 AND status <> 'cancelado' AND COALESCE(conciliado,0)=0`,
      [input.entryId, input.companyId]);
    if (rows(enRes).length === 0)
      throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado ou já conciliado." });
    if ((rows(enRes)[0] as any).contaBancariaId != null)
      throw new TRPCError({ code: "BAD_REQUEST", message: "Este lançamento já tem conta bancária definida — use a conciliação normal." });

    // 3. Concilia a linha (RETURNING como guard de dupla-conciliação)
    const updLine = await dbExecute(db,
      `UPDATE bank_statement_lines SET conciliado=1, entry_id=$1
       WHERE id=$2 AND company_id=$3 AND excluido_em IS NULL RETURNING id`,
      [input.entryId, input.statementLineId, input.companyId]);
    if (rows(updLine).length === 0)
      throw new TRPCError({ code: "NOT_FOUND", message: "Linha do extrato não encontrada ao conciliar." });

    // 4. Vincula conta + marca conciliado no lançamento
    await dbExecute(db,
      `UPDATE financial_entries
       SET conta_bancaria_id=$1, conciliado=1, data_conciliacao=CURRENT_DATE,
           conciliado_em=NOW(), conciliado_por_id=$2, conciliado_por_nome=$3
       WHERE id=$4 AND company_id=$5`,
      [contaBancariaId, ctx.user?.id ?? null, ctx.user?.name ?? null, input.entryId, input.companyId]);

    await createAuditLog({ action: "financial_conciliar_sem_conta", userId: ctx.user?.id, companyId: input.companyId, details: `Entry #${input.entryId} vinculado à conta ${contaBancariaId} e conciliado com linha #${input.statementLineId}` });
    return { ok: true, contaBancariaId };
  }),

  // Rev. 3401 — ANÁLISE POR IA DA CONCILIAÇÃO: compara a descrição do extrato bancário
  // com a classificação atual do lançamento no ERP (nome, categoria, descrição) e devolve
  // sugestões de correção. Gatilho MANUAL pelo usuário — não roda automaticamente.
  // READ-ONLY no banco: só consulta, não grava nada. Gateado pelo toggle IA "financeiro".
  // ZERO ALTER/DROP/DELETE.
  analisarConciliacaoComIA: protectedProcedure.input(z.object({
    companyId: z.number(),
    entryId: z.number(),
    extratoDescricao: z.string(),
    extratoData: z.string().optional().nullable(),
    extratoValor: z.number().optional().nullable(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await assertAiModuleEnabled(input.companyId, "financeiro");

    // 1. Buscar o lançamento completo com categoria e obra
    const entRes = await dbExecute(db,
      `SELECT e.id, e.tipo,
              e.conta_id AS "contaId",
              fa.nome AS "contaNome",
              e.fornecedor_nome AS "fornecedorNome",
              e.descricao,
              e.origem_modulo AS "origemModulo",
              ob.nome AS "obraNome"
       FROM financial_entries e
       LEFT JOIN financial_accounts fa ON fa.id = e.conta_id
       LEFT JOIN obras ob ON ob.id = e.obra_id
       WHERE e.id=$1 AND e.company_id=$2 LIMIT 1`,
      [input.entryId, input.companyId]);
    const entry = rows(entRes)[0] as any;
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });

    // 2. Buscar categorias ativas (até 100) para o modelo poder sugerir IDs válidos
    const catRes = await dbExecute(db,
      `SELECT id, nome, tipo FROM financial_accounts
       WHERE company_id=$1 AND ativo=1
       ORDER BY tipo ASC, nome ASC LIMIT 100`,
      [input.companyId]);
    const categorias = rows(catRes) as any[];
    const catList = categorias.map((c: any) => `${c.id}|${c.nome}|${c.tipo}`).join("\n");

    // 3. Prompt estruturado
    const prompt = [
      "Você é um auditor financeiro brasileiro. Analise se o LANÇAMENTO NO ERP está corretamente classificado em relação ao EXTRATO BANCÁRIO.",
      "",
      "EXTRATO BANCÁRIO (fonte de verdade do que realmente ocorreu):",
      `  Descrição: "${input.extratoDescricao}"`,
      `  Data: ${input.extratoData || "não informada"}`,
      `  Valor: ${input.extratoValor != null ? `R$ ${Number(input.extratoValor).toFixed(2)}` : "não informado"}`,
      "",
      "LANÇAMENTO NO ERP (pode conter erros de cadastro):",
      `  Nome/Fornecedor: "${entry.fornecedorNome || "—"}"`,
      `  Descrição interna: "${entry.descricao || "—"}"`,
      `  Tipo: ${entry.tipo || "—"}`,
      `  Categoria atual: "${entry.contaNome || "sem categoria"}" (ID: ${entry.contaId || "nenhum"})`,
      `  Origem: ${entry.origemModulo || "manual"}`,
      "",
      "CATEGORIAS DISPONÍVEIS (formato: ID|Nome|tipo):",
      catList,
      "",
      "TAREFA: compare a descrição do extrato com a classificação do ERP e identifique campos incorretos.",
      'Responda SOMENTE com este JSON: {"ok":true,"resumo":"frase curta","sugestoes":[{"campo":"fornecedorNome","valorAtual":"X","sugestao":"Y","motivo":"Z"},{"campo":"contaId","valorAtual":"nome atual","sugestao":"nome sugerido","motivo":"Z","contaIdSugerido":123},{"campo":"descricao","valorAtual":"X","sugestao":"Y","motivo":"Z"}]}',
      "",
      "REGRAS:",
      "- Para campo contaId: contaIdSugerido DEVE ser um ID numérico da lista acima.",
      "- Para campo fornecedorNome: sugira sempre um nome PADRONIZADO e LIMPO — sem códigos de transação,",
      "  IDs de PIX (ex: E00360305...), datas embutidas, números de agência/conta, ou chaves aleatórias.",
      "  Use o nome real da empresa/pessoa quando identificável no texto.",
      "  Exemplos: 'E00360305202602112021ae8a43bfdae - PAG BO...' → 'Felipe Costa Alves' (se identificável) ou 'Pagamento Boleto — Banco do Brasil';",
      "  'DEBITO DE IOF' → 'IOF — Imposto sobre Operações Financeiras';",
      "  'UNIMED FELIPE - PAG BOLETO IBC - PORTO S...' → 'Unimed';",
      "  'COBRANÇA DE JUROS' → 'Juros Bancários — CEF'.",
      "- Só sugira quando tiver certeza pelo texto do extrato.",
      "- Se tudo estiver correto: ok:true, sugestoes:[].",
      "- Máximo 3 sugestões.",
      "- Nenhum texto fora do JSON.",
    ].join("\n");

    // 4. Invocar IA (Gemini Flash rápido → fallback Claude)
    let raw = "";
    try {
      const result = await invokeLLM({
        fast: true,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 600,
      });
      raw = (result.choices?.[0]?.message?.content as string) ?? "";
    } catch (err: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha na análise por IA: " + String(err?.message ?? "").slice(0, 120) });
    }

    // 5. Parse robusto
    let obj: any = { ok: true, resumo: "", sugestoes: [] };
    try { obj = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { obj = JSON.parse(m[0]); } catch { /* usa default */ } }
    }

    // 6. Sanitizar output da IA (whitelist defensiva — nunca confiar no modelo)
    const CAMPOS_VALIDOS = ["fornecedorNome", "contaId", "descricao"];
    const sugestoes = (Array.isArray(obj.sugestoes) ? obj.sugestoes : [])
      .slice(0, 4)
      .filter((s: any) => s && CAMPOS_VALIDOS.includes(s.campo))
      .map((s: any) => {
        const contaIdSugerido = s.campo === "contaId" && s.contaIdSugerido
          ? (categorias.find((c: any) => c.id === Number(s.contaIdSugerido)) ? Number(s.contaIdSugerido) : null)
          : null;
        const contaNomeSugerida = contaIdSugerido
          ? (categorias.find((c: any) => c.id === contaIdSugerido) as any)?.nome ?? null
          : null;
        return {
          campo: String(s.campo),
          valorAtual: String(s.valorAtual ?? "").slice(0, 200),
          sugestao: String(s.sugestao ?? "").slice(0, 200),
          motivo: String(s.motivo ?? "").slice(0, 300),
          contaIdSugerido,
          contaNomeSugerida,
        };
      });

    return {
      ok: Boolean(obj.ok),
      resumo: String(obj.resumo ?? "").slice(0, 400),
      sugestoes,
    };
  }),

  // Rev. 3403 — ANÁLISE EM LOTE POR IA: recebe até 40 pares extrato×ERP numa só chamada,
  // faz UMA chamada ao LLM e retorna análise de cada par. Gatilho do botão "Analisar todas
  // com IA" na toolbar de sugestões. READ-ONLY no banco. ZERO ALTER/DROP/DELETE.
  analisarLoteSugestoesComIA: protectedProcedure.input(z.object({
    companyId: z.number(),
    itens: z.array(z.object({
      statementLineId: z.number(),
      entryId: z.number(),
      extratoDescricao: z.string(),
      extratoData: z.string().optional().nullable(),
      extratoValor: z.number().optional().nullable(),
    })).max(40),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await assertAiModuleEnabled(input.companyId, "financeiro");
    if (!input.itens.length) return { resultados: [] };

    // 1. Buscar todos os lançamentos em uma query
    const entryIds = input.itens.map(i => i.entryId);
    // dbExecute não suporta array JS como parâmetro de ANY(); inlinear IDs inteiros é seguro
    const entRes = await dbExecute(db,
      `SELECT e.id, e.tipo,
              e.conta_id AS "contaId",
              fa.nome AS "contaNome",
              e.fornecedor_nome AS "fornecedorNome",
              e.descricao,
              e.origem_modulo AS "origemModulo"
       FROM financial_entries e
       LEFT JOIN financial_accounts fa ON fa.id = e.conta_id
       WHERE e.id IN (${entryIds.map(Number).join(",")}) AND e.company_id=$1`,
      [input.companyId]);
    const entryMap: Record<number, any> = {};
    for (const r of rows(entRes)) { entryMap[(r as any).id] = r; }

    // 2. Categorias ativas (até 100)
    const catRes = await dbExecute(db,
      `SELECT id, nome, tipo FROM financial_accounts
       WHERE company_id=$1 AND ativo=1
       ORDER BY tipo ASC, nome ASC LIMIT 100`,
      [input.companyId]);
    const categorias = rows(catRes) as any[];
    const catList = categorias.map((c: any) => `${c.id}|${c.nome}|${c.tipo}`).join("\n");

    // 3. Montar lista de pares para o prompt
    const pares = input.itens.map((item, idx) => {
      const e = entryMap[item.entryId];
      return {
        seq: idx + 1,
        statementLineId: item.statementLineId,
        extrato: `${item.extratoDescricao}${item.extratoData ? ` · ${item.extratoData}` : ""}${item.extratoValor != null ? ` · R$${Number(item.extratoValor).toFixed(2)}` : ""}`,
        erpNome: e?.fornecedorNome || "—",
        erpCategoria: e ? `${e.contaNome || "sem categoria"} (ID:${e.contaId || "0"})` : "—",
        erpDescricao: e?.descricao || "—",
        erpTipo: e?.tipo || "—",
      };
    });

    const prompt = [
      "Você é um auditor financeiro brasileiro. Para CADA par abaixo, analise se o LANÇAMENTO NO ERP está correto em relação ao EXTRATO BANCÁRIO.",
      "",
      "CATEGORIAS DISPONÍVEIS (ID|Nome|tipo):",
      catList,
      "",
      `PARES (${pares.length} itens — analise todos):`,
      JSON.stringify(pares),
      "",
      "Responda APENAS com JSON (sem markdown):",
      '{"resultados":[{"seq":1,"ok":true,"resumo":"frase curta","sugestoes":[{"campo":"fornecedorNome"|"contaId"|"descricao","valorAtual":"X","sugestao":"Y","motivo":"Z","contaIdSugerido":123}]},...]}',
      "",
      "REGRAS:",
      "- seq corresponde ao seq do par (analise TODOS os pares).",
      "- contaIdSugerido DEVE ser ID numérico da lista de categorias (ou omita).",
      "- ok:true e sugestoes:[] quando o par estiver correto.",
      "- Máximo 3 sugestões por par.",
      "- Para campo fornecedorNome: sugira sempre um nome PADRONIZADO e LIMPO — sem códigos de transação,",
      "  IDs de PIX, datas embutidas, números de agência/conta ou chaves aleatórias.",
      "  Use o nome real da empresa/pessoa quando identificável no texto do extrato.",
      "  Exemplos de limpeza: 'E00360305202602...-PAG BO...' → nome do beneficiário real ou tipo de operação limpo;",
      "  'DEBITO DE IOF' → 'IOF — Imposto sobre Operações Financeiras';",
      "  'UNIMED FELIPE - PAG BOLETO IBC' → 'Unimed'; 'COBRANÇA DE JUROS' → 'Juros Bancários'.",
      "- Responda SÓ o JSON.",
    ].join("\n");

    // 4. LLM call
    let raw = "";
    try {
      const result = await invokeLLM({ fast: true, messages: [{ role: "user", content: prompt }], maxTokens: 4000 });
      raw = (result.choices?.[0]?.message?.content as string) ?? "";
    } catch (err: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha na análise em lote: " + String(err?.message ?? "").slice(0, 120) });
    }

    // 5. Parse robusto
    let obj: any = { resultados: [] };
    try { obj = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { obj = JSON.parse(m[0]); } catch { /* usa default */ } }
    }

    // 6. Sanitizar + mapear statementLineId de volta
    const CAMPOS_VALIDOS = ["fornecedorNome", "contaId", "descricao"];
    const resultados = (Array.isArray(obj.resultados) ? obj.resultados : [])
      .map((r: any) => {
        const idx = Number(r.seq ?? 0) - 1;
        const item = input.itens[idx];
        if (!item) return null;
        const sugestoes = (Array.isArray(r.sugestoes) ? r.sugestoes : [])
          .slice(0, 4)
          .filter((s: any) => s && CAMPOS_VALIDOS.includes(s.campo))
          .map((s: any) => {
            const contaIdSugerido = s.campo === "contaId" && s.contaIdSugerido
              ? (categorias.find((c: any) => c.id === Number(s.contaIdSugerido)) ? Number(s.contaIdSugerido) : null)
              : null;
            const contaNomeSugerida = contaIdSugerido
              ? (categorias.find((c: any) => c.id === contaIdSugerido) as any)?.nome ?? null
              : null;
            return {
              campo: String(s.campo),
              valorAtual: String(s.valorAtual ?? "").slice(0, 200),
              sugestao: String(s.sugestao ?? "").slice(0, 200),
              motivo: String(s.motivo ?? "").slice(0, 300),
              contaIdSugerido,
              contaNomeSugerida,
            };
          });
        return {
          statementLineId: item.statementLineId,
          entryId: item.entryId,
          ok: Boolean(r.ok),
          resumo: String(r.resumo ?? "").slice(0, 400),
          sugestoes,
        };
      })
      .filter(Boolean);

    return { resultados };
  }),

  // Rev. 3396 — Desfaz a conciliação de UMA linha do extrato SEM apagá-la.
  // Diferente de excluirLinhaExtrato (que faz soft-delete), este endpoint apenas
  // remove o vínculo: a linha volta para "No extrato, sem lançamento" e o
  // lançamento do ERP volta para pendente (a_pagar / a_receber).
  desconciliarLinha: protectedProcedure.input(z.object({
    companyId: z.number(),
    linhaId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    // Tenant guard + ler o entry_id vinculado à linha
    const linhaRes = await dbExecute(db,
      `SELECT id, entry_id AS "entryId", conciliado
         FROM bank_statement_lines
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL LIMIT 1`,
      [input.linhaId, input.companyId]);
    const linha = rows(linhaRes)[0] as any;
    if (!linha) throw new TRPCError({ code: "NOT_FOUND", message: "Linha não encontrada ou já excluída." });

    // Checar financial_conciliacao_grupo FORA da transação (to_regclass) — mesmo
    // padrão de desconsolidarMes / excluirLinhaExtrato (evita envenenar a txn).
    const grupoChk = await dbExecute(db,
      `SELECT to_regclass('public.financial_conciliacao_grupo') AS reg`, []);
    const temGrupo = !!(rows(grupoChk)[0] as any)?.reg;

    await db.transaction(async (tx: any) => {
      // 1) Reverter todos os lançamentos vinculados por grupo (N:1)
      if (temGrupo) {
        const grupoRes = await dbExecute(tx,
          `SELECT entry_id FROM financial_conciliacao_grupo
            WHERE statement_line_id=$1 AND company_id=$2`,
          [input.linhaId, input.companyId]);
        const entryIds = rows(grupoRes).map((r: any) => r.entry_id).filter(Boolean) as number[];
        if (entryIds.length) {
          await dbExecute(tx,
            `UPDATE financial_entries
                SET conciliado=0, data_conciliacao=NULL,
                    status = CASE
                      WHEN status='pago'     THEN 'a_pagar'
                      WHEN status='recebido' THEN 'a_receber'
                      ELSE status END
              WHERE id = ANY($1::int[]) AND company_id=$2`,
            [entryIds, input.companyId]);
        }
        await dbExecute(tx,
          `DELETE FROM financial_conciliacao_grupo
            WHERE statement_line_id=$1 AND company_id=$2`,
          [input.linhaId, input.companyId]);
      }

      // 2) Reverter o lançamento vinculado diretamente no entry_id da linha (1:1)
      if (linha.entryId) {
        await dbExecute(tx,
          `UPDATE financial_entries
              SET conciliado=0, data_conciliacao=NULL,
                  status = CASE
                    WHEN status='pago'     THEN 'a_pagar'
                    WHEN status='recebido' THEN 'a_receber'
                    ELSE status END
            WHERE id=$1 AND company_id=$2`,
          [linha.entryId, input.companyId]);
      }

      // 3) Desconciliar a linha do extrato SEM soft-delete — ela volta p/ a fila
      await dbExecute(tx,
        `UPDATE bank_statement_lines
            SET conciliado=0, entry_id=NULL
          WHERE id=$1 AND company_id=$2`,
        [input.linhaId, input.companyId]);
    });

    await createAuditLog({
      userId: ctx.user?.id,
      action: "bank_statement_line_desconciliar",
      details: `Desconciliação da linha #${input.linhaId} (entryId=${linha.entryId ?? "grupo"}) — linha mantida no extrato, lançamento revertido a pendente.`,
      companyId: input.companyId,
    });

    return { ok: true };
  }),

  // ─────────────────── RÉGUA DE COBRANÇA ───────────────────

  getCollectionRules: protectedProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
      `SELECT id, nome, dias_atraso_1 AS "diasAtraso1", mensagem_1 AS "mensagem1",
              dias_atraso_2 AS "diasAtraso2", mensagem_2 AS "mensagem2",
              dias_atraso_3 AS "diasAtraso3", mensagem_3 AS "mensagem3",
              dias_atraso_4 AS "diasAtraso4", mensagem_4 AS "mensagem4",
              enviar_email AS "enviarEmail", ativo
       FROM collection_rules WHERE company_id=$1 AND ativo=1 ORDER BY id ASC`,
      [input.companyId]
    );
    return rows(res);
  }),

  upsertCollectionRule: protectedProcedure.input(z.object({
    id: z.number().optional(),
    companyId: z.number(),
    nome: z.string().optional(),
    diasAtraso1: z.number().default(3),
    mensagem1: z.string().optional(),
    diasAtraso2: z.number().default(10),
    mensagem2: z.string().optional(),
    diasAtraso3: z.number().default(30),
    mensagem3: z.string().optional(),
    diasAtraso4: z.number().default(60),
    mensagem4: z.string().optional(),
    enviarEmail: z.boolean().default(true),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (input.id) {
      await dbExecute(db, 
        `UPDATE collection_rules SET nome=$1,dias_atraso_1=$2,mensagem_1=$3,dias_atraso_2=$4,mensagem_2=$5,
         dias_atraso_3=$6,mensagem_3=$7,dias_atraso_4=$8,mensagem_4=$9,enviar_email=$10
         WHERE id=$11 AND company_id=$12`,
        [input.nome ?? null, input.diasAtraso1, input.mensagem1 ?? null,
         input.diasAtraso2, input.mensagem2 ?? null, input.diasAtraso3, input.mensagem3 ?? null,
         input.diasAtraso4, input.mensagem4 ?? null, input.enviarEmail ? 1 : 0, input.id, input.companyId]
      );
    } else {
      await dbExecute(db, 
        `INSERT INTO collection_rules (company_id, nome, dias_atraso_1, mensagem_1, dias_atraso_2, mensagem_2,
         dias_atraso_3, mensagem_3, dias_atraso_4, mensagem_4, enviar_email, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)`,
        [input.companyId, input.nome ?? null, input.diasAtraso1, input.mensagem1 ?? null,
         input.diasAtraso2, input.mensagem2 ?? null, input.diasAtraso3, input.mensagem3 ?? null,
         input.diasAtraso4, input.mensagem4 ?? null, input.enviarEmail ? 1 : 0]
      );
    }
    return { ok: true };
  }),

  // ─────────────────── A RECEBER / A PAGAR RESUMO ───────────────────

  getDashboardExecutivo: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    mesCompetencia: z.string().optional(),
    tipoPeriodo: z.enum(["mensal", "trimestral", "semestral", "anual"]).optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const tipoPeriodo = input.tipoPeriodo ?? "mensal";
    const anchor = input.mesCompetencia ?? new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().split("T")[0];
    // Range [iniYM, fimYM] do período selecionado (mês/trimestre/semestre/ano) + período anterior comparável.
    const _rangeFor = (tipo: string, a: string): [string, string] => {
      const yy = parseInt(a.slice(0, 4), 10);
      const mm = parseInt(a.slice(5, 7) || "1", 10) || 1;
      if (tipo === "anual") return [`${yy}-01`, `${yy}-12`];
      if (tipo === "trimestral") { const ini = Math.floor((mm - 1) / 3) * 3 + 1; return [`${yy}-${String(ini).padStart(2, "0")}`, `${yy}-${String(ini + 2).padStart(2, "0")}`]; }
      if (tipo === "semestral") { const ini = mm <= 6 ? 1 : 7; return [`${yy}-${String(ini).padStart(2, "0")}`, `${yy}-${String(ini + 5).padStart(2, "0")}`]; }
      const m = String(mm).padStart(2, "0"); return [`${yy}-${m}`, `${yy}-${m}`];
    };
    const _prevAnchor = (tipo: string, a: string): string => {
      const yy = parseInt(a.slice(0, 4), 10);
      const mm = parseInt(a.slice(5, 7) || "1", 10) || 1;
      if (tipo === "anual") return `${yy - 1}`;
      const len = tipo === "trimestral" ? 3 : tipo === "semestral" ? 6 : 1;
      const ini = tipo === "trimestral" ? Math.floor((mm - 1) / 3) * 3 + 1 : tipo === "semestral" ? (mm <= 6 ? 1 : 7) : mm;
      const total = (yy * 12 + (ini - 1)) - len;
      return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
    };
    const [iniYM, fimYM] = _rangeFor(tipoPeriodo, anchor);
    const [antIniYM, antFimYM] = _rangeFor(tipoPeriodo, _prevAnchor(tipoPeriodo, anchor));

    // Rev. 2923 — Os cards "A Pagar"/"A Receber" passam a refletir SÓ contas REAIS
    // comprometidas: excluímos as projeções do cronograma (origem 'cronograma_atividade'
    // no lado a_pagar) e o faturamento previsto (origem 'revenue' no lado a_receber).
    // Sem isso, o dashboard somava o custo planejado do MS Project como se fosse conta a pagar.
    const exclProjPagar = `AND COALESCE(origem_modulo,'') <> 'cronograma_atividade'`;
    const exclProjReceber = `AND COALESCE(origem_modulo,'') <> 'revenue'`;

    const [
      receitaMesRes, despesaMesRes,
      receitaMesAntRes, despesaMesAntRes,
      aReceberRes, aPagarRes,
      vencidosRecRes, vencidosPagRes,
      bancosRes,
      evolucaoRes,
      topDespesasRes,
      proxVencimentosRes,
      receitaPorObraRes,
    ] = await Promise.all([
      dbExecute(db, `SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('recebido','pago') AND TO_CHAR(data_competencia,'YYYY-MM') BETWEEN $1 AND $2`, [iniYM, fimYM]),
      dbExecute(db, `SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status IN ('pago','recebido') AND TO_CHAR(data_competencia,'YYYY-MM') BETWEEN $1 AND $2`, [iniYM, fimYM]),
      dbExecute(db, `SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('recebido','pago') AND TO_CHAR(data_competencia,'YYYY-MM') BETWEEN $1 AND $2`, [antIniYM, antFimYM]),
      dbExecute(db, `SELECT COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status IN ('pago','recebido') AND TO_CHAR(data_competencia,'YYYY-MM') BETWEEN $1 AND $2`, [antIniYM, antFimYM]),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total, COUNT(*) AS qtd FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('a_receber','recebido_parcial') ${exclProjReceber}`, []),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total, COUNT(*) AS qtd FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status='a_pagar' ${exclProjPagar}`, []),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total, COUNT(*) AS qtd FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND status IN ('a_receber','recebido_parcial') AND data_vencimento < $1 ${exclProjReceber}`, [today]),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total, COUNT(*) AS qtd FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status='a_pagar' AND data_vencimento < $1 ${exclProjPagar}`, [today]),
      dbExecute(db, `SELECT id, banco, agencia, conta, "tipoConta" AS tipo, apelido AS descricao FROM company_bank_accounts WHERE "companyId" IN (${inlineIds(ids)}) AND ativo=1 ORDER BY banco ASC`, []),
      dbExecute(db, `
        SELECT TO_CHAR(data_competencia, 'YYYY-MM-DD') AS dia,
               SUM(CASE WHEN tipo='receita' AND status IN ('recebido','pago') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END) AS entradas,
               SUM(CASE WHEN tipo='despesa' AND status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END) AS saidas
        FROM financial_entries
        WHERE company_id IN (${inlineIds(ids)}) AND data_competencia >= (CURRENT_DATE - INTERVAL '30 days') AND status IN ('pago','recebido')
                GROUP BY TO_CHAR(data_competencia, 'YYYY-MM-DD')
                ORDER BY dia ASC`, []),
      dbExecute(db, `
        SELECT conta_nome AS "categoria", SUM(COALESCE(valor_realizado, valor_previsto)) AS total
        FROM financial_entries
        WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND status IN ('pago','recebido') AND TO_CHAR(data_competencia,'YYYY-MM') BETWEEN $1 AND $2
                GROUP BY conta_nome ORDER BY total DESC LIMIT 8`, [iniYM, fimYM]),
      dbExecute(db, `
        SELECT id, descricao, obra_nome AS "obraNome", valor_previsto AS "valor", data_vencimento AS "vencimento", tipo,
               CASE WHEN data_vencimento < CURRENT_DATE THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
        FROM financial_entries
        WHERE company_id IN (${inlineIds(ids)}) AND status IN ('a_pagar','a_receber','recebido_parcial')
                AND NOT (tipo='despesa' AND COALESCE(origem_modulo,'')='cronograma_atividade')
                AND NOT (tipo='receita' AND COALESCE(origem_modulo,'')='revenue')
                ORDER BY data_vencimento ASC LIMIT 15`, []),
      dbExecute(db, `
        SELECT obra_nome AS "obraNome", obra_id AS "obraId",
               SUM(CASE WHEN tipo='receita' AND status IN ('recebido','pago') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END) AS receita,
               SUM(CASE WHEN tipo='despesa' AND status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END) AS despesa
        FROM financial_entries
        WHERE company_id IN (${inlineIds(ids)}) AND obra_id IS NOT NULL AND TO_CHAR(data_competencia,'YYYY-MM') BETWEEN $1 AND $2
                GROUP BY obra_nome, obra_id ORDER BY receita DESC LIMIT 10`, [iniYM, fimYM]),
    ]);

    const rec = Number(rows(receitaMesRes)[0]?.total ?? 0);
    const desp = Number(rows(despesaMesRes)[0]?.total ?? 0);
    const recAnt = Number(rows(receitaMesAntRes)[0]?.total ?? 0);
    const despAnt = Number(rows(despesaMesAntRes)[0]?.total ?? 0);
    const aReceber = Number(rows(aReceberRes)[0]?.total ?? 0);
    const aPagar = Number(rows(aPagarRes)[0]?.total ?? 0);
    const vencRec = Number(rows(vencidosRecRes)[0]?.total ?? 0);
    const vencPag = Number(rows(vencidosPagRes)[0]?.total ?? 0);

    const openingRes = await dbExecute(db, 
      `SELECT conta_bancaria_id, COALESCE(SUM(valor),0) AS total
       FROM financial_opening_balances WHERE company_id IN (${inlineIds(ids)}) GROUP BY conta_bancaria_id`, []
    );
    const openingMap: Record<number, number> = {};
    rows(openingRes).forEach((r: any) => { openingMap[r.conta_bancaria_id] = Number(r.total ?? 0); });

    const bancos = rows(bancosRes).map((b: any) => {
      const saldoAbertura = openingMap[b.id] ?? 0;
      return { ...b, descricao: b.descricao || b.banco, saldoAtual: saldoAbertura };
    });
    const saldoConsolidado = bancos.reduce((s: number, b: any) => s + b.saldoAtual, 0);

    const compromissos30d = aPagar;
    const caixaLivre = saldoConsolidado - compromissos30d;

    const varReceita = recAnt > 0 ? ((rec - recAnt) / recAnt) * 100 : 0;
    const varDespesa = despAnt > 0 ? ((desp - despAnt) / despAnt) * 100 : 0;

    return {
      kpis: {
        receitaMes: rec, despesaMes: desp, resultadoMes: rec - desp,
        receitaMesAnterior: recAnt, despesaMesAnterior: despAnt,
        varReceita, varDespesa,
        totalAReceber: aReceber, qtdAReceber: Number(rows(aReceberRes)[0]?.qtd ?? 0),
        totalAPagar: aPagar, qtdAPagar: Number(rows(aPagarRes)[0]?.qtd ?? 0),
        vencidosReceber: vencRec, qtdVencidosReceber: Number(rows(vencidosRecRes)[0]?.qtd ?? 0),
        vencidosPagar: vencPag, qtdVencidosPagar: Number(rows(vencidosPagRes)[0]?.qtd ?? 0),
        saldoConsolidado, caixaLivre,
        margemOperacional: rec > 0 ? ((rec - desp) / rec) * 100 : 0,
      },
      bancos,
      evolucaoDiaria: rows(evolucaoRes).map((r: any) => ({
        dia: r.dia, entradas: Number(r.entradas ?? 0), saidas: Number(r.saidas ?? 0),
      })),
      topDespesas: rows(topDespesasRes).map((r: any) => ({ categoria: r.categoria ?? "Sem categoria", total: Number(r.total ?? 0) })),
      proxVencimentos: rows(proxVencimentosRes).map((r: any) => ({
        id: r.id, descricao: r.descricao, obraNome: r.obraNome, valor: Number(r.valor ?? 0),
        vencimento: r.vencimento, tipo: r.tipo, diasAtraso: Number(r.diasAtraso ?? 0),
      })),
      resultadoPorObra: rows(receitaPorObraRes).map((r: any) => ({
        obraId: r.obraId, obraNome: r.obraNome ?? "Sem obra",
        receita: Number(r.receita ?? 0), despesa: Number(r.despesa ?? 0),
        margem: Number(r.receita ?? 0) - Number(r.despesa ?? 0),
      })),
    };
  }),

  // ─────────────────── LANÇAMENTOS RECORRENTES ───────────────────

  getRecurringEntries: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
      `SELECT id, descricao, valor, tipo, natureza, conta_nome AS "contaNome",
              obra_nome AS "obraNome", frequencia, dia_vencimento AS "diaVencimento",
              forma_pagamento AS "formaPagamento", fornecedor_nome AS "fornecedorNome",
              ativo, proximo_vencimento AS "proximoVencimento",
              ultimo_gerado AS "ultimoGerado", observacoes,
              criado_por_nome AS "criadoPorNome", created_at AS "createdAt"
       FROM financial_recurring_entries WHERE company_id=$1 ORDER BY ativo DESC, descricao ASC`,
      [input.companyId]
    );
    return rows(res);
  }),

  createRecurringEntry: protectedProcedure.input(z.object({
    companyId: z.number(),
    descricao: z.string().min(2),
    valor: z.number().positive(),
    tipo: z.enum(["receita", "despesa"]).default("despesa"),
    natureza: z.string().default("fixo"),
    contaId: z.number().optional(),
    contaNome: z.string().optional(),
    obraId: z.number().optional(),
    obraNome: z.string().optional(),
    frequencia: z.enum(["mensal", "quinzenal", "semanal", "trimestral", "anual"]).default("mensal"),
    diaVencimento: z.number().min(1).max(31).default(5),
    formaPagamento: z.string().optional(),
    fornecedorNome: z.string().optional(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(input.diaVencimento, 28));
    const res = await dbExecute(db, 
      `INSERT INTO financial_recurring_entries
        (company_id, descricao, valor, tipo, natureza, conta_id, conta_nome, obra_id, obra_nome,
         frequencia, dia_vencimento, forma_pagamento, fornecedor_nome, observacoes,
         proximo_vencimento, criado_por_id, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [input.companyId, input.descricao, input.valor, input.tipo, input.natureza,
       input.contaId ?? null, input.contaNome ?? null, input.obraId ?? null, input.obraNome ?? null,
       input.frequencia, input.diaVencimento, input.formaPagamento ?? null,
       input.fornecedorNome ?? null, input.observacoes ?? null,
       nextMonth.toISOString().split("T")[0],
       ctx.user?.id ?? null, ctx.user?.name ?? ctx.user?.email ?? null]
    );
    await createAuditLog({
      userId: ctx.user?.id,
      userName: ctx.user?.name ?? ctx.user?.email,
      action: "financial_recurring_create",
      entityType: "financial_recurring_entries",
      entityId: rows(res)[0]?.id,
      details: `Recorrência criada: ${input.descricao} - ${input.valor}`,
      companyId: input.companyId,
    });
    return { id: rows(res)[0]?.id };
  }),

  updateRecurringEntry: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    descricao: z.string().optional(),
    valor: z.number().optional(),
    tipo: z.string().optional(),
    contaNome: z.string().optional(),
    obraNome: z.string().optional(),
    frequencia: z.string().optional(),
    diaVencimento: z.number().optional(),
    formaPagamento: z.string().optional(),
    fornecedorNome: z.string().optional(),
    observacoes: z.string().optional(),
    ativo: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const fields: Record<string, string> = {
      descricao: "descricao", valor: "valor", tipo: "tipo", contaNome: "conta_nome",
      obraNome: "obra_nome", frequencia: "frequencia", diaVencimento: "dia_vencimento",
      formaPagamento: "forma_pagamento", fornecedorNome: "fornecedor_nome",
      observacoes: "observacoes", ativo: "ativo",
    };
    for (const [k, col] of Object.entries(fields)) {
      if ((input as any)[k] !== undefined) { sets.push(`${col}=$${i++}`); vals.push((input as any)[k]); }
    }
    if (sets.length === 0) return { ok: true };
    sets.push(`updated_at=NOW()`);
    vals.push(input.id, input.companyId);
    await dbExecute(db, `UPDATE financial_recurring_entries SET ${sets.join(",")} WHERE id=$${i++} AND company_id=$${i}`, vals);
    return { ok: true };
  }),

  // Rev. 2213 — Excluir recorrência (hard delete na tabela mestre;
  // os lançamentos já materializados em `financial_entries` permanecem
  // intactos, pois têm vida própria após gerados).
  deleteRecurringEntry: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db,
      `DELETE FROM financial_recurring_entries WHERE id=$1 AND company_id=$2`,
      [input.id, input.companyId]
    );
    return { ok: true };
  }),

  generateRecurringEntries: protectedProcedure.input(z.object({
    companyId: z.number(),
    horizonteMeses: z.number().min(1).max(24).optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const generated = await materializeRecorrentes(db, input.companyId, input.horizonteMeses ?? 2);
    return { generated };
  }),

  // ─────────────────── IMPORTAÇÃO EXTRATO OFX/CSV ───────────────────

  importBankStatement: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    formato: z.enum(["ofx", "csv", "pdf"]),
    conteudo: z.string(),
    csvSeparador: z.string().optional(),
    csvColunaData: z.number().optional(),
    csvColunaDescricao: z.number().optional(),
    csvColunaValor: z.number().optional(),
    csvColunaSaldo: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    const ownerCheck = await dbExecute(db, 
      `SELECT id FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [input.contaBancariaId, input.companyId]
    );
    if (rows(ownerCheck).length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa" });
    }

    const { lines } = await parseExtratoLines({ ...input, companyId: input.companyId });

    let inserted = 0;
    let skipped = 0;
    const importadoEm = new Date().toISOString();

    // Rev. 4090 — dedup ciente de duplicatas legítimas no próprio batch (ex: 2×
    // "Pix Enviado MESMO FAVORECIDO R$50.000" no mesmo dia no extrato).
    // Estratégia: contar quantas vezes cada chave (data+desc+valor+saldo) aparece
    // no batch; consultar o DB uma vez por chave única; só pular se o DB já tem
    // pelo menos tantas ocorrências quanto o batch pretende inserir para aquela chave.
    // "sessionInserted" rastreia quantas já inserimos NESTA sessão por chave.
    const lineKey = (l: { data: string; descricao: string; valor: number; saldo: number | null }) =>
      `${l.data}|${l.descricao}|${l.valor}|${l.saldo ?? ""}`;

    const batchCount = new Map<string, number>();
    for (const l of lines) {
      const k = lineKey(l);
      batchCount.set(k, (batchCount.get(k) ?? 0) + 1);
    }

    const dbCount = new Map<string, number>();
    for (const [k, _cnt] of batchCount) {
      const [data, descricao, valorStr, salStr] = k.split("|");
      const valor = parseFloat(valorStr);
      const salParam = salStr === "" ? null : parseFloat(salStr);
      const res = await dbExecute(db,
        `SELECT COUNT(*) AS cnt FROM bank_statement_lines WHERE company_id=$1 AND conta_bancaria_id=$2 AND data=$3 AND descricao=$4 AND valor=$5 AND ($6::numeric IS NULL OR saldo_apos=$7) AND excluido_em IS NULL`,
        [input.companyId, input.contaBancariaId, data, descricao, valor, salParam, salParam]
      );
      dbCount.set(k, parseInt((rows(res)[0] as any)?.cnt ?? "0", 10));
    }

    const sessionInserted = new Map<string, number>();

    for (const line of lines) {
      // Rev. 3533 — dedup inclui saldo_apos quando presente: lançamentos legítimos com
      // mesmo valor/data/descricao mas saldos diferentes deixam de ser descartados.
      // Rev. 3544 bugfix: salParam passado duas vezes (segundo $6 virou $7).
      // Rev. 3802 — dedup secundário por ID de transação (E003.../Doc NNNNNN).
      // Rev. 4090 — dedup ciente do batch: permite N inserções quando o extrato tem
      // N ocorrências idênticas legítimas (ex: 2× Pix mesmo valor, mesmo favorecido).
      const k = lineKey(line);
      const alreadyInDb   = dbCount.get(k) ?? 0;
      const alreadyInSess = sessionInserted.get(k) ?? 0;
      const batchTotal    = batchCount.get(k) ?? 1;

      if (alreadyInDb + alreadyInSess >= batchTotal) {
        skipped++;
        continue;
      }

      // Dedup secundário: extrai ID canônico da descrição (E003... ou Doc NNNNNN)
      // Rev. 3949 — FIX: dedup secundário também verifica saldo_apos.
      // Rev. 4086b — restrito à mesma conta (cross-conta causava falso-positivo).
      const salParam = line.saldo ?? null;
      const eCode = line.descricao?.match(/E[0-9A-Fa-f]{20,}/)?.[0];
      const docCode = line.descricao?.match(/Doc\s+(\d{5,})/i)?.[1];
      const txKey = eCode ?? (docCode ? `Doc ${docCode}` : null);
      if (txKey && alreadyInDb === 0 && alreadyInSess === 0) {
        const fuzzy = await dbExecute(db,
          `SELECT id FROM bank_statement_lines WHERE company_id=$1 AND conta_bancaria_id=$2 AND data=$3 AND valor=$4 AND descricao ILIKE $5 AND ($6::numeric IS NULL OR saldo_apos=$7) AND excluido_em IS NULL LIMIT 1`,
          [input.companyId, input.contaBancariaId, line.data, line.valor, `%${txKey}%`, salParam, salParam]
        );
        if (rows(fuzzy).length > 0) { skipped++; continue; }
      }

      await dbExecute(db, 
        `INSERT INTO bank_statement_lines (company_id, conta_bancaria_id, data, descricao, valor, tipo, saldo_apos, conciliado, importado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8)`,
        [input.companyId, input.contaBancariaId, line.data, line.descricao, line.valor,
         line.valor >= 0 ? "credito" : "debito", line.saldo, importadoEm]
      );
      sessionInserted.set(k, alreadyInSess + 1);
      inserted++;
    }

    await createAuditLog({
      userId: ctx.user?.id,
      action: "bank_statement_import",
      details: `Importação ${input.formato.toUpperCase()}: ${inserted} inseridos, ${skipped} duplicados`,
      companyId: input.companyId,
    });

    return { inserted, skipped, total: lines.length };
  }),

  // ─────────────────── IMPORTAÇÃO EXTRATO EM 2 FASES (progresso real) ───────────────────
  // FASE 1: analisar = só faz o PARSE (OFX/CSV/PDF) e devolve as linhas + um carimbo
  // `importadoEm` compartilhado por todos os lotes. NÃO grava nada.
  analyzeBankStatement: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    formato: z.enum(["ofx", "csv", "pdf"]),
    conteudo: z.string(),
    csvSeparador: z.string().optional(),
    csvColunaData: z.number().optional(),
    csvColunaDescricao: z.number().optional(),
    csvColunaValor: z.number().optional(),
    csvColunaSaldo: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    const ownerCheck = await dbExecute(db,
      `SELECT id FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [input.contaBancariaId, input.companyId]
    );
    if (rows(ownerCheck).length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa" });
    }

    const { lines, rendimentoAplicacao, templateDetectado } = await parseExtratoLines({ ...input, companyId: input.companyId });
    return { lines, total: lines.length, importadoEm: new Date().toISOString(), rendimentoAplicacao, templateDetectado };
  }),

  // ─────────── Rev. 3363 — LANÇAR RENDIMENTO DE APLICAÇÃO/RESGATE AUTOMÁTICO ───────────
  // O extrato Santander de uma conta com aplicação automática (CDB ContaMax) traz, no
  // rodapé, o rendimento APURADO no mês. O parser propõe { bruto, iof, ir }; o usuário
  // CONFIRMA na Conciliação (nunca lança sozinho — opção A: bruto + IOF + IR separados).
  // Esta mutation materializa 3 lançamentos EFETIVOS (receita financeira BRUTA + despesa
  // IOF + despesa IR), garantindo as categorias no Plano de Contas. IDEMPOTENTE: re-confirmar
  // o mesmo mês/conta não duplica. Tenant guard duplo (empresa + dono da conta).
  lancarRendimentoAplicacao: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    competenciaMes: z.number().min(1).max(12),
    competenciaAno: z.number().min(2000).max(2100),
    bruto: z.number().nonnegative(),
    iof: z.number().nonnegative().default(0),
    ir: z.number().nonnegative().default(0),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);

    const bruto = Math.round(input.bruto * 100) / 100;
    const iof = Math.round(input.iof * 100) / 100;
    const ir = Math.round(input.ir * 100) / 100;
    if (bruto <= 0 && iof <= 0 && ir <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum valor de rendimento informado." });
    }

    // Categoria do Plano de Contas (find-or-create idempotente por nome).
    const ensureAccount = async (nome: string, tipo: "receita" | "despesa", dre: string): Promise<number> => {
      const found = rows(await dbExecute(db,
        `SELECT id FROM financial_accounts WHERE company_id=$1 AND LOWER(nome)=LOWER($2) AND ativo=1 LIMIT 1`,
        [input.companyId, nome]))[0];
      if (found?.id) return Number(found.id);
      const maxRes = rows(await dbExecute(db,
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(codigo,'[^0-9]','','g') AS INTEGER)),0)+1 AS nxt
           FROM financial_accounts WHERE company_id=$1 AND codigo LIKE 'AUTO-%'`,
        [input.companyId]))[0];
      const codigo = `AUTO-${String(Number(maxRes?.nxt ?? 1)).padStart(4, "0")}`;
      try {
        const r = rows(await dbExecute(db,
          `INSERT INTO financial_accounts (company_id, codigo, nome, tipo, natureza, nivel, conta_pai_id, classificacao_dre, centro_custo_id, ativo, ordem)
           VALUES ($1,$2,$3,$4,$5,1,NULL,$6,NULL,1,999) RETURNING id`,
          [input.companyId, codigo, nome, tipo, tipo, dre]));
        return Number(r[0]?.id);
      } catch (e: any) {
        const again = rows(await dbExecute(db,
          `SELECT id FROM financial_accounts WHERE company_id=$1 AND LOWER(nome)=LOWER($2) AND ativo=1 LIMIT 1`,
          [input.companyId, nome]))[0];
        if (again?.id) return Number(again.id);
        throw e;
      }
    };

    // Data = último dia da competência (rendimento creditado no fim do mês).
    const ultimoDia = new Date(Date.UTC(input.competenciaAno, input.competenciaMes, 0)).getUTCDate();
    const dataStr = `${input.competenciaAno}-${String(input.competenciaMes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
    const mesAno = `${String(input.competenciaMes).padStart(2, "0")}/${input.competenciaAno}`;
    const obs = input.observacoes?.trim() || null;

    const insertEntry = async (
      tx: any, tipo: "receita" | "despesa", contaId: number, contaNome: string,
      valor: number, descricao: string, status: "recebido" | "pago",
    ): Promise<number> => {
      // dbExecute liga params por ORDEM DE APARIÇÃO — o array segue a ordem do texto.
      const r = await dbExecute(tx,
        `INSERT INTO financial_entries
          (company_id, conta_id, conta_nome, tipo, natureza,
           valor_previsto, valor_realizado, data_competencia, data_pagamento,
           status, conta_bancaria_id, descricao, observacoes, conciliado,
           origem_modulo, origem_descricao, criado_por_id, criado_por_nome, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'variavel',
           $5,$6,$7::date,$8::date,
           $9,$10,$11,$12,1,
           'rendimento_aplicacao',$13,$14,$15,NOW(),NOW())
         RETURNING id`,
        [
          input.companyId, contaId, contaNome, tipo,
          valor, valor, dataStr, dataStr,
          status, input.contaBancariaId, descricao, obs,
          `CDB ContaMax ${mesAno}`, ctx.user?.id ?? null, ctx.user?.name ?? null,
        ]);
      return Number(rows(r)[0]?.id);
    };

    const ids: number[] = [];
    let alreadyExists = false;
    await db.transaction(async (tx: any) => {
      // Idempotência RACE-SAFE: serializa por (empresa, conta, ano, mês) com advisory lock
      // de transação (ALTER/índice único é proibido neste projeto). O lock + re-check dentro
      // da MESMA transação fecha a janela do "check-then-insert" sob chamadas concorrentes.
      const lockKey = ((input.companyId * 100 + input.contaBancariaId) * 10000 + input.competenciaAno) * 100 + input.competenciaMes;
      await dbExecute(tx, `SELECT pg_advisory_xact_lock($1::bigint)`, [lockKey]);

      const dupe = rows(await dbExecute(tx,
        `SELECT id FROM financial_entries
          WHERE company_id=$1 AND conta_bancaria_id=$2 AND origem_modulo='rendimento_aplicacao'
            AND EXTRACT(YEAR FROM data_competencia)=$3 AND EXTRACT(MONTH FROM data_competencia)=$4
          LIMIT 1`,
        [input.companyId, input.contaBancariaId, input.competenciaAno, input.competenciaMes]
      ));
      if (dupe[0]?.id) { alreadyExists = true; return; }

      if (bruto > 0) {
        const catReceita = await ensureAccount("Rendimento de Aplicação Financeira", "receita", "receita_financeira");
        ids.push(await insertEntry(tx, "receita", catReceita, "Rendimento de Aplicação Financeira",
          bruto, `Rendimento de aplicação automática (CDB ContaMax) — ${mesAno}`, "recebido"));
      }
      if (iof > 0) {
        const catIof = await ensureAccount("IOF sobre Aplicação Financeira", "despesa", "despesa_financeira");
        ids.push(await insertEntry(tx, "despesa", catIof, "IOF sobre Aplicação Financeira",
          iof, `IOF sobre rendimento de aplicação (CDB ContaMax) — ${mesAno}`, "pago"));
      }
      if (ir > 0) {
        const catIr = await ensureAccount("IR sobre Aplicação Financeira", "despesa", "despesa_financeira");
        ids.push(await insertEntry(tx, "despesa", catIr, "IR sobre Aplicação Financeira",
          ir, `IR sobre rendimento de aplicação (CDB ContaMax) — ${mesAno}`, "pago"));
      }
    });

    if (alreadyExists) {
      return { alreadyExists: true, ids: [] as number[] };
    }

    await createAuditLog({
      action: "financial_rendimento_aplicacao_created", userId: ctx.user?.id, companyId: input.companyId,
      details: `Rendimento CDB ${mesAno}: bruto R$${bruto} / IOF R$${iof} / IR R$${ir} (${ids.length} lançamentos)`,
    });
    return { alreadyExists: false, ids };
  }),

  // FASE 2: gravar um LOTE de linhas (com dedup idempotente). O cliente chama em
  // sequência, fatiando as linhas, e calcula o % real = processadas/total. No último
  // lote (`finalize`), grava a auditoria com os totais acumulados informados.
  // ─── Rev. 4085 — Verificação de duplicados ANTES de gravar (dry-run) ───────────────────
  // Espelha exatamente a lógica de dedup do insertBankStatementBatch mas sem INSERT.
  // O frontend usa isso para pausar e apresentar ao usuário quais linhas já existem,
  // deixando-o decidir se quer reimportar (forceInsert) ou ignorar.
  checkStatementDuplicates: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    linhas: z.array(z.object({
      data: z.string(),
      descricao: z.string(),
      valor: z.number(),
      saldo: z.number().nullable(),
    })),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const ownerCheck = await dbExecute(db,
      `SELECT id FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [input.contaBancariaId, input.companyId]
    );
    if (rows(ownerCheck).length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa" });
    }
    // Rev. 4090 — dedup ciente de duplicatas legítimas no batch (mesma lógica de importBankStatement).
    const lineKey2 = (l: { data: string; descricao: string; valor: number; saldo: number | null }) =>
      `${l.data}|${l.descricao}|${l.valor}|${l.saldo ?? ""}`;

    const batchCount2 = new Map<string, number>();
    for (const l of input.linhas) {
      const k = lineKey2(l);
      batchCount2.set(k, (batchCount2.get(k) ?? 0) + 1);
    }
    const dbCount2 = new Map<string, number>();
    for (const [k] of batchCount2) {
      const [data, descricao, valorStr, salStr] = k.split("|");
      const valor = parseFloat(valorStr);
      const salParam = salStr === "" ? null : parseFloat(salStr);
      const res = await dbExecute(db,
        `SELECT COUNT(*) AS cnt FROM bank_statement_lines WHERE company_id=$1 AND conta_bancaria_id=$2 AND data=$3 AND descricao=$4 AND valor=$5 AND ($6::numeric IS NULL OR saldo_apos=$7) AND excluido_em IS NULL`,
        [input.companyId, input.contaBancariaId, data, descricao, valor, salParam, salParam]
      );
      dbCount2.set(k, parseInt((rows(res)[0] as any)?.cnt ?? "0", 10));
    }

    const duplicateIndices: number[] = [];
    const seen2 = new Map<string, number>();
    for (let idx = 0; idx < input.linhas.length; idx++) {
      const line = input.linhas[idx];
      const k = lineKey2(line);
      const alreadyInDb   = dbCount2.get(k) ?? 0;
      const alreadyInSess = seen2.get(k) ?? 0;
      const batchTotal    = batchCount2.get(k) ?? 1;

      if (alreadyInDb + alreadyInSess >= batchTotal) {
        duplicateIndices.push(idx);
        seen2.set(k, alreadyInSess + 1);
        continue;
      }

      const salParam = line.saldo ?? null;
      const eCode = line.descricao?.match(/E[0-9A-Fa-f]{20,}/)?.[0];
      const docCode = line.descricao?.match(/Doc\s+(\d{5,})/i)?.[1];
      const txKey = eCode ?? (docCode ? `Doc ${docCode}` : null);
      if (txKey && alreadyInDb === 0 && alreadyInSess === 0) {
        // Rev. 4086b — dedup secundário restrito à mesma conta.
        const fuzzy = await dbExecute(db,
          `SELECT id FROM bank_statement_lines WHERE company_id=$1 AND conta_bancaria_id=$2 AND data=$3 AND valor=$4 AND descricao ILIKE $5 AND ($6::numeric IS NULL OR saldo_apos=$7) AND excluido_em IS NULL LIMIT 1`,
          [input.companyId, input.contaBancariaId, line.data, line.valor, `%${txKey}%`, salParam, salParam]
        );
        if (rows(fuzzy).length > 0) { duplicateIndices.push(idx); seen2.set(k, alreadyInSess + 1); continue; }
      }
      seen2.set(k, alreadyInSess + 1);
    }
    return { duplicateIndices };
  }),

  insertBankStatementBatch: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    formato: z.enum(["ofx", "csv", "pdf"]),
    importadoEm: z.string(),
    linhas: z.array(z.object({
      data: z.string(),
      descricao: z.string(),
      valor: z.number(),
      saldo: z.number().nullable(),
    })),
    finalize: z.boolean().optional(),
    totalInseridos: z.number().optional(),
    totalDuplicados: z.number().optional(),
    // Rev. 4085 — força inserção sem dedup (linhas aprovadas pelo usuário no diálogo de revisão)
    forceInsert: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);

    const ownerCheck = await dbExecute(db,
      `SELECT id FROM company_bank_accounts WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [input.contaBancariaId, input.companyId]
    );
    if (rows(ownerCheck).length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Conta bancária não pertence a esta empresa" });
    }

    let inserted = 0;
    let skipped = 0;

    // Rev. 4104-fix — espelha a lógica batch-count-aware de importBankStatement.
    // Sem isso, quando o mesmo lote contém N linhas com chave idêntica (ex: 2× PIX
    // R$50.000 para o mesmo favorecido no mesmo dia), o SELECT LIMIT 1 encontrava a
    // 1ª linha já inserida neste mesmo lote e pulava a 2ª, 3ª, etc.
    // Estratégia: pré-calcular batchCount + dbCount UMA vez; usar sessionInserted
    // para rastrear quantas já foram inseridas nesta sessão por chave.
    const bsl_lineKey = (l: { data: string; descricao: string; valor: number; saldo: number | null }) =>
      `${l.data}|${l.descricao}|${l.valor}|${l.saldo ?? ""}`;

    let batchCountBSL = new Map<string, number>();
    let dbCountBSL    = new Map<string, number>();
    const sessionInsertedBSL = new Map<string, number>();

    if (!input.forceInsert) {
      for (const l of input.linhas) {
        const k = bsl_lineKey(l);
        batchCountBSL.set(k, (batchCountBSL.get(k) ?? 0) + 1);
      }
      for (const [k] of batchCountBSL) {
        const [data, descricao, valorStr, salStr] = k.split("|");
        const valor = parseFloat(valorStr);
        const salParam = salStr === "" ? null : parseFloat(salStr);
        const res = await dbExecute(db,
          `SELECT COUNT(*) AS cnt FROM bank_statement_lines WHERE company_id=$1 AND conta_bancaria_id=$2 AND data=$3 AND descricao=$4 AND valor=$5 AND ($6::numeric IS NULL OR saldo_apos=$7) AND excluido_em IS NULL`,
          [input.companyId, input.contaBancariaId, data, descricao, valor, salParam, salParam]
        );
        dbCountBSL.set(k, parseInt((rows(res)[0] as any)?.cnt ?? "0", 10));
      }
    }

    for (const line of input.linhas) {
      // Rev. 4085 — forceInsert=true pula dedup (linhas aprovadas pelo usuário no diálogo)
      if (!input.forceInsert) {
        const k = bsl_lineKey(line);
        const alreadyInDb   = dbCountBSL.get(k) ?? 0;
        const alreadyInSess = sessionInsertedBSL.get(k) ?? 0;
        const batchTotal    = batchCountBSL.get(k) ?? 1;

        if (alreadyInDb + alreadyInSess >= batchTotal) {
          skipped++;
          continue;
        }

        // Dedup secundário: extrai ID canônico da descrição (E003... ou Doc NNNNNN)
        // Rev. 3804 — cross-conta: remove conta_bancaria_id do filtro para bloquear
        // o mesmo Doc/E-code sendo importado em uma conta diferente da empresa.
        // Rev. 3949 — FIX: espelha fix da Fase 1 — saldo_apos na guarda do fuzzy match
        // para não descartar N lançamentos legítimos com mesmo Doc/E-code no mesmo dia.
        const salParam = line.saldo ?? null;
        if (alreadyInDb === 0 && alreadyInSess === 0) {
          const eCode = line.descricao?.match(/E[0-9A-Fa-f]{20,}/)?.[0];
          const docCode = line.descricao?.match(/Doc\s+(\d{5,})/i)?.[1];
          const txKey = eCode ?? (docCode ? `Doc ${docCode}` : null);
          if (txKey) {
            const fuzzy = await dbExecute(db,
              `SELECT id FROM bank_statement_lines WHERE company_id=$1 AND data=$2 AND valor=$3 AND descricao ILIKE $4 AND ($5::numeric IS NULL OR saldo_apos=$6) AND excluido_em IS NULL LIMIT 1`,
              [input.companyId, line.data, line.valor, `%${txKey}%`, salParam, salParam]
            );
            if (rows(fuzzy).length > 0) { skipped++; continue; }
          }
        }
      }
      await dbExecute(db,
        `INSERT INTO bank_statement_lines (company_id, conta_bancaria_id, data, descricao, valor, tipo, saldo_apos, conciliado, importado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8)`,
        [input.companyId, input.contaBancariaId, line.data, line.descricao, line.valor,
         line.valor >= 0 ? "credito" : "debito", line.saldo, input.importadoEm]
      );
      if (!input.forceInsert) {
        const k = bsl_lineKey(line);
        sessionInsertedBSL.set(k, (sessionInsertedBSL.get(k) ?? 0) + 1);
      }
      inserted++;
    }

    if (input.finalize) {
      await createAuditLog({
        userId: ctx.user?.id,
        action: "bank_statement_import",
        details: `Importação ${input.formato.toUpperCase()}: ${(input.totalInseridos ?? 0) + inserted} inseridos, ${(input.totalDuplicados ?? 0) + skipped} duplicados`,
        companyId: input.companyId,
      });
    }

    return { inserted, skipped };
  }),

  getContasAReceber: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    vencimentoAte: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds = [`company_id IN (${inlineIds(ids)})`, `tipo='receita'`, `status IN ('a_receber','recebido_parcial')`];
    const vals: any[] = [];
    let i = 1;
    if (input.vencimentoAte) { conds.push(`data_vencimento<=$${i++}`); vals.push(input.vencimentoAte); }
    const res = await dbExecute(db, 
      `SELECT id, obra_id AS "obraId", obra_nome AS "obraNome", descricao,
              valor_previsto AS "valorPrevisto", valor_realizado AS "valorRealizado",
              data_vencimento AS "dataVencimento", status,
              CASE WHEN data_vencimento < CURRENT_DATE THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
       FROM financial_entries WHERE ${conds.join(" AND ")} ORDER BY data_vencimento ASC`,
      vals
    );
    return rows(res);
  }),

  // ════════════════════════════════════════════════════════════════════════
  // Rev. 3002 — CONTAS A RECEBER "DE VERDADE" (espelho do Contas a Pagar)
  // Títulos tipo='receita' em financial_entries: auto das medições (origem
  // 'revenue') + manuais avulsos, com parcelas, baixa total/parcial por cliente.
  // ════════════════════════════════════════════════════════════════════════

  // Lista TODOS os títulos a receber do ano (espelha getContasAPagarByYear).
  getContasAReceberByYear: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    ano: z.number(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    for (const cid of ids) await _assertFinanceiroCompanyAccess(ctx.user, cid);
    const res = await dbExecute(db,
      `SELECT id, obra_id AS "obraId", obra_nome AS "obraNome", descricao,
              conta_id AS "contaId", conta_nome AS "contaNome",
              cliente_id AS "clienteId", cliente_nome AS "clienteNome",
              valor_previsto AS "valorPrevisto",
              valor_realizado AS "valorRealizado", status,
              data_vencimento AS "dataVencimento", data_pagamento AS "dataPagamento",
              data_competencia AS "dataCompetencia",
              forma_pagamento AS "formaPagamento",
              origem_modulo AS "origemModulo", origem_id AS "origemId",
              origem_descricao AS "origemDescricao",
              parcela_numero AS "parcelaNumero", parcela_total AS "parcelaTotal",
              parcela_grupo_id AS "parcelaGrupoId",
              anexo_url AS "anexoUrl", anexo_nome AS "anexoNome",
              comprovante_url AS "comprovanteUrl",
              conta_bancaria_id AS "contaBancariaId",
              observacoes, tipo,
              CASE WHEN data_vencimento < CURRENT_DATE AND status NOT IN ('recebido','cancelado') THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso",
              -- Rev. 3941: detectar possíveis duplicatas — mesmo empresa+valor+data de vencimento.
              COUNT(*) OVER (
                PARTITION BY company_id,
                             ROUND(valor_previsto::numeric, 2),
                             data_vencimento::date
              )::int AS "dupCount",
              -- Rev. 4084: NFS-e vinculada ao título (badge na lista)
              (SELECT nfse_numero FROM financial_nfse_vinculos WHERE entry_id = financial_entries.id AND status != 'cancelada' LIMIT 1) AS "nfseNumero",
              (SELECT nfse_chave   FROM financial_nfse_vinculos WHERE entry_id = financial_entries.id AND status != 'cancelada' LIMIT 1) AS "nfseChave"
       FROM financial_entries
       WHERE company_id IN (${inlineIds(ids)})
         AND tipo = 'receita'
         AND status != 'cancelado'
         ${FINANCEIRO_SOMENTE_REAL ? `AND ${sqlNotProjecao()}` : ""}
         AND EXTRACT(year FROM COALESCE(data_vencimento::date, created_at::date)) = $1
       ORDER BY data_vencimento ASC NULLS LAST`,
      [input.ano]
    );
    return rows(res);
  }),

  // Cria título manual a receber. Com `parcelas` > 1 gera N linhas ligadas por
  // parcela_grupo_id, vencimentos mensais, valor distribuído (resto na última).
  criarTituloReceber: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number().nullable().optional(),
    obraNome: z.string().optional(),
    contaId: z.number().nullable().optional(),
    contaNome: z.string().optional(),
    clienteId: z.number().nullable().optional(),
    clienteNome: z.string().optional(),
    descricao: z.string().min(1, "Informe a descrição do título."),
    valorPrevisto: z.number().positive("Valor deve ser maior que zero."),
    dataCompetencia: z.string().optional(),
    dataVencimento: z.string().optional(),
    parcelas: z.number().int().min(1).max(120).default(1),
    natureza: z.string().default("variavel"),
    observacoes: z.string().optional(),
    anexoUrl: z.string().optional(),
    anexoNome: z.string().optional(),
    // Rev. 4084 — conta bancária de recebimento + NFS-e vinculada ao criar o título
    contaBancariaId: z.number().nullable().optional(),
    nfseNumero: z.string().max(20).optional(),
    nfseSerie: z.string().max(10).optional(),
    nfseChave: z.string().max(50).optional(),
    municipioNome: z.string().max(255).optional(),
    municipioIbge: z.number().int().optional(),
    nfseValorServico: z.number().optional(),
    nfseValorMaterial: z.number().optional(),
    nfseXmlConteudo: z.string().optional(),
    nfseXmlNome: z.string().max(255).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const n = Math.max(1, input.parcelas ?? 1);
    const totalCents = Math.round(input.valorPrevisto * 100);
    const baseCents = Math.floor(totalCents / n);
    const restoCents = totalCents - baseCents * (n - 1); // a última parcela leva o resto
    const grupoId = n > 1
      ? `REC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : null;

    // Base de vencimento/competência (default: hoje).
    const hojeStr = new Date().toISOString().slice(0, 10);
    const vencBase = (input.dataVencimento || hojeStr).slice(0, 10);
    const compBase = (input.dataCompetencia || vencBase).slice(0, 10);
    const addMonths = (iso: string, k: number): string => {
      const [y, m, d] = iso.split("-").map(Number);
      const base = new Date(Date.UTC(y, (m - 1) + k, 1));
      const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
      const day = Math.min(d, lastDay);
      const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${base.getUTCFullYear()}-${mm}-${dd}`;
    };

    const insertedIds: number[] = [];
    await db.transaction(async (tx: any) => {
      for (let k = 0; k < n; k++) {
        const cents = k === n - 1 ? restoCents : baseCents;
        const valor = cents / 100;
        const venc = addMonths(vencBase, k);
        const comp = addMonths(compBase, k);
        const sufixo = n > 1 ? ` (${k + 1}/${n})` : "";
        // dbExecute liga params por ORDEM DE APARIÇÃO — array segue a ordem do texto.
        const r = await dbExecute(tx,
          `INSERT INTO financial_entries
            (company_id, obra_id, obra_nome, conta_id, conta_nome, tipo, natureza,
             valor_previsto, data_competencia, data_vencimento, status,
             cliente_id, cliente_nome, descricao, observacoes,
             parcela_numero, parcela_total, parcela_grupo_id,
             anexo_url, anexo_nome, origem_modulo,
             criado_por_id, criado_por_nome, conta_bancaria_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'receita', $6,
             $7, $8::date, $9::date, 'a_receber',
             $10, $11, $12, $13,
             $14, $15, $16,
             $17, $18, 'manual_receber',
             $19, $20, $21, NOW(), NOW())
           RETURNING id`,
          [
            input.companyId, input.obraId ?? null, input.obraNome?.trim() || null,
            input.contaId ?? null, input.contaNome?.trim() || null, input.natureza || "variavel",
            valor, comp, venc,
            input.clienteId ?? null, input.clienteNome?.trim() || null,
            (input.descricao || "").trim() + sufixo, input.observacoes?.trim() || null,
            n > 1 ? k + 1 : null, n > 1 ? n : null, grupoId,
            k === 0 ? (input.anexoUrl || null) : null, k === 0 ? (input.anexoNome || null) : null,
            ctx.user?.id ?? null, ctx.user?.name ?? null,
            input.contaBancariaId ?? null,
          ]
        );
        const id = rows(r)[0]?.id;
        if (id) insertedIds.push(Number(id));
      }
    });
    // Rev. 4084 — NFS-e linking: se dados informados, vincula ao 1º título (parcela 1/N)
    const firstId = insertedIds[0];
    if (firstId && (input.nfseNumero || input.nfseChave || input.nfseXmlConteudo)) {
      try {
        await dbExecute(db,
          `INSERT INTO financial_nfse_vinculos
             (company_id, entry_id, nfse_numero, nfse_serie, nfse_chave,
              municipio_nome, municipio_ibge, valor_servico, valor_material,
              xml_conteudo, xml_nome, status, criado_por_id, criado_por_nome)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'vinculada', $12, $13)`,
          [
            input.companyId, firstId,
            input.nfseNumero?.trim() || null, input.nfseSerie?.trim() || null,
            input.nfseChave?.trim() || null,
            input.municipioNome?.trim() || null, input.municipioIbge ?? null,
            input.nfseValorServico ?? null, input.nfseValorMaterial ?? null,
            input.nfseXmlConteudo || null, input.nfseXmlNome?.trim() || null,
            ctx.user?.id ?? null, ctx.user?.name ?? null,
          ]
        );
      } catch (e: any) { console.error("[criarTituloReceber] FALHA ao inserir NFS-e vínculo:", e?.message); }
    }
    await createAuditLog({
      action: "financial_receivable_created",
      userId: ctx.user?.id, companyId: input.companyId,
      details: `Título a receber R$${input.valorPrevisto} em ${n}x — "${input.descricao}"${input.clienteNome ? " — " + input.clienteNome : ""}${input.nfseNumero ? ` — NFS-e ${input.nfseNumero}` : ""}`,
    });
    return { ok: true, ids: insertedIds };
  }),

  // Baixa (recebimento) total ou parcial de um título. Acumula valor_realizado;
  // se >= valor_previsto → 'recebido' (+data_pagamento), senão 'recebido_parcial'.
  darBaixaReceber: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    valorRecebido: z.number().positive("Informe o valor recebido."),
    dataRecebimento: z.string().optional(),
    contaBancariaId: z.number().nullable().optional(),
    formaPagamento: z.string().optional(),
    comprovanteUrl: z.string().optional(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const [entry]: any = await dbExecute(db,
      `SELECT id, valor_previsto, valor_realizado, status
       FROM financial_entries WHERE id=$1 AND company_id=$2 AND tipo='receita'`,
      [input.id, input.companyId]
    ).then((r: any) => (Array.isArray(r) ? r : r?.rows ?? []));
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Título a receber não encontrado." });
    if (entry.status === "recebido") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Título já recebido integralmente — estorne antes de nova baixa." });
    }
    const previsto = Number(entry.valor_previsto ?? 0);
    const jaRecebido = Number(entry.valor_realizado ?? 0);
    const acumulado = Math.round((jaRecebido + input.valorRecebido) * 100) / 100;
    const quitado = acumulado + 0.005 >= previsto;
    const dataRec = (input.dataRecebimento || new Date().toISOString().slice(0, 10)).slice(0, 10);
    // dbExecute liga params por ORDEM DE APARIÇÃO — array segue a ordem do texto.
    await dbExecute(db,
      `UPDATE financial_entries
       SET valor_realizado=$1,
           status=$2,
           data_pagamento=$3,
           conta_bancaria_id=COALESCE($4, conta_bancaria_id),
           forma_pagamento=COALESCE($5, forma_pagamento),
           comprovante_url=COALESCE($6, comprovante_url),
           observacoes=COALESCE($7, observacoes),
           updated_at=NOW()
       WHERE id=$8 AND company_id=$9 AND tipo='receita'`,
      [acumulado, quitado ? "recebido" : "recebido_parcial", quitado ? dataRec : null,
       input.contaBancariaId ?? null, input.formaPagamento ?? null,
       input.comprovanteUrl ?? null, input.observacoes ?? null,
       input.id, input.companyId]
    );
    await createAuditLog({
      action: "financial_receivable_paid",
      userId: ctx.user?.id, companyId: input.companyId,
      details: `Baixa ${quitado ? "TOTAL" : "PARCIAL"} título ${input.id}: +R$${input.valorRecebido} (acum. R$${acumulado}/${previsto})`,
    });
    return { ok: true, quitado, acumulado, saldo: Math.max(0, Math.round((previsto - acumulado) * 100) / 100) };
  }),

  // Estorna a baixa: volta para 'a_receber', zera valor_realizado e data_pagamento.
  estornarReceber: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    motivo: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const [entry]: any = await dbExecute(db,
      `SELECT id, status FROM financial_entries WHERE id=$1 AND company_id=$2 AND tipo='receita'`,
      [input.id, input.companyId]
    ).then((r: any) => (Array.isArray(r) ? r : r?.rows ?? []));
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Título a receber não encontrado." });
    // Rev. 3743 — numa transação com lock por lançamento, soft-estorna o histórico de baixas
    // (registrarBaixa) ANTES de zerar o entry, p/ não deixar linhas ativas órfãs que o rollup
    // re-somaria na próxima baixa. No-op para títulos recebidos pela rota antiga (sem baixas).
    await (db as any).transaction(async (tx: any) => {
      await _lockEntryBaixas(tx, input.companyId, input.id);
      await _estornarBaixasAtivasDoEntry(tx, input.id, input.companyId, ctx.user?.id, ctx.user?.name, `Estorno do recebimento${input.motivo ? ": " + input.motivo : ""}`);
      await dbExecute(tx,
        `UPDATE financial_entries
         SET status='a_receber', valor_realizado=NULL, data_pagamento=NULL, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND tipo='receita'`,
        [input.id, input.companyId]
      );
    });
    await createAuditLog({
      action: "financial_receivable_reversed",
      userId: ctx.user?.id, companyId: input.companyId,
      details: `Estorno recebimento título ${input.id}${input.motivo ? " — motivo: " + input.motivo : ""}`,
    });
    return { ok: true };
  }),

  // ─── Rev. 3743 — BAIXA PARCIAL (Contas a Pagar/Receber) via histórico de baixas ───
  // Lista o histórico de baixas (ativas + estornadas) de um lançamento.
  getEntryBaixas: protectedProcedure.input(z.object({
    entryId: z.number(),
    companyId: z.number(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const res = await dbExecute(db,
      `SELECT id, valor, data, conta_bancaria_id AS "contaBancariaId",
              forma_pagamento AS "formaPagamento", juros, descontos, outros,
              comprovante_url AS "comprovanteUrl", cheque_tipo AS "chequeTipo",
              cheque_numero AS "chequeNumero", observacoes, quitou_total AS "quitouTotal",
              estornada_em AS "estornadaEm", estornada_por_nome AS "estornadaPorNome",
              estorno_motivo AS "estornoMotivo", criado_por_nome AS "criadoPorNome",
              created_at AS "createdAt"
       FROM financial_entry_baixas
       WHERE entry_id=$1 AND company_id=$2
       ORDER BY (estornada_em IS NULL) DESC, data ASC, id ASC`,
      [input.entryId, input.companyId]
    );
    return rows(res);
  }),

  // Registra UMA baixa (pagamento/recebimento parcial ou total). Insere a linha de
  // histórico e recalcula o rollup do entry (valor_realizado=SUM ativas, status, data).
  registrarBaixa: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    valor: z.number().nonnegative("Valor inválido."),
    data: z.string().optional(),
    contaBancariaId: z.number().nullable().optional(),
    formaPagamento: z.string().optional(),
    juros: z.number().optional(),
    descontos: z.number().optional(),
    outros: z.number().optional(),
    comprovanteUrl: z.string().optional(),
    chequeTipo: z.string().optional(),
    chequeNumero: z.string().optional(),
    chequeBanco: z.string().optional(),
    chequeAgencia: z.string().optional(),
    chequeConta: z.string().optional(),
    chequeTitular: z.string().optional(),
    chequeDataEmissao: z.string().optional(),
    chequeDataBomPara: z.string().optional(),
    observacoes: z.string().optional(),
    quitarTotal: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    if (input.contaBancariaId != null) {
      await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);
    }
    const dataBaixa = (input.data || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const isCheque = input.formaPagamento === "cheque";
    // Rev. 3743 — TUDO numa transação com advisory lock por lançamento: serializa backfill +
    // insert + rollup contra baixas/estornos concorrentes do MESMO título (sem isso, dois cliques
    // simultâneos duplicariam o backfill "Baixa anterior" e/ou somariam estado defasado no rollup).
    const { tipo, roll } = await (db as any).transaction(async (tx: any) => {
      await _lockEntryBaixas(tx, input.companyId, input.id);
      const [entry]: any = await dbExecute(tx,
        `SELECT id, tipo, valor_previsto, valor_realizado, status, data_pagamento
         FROM financial_entries WHERE id=$1 AND company_id=$2`,
        [input.id, input.companyId]
      ).then((r: any) => (Array.isArray(r) ? r : r?.rows ?? []));
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
      if (entry.tipo !== "despesa" && entry.tipo !== "receita") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lançamento não suporta baixa." });
      }
      if (entry.status === "pago" || entry.status === "recebido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Título já quitado — estorne antes de nova baixa." });
      }
      if (entry.status === "cancelado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lançamento cancelado não pode receber baixa." });
      }
      // valor 0 só é aceito quando força-se a quitação manual (opção C: perdoa o saldo restante).
      if (input.valor <= 0 && !input.quitarTotal) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o valor da baixa." });
      }
      // BACKFILL (migração suave): títulos parciais antigos foram baixados pela rota legada
      // (darBaixaReceber) gravando valor_realizado SEM criar linha no histórico. Como o rollup
      // recalcula valor_realizado=SUM(baixas ativas), a 1ª baixa nova zeraria o valor anterior.
      // Aqui, se o entry tem valor_realizado>0 mas NENHUMA baixa ativa, semeamos uma linha base.
      // (O lock acima garante que esta leitura+insert não corra com outra registrarBaixa do mesmo título.)
      const jaRealizado = Math.round(Number(entry.valor_realizado ?? 0) * 100) / 100;
      if (jaRealizado > 0) {
        const exist: any = rows(await dbExecute(tx,
          `SELECT COUNT(*)::int AS n FROM financial_entry_baixas
           WHERE entry_id=$1 AND company_id=$2 AND estornada_em IS NULL`,
          [input.id, input.companyId]
        ))[0] ?? {};
        if (Number(exist.n ?? 0) === 0) {
          const dataBase = (entry.data_pagamento ? String(entry.data_pagamento).slice(0, 10) : dataBaixa);
          await dbExecute(tx,
            `INSERT INTO financial_entry_baixas
               (entry_id, company_id, tipo, valor, data, observacoes, quitou_total, criado_por_nome)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [input.id, input.companyId, entry.tipo, jaRealizado, dataBase,
             "Baixa anterior (migração do histórico)", 0, "sistema"]
          );
        }
      }
      // dbExecute liga params por ORDEM DE APARIÇÃO — placeholders e array seguem a mesma ordem.
      await dbExecute(tx,
        `INSERT INTO financial_entry_baixas
           (entry_id, company_id, tipo, valor, data, conta_bancaria_id, forma_pagamento,
            juros, descontos, outros, comprovante_url,
            cheque_tipo, cheque_numero, cheque_banco, cheque_agencia, cheque_conta, cheque_titular,
            cheque_data_emissao, cheque_data_bom_para, observacoes, quitou_total,
            criado_por_id, criado_por_nome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [input.id, input.companyId, entry.tipo, input.valor, dataBaixa,
         input.contaBancariaId ?? null, input.formaPagamento ?? null,
         input.juros ?? null, input.descontos ?? null, input.outros ?? null, input.comprovanteUrl ?? null,
         isCheque ? (input.chequeTipo ?? null) : null,
         isCheque ? (input.chequeNumero ?? null) : null,
         isCheque ? (input.chequeBanco ?? null) : null,
         isCheque ? (input.chequeAgencia ?? null) : null,
         isCheque ? (input.chequeConta ?? null) : null,
         isCheque ? (input.chequeTitular ?? null) : null,
         isCheque ? (input.chequeDataEmissao ?? null) : null,
         isCheque ? (input.chequeDataBomPara ?? null) : null,
         input.observacoes ?? null, input.quitarTotal ? 1 : 0,
         ctx.user?.id ?? null, ctx.user?.name ?? null]
      );
      const r = await _aplicarRollupBaixas(tx, input.id, input.companyId);
      return { tipo: entry.tipo as string, roll: r };
    });
    await createAuditLog({
      action: tipo === "receita" ? "financial_receivable_partial_paid" : "financial_payable_partial_paid",
      userId: ctx.user?.id, companyId: input.companyId,
      details: `Baixa ${roll.quitado ? "TOTAL" : "PARCIAL"}${input.quitarTotal ? " (quitação manual)" : ""} ${tipo} ${input.id}: +R$${input.valor} (acum. R$${roll.acumulado}/${roll.previsto})`,
    });
    return { ok: true, quitado: roll.quitado, acumulado: roll.acumulado, saldo: roll.saldo, status: roll.status };
  }),

  // Rev. 4070 — Paga um GRUPO consolidado de Contas a Pagar (fechamento por fornecedor,
  // ver _agruparContasPagarPorCicloForn): dá baixa TOTAL em todos os títulos do grupo de uma
  // vez e, quando a forma é "cheque", registra automaticamente cada cheque digitado pelo
  // usuário no Controle de Cheques (financial_cheques) já vinculado ao fornecedor, pronto
  // para casar na Conciliação Bancária depois. Tudo em UMA transação por lançamento (mesmo
  // padrão de lock de registrarBaixa) + inserts dos cheques.
  pagarConsolidadoFornecedor: protectedProcedure.input(z.object({
    companyId: z.number(),
    itensIds: z.array(z.number()).min(1).max(500),
    dataPagamento: z.string().optional(),
    contaBancariaId: z.number().nullable().optional(),
    formaPagamento: z.string(),
    fornecedorNome: z.string().optional(),
    observacoes: z.string().optional(),
    cheques: z.array(z.object({
      numero: z.string(),
      valor: z.number().positive("Valor do cheque inválido."),
      dataVencimento: z.string(),
    })).optional(),
    // Rev. 4138 — IDs de cheques de terceiro (financial_cheques_recebidos) a alocar
    // atomicamente junto com o pagamento. Antes era fire-and-forget no cliente.
    chequesTerceiroIds: z.array(z.number().int()).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    if (input.contaBancariaId != null) {
      await _assertContaBancariaPertenceEmpresa(db, input.contaBancariaId, input.companyId);
    }
    const dataBaixa = (input.dataPagamento || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const isCheque = input.formaPagamento === "cheque";
    if (isCheque) {
      if (!input.cheques || input.cheques.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe os cheques do pagamento." });
      }
      for (const c of input.cheques) {
        if (!c.numero || !c.numero.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o número de todos os cheques." });
        }
      }
    }
    const entries: any[] = rows(await dbExecute(db,
      `SELECT id, tipo, valor_previsto AS "valorPrevisto", status
         FROM financial_entries WHERE company_id=$1 AND id = ANY($2::int[])`,
      [input.companyId, input.itensIds]));
    if (entries.length !== input.itensIds.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Um ou mais lançamentos não pertencem a esta empresa." });
    }
    const pendentes = entries.filter((e) => e.status !== "pago" && e.status !== "cancelado");
    if (pendentes.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Todos os lançamentos deste grupo já foram pagos." });
    }
    const totalGrupo = Math.round(pendentes.reduce((s, e) => s + (Number(e.valorPrevisto) || 0), 0) * 100) / 100;
    if (isCheque) {
      const totalCheques = Math.round((input.cheques!.reduce((s, c) => s + (Number(c.valor) || 0), 0)) * 100) / 100;
      if (Math.abs(totalCheques - totalGrupo) > 0.05) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `A soma dos cheques (R$${totalCheques.toFixed(2)}) não bate com o total do grupo (R$${totalGrupo.toFixed(2)}).` });
      }
    }
    const chequesCriados: number[] = [];
    await (db as any).transaction(async (tx: any) => {
      for (const e of pendentes) {
        await _lockEntryBaixas(tx, input.companyId, e.id);
        const valor = Number(e.valorPrevisto) || 0;
        await dbExecute(tx,
          `INSERT INTO financial_entry_baixas
             (entry_id, company_id, tipo, valor, data, conta_bancaria_id, forma_pagamento,
              observacoes, quitou_total, criado_por_id, criado_por_nome)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [e.id, input.companyId, e.tipo, valor, dataBaixa,
           input.contaBancariaId ?? null, input.formaPagamento,
           input.observacoes ?? `Pagamento consolidado — ${input.fornecedorNome || "fornecedor"} (${pendentes.length} título(s))`,
           1, ctx.user?.id ?? null, ctx.user?.name ?? null]
        );
        await _aplicarRollupBaixas(tx, e.id, input.companyId);
      }
      if (isCheque) {
        const loteId = randomUUID();
        let fornecedorId: number | null = null;
        if (input.fornecedorNome) {
          const fr: any[] = rows(await dbExecute(tx,
            `SELECT id FROM fornecedores WHERE company_id=$1
               AND (UPPER(TRIM(razao_social))=UPPER(TRIM($2)) OR UPPER(TRIM(nome_fantasia))=UPPER(TRIM($2)))
             LIMIT 1`,
            [input.companyId, input.fornecedorNome]));
          fornecedorId = fr[0]?.id ?? null;
        }
        for (const c of input.cheques!) {
          const dt = new Date(c.dataVencimento + "T12:00:00Z");
          const mesRef = dt.getUTCMonth() + 1;
          const anoRef = dt.getUTCFullYear();
          const res: any = await dbExecute(tx,
            `INSERT INTO financial_cheques
               (company_id, conta_bancaria_id, numero_cheque, fornecedor_nome, fornecedor_id, valor,
                data_vencimento, status, observacao, mes_ref, ano_ref, origem_arquivo, lote_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente',$8,$9,$10,'contas_a_pagar',$11)
             RETURNING id`,
            [input.companyId, input.contaBancariaId ?? null, c.numero.trim(), input.fornecedorNome ?? null,
             fornecedorId, c.valor, c.dataVencimento,
             `Pagamento consolidado de ${pendentes.length} título(s) em Contas a Pagar`, mesRef, anoRef, loteId]
          );
          const id = rows(res)[0]?.id;
          if (id) chequesCriados.push(id);
        }
      }
      // Rev. 4138 — Alocar cheques de terceiro DENTRO da transação (era fire-and-forget
      // client-side). pagamento_grupo_id = UUID único do lote; entry_id = primeiro entry
      // quitado (referência de auditoria). Todos os cheques do mesmo pagamento compartilham
      // o mesmo pagamento_grupo_id para rastreio completo mesmo em pagamentos multi-entry.
      if (input.chequesTerceiroIds?.length) {
        const primeiroEntryId = pendentes[0]?.id ?? null;
        const pagamentoGrupoId = randomUUID();
        for (const chqId of input.chequesTerceiroIds) {
          await dbExecute(tx,
            `UPDATE financial_cheques_recebidos
             SET status='alocado',
                 fornecedor_alocado_nome=$1,
                 entry_id=$2,
                 pagamento_grupo_id=$3,
                 atualizado_em=NOW()
             WHERE id=$4 AND company_id=$5 AND status='disponivel' AND excluido_em IS NULL`,
            [input.fornecedorNome ?? null, primeiroEntryId, pagamentoGrupoId, chqId, input.companyId]
          );
        }
      }
    });
    const chequesAlocados = input.chequesTerceiroIds?.length ?? 0;
    await createAuditLog({
      action: "financial_payable_consolidated_paid",
      userId: ctx.user?.id, companyId: input.companyId,
      details: `Pagamento consolidado: ${pendentes.length} título(s) de ${input.fornecedorNome || "fornecedor"} — R$${totalGrupo.toFixed(2)} via ${input.formaPagamento}${isCheque ? ` (${input.cheques!.length} cheque(s) registrados no Controle de Cheques)` : ""}${chequesAlocados ? ` (${chequesAlocados} cheque(s) de terceiro alocados)` : ""}.`,
    });
    return { ok: true, pagos: pendentes.length, total: totalGrupo, chequesCriados: chequesCriados.length, chequesAlocados, entryIds: pendentes.map((e: any) => e.id as number) };
  }),

  // Estorna UMA baixa (soft): marca estornada_em e recalcula o rollup (reabre o título
  // para 'a_pagar'/'a_receber' ou 'recebido_parcial' conforme as baixas restantes).
  estornarBaixaItem: protectedProcedure.input(z.object({
    baixaId: z.number(),
    companyId: z.number(),
    motivo: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const [baixa]: any = await dbExecute(db,
      `SELECT id, entry_id AS "entryId", valor, estornada_em AS "estornadaEm"
       FROM financial_entry_baixas WHERE id=$1 AND company_id=$2`,
      [input.baixaId, input.companyId]
    ).then((r: any) => (Array.isArray(r) ? r : r?.rows ?? []));
    if (!baixa) throw new TRPCError({ code: "NOT_FOUND", message: "Baixa não encontrada." });
    if (baixa.estornadaEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Baixa já estornada." });
    // Rev. 3743 — numa transação com lock por lançamento: serializa estorno desta baixa contra
    // registrarBaixa/estornos concorrentes do mesmo título; o re-check de estornada_em dentro do
    // UPDATE (WHERE estornada_em IS NULL) torna o estorno idempotente sob corrida.
    const roll = await (db as any).transaction(async (tx: any) => {
      await _lockEntryBaixas(tx, input.companyId, Number(baixa.entryId));
      await dbExecute(tx,
        `UPDATE financial_entry_baixas
         SET estornada_em=NOW(), estornada_por_id=$1, estornada_por_nome=$2, estorno_motivo=$3
         WHERE id=$4 AND company_id=$5 AND estornada_em IS NULL`,
        [ctx.user?.id ?? null, ctx.user?.name ?? null, input.motivo ?? null, input.baixaId, input.companyId]
      );
      return await _aplicarRollupBaixas(tx, Number(baixa.entryId), input.companyId);
    });
    await createAuditLog({
      action: "financial_baixa_reversed",
      userId: ctx.user?.id, companyId: input.companyId,
      details: `Estorno baixa ${input.baixaId} (lançamento ${baixa.entryId}, R$${baixa.valor})${input.motivo ? " — motivo: " + input.motivo : ""}`,
    });
    return { ok: true, quitado: roll.quitado, acumulado: roll.acumulado, saldo: roll.saldo, status: roll.status };
  }),

  getContasAPagar: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    vencimentoAte: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds = [`company_id IN (${inlineIds(ids)})`, `tipo='despesa'`, `status='a_pagar'`];
    const vals: any[] = [];
    let i = 1;
    if (input.vencimentoAte) { conds.push(`data_vencimento<=$${i++}`); vals.push(input.vencimentoAte); }
    const res = await dbExecute(db, 
      `SELECT id, obra_id AS "obraId", obra_nome AS "obraNome", descricao,
              conta_nome AS "contaNome", valor_previsto AS "valorPrevisto",
              data_vencimento AS "dataVencimento", origem_modulo AS "origemModulo",
              origem_descricao AS "origemDescricao",
              CASE WHEN data_vencimento < CURRENT_DATE THEN CURRENT_DATE - data_vencimento ELSE 0 END AS "diasAtraso"
       FROM financial_entries WHERE ${conds.join(" AND ")} ORDER BY data_vencimento ASC`,
      vals
    );
    return rows(res);
  }),

  getRevenueByYear: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const res = await dbExecute(db,
      `SELECT id, company_id AS "companyId", obra_id AS "obraId", obra_nome AS "obraNome",
              cliente_nome AS "clienteNome", cliente_cnpj AS "clienteCnpj",
              valor_contrato AS "valorContrato", medicao_numero AS "medicaoNumero",
              percentual_medicao AS "percentualMedicao", valor_medicao AS "valorMedicao",
              nf_numero AS "nfNumero", nf_emitida_em AS "nfEmitidaEm",
              data_vencimento AS "dataVencimento", data_recebimento AS "dataRecebimento",
              valor_recebido AS "valorRecebido", status, forma_pagamento AS "formaPagamento",
              retencao_iss AS "retencaoISS", retencao_inss AS "retencaoINSS",
              retencao_ir AS "retencaoIR",
              COALESCE(retencao_contratual,0) AS "retencaoContratual",
              retencao_total AS "retencaoTotal",
              valor_liquido_receber AS "valorLiquidoReceber",
              COALESCE(valor_aprovado, valor_medicao) AS "valorAprovado",
              data_aprovacao AS "dataAprovacao",
              medicao_enviada_em AS "medicaoEnviadaEm",
              COALESCE(glosa,0) AS "glosa",
              observacoes, created_at AS "createdAt"
       FROM financial_revenue
       WHERE company_id IN (${inlineIds(ids)})
         AND EXTRACT(year FROM COALESCE(data_vencimento::date, created_at::date)) = $1
       ORDER BY data_vencimento ASC NULLS LAST`,
      [input.ano]
    );
    return rows(res);
  }),

  // ─── PREVISÃO DE RECEITA: 3 camadas (Baseline / Previsto / Realizado) ───────

  getRevenuePrevisao: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [baselineRes, previstoRes, realizadoRes] = await Promise.all([
      dbExecute(db,
        `SELECT obra_id AS "obraId", obra_nome AS "obraNome",
                EXTRACT(month FROM mes)::int AS "mes", SUM(valor) AS "valor"
         FROM receita_baseline
         WHERE company_id=$1 AND EXTRACT(year FROM mes)=$2
         GROUP BY obra_id, obra_nome, EXTRACT(month FROM mes)`,
        [input.companyId, input.ano]
      ),
      dbExecute(db,
        `SELECT obra_id AS "obraId", obra_nome AS "obraNome",
                EXTRACT(month FROM mes)::int AS "mes", SUM(valor) AS "valor"
         FROM receita_previsto
         WHERE company_id=$1 AND EXTRACT(year FROM mes)=$2
         GROUP BY obra_id, obra_nome, EXTRACT(month FROM mes)`,
        [input.companyId, input.ano]
      ),
      dbExecute(db,
        `SELECT obra_id AS "obraId", obra_nome AS "obraNome",
                EXTRACT(month FROM COALESCE(data_vencimento::date, created_at::date))::int AS "mes",
                SUM(valor_medicao) AS "valor"
         FROM financial_revenue
         WHERE company_id=$1
           AND EXTRACT(year FROM COALESCE(data_vencimento::date, created_at::date))=$2
           AND status NOT IN ('cancelado')
         GROUP BY obra_id, obra_nome,
                  EXTRACT(month FROM COALESCE(data_vencimento::date, created_at::date))`,
        [input.companyId, input.ano]
      ),
    ]);

    const baseline  = rows(baselineRes)  as any[];
    const previsto  = rows(previstoRes)  as any[];
    const realizado = rows(realizadoRes) as any[];

    // Collect all obras
    const obraMap = new Map<number, string>();
    for (const r of [...baseline, ...previsto, ...realizado]) {
      if (r.obraId) obraMap.set(Number(r.obraId), r.obraNome ?? `Obra ${r.obraId}`);
    }

    const meses = [1,2,3,4,5,6,7,8,9,10,11,12];

    const obras = Array.from(obraMap.entries()).map(([obraId, obraNome]) => {
      const mesData = meses.map(mes => {
        const b = Number(baseline.find(r => Number(r.obraId) === obraId && Number(r.mes) === mes)?.valor ?? 0);
        const p = Number(previsto.find(r => Number(r.obraId) === obraId && Number(r.mes) === mes)?.valor ?? 0);
        const rv = Number(realizado.find(r => Number(r.obraId) === obraId && Number(r.mes) === mes)?.valor ?? 0);
        return { mes, baseline: b, previsto: p, realizado: rv };
      });
      const totB  = mesData.reduce((s, m) => s + m.baseline, 0);
      const totP  = mesData.reduce((s, m) => s + m.previsto, 0);
      const totR  = mesData.reduce((s, m) => s + m.realizado, 0);
      const spi   = totB > 0 ? totR / totB : null;
      const desvP = totB > 0 ? ((totP - totB) / totB) * 100 : null;
      return { obraId, obraNome, meses: mesData, totBaseline: totB, totPrevisto: totP, totRealizado: totR, spi, desvP };
    });

    // Rolling forecast: next 3 months from previsto
    const hoje = new Date();
    const rolling = [1,2,3].map(offset => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
      const mes = d.getMonth() + 1;
      const anoRoll = d.getFullYear();
      const valor = anoRoll === input.ano
        ? previsto.filter(r => Number(r.mes) === mes).reduce((s, r) => s + Number(r.valor), 0)
        : 0;
      return { mes, ano: anoRoll, valor };
    });

    return { obras, rolling };
  }),

  upsertRevenueBaseline: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    obraNome: z.string().optional(),
    mes: z.string(), // YYYY-MM-01
    valor: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db,
      `INSERT INTO receita_baseline (company_id, obra_id, obra_nome, mes, valor, atualizado_em)
       VALUES ($1,$2,$3,$4::date,$5,NOW())
       ON CONFLICT (company_id, obra_id, mes)
       DO UPDATE SET valor=$5, obra_nome=COALESCE($3, receita_baseline.obra_nome), atualizado_em=NOW()`,
      [input.companyId, input.obraId, input.obraNome ?? null, input.mes, input.valor]
    );
    return { ok: true };
  }),

  upsertRevenuePrevisto: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    obraNome: z.string().optional(),
    mes: z.string(), // YYYY-MM-01
    valor: z.number(),
    observacoes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db,
      `INSERT INTO receita_previsto (company_id, obra_id, obra_nome, mes, valor, observacoes, atualizado_em)
       VALUES ($1,$2,$3,$4::date,$5,$6,NOW())
       ON CONFLICT (company_id, obra_id, mes)
       DO UPDATE SET valor=$5, obra_nome=COALESCE($3, receita_previsto.obra_nome),
                     observacoes=COALESCE($6, receita_previsto.observacoes), atualizado_em=NOW()`,
      [input.companyId, input.obraId, input.obraNome ?? null, input.mes, input.valor, input.observacoes ?? null]
    );
    return { ok: true };
  }),

  getContasAPagarByYear: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    ano: z.number(),
    baseData: z.enum(["vencimento", "caixa"]).optional(), // Rev. 3134
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);

    // Rev. 2214 — Auto-materialização lazy: garante que as recorrências
    // ativas estejam projetadas até o fim do ano consultado antes do SELECT.
    // Idempotente (skip se já existe entrada com mesmo origem_id+mês), então
    // chamar a cada query é seguro. Roda só pra `companyId` (não pro array
    // de companyIds) pra manter custo baixo no caso consolidado.
    try {
      const now = new Date();
      const mesesAteFimAno = Math.max(1, (input.ano - now.getFullYear()) * 12 + (12 - now.getMonth()));
      await materializeRecorrentes(db, input.companyId, Math.min(mesesAteFimAno, 13));
    } catch (e: any) {
      console.error("[Rev.2214] materializeRecorrentes falhou em getContasAPagarByYear:", e?.message || e);
    }

    // Rev. 3134 — base de data opcional. "vencimento" (DEFAULT, usado por Contas a
    // Pagar / Fluxo de Caixa): inclui despesas cujo VENCIMENTO cai no ano. "caixa"
    // (Análise de Custos): o que está PAGO entra pelo ANO DO PAGAMENTO (quando o
    // dinheiro de fato saiu) e o que está EM ABERTO entra pelo vencimento — assim o
    // "Custo por Mês" lê a data de PAGAMENTO, não a competência (um item de
    // competência 2025 pago em 2026 deixa de cair no mês errado de 2026).
    // NB: dbExecute liga placeholders por ORDEM DE APARIÇÃO (o nº de $N é cosmético).
    let yearCond: string;
    const yearVals: any[] = [];
    if (input.baseData === "caixa") {
      // PAGO entra pelo ano do PAGAMENTO; mas legado/manual pode ter status='pago'
      // SEM data_pagamento — nesse caso cai no fallback venc→competência→created_at
      // (em vez de SUMIR do ano). EM ABERTO segue por vencimento (fallback created_at).
      yearCond =
        `((e.status = 'pago' AND EXTRACT(year FROM COALESCE(e.data_pagamento::date, e.data_vencimento::date, e.data_competencia::date, e.created_at::date)) = $1) ` +
        `OR (e.status <> 'pago' AND EXTRACT(year FROM COALESCE(e.data_vencimento::date, e.data_competencia::date, e.created_at::date)) = $2))`;
      yearVals.push(input.ano, input.ano);
    } else {
      yearCond = `EXTRACT(year FROM COALESCE(e.data_vencimento::date, e.created_at::date)) = $1`;
      yearVals.push(input.ano);
    }

    const res = await dbExecute(db,
      `SELECT e.id, e.obra_id AS "obraId", e.obra_nome AS "obraNome", e.descricao,
              e.conta_id AS "contaId", e.conta_nome AS "contaNome",
              e.centro_custo_id AS "centroCustoId", e.centro_custo_nome AS "centroCustoNome",
              e.valor_previsto AS "valorPrevisto",
              e.valor_realizado AS "valorRealizado", e.status,
              e.data_vencimento AS "dataVencimento", e.data_pagamento AS "dataPagamento",
              e.data_competencia AS "dataCompetencia",
              e.forma_pagamento AS "formaPagamento",
              e.origem_modulo AS "origemModulo", e.origem_id AS "origemId",
              e.origem_descricao AS "origemDescricao",
              COALESCE(NULLIF(TRIM(e.fornecedor_nome), ''), co.fornecedor_nome) AS "fornecedorNome",
              e.anexo_url AS "anexoUrl", e.anexo_nome AS "anexoNome",
              e.conta_bancaria_id AS "contaBancariaId",
              e.tipo,
              co.modalidade_fd AS "modalidadeFd",
              CASE WHEN e.data_vencimento < CURRENT_DATE AND e.status != 'pago' THEN CURRENT_DATE - e.data_vencimento ELSE 0 END AS "diasAtraso"
       FROM financial_entries e
       LEFT JOIN compras_ordens co ON e.origem_modulo IN ('compras','compra_oc') AND co.id = e.origem_id AND co.company_id = e.company_id
       WHERE e.company_id IN (${inlineIds(ids)})
         AND e.tipo = 'despesa'
         AND e.status != 'cancelado'
         ${FINANCEIRO_SOMENTE_REAL ? `AND ${sqlNotProjecao("e.origem_modulo")}` : ""}
         AND ${yearCond}
       ORDER BY e.data_vencimento ASC NULLS LAST`,
      yearVals
    );

    // Rev. 4070 — carrega ciclos de fechamento configurados no cadastro do fornecedor
    // (empresas_terceiras.ciclo_*) e consolida os títulos em aberto por fornecedor+janela
    // de fechamento (ex.: Ferragens Santa Rita: cheque em até 5x/30d). Só afeta fornecedores
    // com ciclo configurado; os demais seguem individuais como sempre.
    const cycleRows = await dbExecute(db,
      `SELECT COALESCE(NULLIF(TRIM(nome_fantasia),''), TRIM(razao_social)) AS nome,
              ciclo_pagamento AS "cicloPagamento",
              ciclo_dia_fechamento AS "cicloDiaFechamento",
              ciclo_num_parcelas AS "cicloNumParcelas",
              ciclo_prazo_parcela AS "cicloPrazoParcela",
              ciclo_forma_pagamento AS "cicloFormaPagamento",
              ciclo_data_referencia AS "cicloDataReferencia"
         FROM empresas_terceiras
        WHERE "companyId" IN (${inlineIds(ids)}) AND deleted_at IS NULL
          AND ciclo_pagamento IS NOT NULL AND ciclo_pagamento <> 'avista'`,
      []);
    const supplierCycleMap = new Map<string, any>();
    for (const r of rows(cycleRows)) {
      if (r.nome) supplierCycleMap.set(_normNomeConc(String(r.nome)), r);
    }
    return _agruparContasPagarPorCicloForn(rows(res), supplierCycleMap);
  }),

  // Rev. 4082 — Lista os ciclos de fechamento configurados no cadastro dos fornecedores
  // (empresas_terceiras.ciclo_*), pra uso no "Lançar no ERP" da Conciliação Bancária:
  // ao lançar retroativamente um extrato de mês sem OS/OC pra um fornecedor com ciclo
  // configurado, sugere a forma de pagamento/parcelamento do cadastro (só SUGESTÃO —
  // usuário sempre pode ajustar; não altera nada, é só leitura do cadastro).
  getFornecedorCiclosConfig: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    includeAllGroup: z.boolean().optional(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    let ids = resolveCompanyIds(input);
    // Rev. 4082 — mesmo padrão do compras.listarFornecedores: expande p/ todas as
    // empresas do grupo acessíveis ao usuário (cadastro do fornecedor pode estar
    // em outra empresa do grupo FC).
    if (input.includeAllGroup) {
      const userCos = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (userCos.length > 0) {
        ids = userCos.map((c: any) => Number(c.id)).filter((n: number) => Number.isFinite(n));
      }
    }
    const cycleRows = await dbExecute(db,
      `SELECT COALESCE(NULLIF(TRIM(nome_fantasia),''), TRIM(razao_social)) AS nome,
              ciclo_pagamento AS "cicloPagamento",
              ciclo_dia_fechamento AS "cicloDiaFechamento",
              ciclo_num_parcelas AS "cicloNumParcelas",
              ciclo_prazo_parcela AS "cicloPrazoParcela",
              ciclo_forma_pagamento AS "cicloFormaPagamento",
              ciclo_data_referencia AS "cicloDataReferencia"
         FROM empresas_terceiras
        WHERE "companyId" IN (${inlineIds(ids)}) AND deleted_at IS NULL
          AND ciclo_pagamento IS NOT NULL AND ciclo_pagamento <> 'avista'`,
      []);
    return rows(cycleRows).filter((r: any) => r.nome);
  }),

  // ─────────── Rev. 1630 — Calendário Folha & Benefícios — 12 meses ───────────
  // Agrupa folha (real + projetada), encargos, VR/VA, 13º e PJ por mês de vencimento,
  // a partir do 1º dia do mês corrente até +12 meses. Usado pelo card "Calendário
  // Folha & Benefícios — 12 meses" no Contas a Pagar.
  // Tenant isolation: filtra company_id IN (...)
  getCalendarioFolha12m: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const ORIGENS_FOLHA = [
      "folha_rh", "folha_clt", "folha", "payroll_agregado", "fechamento_ponto",
      "folha_projetada",
    ];
    const ORIGENS_ENC = ["encargos_projetado", "guia_tributaria"];
    const ORIGENS_VR  = ["beneficio_vr", "beneficio_vr_projetado"];
    const ORIGENS_VA  = ["beneficio_va", "beneficio_va_projetado"];
    const ORIGENS_13  = ["decimo_terceiro_projetado"];
    const ORIGENS_PJ  = ["pj", "pagamento_pj", "pro_labore", "medicao_pj", "pj_projetado"];

    const arrSql = (xs: string[]) => `ARRAY[${xs.map(s => `'${s}'`).join(",")}]::text[]`;

    const res = await dbExecute(db,
      `SELECT
         TO_CHAR(date_trunc('month', COALESCE(data_vencimento, data_competencia)), 'YYYY-MM') AS mes,
         SUM(CASE WHEN origem_modulo = ANY(${arrSql(ORIGENS_FOLHA)}) THEN valor_previsto::numeric ELSE 0 END) AS folha,
         SUM(CASE WHEN origem_modulo = ANY(${arrSql(ORIGENS_ENC)})   THEN valor_previsto::numeric ELSE 0 END) AS encargos,
         SUM(CASE WHEN origem_modulo = ANY(${arrSql(ORIGENS_VR)})    THEN valor_previsto::numeric ELSE 0 END) AS vr,
         SUM(CASE WHEN origem_modulo = ANY(${arrSql(ORIGENS_VA)})    THEN valor_previsto::numeric ELSE 0 END) AS va,
         SUM(CASE WHEN origem_modulo = ANY(${arrSql(ORIGENS_13)})    THEN valor_previsto::numeric ELSE 0 END) AS decimo,
         SUM(CASE WHEN origem_modulo = ANY(${arrSql(ORIGENS_PJ)})    THEN valor_previsto::numeric ELSE 0 END) AS pj,
         SUM(CASE WHEN origem_modulo IN ('folha_rh','folha_clt','folha','payroll_agregado','fechamento_ponto') THEN 1 ELSE 0 END) AS folha_real_count,
         SUM(CASE WHEN origem_modulo IN ('folha_projetada') THEN 1 ELSE 0 END) AS folha_proj_count
       FROM financial_entries
       WHERE company_id IN (${inlineIds(ids)})
         AND tipo = 'despesa'
         AND status != 'cancelado'
         AND COALESCE(data_vencimento, data_competencia) >= date_trunc('month', CURRENT_DATE)
         AND COALESCE(data_vencimento, data_competencia) <  date_trunc('month', CURRENT_DATE) + INTERVAL '12 months'
         AND origem_modulo = ANY(${arrSql([...ORIGENS_FOLHA, ...ORIGENS_ENC, ...ORIGENS_VR, ...ORIGENS_VA, ...ORIGENS_13, ...ORIGENS_PJ])})
       GROUP BY 1
       ORDER BY 1 ASC`,
      []
    );
    const buckets = rows(res).map((r: any) => ({
      mes: r.mes as string,
      folha: parseFloat(r.folha ?? "0"),
      encargos: parseFloat(r.encargos ?? "0"),
      vr: parseFloat(r.vr ?? "0"),
      va: parseFloat(r.va ?? "0"),
      decimoTerceiro: parseFloat(r.decimo ?? "0"),
      pj: parseFloat(r.pj ?? "0"),
      folhaRealCount: parseInt(r.folha_real_count ?? "0", 10),
      folhaProjCount: parseInt(r.folha_proj_count ?? "0", 10),
      total:
        parseFloat(r.folha ?? "0") + parseFloat(r.encargos ?? "0") +
        parseFloat(r.vr ?? "0")    + parseFloat(r.va ?? "0") +
        parseFloat(r.decimo ?? "0")+ parseFloat(r.pj ?? "0"),
    }));
    return buckets;
  }),

  // Disparo manual da projeção (botão admin / cron externo)
  rerunPayrollProjection: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const { importFolhaProjecao } = await import("../services/payrollProjectionBridge");
    const inseridos = await importFolhaProjecao(input.companyId);
    return { ok: true, inseridos };
  }),

  // ─────────────────── FASE 5: KPIs FINANCEIROS ───────────────────

  getKpis: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    periodo: z.string().optional(),
  })).query(async ({ input }) => {
    try {
      const kpis = await calcularKpis(input.companyId, input.periodo);
      return kpis;
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao calcular KPIs" });
    }
  }),

  getDRE: protectedProcedure.input(z.object({
    companyId: z.number(),
    periodo: z.string(),
    tipoPeriodo: z.enum(["mensal", "trimestral", "semestral", "anual"]).default("mensal"),
  })).query(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    try {
      const dre = await calcularDRE(input.companyId, input.periodo, input.tipoPeriodo);
      return dre;
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao calcular DRE" });
    }
  }),

  // Detalhamento clicável (drill-down) de UMA linha do DRE — devolve os
  // lançamentos que compõem a linha + agrupamento por categoria. O total fecha
  // EXATAMENTE com a linha do DRE (mesmo predicado em financialKpiService).
  getDRELinhaDetalhe: protectedProcedure.input(z.object({
    companyId: z.number(),
    periodo: z.string(),
    tipoPeriodo: z.enum(["mensal", "trimestral", "semestral", "anual"]).default("mensal"),
    linha: z.enum([
      "receitaBruta", "receitasFinanceiras", "custosObra", "impostos",
      "despesasFinanceiras", "despesasFixas", "despesasVariaveis",
    ]),
  })).query(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    try {
      return await calcularDRELinhaDetalhe(input.companyId, input.periodo, input.tipoPeriodo, input.linha);
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao detalhar a linha do DRE" });
    }
  }),

  // Rev. 3952 — Compara o saldo bancário do período com o resultado do DRE.
  // Alimenta o card explicativo no DRE (leigos confundem prejuízo operacional
  // com saldo bancário positivo). Não usa a detecção de movimentação interna
  // porque ela cancela ao somar todas as contas: transfer A→B = +R$ em B, -R$ em A → líquido zero.
  getDREBankComparison: protectedProcedure.input(z.object({
    companyId: z.number(),
    periodo: z.string(),
    tipoPeriodo: z.enum(["mensal", "trimestral", "semestral", "anual"]).default("mensal"),
  })).query(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [mesIni, mesFim] = dreRange(input.periodo, input.tipoPeriodo);
    const dataInicio = `${mesIni}-01`;
    const [anoFim, mFim] = mesFim.split("-").map(Number);
    const dataFim = new Date(anoFim, mFim, 0).toISOString().slice(0, 10);
    const res = await dbExecute(db,
      `SELECT
         COALESCE(SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END), 0) AS entradas,
         COALESCE(SUM(CASE WHEN valor < 0 THEN ABS(valor) ELSE 0 END), 0) AS saidas
       FROM bank_statement_lines
       WHERE company_id=$1 AND data>=$2 AND data<=$3
         AND excluido_em IS NULL AND desconsiderado_em IS NULL`,
      [input.companyId, dataInicio, dataFim]
    );
    const row = (res as any[])[0] ?? {};
    return {
      bankEntradas: Number(row.entradas ?? 0),
      bankSaidas: Number(row.saidas ?? 0),
      bankSaldo: Number(row.entradas ?? 0) - Number(row.saidas ?? 0),
      dataInicio,
      dataFim,
    };
  }),

  // Rev. 3953 — Dados detalhados para a DFC (Demonstração do Fluxo de Caixa).
  // Retorna itens classificados como 'nao_operacional' (financiamentos) e 'investimento'
  // (CAPEX/amortizações) com detalhamento por conta + resumo de regime de competência.
  getDFCData: protectedProcedure.input(z.object({
    companyId: z.number(),
    periodo: z.string(),
    tipoPeriodo: z.enum(["mensal", "trimestral", "semestral", "anual"]).default("mensal"),
  })).query(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [mesIni, mesFim] = dreRange(input.periodo, input.tipoPeriodo);

    // Itens nao_operacional + investimento realizados (constam no banco; excluídos do DRE)
    // NOTA: dbExecute liga $N por ordem de aparição (left-to-right), NÃO pelo número.
    // Cada ocorrência de companyId precisa de um $N distinto (ver drizzle-execute-no-param-bind.md).
    const itensRes = await dbExecute(db, `
      WITH acct_class AS (
        SELECT id, classificacao_dre, nome FROM financial_accounts
        WHERE company_id=$1 AND classificacao_dre IN ('nao_operacional','investimento')
        UNION ALL
        SELECT fa.id, p.classificacao_dre, fa.nome FROM financial_accounts fa
        JOIN financial_accounts p ON fa.conta_pai_id=p.id AND p.company_id=$2
        WHERE fa.company_id=$3 AND fa.classificacao_dre IS NULL
          AND p.classificacao_dre IN ('nao_operacional','investimento')
        UNION ALL
        SELECT fa.id, gp.classificacao_dre, fa.nome FROM financial_accounts fa
        JOIN financial_accounts p ON fa.conta_pai_id=p.id AND p.company_id=$4
        JOIN financial_accounts gp ON p.conta_pai_id=gp.id AND gp.company_id=$5
        WHERE fa.company_id=$6 AND fa.classificacao_dre IS NULL AND p.classificacao_dre IS NULL
          AND gp.classificacao_dre IN ('nao_operacional','investimento')
      )
      SELECT
        COALESCE(ac.nome, fe.conta_nome, 'Sem categoria') AS conta_nome,
        fe.tipo,
        ac.classificacao_dre AS classificacao,
        ROUND(COALESCE(SUM(fe.valor_realizado),0)::numeric,2) AS total
      FROM financial_entries fe
      LEFT JOIN acct_class ac ON ac.id = fe.conta_id
      WHERE fe.company_id=$7
        AND fe.status NOT IN ('cancelado','estornado','a_pagar','a_receber','previsto')
        AND TO_CHAR(fe.data_competencia,'YYYY-MM') BETWEEN $8 AND $9
        AND (ac.classificacao_dre IN ('nao_operacional','investimento'))
      GROUP BY COALESCE(ac.nome, fe.conta_nome, 'Sem categoria'), fe.tipo, ac.classificacao_dre
      ORDER BY ac.classificacao_dre, fe.tipo DESC, total DESC
    `, [
      input.companyId, input.companyId, input.companyId,
      input.companyId, input.companyId, input.companyId,
      input.companyId, mesIni, mesFim,
    ]);

    // Regime de competência: lançamentos a_receber / a_pagar reconhecidos no período mas
    // ainda não movimentaram o banco (DRE NÃO os inclui; banco ainda NÃO os tem)
    const regimeRes = await dbExecute(db, `
      SELECT
        ROUND(COALESCE(SUM(valor_realizado) FILTER (WHERE tipo='receita' AND status='a_receber'),0)::numeric,2) AS receitas_a_receber,
        ROUND(COALESCE(SUM(valor_realizado) FILTER (WHERE tipo='despesa'  AND status='a_pagar'),0)::numeric,2) AS despesas_a_pagar
      FROM financial_entries
      WHERE company_id=$1
        AND status NOT IN ('cancelado','estornado')
        AND TO_CHAR(data_competencia,'YYYY-MM') BETWEEN $2 AND $3
    `, [input.companyId, mesIni, mesFim]);

    const regime = (regimeRes as any).rows?.[0] ?? (regimeRes as any[])[0] ?? {};
    return {
      itens: ((itensRes as any).rows ?? itensRes as any[]).map((r: any) => ({
        contaNome: String(r.conta_nome),
        tipo: String(r.tipo) as "receita" | "despesa",
        classificacao: String(r.classificacao) as "nao_operacional" | "investimento",
        total: Number(r.total),
      })),
      receitasAReceber: Number(regime.receitas_a_receber ?? 0),
      despesasAPagar: Number(regime.despesas_a_pagar ?? 0),
    };
  }),

  analiseDRE: protectedProcedure.input(z.object({
    companyId: z.number(),
    periodo: z.string(),
    tipoPeriodo: z.enum(["mensal", "trimestral", "semestral", "anual"]).default("mensal"),
  })).mutation(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    try {
      const { analisarDRE } = await import("../services/dreAnaliseIA");
      const result = await analisarDRE(input.companyId, input.periodo, input.tipoPeriodo);

      // Persiste a análise (fica salva até o usuário processar novamente).
      // Não grava quando o modelo falhou (modeloAusente) — evita "congelar" erro.
      if (!result.modeloAusente) {
        try {
          const db = await getDb();
          const nota = Number((result as any).nota ?? 0) || 0;
          const payload = JSON.stringify(result);
          const geradoPorNome = ctx.user?.name ?? ctx.user?.username ?? null;
          const geradoPorId = ctx.user?.id ?? null;
          // UPSERT atômico (sem DELETE) via ON CONFLICT no índice único
          // (company_id, periodo, tipo_periodo) — garante 1 análise por chave
          // mesmo sob concorrência (não há SELECT+INSERT em janela de corrida).
          await dbExecute(db,
            `INSERT INTO dre_analises_ia
               (company_id, periodo, tipo_periodo, nota, payload, gerado_em, gerado_por_id, gerado_por_nome)
             VALUES ($1,$2,$3,$4,$5::jsonb,NOW(),$6,$7)
             ON CONFLICT (company_id, periodo, tipo_periodo)
             DO UPDATE SET nota=EXCLUDED.nota, payload=EXCLUDED.payload, gerado_em=NOW(),
                           gerado_por_id=EXCLUDED.gerado_por_id, gerado_por_nome=EXCLUDED.gerado_por_nome`,
            [input.companyId, input.periodo, input.tipoPeriodo, nota, payload, geradoPorId, geradoPorNome]
          );
        } catch (persistErr: any) {
          // Persistência é best-effort: se falhar, ainda devolvemos a análise.
          console.warn("[analiseDRE] falha ao persistir:", persistErr?.message ?? persistErr);
        }
      }
      return result;
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao gerar análise do DRE" });
    }
  }),

  // Carrega a análise IA SALVA (se houver) para o período. Fica disponível
  // até o usuário mandar processar novamente (Rev. 2850).
  getAnaliseDRESalva: protectedProcedure.input(z.object({
    companyId: z.number(),
    periodo: z.string(),
    tipoPeriodo: z.enum(["mensal", "trimestral", "semestral", "anual"]).default("mensal"),
  })).query(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    try {
      const db = await getDb();
      const res = await dbExecute(db,
        `SELECT nota, payload, gerado_em, gerado_por_nome
           FROM dre_analises_ia
          WHERE company_id=$1 AND periodo=$2 AND tipo_periodo=$3
          ORDER BY gerado_em DESC LIMIT 1`,
        [input.companyId, input.periodo, input.tipoPeriodo]
      );
      const row = rows(res)[0];
      if (!row) return null;
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      const notaRaw = Number(row.nota ?? payload?.nota ?? 0);
      const notaSafe = Number.isFinite(notaRaw) ? Math.max(0, Math.min(100, Math.round(notaRaw))) : 0;
      return {
        ...payload,
        nota: notaSafe,
        geradoEm: row.gerado_em ?? payload?.geradoEm,
        geradoPorNome: row.gerado_por_nome ?? null,
        salva: true,
      };
    } catch (e: any) {
      // Tabela pode não existir ainda no primeiríssimo boot — devolve null.
      console.warn("[getAnaliseDRESalva]:", e?.message ?? e);
      return null;
    }
  }),

  getDREDisponibilidade: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.string().regex(/^\d{4}$/, "Ano deve ter 4 dígitos."),
  })).query(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    try {
      return await dreDisponibilidade(input.companyId, input.ano);
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao obter disponibilidade do DRE" });
    }
  }),

  // Rev. 4022 — Consolidação manual do mês no DRE (Financeiro > DRE), análoga à
  // consolidação de Ponto. NÃO trava/altera financial_entries — apenas grava o
  // "selo" de mês fechado que sobrepõe o status automático no seletor.
  getDREConsolidacaoStatus: protectedProcedure.input(z.object({
    companyId: z.number(),
    mesReferencia: z.string().regex(/^\d{4}-\d{2}$/, "mesReferencia deve ser YYYY-MM."),
  })).query(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = (await getDb())!;
    const res = await dbExecute(db,
      `SELECT status, consolidado_por, consolidado_em, desconsolidado_por, desconsolidado_em, observacoes
       FROM financial_dre_consolidacoes
       WHERE company_id = $1 AND mes_referencia = $2
       LIMIT 1`,
      [input.companyId, input.mesReferencia]
    );
    const row = rows(res)[0];
    if (!row) return { consolidado: false, consolidadoPor: null, consolidadoEm: null, observacoes: null };
    return {
      consolidado: row.status === 'consolidado',
      consolidadoPor: row.consolidado_por ?? null,
      consolidadoEm: row.consolidado_em ?? null,
      observacoes: row.observacoes ?? null,
    };
  }),

  consolidarDRE: protectedProcedure.input(z.object({
    companyId: z.number(),
    mesReferencia: z.string().regex(/^\d{4}-\d{2}$/, "mesReferencia deve ser YYYY-MM."),
    observacoes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = (await getDb())!;
    const nomeUsuario = ctx.user?.name || 'Financeiro';
    await dbExecute(db,
      `INSERT INTO financial_dre_consolidacoes
         (company_id, mes_referencia, status, consolidado_por, consolidado_em, observacoes, updated_at)
       VALUES ($1, $2, 'consolidado', $3, NOW(), $4, NOW())
       ON CONFLICT (company_id, mes_referencia) DO UPDATE SET
         status = 'consolidado',
         consolidado_por = $5,
         consolidado_em = NOW(),
         observacoes = $6,
         updated_at = NOW()`,
      [input.companyId, input.mesReferencia, nomeUsuario, input.observacoes || null, nomeUsuario, input.observacoes || null]
    );
    return { success: true, consolidadoPor: nomeUsuario };
  }),

  desconsolidarDRE: protectedProcedure.input(z.object({
    companyId: z.number(),
    mesReferencia: z.string().regex(/^\d{4}-\d{2}$/, "mesReferencia deve ser YYYY-MM."),
  })).mutation(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    // Mesma verificação robusta usada em Ponto: admin_master, admin ou owner.
    const userRole = (ctx.user.role || '').toString().trim().toLowerCase();
    const isOwner = ctx.user.openId === process.env.OWNER_OPEN_ID;
    const isAdmin = userRole.includes('admin');
    if (!isAdmin && !isOwner) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `Apenas administradores podem desconsolidar um mês do DRE. Seu perfil atual: ${userRole || 'desconhecido'}.` });
    }
    const db = (await getDb())!;
    await dbExecute(db,
      `UPDATE financial_dre_consolidacoes
       SET status = 'aberto', desconsolidado_por = $3, desconsolidado_em = NOW(), updated_at = NOW()
       WHERE company_id = $1 AND mes_referencia = $2`,
      [input.companyId, input.mesReferencia, ctx.user?.name || 'Admin']
    );
    return { success: true };
  }),

  getFluxoCaixa: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input }) => {
    try {
      const fluxo = await projetarFluxoCaixa90Dias(input.companyId);
      return fluxo;
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao projetar fluxo de caixa" });
    }
  }),

  getCashFlow: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
    agrupamento: z.enum(["dia", "semana", "mes", "ano"]).default("dia"),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { companyId, dataInicio, dataFim, agrupamento } = input;

    // Build grouping expression — all label expressions derive from groupExpr so GROUP BY is clean
    let groupExpr: string;
    let labelExpr: string;
    if (agrupamento === "dia") {
      groupExpr = "data_vencimento::date";
      labelExpr = "TO_CHAR(data_vencimento::date, 'DD/MM/YYYY')";
    } else if (agrupamento === "semana") {
      groupExpr = "DATE_TRUNC('week', data_vencimento)";
      labelExpr = "TO_CHAR(DATE_TRUNC('week', data_vencimento), 'DD/MM/YYYY') || ' – ' || TO_CHAR(DATE_TRUNC('week', data_vencimento) + INTERVAL '6 days', 'DD/MM/YYYY')";
    } else if (agrupamento === "mes") {
      groupExpr = "DATE_TRUNC('month', data_vencimento)";
      labelExpr = "TO_CHAR(DATE_TRUNC('month', data_vencimento), 'MM/YYYY')";
    } else {
      groupExpr = "DATE_TRUNC('year', data_vencimento)";
      labelExpr = "TO_CHAR(DATE_TRUNC('year', data_vencimento), 'YYYY')";
    }

    const summaryRes = await dbExecute(db,
      `SELECT
         ${groupExpr} AS periodo_key,
         ${labelExpr} AS periodo_label,
         COALESCE(SUM(CASE WHEN tipo='receita' AND status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END), 0) AS entradas_realizadas,
         COALESCE(SUM(CASE WHEN tipo='despesa' AND status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END), 0) AS saidas_realizadas,
         COALESCE(SUM(CASE WHEN tipo='receita' AND status NOT IN ('cancelado','pago','recebido') THEN valor_previsto ELSE 0 END), 0) AS entradas_previstas,
         COALESCE(SUM(CASE WHEN tipo='despesa' AND status NOT IN ('cancelado','pago','recebido') THEN valor_previsto ELSE 0 END), 0) AS saidas_previstas
       FROM financial_entries
       WHERE company_id=$1
         AND status != 'cancelado'
         AND data_vencimento IS NOT NULL
         AND data_vencimento::date BETWEEN $2::date AND $3::date
       GROUP BY ${groupExpr}
       ORDER BY periodo_key`,
      [companyId, dataInicio, dataFim]
    );

    const periodos = rows(summaryRes);

    // Build totals
    let saldoAcumuladoRealizado = 0;
    let saldoAcumuladoTotal = 0;

    const result = periodos.map((p: any) => {
      const entR = parseFloat(p.entradas_realizadas ?? 0);
      const saiR = parseFloat(p.saidas_realizadas ?? 0);
      const entP = parseFloat(p.entradas_previstas ?? 0);
      const saiP = parseFloat(p.saidas_previstas ?? 0);
      saldoAcumuladoRealizado += entR - saiR;
      saldoAcumuladoTotal += (entR + entP) - (saiR + saiP);

      return {
        periodoKey: p.periodo_key,
        periodoLabel: p.periodo_label,
        entradasRealizadas: entR,
        saidasRealizadas: saiR,
        entradasPrevistas: entP,
        saidasPrevistas: saiP,
        saldoLiquidoRealizado: entR - saiR,
        saldoLiquidoPrevisto: entP - saiP,
        saldoAcumuladoRealizado,
        saldoAcumuladoTotal,
      };
    });

    const totais = result.reduce((acc: any, p: any) => {
      acc.entradasRealizadas += p.entradasRealizadas;
      acc.saidasRealizadas += p.saidasRealizadas;
      acc.entradasPrevistas += p.entradasPrevistas;
      acc.saidasPrevistas += p.saidasPrevistas;
      return acc;
    }, { entradasRealizadas: 0, saidasRealizadas: 0, entradasPrevistas: 0, saidasPrevistas: 0 });

    return { periodos: result, totais };
  }),

  // Rev. 2944 — SUPERSEDED: o Fluxo de Caixa agora compõe getContasReceberMatrix
  // (receitas) + getContasAPagarByYear (despesas) no front, garantindo paridade 1:1
  // com os módulos irmãos. Procedure mantido por compatibilidade (sem callers ativos).
  getCashFlowMatrix: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { companyId, ano } = input;

    // Query all relevant entries for the year, grouped by month + origem_modulo + tipo + status category
    const res = await dbExecute(db,
      `SELECT
         EXTRACT(MONTH FROM data_competencia)::integer AS mes,
         COALESCE(origem_modulo, 'outros') AS origem_modulo,
         tipo,
         CASE WHEN status IN ('pago','recebido') THEN 'realizado' ELSE 'previsto' END AS categoria,
         SUM(CASE WHEN status IN ('pago','recebido')
             THEN COALESCE(valor_realizado, valor_previsto)
             ELSE valor_previsto END
         )::numeric AS valor
       FROM financial_entries
       WHERE company_id=$1
         AND EXTRACT(YEAR FROM data_competencia)=$2
         AND status NOT IN ('cancelado')
         AND tipo <> 'transferencia'
         AND data_competencia IS NOT NULL
       GROUP BY mes, origem_modulo, tipo, categoria
       ORDER BY mes`,
      [companyId, ano]
    );

    const rawRows = rows(res);

    // Categorize origins into display groups
    function categorizeOrigem(origem: string, tipo: string): string {
      if (tipo === "receita") {
        if (["revenue", "receita"].includes(origem)) return "faturamento";
        if (["planejamento_medicao", "obra_previsto"].includes(origem)) return "medicao_prevista";
        if (["cronograma_receita"].includes(origem)) return "cronograma_receita";
        if (["cronograma_receita_baseline"].includes(origem)) return "cronograma_baseline";
        return "receita_outros";
      } else {
        if (origem === "folha_clt") return "folha";
        if (origem === "compras") return "compras";
        if (["frotas", "frota_manutencao"].includes(origem)) return "frota";
        if (origem === "cronograma_atividade") return "obras";
        if (origem === "recorrente") return "recorrente";
        if (origem === "terceiro_medicao") return "terceiros";
        return "outros";
      }
    }

    // Build a month → category → { realizado, previsto } map
    type CatData = { realizado: number; previsto: number };
    type MesData = Record<string, CatData>;
    const matrix: Record<number, MesData> = {};
    for (let m = 1; m <= 12; m++) {
      matrix[m] = {};
    }

    for (const row of rawRows) {
      const mes = parseInt(row.mes);
      const grupo = categorizeOrigem(row.origem_modulo, row.tipo);
      const valor = parseFloat(row.valor ?? "0");
      if (!matrix[mes][grupo]) matrix[mes][grupo] = { realizado: 0, previsto: 0 };
      if (row.categoria === "realizado") matrix[mes][grupo].realizado += valor;
      else matrix[mes][grupo].previsto += valor;
    }

    // Build per-month summary
    const RECEITA_CATS = ["faturamento", "medicao_prevista", "cronograma_receita", "cronograma_baseline", "receita_outros"];
    const DESPESA_CATS = ["folha", "compras", "frota", "obras", "terceiros", "recorrente", "outros"];

    const meses: any[] = [];
    let saldoAcum = 0;

    for (let m = 1; m <= 12; m++) {
      const md = matrix[m];
      const receitaRealizada = RECEITA_CATS.reduce((s, c) => s + (md[c]?.realizado ?? 0), 0);
      const receitaPrevista  = RECEITA_CATS.reduce((s, c) => s + (md[c]?.previsto ?? 0), 0);
      const despesaRealizada = DESPESA_CATS.reduce((s, c) => s + (md[c]?.realizado ?? 0), 0);
      const despesaPrevista  = DESPESA_CATS.reduce((s, c) => s + (md[c]?.previsto ?? 0), 0);

      const totalReceitas = receitaRealizada + receitaPrevista;
      const totalDespesas = despesaRealizada + despesaPrevista;
      const resultado = totalReceitas - totalDespesas;
      saldoAcum += resultado;

      meses.push({
        mes: m,
        receitaRealizada,
        receitaPrevista,
        totalReceitas,
        despesaRealizada,
        despesaPrevista,
        totalDespesas,
        resultado,
        saldoAcumulado: saldoAcum,
        lucratividade: totalReceitas > 0 ? (resultado / totalReceitas) * 100 : 0,
        detalhe: {
          // receitas
          faturamento: md.faturamento ?? { realizado: 0, previsto: 0 },
          medicao_prevista: md.medicao_prevista ?? { realizado: 0, previsto: 0 },
          cronograma_receita: md.cronograma_receita ?? { realizado: 0, previsto: 0 },
          receita_outros: md.receita_outros ?? { realizado: 0, previsto: 0 },
          // despesas
          folha: md.folha ?? { realizado: 0, previsto: 0 },
          compras: md.compras ?? { realizado: 0, previsto: 0 },
          frota: md.frota ?? { realizado: 0, previsto: 0 },
          obras: md.obras ?? { realizado: 0, previsto: 0 },
          terceiros: md.terceiros ?? { realizado: 0, previsto: 0 },
          recorrente: md.recorrente ?? { realizado: 0, previsto: 0 },
          outros: md.outros ?? { realizado: 0, previsto: 0 },
        },
      });
    }

    return { ano, meses };
  }),

  getEFDReinf: protectedProcedure.input(z.object({
    companyId: z.number(),
    mesRef: z.string(),
  })).query(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    try {
      const efd = await gerarEFDReinf(input.companyId, input.mesRef);
      return efd;
    } catch (e: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e?.message ?? "Erro ao gerar EFD-REINF" });
    }
  }),

  getKpiPorObra: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number(),
    periodo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const mes = input.periodo ?? new Date().toISOString().slice(0, 7);
    const res = await dbExecute(db, 
      `SELECT tipo,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelado') THEN valor_previsto ELSE 0 END), 0) AS previsto,
              COALESCE(SUM(CASE WHEN status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END), 0) AS realizado,
              COUNT(*) AS qtd
       FROM financial_entries
       WHERE company_id=$1 AND obra_id=$2
         AND TO_CHAR(data_competencia,'YYYY-MM')=$3
         AND status NOT IN ('cancelado')
       GROUP BY tipo`,
      [input.companyId, input.obraId, mes]
    );
    const linhas = rows(res);
    const rec = linhas.find((l: any) => l.tipo === "receita") ?? { previsto: "0", realizado: "0" };
    const desp = linhas.find((l: any) => l.tipo === "despesa") ?? { previsto: "0", realizado: "0" };
    const receitaPrev = parseFloat(rec.previsto);
    const despesaPrev = parseFloat(desp.previsto);
    const margem = receitaPrev - despesaPrev;
    return {
      obraId: input.obraId,
      periodo: mes,
      receitaPrevista: receitaPrev,
      receitaRealizada: parseFloat(rec.realizado),
      despesaPrevista: despesaPrev,
      despesaRealizada: parseFloat(desp.realizado),
      margem,
      margemPct: receitaPrev > 0 ? (margem / receitaPrev) * 100 : 0,
    };
  }),

  // ─────────────────── FASE 4: ALERTAS E APROVAÇÕES ───────────────────

  getAlerts: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    nivel: z.string().optional(),
    resolvido: z.boolean().optional(),
    tipo: z.string().optional(),
    limit: z.number().default(50),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const conds: string[] = [`company_id IN (${inlineIds(ids)})`];
    const vals: any[] = [];
    let i = 1;
    if (input.nivel) { conds.push(`nivel=$${i++}`); vals.push(input.nivel); }
    if (input.resolvido !== undefined) { conds.push(`resolvido=$${i++}`); vals.push(input.resolvido ? 1 : 0); }
    if (input.tipo) { conds.push(`tipo=$${i++}`); vals.push(input.tipo); }
    vals.push(input.limit);
    const res = await dbExecute(db, 
      `SELECT id, company_id AS "companyId", entry_id AS "entryId", revenue_id AS "revenueId",
              tipo, nivel, titulo, descricao, valor_referencia AS "valorReferencia",
              data_referencia AS "dataReferencia", responsavel_nome AS "responsavelNome",
              lido, lido_em AS "lidoEm", resolvido, resolvido_em AS "resolvidoEm",
              origem_modulo AS "origemModulo", origem_id AS "origemId",
              created_at AS "createdAt"
       FROM financial_revision_alerts
       WHERE ${conds.join(" AND ")}
       ORDER BY CASE nivel WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC
       LIMIT $${i}`,
      vals
    );
    return rows(res);
  }),

  resolveAlert: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db, 
      `UPDATE financial_revision_alerts
       SET resolvido=1, resolvido_em=NOW(), resolvido_por_nome=$1 WHERE id=$2 AND company_id=$3`,
      [ctx.user?.name ?? "Sistema", input.id, input.companyId]
    );
    return { ok: true };
  }),

  gerarAlertasVencimento: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const gerados = await gerarAlertasVencimento(input.companyId);
    return { gerados };
  }),

  getApprovals: protectedProcedure.input(z.object({
    companyId: z.number(),
    status: z.string().optional(),
    nivel: z.string().optional(),
    limit: z.number().default(50),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conds: string[] = [`company_id=$1`];
    const vals: any[] = [input.companyId];
    let i = 2;
    if (input.status) { conds.push(`status=$${i++}`); vals.push(input.status); }
    if (input.nivel) { conds.push(`nivel=$${i++}`); vals.push(input.nivel); }
    vals.push(input.limit);
    const res = await dbExecute(db, 
      `SELECT id, entry_id AS "entryId", valor, nivel, status,
              solicitante_nome AS "solicitanteNome", aprovador_nome AS "aprovadorNome",
              motivo_recusa AS "motivoRecusa", created_at AS "createdAt", resolvido_em AS "resolvidoEm"
       FROM financial_payment_approvals
       WHERE ${conds.join(" AND ")} ORDER BY created_at DESC LIMIT $${i}`,
      vals
    );
    return rows(res);
  }),

  resolveApproval: protectedProcedure.input(z.object({
    id: z.number(),
    companyId: z.number(),
    status: z.enum(["aprovado", "recusado"]),
    motivoRecusa: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await dbExecute(db, 
      `UPDATE financial_payment_approvals
       SET status=$1, aprovador_id=$2, aprovador_nome=$3, motivo_recusa=$4, resolvido_em=NOW()
       WHERE id=$5 AND company_id=$6`,
      [input.status, ctx.user?.id ?? null, ctx.user?.name ?? "Sistema",
       input.motivoRecusa ?? null, input.id, input.companyId]
    );
    await createAuditLog({ action: "financial_approval_resolved", userId: ctx.user?.id, companyId: input.companyId, details: `Aprovação ${input.id} → ${input.status}` });
    return { ok: true };
  }),

  verificarImpacto: protectedProcedure.input(z.object({
    companyId: z.number(),
    origemModulo: z.string(),
    origemId: z.number(),
  })).query(async ({ input }) => {
    return verificarImpactoFinanceiro(input.companyId, input.origemModulo, input.origemId);
  }),

  rollbackOrigem: protectedProcedure.input(z.object({
    companyId: z.number(),
    origemModulo: z.string(),
    origemId: z.number(),
    motivo: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const cancelados = await rollbackFinanceiroPorOrigem(input.companyId, input.origemModulo, input.origemId, input.motivo);
    await createAuditLog({ action: "financial_rollback", userId: ctx.user?.id, companyId: input.companyId, details: `Rollback ${input.origemModulo}#${input.origemId}: ${cancelados} entries cancelados — ${input.motivo}` });
    return { cancelados };
  }),

  sincronizarStatus: protectedProcedure.input(z.object({
    companyId: z.number(),
    entryId: z.number(),
    novoStatus: z.string(),
    dataPagamento: z.string().optional(),
    valorRealizado: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    await sincronizarStatusPagamento(input.companyId, input.entryId, input.novoStatus, input.dataPagamento, input.valorRealizado);
    await createAuditLog({ action: "financial_status_sync", userId: ctx.user?.id, companyId: input.companyId, details: `Entry ${input.entryId} → ${input.novoStatus}` });
    return { ok: true };
  }),

  // ─────────────────── FASE 6: RETROAÇÃO HISTÓRICA ───────────────────

  retroacaoHistorica: protectedProcedure.input(z.object({
    companyId: z.number(),
    meses: z.number().min(1).max(24).default(6),
  })).mutation(async ({ input, ctx }) => {
    const { runAllAutoImports: autoImport } = await import("../services/financialAutoImport");
    const { runAllDespesasImport: despImport, runAllReceitasImport: recImport } = await import("../services/financialIntegrationBridge");

    let totalImportado = 0;
    const resultados: Record<string, number> = {};

    const hoje = new Date();
    for (let i = 0; i < input.meses; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      const [r1, r2] = await Promise.all([
        autoImport(input.companyId, mes).catch(() => ({ folha: 0, pj: 0, parceiros: 0 })),
        despImport(input.companyId, mes).catch(() => 0),
      ]);
      const r3 = await recImport(input.companyId, mes).catch(() => 0);

      const sub = r1.folha + r1.pj + r1.parceiros + (r2 as number) + r3;
      resultados[mes] = sub;
      totalImportado += sub;
    }

    await createAuditLog({
      action: "financial_retroacao",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Retroação ${input.meses} meses: ${totalImportado} lançamentos importados`,
    });

    return { totalImportado, resultados };
  }),

  // ─────────────────── IMPORTAÇÃO MANUAL ───────────────────

  importarAgora: protectedProcedure.input(z.object({
    companyId: z.number(),
    mesRef: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const mes = input.mesRef ?? new Date().toISOString().slice(0, 7);
    const { runAllAutoImports: autoImport } = await import("../services/financialAutoImport");
    const { runAllDespesasImport: despImport, runAllReceitasImport: recImport } = await import("../services/financialIntegrationBridge");

    const [r1, r2, r3] = await Promise.all([
      autoImport(input.companyId, mes).catch(() => ({ folha: 0, pj: 0, parceiros: 0 })),
      despImport(input.companyId, mes).catch(() => 0),
      recImport(input.companyId, mes).catch(() => 0),
    ]);

    const totalImportado = r1.folha + r1.pj + r1.parceiros + (r2 as number) + (r3 as number);

    await createAuditLog({
      action: "financial_import_manual",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Importação manual ${mes}: folha=${r1.folha} pj=${r1.pj} parceiros=${r1.parceiros} despesas=${r2} receitas=${r3} TOTAL=${totalImportado}`,
    });

    return {
      totalImportado,
      folha: r1.folha,
      pj: r1.pj,
      parceiros: r1.parceiros,
      despesas: r2 as number,
      receitas: r3 as number,
    };
  }),

  // ─────────────────── RESUMO POR MÓDULO ORIGEM ───────────────────

  getResumoModulos: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    periodo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const mes = input.periodo ?? new Date().toISOString().slice(0, 7);
    const res = await dbExecute(db, 
      `SELECT origem_modulo AS "origemModulo", tipo,
              COUNT(*) AS qtd,
              COALESCE(SUM(valor_previsto), 0) AS total_previsto,
              COALESCE(SUM(CASE WHEN status IN ('pago','recebido') THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END), 0) AS total_realizado,
              COALESCE(SUM(CASE WHEN status='a_pagar' OR status='a_receber' THEN valor_previsto ELSE 0 END), 0) AS total_pendente
       FROM financial_entries
       WHERE company_id IN (${inlineIds(ids)})
                  AND TO_CHAR(data_competencia,'YYYY-MM')=         
                  AND status NOT IN ('cancelado')
                  AND origem_modulo IS NOT NULL
                GROUP BY origem_modulo, tipo
                ORDER BY total_previsto DESC`,
      [mes]
    );
    return rows(res);
  }),

  // ─────────────────── LOG DE IMPORTAÇÃO ───────────────────

  getImportLog: protectedProcedure.input(z.object({
    companyId: z.number(),
    limit: z.number().default(100),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const res = await dbExecute(db, 
      `SELECT id, origem_modulo AS "origemModulo", mes_referencia AS "mesReferencia",
              total_importados AS "totalImportados", total_erros AS "totalErros",
              detalhes, executado_em AS "executadoEm"
       FROM financial_import_log
       WHERE company_id=$1
       ORDER BY executado_em DESC LIMIT $2`,
      [input.companyId, input.limit]
    );
    return rows(res);
  }),

  // ─────────────────── INDICADORES RÁPIDOS (para cards do dashboard) ───────────────────

  getIndicadores: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    periodo: z.string().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const mes = input.periodo ?? new Date().toISOString().slice(0, 7);

    const [recRes, despRes, alertRes, vencRes, tributosRes, aprovRes] = await Promise.all([
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='receita' AND TO_CHAR(data_competencia,'YYYY-MM')=$1 AND status NOT IN ('cancelado')`, [mes]),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND tipo='despesa' AND TO_CHAR(data_competencia,'YYYY-MM')=$1 AND status NOT IN ('cancelado')`, [mes]),
      dbExecute(db, `SELECT COUNT(*) AS total FROM financial_revision_alerts WHERE company_id IN (${inlineIds(ids)}) AND resolvido=0`, []),
      dbExecute(db, `SELECT COALESCE(SUM(valor_previsto),0) AS total FROM financial_entries WHERE company_id IN (${inlineIds(ids)}) AND status IN ('a_pagar','a_receber') AND data_vencimento < CURRENT_DATE`, []),
      dbExecute(db, `SELECT COALESCE(SUM(valor_total),0) AS total FROM financial_tax_obligations WHERE company_id IN (${inlineIds(ids)}) AND mes_competencia=$1 AND status='a_pagar'`, [mes]),
      dbExecute(db, `SELECT COUNT(*) AS total FROM financial_payment_approvals WHERE company_id IN (${inlineIds(ids)}) AND status='pendente'`, []),
    ]);

    const receita = parseFloat(rows(recRes)[0]?.total ?? "0");
    const despesa = parseFloat(rows(despRes)[0]?.total ?? "0");
    const alertas = parseInt(rows(alertRes)[0]?.total ?? "0");
    const vencidos = parseFloat(rows(vencRes)[0]?.total ?? "0");
    const tributos = parseFloat(rows(tributosRes)[0]?.total ?? "0");
    const aprovacoespendentes = parseInt(rows(aprovRes)[0]?.total ?? "0");

    return {
      receita,
      despesa,
      resultado: receita - despesa,
      margemPct: receita > 0 ? ((receita - despesa) / receita) * 100 : 0,
      alertas,
      vencidos,
      tributos,
      aprovacoespendentes,
      periodo: mes,
    };
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // Cronograma Financeiro — projeção mensal de receitas e despesas por obra
  // ─────────────────────────────────────────────────────────────────────────
  getCronogramaFinanceiro: protectedProcedure.input(z.object({
    companyId: z.number(),
    obraId: z.number().optional(),
  })).query(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) return { meses: [], obras: [], totais: null };

    const { companyId, obraId } = input;
    const obraClauseProj = obraId ? `AND pp.obra_id = ${Number(obraId)}` : "";

    const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
    const monthsBetween = (ini: string, fim: string): string[] => {
      const [iy, im] = (ini ?? "").split("-").map(Number);
      const [fy, fm] = (fim ?? "").split("-").map(Number);
      if (!iy || !im || !fy || !fm) return [];
      const out: string[] = [];
      let y = iy, m = im;
      while (y < fy || (y === fy && m <= fm)) {
        out.push(`${y}-${String(m).padStart(2, "0")}`);
        m++; if (m > 12) { m = 1; y++; }
        if (out.length > 120) break;
      }
      return out;
    };

    // ── 1. Projetos + valor de VENDA e CUSTO do orçamento (fonte da verdade) ──
    // Venda = valor de contrato/negociado/totalVenda; Custo = totalCusto do orçamento.
    // Revisão escolhida: a mais recente APROVADA; senão a mais recente qualquer.
    const { rows: projetos } = await dbExecute(db,
      `SELECT pp.id AS projeto_id, pp.obra_id, o.nome AS obra_nome,
              COALESCE(
                NULLIF(pp.valor_contrato::numeric, 0),
                orc_d.valor_negociado::numeric,
                orc_d."totalVenda"::numeric,
                orc_o.valor_negociado::numeric,
                orc_o."totalVenda"::numeric,
                0
              ) AS venda,
              COALESCE(orc_d."totalCusto"::numeric, orc_o."totalCusto"::numeric, 0) AS custo,
              rev.revisao_id
       FROM planejamento_projetos pp
       JOIN obras o ON o.id = pp.obra_id
       LEFT JOIN orcamentos orc_d ON orc_d.id = pp.orcamento_id AND orc_d.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT valor_negociado, "totalVenda", "totalCusto"
         FROM orcamentos
         WHERE "obraId" = pp.obra_id AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1
       ) orc_o ON true
       LEFT JOIN LATERAL (
         SELECT id AS revisao_id
         FROM planejamento_revisoes
         WHERE projeto_id = pp.id
         ORDER BY (CASE WHEN status = 'aprovada' THEN 0 ELSE 1 END), numero DESC
         LIMIT 1
       ) rev ON true
       WHERE pp.company_id = $1
         AND o."deletedAt" IS NULL
         ${obraClauseProj}`,
      [companyId]
    );

    const revisaoIds = projetos.map((p: any) => Number(p.revisao_id)).filter(Boolean);

    // ── 2. Atividades-folha das revisões escolhidas (peso + janela de meses) ──
    let atividades: any[] = [];
    if (revisaoIds.length > 0) {
      const { rows } = await dbExecute(db,
        `SELECT a.revisao_id,
                a.peso_financeiro::numeric AS peso,
                TO_CHAR(a.data_inicio, 'YYYY-MM') AS ini_mes,
                TO_CHAR(a.data_fim, 'YYYY-MM') AS fim_mes
         FROM planejamento_atividades a
         WHERE a.revisao_id IN (${revisaoIds.join(",")})
           AND a.is_grupo = false
           AND a.disabled = false
           AND a.data_inicio IS NOT NULL
           AND a.data_fim IS NOT NULL`,
        []
      );
      atividades = rows;
    }

    // Agrupa atividades por revisão e soma os pesos (para NORMALIZAR a 100%).
    const ativPorRev = new Map<number, any[]>();
    const somaPesoRev = new Map<number, number>();
    for (const a of atividades) {
      const rid = Number(a.revisao_id);
      if (!ativPorRev.has(rid)) ativPorRev.set(rid, []);
      ativPorRev.get(rid)!.push(a);
      somaPesoRev.set(rid, (somaPesoRev.get(rid) ?? 0) + parseFloat(a.peso ?? "0"));
    }

    // ── 3. Distribui venda/custo por mês, por obra — sem perder centavos ──────
    // Para cada projeto: fração = peso / Σpeso (normaliza p/ 100%); distribui
    // igualmente entre os meses da atividade; arredonda por mês e joga o resto
    // no último mês do projeto → total por obra = orçamento EXATO (à vírgula).
    type MesAgg = { receitaPrevista: number; custoPrevisto: number; receitaRealizada: number; custoRealizado: number };
    const mesesMap = new Map<string, MesAgg>();
    const getMes = (k: string): MesAgg => {
      if (!mesesMap.has(k)) mesesMap.set(k, { receitaPrevista: 0, custoPrevisto: 0, receitaRealizada: 0, custoRealizado: 0 });
      return mesesMap.get(k)!;
    };
    const obrasMap = new Map<number, { obraId: number; obraNome: string; totalReceita: number; totalCusto: number }>();
    const getObra = (id: number, nome: string) => {
      if (!obrasMap.has(id)) obrasMap.set(id, { obraId: id, obraNome: nome ?? `Obra ${id}`, totalReceita: 0, totalCusto: 0 });
      return obrasMap.get(id)!;
    };

    for (const proj of projetos) {
      const rid = Number(proj.revisao_id);
      const venda = parseFloat(proj.venda ?? "0");
      const custo = parseFloat(proj.custo ?? "0");
      const ativs = ativPorRev.get(rid) ?? [];
      const somaPeso = somaPesoRev.get(rid) ?? 0;
      if (ativs.length === 0 || somaPeso <= 0 || (venda <= 0 && custo <= 0)) continue;

      // floats por mês (deste projeto)
      const vendaMes = new Map<string, number>();
      const custoMes = new Map<string, number>();
      for (const at of ativs) {
        const peso = parseFloat(at.peso ?? "0");
        if (peso <= 0) continue;
        const frac = peso / somaPeso; // normaliza: Σfrac = 1 → total = venda/custo exatos
        const meses = monthsBetween(at.ini_mes, at.fim_mes);
        if (meses.length === 0) continue;
        const vM = (venda * frac) / meses.length;
        const cM = (custo * frac) / meses.length;
        for (const m of meses) {
          vendaMes.set(m, (vendaMes.get(m) ?? 0) + vM);
          custoMes.set(m, (custoMes.get(m) ?? 0) + cM);
        }
      }

      // arredonda por mês + carrega o resto no último mês (cronológico)
      const monthKeys = [...new Set([...vendaMes.keys(), ...custoMes.keys()])].sort();
      if (monthKeys.length === 0) continue;
      const lastK = monthKeys[monthKeys.length - 1];
      let accV = 0, accC = 0;
      const roundedV = new Map<string, number>();
      const roundedC = new Map<string, number>();
      for (const m of monthKeys) {
        const rv = r2(vendaMes.get(m) ?? 0);
        const rc = r2(custoMes.get(m) ?? 0);
        roundedV.set(m, rv); accV += rv;
        roundedC.set(m, rc); accC += rc;
      }
      roundedV.set(lastK, r2((roundedV.get(lastK) ?? 0) + (r2(venda) - r2(accV))));
      roundedC.set(lastK, r2((roundedC.get(lastK) ?? 0) + (r2(custo) - r2(accC))));

      const obraAgg = getObra(Number(proj.obra_id), proj.obra_nome);
      for (const m of monthKeys) {
        const cell = getMes(m);
        const rv = roundedV.get(m) ?? 0;
        const rc = roundedC.get(m) ?? 0;
        cell.receitaPrevista += rv;
        cell.custoPrevisto += rc;
        obraAgg.totalReceita += rv;
        obraAgg.totalCusto += rc;
      }
    }

    // ── 4. REALIZADO (execução real) ─────────────────────────────────────────
    // Receita realizada = medições efetivamente medidas (planejamento_medicoes).
    // Custo realizado    = despesas reais PAGAS por obra, EXCLUINDO a projeção
    //   do cronograma (origem_modulo='cronograma_atividade'), p/ não duplicar.
    const { rows: medReal } = await dbExecute(db,
      `SELECT TO_CHAR(pm.competencia, 'YYYY-MM') AS mes, pp.obra_id,
              SUM(pm.valor_medido::numeric) AS v
       FROM planejamento_medicoes pm
       JOIN planejamento_projetos pp ON pp.id = pm.projeto_id
       WHERE pp.company_id = $1
         AND pm.status NOT IN ('cancelada','rejeitada')
         AND COALESCE(pm.valor_medido::numeric, 0) > 0
         ${obraId ? `AND pp.obra_id = ${Number(obraId)}` : ""}
       GROUP BY mes, pp.obra_id`,
      [companyId]
    );
    for (const r of medReal) {
      const m = String(r.mes);
      if (!m || m.length < 7) continue;
      getMes(m).receitaRealizada += parseFloat(r.v ?? "0");
    }

    const { rows: custoRealRows } = await dbExecute(db,
      `SELECT TO_CHAR(fe.data_competencia, 'YYYY-MM') AS mes,
              SUM(COALESCE(fe.valor_realizado::numeric, fe.valor_previsto::numeric, 0)) AS v
       FROM financial_entries fe
       WHERE fe.company_id = $1
         AND fe.tipo = 'despesa'
         AND fe.status = 'pago'
         AND COALESCE(fe.origem_modulo, '') <> 'cronograma_atividade'
         AND fe.obra_id IS NOT NULL
         ${obraId ? `AND fe.obra_id = ${Number(obraId)}` : ""}
       GROUP BY mes`,
      [companyId]
    );
    for (const r of custoRealRows) {
      const m = String(r.mes);
      if (!m || m.length < 7) continue;
      getMes(m).custoRealizado += parseFloat(r.v ?? "0");
    }

    // ── 5. Monta a saída (meses ordenados + acumulado + totais + obras) ───────
    const ordered = [...mesesMap.keys()].sort();
    const totalReceita = ordered.reduce((s, k) => s + mesesMap.get(k)!.receitaPrevista, 0);
    let acumReceita = 0;
    const meses = ordered.map((k) => {
      const c = mesesMap.get(k)!;
      const recPrev = r2(c.receitaPrevista);
      const custoPrev = r2(c.custoPrevisto);
      const recReal = r2(c.receitaRealizada);
      const custoReal = r2(c.custoRealizado);
      acumReceita += recPrev;
      const resultado = r2(recPrev - custoPrev);
      const margemPct = recPrev > 0 ? (resultado / recPrev) * 100 : 0;
      const acumPct = totalReceita > 0 ? (acumReceita / totalReceita) * 100 : 0;
      return {
        mes: k,
        receitaPrevista: recPrev,
        custoPrevisto: custoPrev,
        resultadoPrevisto: resultado,
        margemPct,
        acumPct,
        receitaRealizada: recReal,
        custoRealizado: custoReal,
        resultadoRealizado: r2(recReal - custoReal),
      };
    });

    const totais = {
      totalReceitaPrevista: r2(meses.reduce((s, m) => s + m.receitaPrevista, 0)),
      totalCustoPrevisto: r2(meses.reduce((s, m) => s + m.custoPrevisto, 0)),
      resultadoPrevisto: r2(meses.reduce((s, m) => s + m.resultadoPrevisto, 0)),
      receitaRealizada: r2(meses.reduce((s, m) => s + m.receitaRealizada, 0)),
      custoRealizado: r2(meses.reduce((s, m) => s + m.custoRealizado, 0)),
    };

    const obras = [...obrasMap.values()]
      .map((o) => ({ ...o, totalReceita: r2(o.totalReceita), totalCusto: r2(o.totalCusto) }))
      .filter((o) => o.totalReceita > 0 || o.totalCusto > 0)
      .sort((a, b) => b.totalReceita - a.totalReceita);

    return { meses, obras, totais };
  }),

  // Trigger: importa todas as medições previstas para o cronograma financeiro
  importarCronogramaFinanceiro: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ ctx, input }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const { companyId } = input;
    const [n1, n2, n3] = await Promise.all([
      importAllMedicoesPrevistaToFinancial(companyId),
      importAtividadesCronogramaToFinancial(companyId),
      importAllMedicoesPrevistaToRevenue(companyId),
    ]);
    return { imported: n1 + n2 + n3, receitas: n1 + n3, despesas: n2 };
  }),

  // Sincroniza cronograma financeiro → Contas a Receber (financial_revenue)
  syncCronogramaToReceber: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const count = await importAllMedicoesPrevistaToRevenue(input.companyId);
    return { sincronizados: count };
  }),

  // ── Matriz Contas a Receber — espelho do cronograma financeiro ────────────
  // Previsto = distribuição proporcional do valor_contrato pelo timeline das atividades
  // Realizado = medições salvas (planejamento_medicoes) sobrepostas ao previsto
  getContasReceberMatrix: protectedProcedure.input(z.object({
    companyId: z.number(),
    ano: z.number(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // 1. Projetos ativos + orcamento total de venda
    const projRes = await dbExecute(db, `
      SELECT pp.id AS projeto_id, pp.nome AS projeto_nome, pp.cliente,
             pp.valor_contrato, pp.obra_id,
             COALESCE(o.nome, pp.nome) AS obra_nome,
             COALESCE(orc.valor_negociado::numeric,
                      orc."totalVenda"::numeric,
                      pp.valor_contrato::numeric, 0) AS total_venda,
             -- Rev. 1350: MDO no preço de VENDA (com BDI), base correta do sinal em modo "mao_de_obra"
             CASE WHEN COALESCE(orc."totalCusto"::numeric, 0) > 0
               THEN COALESCE(orc."totalMdo"::numeric, 0)
                    * COALESCE(orc.valor_negociado::numeric, orc."totalVenda"::numeric, 0)
                    / orc."totalCusto"::numeric
               ELSE COALESCE(orc."totalMdo"::numeric, 0)
             END AS total_mdo,
             COALESCE((SELECT SUM(b.total::numeric)
                       FROM bdi_fd b
                       WHERE b.orcamento_id = pp.orcamento_id), 0) AS fd_sugerido
      FROM planejamento_projetos pp
      LEFT JOIN obras o ON o.id = pp.obra_id
      LEFT JOIN orcamentos orc ON orc.id = pp.orcamento_id
      WHERE pp.company_id = $1
        AND pp.status NOT IN ('cancelado','encerrado','Cancelado','Encerrado')
      ORDER BY COALESCE(o.nome, pp.nome) ASC
    `, [input.companyId]);
    const projetos = projRes.rows;
    if (!projetos.length) return { projetos: [], totaisMes: {}, ano: input.ano, kpis: { totalContrato: 0, totalPrevisto: 0, totalFaturado: 0, totalRecebido: 0 } };

    const projetoIds = projetos.map((p: any) => Number(p.projeto_id)).filter(Boolean);
    const idsStr = projetoIds.join(",");

    // 2-7. Todas as queries dependentes rodam em PARALELO após obter projetos
    const anoInt = Number(input.ano);
    const t0 = Date.now();

    // Mapa projeto_id → projeto (necessário antes do processamento das queries paralelas)
    const projetoMap: Record<number, any> = {};
    for (const p of projetos) projetoMap[Number(p.projeto_id)] = p;

    const [configRes, prevRes, medRes, stRes, previsaoFatRes, totalRecebidoHistRes, prevBaselineRes] = await Promise.all([

    // 2. Configurações de medição
    dbExecute(db, `
      SELECT c.projeto_id,
             c.tipo_medicao,
             c.entrada::numeric         AS entrada,
             c.numero_parcelas,
             c.dia_corte                AS dia_corte,
             c.inicio_faturamento::text AS inicio_faturamento,
             c.sinal_pct::numeric       AS sinal_pct,
             c.sinal_valor::numeric     AS sinal_valor,
             c.retencao_pct::numeric    AS retencao_pct,
             c.data_inicio_obra::text   AS data_inicio_obra,
             c.data_primeiro_faturamento::text AS data_primeiro_faturamento,
             c.prazo_recebimento_dias_uteis    AS prazo_recebimento_dias_uteis,
             c.sinal_base                      AS sinal_base,
             c.fd_valor::numeric               AS fd_valor,
             c.valor_parcela_fixa::numeric AS valor_parcela_fixa
      FROM planejamento_medicao_config c
      WHERE c.projeto_id IN (${idsStr})
    `, []),

    // 3. Distribuição mensal de venda bruta via cruzamento atividades×orçamento
    //    Cobre o timeline completo do projeto (todos os meses, não só o ano atual)
    dbExecute(db, `
      WITH rev_ativa AS (
        SELECT DISTINCT ON (r.projeto_id) r.projeto_id, r.id AS rev_id
        FROM planejamento_revisoes r
        WHERE r.projeto_id IN (${idsStr}) AND r.status = 'aprovada'
        ORDER BY r.projeto_id, r.numero DESC
      ),
      orc_scope AS (
        SELECT i.*, p.id AS projeto_id
        FROM orcamento_itens i
        JOIN planejamento_projetos p ON p.orcamento_id = i."orcamentoId"
        WHERE p.id IN (${idsStr})
          AND (i."vendaTotal"::numeric > 0 OR i."custoTotalMat"::numeric > 0)
      ),
      folhas AS (
        SELECT o.*
        FROM orc_scope o
        WHERE NOT EXISTS (
          SELECT 1 FROM orc_scope c
          WHERE c."eapCodigo" LIKE o."eapCodigo" || '.%'
            AND c.id != o.id AND c.projeto_id = o.projeto_id
        )
      ),
      norm_ativ AS (
        SELECT a.projeto_id, a.id AS ativ_id,
               a.data_inicio::date AS data_inicio, a.data_fim::date AS data_fim,
               LOWER(REGEXP_REPLACE(TRIM(a.nome), '[[:space:]]+', ' ', 'g')) AS nome_norm
        FROM planejamento_atividades a
        JOIN rev_ativa ra ON ra.rev_id = a.revisao_id AND ra.projeto_id = a.projeto_id
        WHERE NOT a.is_grupo AND a.data_inicio IS NOT NULL AND a.data_fim IS NOT NULL
      ),
      norm_name AS (
        SELECT *, LOWER(REGEXP_REPLACE(TRIM(descricao), '[[:space:]]+', ' ', 'g')) AS nome_norm
        FROM folhas
      ),
      match_exact AS (
        SELECT i.id AS item_id, a.ativ_id, i.projeto_id
        FROM norm_name i JOIN norm_ativ a ON a.nome_norm = i.nome_norm AND a.projeto_id = i.projeto_id
      ),
      -- Itens SEM match exato (dedup via match_exact_items). Fence MATERIALIZED p/
      -- filtrar os itens ANTES do cross-join LIKE: sem o fence, o planner inlina as
      -- CTEs e degenera num Nested Loop Anti Join O(n²) (~280M linhas/30s no proj 46).
      -- Com o fence o conjunto sem-match (vazio quando todo item casou exato) já entra
      -- reduzido no LIKE → ~15s caem p/ ~1s. Semântica idêntica (existência é booleana).
      match_exact_items AS MATERIALIZED (
        SELECT DISTINCT item_id FROM match_exact
      ),
      unmatched_items AS MATERIALIZED (
        SELECT n.* FROM norm_name n
        WHERE LENGTH(n.nome_norm) >= 5
          AND NOT EXISTS (SELECT 1 FROM match_exact_items me WHERE me.item_id = n.id)
      ),
      match_contains AS (
        SELECT i.id AS item_id, a.ativ_id, i.projeto_id
        FROM unmatched_items i JOIN norm_ativ a
          ON (a.nome_norm LIKE '%' || i.nome_norm || '%' OR i.nome_norm LIKE '%' || a.nome_norm || '%')
          AND a.projeto_id = i.projeto_id
        WHERE LENGTH(a.nome_norm) >= 5
      ),
      all_pairs AS (
        SELECT i.projeto_id, i.id AS item_id,
               (i."vendaTotal"::numeric / COUNT(*) OVER (PARTITION BY i.id)) AS venda_frac,
               a.data_inicio, a.data_fim,
               (a.data_fim - a.data_inicio + 1) AS dur_total
        FROM folhas i
        JOIN (SELECT * FROM match_exact UNION ALL SELECT * FROM match_contains) m ON m.item_id = i.id
        JOIN norm_ativ a ON a.ativ_id = m.ativ_id
      ),
      proj_sums AS (
        SELECT projeto_id, SUM(venda_frac) AS soma_venda
        FROM all_pairs GROUP BY projeto_id
      ),
      -- Range completo de cada projeto (para gerar meses do timeline todo, não só o ano)
      ativ_any AS (
        SELECT na.projeto_id, MIN(na.data_inicio) AS inicio, MAX(na.data_fim) AS fim
        FROM norm_ativ na GROUP BY na.projeto_id
      ),
      -- Fallback: projetos sem cruzamento → distribuição linear por timeline
      ativ_range AS (
        SELECT na.projeto_id,
               MIN(na.data_inicio) AS inicio, MAX(na.data_fim) AS fim,
               (MAX(na.data_fim) - MIN(na.data_inicio) + 1) AS total_dias
        FROM norm_ativ na
        WHERE na.projeto_id NOT IN (SELECT projeto_id FROM proj_sums WHERE soma_venda > 0)
        GROUP BY na.projeto_id
      ),
      -- Todos os meses do timeline de cada projeto
      meses_all AS (
        SELECT aa.projeto_id,
               generate_series(
                 DATE_TRUNC('month', aa.inicio),
                 DATE_TRUNC('month', aa.fim),
                 '1 month'::interval
               )::date AS mes_inicio
        FROM ativ_any aa
      ),
      -- Distribuição via cruzamento atividade×orçamento
      dist_cruzamento AS (
        SELECT ap.projeto_id,
               TO_CHAR(m.mes_inicio, 'YYYY-MM') AS competencia,
               SUM(
                 GREATEST(0,
                   LEAST(ap.data_fim, (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date)
                   - GREATEST(ap.data_inicio, m.mes_inicio) + 1
                 )::numeric / NULLIF(ap.dur_total, 0) * ap.venda_frac
               ) AS valor_raw,
               ps.soma_venda
        FROM all_pairs ap
        JOIN meses_all m ON m.projeto_id = ap.projeto_id
          AND m.mes_inicio <= ap.data_fim
          AND (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date >= ap.data_inicio
        JOIN proj_sums ps ON ps.projeto_id = ap.projeto_id
        GROUP BY ap.projeto_id, m.mes_inicio, ps.soma_venda
      ),
      -- Distribuição fallback (linear)
      dist_fallback AS (
        SELECT ar.projeto_id,
               TO_CHAR(m.mes_inicio, 'YYYY-MM') AS competencia,
               GREATEST(0,
                 LEAST(ar.fim, (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date)
                 - GREATEST(ar.inicio, m.mes_inicio) + 1
               )::numeric / NULLIF(ar.total_dias, 0) AS frac_mes,
               ar.total_dias
        FROM ativ_range ar
        JOIN meses_all m ON m.projeto_id = ar.projeto_id
          AND m.mes_inicio <= ar.fim
          AND (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date >= ar.inicio
      )
      SELECT dc.projeto_id, dc.competencia,
             dc.valor_raw AS valor_previsto_raw,
             dc.soma_venda AS soma_venda,
             NULL::numeric AS frac_fallback
      FROM dist_cruzamento dc WHERE dc.valor_raw > 0
      UNION ALL
      SELECT df.projeto_id, df.competencia,
             NULL AS valor_previsto_raw,
             NULL AS soma_venda,
             df.frac_mes AS frac_fallback
      FROM dist_fallback df WHERE df.frac_mes > 0
      ORDER BY projeto_id, competencia
    `, []),

    // 4. Medições salvas (realizado)
    dbExecute(db, `
      SELECT pm.id, pm.projeto_id,
             SUBSTRING(pm.competencia::text, 1, 7) AS competencia,
             pm.numero, pm.valor_previsto, pm.valor_medido,
             pm.percentual_previsto, pm.percentual_medido,
             pm.status AS status_medicao,
             fr.id AS fr_id, fr.status AS status_financeiro,
             fr.nf_numero, fr.data_vencimento, fr.data_recebimento,
             fr.valor_recebido, fr.valor_medicao AS fr_valor_medicao,
             fr.conta_bancaria_id AS conta_bancaria_id
      FROM planejamento_medicoes pm
      JOIN planejamento_projetos pp ON pp.id = pm.projeto_id
      LEFT JOIN financial_revenue fr ON fr.medicao_id = pm.id
        AND fr.status NOT IN ('a_faturar','cancelado')
      WHERE pp.company_id = $1
        AND LEFT(pm.competencia::text, 4) = $2
        AND pm.status NOT IN ('cancelada','rejeitada')
      ORDER BY pm.competencia ASC, pm.numero ASC, pm.id ASC
    `, [input.companyId, String(input.ano)]),

    // 5. Standalone financial_revenue (Dar Baixa direto, sem medicao_id)
    //    DISTINCT ON (obra_id, mês) → vence o registro mais recentemente atualizado,
    //    garantindo que um "Dar Baixa" manual sobreponha qualquer FR antigo importado
    //    pela API com valor divergente para o mesmo mês.
    dbExecute(db, `
      SELECT DISTINCT ON (fr.obra_id, TO_CHAR(fr.data_vencimento, 'YYYY-MM'))
             fr.id, fr.obra_id, fr.obra_nome,
             TO_CHAR(fr.data_vencimento, 'YYYY-MM') AS competencia,
             fr.status, fr.data_recebimento, fr.valor_recebido,
             fr.valor_medicao, fr.forma_pagamento, fr.nf_numero, fr.data_vencimento,
             fr.conta_bancaria_id
      FROM financial_revenue fr
      WHERE fr.company_id = $1
        AND fr.medicao_id IS NULL
        AND fr.data_vencimento IS NOT NULL
        AND LEFT(fr.data_vencimento::text, 4) = $2
      ORDER BY fr.obra_id,
               TO_CHAR(fr.data_vencimento, 'YYYY-MM'),
               CASE fr.status
                 WHEN 'recebido_total'   THEN 1
                 WHEN 'recebido_parcial' THEN 2
                 WHEN 'pendente'         THEN 3
                 WHEN 'a_faturar'        THEN 4
                 ELSE 5
               END ASC,
               fr.updated_at DESC NULLS LAST,
               fr.id DESC
    `, [input.companyId, String(input.ano)]),

    // 6. Avanço físico mensal por projeto (Camada 2 - Previsão de Faturamento)
    //    DISTINCT ON = mais eficiente que ROW_NUMBER para este caso
    dbExecute(db, `
      WITH latest_per_month AS (
        SELECT DISTINCT ON (a.id, DATE_TRUNC('month', av.semana))
          a.projeto_id,
          a.id AS atividade_id,
          COALESCE(a.peso_financeiro, 0)::numeric AS peso,
          DATE_TRUNC('month', av.semana)::date AS mes_inicio,
          av.percentual_acumulado::numeric AS pct_acumulado
        FROM planejamento_atividades a
        JOIN planejamento_avancos av ON av.atividade_id = a.id
        WHERE a.projeto_id IN (${idsStr})
          AND NOT a.is_grupo
        ORDER BY a.id, DATE_TRUNC('month', av.semana), av.semana DESC
      ),
      with_prev_month AS (
        SELECT
          lm.*,
          LAG(lm.pct_acumulado) OVER (
            PARTITION BY lm.atividade_id
            ORDER BY lm.mes_inicio
          ) AS pct_mes_anterior
        FROM latest_per_month lm
      ),
      project_total_peso AS (
        SELECT projeto_id, NULLIF(SUM(COALESCE(peso_financeiro, 0)), 0) AS total_peso
        FROM planejamento_atividades
        WHERE projeto_id IN (${idsStr}) AND NOT is_grupo
        GROUP BY projeto_id
      )
      SELECT
        wp.projeto_id,
        TO_CHAR(wp.mes_inicio, 'YYYY-MM') AS competencia,
        SUM(GREATEST(0, (wp.pct_acumulado - COALESCE(wp.pct_mes_anterior, 0))) / 100.0 * wp.peso) AS incremento_peso,
        pt.total_peso
      FROM with_prev_month wp
      JOIN project_total_peso pt ON pt.projeto_id = wp.projeto_id
      GROUP BY wp.projeto_id, wp.mes_inicio, pt.total_peso
      HAVING SUM(GREATEST(0, (wp.pct_acumulado - COALESCE(wp.pct_mes_anterior, 0))) / 100.0 * wp.peso) > 0
      ORDER BY wp.projeto_id, wp.mes_inicio
    `, []),

    // 7. Total recebido histórico (todos os anos) para saldo de contrato
    // Usa DISTINCT ON (obra_id, competencia-mês) para evitar dupla-contagem quando
    // um mesmo mês tem tanto FR importado da API quanto FR criado pelo "Dar Baixa".
    // Mantém apenas o registro mais recentemente atualizado por (obra_id, mês).
    dbExecute(db, `
      SELECT sub.obra_id,
             CASE WHEN sub.obra_id IS NULL THEN sub.obra_nome ELSE NULL END AS obra_nome,
             SUM(COALESCE(sub.valor_recebido, 0)) AS total_recebido
      FROM (
        SELECT DISTINCT ON (
          fr.obra_id,
          TO_CHAR(COALESCE(fr.data_vencimento, fr.data_recebimento), 'YYYY-MM')
        )
          fr.obra_id, fr.obra_nome, fr.valor_recebido
        FROM financial_revenue fr
        WHERE fr.company_id = $1
          AND fr.valor_recebido > 0
        ORDER BY
          fr.obra_id,
          TO_CHAR(COALESCE(fr.data_vencimento, fr.data_recebimento), 'YYYY-MM'),
          fr.updated_at DESC NULLS LAST,
          fr.id DESC
      ) sub
      GROUP BY sub.obra_id,
               CASE WHEN sub.obra_id IS NULL THEN sub.obra_nome ELSE NULL END
    `, [input.companyId]),

    // 8. Baseline: mesma distribuição mas usando a PRIMEIRA revisão aprovada
    //    (baseline do contrato — nunca muda com revisões futuras)
    dbExecute(db, `
      WITH rev_ativa AS (
        SELECT DISTINCT ON (r.projeto_id) r.projeto_id, r.id AS rev_id
        FROM planejamento_revisoes r
        WHERE r.projeto_id IN (${idsStr}) AND r.status = 'aprovada'
        ORDER BY r.projeto_id, r.numero ASC
      ),
      orc_scope AS (
        SELECT i.*, p.id AS projeto_id
        FROM orcamento_itens i
        JOIN planejamento_projetos p ON p.orcamento_id = i."orcamentoId"
        WHERE p.id IN (${idsStr})
          AND (i."vendaTotal"::numeric > 0 OR i."custoTotalMat"::numeric > 0)
      ),
      folhas AS (
        SELECT o.*
        FROM orc_scope o
        WHERE NOT EXISTS (
          SELECT 1 FROM orc_scope c
          WHERE c."eapCodigo" LIKE o."eapCodigo" || '.%'
            AND c.id != o.id AND c.projeto_id = o.projeto_id
        )
      ),
      norm_ativ AS (
        SELECT a.projeto_id, a.id AS ativ_id,
               a.data_inicio::date AS data_inicio, a.data_fim::date AS data_fim,
               LOWER(REGEXP_REPLACE(TRIM(a.nome), '[[:space:]]+', ' ', 'g')) AS nome_norm
        FROM planejamento_atividades a
        JOIN rev_ativa ra ON ra.rev_id = a.revisao_id AND ra.projeto_id = a.projeto_id
        WHERE NOT a.is_grupo AND a.data_inicio IS NOT NULL AND a.data_fim IS NOT NULL
      ),
      norm_name AS (
        SELECT *, LOWER(REGEXP_REPLACE(TRIM(descricao), '[[:space:]]+', ' ', 'g')) AS nome_norm
        FROM folhas
      ),
      match_exact AS (
        SELECT i.id AS item_id, a.ativ_id, i.projeto_id
        FROM norm_name i JOIN norm_ativ a ON a.nome_norm = i.nome_norm AND a.projeto_id = i.projeto_id
      ),
      -- Itens SEM match exato (dedup via match_exact_items). Fence MATERIALIZED p/
      -- filtrar os itens ANTES do cross-join LIKE: sem o fence, o planner inlina as
      -- CTEs e degenera num Nested Loop Anti Join O(n²) (~280M linhas/30s no proj 46).
      -- Com o fence o conjunto sem-match (vazio quando todo item casou exato) já entra
      -- reduzido no LIKE → ~15s caem p/ ~1s. Semântica idêntica (existência é booleana).
      match_exact_items AS MATERIALIZED (
        SELECT DISTINCT item_id FROM match_exact
      ),
      unmatched_items AS MATERIALIZED (
        SELECT n.* FROM norm_name n
        WHERE LENGTH(n.nome_norm) >= 5
          AND NOT EXISTS (SELECT 1 FROM match_exact_items me WHERE me.item_id = n.id)
      ),
      match_contains AS (
        SELECT i.id AS item_id, a.ativ_id, i.projeto_id
        FROM unmatched_items i JOIN norm_ativ a
          ON (a.nome_norm LIKE '%' || i.nome_norm || '%' OR i.nome_norm LIKE '%' || a.nome_norm || '%')
          AND a.projeto_id = i.projeto_id
        WHERE LENGTH(a.nome_norm) >= 5
      ),
      all_pairs AS (
        SELECT i.projeto_id, i.id AS item_id,
               (i."vendaTotal"::numeric / COUNT(*) OVER (PARTITION BY i.id)) AS venda_frac,
               a.data_inicio, a.data_fim,
               (a.data_fim - a.data_inicio + 1) AS dur_total
        FROM folhas i
        JOIN (SELECT * FROM match_exact UNION ALL SELECT * FROM match_contains) m ON m.item_id = i.id
        JOIN norm_ativ a ON a.ativ_id = m.ativ_id
      ),
      proj_sums AS (
        SELECT projeto_id, SUM(venda_frac) AS soma_venda
        FROM all_pairs GROUP BY projeto_id
      ),
      ativ_any AS (
        SELECT na.projeto_id, MIN(na.data_inicio) AS inicio, MAX(na.data_fim) AS fim
        FROM norm_ativ na GROUP BY na.projeto_id
      ),
      ativ_range AS (
        SELECT na.projeto_id,
               MIN(na.data_inicio) AS inicio, MAX(na.data_fim) AS fim,
               (MAX(na.data_fim) - MIN(na.data_inicio) + 1) AS total_dias
        FROM norm_ativ na
        WHERE na.projeto_id NOT IN (SELECT projeto_id FROM proj_sums WHERE soma_venda > 0)
        GROUP BY na.projeto_id
      ),
      meses_all AS (
        SELECT aa.projeto_id,
               generate_series(
                 DATE_TRUNC('month', aa.inicio),
                 DATE_TRUNC('month', aa.fim),
                 '1 month'::interval
               )::date AS mes_inicio
        FROM ativ_any aa
      ),
      dist_cruzamento AS (
        SELECT ap.projeto_id,
               TO_CHAR(m.mes_inicio, 'YYYY-MM') AS competencia,
               SUM(
                 GREATEST(0,
                   LEAST(ap.data_fim, (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date)
                   - GREATEST(ap.data_inicio, m.mes_inicio) + 1
                 )::numeric / NULLIF(ap.dur_total, 0) * ap.venda_frac
               ) AS valor_raw,
               ps.soma_venda
        FROM all_pairs ap
        JOIN meses_all m ON m.projeto_id = ap.projeto_id
          AND m.mes_inicio <= ap.data_fim
          AND (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date >= ap.data_inicio
        JOIN proj_sums ps ON ps.projeto_id = ap.projeto_id
        GROUP BY ap.projeto_id, m.mes_inicio, ps.soma_venda
      ),
      dist_fallback AS (
        SELECT ar.projeto_id,
               TO_CHAR(m.mes_inicio, 'YYYY-MM') AS competencia,
               GREATEST(0,
                 LEAST(ar.fim, (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date)
                 - GREATEST(ar.inicio, m.mes_inicio) + 1
               )::numeric / NULLIF(ar.total_dias, 0) AS frac_mes,
               ar.total_dias
        FROM ativ_range ar
        JOIN meses_all m ON m.projeto_id = ar.projeto_id
          AND m.mes_inicio <= ar.fim
          AND (m.mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date >= ar.inicio
      )
      SELECT dc.projeto_id, dc.competencia,
             dc.valor_raw AS valor_previsto_raw,
             dc.soma_venda AS soma_venda,
             NULL::numeric AS frac_fallback
      FROM dist_cruzamento dc WHERE dc.valor_raw > 0
      UNION ALL
      SELECT df.projeto_id, df.competencia,
             NULL AS valor_previsto_raw,
             NULL AS soma_venda,
             df.frac_mes AS frac_fallback
      FROM dist_fallback df WHERE df.frac_mes > 0
      ORDER BY projeto_id, competencia
    `, []),

    ]); // fim Promise.all

    // 9. Avanço físico acumulado GLOBAL — mesma fórmula do REFIS "Global (c/ Indiretas)":
    //    Detecta automaticamente o modo de ponderação por projeto:
    //    • Modo financeiro (peso_financeiro): quando as atividades COM avanço positivo têm peso_financeiro>0
    //    • Modo duração (duracao_dias):       quando as atividades COM avanço positivo têm peso_financeiro=0
    //    Indiretas → previsto proporcional ao prazo: (próxima seg - data_inicio) / (data_fim - data_inicio) × 100
    const avancoFisicoRes = await dbExecute(db, `
      WITH
      -- Revisão ativa por projeto: última revisão com status='aprovada' (igual ao frontend)
      rev_ativa AS (
        SELECT DISTINCT ON (projeto_id)
          projeto_id, id AS revisao_id
        FROM planejamento_revisoes
        WHERE projeto_id IN (${idsStr})
          AND status = 'aprovada'
        ORDER BY projeto_id, numero DESC
      ),
      -- Detecta soma de peso_financeiro das atividades DIRETAS com avanço positivo
      -- Se = 0 → projeto usa ponderação por duração (ex: QIU 2 importado do MS Project)
      -- Se > 0 → projeto usa ponderação financeira (ex: HOTEL DO PAPA com orçamento)
      proj_mode AS (
        SELECT pa.projeto_id,
               COALESCE((
                 SELECT SUM(a2.peso_financeiro::numeric)
                 FROM planejamento_avancos av2
                 JOIN planejamento_atividades a2 ON a2.id = av2.atividade_id
                 JOIN rev_ativa ra2 ON ra2.projeto_id = a2.projeto_id AND ra2.revisao_id = a2.revisao_id
                 WHERE a2.projeto_id = pa.projeto_id
                   AND NOT COALESCE(a2.is_grupo, false)
                   AND NOT COALESCE(a2.is_indireta, false)
                   AND av2.percentual_acumulado::numeric > 0
               ), 0) AS peso_diretas_avanco
        FROM planejamento_atividades pa
        JOIN rev_ativa ra ON ra.projeto_id = pa.projeto_id AND ra.revisao_id = pa.revisao_id
        WHERE pa.projeto_id IN (${idsStr})
          AND NOT COALESCE(pa.is_grupo, false)
        GROUP BY pa.projeto_id
      ),
      -- Configuração por projeto: modo de ponderação e denominador total
      -- Somente atividades da revisão ativa
      proj_cfg AS (
        SELECT pa.projeto_id,
               (pm.peso_diretas_avanco = 0) AS usar_duracao,
               CASE
                 WHEN pm.peso_diretas_avanco > 0 THEN
                   -- Modo financeiro: denominador = soma de peso_financeiro (ou contagem se todos zero)
                   CASE WHEN SUM(COALESCE(pa.peso_financeiro::numeric, 0)) > 0
                        THEN SUM(COALESCE(pa.peso_financeiro::numeric, 0))
                        ELSE COUNT(*)::numeric
                   END
                 ELSE
                   -- Modo duração: denominador = soma de duracao_dias
                   NULLIF(SUM(COALESCE(pa.duracao_dias::numeric, 0)), 0)
               END AS total_peso
        FROM planejamento_atividades pa
        JOIN rev_ativa ra ON ra.projeto_id = pa.projeto_id AND ra.revisao_id = pa.revisao_id
        JOIN proj_mode pm ON pm.projeto_id = pa.projeto_id
        WHERE pa.projeto_id IN (${idsStr})
          AND NOT COALESCE(pa.is_grupo, false)
        GROUP BY pa.projeto_id, pm.peso_diretas_avanco
      ),
      -- Diretas: valor real registrado em planejamento_avancos (percentual mais recente)
      -- NULL em is_indireta é tratado como FALSE (atividade direta)
      diretas AS (
        SELECT DISTINCT ON (av.atividade_id)
          a.projeto_id,
          CASE
            WHEN pc.usar_duracao THEN COALESCE(a.duracao_dias::numeric, 0)
            WHEN COALESCE(a.peso_financeiro::numeric, 0) > 0 THEN a.peso_financeiro::numeric
            ELSE 1::numeric
          END AS peso,
          av.percentual_acumulado::numeric AS val
        FROM planejamento_atividades a
        JOIN planejamento_avancos av ON av.atividade_id = a.id
        JOIN rev_ativa ra ON ra.projeto_id = a.projeto_id AND ra.revisao_id = a.revisao_id
        JOIN proj_cfg pc ON pc.projeto_id = a.projeto_id
        WHERE a.projeto_id IN (${idsStr})
          AND NOT COALESCE(a.is_grupo, false)
          AND NOT COALESCE(a.is_indireta, false)
        ORDER BY av.atividade_id, av.semana DESC
      ),
      -- Indiretas: previsto proporcional ao prazo (ref = próxima segunda-feira)
      indiretas AS (
        SELECT
          a.projeto_id,
          CASE
            WHEN pc.usar_duracao THEN COALESCE(a.duracao_dias::numeric, 0)
            WHEN COALESCE(a.peso_financeiro::numeric, 0) > 0 THEN a.peso_financeiro::numeric
            ELSE 1::numeric
          END AS peso,
          CASE
            WHEN a.data_fim IS NULL OR a.data_inicio IS NULL THEN 0
            WHEN (date_trunc('week', CURRENT_DATE)::date + 7) >= a.data_fim::date THEN 100
            WHEN (date_trunc('week', CURRENT_DATE)::date + 7) <= a.data_inicio::date THEN 0
            ELSE ((date_trunc('week', CURRENT_DATE)::date + 7) - a.data_inicio::date)::numeric
                 / (a.data_fim::date - a.data_inicio::date)::numeric * 100
          END AS val
        FROM planejamento_atividades a
        JOIN rev_ativa ra ON ra.projeto_id = a.projeto_id AND ra.revisao_id = a.revisao_id
        JOIN proj_cfg pc ON pc.projeto_id = a.projeto_id
        WHERE a.projeto_id IN (${idsStr})
          AND NOT COALESCE(a.is_grupo, false)
          AND COALESCE(a.is_indireta, false) = true
      ),
      combined AS (
        SELECT projeto_id, peso, val FROM diretas
        UNION ALL
        SELECT projeto_id, peso, val FROM indiretas
      )
      SELECT
        c.projeto_id,
        ROUND(
          CASE WHEN pc.total_peso > 0
          THEN SUM(c.val * c.peso) / pc.total_peso
          ELSE 0 END, 2
        ) AS avanco_fisico_pct
      FROM combined c
      JOIN proj_cfg pc ON pc.projeto_id = c.projeto_id
      GROUP BY c.projeto_id, pc.total_peso
    `, []);
    const avancoFisicoByProjId: Record<number, number> = {};
    for (const r of avancoFisicoRes.rows) {
      const v = parseFloat(r.avanco_fisico_pct ?? "0");
      if (!isNaN(v)) avancoFisicoByProjId[Number(r.projeto_id)] = v;
    }
    console.log(`[ContasReceber] company=${input.companyId} ano=${input.ano} projetos=${projetos.length} prev_rows=${prevRes.rows.length} medicoes=${medRes.rows.length} tempo=${Date.now()-t0}ms`);

    const prevRows = prevRes.rows;
    const medicoes = medRes.rows;

    // Indexa por projeto_id → mes, cruzando obra_id ou obra_nome
    const obraIdToProjId: Record<number, number> = {};
    const obraNameToProjId: Record<string, number> = {};
    for (const p of projetos) {
      const pid = Number(p.projeto_id);
      if (p.obra_id) obraIdToProjId[Number(p.obra_id)] = pid;
      const nome = (p.obra_nome ?? p.projeto_nome ?? "").trim().toLowerCase();
      if (nome) obraNameToProjId[nome] = pid;
    }

    const standaloneByProjetoByMes: Record<number, Record<string, any>> = {};
    for (const fr of stRes.rows) {
      let pid: number | undefined;
      if (fr.obra_id) pid = obraIdToProjId[Number(fr.obra_id)];
      if (!pid) {
        const nome = (fr.obra_nome ?? "").trim().toLowerCase();
        if (nome) pid = obraNameToProjId[nome];
      }
      if (!pid) continue;
      const mes = String(fr.competencia);
      if (!standaloneByProjetoByMes[pid]) standaloneByProjetoByMes[pid] = {};
      standaloneByProjetoByMes[pid][mes] = fr;
    }

    // Processa previsão de faturamento (resultado da query 6)
    const configByProjeto: Record<number, any> = {};
    for (const c of configRes.rows) configByProjeto[Number(c.projeto_id)] = c;

    const previsaoByProjeto: Record<number, Record<string, number>> = {};
    for (const r of previsaoFatRes.rows) {
      const pid = Number(r.projeto_id);
      const mes = String(r.competencia);
      const totalPeso = parseFloat(r.total_peso ?? "0") || 0;
      const incrementoPeso = parseFloat(r.incremento_peso ?? "0") || 0;
      if (!previsaoByProjeto[pid]) previsaoByProjeto[pid] = {};
      const proj = projetoMap[pid];
      const totalVenda = parseFloat(proj?.total_venda ?? "0") || parseFloat(proj?.valor_contrato ?? "0") || 0;
      if (totalPeso > 0 && totalVenda > 0) {
        previsaoByProjeto[pid][mes] = (previsaoByProjeto[pid][mes] ?? 0) + (incrementoPeso / totalPeso) * totalVenda;
      }
    }

    // Processa total recebido histórico (resultado da query 7)
    const totalRecebidoHistByProjId: Record<number, number> = {};
    for (const r of totalRecebidoHistRes.rows) {
      let pid: number | undefined;
      if (r.obra_id) pid = obraIdToProjId[Number(r.obra_id)];
      if (!pid) {
        const nome = (r.obra_nome ?? "").trim().toLowerCase();
        if (nome) pid = obraNameToProjId[nome];
      }
      if (!pid) continue;
      totalRecebidoHistByProjId[pid] = (totalRecebidoHistByProjId[pid] ?? 0) + parseFloat(r.total_recebido ?? "0");
    }

    // Rev. 1347: helper para deslocar competência → mês de recebimento previsto.
    // recebimento = data de corte do mês de competência + N dias úteis (pula sáb/dom).
    // Quando prazoDiasUteis = 0, mantém o próprio mês de competência.
    const shiftToRecebimentoMes = (competenciaMes: string, diaCorte: number, prazoDiasUteis: number): string => {
      if (!prazoDiasUteis || prazoDiasUteis <= 0) return competenciaMes;
      const [y, m] = competenciaMes.split("-").map(Number);
      if (!y || !m) return competenciaMes;
      const lastDay = new Date(y, m, 0).getDate();
      const diaCorteEfetivo = Math.min(Math.max(1, diaCorte || 30), lastDay);
      const dataRec = new Date(y, m - 1, diaCorteEfetivo);
      let restantes = prazoDiasUteis;
      while (restantes > 0) {
        dataRec.setDate(dataRec.getDate() + 1);
        const dow = dataRec.getDay();
        if (dow !== 0 && dow !== 6) restantes--;
      }
      return `${dataRec.getFullYear()}-${String(dataRec.getMonth() + 1).padStart(2, "0")}`;
    };

    // Helper: converte rows de distribuição em previsto líquido por projeto+mês
    //         (aplica tipo, retenção, sinal conforme planejamento_medicao_config)
    //         Rev. 1347: reindexa por MÊS DE RECEBIMENTO (competência + prazoDiasUteis úteis)
    //         para refletir corretamente o cronograma de Contas a Receber.
    const buildPrevDist = (rows: any[]): Record<number, Record<string, number>> => {
      const raw: Record<number, Record<string, number>> = {};
      const soma: Record<number, number> = {};
      for (const r of rows) {
        const pid = Number(r.projeto_id);
        const mes = String(r.competencia);
        if (!raw[pid]) raw[pid] = {};
        const p = projetoMap[pid];
        const totalVenda = parseFloat(p?.total_venda ?? "0") || parseFloat(p?.valor_contrato ?? "0") || 0;
        if (r.valor_previsto_raw !== null && r.valor_previsto_raw !== undefined) {
          raw[pid][mes] = (raw[pid][mes] ?? 0) + parseFloat(r.valor_previsto_raw);
          if (!soma[pid]) soma[pid] = parseFloat(r.soma_venda ?? "0") || 0;
        } else if (r.frac_fallback !== null && r.frac_fallback !== undefined) {
          raw[pid][mes] = (raw[pid][mes] ?? 0) + parseFloat(r.frac_fallback) * totalVenda;
        }
      }
      for (const p of projetos) {
        const pid = Number(p.projeto_id);
        const totalVenda = parseFloat(p.total_venda ?? "0") || parseFloat(p.valor_contrato ?? "0") || 0;
        const s = soma[pid] ?? 0;
        if (s > 0 && totalVenda > 0 && Math.abs(s - totalVenda) > 1) {
          const esc = totalVenda / s;
          for (const mes of Object.keys(raw[pid] ?? {})) raw[pid][mes] *= esc;
        }
      }
      const result: Record<number, Record<string, number>> = {};
      for (const p of projetos) {
        const pid = Number(p.projeto_id);
        const cfg = configByProjeto[pid];
        const totalVenda = parseFloat(p.total_venda ?? "0") || parseFloat(p.valor_contrato ?? "0") || 0;
        const vendaByMes = raw[pid] ?? {};
        const tipoMedicao = cfg?.tipo_medicao ?? "avanco";
        const retencaoPct = parseFloat(cfg?.retencao_pct ?? "0") || 0;
        result[pid] = {};
        if (tipoMedicao === "parcela_fixa" && cfg) {
          const entrada = parseFloat(cfg.entrada ?? "0") || 0;
          const numeroParcelas = Math.max(1, parseInt(cfg.numero_parcelas ?? "6") || 6);
          const priDataMes = Object.keys(vendaByMes).sort()[0] ?? null;
          const inicioMes = (cfg.inicio_faturamento as string | null)?.substring(0, 7) ?? priDataMes;
          if (inicioMes) {
            const [anoIni, mesIni] = inicioMes.split("-").map(Number);
            const saldoParcelar = Math.max(0, totalVenda - entrada);
            const valorParcelaManual = parseFloat(cfg.valor_parcela_fixa ?? "0") || 0;
            const parcelaBase = (valorParcelaManual > 0 && numeroParcelas > 0)
              ? valorParcelaManual
              : (numeroParcelas > 0 ? saldoParcelar / numeroParcelas : 0);
            const valorUltimaParcela = numeroParcelas > 1
              ? Math.max(0, saldoParcelar - parcelaBase * (numeroParcelas - 1))
              : saldoParcelar;
            if (entrada > 0) result[pid][inicioMes] = (result[pid][inicioMes] ?? 0) + entrada;
            for (let i = 1; i <= numeroParcelas; i++) {
              const offset = mesIni - 1 + i;
              const pmAno = anoIni + Math.floor(offset / 12);
              const pmMes = (offset % 12) + 1;
              const pm = `${pmAno}-${String(pmMes).padStart(2, "0")}`;
              const parcelaValor = (i === numeroParcelas) ? valorUltimaParcela : parcelaBase;
              result[pid][pm] = (result[pid][pm] ?? 0) + parcelaValor;
            }
          }
        } else {
          const sinalValor = parseFloat(cfg?.sinal_valor ?? "0") || 0;
          const sinalPct   = parseFloat(cfg?.sinal_pct   ?? "0") || 0;
          const dataInicioObra = (cfg?.data_inicio_obra as string | null) ?? null;
          // Rev. 1347: data exata do pagamento do sinal (substitui dataInicioObra para
          // posicionamento na matriz de Contas a Receber); fallback para dataInicioObra.
          const dataPrimeiroFat = (cfg?.data_primeiro_faturamento as string | null) ?? null;
          // Rev. 1347: prazo de recebimento em dias úteis (ex.: 15 = cliente paga 15
          // dias úteis após o fechamento da medição).
          const prazoRecDiasUteis = parseInt(cfg?.prazo_recebimento_dias_uteis ?? "0") || 0;
          const diaCorte = parseInt(cfg?.dia_corte ?? "30") || 30;
          // Rev. 1348: base de cálculo do sinal: 'contrato' (default) ou 'mao_de_obra'.
          // Quando 'mao_de_obra', o sinal incide apenas sobre a parcela de MDO do contrato.
          // Rev. 1349: alinha com o cliente (PlanejamentoDetalhe.previsoesMensais) — em modo
          // 'contrato' subtrai o Faturamento Direto (fd_valor manual ou fd_sugerido do BDI),
          // pois a parcela FD é faturada diretamente e não compõe a base do sinal.
          const sinalBase = String(cfg?.sinal_base ?? "contrato");
          const totalMdoProj = parseFloat(p.total_mdo ?? "0") || 0;
          const fdValorCfg = cfg?.fd_valor !== null && cfg?.fd_valor !== undefined
            ? (parseFloat(cfg.fd_valor) || 0)
            : null;
          const fdSugProj  = parseFloat(p.fd_sugerido ?? "0") || 0;
          const fdEfetivo  = fdValorCfg !== null ? fdValorCfg : fdSugProj;
          const baseSinalCalc = sinalBase === "mao_de_obra" && totalMdoProj > 0
            ? totalMdoProj
            : Math.max(0, totalVenda - fdEfetivo);
          const sinalRaw   = sinalValor > 0 ? sinalValor : (baseSinalCalc * sinalPct / 100);
          const sinalTotal = Math.max(0, Math.min(sinalRaw, totalVenda));
          const hasSinal   = sinalTotal > 0 && (dataPrimeiroFat !== null || dataInicioObra !== null);
          const baseMedicoes = hasSinal ? totalVenda - sinalTotal : totalVenda;
          const escala = totalVenda > 0 ? baseMedicoes / totalVenda : 1;
          const mesesOrd = Object.keys(vendaByMes).sort();
          let somaArr = 0, totalRet = 0, lastMes = "";
          for (let i = 0; i < mesesOrd.length; i++) {
            const mes = mesesOrd[i];
            const bruta = i === mesesOrd.length - 1
              ? parseFloat((baseMedicoes - somaArr).toFixed(2))
              : parseFloat(((vendaByMes[mes] ?? 0) * escala).toFixed(2));
            somaArr += bruta;
            const ret = parseFloat((bruta * retencaoPct / 100).toFixed(2));
            // Rev. 1347: usa mês de recebimento (competência + N dias úteis) em vez da
            // própria competência para refletir o ciclo real do cliente.
            const mesRec = shiftToRecebimentoMes(mes, diaCorte, prazoRecDiasUteis);
            result[pid][mesRec] = (result[pid][mesRec] ?? 0) + parseFloat((bruta - ret).toFixed(2));
            totalRet += ret;
            lastMes = mes;
          }
          if (hasSinal) {
            // Rev. 1347: SINAL cai no mês da data de pagamento informada (ou início da obra como fallback).
            // Não soma prazo de dias úteis — sinal é antecipado por contrato.
            const sinalDataExata = dataPrimeiroFat ?? dataInicioObra ?? "";
            const sinalMes = sinalDataExata.substring(0, 7);
            if (sinalMes) result[pid][sinalMes] = (result[pid][sinalMes] ?? 0) + sinalTotal;
          }
          if (totalRet > 0 && lastMes) {
            // Rev. 1347: retenção liberada também sofre prazo de N dias úteis após a competência
            // do mês seguinte ao último mês da obra (mês padrão de liberação).
            const [aU, mU] = lastMes.split("-").map(Number);
            const nd = new Date(aU, mU, 1);
            const liberacaoCompetencia = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`;
            const mesRecRetencao = shiftToRecebimentoMes(liberacaoCompetencia, diaCorte, prazoRecDiasUteis);
            result[pid][mesRecRetencao] = (result[pid][mesRecRetencao] ?? 0) + parseFloat(totalRet.toFixed(2));
          }
        }
      }
      return result;
    };

    // 4+5. Calcula distribuição para cronograma (última revisão) e baseline (primeira revisão)
    const prevByProjeto = buildPrevDist(prevRows);
    const prevBaselineByProjeto = buildPrevDist(prevBaselineRes.rows);

    // 6. Mapa medições salvas por projeto+mês
    const medByProjeto: Record<number, any[]> = {};
    for (const m of medicoes) {
      const pid = Number(m.projeto_id);
      if (!medByProjeto[pid]) medByProjeto[pid] = [];
      medByProjeto[pid].push(m);
    }

    // 6. Meses do ano
    const meses12 = Array.from({ length: 12 }, (_, i) =>
      `${input.ano}-${String(i + 1).padStart(2, "0")}`
    );

    // 7. KPIs e totais mensais
    let totalContrato = 0, totalPrevisto = 0, totalFaturado = 0, totalRecebido = 0, totalPrevisaoFat = 0;
    const totaisMes: Record<string, number> = {};
    for (const p of projetos) {
      totalContrato += parseFloat(p.total_venda ?? p.valor_contrato ?? "0") || 0;
    }
    for (const mes of meses12) {
      for (const pid of projetoIds) {
        // Se há medição salva, usa ela; senão usa previsto calculado.
        // Usa last-wins (igual ao medByMes em projetos.map) para evitar inflação
        // quando existem múltiplos PM records para o mesmo (projeto, mês) — ex:
        // um criado pelo backfill e outro pelo "Dar Baixa".
        const meds = (medByProjeto[pid] ?? []).filter((m: any) => String(m.competencia).slice(0, 7) === mes);
        const lastMed = meds.length > 0 ? meds[meds.length - 1] : null;
        const val = lastMed
          ? (parseFloat(lastMed.valor_medido ?? "0") || parseFloat(lastMed.valor_previsto ?? "0") || 0)
          : (prevByProjeto[pid]?.[mes] ?? 0);
        totaisMes[mes] = (totaisMes[mes] ?? 0) + val;
        totalPrevisto += val;

        // Previsão de faturamento: soma apenas onde não há medição formal nem standalone
        const hasMedicao = meds.length > 0;
        const hasStandalone = !!(standaloneByProjetoByMes[pid]?.[mes]);
        if (!hasMedicao && !hasStandalone) {
          totalPrevisaoFat += previsaoByProjeto[pid]?.[mes] ?? 0;
        }
      }
    }
    // Fallback: sem avanço físico registrado → Prev. Faturamento usa previsto cronograma
    // de meses que ainda não têm medição nem FR standalone (pipeline a ser faturado).
    if (totalPrevisaoFat === 0) {
      for (const mes of meses12) {
        for (const pid of projetoIds) {
          const hasMed = (medByProjeto[pid] ?? []).some(
            (m: any) => String(m.competencia).slice(0, 7) === mes
          );
          const hasSt = !!(standaloneByProjetoByMes[pid]?.[mes]);
          if (!hasMed && !hasSt) {
            totalPrevisaoFat += prevByProjeto[pid]?.[mes] ?? 0;
          }
        }
      }
    }
    // Statuses que representam "já faturado / recebido" (não entram no A Faturar)
    const FATURADO_SET = new Set(["faturado","a_receber","recebido_parcial","recebido_total","confirmado"]);
    // Statuses que representam "previsto puro" (já contados como cronograma no loop acima)
    const PREVISTO_SET = new Set(["previsto","previsao_faturamento",null,undefined]);
    for (const m of medicoes) {
      const val = parseFloat(m.valor_medido ?? "0") || parseFloat(m.valor_previsto ?? "0") || 0;
      // sf: usa status_financeiro se disponível; caso PM seja 'confirmado' trata como recebido_total
      const sf = m.status_financeiro === null && m.status_medicao === "confirmado"
        ? "recebido_total"
        : (m.status_financeiro ?? m.status_medicao);
      if (FATURADO_SET.has(sf)) totalFaturado += val;
      if (["recebido_parcial","recebido_total"].includes(sf)) totalRecebido += parseFloat(m.valor_recebido ?? "0") || val;
      // PM pendente de faturamento (a_faturar): tem valor mas não está confirmada/recebida/previsto-puro
      // Esses meses não foram contados no loop de cronograma (hasMedicao=true → foram pulados)
      if (val > 0 && !FATURADO_SET.has(sf) && !PREVISTO_SET.has(sf ?? null)) {
        totalPrevisaoFat += val;
      }
    }
    // Standalone FRs (Dar Baixa direto, sem medicao) — só contar meses sem PM para evitar dupla contagem
    for (const [pidStr, mesMap] of Object.entries(standaloneByProjetoByMes)) {
      const pid = Number(pidStr);
      for (const [mes, fr] of Object.entries(mesMap as Record<string, any>)) {
        const hasPm = (medByProjeto[pid] ?? []).some(
          (m: any) => String(m.competencia).slice(0, 7) === mes
        );
        if (hasPm) continue; // PM já contabilizado no loop anterior
        const sf = (fr as any).status;
        if (["recebido_parcial","recebido_total"].includes(sf)) {
          totalRecebido += parseFloat((fr as any).valor_recebido ?? "0") || 0;
          totalFaturado += parseFloat((fr as any).valor_recebido ?? "0") || 0;
        }
      }
    }

    return {
      ano: input.ano,
      projetos: projetos.map((p: any) => {
        const pid = Number(p.projeto_id);
        const meds = medByProjeto[pid] ?? [];
        const medByMes: Record<string, any> = {};
        for (const m of meds) medByMes[String(m.competencia).slice(0, 7)] = m;
        const valorContrato = parseFloat(p.total_venda ?? p.valor_contrato ?? "0") || 0;
        const totalRecebidoHistorico = totalRecebidoHistByProjId[pid] ?? 0;
        const avancoFisicoReal = avancoFisicoByProjId[pid] ?? null;
        return {
          projetoId: pid,
          obraId: p.obra_id ? Number(p.obra_id) : null,
          obraNome: p.obra_nome ?? p.projeto_nome,
          cliente: p.cliente,
          valorContrato,
          totalRecebidoHistorico,
          avancoFisicoReal,
          saldoContrato: Math.max(0, valorContrato - totalRecebidoHistorico),
          // Células mensais: previsto calculado + realizado salvo + previsão faturamento
          meses: Object.fromEntries(meses12.map(mes => {
            const previsto = prevByProjeto[pid]?.[mes] ?? 0;
            const prevBaseline = prevBaselineByProjeto[pid]?.[mes] ?? 0;
            const previsao = previsaoByProjeto[pid]?.[mes] ?? 0;
            const med = medByMes[mes];
            const standaloneFr = standaloneByProjetoByMes[pid]?.[mes] ?? null;
            const valorMedido = med ? (parseFloat(med.valor_medido ?? "0") || parseFloat(med.valor_previsto ?? "0") || 0) : 0;
            let sf: string | null;
            let frId: number | null = null;
            let dataRecebimento: string | null = null;
            let valorRecebido = 0;
            let dataVencimento: string | null = null;
            let nfNumero: string | null = null;
            let contaBancariaId: number | null = null;
            if (med) {
              sf = med.status_financeiro ?? med.status_medicao ?? "previsto";
              frId = med.fr_id ?? null;
              dataRecebimento = med.data_recebimento ?? null;
              valorRecebido = parseFloat(med.valor_recebido ?? "0") || 0;
              dataVencimento = med.data_vencimento ?? null;
              nfNumero = med.nf_numero ?? null;
              contaBancariaId = med.conta_bancaria_id ?? null;
              // PM confirmada mas sem FR vinculado (registrarRecebimento cria FR com
              // medicao_id=NULL, então o LEFT JOIN não encontra). Mescla dados do FR
              // standalone SOMENTE se o FR for 'recebido_total' — nunca 'a_faturar'.
              if (!med.fr_id && !med.status_financeiro && sf === "confirmado" &&
                  standaloneFr?.status === "recebido_total") {
                sf = "recebido_total";
                frId = Number(standaloneFr.id);
                dataRecebimento = standaloneFr.data_recebimento ?? null;
                valorRecebido = parseFloat(standaloneFr.valor_recebido ?? "0") || 0;
                dataVencimento = standaloneFr.data_vencimento ?? null;
                nfNumero = standaloneFr.nf_numero ?? null;
                contaBancariaId = standaloneFr.conta_bancaria_id ?? null;
              } else if (!med.fr_id && !med.status_financeiro && sf === "confirmado") {
                // Sem FR standalone também: trata como recebido_total para exibição correta
                sf = "recebido_total";
                valorRecebido = valorMedido;
              }
            } else if (standaloneFr) {
              sf = standaloneFr.status ?? "recebido_total";
              frId = Number(standaloneFr.id);
              dataRecebimento = standaloneFr.data_recebimento ?? null;
              valorRecebido = parseFloat(standaloneFr.valor_recebido ?? "0") || 0;
              dataVencimento = standaloneFr.data_vencimento ?? null;
              nfNumero = standaloneFr.nf_numero ?? null;
              contaBancariaId = standaloneFr.conta_bancaria_id ?? null;
            } else {
              sf = previsto > 0 ? "previsto" : (previsao > 0 ? "previsao_faturamento" : null);
            }
            return [mes, {
              valorPrevisto: previsto,
              valorContratoBL: prevBaseline,
              valorMedido,
              valorPrevisao: previsao,
              status: sf,
              medicaoId: med?.id ?? null,
              frId,
              nfNumero,
              dataVencimento,
              dataRecebimento,
              valorRecebido,
              contaBancariaId,
            }];
          })),
          // Medições salvas (compatibilidade com painel lateral)
          medicoes: meds.map((m: any) => ({
            id: m.id,
            competencia: String(m.competencia).slice(0, 7),
            numero: m.numero,
            valorPrevisto: parseFloat(m.valor_previsto ?? "0") || 0,
            valorMedido: parseFloat(m.valor_medido ?? "0") || 0,
            percentualPrevisto: parseFloat(m.percentual_previsto ?? "0") || 0,
            percentualMedido: parseFloat(m.percentual_medido ?? "0") || 0,
            statusMedicao: m.status_medicao ?? "pendente",
            statusFinanceiro: m.status_financeiro ?? null,
            frId: m.fr_id ?? null,
            nfNumero: m.nf_numero ?? null,
            dataVencimento: m.data_vencimento ?? null,
            dataRecebimento: m.data_recebimento ?? null,
            valorRecebido: parseFloat(m.valor_recebido ?? "0") || 0,
          })),
        };
      }),
      totaisMes,
      kpis: {
        totalContrato,
        totalPrevisto,
        totalPrevisaoFaturamento: totalPrevisaoFat,
        totalFaturado,
        totalAReceber: Math.max(0, totalFaturado - totalRecebido),
        totalRecebido,
      },
    };
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // Rev. 1631 — ANÁLISE CFO (6 KPIs Hackett/APQC/IFRS/AFP em 1 endpoint)
  //   1) Hackett: DPO + DSO + CCC + on-time + eletrônico (com benchmark setor)
  //   2) Variance Orçado × Realizado × Forecast por categoria (semáforo)
  //   3) Cash Forecast 13 semanas — 3 cenários (AFP Treasury Guidelines)
  //   4) PDD IFRS 9 / CPC 48 (estágios 1-30/31-60/61-90/+90 com %s 0,5/2/10/50)
  //   5) Pareto 80/20 fornecedores (top concentração de gasto)
  //   6) Pareto 80/20 clientes (top concentração de receita)
  //   7) KPIs de processo AP (% NF no prazo, % manual, custo estimado/fatura)
  // ═══════════════════════════════════════════════════════════════════════════
  getAnaliticosCFO: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const idsSql = inlineIds(ids);
    const today = new Date().toISOString().slice(0, 10);

    // ─── 1) HACKETT: DPO, DSO, CCC, on-time, eletrônico ──────────────────────
    const [dpoRes, dsoRes, agingRecRes, onTimeRes, eletronicoRes] = await Promise.all([
      // DPO: média (data_pagamento - data_competencia) em despesas pagas últimos 90d
      dbExecute(db,
        `SELECT
           AVG(EXTRACT(EPOCH FROM (data_pagamento::timestamp - data_competencia::timestamp))/86400) AS dpo,
           COUNT(*) AS qtd
         FROM financial_entries
         WHERE company_id IN (${idsSql})
           AND tipo='despesa' AND status='pago'
           AND data_pagamento IS NOT NULL AND data_competencia IS NOT NULL
           AND data_pagamento >= (CURRENT_DATE - INTERVAL '90 days')`, []
      ),
      // DSO: média (data_recebimento - nf_emitida_em) em receitas recebidas últimos 90d
      dbExecute(db,
        `SELECT
           AVG(EXTRACT(EPOCH FROM (data_recebimento::timestamp -
             COALESCE(nf_emitida_em::timestamp, data_vencimento::timestamp - INTERVAL '30 days')))/86400) AS dso,
           COUNT(*) AS qtd
         FROM financial_revenue
         WHERE company_id IN (${idsSql})
           AND data_recebimento IS NOT NULL
           AND status IN ('recebido_total','recebido_parcial')
           AND data_recebimento >= (CURRENT_DATE - INTERVAL '90 days')`, []
      ),
      // Aging A Receber (para PDD)
      dbExecute(db,
        `SELECT
           CASE
             WHEN (CURRENT_DATE - data_vencimento) BETWEEN 1 AND 30 THEN '1_30'
             WHEN (CURRENT_DATE - data_vencimento) BETWEEN 31 AND 60 THEN '31_60'
             WHEN (CURRENT_DATE - data_vencimento) BETWEEN 61 AND 90 THEN '61_90'
             WHEN (CURRENT_DATE - data_vencimento) > 90 THEN 'mais_90'
             ELSE 'em_dia'
           END AS faixa,
           COALESCE(SUM(valor_previsto - COALESCE(valor_recebido,0)),0) AS total,
           COUNT(*) AS qtd
         FROM financial_revenue
         WHERE company_id IN (${idsSql})
           AND status NOT IN ('recebido_total','cancelado')
           AND data_vencimento IS NOT NULL
         GROUP BY faixa`, []
      ),
      // % on-time pay (despesas pagas no prazo)
      dbExecute(db,
        `SELECT
           SUM(CASE WHEN data_pagamento <= data_vencimento THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*),0) * 100 AS pct,
           COUNT(*) AS total
         FROM financial_entries
         WHERE company_id IN (${idsSql})
           AND tipo='despesa' AND status='pago'
           AND data_pagamento IS NOT NULL AND data_vencimento IS NOT NULL
           AND data_pagamento >= (CURRENT_DATE - INTERVAL '180 days')`, []
      ),
      // % pagamento eletrônico (PIX/TED/débito automático)
      dbExecute(db,
        `SELECT
           SUM(CASE WHEN LOWER(forma_pagamento) IN ('pix','ted','debito_automatico') THEN 1 ELSE 0 END)::float
             / NULLIF(COUNT(*),0) * 100 AS pct,
           COUNT(*) AS total
         FROM financial_entries
         WHERE company_id IN (${idsSql})
           AND tipo='despesa' AND status='pago' AND forma_pagamento IS NOT NULL
           AND data_pagamento >= (CURRENT_DATE - INTERVAL '180 days')`, []
      ),
    ]);

    const dpo = Math.round(Number(rows(dpoRes)[0]?.dpo ?? 0));
    const dso = Math.round(Number(rows(dsoRes)[0]?.dso ?? 0));
    const dio = 0; // Construção: WIP rotacional não medido aqui
    const ccc = dso + dio - dpo;
    const onTimePct = Math.round(Number(rows(onTimeRes)[0]?.pct ?? 0));
    const eletronicoPct = Math.round(Number(rows(eletronicoRes)[0]?.pct ?? 0));

    // ─── 2) VARIANCE: Orçado × Realizado × Forecast (mês corrente, por categoria)
    const mesAtual = today.slice(0, 7);
    const varianceRes = await dbExecute(db,
      `SELECT
         COALESCE(conta_nome, 'Sem categoria') AS categoria,
         SUM(CASE WHEN status='previsto' AND data_competencia::date >= CURRENT_DATE
                  THEN valor_previsto ELSE 0 END) AS forecast,
         SUM(CASE WHEN status='pago' AND TO_CHAR(data_competencia,'YYYY-MM')=$1
                  THEN COALESCE(valor_realizado, valor_previsto) ELSE 0 END) AS realizado,
         SUM(CASE WHEN TO_CHAR(data_competencia,'YYYY-MM')=$1
                  THEN valor_previsto ELSE 0 END) AS orcado_mes
       FROM financial_entries
       WHERE company_id IN (${idsSql}) AND tipo='despesa'
         AND data_competencia >= (CURRENT_DATE - INTERVAL '60 days')
       GROUP BY conta_nome
       HAVING SUM(valor_previsto) > 1000
       ORDER BY orcado_mes DESC NULLS LAST
       LIMIT 12`,
      [mesAtual]
    );
    const variance = rows(varianceRes).map((r: any) => {
      const orcado = Number(r.orcado_mes ?? 0);
      const realizado = Number(r.realizado ?? 0);
      const forecast = Number(r.forecast ?? 0);
      const varAbs = realizado - orcado;
      const varPct = orcado > 0 ? (varAbs / orcado) * 100 : 0;
      const semaforo = Math.abs(varPct) <= 5 ? "verde" : Math.abs(varPct) <= 10 ? "amarelo" : "vermelho";
      return { categoria: r.categoria, orcado, realizado, forecast, varAbs, varPct, semaforo };
    });

    // ─── 3) CASH FORECAST 13 SEMANAS (AFP) — 3 cenários ──────────────────────
    // Saldo bancário consolidado de partida
    const [saldoIniRes, semanaisInRes, semanaisOutRes] = await Promise.all([
      dbExecute(db,
        `SELECT COALESCE(SUM(valor),0) AS total FROM financial_opening_balances
         WHERE company_id IN (${idsSql})`, []
      ),
      // Receitas previstas/a receber por semana (próximas 13 semanas)
      dbExecute(db,
        `SELECT FLOOR((data_vencimento::date - CURRENT_DATE) / 7)::int AS semana,
                COALESCE(SUM(valor_previsto - COALESCE(valor_recebido,0)),0) AS total
         FROM financial_revenue
         WHERE company_id IN (${idsSql})
           AND status NOT IN ('recebido_total','cancelado')
           AND data_vencimento::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '91 days')
         GROUP BY semana`, []
      ),
      // Despesas a pagar por semana (próximas 13 semanas)
      dbExecute(db,
        `SELECT FLOOR((data_vencimento::date - CURRENT_DATE) / 7)::int AS semana,
                COALESCE(SUM(valor_previsto),0) AS total
         FROM financial_entries
         WHERE company_id IN (${idsSql})
           AND tipo='despesa' AND status IN ('a_pagar','previsto')
           AND data_vencimento IS NOT NULL
           AND data_vencimento::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '91 days')
         GROUP BY semana`, []
      ),
    ]);
    const saldoInicial = Number(rows(saldoIniRes)[0]?.total ?? 0);
    const inMap = new Map(rows(semanaisInRes).map((r: any) => [Number(r.semana), Number(r.total)]));
    const outMap = new Map(rows(semanaisOutRes).map((r: any) => [Number(r.semana), Number(r.total)]));
    const cenarios: Record<string, { fIn: number; fOut: number }> = {
      base:       { fIn: 1.00, fOut: 1.00 },
      otimista:   { fIn: 1.10, fOut: 0.95 },
      pessimista: { fIn: 0.85, fOut: 1.05 },
    };
    const cash13w: Record<string, any[]> = { base: [], otimista: [], pessimista: [] };
    for (const cen of Object.keys(cenarios)) {
      const { fIn, fOut } = cenarios[cen];
      let saldo = saldoInicial;
      for (let s = 0; s < 13; s++) {
        const entrada = (inMap.get(s) ?? 0) * fIn;
        const saida = (outMap.get(s) ?? 0) * fOut;
        saldo += entrada - saida;
        const dataIni = new Date();
        dataIni.setDate(dataIni.getDate() + s * 7);
        cash13w[cen].push({
          semana: s + 1,
          dataIni: dataIni.toISOString().slice(0, 10),
          entradas: entrada, saidas: saida, saldo,
        });
      }
    }

    // ─── 4) PDD IFRS 9 — provisão por estágio ────────────────────────────────
    const aging = rows(agingRecRes);
    const get = (f: string) => Number(aging.find((r: any) => r.faixa === f)?.total ?? 0);
    const stages = [
      { faixa: "1_30",    label: "1-30 dias",  perc: 0.5,  total: get("1_30") },
      { faixa: "31_60",   label: "31-60 dias", perc: 2,    total: get("31_60") },
      { faixa: "61_90",   label: "61-90 dias", perc: 10,   total: get("61_90") },
      { faixa: "mais_90", label: "+90 dias",   perc: 50,   total: get("mais_90") },
    ];
    const pddIfrs9 = stages.map(s => ({
      ...s,
      provisao: s.total * (s.perc / 100),
    }));
    const pddTotal = pddIfrs9.reduce((acc, s) => acc + s.provisao, 0);

    // ─── 5) PARETO FORNECEDORES (top concentração de gasto últimos 12m) ──────
    const paretoFornRes = await dbExecute(db,
      `SELECT
         COALESCE(NULLIF(TRIM(origem_descricao), ''),
                  NULLIF(TRIM(descricao), ''),
                  conta_nome, 'Sem identificação') AS nome,
         COALESCE(SUM(COALESCE(valor_realizado, valor_previsto)),0) AS total,
         COUNT(*) AS qtd
       FROM financial_entries
       WHERE company_id IN (${idsSql}) AND tipo='despesa'
         AND status IN ('pago','a_pagar')
         AND data_competencia >= (CURRENT_DATE - INTERVAL '12 months')
       GROUP BY nome
       HAVING SUM(COALESCE(valor_realizado, valor_previsto)) > 0
       ORDER BY total DESC
       LIMIT 30`, []
    );
    const fornRows = rows(paretoFornRes);
    const fornTotal = fornRows.reduce((s: number, r: any) => s + Number(r.total), 0);
    let acumF = 0;
    const paretoFornecedores = fornRows.map((r: any) => {
      const valor = Number(r.total);
      acumF += valor;
      return {
        nome: r.nome,
        total: valor,
        qtd: Number(r.qtd),
        pct: fornTotal > 0 ? (valor / fornTotal) * 100 : 0,
        pctAcum: fornTotal > 0 ? (acumF / fornTotal) * 100 : 0,
      };
    });
    const top80Forn = paretoFornecedores.findIndex(f => f.pctAcum >= 80) + 1;

    // ─── 6) PARETO CLIENTES (top concentração de receita últimos 12m) ────────
    const paretoCliRes = await dbExecute(db,
      `SELECT
         COALESCE(NULLIF(TRIM(cliente_nome), ''), 'Sem identificação') AS nome,
         COALESCE(SUM(COALESCE(valor_recebido, valor_medicao)),0) AS total,
         COUNT(*) AS qtd
       FROM financial_revenue
       WHERE company_id IN (${idsSql})
         AND status NOT IN ('cancelado')
         AND COALESCE(data_recebimento, data_vencimento, created_at::date) >= (CURRENT_DATE - INTERVAL '12 months')
       GROUP BY nome
       HAVING SUM(COALESCE(valor_recebido, valor_medicao)) > 0
       ORDER BY total DESC
       LIMIT 30`, []
    );
    const cliRows = rows(paretoCliRes);
    const cliTotal = cliRows.reduce((s: number, r: any) => s + Number(r.total), 0);
    let acumC = 0;
    const paretoClientes = cliRows.map((r: any) => {
      const valor = Number(r.total);
      acumC += valor;
      return {
        nome: r.nome,
        total: valor,
        qtd: Number(r.qtd),
        pct: cliTotal > 0 ? (valor / cliTotal) * 100 : 0,
        pctAcum: cliTotal > 0 ? (acumC / cliTotal) * 100 : 0,
      };
    });
    const top80Cli = paretoClientes.findIndex(c => c.pctAcum >= 80) + 1;

    // ─── 7) KPIs DE PROCESSO AP (Hackett) ────────────────────────────────────
    const totalPagos = Number(rows(onTimeRes)[0]?.total ?? 0);
    const custoBenchmarkPorFatura = 30; // R$/fatura (benchmark Hackett ~US$5-7)
    const kpisProcesso = {
      pctNfNoPrazo: onTimePct,
      pctPagamentoEletronico: eletronicoPct,
      pctPagamentoManual: 100 - eletronicoPct,
      faturasUltimos180d: totalPagos,
      custoEstimadoAP: totalPagos * custoBenchmarkPorFatura,
      custoBenchmarkPorFatura,
    };

    return {
      hackett: {
        dpo, dso, dio, ccc, onTimePct, eletronicoPct,
        // Benchmarks setor construção civil (Hackett 2024 + APQC PCF)
        benchmark: {
          dpoTopQuartile: 45, dpoMediano: 30,
          dsoTopQuartile: 60, dsoMediano: 90,
          cccTopQuartile: 25, cccMediano: 60,
          onTimeTopQuartile: 95,
        },
      },
      variance,
      cash13w,
      cash13wMeta: { saldoInicial },
      pddIfrs9: { stages: pddIfrs9, total: pddTotal },
      paretoFornecedores: { rows: paretoFornecedores, total: fornTotal, top80: top80Forn },
      paretoClientes: { rows: paretoClientes, total: cliTotal, top80: top80Cli },
      kpisProcesso,
    };
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 2 — CFO SUITE
  // ═══════════════════════════════════════════════════════════════════════════
  getThreeWayMatch: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    return await computeThreeWayMatch(db, ids);
  }),

  blockPaymentByThreeWay: protectedProcedure.input(z.object({
    companyId: z.number(),
    financialEntryId: z.number(),
    motivo: z.string().min(3),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await blockPaymentByThreeWay(db, input.companyId, input.financialEntryId, input.motivo);
    await createAuditLog({ action: "BLOCK_3WM", userId: ctx.user?.id, companyId: input.companyId, details: `Entry ${input.financialEntryId}: ${input.motivo}` });
    return { success: true };
  }),

  releasePaymentByThreeWay: protectedProcedure.input(z.object({
    companyId: z.number(),
    financialEntryId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await releasePaymentByThreeWay(db, input.companyId, input.financialEntryId);
    await createAuditLog({ action: "RELEASE_3WM", userId: ctx.user?.id, companyId: input.companyId, details: `Entry ${input.financialEntryId} liberado` });
    return { success: true };
  }),

  reconcileBankFile: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    contaBancariaId: z.number().nullable().optional(),
    formato: z.enum(["ofx", "cnab"]),
    conteudo: z.string().min(20),
    useAI: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    const lines = input.formato === "ofx" ? parseOFX(input.conteudo) : parseCNAB(input.conteudo);
    if (!lines.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma movimentação detectada no arquivo." });
    }
    const sugestoes = await suggestReconciliation(db, ids, input.contaBancariaId ?? null, lines, input.useAI ?? true);
    return { totalLinhas: lines.length, sugestoes };
  }),

  applyReconciliationMatches: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    matches: z.array(z.object({
      ofxLine: z.object({
        data: z.string(),
        valor: z.number(),
        descricao: z.string(),
        tipo: z.enum(["credito", "debito"]),
        fitId: z.string(),
      }),
      entryId: z.number(),
    })),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const out = await applyReconciliation(db, input.companyId, input.contaBancariaId, input.matches);
    await createAuditLog({ action: "RECONCILE", userId: ctx.user?.id, companyId: input.companyId, details: `${out.aplicados} matches aplicados` });
    return out;
  }),

  getDynamicDiscountOffers: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    taxaWaccAA: z.number().min(0).max(100).optional(),
    janelaDias: z.number().min(7).max(365).optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    return await computeDynamicDiscounting(db, ids, input.taxaWaccAA ?? 18, input.janelaDias ?? 60);
  }),

  getDREDual: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    ano: z.number().int().min(2020).max(2100),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    return await computeDREDual(db, ids, input.ano);
  }),

  getFinancialAlerts: protectedProcedure.input(z.object({
    companyId: z.number(),
    companyIds: z.array(z.number()).optional(),
    apenasNaoLidas: z.boolean().optional(),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ids = resolveCompanyIds(input);
    return await getAlertsForCompany(db, ids, input.apenasNaoLidas ?? false);
  }),

  regenerateFinancialAlerts: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const inseridos = await generateFinancialAlerts(db, input.companyId);
    return { inseridos };
  }),

  markAlertRead: protectedProcedure.input(z.object({
    companyId: z.number(),
    alertId: z.number(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await markAlertRead(db, input.companyId, input.alertId ?? 0, String(ctx.user?.id ?? ""));
    return { success: true };
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // Rev. 3161 — RECEBÍVEIS PREVISTOS (transferência manual → Contas a Receber)
  // A materialização automática financial_revenue → financial_entries foi
  // desligada (ver financialIntegrationBridge.runAllReceitasImport). Estas duas
  // procedures listam os previstos ainda NÃO lançados e os materializam sob
  // demanda. NB: dbExecute liga params por ORDEM DE APARIÇÃO do $N (o número é
  // cosmético) → repetir o valor no array sempre que o placeholder reaparece.
  // ─────────────────────────────────────────────────────────────────────────
  getRecebiveisPrevistos: protectedProcedure.input(z.object({
    companyId: z.number(),
    mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  })).query(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const mes = input.mes ?? null;
    const res = await dbExecute(db,
      `SELECT fr.id, fr.obra_id, fr.obra_nome, fr.cliente_nome, fr.valor_medicao,
              fr.valor_liquido_receber, fr.medicao_numero, fr.medicao_id,
              fr.data_vencimento, fr.status, fr.created_at
       FROM financial_revenue fr
       WHERE fr.company_id = $1
         AND fr.status NOT IN ('cancelado','recebido_total')
         AND fr.valor_medicao > 0
         AND NOT EXISTS (
           SELECT 1 FROM financial_entries fe
           WHERE fe.origem_modulo='revenue' AND fe.origem_id=fr.id AND fe.company_id=fr.company_id
             AND COALESCE(fe.status,'') <> 'cancelado'
         )
         AND NOT EXISTS (
           SELECT 1 FROM financial_entries fe2
           WHERE fe2.company_id=fr.company_id
             AND fe2.origem_modulo='planejamento_medicao'
             AND fe2.origem_id=fr.medicao_id
             AND COALESCE(fe2.status,'') <> 'cancelado'
         )
         AND ($2::text IS NULL OR TO_CHAR(COALESCE(fr.data_vencimento::date, fr.created_at::date),'YYYY-MM')=$3)
       ORDER BY COALESCE(fr.data_vencimento::date, fr.created_at::date) ASC, fr.id ASC
       LIMIT 1000`,
      [input.companyId, mes, mes]
    );
    const items = rows(res).map((r: any) => {
      const valor = parseFloat(r.valor_liquido_receber ?? r.valor_medicao ?? "0") || 0;
      const venc = r.data_vencimento ? String(r.data_vencimento).slice(0, 10) : null;
      return {
        id: Number(r.id),
        obraId: r.obra_id ?? null,
        obraNome: r.obra_nome ?? null,
        clienteNome: r.cliente_nome ?? null,
        medicaoNumero: r.medicao_numero ?? null,
        valor,
        dataVencimento: venc,
        status: r.status ?? null,
      };
    }).filter((x: any) => x.valor > 0);
    const valorTotal = items.reduce((s: number, x: any) => s + x.valor, 0);
    return { items, total: items.length, valorTotal };
  }),

  transferirRecebiveisPrevistos: protectedProcedure.input(z.object({
    companyId: z.number(),
    ids: z.array(z.number()).min(1),
  })).mutation(async ({ input, ctx }) => {
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const statusMap: Record<string, string> = {
      a_faturar: "a_receber", faturado: "a_receber", a_receber: "a_receber",
      recebido_parcial: "recebido_parcial", recebido_total: "recebido", cancelado: "cancelado",
    };
    const criadoPorId = ctx.user?.id ?? null;
    const criadoPorNome = (ctx.user as any)?.name ?? (ctx.user as any)?.nome ?? null;
    const idList = inlineIds(input.ids);

    // Só os IDs DESTA empresa e ainda não lançados (mesma régua de dedup da lista).
    const sel = await dbExecute(db,
      `SELECT fr.id, fr.obra_id, fr.obra_nome, fr.cliente_nome, fr.valor_medicao,
              fr.valor_liquido_receber, fr.medicao_numero, fr.data_vencimento, fr.status, fr.created_at
       FROM financial_revenue fr
       WHERE fr.company_id=$1
         AND fr.id IN (${idList})
         AND fr.status NOT IN ('cancelado','recebido_total')
         AND fr.valor_medicao > 0
         AND NOT EXISTS (
           SELECT 1 FROM financial_entries fe
           WHERE fe.origem_modulo='revenue' AND fe.origem_id=fr.id AND fe.company_id=fr.company_id
             AND COALESCE(fe.status,'') <> 'cancelado'
         )
         AND NOT EXISTS (
           SELECT 1 FROM financial_entries fe2
           WHERE fe2.company_id=fr.company_id
             AND fe2.origem_modulo='planejamento_medicao'
             AND fe2.origem_id=fr.medicao_id
             AND COALESCE(fe2.status,'') <> 'cancelado'
         )`,
      [input.companyId]
    );
    const candidatos = rows(sel) as any[];

    let lancados = 0;
    let pulados = 0;
    await db.transaction(async (tx: any) => {
      // Rev. 3161 — serializa transferências concorrentes da MESMA empresa (clique
      // duplo / dois usuários). Sem isso, dois NOT EXISTS poderiam passar juntos e
      // inserir o par 'revenue' em duplicidade (não há índice único). Lock por
      // transação (libera no commit/rollback), SEM DDL/ALTER.
      await dbExecute(tx, `SELECT pg_advisory_xact_lock(hashtext('fin_recebiveis_previstos'), $1)`, [input.companyId]);
      for (const r of candidatos) {
        const valor = parseFloat(r.valor_liquido_receber ?? r.valor_medicao ?? "0") || 0;
        if (valor <= 0) { pulados++; continue; }
        const vencimento = r.data_vencimento ? String(r.data_vencimento).slice(0, 10) : null;
        const mesCompetencia = (vencimento ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
        const numInfo = r.medicao_numero ? ` #${r.medicao_numero}` : "";
        const clienteInfo = r.cliente_nome ? ` — ${r.cliente_nome}` : "";
        const entryStatus = statusMap[r.status] ?? "a_receber";
        // ATÔMICO + idempotente: o WHERE NOT EXISTS re-checa o par origem='revenue'
        // dentro da transação (cliques duplicados / dois usuários não duplicam).
        const ins = await dbExecute(tx,
          `INSERT INTO financial_entries
             (company_id, obra_id, obra_nome, conta_nome, tipo, natureza,
              valor_previsto, data_competencia, data_vencimento, status,
              origem_modulo, origem_id, origem_descricao, descricao,
              criado_por_id, criado_por_nome, created_at, updated_at)
           SELECT $1,$2,$3,$4,'receita','variavel',$5,$6,$7,$8,'revenue',$9,$10,$11,$12,$13,NOW(),NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM financial_entries fe
             WHERE fe.origem_modulo='revenue' AND fe.origem_id=$14 AND fe.company_id=$15
               AND COALESCE(fe.status,'') <> 'cancelado'
           )
           RETURNING id`,
          [
            input.companyId, r.obra_id ?? null, r.obra_nome ?? null, "Faturamento de Obras",
            valor, mesCompetencia + "-01", vencimento, entryStatus,
            r.id, `Medição${numInfo} — ${r.obra_nome ?? "Obra"}${clienteInfo}`,
            `Faturamento${numInfo}: ${r.obra_nome ?? "Obra"}`,
            criadoPorId, criadoPorNome,
            r.id, input.companyId,
          ]
        );
        if (rows(ins).length > 0) lancados++; else pulados++;
      }
    });

    await createAuditLog({
      action: "financial_recebiveis_previstos_transferidos",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Recebíveis previstos → Contas a Receber: ${lancados} lançado(s), ${pulados} pulado(s) (de ${input.ids.length} solicitado(s)).`,
    });

    return { lancados, pulados, solicitados: input.ids.length };
  }),

  // Rev. 3430 — Busca PIX/TED em bank_statement_lines além do mês carregado na conciliação.
  // Útil quando o cheque foi devolvido num mês e o PIX/TED substituto saiu em outro mês.
  searchPixTedOutrosMeses: protectedProcedure.input(z.object({
    companyId: z.number(),
    contaBancariaId: z.number(),
    dataRef: z.string(),       // YYYY-MM-DD — data do cheque devolvido
    valorRef: z.number().optional(), // valor absoluto do cheque em reais (para ordenar por proximidade)
    mesesAntes: z.number().min(0).max(12).default(1),
    mesesDepois: z.number().min(0).max(12).default(6),
    busca: z.string().optional(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await assertCompanyAccess(ctx, input.companyId);
    const r = await dbExecute(db,
      `SELECT id, data, descricao, valor, conciliado, entry_id AS "entryId"
         FROM bank_statement_lines
        WHERE company_id=$1
          AND conta_bancaria_id=$2
          AND excluido_em IS NULL
          AND valor < 0
          AND (UPPER(descricao) LIKE '%PIX%'
            OR UPPER(descricao) LIKE '%TED%'
            OR UPPER(descricao) LIKE '%TRANSF%')
          AND data >= ($3::date - ($4 || ' months')::interval)::date
          AND data <= ($3::date + ($5 || ' months')::interval)::date
        ORDER BY ABS(valor + $6::numeric) ASC, data DESC, id DESC
        LIMIT 200`,
      [input.companyId, input.contaBancariaId,
       input.dataRef, String(input.mesesAntes), String(input.mesesDepois),
       String(input.valorRef ?? 0)]);
    let linhas = rows(r) as any[];
    if (input.busca) {
      const b = input.busca.toLowerCase().replace(/\s/g, "");
      linhas = linhas.filter((l: any) => {
        if (String(l.descricao ?? "").toLowerCase().includes(b)) return true;
        const abs = Math.abs(Number(l.valor) || 0);
        if (abs > 0) {
          const brFmt = abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, "");
          if (brFmt.includes(b)) return true;
        }
        return false;
      });
    }
    return { linhas };
  }),

  // Rev. 3416 — Vincula um cheque devolvido a um pagamento substituto (PIX/TED).
  // Grava no Controle de Cheques: status='compensado_pix', data_compensacao, observacao.
  // Usado tanto para a sugestão automática (usuário confirma) quanto para vínculo manual.
  vincularChequePix: protectedProcedure.input(z.object({
    companyId: z.number(),
    numeroCheque: z.string().min(1),
    pixData: z.string().min(1),
    pixDescricao: z.string().optional(),
    pixValor: z.number().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await assertCompanyAccess(ctx, input.companyId);
    const nota = `Pago via PIX/TED em ${input.pixData}${input.pixDescricao ? `: ${input.pixDescricao.slice(0, 200)}` : ""}`;
    const r = await dbExecute(db,
      `UPDATE financial_cheques
          SET status='compensado_pix',
              data_compensacao=COALESCE(data_compensacao, $1::date),
              observacao=CASE WHEN observacao IS NULL OR observacao='' THEN $2 ELSE observacao || E'\n' || $2 END,
              updated_at=NOW()
        WHERE company_id=$3
          AND excluido_em IS NULL
          AND regexp_replace(numero_cheque,'[^0-9]','','g') = regexp_replace($4,'[^0-9]','','g')
        RETURNING id`,
      [input.pixData, nota, input.companyId, input.numeroCheque]);
    const updated = rows(r).length;
    await createAuditLog({
      action: "cheque_vinculado_pix",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Cheque nº ${input.numeroCheque} marcado como compensado_pix em ${input.pixData}${input.pixDescricao ? ` — ${input.pixDescricao.slice(0, 100)}` : ""}`,
    });
    return { updated };
  }),

  // ───────────────────────────────────────────────────────────────────────────
  // Rev. 3747 — VÍNCULO de cheque devolvido ↔ pagamento(s) substituto(s) (PIX/TED).
  // Suporta 1→N vínculos parciais ancorados na LINHA DE DÉBITO do cheque no extrato
  // (id estável; funciona SEM número). REGRA DE OURO: NUNCA cria/altera linha no
  // extrato — só aponta uma linha que JÁ existe (qualquer conta) e marca o cheque.
  // Quando a soma dos vínculos cobre o cheque, o par (débito+crédito) é auto-
  // desconsiderado do % (marca automática, distinta do desconsiderar manual).
  // ───────────────────────────────────────────────────────────────────────────
  registrarVinculoChequeDevolvido: protectedProcedure.input(z.object({
    companyId: z.number(),
    debitoLineId: z.number(),
    creditoLineId: z.number().optional(),
    chequeNumero: z.string().optional(),
    tipo: z.enum(["pix", "ajuste"]).default("pix"),
    // Rev. 4081 — obrigatório quando tipo='ajuste': COMO essa parcela foi paga sem linha
    // de extrato (dinheiro em mãos, depósito, compensação com outro cheque etc.).
    formaPagamento: z.enum(["dinheiro", "deposito", "cheque_proprio", "outro"]).optional(),
    pixLineId: z.number().optional(),
    valor: z.number().positive(),
    data: z.string().optional(),
    descricao: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const MARCA_AUTO = "Vínculo PIX/TED (automático)";

    // 1) valida a linha de DÉBITO (cheque devolvido) — empresa + é saída (valor<0)
    const debSel = await dbExecute(db,
      `SELECT id, valor, descricao, conta_bancaria_id AS "contaId"
         FROM bank_statement_lines
        WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL`,
      [input.debitoLineId, input.companyId]);
    const deb = rows(debSel)[0] as any;
    if (!deb) throw new TRPCError({ code: "BAD_REQUEST", message: "Linha do cheque (débito) não encontrada nesta empresa." });
    if (Number(deb.valor) >= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A linha do cheque deve ser um débito (saída) do extrato." });
    const chequeCents = Math.round(Math.abs(Number(deb.valor)) * 100);

    // 2) valida a linha do PIX/TED substituto (qualquer conta da empresa) p/ tipo 'pix'
    let pixLine: any = null;
    if (input.tipo === "pix") {
      if (!input.pixLineId) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a linha do PIX/TED do extrato." });
      if (Number(input.pixLineId) === Number(input.debitoLineId)) throw new TRPCError({ code: "BAD_REQUEST", message: "A linha do pagamento não pode ser a própria linha do cheque." });
      const pixSel = await dbExecute(db,
        `SELECT id, valor, descricao, to_char(data,'YYYY-MM-DD') AS data, conta_bancaria_id AS "contaId"
           FROM bank_statement_lines
          WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL`,
        [input.pixLineId, input.companyId]);
      pixLine = rows(pixSel)[0] as any;
      if (!pixLine) throw new TRPCError({ code: "BAD_REQUEST", message: "Linha do PIX/TED não encontrada nesta empresa." });
      if (Number(pixLine.valor) >= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "O pagamento substituto deve ser um débito (saída) do extrato." });
      // Rev. 3750 — dup por IDENTIDADE do cheque (não só pela linha exata): se a linha de
      // débito girou de id num re-import, o mesmo PIX não pode ser vinculado 2x ao cheque.
      const covDup = await _coberturaChequeDevolvido(db, input.companyId, input.debitoLineId);
      if (covDup.meus.some((v) => Number(v.pixLineId) === Number(input.pixLineId))) {
        // Busca conta bancária da linha do PIX para informar o usuário onde está o vínculo.
        const infSel = await dbExecute(db,
          `SELECT to_char(bsl.data,'DD/MM/YYYY') AS data,
                  COALESCE(cba.apelido, cba.banco, cba.conta) AS conta,
                  bcv.criado_por_nome AS autor,
                  to_char(bcv.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS vinculado_em
             FROM bank_statement_lines bsl
             LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
             LEFT JOIN bank_cheque_vinculos bcv
               ON bcv.pix_line_id = bsl.id AND bcv.company_id = bsl.company_id AND bcv.estornado_em IS NULL
            WHERE bsl.id=$1 AND bsl.company_id=$2
            LIMIT 1`,
          [input.pixLineId, input.companyId]);
        const inf = rows(infSel)[0] as any;
        const partes: string[] = [];
        if (inf?.conta) partes.push(`Conta: "${inf.conta}"`);
        if (inf?.data)  partes.push(`Data: ${inf.data}`);
        const detalhe = partes.length ? ` ${partes.join(" · ")}.` : "";
        throw new TRPCError({ code: "BAD_REQUEST", message: `Esta linha do extrato já está vinculada a este cheque.${detalhe} Verifique na tela de Conciliação Bancária desta conta.` });
      }
    }

    // Rev. 4081 — vínculo 'ajuste' (sem linha de extrato) exige dizer COMO foi pago
    // (dinheiro, depósito, cheque próprio ou outro), pra não virar um "ajuste" genérico
    // sem rastreabilidade.
    if (input.tipo === "ajuste" && !input.formaPagamento) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a forma de pagamento (dinheiro, depósito, cheque próprio ou outro)." });
    }

    // 2.5) valida a linha de CRÉDITO (devolução) do par, se informada — empresa + entrada (valor>0).
    //      Sem isso, um creditoLineId arbitrário (mesmo da empresa) seria auto-desconsiderado ao quitar.
    if (input.creditoLineId != null) {
      if (Number(input.creditoLineId) === Number(input.debitoLineId)) throw new TRPCError({ code: "BAD_REQUEST", message: "A linha de devolução não pode ser a própria linha do cheque." });
      const credSel = await dbExecute(db,
        `SELECT id, valor FROM bank_statement_lines
          WHERE id=$1 AND company_id=$2 AND excluido_em IS NULL`,
        [input.creditoLineId, input.companyId]);
      const cred = rows(credSel)[0] as any;
      if (!cred) throw new TRPCError({ code: "BAD_REQUEST", message: "Linha de devolução (crédito) não encontrada nesta empresa." });
      if (Number(cred.valor) <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A linha de devolução deve ser um crédito (entrada) do extrato." });
    }

    // 3) cobertura atual + guard de saldo (não deixa vincular além do valor do cheque).
    //    Rev. 3750 — soma por IDENTIDADE do cheque (resiliente à rotação de id de linha).
    const covAntes = await _coberturaChequeDevolvido(db, input.companyId, input.debitoLineId);
    const acumAntesCents = covAntes.acumCents;
    const novoCents = Math.round(input.valor * 100);
    if (acumAntesCents + novoCents > chequeCents + 1) {
      const saldo = Math.max(0, (chequeCents - acumAntesCents) / 100);
      throw new TRPCError({ code: "BAD_REQUEST", message: `Valor excede o saldo do cheque (saldo: R$ ${saldo.toFixed(2)}).` });
    }

    const porNome = (ctx.user as any)?.nome ?? (ctx.user as any)?.name ?? null;
    const dataVinc = input.data ?? (pixLine?.data ?? null);
    // Rev. 4081 — para 'ajuste', a descrição-padrão passa a citar a forma de pagamento
    // (ex.: "Pago em dinheiro") em vez do genérico "Quitação de saldo (ajuste manual)".
    const descVinc = input.descricao ?? (pixLine?.descricao ?? (input.tipo === "ajuste" ? FORMA_PAGAMENTO_LABEL[input.formaPagamento ?? "outro"] : null));

    // 4) insere o vínculo ($1..$13 distintos, na ordem de aparição = ordem do array)
    const ins = await dbExecute(db,
      `INSERT INTO bank_cheque_vinculos
         (company_id, debito_line_id, credito_line_id, cheque_numero, tipo, forma_pagamento,
          pix_line_id, pix_conta_bancaria_id, valor, data, descricao,
          criado_por_id, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [input.companyId, input.debitoLineId, input.creditoLineId ?? null,
       input.chequeNumero ?? null, input.tipo, input.tipo === "ajuste" ? (input.formaPagamento ?? null) : null,
       input.pixLineId ?? null, pixLine?.contaId ?? null, input.valor,
       dataVinc, descVinc, ctx.user?.id ?? null, porNome]);
    const vinculoId = rows(ins)[0]?.id;

    // 5) se a cobertura fecha o cheque, AUTO-desconsidera o par (marca automática) e,
    //    havendo número, marca o Controle de Cheques como compensado_pix.
    // Rev. 4079 — CHEQUE DEVOLVIDO MAIS DE UMA VEZ (mesmo doc/nº + valor, ex.: caiu 2x na
    // conta por motivos diferentes): a cobertura já é somada por IDENTIDADE do cheque
    // (`_coberturaChequeDevolvido`/`_mesmoChequeDevolvido`), mas o desconsiderar automático
    // SÓ marcava o par exato (debitoLineId/creditoLineId) passado NESTA chamada — as demais
    // ocorrências ficavam pendentes pra sempre, mesmo já cobertas pelo mesmo PIX/TED.
    // Fix: ao quitar, procura TODOS os pares compensação+devolução da conta que casam com a
    // MESMA identidade (doc/nº + valor) e desconsidera todos de uma vez — "uma tacada só".
    const acumDepoisCents = acumAntesCents + novoCents;
    const quitado = acumDepoisCents >= chequeCents - 1;
    if (quitado) {
      const parIdsSet = new Set<number>([input.debitoLineId, ...(input.creditoLineId ? [input.creditoLineId] : [])]);
      try {
        const idSel = await dbExecute(db,
          `SELECT id, data, descricao, valor
             FROM bank_statement_lines
            WHERE company_id=$1 AND conta_bancaria_id=$2 AND COALESCE(conciliado,0)=0 AND excluido_em IS NULL`,
          [input.companyId, deb.contaId]);
        const candLinhas: LinhaEstornoMin[] = (rows(idSel) as any[]).map((l: any) => ({
          id: l.id,
          valorCents: Math.round(Math.abs(Number(l.valor)) * 100),
          isCredito: Number(l.valor) >= 0,
          descricao: l.descricao,
          data: String(l.data ?? "").slice(0, 10),
        }));
        const paresTodos = detectarParesEstorno(candLinhas);
        for (const par of paresTodos) {
          const mesmo = _mesmoChequeDevolvido(
            { debitoLineId: Number(par.debitoId), cents: par.valorCents, doc: par.doc ?? null, chq: par.chequeNumero ?? null },
            { debitoLineId: input.debitoLineId, cents: chequeCents, doc: covAntes.doc, chq: covAntes.chq },
          );
          if (mesmo) { parIdsSet.add(Number(par.debitoId)); parIdsSet.add(Number(par.creditoId)); }
        }
      } catch { /* falha na busca de ocorrências-irmãs não deve impedir a quitação do par atual */ }
      const parIds = Array.from(parIdsSet);
      await dbExecute(db,
        `UPDATE bank_statement_lines
            SET desconsiderado_em=NOW(), desconsiderado_por_id=NULL, desconsiderado_por_nome=$1
          WHERE company_id=$2 AND excluido_em IS NULL AND desconsiderado_em IS NULL
            AND id IN (${inlineIds(parIds)})`,
        [MARCA_AUTO, input.companyId]);
      if (input.chequeNumero) {
        await dbExecute(db,
          `UPDATE financial_cheques
              SET status='compensado_pix',
                  data_compensacao=COALESCE(data_compensacao, $1::date),
                  updated_at=NOW()
            WHERE company_id=$2 AND excluido_em IS NULL
              AND regexp_replace(numero_cheque,'[^0-9]','','g') = regexp_replace($3,'[^0-9]','','g')
              AND status NOT IN ('compensado','baixado','cancelado')`,
          [dataVinc ?? null, input.companyId, input.chequeNumero]);
      }
    }
    await createAuditLog({
      action: "cheque_vinculo_registrado",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Vínculo ${input.tipo} R$ ${input.valor.toFixed(2)} ao cheque devolvido (linha #${input.debitoLineId})${input.pixLineId ? ` ↔ extrato #${input.pixLineId}` : ` (${FORMA_PAGAMENTO_LABEL[input.formaPagamento ?? "outro"]})`}${quitado ? " — cheque QUITADO por substituição" : ""}`,
    });
    return {
      ok: true,
      vinculoId,
      acumulado: acumDepoisCents / 100,
      saldo: Math.max(0, (chequeCents - acumDepoisCents)) / 100,
      quitado,
      // Rev. 4079 — quantos PARES (compensação+devolução) foram desconsiderados nesta
      // quitação; >1 indica que o mesmo cheque tinha caído mais de uma vez na conta e
      // todas as ocorrências foram resolvidas juntas.
      paresResolvidos: quitado ? Math.max(1, Math.round(parIds.length / 2)) : 0,
    };
  }),

  // Rev. 3747 — ESTORNA um vínculo (soft). Se o cheque deixar de estar coberto, RECONSIDERA
  // o par de volta ao % — porém SÓ as linhas que foram desconsideradas pelo automático
  // (preserva um "Desconsiderar" manual feito por uma pessoa).
  estornarVinculoChequeDevolvido: protectedProcedure.input(z.object({
    companyId: z.number(),
    vinculoId: z.number(),
    motivo: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const MARCA_AUTO = "Vínculo PIX/TED (automático)";
    const sel = await dbExecute(db,
      `SELECT id, debito_line_id AS "debitoLineId", credito_line_id AS "creditoLineId", valor
         FROM bank_cheque_vinculos
        WHERE id=$1 AND company_id=$2 AND estornado_em IS NULL`,
      [input.vinculoId, input.companyId]);
    const v = rows(sel)[0] as any;
    if (!v) throw new TRPCError({ code: "BAD_REQUEST", message: "Vínculo não encontrado ou já estornado." });
    const porNome = (ctx.user as any)?.nome ?? (ctx.user as any)?.name ?? null;
    await dbExecute(db,
      `UPDATE bank_cheque_vinculos
          SET estornado_em=NOW(), estornado_por_id=$1, estornado_por_nome=$2,
              descricao=CASE WHEN $3::text IS NULL THEN descricao
                             ELSE COALESCE(descricao,'') || ' · estorno: ' || $4 END
        WHERE id=$5 AND company_id=$6`,
      [ctx.user?.id ?? null, porNome, input.motivo ?? null, input.motivo ?? null, input.vinculoId, input.companyId]);

    const debitoLineId = Number(v.debitoLineId);
    // Rev. 3750 — cobertura por IDENTIDADE do cheque (já exclui o vínculo recém-estornado).
    const covPos = await _coberturaChequeDevolvido(db, input.companyId, debitoLineId);
    const chequeCents = covPos.cents;
    const acumCents = covPos.acumCents;
    const quitado = chequeCents > 0 && acumCents >= chequeCents - 1;
    if (!quitado) {
      // Rev. 4079 — simétrico ao fix da quitação: se o vínculo estornado derrubar a
      // cobertura da identidade do cheque, RECONSIDERA TODAS as ocorrências-irmãs (mesmo
      // doc/nº + valor) que tinham sido desconsideradas automaticamente junto, não só o
      // par exato desse vínculo — senão uma fica marcada como resolvida "sozinha".
      const parIdsSet = new Set<number>([debitoLineId, ...(v.creditoLineId ? [Number(v.creditoLineId)] : [])]);
      try {
        const contaSel = await dbExecute(db,
          `SELECT conta_bancaria_id AS "contaId" FROM bank_statement_lines WHERE id=$1 AND company_id=$2`,
          [debitoLineId, input.companyId]);
        const contaId = rows(contaSel)[0]?.contaId;
        if (contaId) {
          const idSel = await dbExecute(db,
            `SELECT id, data, descricao, valor
               FROM bank_statement_lines
              WHERE company_id=$1 AND conta_bancaria_id=$2 AND COALESCE(conciliado,0)=0 AND excluido_em IS NULL`,
            [input.companyId, contaId]);
          const candLinhas: LinhaEstornoMin[] = (rows(idSel) as any[]).map((l: any) => ({
            id: l.id,
            valorCents: Math.round(Math.abs(Number(l.valor)) * 100),
            isCredito: Number(l.valor) >= 0,
            descricao: l.descricao,
            data: String(l.data ?? "").slice(0, 10),
          }));
          const paresTodos = detectarParesEstorno(candLinhas);
          for (const par of paresTodos) {
            const mesmo = _mesmoChequeDevolvido(
              { debitoLineId: Number(par.debitoId), cents: par.valorCents, doc: par.doc ?? null, chq: par.chequeNumero ?? null },
              { debitoLineId, cents: chequeCents, doc: covPos.doc, chq: covPos.chq },
            );
            if (mesmo) { parIdsSet.add(Number(par.debitoId)); parIdsSet.add(Number(par.creditoId)); }
          }
        }
      } catch { /* falha na busca de ocorrências-irmãs não deve impedir o estorno do vínculo */ }
      const parIds = Array.from(parIdsSet);
      await dbExecute(db,
        `UPDATE bank_statement_lines
            SET desconsiderado_em=NULL, desconsiderado_por_id=NULL, desconsiderado_por_nome=NULL
          WHERE company_id=$1 AND id IN (${inlineIds(parIds)})
            AND desconsiderado_por_nome=$2`,
        [input.companyId, MARCA_AUTO]);
    }
    await createAuditLog({
      action: "cheque_vinculo_estornado",
      userId: ctx.user?.id,
      companyId: input.companyId,
      details: `Estornou vínculo #${input.vinculoId} do cheque devolvido (linha #${debitoLineId})${input.motivo ? ` — ${input.motivo.slice(0, 120)}` : ""}`,
    });
    return { ok: true, acumulado: acumCents / 100, saldo: Math.max(0, (chequeCents - acumCents)) / 100, quitado };
  }),

  // Rev. 4275 — Lista TODOS os cheques devolvidos pendentes (ou parcialmente cobertos) de TODAS
  // as contas da empresa, para a tela de lançamento poder oferecer "Quitar cheques devolvidos"
  // sem precisar navegar conta a conta. Retorna linhas status='devolvido' + linhas que já têm
  // algum vínculo ativo (mas saldo_livre > 0.01). READ-ONLY.
  listPendingChequesDevolvidos: protectedProcedure.input(z.object({
    companyId: z.number(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const r = await dbExecute(db,
      `SELECT
         bsl.id                                                       AS "debitoLineId",
         ROUND(ABS(bsl.valor)::numeric, 2)                           AS "valor",
         bsl.descricao,
         to_char(bsl.data, 'YYYY-MM-DD')                            AS "dataDebito",
         bsl.conta_bancaria_id                                       AS "contaId",
         COALESCE(cba.apelido, cba.banco, bsl.conta_bancaria_id::text) AS "contaApelido",
         COALESCE(SUM(CASE WHEN bcv.estornado_em IS NULL THEN bcv.valor ELSE 0 END), 0) AS "valorAlocado"
       FROM bank_statement_lines bsl
       LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
       LEFT JOIN bank_cheque_vinculos bcv  ON bcv.debito_line_id = bsl.id
      WHERE bsl.company_id = $1
        AND bsl.excluido_em IS NULL
        AND bsl.valor < 0
        AND (
          bsl.status = 'devolvido'
          OR EXISTS (
            SELECT 1 FROM bank_cheque_vinculos v2
            WHERE v2.debito_line_id = bsl.id AND v2.estornado_em IS NULL
          )
        )
      GROUP BY bsl.id, cba.apelido, cba.banco
      HAVING ROUND(ABS(bsl.valor)::numeric, 2)
             - COALESCE(SUM(CASE WHEN bcv.estornado_em IS NULL THEN bcv.valor ELSE 0 END), 0) > 0.01
      ORDER BY bsl.data DESC, bsl.id DESC
      LIMIT 200`,
      [input.companyId]);
    const cheques = (rows(r) as any[]).map((c) => {
      const totalCents = Math.round(Number(c.valor) * 100);
      const alocCents  = Math.round(Number(c.valorAlocado) * 100);
      const livreCents = Math.max(0, totalCents - alocCents);
      return {
        debitoLineId: Number(c.debitoLineId),
        valor:        Number(c.valor),
        valorAlocado: alocCents / 100,
        saldoLivre:   livreCents / 100,
        descricao:    c.descricao ?? null,
        dataDebito:   c.dataDebito ?? null,
        contaId:      c.contaId != null ? Number(c.contaId) : null,
        contaApelido: c.contaApelido ?? null,
        parcial:      alocCents > 0,
      };
    });
    return { cheques };
  }),

  // Rev. 3747 — Para um lote de cheques devolvidos (por linha de débito), retorna os vínculos
  // ativos (com a linha do PIX + apelido da conta), o acumulado/saldo, se está quitado e as
  // SUGESTÕES automáticas: PIX/TED de VALOR EXATAMENTE IGUAL em TODAS as contas da empresa.
  getChequeDevolvidoVinculacao: protectedProcedure.input(z.object({
    companyId: z.number(),
    itens: z.array(z.object({
      debitoLineId: z.number(),
      creditoLineId: z.number().optional(),
      valor: z.number(),      // valor absoluto do cheque (reais)
      dataRef: z.string().optional(), // data do débito (YYYY-MM-DD)
      doc: z.string().optional(),          // Rev. 3750 — doc do cheque (identidade estável)
      chequeNumero: z.string().optional(), // Rev. 3750 — nº do cheque (identidade estável)
    })).max(300),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const mapa: Record<string, any> = {};
    if (!input.itens.length) return { mapa };
    const debIds = Array.from(new Set(input.itens.map((i) => Number(i.debitoLineId)).filter((n) => Number.isFinite(n) && n > 0)));
    if (!debIds.length) return { mapa };

    // Rev. 3750 — NÃO filtra por debito_line_id IN (...): traz TODOS os vínculos ativos da
    // empresa + a descrição/valor da linha de débito de cada um, p/ casar por IDENTIDADE do
    // cheque (doc/nº + valor) e não só pelo id volátil da linha (que gira em re-imports).
    const vSel = await dbExecute(db,
      `SELECT v.id, v.debito_line_id AS "debitoLineId", v.tipo, v.forma_pagamento AS "formaPagamento", v.pix_line_id AS "pixLineId",
              v.valor, to_char(v.data,'YYYY-MM-DD') AS data, v.descricao,
              v.cheque_numero AS "chequeNumero", v.criado_por_nome AS "criadoPorNome",
              v.created_at AS "createdAt",
              dl.descricao AS "debDescricao", dl.valor AS "debValor",
              to_char(p.data,'YYYY-MM-DD') AS "pixData", p.descricao AS "pixDescricao",
              p.valor AS "pixValor", p.conta_bancaria_id AS "pixContaId",
              cba.apelido AS "pixContaApelido", cba.banco AS "pixContaBanco", cba.conta AS "pixContaNum"
         FROM bank_cheque_vinculos v
         LEFT JOIN bank_statement_lines dl ON dl.id = v.debito_line_id
         LEFT JOIN bank_statement_lines p ON p.id = v.pix_line_id
         LEFT JOIN company_bank_accounts cba ON cba.id = v.pix_conta_bancaria_id
        WHERE v.company_id=$1 AND v.estornado_em IS NULL
        ORDER BY v.created_at ASC, v.id ASC`,
      [input.companyId]);
    const vinc = (rows(vSel) as any[]).map((v) => ({
      ...v,
      _idDoc: parseDocNumero(v.debDescricao),
      _idChq: parseChequeNumero(v.debDescricao),
      _idCents: Math.round(Math.abs(Number(v.debValor ?? 0)) * 100),
    }));

    const valoresCents = Array.from(new Set(input.itens.map((i) => Math.round(Math.abs(Number(i.valor)) * 100)).filter((c) => c > 0)));
    let candAll: any[] = [];
    if (valoresCents.length) {
      const sSel = await dbExecute(db,
        `SELECT l.id, to_char(l.data,'YYYY-MM-DD') AS data, l.descricao, l.valor,
                l.conta_bancaria_id AS "contaId", l.conciliado, l.entry_id AS "entryId",
                cba.apelido AS "contaApelido", cba.banco AS "contaBanco", cba.conta AS "contaNum"
           FROM bank_statement_lines l
           LEFT JOIN company_bank_accounts cba ON cba.id = l.conta_bancaria_id
          WHERE l.company_id=$1
            AND l.excluido_em IS NULL
            AND l.valor < 0
            AND (UPPER(l.descricao) LIKE '%PIX%' OR UPPER(l.descricao) LIKE '%TED%'
                 OR UPPER(l.descricao) LIKE '%TRANSF%' OR UPPER(l.descricao) LIKE '%DOC%')
            AND ROUND(ABS(l.valor)*100) IN (${inlineIds(valoresCents)})
          ORDER BY l.data DESC, l.id DESC
          LIMIT 500`,
        [input.companyId]);
      candAll = rows(sSel) as any[];
    }

    // Rev. 4274 — valorAlocado por linha de PIX (suporta N cheques → 1 PIX).
    const pvSel = await dbExecute(db,
      `SELECT pix_line_id AS "pixLineId", SUM(valor) AS "valorAlocado"
         FROM bank_cheque_vinculos
        WHERE company_id=$1 AND estornado_em IS NULL AND pix_line_id IS NOT NULL
        GROUP BY pix_line_id`,
      [input.companyId]);
    const pixAlocMap2 = new Map<number, number>();
    for (const r of rows(pvSel) as any[]) pixAlocMap2.set(Number(r.pixLineId), Math.round(Number(r.valorAlocado) * 100));

    for (const it of input.itens) {
      const dbid = Number(it.debitoLineId);
      const chequeCents = Math.round(Math.abs(Number(it.valor)) * 100);
      const ref = it.dataRef ? String(it.dataRef).slice(0, 10) : null;
      const itDoc = it.doc != null ? String(it.doc) : null;
      const itChq = it.chequeNumero != null ? String(it.chequeNumero) : null;
      const meus = vinc.filter((x) => _mesmoChequeDevolvido(
        { debitoLineId: dbid, cents: chequeCents, doc: itDoc, chq: itChq },
        { debitoLineId: Number(x.debitoLineId), cents: x._idCents, doc: x._idDoc, chq: x._idChq },
      ));
      const acumCents = meus.reduce((s, x) => s + Math.round(Number(x.valor) * 100), 0);
      const pixDoCheque = new Set(meus.map((x) => Number(x.pixLineId)).filter(Boolean));
      const sugestoes = candAll
        .filter((c) => Math.round(Math.abs(Number(c.valor)) * 100) === chequeCents)
        .filter((c) => Number(c.id) !== dbid && !pixDoCheque.has(Number(c.id)))
        .filter((c) => !ref || (c.data != null && String(c.data) >= ref))
        .map((c) => {
          const alocCents = pixAlocMap2.get(Number(c.id)) ?? 0;
          const totalCents = Math.round(Math.abs(Number(c.valor)) * 100);
          const livreCents = Math.max(0, totalCents - alocCents);
          return { ...c, jaVinculado: alocCents > 0, valorAlocado: alocCents / 100, saldoLivre: livreCents / 100 };
        })
        .slice(0, 12);
      mapa[String(dbid)] = {
        vinculos: meus,
        acumulado: acumCents / 100,
        saldo: Math.max(0, (chequeCents - acumCents)) / 100,
        quitado: chequeCents > 0 && acumCents >= chequeCents - 1,
        sugestoes,
      };
    }
    return { mapa };
  }),

  // Rev. 4081 — Detalhamento de COMO um cheque (já compensado_pix) foi quitado por
  // substituição: lista todos os vínculos ativos por número do cheque, pra exibir na
  // tela de Controle de Cheques sem precisar abrir a Conciliação Bancária.
  getVinculosPorChequeNumero: protectedProcedure.input(z.object({
    companyId: z.number(),
    numeroCheque: z.string().min(1),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const r = await dbExecute(db,
      `SELECT v.id, v.tipo, v.forma_pagamento AS "formaPagamento", v.valor,
              to_char(v.data,'YYYY-MM-DD') AS data, v.descricao,
              v.criado_por_nome AS "criadoPorNome", v.created_at AS "createdAt",
              p.descricao AS "pixDescricao",
              cba.apelido AS "pixContaApelido", cba.banco AS "pixContaBanco"
         FROM bank_cheque_vinculos v
         LEFT JOIN bank_statement_lines p ON p.id = v.pix_line_id
         LEFT JOIN company_bank_accounts cba ON cba.id = v.pix_conta_bancaria_id
        WHERE v.company_id=$1 AND v.estornado_em IS NULL
          AND regexp_replace(v.cheque_numero,'[^0-9]','','g') = regexp_replace($2,'[^0-9]','','g')
        ORDER BY v.created_at ASC, v.id ASC`,
      [input.companyId, input.numeroCheque]);
    return { vinculos: rows(r) as any[] };
  }),

  // Rev. 3747 — Busca PIX/TED/transf (débitos) em TODAS as contas da empresa p/ o vínculo
  // MANUAL (casamento de valor divergente). Ordena por proximidade ao valor do cheque.
  searchPixTedGlobal: protectedProcedure.input(z.object({
    companyId: z.number(),
    dataRef: z.string(),
    valorRef: z.number().optional(),
    mesesAntes: z.number().min(0).max(24).default(3),
    mesesDepois: z.number().min(0).max(24).default(12),
    busca: z.string().optional(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const colSelect = `SELECT l.id, to_char(l.data,'YYYY-MM-DD') AS data, l.descricao, l.valor,
              l.conta_bancaria_id AS "contaId", l.conciliado, l.entry_id AS "entryId",
              cba.apelido AS "contaApelido", cba.banco AS "contaBanco", cba.conta AS "contaNum"
         FROM bank_statement_lines l
         LEFT JOIN company_bank_accounts cba ON cba.id = l.conta_bancaria_id`;
    const whereBase = `WHERE l.company_id=$1
          AND l.excluido_em IS NULL
          AND l.valor < 0
          AND (UPPER(l.descricao) LIKE '%PIX%' OR UPPER(l.descricao) LIKE '%TED%'
               OR UPPER(l.descricao) LIKE '%TRANSF%' OR UPPER(l.descricao) LIKE '%DOC%')
          AND l.data >= ($2::date - ($3 || ' months')::interval)::date
          AND l.data <= ($4::date + ($5 || ' months')::interval)::date`;
    // $N distintos por aparição (dbExecute liga por ORDEM): dataRef passado 2x.
    const baseParams = [input.companyId, input.dataRef, String(input.mesesAntes),
                        input.dataRef, String(input.mesesDepois), String(input.valorRef ?? 0)];
    // Query 1: ordenada por proximidade de valor (LIMIT 300) — sempre executada
    const r = await dbExecute(db,
      `${colSelect} ${whereBase}
        ORDER BY ABS(l.valor + $6::numeric) ASC, l.data DESC, l.id DESC
        LIMIT 300`,
      baseParams);
    let linhas = rows(r) as any[];

    // Query 2: quando há busca de TEXTO, rodar query separada com ILIKE p/ não ser
    // cortada pelo LIMIT de proximidade de valor. Merge com dedup por id.
    // (Busca por valor BR-formatado continua sendo tratada no filtro JS abaixo.)
    if (input.busca && input.busca.trim()) {
      const buscaLike = `%${input.busca.trim().toUpperCase()}%`;
      // $N distintos: $1=companyId, $2=dataRef, $3=mesesAntes, $4=dataRef, $5=mesesDepois, $6=buscaLike
      const r2 = await dbExecute(db,
        `${colSelect} ${whereBase}
            AND UPPER(l.descricao) LIKE $6
          ORDER BY l.data DESC, l.id DESC
          LIMIT 200`,
        [input.companyId, input.dataRef, String(input.mesesAntes),
         input.dataRef, String(input.mesesDepois), buscaLike]);
      const extra = rows(r2) as any[];
      const ids = new Set(linhas.map((l: any) => Number(l.id)));
      for (const row of extra) {
        if (!ids.has(Number(row.id))) { linhas.push(row); ids.add(Number(row.id)); }
      }
    }

    // Rev. 4274 — pix já vinculados: valorAlocado + saldoLivre por linha (suporta N cheques → 1 PIX).
    const pvSel = await dbExecute(db,
      `SELECT pix_line_id AS "pixLineId", SUM(valor) AS "valorAlocado"
         FROM bank_cheque_vinculos
        WHERE company_id=$1 AND estornado_em IS NULL AND pix_line_id IS NOT NULL
        GROUP BY pix_line_id`,
      [input.companyId]);
    const pixAlocMap = new Map<number, number>();
    for (const r of rows(pvSel) as any[]) pixAlocMap.set(Number(r.pixLineId), Math.round(Number(r.valorAlocado) * 100));
    linhas = linhas.map((l) => {
      const alocCents = pixAlocMap.get(Number(l.id)) ?? 0;
      const totalCents = Math.round(Math.abs(Number(l.valor)) * 100);
      const livreCents = Math.max(0, totalCents - alocCents);
      return { ...l, jaVinculado: alocCents > 0, valorAlocado: alocCents / 100, saldoLivre: livreCents / 100 };
    });
    if (input.busca) {
      const b = input.busca.toLowerCase().replace(/\s/g, "");
      linhas = linhas.filter((l: any) => {
        if (String(l.descricao ?? "").toLowerCase().includes(b)) return true;
        const abs = Math.abs(Number(l.valor) || 0);
        if (abs > 0) {
          const brFmt = abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, "");
          if (brFmt.includes(b)) return true;
        }
        return false;
      });
    }
    return { linhas };
  }),

  // Rev. 3454 — Cache persistente de análise IA da Conciliação Bancária.
  getAiConciliacaoCache: protectedProcedure
    .input(z.object({
      companyId:        z.number(),
      contaBancariaId:  z.number(),
      dataInicio:       z.string(),
      dataFim:          z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { resultados: null, analisadoEm: null };
      await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
      const res = await dbExecute(db,
        `SELECT resultados_json, analisado_em
         FROM bank_conciliation_ai_cache
         WHERE company_id=$1 AND conta_bancaria_id=$2 AND data_inicio=$3 AND data_fim=$4
         LIMIT 1`,
        [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim]);
      const row = rows(res)[0] as any;
      if (!row) return { resultados: null, analisadoEm: null };
      return {
        resultados: row.resultados_json as Record<string, any>,
        analisadoEm: row.analisado_em as string,
      };
    }),

  saveAiConciliacaoCache: protectedProcedure
    .input(z.object({
      companyId:        z.number(),
      contaBancariaId:  z.number(),
      dataInicio:       z.string(),
      dataFim:          z.string(),
      resultados:       z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
      await dbExecute(db,
        `INSERT INTO bank_conciliation_ai_cache
           (company_id, conta_bancaria_id, data_inicio, data_fim, resultados_json, analisado_em)
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
         ON CONFLICT (company_id, conta_bancaria_id, data_inicio, data_fim)
         DO UPDATE SET resultados_json=$5::jsonb, analisado_em=NOW()`,
        [input.companyId, input.contaBancariaId, input.dataInicio, input.dataFim,
         JSON.stringify(input.resultados)]);
      return { ok: true };
    }),

  // Rev. 3479 — DASHBOARD CONCILIAÇÃO · EXTRA: top fornecedores, categorias, obras e
  // extremos do extrato (maior entrada/saída). Alimenta os novos KPIs e gráficos do
  // DashConciliacao.tsx. READ-ONLY · ZERO ALTER/DROP/DELETE.
  //
  // Rev. 3714 — UNION com bank_statement_lines para fornecedores e categorias:
  // quando financial_entries está vazio ou sem nome/categoria, usa descricao do extrato
  // como fallback (only lines with entry_id IS NULL to avoid double-counting conciliated items).
  getConciliacaoDashExtra: protectedProcedure.input(z.object({
    companyId: z.number().int(),
    ano: z.number().int(),
    mes: z.number().int().min(0).max(12).optional(), // Rev. 3755 — 0/undefined = ano todo; 1-12 escopa o mês
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const yr = Number(input.ano);
    const cid = Number(input.companyId);
    // Rev. 3755 — filtro "mês a mês". mo=0 → ano inteiro. cid/yr/mo são inteiros validados
    // (z.number()) → inlining seguro (sem placeholders). Isso também repara o bug latente do
    // dbExecute nas queries UNION: a 2ª metade (extrato) reaproveitava $1/$2, mas o dbExecute
    // liga params por ORDEM DE APARIÇÃO (split em /\$\d+/g), então a 2ª metade recebia
    // params undefined→NULL e nunca retornava linhas. Inlining honra a intenção da Rev. 3714.
    const mo = (typeof input.mes === "number" && input.mes >= 1 && input.mes <= 12) ? Number(input.mes) : 0;
    const periodo = (expr: string) =>
      `EXTRACT(YEAR FROM ${expr})=${yr}` + (mo ? ` AND EXTRACT(MONTH FROM ${expr})=${mo}` : "");

    // Helper p/ normalizar rows.
    const R = (r: any) => rows(r) as any[];

    // 1. Top fornecedores por saídas.
    // Rev. 3714 — UNION: ERP entries (fornecedor_nome) + extrato bancário (descricao, débitos sem entry_id).
    const fornRes = await dbExecute(db,
      `SELECT nome, COUNT(*)::int AS qtd, COALESCE(SUM(total),0) AS total
         FROM (
           SELECT NULLIF(TRIM(COALESCE(fornecedor_nome, comprovante_beneficiario)),'') AS nome,
                  ABS(COALESCE(valor_realizado,valor_previsto,0)) AS total
             FROM financial_entries
            WHERE company_id=${cid} AND tipo='despesa'
              AND ${periodo("COALESCE(data_competencia,data_vencimento,created_at::date)")}
              AND NULLIF(TRIM(COALESCE(fornecedor_nome, comprovante_beneficiario)),'') IS NOT NULL
              -- Excluir contas internas: folha, vales, adiantamento, rescisão, hora extra
              AND COALESCE(conta_id, 0) NOT IN (506,387,280,301,265,285,264)
           UNION ALL
           SELECT NULLIF(TRIM(descricao),'') AS nome,
                  ABS(valor::numeric) AS total
             FROM bank_statement_lines
            WHERE company_id=${cid} AND excluido_em IS NULL
              AND ${periodo("data")}
              AND valor < 0
              AND entry_id IS NULL
              AND NULLIF(TRIM(descricao),'') IS NOT NULL
         ) sub
        WHERE nome IS NOT NULL
        GROUP BY 1 ORDER BY 3 DESC LIMIT 20`,
      []);

    // 2. Top categorias – despesas.
    // Rev. 3714 — UNION: ERP entries (conta_nome) + extrato bancário (descricao, débitos sem entry_id).
    const catDespRes = await dbExecute(db,
      `SELECT nome, COUNT(*)::int AS qtd, COALESCE(SUM(total),0) AS total
         FROM (
           SELECT NULLIF(TRIM(COALESCE(fe.conta_nome, fa.nome)),'') AS nome,
                  ABS(COALESCE(fe.valor_realizado,fe.valor_previsto,0)) AS total
             FROM financial_entries fe
             LEFT JOIN financial_accounts fa ON fa.id = fe.conta_id
            WHERE fe.company_id=${cid} AND fe.tipo='despesa'
              AND ${periodo("COALESCE(fe.data_competencia,fe.data_vencimento,fe.created_at::date)")}
              AND NULLIF(TRIM(COALESCE(fe.conta_nome, fa.nome)),'') IS NOT NULL
           UNION ALL
           SELECT NULLIF(TRIM(descricao),'') AS nome,
                  ABS(valor::numeric) AS total
             FROM bank_statement_lines
            WHERE company_id=${cid} AND excluido_em IS NULL
              AND ${periodo("data")}
              AND valor < 0
              AND entry_id IS NULL
              AND NULLIF(TRIM(descricao),'') IS NOT NULL
         ) sub
        WHERE nome IS NOT NULL
        GROUP BY 1 ORDER BY 3 DESC`,
      []);

    // 3. Top categorias – receitas.
    // Rev. 3714 — UNION: ERP entries (conta_nome) + extrato bancário (descricao, créditos sem entry_id).
    const catRecRes = await dbExecute(db,
      `SELECT nome, COUNT(*)::int AS qtd, COALESCE(SUM(total),0) AS total
         FROM (
           SELECT NULLIF(TRIM(COALESCE(fe.conta_nome, fa.nome)),'') AS nome,
                  ABS(COALESCE(fe.valor_realizado,fe.valor_previsto,0)) AS total
             FROM financial_entries fe
             LEFT JOIN financial_accounts fa ON fa.id = fe.conta_id
            WHERE fe.company_id=${cid} AND fe.tipo='receita'
              AND ${periodo("COALESCE(fe.data_competencia,fe.data_vencimento,fe.created_at::date)")}
              AND NULLIF(TRIM(COALESCE(fe.conta_nome, fa.nome)),'') IS NOT NULL
           UNION ALL
           SELECT NULLIF(TRIM(descricao),'') AS nome,
                  ABS(valor::numeric) AS total
             FROM bank_statement_lines
            WHERE company_id=${cid} AND excluido_em IS NULL
              AND ${periodo("data")}
              AND valor > 0
              AND entry_id IS NULL
              AND NULLIF(TRIM(descricao),'') IS NOT NULL
              AND UPPER(descricao) NOT LIKE '%CHEQUE DEVOL%'
         ) sub
        WHERE nome IS NOT NULL
        GROUP BY 1 ORDER BY 3 DESC LIMIT 15`,
      []);

    // 4. Top obras por volume financeiro (despesas + receitas).
    // Rev. 3628 — JOIN em obras p/ recuperar nome quando obra_nome desnormalizado está nulo.
    // Rev. 3757 — BUGFIX: o `ORDER BY (despesas+receitas)` referenciava os ALIASES de saída
    // dentro de uma EXPRESSÃO. No PostgreSQL, alias de saída só é reconhecido em ORDER BY
    // quando usado SOZINHO (ex.: `ORDER BY despesas`); dentro de uma expressão o nome resolve
    // contra colunas de ENTRADA (financial_entries/obras), que não têm "despesas"/"receitas"
    // → `column "despesas" does not exist`. Como as 6 queries são awaited em sequência SEM
    // try/catch, esse throw abortava TODO o getConciliacaoDashExtra, deixando `extra` undefined
    // e ESVAZIANDO todos os cards (categorias, fornecedores, obras). Fix: envelopar a agregação
    // numa subquery, onde despesas/receitas viram colunas reais e o ORDER BY passa a funcionar.
    const obrasRes = await dbExecute(db,
      `SELECT nome, qtd, despesas, receitas
         FROM (
           SELECT NULLIF(TRIM(COALESCE(fe.obra_nome, o.nome)),'') AS nome,
                  COUNT(*)::int AS qtd,
                  COALESCE(SUM(CASE WHEN fe.tipo='despesa' THEN ABS(COALESCE(fe.valor_realizado,fe.valor_previsto,0)) ELSE 0 END),0) AS despesas,
                  COALESCE(SUM(CASE WHEN fe.tipo='receita' THEN ABS(COALESCE(fe.valor_realizado,fe.valor_previsto,0)) ELSE 0 END),0) AS receitas
             FROM financial_entries fe
             LEFT JOIN obras o ON o.id = fe.obra_id
            WHERE fe.company_id=${cid}
              AND ${periodo("COALESCE(fe.data_competencia,fe.data_vencimento,fe.created_at::date)")}
              AND NULLIF(TRIM(COALESCE(fe.obra_nome, o.nome)),'') IS NOT NULL
            GROUP BY 1
         ) t
        ORDER BY (despesas + receitas) DESC LIMIT 15`,
      []);

    // 5. Maior entrada e maior saída do extrato bancário no período.
    const extremosRes = await dbExecute(db,
      `SELECT MAX(CASE WHEN valor>0 THEN valor ELSE 0 END)  AS "maiorEntrada",
              MIN(CASE WHEN valor<0 THEN valor ELSE 0 END)  AS "maiorSaida",
              COUNT(DISTINCT NULLIF(TRIM(descricao),''))    AS "descUnicas",
              COUNT(DISTINCT conta_bancaria_id)             AS "contasAtivas"
         FROM bank_statement_lines
        WHERE company_id=${cid} AND excluido_em IS NULL
          AND ${periodo("data")}`,
      []);

    // 6. Distribuição mensal de entradas e saídas POR CONTA BANCÁRIA
    //    (p/ o heatmap/sparkline de "o que mais foi pago por banco por mês").
    const porContaMesRes = await dbExecute(db,
      `SELECT conta_bancaria_id AS "contaBancariaId",
              EXTRACT(MONTH FROM data)::int AS mes,
              COALESCE(SUM(CASE WHEN valor>0 THEN valor ELSE 0 END),0) AS entradas,
              COALESCE(SUM(CASE WHEN valor<0 THEN ABS(valor) ELSE 0 END),0) AS saidas
         FROM bank_statement_lines
        WHERE company_id=${cid} AND excluido_em IS NULL
          AND EXTRACT(YEAR FROM data)=${yr}
        GROUP BY 1,2 ORDER BY 1,2`,
      []);

    const ext = R(extremosRes)[0] ?? {};
    return {
      topFornecedores: R(fornRes).map((r) => ({
        nome: String(r.nome || ""),
        qtd: Number(r.qtd) || 0,
        total: Number(r.total) || 0,
      })),
      topCategoriasDespesa: R(catDespRes).map((r) => ({
        nome: String(r.nome || ""),
        qtd: Number(r.qtd) || 0,
        total: Number(r.total) || 0,
      })),
      topCategoriasReceita: R(catRecRes).map((r) => ({
        nome: String(r.nome || ""),
        qtd: Number(r.qtd) || 0,
        total: Number(r.total) || 0,
      })),
      topObras: R(obrasRes).map((r) => ({
        nome: String(r.nome || ""),
        qtd: Number(r.qtd) || 0,
        despesas: Number(r.despesas) || 0,
        receitas: Number(r.receitas) || 0,
      })),
      maiorEntrada: Number(ext.maiorEntrada) || 0,
      maiorSaida: Math.abs(Number(ext.maiorSaida) || 0),
      descUnicas: Number(ext.descUnicas) || 0,
      contasAtivas: Number(ext.contasAtivas) || 0,
      porContaMes: R(porContaMesRes).map((r) => ({
        contaBancariaId: r.contaBancariaId == null ? null : Number(r.contaBancariaId),
        mes: Number(r.mes) || 0,
        entradas: Number(r.entradas) || 0,
        saidas: Number(r.saidas) || 0,
      })),
    };
  }),

  // Rev. 3766 — DRILL-DOWN POR CATEGORIA: retorna os financial_entries individuais de uma
  // conta do plano de contas (conta_nome) no período. READ-ONLY · ZERO SCHEMA/ALTER/DROP.
  getConciliacaoEntradasPorCategoria: protectedProcedure.input(z.object({
    companyId: z.number().int(),
    ano: z.number().int(),
    mes: z.number().int().min(0).max(12).optional(),
    contaNome: z.string().min(1).max(200),
    tipo: z.enum(["despesa", "receita"]),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const cid = Number(input.companyId);
    const yr = Number(input.ano);
    const mo = (typeof input.mes === "number" && input.mes >= 1 && input.mes <= 12) ? Number(input.mes) : 0;
    const periodo = (expr: string) =>
      `EXTRACT(YEAR FROM ${expr})=${yr}` + (mo ? ` AND EXTRACT(MONTH FROM ${expr})=${mo}` : "");
    // dbExecute liga params por ORDEM DE APARIÇÃO: $1=tipo, $2=contaNome.
    // periodo usa inteiros inline (seguros, validados por z.number().int()).
    const res = await dbExecute(db,
      `SELECT fe.id,
              COALESCE(fe.data_competencia, fe.data_vencimento, fe.created_at::date) AS data,
              fe.descricao,
              COALESCE(fe.valor_realizado, fe.valor_previsto, 0) AS valor,
              COALESCE(fe.conta_nome, fa.nome) AS "contaNome",
              fe.fornecedor_nome AS "fornecedorNome",
              fe.obra_nome AS "obraNome",
              fe.status,
              fe.tipo
         FROM financial_entries fe
         LEFT JOIN financial_accounts fa ON fa.id = fe.conta_id
        WHERE fe.company_id=${cid}
          AND fe.tipo=$1
          AND ${periodo("COALESCE(fe.data_competencia, fe.data_vencimento, fe.created_at::date)")}
          AND TRIM(LOWER(COALESCE(fe.conta_nome, fa.nome, ''))) = TRIM(LOWER($2))
        ORDER BY COALESCE(fe.data_competencia, fe.data_vencimento, fe.created_at::date) DESC
        LIMIT 500`,
      [input.tipo, input.contaNome]);
    return rows(res).map((r: any) => ({
      id: Number(r.id),
      data: r.data,
      descricao: r.descricao || "—",
      valor: Number(r.valor) || 0,
      contaNome: r.contaNome || "—",
      fornecedorNome: r.fornecedorNome || "—",
      obraNome: r.obraNome || "—",
      status: r.status || "—",
      tipo: r.tipo || "",
    }));
  }),

  // Rev. 3766 — DRILL-DOWN POR OBRA: retorna os financial_entries individuais de uma obra
  // no período (despesas + receitas juntas). READ-ONLY · ZERO SCHEMA/ALTER/DROP.
  getConciliacaoEntradasPorObra: protectedProcedure.input(z.object({
    companyId: z.number().int(),
    ano: z.number().int(),
    mes: z.number().int().min(0).max(12).optional(),
    obraNome: z.string().min(1).max(200),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await _assertFinanceiroCompanyAccess(ctx.user, input.companyId);
    const cid = Number(input.companyId);
    const yr = Number(input.ano);
    const mo = (typeof input.mes === "number" && input.mes >= 1 && input.mes <= 12) ? Number(input.mes) : 0;
    const periodo = (expr: string) =>
      `EXTRACT(YEAR FROM ${expr})=${yr}` + (mo ? ` AND EXTRACT(MONTH FROM ${expr})=${mo}` : "");
    // dbExecute liga params por ORDEM DE APARIÇÃO: $1=obraNome.
    const res = await dbExecute(db,
      `SELECT fe.id,
              COALESCE(fe.data_competencia, fe.data_vencimento, fe.created_at::date) AS data,
              fe.descricao,
              COALESCE(fe.valor_realizado, fe.valor_previsto, 0) AS valor,
              COALESCE(fe.conta_nome, fa.nome) AS "contaNome",
              fe.fornecedor_nome AS "fornecedorNome",
              fe.obra_nome AS "obraNome",
              fe.status,
              fe.tipo
         FROM financial_entries fe
         LEFT JOIN financial_accounts fa ON fa.id = fe.conta_id
        WHERE fe.company_id=${cid}
          AND ${periodo("COALESCE(fe.data_competencia, fe.data_vencimento, fe.created_at::date)")}
          AND TRIM(LOWER(COALESCE(fe.obra_nome, ''))) = TRIM(LOWER($1))
        ORDER BY COALESCE(fe.data_competencia, fe.data_vencimento, fe.created_at::date) DESC
        LIMIT 500`,
      [input.obraNome]);
    return rows(res).map((r: any) => ({
      id: Number(r.id),
      data: r.data,
      descricao: r.descricao || "—",
      valor: Number(r.valor) || 0,
      contaNome: r.contaNome || "—",
      fornecedorNome: r.fornecedorNome || "—",
      obraNome: r.obraNome || "—",
      status: r.status || "—",
      tipo: r.tipo || "",
    }));
  }),
});
