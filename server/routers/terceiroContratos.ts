import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserCompanyLinks, createAuditLog } from "../db";
import { upperCaseEmpresa } from "../../shared/normalizeNomeEmpresa";
import { aplicarLevantamentoNaMedicaoTerceiro } from "../terceiroLevantamentoSync";
import { calcularSaldosRealocacaoGeral } from "./compras";
import { triggerFinancialSync, triggerFinancialSyncAwaited } from "../services/financialEventTrigger";
import { eq, and, or, desc, inArray, notInArray, sql, asc, isNull } from "drizzle-orm";
import {
  terceiroContratos,
  terceiroContratoItens,
  terceiroMedicoes,
  terceiroMedicaoItens,
  terceiroMedicaoFds,
  terceiroContratoAditivos,
  budgetReallocations,
  medicaoConfig,
  medicaoCampo,
  medicaoCampoContornos,
  medicaoCampoFotos,
  terceiroDocumentos,
  empresasTerceiras,
  planejamentoAtividades,
  planejamentoAvancos,
  planejamentoProjetos,
  obras,
  comprasCotacoes,
  comprasCotacoesItens,
  comprasCotacaoFornecedores,
  comprasCotacaoRespostas,
  comprasOrdens,
  comprasSolicitacoes,
  comprasSolicitacoesItens,
  planejamentoRevisoes,
  fornecedores,
  terceiroContratoTemplates,
  terceiroTemplateRevisoes,
  terceiroContratoRevisoes,
  companies,
  orcamentos,
  orcamentoItens,
  portalCredentials,
  financialEntries,
  financialEntryBaixas,
  companyBankAccounts,
  users,
  integrasignEnvelopes,
  integrasignSignatarios,
} from "../../drizzle/schema";

const n = (v: any) => parseFloat(String(v ?? 0)) || 0;

// ============================================================
// Rev. 4778 — POKA-YOKE FINANCEIRO (método do usuário): medição aprovada
// SEMPRE tem que virar título no Contas a Pagar. Antes, o título só nascia
// via triggerFinancialSyncAwaited, que é GATEADO pelo toggle por empresa
// `auto_import_enabled` (default OFF) — ou seja, com o toggle desligado a
// aprovação "dava certo" e o título NUNCA nascia, silenciosamente.
// Este helper chama o importador direcionado (idempotente por
// origem_modulo='terceiro_medicao' + origem_id) BYPASSANDO o toggle, e
// verifica de fato se o entry existe depois. Retorna true = título garantido.
// ============================================================
async function garantirTituloDaMedicao(companyId: number, medicaoId: number): Promise<boolean> {
  const db = await getDb();
  const [med] = await db.select().from(terceiroMedicoes)
    .where(and(eq(terceiroMedicoes.id, medicaoId), eq(terceiroMedicoes.companyId, companyId)));
  if (!med) return false;
  if (!["aprovada", "faturada", "paga"].includes(String(med.status))) return false;
  const jaTem = async () => {
    const rows = await db.select({ id: financialEntries.id }).from(financialEntries)
      .where(and(
        eq(financialEntries.companyId, companyId),
        eq(financialEntries.origemModulo, "terceiro_medicao"),
        eq(financialEntries.origemId, medicaoId),
      )).limit(1);
    return rows.length > 0;
  };
  if (await jaTem()) return true;
  // Rev. 4778 — período normalizado: só usa `periodo` se estiver em YYYY-MM;
  // senão cai pra dataReferencia (senão o import filtra por um mês inexistente
  // e devolve falso "sem título").
  let periodo: string | undefined = undefined;
  const pRaw = String((med as any).periodo || "").slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(pRaw)) periodo = pRaw;
  else {
    const dRef = String((med as any).dataReferencia || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(dRef)) periodo = dRef;
  }
  // Rev. 4778 — advisory XACT lock por medição: evita corrida aprovação×reenvio×retry
  // criando título duplicado (o import é check-then-insert sem unique no banco).
  // xact_lock em transação: solta sozinho no commit/rollback — com pool de conexões,
  // lock/unlock manuais poderiam cair em sessões diferentes e vazar o lock.
  return await db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(478001, ${medicaoId})`);
    if (await jaTem()) return true;
    const { importTerceirosToFinancial } = await import("../services/financialIntegrationBridge");
    await importTerceirosToFinancial(companyId, periodo);
    return await jaTem();
  });
}

// Rev. 4778 — pós-aprovação: garante o título e, se falhar, avisa o aprovador
// via alerta in-app (pop-up global) em vez de só logar no console.
// Rev. 4797 — Poka-Yoke: aprovar a medição CONSOLIDA o levantamento vinculado
// (quantitativo congelado). Idempotente: só grava se ainda não consolidado.
async function _consolidarLevantamentoDaMedicao(db: any, medicao: any, companyId: number, nome: string | null) {
  const campoId = medicao?.levantamentoCampoId;
  if (!campoId) return;
  await db.update(medicaoCampo)
    .set({ consolidadoEm: new Date(), consolidadoPorNome: nome || null, atualizadoEm: new Date() })
    .where(and(
      eq(medicaoCampo.id, campoId),
      eq(medicaoCampo.companyId, companyId),
      sql`consolidado_em IS NULL`,
    ));
}

// Rev. 4835 — POKA-YOKE (pedido do usuário): medição com levantamento vinculado
// AINDA não consolidado só pode ser aprovada se a Memória de Cálculo estiver
// assinada pelas duas partes (envelope FCSign concluído do levantamento).
async function _assertLevantamentoAssinado(db: any, medicaoId: number, companyId: number) {
  const [med] = await db.select({ levantamentoCampoId: (terceiroMedicoes as any).levantamentoCampoId })
    .from(terceiroMedicoes)
    .where(and(eq(terceiroMedicoes.id, medicaoId), eq(terceiroMedicoes.companyId, companyId)));
  const campoId = Number(med?.levantamentoCampoId || 0);
  if (!campoId) return;
  const [campo] = await db.select({ consolidadoEm: medicaoCampo.consolidadoEm }).from(medicaoCampo)
    .where(and(eq(medicaoCampo.id, campoId), eq(medicaoCampo.companyId, companyId)));
  if (!campo || campo.consolidadoEm) return; // já consolidado = assinatura já foi exigida no ciclo
  const [envAss] = await db.select({ id: integrasignEnvelopes.id }).from(integrasignEnvelopes)
    .where(and(
      eq(integrasignEnvelopes.companyId, companyId),
      eq((integrasignEnvelopes as any).medicaoCampoId, campoId),
      sql`${integrasignEnvelopes.excluidoEm} IS NULL`,
      eq(integrasignEnvelopes.status, "concluido"),
    )).limit(1);
  // Review Rev. 4835 — exige as DUAS partes assinadas, não só status concluído.
  const assinados = envAss ? await db.select({ id: integrasignSignatarios.id })
    .from(integrasignSignatarios)
    .where(and(
      eq(integrasignSignatarios.envelopeId, envAss.id),
      eq(integrasignSignatarios.status, "assinado"),
      sql`${integrasignSignatarios.papel} <> 'testemunha'`,
    )) : [];
  if (!envAss || assinados.length < 2) {
    throw new Error("A Memória de Cálculo do levantamento vinculado ainda não foi assinada pelas duas partes (elaborador + responsável). Envie para assinatura no FCSign e aguarde a conclusão antes de aprovar a medição.");
  }
}

async function _posAprovacaoFinanceiro(companyId: number, medicaoId: number, userId: number | null | undefined): Promise<boolean> {
  let ok = false;
  try {
    ok = await garantirTituloDaMedicao(companyId, medicaoId);
  } catch (e: any) {
    console.error(`[posAprovacaoFinanceiro] Falha ao garantir título da medição #${medicaoId}:`, e?.message || e);
  }
  if (!ok && userId) {
    try {
      const { criarUserAlert } = await import("../db");
      await criarUserAlert({
        userId,
        companyId,
        tipo: "medicao_sem_titulo",
        titulo: "Medição aprovada SEM título no Financeiro",
        mensagem: `A medição #${medicaoId} foi aprovada, mas o título NÃO foi criado no Contas a Pagar. Abra Medições de Terceiros e toque em "Reenviar ao Financeiro".`,
        linkUrl: "/terceiros/medicoes",
      });
    } catch {}
  }
  return ok;
}

// Rev. 2830 — guarda de tenancy contra IDOR cross-tenant. Endpoints que recebem só
// `{ id }` devem carregar a linha e validar o companyId contra os vínculos do chamador
// (mesma semântica do _assertCompanyAccess de terceiros.ts: admin/admin_master livre;
// sem vínculos explícitos = acesso global controlado por grupo/módulo; senão exige match).
async function _assertCompanyAccess(ctxUser: any, companyId: number | null | undefined) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (typeof companyId !== "number" || !new Set<number>(allowedIds).has(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este contrato." });
  }
}

// Rev. 4850 — assinatura FINAL do sócio administrador no boletim FCSign aprova a
// medição automaticamente (mesma transação atômica do aprovarMedicao) e garante
// o título no Contas a Pagar. Idempotente: já aprovada → só garante o título.
export async function aprovarMedicaoPorAssinatura(companyId: number, medicaoId: number, aprovadoPor: string, userId?: number | null): Promise<void> {
  const db = await getDb();
  const [existing] = await db.select().from(terceiroMedicoes)
    .where(and(eq(terceiroMedicoes.id, medicaoId), eq(terceiroMedicoes.companyId, companyId)));
  if (!existing) throw new Error("Medição não encontrada");
  if (existing.status !== "aguardando_aprovacao") {
    if (["aprovada", "faturada", "paga"].includes(String(existing.status))) {
      await _posAprovacaoFinanceiro(companyId, medicaoId, userId);
      return;
    }
    // Review Rev. 4850 — status não aprovável (rascunho/rejeitada/cancelada):
    // falha EXPLÍCITA → o hook do envelope alerta o criador (nada silencioso).
    throw new Error(`Medição está com status "${existing.status}" e não pode ser aprovada automaticamente pela assinatura.`);
  }
  // Mesmos poka-yokes da aprovação manual (FD pendente / levantamento assinado)
  await _assertSemFdPendente(db, medicaoId, companyId);
  await _assertLevantamentoAssinado(db, medicaoId, companyId);
  const medicao = await db.transaction(async (tx: any) => {
    const [med0] = await tx.select().from(terceiroMedicoes)
      .where(and(eq(terceiroMedicoes.id, medicaoId), eq(terceiroMedicoes.companyId, companyId)));
    if (!med0 || med0.status !== "aguardando_aprovacao") return med0;
    const fdRowsTx = await tx.select({ valor: terceiroMedicaoFds.valor }).from(terceiroMedicaoFds)
      .where(and(eq(terceiroMedicaoFds.companyId, companyId), eq(terceiroMedicaoFds.medicaoId, medicaoId)));
    const fdTotalTx = fdRowsTx.reduce((s: number, r: any) => s + n(r.valor), 0);
    const [med] = await tx.update(terceiroMedicoes)
      .set({ status: "aprovada", aprovadoPor, aprovadoEm: new Date().toISOString(), fdTotalAbatido: String(fdTotalTx), atualizadoEm: new Date().toISOString() } as any)
      .where(eq(terceiroMedicoes.id, medicaoId))
      .returning();
    const itensMedicao = await tx.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, medicaoId));
    for (const im of itensMedicao) {
      await tx.update(terceiroContratoItens)
        .set({
          percentualMedidoAcumulado: String(n(im.percentualAcumuladoAnterior) + n(im.percentualMedidoPeriodo)),
          valorMedidoAcumulado: im.valorAcumulado,
        })
        .where(eq(terceiroContratoItens.id, im.contratoItemId));
    }
    return med;
  });
  if (!medicao || medicao.status !== "aprovada") return;
  await _consolidarLevantamentoDaMedicao(db, medicao, companyId, aprovadoPor).catch((e: any) =>
    console.error(`[aprovarMedicaoPorAssinatura] FALHA ao consolidar levantamento:`, e?.message || e));
  await _posAprovacaoFinanceiro(companyId, medicaoId, userId);
  try {
    await triggerFinancialSyncAwaited(companyId);
  } catch (syncErr: any) {
    console.error(`[aprovarMedicaoPorAssinatura] FALHA no sync financeiro pós-aprovação da medição #${medicaoId}:`, syncErr?.message || syncErr);
  }
}

// Rev. 4832 — Herança da condição de pagamento padrão de terceiros da OBRA no
// momento da criação do contrato. Lookup escopado por companyId (anti-IDOR:
// obra de outra empresa nunca influencia os defaults).
async function _herdarCondicaoPagamentoDaObra(db: any, obraId: number | null | undefined, companyId: number): Promise<{ diaMedicao?: number; diaPagamento?: number; prazoAprovacaoDias?: number; pagamentoConformeRecebimento?: number }> {
  const herdado: { diaMedicao?: number; diaPagamento?: number; prazoAprovacaoDias?: number; pagamentoConformeRecebimento?: number } = {};
  if (!obraId) return herdado;
  try {
    const [ob] = await db.select({
      dm: obras.terceiroDiaMedicao,
      dp: obras.terceiroDiaPagamento,
      pa: obras.terceiroPrazoAprovacaoDias,
      cr: obras.terceiroPagamentoConformeRecebimento,
    }).from(obras).where(and(eq(obras.id, obraId), eq(obras.companyId, companyId)));
    if (ob) {
      if (ob.dm != null) herdado.diaMedicao = ob.dm;
      if (ob.dp != null) herdado.diaPagamento = ob.dp;
      if (ob.pa != null) herdado.prazoAprovacaoDias = ob.pa;
      if (ob.cr != null && Number(ob.cr) === 1) herdado.pagamentoConformeRecebimento = 1;
    }
  } catch (e: any) {
    console.warn("[terceiroContratos] herança de condição de pagamento da obra falhou:", e?.message);
  }
  return herdado;
}

// Rev. 2830 — FD (Faturamento Direto) de MATERIAL atrelado a um contrato de terceiro.
// Origem: OCs de Compras marcadas como FD (modalidade_fd != 'normal' OU fd_valor > 0),
// vinculadas ao contrato por (1) contrato_id explícito OU (2) heurística obra+fornecedor
// (a empresa terceira aponta para um fornecedor via fornecedor_id). É read-only e abate o
// valor do contrato (decisão do usuário: material vira FD e é descontado do contrato).
async function _fdMaterialDoContrato(db: any, contrato: any): Promise<{
  registros: Array<{ id: number; numeroOc: string | null; descricao: string | null; fornecedorNome: string | null; valor: number; data: string | null; modalidadeFd: string | null; status: string | null; vinculo: "contrato" | "obra_fornecedor" }>;
  total: number;
}> {
  try {
    let fornecedorId: number | null = null;
    if (contrato.empresaTerceiraId) {
      const [emp] = await db.select({ fornecedorId: empresasTerceiras.fornecedorId })
        .from(empresasTerceiras).where(eq(empresasTerceiras.id, contrato.empresaTerceiraId));
      fornecedorId = (emp as any)?.fornecedorId ?? null;
    }
    const heuristica = (fornecedorId && contrato.obraId)
      ? and(eq(comprasOrdens.obraId, contrato.obraId), eq(comprasOrdens.fornecedorId, fornecedorId))
      : sql`false`;

    const ocs = await db.select({
      id: comprasOrdens.id,
      numeroOc: comprasOrdens.numeroOc,
      descricao: comprasOrdens.observacoes,
      fornecedorNome: comprasOrdens.fornecedorNome,
      total: comprasOrdens.total,
      fdValor: comprasOrdens.fdValor,
      modalidadeFd: comprasOrdens.modalidadeFd,
      status: comprasOrdens.status,
      data: comprasOrdens.criadoEm,
      contratoId: comprasOrdens.contratoId,
    }).from(comprasOrdens).where(and(
      eq(comprasOrdens.companyId, contrato.companyId),
      // Precedência do vínculo EXPLÍCITO: a heurística obra+fornecedor só captura OCs SEM
      // contrato_id (ou apontando para ESTE contrato). OCs presas a OUTRO contrato no mesmo
      // par obra+fornecedor NÃO são duplicadas aqui (evita dupla contagem de FD — Rev. 2830).
      or(eq(comprasOrdens.contratoId, contrato.id), and(heuristica, isNull(comprasOrdens.contratoId))),
    ));

    const registros: any[] = [];
    let total = 0;
    for (const oc of ocs as any[]) {
      const isFd = (oc.modalidadeFd && oc.modalidadeFd !== "normal") || n(oc.fdValor) > 0;
      if (!isFd) continue;
      if (oc.status === "cancelada" || oc.status === "rascunho") continue;
      const valorEfetivo = n(oc.fdValor) > 0 ? n(oc.fdValor) : n(oc.total);
      if (valorEfetivo <= 0) continue;
      total += valorEfetivo;
      registros.push({
        id: oc.id,
        numeroOc: oc.numeroOc ?? null,
        descricao: oc.descricao ?? null,
        fornecedorNome: oc.fornecedorNome ?? null,
        valor: valorEfetivo,
        data: oc.data ? String(oc.data) : null,
        modalidadeFd: oc.modalidadeFd ?? null,
        status: oc.status ?? null,
        vinculo: oc.contratoId === contrato.id ? "contrato" : "obra_fornecedor",
      });
    }
    registros.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    return { registros, total };
  } catch (e: any) {
    console.error("[_fdMaterialDoContrato] erro:", e?.message || e);
    return { registros: [], total: 0 };
  }
}

// Rev. 4798 — FD PENDENTE do contrato: total de FD de material (OCs de Compras
// marcadas FD) que ainda NÃO foi descontado em nenhuma medição (lançamentos em
// terceiro_medicao_fds). Pedido do usuário: o sistema puxa o débito sozinho e
// NÃO deixa aprovar medição com débito pendente ("não pagar mais que o combinado").
async function _fdPendenteDoContrato(db: any, contrato: any): Promise<{
  pendente: number; fdMaterialTotal: number; abatidoTotal: number;
  registros: Array<{ id: number; numeroOc: string | null; descricao: string | null; valor: number; data: string | null }>;
}> {
  const fd = await _fdMaterialDoContrato(db, contrato);
  const rows = await db.select({ valor: terceiroMedicaoFds.valor, medicaoId: terceiroMedicaoFds.medicaoId, origem: terceiroMedicaoFds.origem, abatidoRetencao: terceiroMedicaoFds.abatidoRetencao }).from(terceiroMedicaoFds)
    .where(and(eq(terceiroMedicaoFds.companyId, contrato.companyId), eq(terceiroMedicaoFds.contratoId, contrato.id)));
  // Rev. 4801 — conta-corrente de descontos:
  // · origem 'avulso' = débito lançado FORA de medição (ex.: insumo do almox com
  //   custo do terceiro). Enquanto solto (sem medição e sem abatido_retencao),
  //   SOMA na pendência; quando puxado p/ medição ou abatido da retenção, zera.
  // · demais origens com medição/abatido_retencao = abatimento do débito de FD das OCs.
  const settled = (r: any) => typeof r.medicaoId === "number" || Number(r.abatidoRetencao) === 1;
  const avulsoPendente = rows.filter((r: any) => r.origem === "avulso" && !settled(r)).reduce((s: number, r: any) => s + n(r.valor), 0);
  const abatidoTotal = rows.filter((r: any) => r.origem !== "avulso" && settled(r)).reduce((s: number, r: any) => s + n(r.valor), 0);
  const pendente = Math.max(0, Math.round((fd.total + avulsoPendente - abatidoTotal) * 100) / 100);
  return { pendente, fdMaterialTotal: fd.total, abatidoTotal, registros: fd.registros };
}

// Rev. 4799 — puxa AUTOMATICAMENTE o débito de FD pendente do contrato para a
// medição (transação + advisory lock: idempotente, sem desconto em dobro).
// Capado no valor medido do período; o restante fica pendente pras próximas.
// Chamado ao GERAR/RECALCULAR medição (usuário não precisa clicar em nada) e
// também pela mutation manual (fallback p/ medições antigas).
async function _puxarFdAutomatico(db: any, contrato: any, medicaoId: number, criadoPor?: string | null) {
  return await db.transaction(async (tx: any) => {
    // Rev. 4801 — lock por CONTRATO (não por medição): o recurso disputado são os
    // débitos avulsos pendentes + o saldo de FD das OCs do contrato inteiro.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(478003, ${contrato.id})`);
    const { pendente: pendenteTotal, registros } = await _fdPendenteDoContrato(tx, contrato);
    if (pendenteTotal <= 0.01) return { criado: false, pendente: 0, restante: 0 };
    const [medRow] = await tx.select({ valorMedido: terceiroMedicoes.valorMedido, status: terceiroMedicoes.status, fdExclusaoAlerta: terceiroMedicoes.fdExclusaoAlerta })
      .from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, medicaoId), eq(terceiroMedicoes.companyId, contrato.companyId)));
    if (!medRow || medRow.status === "aprovada" || medRow.status === "paga") return { criado: false, pendente: 0, restante: pendenteTotal };
    // Rev. 4827 — o usuário EXCLUIU o desconto automático desta medição de forma
    // consciente: não re-lançar sozinho (senão o recálculo desfaz a decisão).
    // O aviso "Existem FDs pendentes" segue gravado na medição.
    if (medRow.fdExclusaoAlerta) return { criado: false, pendente: 0, restante: pendenteTotal };
    const fdsJa = await tx.select({ valor: terceiroMedicaoFds.valor }).from(terceiroMedicaoFds)
      .where(and(eq(terceiroMedicaoFds.companyId, contrato.companyId), eq(terceiroMedicaoFds.medicaoId, medicaoId)));
    const jaLancado = fdsJa.reduce((s: number, r: any) => s + n(r.valor), 0);
    const medido = n(medRow.valorMedido);
    if (medido <= 0) return { criado: false, pendente: 0, restante: pendenteTotal }; // sem valor medido ainda — puxa no recálculo
    const teto = Math.max(0, Math.round((medido - jaLancado) * 100) / 100);
    if (Math.min(pendenteTotal, teto) <= 0.01) return { criado: false, pendente: 0, restante: pendenteTotal };
    let tetoLivre = teto;
    let lancado = 0;

    // Rev. 4801 — 1º) débitos AVULSOS pendentes (EPI, insumo do almox, etc.) são
    // atribuídos à medição um a um (mantêm tipo/descrição próprios no boletim).
    // Se o último não couber inteiro no teto, a linha é DIVIDIDA: a parte que
    // coube entra na medição, o resto vira nova linha avulsa pendente.
    const avulsos = await tx.select().from(terceiroMedicaoFds)
      .where(and(
        eq(terceiroMedicaoFds.companyId, contrato.companyId),
        eq(terceiroMedicaoFds.contratoId, contrato.id),
        eq(terceiroMedicaoFds.origem, "avulso"),
        sql`${terceiroMedicaoFds.medicaoId} IS NULL`,
        eq(terceiroMedicaoFds.abatidoRetencao, 0),
      )).orderBy(asc(terceiroMedicaoFds.dataFd), asc(terceiroMedicaoFds.id));
    for (const av of avulsos) {
      if (tetoLivre <= 0.01) break;
      const v = n(av.valor);
      if (v <= tetoLivre + 0.005) {
        await tx.update(terceiroMedicaoFds).set({ medicaoId, atualizadoEm: new Date().toISOString() })
          .where(eq(terceiroMedicaoFds.id, av.id));
        tetoLivre = Math.round((tetoLivre - v) * 100) / 100;
        lancado = Math.round((lancado + v) * 100) / 100;
      } else {
        const cabe = Math.round(tetoLivre * 100) / 100;
        const resto = Math.round((v - cabe) * 100) / 100;
        await tx.update(terceiroMedicaoFds).set({ medicaoId, valor: String(cabe.toFixed(2)), atualizadoEm: new Date().toISOString() })
          .where(eq(terceiroMedicaoFds.id, av.id));
        await tx.insert(terceiroMedicaoFds).values({
          companyId: contrato.companyId, contratoId: contrato.id, medicaoId: null,
          descricao: `${av.descricao} (saldo restante)`.slice(0, 500),
          valor: String(resto.toFixed(2)), dataFd: av.dataFd, origem: "avulso",
          tipo: (av as any).tipo || "outro", observacoes: av.observacoes, criadoPor: av.criadoPor,
        } as any);
        lancado = Math.round((lancado + cabe) * 100) / 100;
        tetoLivre = 0;
      }
    }

    // 2º) débito de FD de material das OCs (agregado, como antes), no teto restante.
    if (tetoLivre > 0.01) {
      const rowsAb = await tx.select({ valor: terceiroMedicaoFds.valor, origem: terceiroMedicaoFds.origem, medicaoId: terceiroMedicaoFds.medicaoId, abatidoRetencao: terceiroMedicaoFds.abatidoRetencao }).from(terceiroMedicaoFds)
        .where(and(eq(terceiroMedicaoFds.companyId, contrato.companyId), eq(terceiroMedicaoFds.contratoId, contrato.id)));
      const abatidoOc = rowsAb.filter((r: any) => r.origem !== "avulso" && (typeof r.medicaoId === "number" || Number(r.abatidoRetencao) === 1)).reduce((s: number, r: any) => s + n(r.valor), 0);
      const fdTotal = (await _fdMaterialDoContrato(tx, contrato)).total;
      const ocPend = Math.max(0, Math.round((fdTotal - abatidoOc) * 100) / 100);
      const parcela = Math.min(ocPend, tetoLivre);
      if (parcela > 0.01) {
        const ocsTxt = registros.map((r) => r.numeroOc || `OC #${r.id}`).join(", ");
        await tx.insert(terceiroMedicaoFds).values({
          companyId: contrato.companyId,
          contratoId: contrato.id,
          medicaoId,
          descricao: `FD de material pendente do contrato (${ocsTxt})`.slice(0, 500),
          valor: String(parcela.toFixed(2)),
          dataFd: new Date().toISOString().slice(0, 10),
          origem: "auto",
          tipo: "fd",
          observacoes: "Puxado automaticamente — débito de FD do contrato descontado do valor a pagar.",
          criadoPor: criadoPor || null,
        } as any);
        lancado = Math.round((lancado + parcela) * 100) / 100;
      }
    }

    const restante = Math.max(0, Math.round((pendenteTotal - lancado) * 100) / 100);
    return { criado: lancado > 0.01, pendente: lancado, restante };
  });
}

// Rev. 4798 — guarda de aprovação: se o contrato tem FD de material ainda não
// descontado em medições, a aprovação é NEGADA com aviso claro.
async function _assertSemFdPendente(db: any, medicaoId: number, companyId: number) {
  const [med] = await db.select({ contratoId: terceiroMedicoes.contratoId }).from(terceiroMedicoes)
    .where(and(eq(terceiroMedicoes.id, medicaoId), eq(terceiroMedicoes.companyId, companyId)));
  if (!med?.contratoId) return;
  const [contrato] = await db.select().from(terceiroContratos)
    .where(and(eq(terceiroContratos.id, med.contratoId), eq(terceiroContratos.companyId, companyId)));
  if (!contrato) return;
  const { pendente } = await _fdPendenteDoContrato(db, contrato);
  if (pendente > 0.01) {
    // Rev. 4827 — o usuário excluiu o desconto automático desta medição de forma
    // CONSCIENTE (fica o aviso permanente "Existem FDs pendentes" na medição).
    // Bypass ESTREITO: libera a aprovação só até o valor efetivamente dispensado
    // (fd_exclusao_dispensa) — pendência NOVA acima disso volta a bloquear.
    const [medAlerta] = await db.select({ fdExclusaoAlerta: terceiroMedicoes.fdExclusaoAlerta, fdExclusaoDispensa: terceiroMedicoes.fdExclusaoDispensa }).from(terceiroMedicoes)
      .where(and(eq(terceiroMedicoes.id, medicaoId), eq(terceiroMedicoes.companyId, companyId)));
    if (medAlerta?.fdExclusaoAlerta && pendente <= n(medAlerta.fdExclusaoDispensa) + 0.01) return;
    // Débito maior que a medição: se ESTA medição já descontou até o teto
    // (FD ≥ valor medido → líquido zero), ela pode ser aprovada; o restante
    // continua bloqueando as PRÓXIMAS medições até zerar.
    const [medFull] = await db.select({ valorMedido: terceiroMedicoes.valorMedido }).from(terceiroMedicoes)
      .where(and(eq(terceiroMedicoes.id, medicaoId), eq(terceiroMedicoes.companyId, companyId)));
    const fdsMed = await db.select({ valor: terceiroMedicaoFds.valor }).from(terceiroMedicaoFds)
      .where(and(eq(terceiroMedicaoFds.companyId, companyId), eq(terceiroMedicaoFds.medicaoId, medicaoId)));
    const fdMedTotal = fdsMed.reduce((s: number, r: any) => s + n(r.valor), 0);
    const medido = n((medFull as any)?.valorMedido);
    if (medido > 0 && fdMedTotal >= medido - 0.01) return; // teto atingido — líquido 0
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Existem débitos de FD pendentes neste contrato (R$ ${pendente.toFixed(2).replace(".", ",")}) que ainda não foram descontados de nenhuma medição. Lance o desconto na medição (aba FD do Período → "Descontar nesta medição") antes de aprovar.`,
    });
  }
}

// ══════════════════════════════════════════════════════════════
// CONTRATOS
// ══════════════════════════════════════════════════════════════

// Rev. 2909 — Verificação de senha do admin master para operações destrutivas
// (cancelamento em cascata e exclusão definitiva de contrato). Só admin_master pode.
// Mesma semântica do verificarSenhaSeLocal de compras.ts: usuário OAuth (sem senha
// local) é liberado pela própria credencial de sessão + justificativa obrigatória.
async function _assertMasterComSenha(ctxUser: any, password: string | undefined) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role !== "admin_master") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o admin master pode executar esta operação." });
  }
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, ctxUser.id));
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não encontrado." });
  if (!user.password) return; // OAuth sem senha local
  if (!password) throw new TRPCError({ code: "BAD_REQUEST", message: "Senha do master é obrigatória." });
  const bcrypt = await import("bcryptjs");
  if (!bcrypt.compareSync(password, user.password)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta. Operação cancelada." });
  }
}

// Rev. 2909 — Cancelamento EM CASCATA do contrato (soft, preserva histórico):
//   1) contrato → status "cancelado" (+ quem/quando/motivo + nota em observações);
//   2) medições NÃO pagas (status != paga|cancelada) → "cancelada";
//   3) OCs vinculadas (status != cancelada) → "cancelada" (+ metadados);
//   4) financialEntries das OCs NÃO pagos (status != pago|recebido|cancelado) → "cancelado".
// Pagos ficam intactos. NÃO toca a cotação de origem (upstream/compartilhada). Self-contained
// (não importa compras.ts pra evitar dependência circular).
export async function cancelarContratoCascade(
  db: any,
  opts: { contratoId: number; companyId: number; motivo: string; usuarioNome: string; usuarioId: number },
): Promise<{ contratoCancelado: boolean; medicoesCanceladas: number; ocsCanceladas: number; financeirosCancelados: number }> {
  const { contratoId, companyId, motivo, usuarioNome } = opts;
  const agora = new Date().toISOString();
  const nota = `\n[CANCELADO ${agora}] por ${usuarioNome}: ${motivo}`;

  const [contrato] = await db.select().from(terceiroContratos)
    .where(and(eq(terceiroContratos.id, contratoId), eq(terceiroContratos.companyId, companyId)));
  if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });

  // OCs que NÃO devem ser canceladas em cascata: já canceladas OU já recebidas
  // (entregue / entregue_parcial). Material recebido permanece — a obrigação por ele não é
  // desfeita só porque o contrato foi cancelado; e seus financeiros (mesmo não pagos) ficam.
  const STATUS_OC_PRESERVAR = ["cancelada", "entregue", "entregue_parcial"];

  // Tudo numa transação única: ou cancela contrato + medições + OCs + financeiros, ou nada.
  return await db.transaction(async (tx: any) => {
    // 1) Contrato → cancelado
    let contratoCancelado = false;
    if (contrato.status !== "cancelado") {
      await tx.update(terceiroContratos).set({
        status: "cancelado",
        canceladoPor: usuarioNome,
        canceladoEm: agora,
        motivoCancelamento: motivo,
        observacoes: `${contrato.observacoes || ""}${nota}`,
        atualizadoEm: agora,
      } as any).where(and(eq(terceiroContratos.id, contratoId), eq(terceiroContratos.companyId, companyId)));
      contratoCancelado = true;
    }

    // 2) Medições não pagas → cancelada
    const medRes = await tx.update(terceiroMedicoes).set({
      status: "cancelada",
      atualizadoEm: agora,
    } as any).where(and(
      eq(terceiroMedicoes.contratoId, contratoId),
      eq(terceiroMedicoes.companyId, companyId),
      sql`${terceiroMedicoes.status} NOT IN ('paga','cancelada')`,
    )).returning({ id: terceiroMedicoes.id });
    const medicoesCanceladas = medRes.length;

    // 3 + 4) OCs vinculadas ainda não recebidas + seus financeiros não pagos
    const ocs = await tx.select({ id: comprasOrdens.id, status: comprasOrdens.status })
      .from(comprasOrdens)
      .where(and(eq(comprasOrdens.contratoId, contratoId), eq(comprasOrdens.companyId, companyId)));
    let ocsCanceladas = 0;
    let financeirosCancelados = 0;
    for (const oc of ocs) {
      if (STATUS_OC_PRESERVAR.includes(oc.status)) continue; // preserva recebidas/canceladas e seus financeiros
      await tx.update(comprasOrdens).set({
        status: "cancelada",
        canceladoPor: usuarioNome,
        canceladoEm: agora,
        motivoCancelamento: motivo,
        atualizadoEm: agora,
      } as any).where(and(eq(comprasOrdens.id, oc.id), eq(comprasOrdens.companyId, companyId)));
      ocsCanceladas++;
      const feRes = await tx.update(financialEntries).set({
        status: "cancelado",
        motivoCancelamento: motivo,
        updatedAt: agora,
      } as any).where(and(
        eq(financialEntries.companyId, companyId),
        eq(financialEntries.origemModulo, "compras"),
        eq(financialEntries.origemId, oc.id),
        sql`${financialEntries.status} NOT IN ('pago','recebido','cancelado')`,
      )).returning({ id: financialEntries.id });
      financeirosCancelados += feRes.length;
    }

    return { contratoCancelado, medicoesCanceladas, ocsCanceladas, financeirosCancelados };
  });
}

export const terceiroContratosRouter = router({

  listarContratos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      empresaTerceiraId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      let rows = await db.select().from(terceiroContratos)
        .where(eq(terceiroContratos.companyId, input.companyId))
        .orderBy(desc(terceiroContratos.criadoEm));
      if (input.obraId) rows = rows.filter(r => r.obraId === input.obraId);
      if (input.empresaTerceiraId) rows = rows.filter(r => r.empresaTerceiraId === input.empresaTerceiraId);
      if (input.status) rows = rows.filter(r => r.status === input.status);

      const empresas = await db.select({ id: empresasTerceiras.id, nomeFantasia: empresasTerceiras.nomeFantasia, razaoSocial: empresasTerceiras.razaoSocial })
        .from(empresasTerceiras).where(eq(empresasTerceiras.companyId, input.companyId));
      const empMap: Record<number, string> = {};
      empresas.forEach(e => { empMap[e.id] = e.nomeFantasia || e.razaoSocial; });

      // Rev. 3085 — status de ASSINATURA por contrato (regra ADESIVA do getContrato — Rev. 3064),
      // para a tela mostrar uma TAG "Assinado" × "Aguardando assinatura". Lê os envelopes FcSign
      // NÃO-excluídos: se QUALQUER um está "concluido" → "concluido"; senão o status do mais recente.
      const assinaturaPorContrato: Record<number, string | null> = {};
      try {
        const ids = rows.map(r => r.id);
        if (ids.length > 0) {
          const envs = await db.select({
            contratoTerceiroId: integrasignEnvelopes.contratoTerceiroId,
            status: integrasignEnvelopes.status,
            criadoEm: integrasignEnvelopes.criadoEm,
          })
            .from(integrasignEnvelopes)
            .where(and(
              eq(integrasignEnvelopes.companyId, input.companyId),
              inArray(integrasignEnvelopes.contratoTerceiroId, ids),
              isNull(integrasignEnvelopes.excluidoEm),
            ))
            .orderBy(desc(integrasignEnvelopes.criadoEm));
          for (const e of envs) {
            const cid = e.contratoTerceiroId;
            if (cid == null) continue;
            if (e.status === "concluido") { assinaturaPorContrato[cid] = "concluido"; continue; }
            if (assinaturaPorContrato[cid] === undefined) assinaturaPorContrato[cid] = e.status ?? null; // mais recente (já ordenado desc)
          }
        }
      } catch {}

      return rows.map(r => ({
        ...r,
        empresaNome: empMap[r.empresaTerceiraId] || "—",
        saldoDisponivel: n(r.valorTotal) - n(r.valorPago),
        percentualPago: n(r.valorTotal) > 0 ? (n(r.valorPago) / n(r.valorTotal)) * 100 : 0,
        assinaturaStatus: assinaturaPorContrato[r.id] ?? null,
      }));
    }),

  // Rev. 3085 — Contratos prontos para medição mensal = ASSINATURA CONCLUÍDA (regra ADESIVA),
  // excluindo apenas contratos cancelados. Alimenta a tela dedicada de Medições de Terceiros.
  //
  // POR QUE NÃO FILTRAR POR status="ativo": o campo `status` bruto é INCONSISTENTE — um contrato
  // já 100% assinado pode permanecer "aguardando_assinaturas" (ex.: CT-2026-0006), enquanto
  // contratos "ativo" podem nunca ter ido ao FcSign. O sinal confiável de "assinaturas finalizadas"
  // (pedido do usuário) é a existência de um envelope FcSign não-excluído "concluido" — a MESMA
  // regra ADESIVA do getContrato (Rev. 3064). Cancelados ficam de fora.
  listarContratosParaMedicao: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.select().from(terceiroContratos)
        .where(and(
          eq(terceiroContratos.companyId, input.companyId),
          notInArray(terceiroContratos.status, ["cancelado", "cancelada", "rascunho"]),
        ))
        .orderBy(desc(terceiroContratos.criadoEm));
      if (rows.length === 0) return [];

      const contratoIds = rows.map(r => r.id);

      // Envelopes não-excluídos dos contratos não-cancelados → set dos que têm "concluido".
      const assinadosSet = new Set<number>();
      try {
        const envs = await db.select({
          contratoTerceiroId: integrasignEnvelopes.contratoTerceiroId,
          status: integrasignEnvelopes.status,
        })
          .from(integrasignEnvelopes)
          .where(and(
            eq(integrasignEnvelopes.companyId, input.companyId),
            inArray(integrasignEnvelopes.contratoTerceiroId, contratoIds),
            isNull(integrasignEnvelopes.excluidoEm),
          ));
        envs.forEach(e => { if (e.status === "concluido" && e.contratoTerceiroId != null) assinadosSet.add(e.contratoTerceiroId); });
      } catch {}

      const assinados = rows.filter(r => assinadosSet.has(r.id));
      if (assinados.length === 0) return [];

      // Empresas terceiras (nome de exibição).
      const empresas = await db.select({ id: empresasTerceiras.id, nomeFantasia: empresasTerceiras.nomeFantasia, razaoSocial: empresasTerceiras.razaoSocial })
        .from(empresasTerceiras).where(eq(empresasTerceiras.companyId, input.companyId));
      const empMap: Record<number, string> = {};
      empresas.forEach(e => { empMap[e.id] = e.nomeFantasia || e.razaoSocial; });

      // Acumulado medido por contrato (soma dos itens) → % global + saldo a medir.
      const medidoPorContrato: Record<number, number> = {};
      try {
        const itens = await db.select({
          contratoId: terceiroContratoItens.contratoId,
          valorMedidoAcumulado: terceiroContratoItens.valorMedidoAcumulado,
        })
          .from(terceiroContratoItens)
          .where(and(
            eq(terceiroContratoItens.companyId, input.companyId),
            inArray(terceiroContratoItens.contratoId, assinados.map(c => c.id)),
          ));
        itens.forEach(i => {
          if (i.contratoId == null) return;
          medidoPorContrato[i.contratoId] = (medidoPorContrato[i.contratoId] || 0) + n(i.valorMedidoAcumulado);
        });
      } catch {}

      return assinados.map(r => {
        const medido = medidoPorContrato[r.id] || 0;
        const total = n(r.valorTotal);
        return {
          id: r.id,
          numero: r.numeroContrato,
          descricao: r.descricao,
          obraId: r.obraId,
          obraNome: r.obraNome,
          empresaTerceiraId: r.empresaTerceiraId,
          empresaNome: empMap[r.empresaTerceiraId] || "—",
          valorTotal: total,
          valorMedidoAcumulado: medido,
          saldoAMedir: Math.max(total - medido, 0),
          percentualMedido: total > 0 ? (medido / total) * 100 : 0,
          diaMedicao: (r as any).diaMedicao ?? null,
        };
      });
    }),

  getContrato: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.id));
      if (!contrato) return null;
      await _assertCompanyAccess(ctx.user, (contrato as any).companyId);

      const itensRaw = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.id))
        .orderBy(asc(terceiroContratoItens.ordem));

      const medicoesRaw = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.contratoId, input.id))
        .orderBy(desc(terceiroMedicoes.numero));

      let allMedicaoItens: any[] = [];
      if (medicoesRaw.length > 0) {
        try {
          allMedicaoItens = await db.select().from(terceiroMedicaoItens)
            .where(inArray(terceiroMedicaoItens.medicaoId, medicoesRaw.map(m => m.id)));
        } catch (e) { console.error("[getContrato] medicaoItens query error:", e); }
      }

      let medicoes: any[] = [];

      const documentos = await db.select().from(terceiroDocumentos)
        .where(eq(terceiroDocumentos.contratoId, input.id))
        .orderBy(desc(terceiroDocumentos.criadoEm));

      const [empresa] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, contrato.empresaTerceiraId));
      // Gestor de Projeto (testemunha 2) = SEMPRE o "Engenheiro / Responsável" do cadastro da obra.
      let obraResponsavel: string | null = null;
      if (contrato.obraId) {
        try {
          const [o] = await db.select({ responsavel: obras.responsavel }).from(obras).where(eq(obras.id, contrato.obraId));
          obraResponsavel = o?.responsavel || null;
        } catch {}
      }
      const [companyData] = await db.select({
        razaoSocial: companies.razaoSocial,
        nomeFantasia: companies.nomeFantasia,
        cnpj: companies.cnpj,
        logoUrl: companies.logoUrl,
        docRodapeTexto: companies.docRodapeTexto,
        docMarcaDaguaUrl: companies.docMarcaDaguaUrl,
        docMarcaDaguaOpacidade: companies.docMarcaDaguaOpacidade,
      }).from(companies).where(eq(companies.id, contrato.companyId));

      let itens: any[] = itensRaw;
      let itensHierarchy: any[] = [];
      let cronogramaRevisaoInfo: { numero: number; descricao: string | null; dataRevisao: string; status: string | null; isBaseline: boolean | null } | null = null;
      const eapCodes = [...new Set(itensRaw.map(it => (it as any).eapCodigo).filter(Boolean))] as string[];
      if (eapCodes.length > 0 && contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          if (proj) {
            const [rev] = await db.select({
              id: planejamentoRevisoes.id,
              numero: planejamentoRevisoes.numero,
              descricao: planejamentoRevisoes.descricao,
              dataRevisao: planejamentoRevisoes.dataRevisao,
              status: planejamentoRevisoes.status,
              isBaseline: planejamentoRevisoes.isBaseline,
            })
              .from(planejamentoRevisoes)
              .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
              .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
            if (rev) {
              cronogramaRevisaoInfo = { numero: rev.numero, descricao: rev.descricao, dataRevisao: rev.dataRevisao, status: rev.status, isBaseline: rev.isBaseline };
              const allAtividades = await db.select({
                eapCodigo: planejamentoAtividades.eapCodigo,
                nome: planejamentoAtividades.nome,
                nivel: planejamentoAtividades.nivel,
                isGrupo: planejamentoAtividades.isGrupo,
                dataInicio: planejamentoAtividades.dataInicio,
                dataFim: planejamentoAtividades.dataFim,
                revisaoId: planejamentoAtividades.revisaoId,
              }).from(planejamentoAtividades)
                .where(and(eq(planejamentoAtividades.projetoId, proj.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`))
                .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.eapCodigo));

              const atividadeMap = new Map<string, { nome: string; nivel: number; isGrupo: boolean | null; dataInicio: string | null; dataFim: string | null }>();
              for (const a of allAtividades) {
                if (!a.eapCodigo) continue;
                const existing = atividadeMap.get(a.eapCodigo);
                if (!existing || a.revisaoId === rev.id) {
                  atividadeMap.set(a.eapCodigo, { nome: a.nome, nivel: a.nivel ?? 0, isGrupo: a.isGrupo, dataInicio: a.dataInicio, dataFim: a.dataFim });
                }
              }

              const parentSet = new Set<string>();
              for (const eap of eapCodes) {
                const parts = eap.split(".");
                for (let i = 1; i < parts.length; i++) parentSet.add(parts.slice(0, i).join("."));
              }

              try {
                let orcId: number | null = (contrato as any).orcamentoId ?? null;
                if (!orcId) {
                  const [orc] = await db.select({ id: orcamentos.id }).from(orcamentos)
                    .where(and(eq(orcamentos.companyId, contrato.companyId), eq(orcamentos.obraId, contrato.obraId)))
                    .orderBy(desc(orcamentos.id)).limit(1);
                  if (orc) orcId = orc.id;
                }
                if (orcId) {
                  const orcItens = await db.select({
                    eapCodigo: orcamentoItens.eapCodigo,
                    descricao: orcamentoItens.descricao,
                    nivel: orcamentoItens.nivel,
                  }).from(orcamentoItens)
                    .where(eq(orcamentoItens.orcamentoId, orcId));
                  for (const oi of orcItens) {
                    if (oi.eapCodigo && oi.descricao) {
                      atividadeMap.set(oi.eapCodigo, {
                        nome: oi.descricao,
                        nivel: oi.nivel ?? oi.eapCodigo.split(".").length,
                        isGrupo: true,
                        dataInicio: atividadeMap.get(oi.eapCodigo)?.dataInicio ?? null,
                        dataFim: atividadeMap.get(oi.eapCodigo)?.dataFim ?? null,
                      });
                    }
                  }
                }
              } catch {}

              for (const parentEap of parentSet) {
                const atv = atividadeMap.get(parentEap);
                const nivel = parentEap.split(".").length;
                itensHierarchy.push({
                  _type: "grupo",
                  eapCodigo: parentEap,
                  nome: atv?.nome ?? `Nível ${parentEap}`,
                  nivel: atv?.nivel ?? nivel,
                  dataInicio: atv?.dataInicio ?? null,
                  dataFim: atv?.dataFim ?? null,
                });
              }
              itensHierarchy.sort((a: any, b: any) => a.eapCodigo.localeCompare(b.eapCodigo, undefined, { numeric: true }));

              itens = itensRaw.map(it => {
                const eap = (it as any).eapCodigo;
                const atv = eap ? atividadeMap.get(eap) : null;
                let origemPath: string | null = null;
                if (eap) {
                  const parts = eap.split(".");
                  const pathParts: string[] = [];
                  for (let i = 1; i <= parts.length; i++) {
                    const parentEap = parts.slice(0, i).join(".");
                    const p = atividadeMap.get(parentEap);
                    if (p) pathParts.push(p.nome);
                  }
                  if (pathParts.length > 1) origemPath = pathParts.slice(0, -1).join(" > ");
                  else if (pathParts.length === 1 && atv) origemPath = pathParts[0];
                }
                return { ...it, atividadeNome: atv?.nome ?? null, atividadeDataInicio: atv?.dataInicio ?? null, atividadeDataFim: atv?.dataFim ?? null, atividadeNivel: atv?.nivel ?? null, origemPath };
              });
            }
          }
        } catch {}
      }

      if (!cronogramaRevisaoInfo && contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          if (proj) {
            const [rev] = await db.select({
              numero: planejamentoRevisoes.numero,
              descricao: planejamentoRevisoes.descricao,
              dataRevisao: planejamentoRevisoes.dataRevisao,
              status: planejamentoRevisoes.status,
              isBaseline: planejamentoRevisoes.isBaseline,
            }).from(planejamentoRevisoes)
              .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
              .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
            if (rev) cronogramaRevisaoInfo = { numero: rev.numero, descricao: rev.descricao, dataRevisao: rev.dataRevisao, status: rev.status, isBaseline: rev.isBaseline };
          }
        } catch {}
      }

      const atividadeIds = itensRaw.map(i => (i as any).planejamentoAtividadeId).filter(Boolean) as number[];
      let avancoFisicoMap = new Map<number, number>();
      if (atividadeIds.length > 0) {
        try {
          const avancos = await db.select({
            atividadeId: planejamentoAvancos.atividadeId,
            percentualAcumulado: planejamentoAvancos.percentualAcumulado,
            semana: planejamentoAvancos.semana,
          }).from(planejamentoAvancos)
            .where(inArray(planejamentoAvancos.atividadeId, atividadeIds))
            .orderBy(desc(planejamentoAvancos.semana));
          for (const av of avancos) {
            if (!avancoFisicoMap.has(av.atividadeId)) {
              avancoFisicoMap.set(av.atividadeId, n(av.percentualAcumulado));
            }
          }
        } catch {}
      }
      itens = itens.map((it: any) => {
        const atId = it.planejamentoAtividadeId;
        const avancoFisico = atId ? (avancoFisicoMap.get(atId) ?? null) : null;
        const percentualFinanceiro = n(it.valorMedidoAcumulado) > 0 && n(it.valorTotal) > 0
          ? (n(it.valorMedidoAcumulado) / n(it.valorTotal)) * 100 : 0;
        const divergencia = avancoFisico !== null ? percentualFinanceiro - avancoFisico : null;
        return { ...it, avancoFisicoReal: avancoFisico, percentualFinanceiro, divergencia };
      });

      medicoes = medicoesRaw.map(m => ({
        ...m,
        itens: allMedicaoItens
          .filter(i => i.medicaoId === m.id)
          .map(i => {
            const ci = itens.find((c: any) => c.id === i.contratoItemId);
            return {
              ...i,
              descricao: ci?.descricao || `Item #${i.contratoItemId}`,
              eapCodigo: (ci as any)?.eapCodigo || "",
              origemPath: (ci as any)?.origemPath || null,
              unidade: ci?.unidade || null,
              quantidade: ci?.quantidade || "0",
              valorUnitario: ci?.valorUnitario || "0",
              valorTotalItem: ci?.valorTotal || "0",
            };
          }),
      }));

      // Rev. 4801 — info de pagamento vinda do Financeiro (live, das baixas ativas):
      // quando o título da medição é quitado, a medição exibe Paga + dia/forma/conta.
      if (medicoes.length > 0) {
        try {
          const entries = await db.select().from(financialEntries).where(and(
            eq(financialEntries.companyId, contrato.companyId),
            eq(financialEntries.origemModulo, "terceiro_medicao"),
            inArray(financialEntries.origemId, medicoes.map((m: any) => m.id)),
            sql`${financialEntries.status} <> 'cancelado'`,
          ));
          const entryIds = entries.map(e => e.id);
          const baixas = entryIds.length > 0
            ? await db.select().from(financialEntryBaixas).where(and(
                inArray(financialEntryBaixas.entryId, entryIds),
                sql`${financialEntryBaixas.estornadaEm} IS NULL`,
              ))
            : [];
          const contaIds = [...new Set(baixas.map(b => b.contaBancariaId).filter(Boolean))] as number[];
          const contas = contaIds.length > 0
            ? await db.select().from(companyBankAccounts).where(inArray(companyBankAccounts.id, contaIds))
            : [];
          const contaNome = (cid: number | null) => {
            const c = contas.find(x => x.id === cid);
            return c ? (c.apelido || `${c.banco} ${c.agencia}/${c.conta}`) : null;
          };
          medicoes = medicoes.map((m: any) => {
            const entry = entries.find(e => e.origemId === m.id);
            if (!entry) return m;
            const bs = baixas.filter(b => b.entryId === entry.id).sort((a, b) => String(a.data).localeCompare(String(b.data)));
            const totalBaixado = bs.reduce((s, b) => s + n(b.valor), 0);
            const pago = ["pago", "recebido"].includes(String(entry.status)) || (totalBaixado >= n(entry.valorPrevisto) - 0.005 && bs.length > 0);
            const ult = bs[bs.length - 1];
            return {
              ...m,
              pagamento: {
                pago,
                parcial: !pago && totalBaixado > 0,
                valorPago: totalBaixado,
                valorTitulo: n(entry.valorPrevisto),
                dataPagamento: ult?.data || null,
                formaPagamento: ult?.formaPagamento || entry.formaPagamento || null,
                conta: contaNome(ult?.contaBancariaId ?? entry.contaBancariaId ?? null),
                // Rev. 4850 — comprovante da baixa visível na medição (gestor
                // apresenta ao fornecedor sem depender do Financeiro).
                baixas: bs.map(b => ({ data: b.data, valor: n(b.valor), formaPagamento: b.formaPagamento, conta: contaNome(b.contaBancariaId), comprovanteUrl: (b as any).comprovanteUrl || null })),
              },
            };
          });
        } catch (e) { console.warn("[getContrato] pagamento das medições:", e); }
      }

      const valorMedidoAcumulado = itensRaw.reduce((s, i) => s + n(i.valorMedidoAcumulado), 0);
      const percentualMedidoGlobal = n(contrato.valorTotal) > 0 ? (valorMedidoAcumulado / n(contrato.valorTotal)) * 100 : 0;
      const saldoAMedir = n(contrato.valorTotal) - valorMedidoAcumulado;
      const saldoALiberar = valorMedidoAcumulado - n(contrato.valorPago);

      // Rev. 2830 — FD de material atrelado ao contrato (read-only, abate o valor).
      const fd = await _fdMaterialDoContrato(db, contrato);
      const valorTotalContrato = n(contrato.valorTotal);
      // Bruto de MDO = valor do contrato − material que virou FD (quando natureza inclui material).
      const naturezaIncluiMaterial = contrato.naturezaContrato === "material" || contrato.naturezaContrato === "mao_de_obra_material";
      const valorLiquidoMdo = naturezaIncluiMaterial ? Math.max(valorTotalContrato - fd.total, 0) : valorTotalContrato;

      let assinaturaStatus: string | null = null;
      try {
        // Rev. 3064 — exclui envelopes soft-deletados (excluido_em) e torna o estado "concluido"
        // ADESIVO: uma vez que QUALQUER envelope não-excluído do contrato esteja "concluido", o
        // contrato reporta "concluido" mesmo que depois surja um rascunho/cancelado mais recente
        // (ex.: o dono clica "Enviar p/ FcSign" de novo, criando um novo rascunho). Sem isso, o
        // gate de Medições/edição re-fechava um contrato já 100% assinado.
        const envelopes = await db.select({ status: integrasignEnvelopes.status })
          .from(integrasignEnvelopes)
          .where(and(
            eq(integrasignEnvelopes.contratoTerceiroId, input.id),
            eq(integrasignEnvelopes.companyId, contrato.companyId),
            isNull(integrasignEnvelopes.excluidoEm),
          ))
          .orderBy(desc(integrasignEnvelopes.criadoEm));
        assinaturaStatus = envelopes.some(e => e.status === "concluido")
          ? "concluido"
          : (envelopes[0]?.status ?? null);
      } catch {}

      let portalLogin: { cnpj: string; ativo: boolean; primeiroAcesso: boolean; ultimoLogin: string | null } | null = null;
      try {
        const [cred] = await db.select({
          cnpj: portalCredentials.cnpj,
          ativo: portalCredentials.ativo,
          primeiroAcesso: portalCredentials.primeiroAcesso,
          ultimoLogin: portalCredentials.ultimoLogin,
        }).from(portalCredentials)
          .where(and(
            eq(portalCredentials.empresaTerceiraId, contrato.empresaTerceiraId),
            eq(portalCredentials.companyId, contrato.companyId),
            eq(portalCredentials.tipo, "terceiro"),
          ))
          .limit(1);
        if (cred) {
          portalLogin = { cnpj: cred.cnpj, ativo: cred.ativo === 1, primeiroAcesso: cred.primeiroAcesso === 1, ultimoLogin: cred.ultimoLogin };
        }
      } catch {}

      return {
        ...contrato,
        empresa: empresa || null,
        companyData: companyData || null,
        obraResponsavel,
        itens,
        itensHierarchy,
        medicoes,
        documentos,
        valorMedidoAcumulado,
        percentualMedidoGlobal,
        saldoAMedir,
        saldoALiberar,
        fdMaterialTotal: fd.total,
        fdMaterialRegistros: fd.registros,
        // Rev. 4798 — débito de FD ainda não descontado em medições.
        // Rev. 4801 — pendência agora inclui débitos AVULSOS (EPI/insumo do almox);
        // fonte única: _fdPendenteDoContrato.
        ...await (async () => {
          try {
            const { pendente, abatidoTotal } = await _fdPendenteDoContrato(db, contrato);
            return { fdPendenteTotal: pendente, fdAbatidoTotal: abatidoTotal };
          } catch { return { fdPendenteTotal: 0, fdAbatidoTotal: 0 }; }
        })(),
        // Rev. 4801 — retenção técnica já liberada? (título origem 'terceiro_retencao')
        retencaoLiberacao: await (async () => {
          try {
            const [t] = await db.select({ id: financialEntries.id, valor: financialEntries.valorPrevisto, status: financialEntries.status }).from(financialEntries)
              .where(and(
                eq(financialEntries.companyId, contrato.companyId),
                eq(financialEntries.origemModulo, "terceiro_retencao"),
                eq(financialEntries.origemId, contrato.id),
                sql`${financialEntries.status} <> 'cancelado'`,
              )).limit(1);
            return t ? { liberada: true, valor: n(t.valor), status: t.status } : { liberada: false };
          } catch { return { liberada: false }; }
        })(),
        naturezaIncluiMaterial,
        valorLiquidoMdo,
        docsComPendencia: documentos.filter(d => d.status === "pendente" && d.bloqueiaPagemento).length,
        assinaturaStatus,
        portalLogin,
        cronogramaRevisaoInfo,
      };
      } catch (err: any) { console.error("[getContrato] ERRO:", err?.message || err); throw err; }
    }),

  // Retorna o próximo número de contrato automático para a empresa/ano
  proximoNumeroContrato: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ano = new Date().getFullYear();
      const rows = await db.select({ numeroSequencia: terceiroContratos.numeroSequencia })
        .from(terceiroContratos)
        .where(eq(terceiroContratos.companyId, input.companyId));
      // Encontra o maior sequencial do ano atual
      const maxSeq = rows
        .map(r => r.numeroSequencia ?? 0)
        .reduce((m, v) => Math.max(m, v), 0);
      const proximo = maxSeq + 1;
      const seq = String(proximo).padStart(3, "0");
      return { numero: `CT-${ano}-${seq}`, sequencia: proximo };
    }),

  criarContrato: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      empresaTerceiraId: z.number(),
      obraId: z.number().optional(),
      obraNome: z.string().optional(),
      planejamentoProjetoId: z.number().optional(),
      orcamentoId: z.number().optional(),
      numeroContrato: z.string().optional(),
      descricao: z.string(),
      tipoContrato: z.string().default("empreitada_global"),
      naturezaContrato: z.enum(["mao_de_obra", "material", "mao_de_obra_material"]).default("mao_de_obra"),
      valorOrcamento: z.number().default(0),
      valorTotal: z.number().default(0),
      dataInicio: z.string().optional(),
      dataTermino: z.string().optional(),
      observacoes: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Rev. 4832 — tenancy: valida acesso do chamador à empresa antes de criar.
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const ano = new Date().getFullYear();

      // Gera número automático se não informado
      let numeroContrato = input.numeroContrato?.trim() || null;
      let numeroSequencia: number | null = null;
      if (!numeroContrato) {
        const rows = await db.select({ numeroSequencia: terceiroContratos.numeroSequencia })
          .from(terceiroContratos)
          .where(eq(terceiroContratos.companyId, input.companyId));
        const maxSeq = rows.map(r => r.numeroSequencia ?? 0).reduce((m, v) => Math.max(m, v), 0);
        numeroSequencia = maxSeq + 1;
        numeroContrato = `CT-${ano}-${String(numeroSequencia).padStart(3, "0")}`;
      }

      // Rev. 4832 — Herança da condição de pagamento padrão de terceiros da OBRA:
      // contrato novo nasce com dia de medição/pagamento/prazo de aprovação da obra
      // (quando definidos), podendo ser sobrescrito depois em "Critérios do Contrato".
      const herdado = await _herdarCondicaoPagamentoDaObra(db, input.obraId, input.companyId);

      const [c] = await db.insert(terceiroContratos).values({
        ...herdado,
        companyId: input.companyId,
        empresaTerceiraId: input.empresaTerceiraId,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome ?? null,
        planejamentoProjetoId: input.planejamentoProjetoId ?? null,
        orcamentoId: input.orcamentoId ?? null,
        numeroContrato,
        numeroSequencia,
        descricao: input.descricao,
        tipoContrato: input.tipoContrato,
        naturezaContrato: input.naturezaContrato,
        valorOrcamento: String(input.valorOrcamento),
        valorTotal: String(input.valorTotal),
        dataInicio: input.dataInicio ?? null,
        dataTermino: input.dataTermino ?? null,
        observacoes: input.observacoes ?? null,
        criadoPor: input.criadoPor ?? null,
      } as any).returning();
      return c;
    }),

  atualizarContrato: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      descricao: z.string().optional(),
      numeroContrato: z.string().optional(),
      naturezaContrato: z.enum(["mao_de_obra", "material", "mao_de_obra_material"]).optional(),
      valorOrcamento: z.number().optional(),
      valorTotal: z.number().optional(),
      dataInicio: z.string().optional(),
      dataTermino: z.string().optional(),
      status: z.string().optional(),
      observacoes: z.string().optional(),
      diaMedicao: z.number().min(1).max(31).optional(),
      diaPagamento: z.number().min(1).max(31).optional(),
      prazoAprovacaoDias: z.number().min(1).max(60).optional(),
      pagamentoConformeRecebimento: z.number().min(0).max(1).nullable().optional(),
      documentacaoNecessaria: z.string().max(2000).optional(),
      fluxogramaEtapas: z.string().max(5000).optional(),
      prazoEmissaoNf: z.number().min(1).max(60).optional(),
      prazoLiberacaoOp: z.number().min(1).max(60).optional(),
      textoContrato: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { id, companyId, ...rest } = input;
      // Rev. 2830/3040 — guarda de tenancy contra IDOR: carrega o contrato real e
      // valida o companyId do CHAMADOR contra a linha (não confia no companyId do client).
      const [alvo] = await db.select({ companyId: terceiroContratos.companyId })
        .from(terceiroContratos).where(eq(terceiroContratos.id, id));
      if (!alvo) throw new Error("Contrato não encontrado");
      await _assertCompanyAccess(ctx.user, (alvo as any).companyId);
      const upd: any = { atualizadoEm: new Date().toISOString() };
      if (rest.descricao !== undefined) upd.descricao = rest.descricao;
      if (rest.numeroContrato !== undefined) upd.numeroContrato = rest.numeroContrato;
      if (rest.naturezaContrato !== undefined) upd.naturezaContrato = rest.naturezaContrato;
      if (rest.valorOrcamento !== undefined) upd.valorOrcamento = String(rest.valorOrcamento);
      if (rest.valorTotal !== undefined) upd.valorTotal = String(rest.valorTotal);
      if (rest.dataInicio !== undefined) upd.dataInicio = rest.dataInicio;
      if (rest.dataTermino !== undefined) upd.dataTermino = rest.dataTermino;
      if (rest.status !== undefined) upd.status = rest.status;
      if (rest.observacoes !== undefined) upd.observacoes = rest.observacoes;
      if (rest.diaMedicao !== undefined) upd.diaMedicao = rest.diaMedicao;
      if (rest.diaPagamento !== undefined) upd.diaPagamento = rest.diaPagamento;
      if (rest.prazoAprovacaoDias !== undefined) upd.prazoAprovacaoDias = rest.prazoAprovacaoDias;
      if (rest.pagamentoConformeRecebimento !== undefined) upd.pagamentoConformeRecebimento = rest.pagamentoConformeRecebimento;
      if (rest.documentacaoNecessaria !== undefined) upd.documentacaoNecessaria = rest.documentacaoNecessaria;
      if (rest.fluxogramaEtapas !== undefined) upd.fluxogramaEtapas = rest.fluxogramaEtapas;
      if (rest.prazoEmissaoNf !== undefined) upd.prazoEmissaoNf = rest.prazoEmissaoNf;
      if (rest.prazoLiberacaoOp !== undefined) upd.prazoLiberacaoOp = rest.prazoLiberacaoOp;
      if (rest.textoContrato !== undefined) upd.textoContrato = rest.textoContrato;
      const [c] = await db.update(terceiroContratos).set(upd).where(and(eq(terceiroContratos.id, id), eq(terceiroContratos.companyId, companyId))).returning();
      if (!c) throw new Error("Contrato não encontrado");
      return c;
    }),

  // Rev. 2909 — EXCLUSÃO DEFINITIVA (hard delete) agora exige senha do admin master
  // + motivo. Só admin_master pode. Registra auditoria ANTES de apagar (preserva o
  // rastro mesmo com a remoção física das linhas).
  excluirContrato: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      password: z.string().optional(),
      motivo: z.string().min(5, "Informe o motivo (mín. 5 caracteres)."),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertMasterComSenha(ctx.user, input.password);
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(
        and(eq(terceiroContratos.id, input.id), eq(terceiroContratos.companyId, input.companyId))
      );
      if (!contrato) throw new Error("Contrato não encontrado");
      await createAuditLog({
        userId: ctx.user.id,
        userName: (ctx.user as any).name || null,
        companyId: input.companyId,
        action: "excluir",
        module: "terceiros",
        entityType: "contrato",
        entityId: input.id,
        details: `Exclusão definitiva do contrato "${(contrato as any).numeroContrato || input.id}" — motivo: ${input.motivo.trim()}`,
      });
      const medicoes = await db.select({ id: terceiroMedicoes.id }).from(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, input.id));
      for (const m of medicoes) {
        await db.delete(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, m.id));
      }
      await db.delete(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, input.id));
      await db.delete(terceiroDocumentos).where(eq(terceiroDocumentos.contratoId, input.id));
      await db.delete(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, input.id));
      await db.delete(terceiroContratos).where(eq(terceiroContratos.id, input.id));
      return { ok: true };
    }),

  // Rev. 2909 — CANCELAMENTO em cascata do contrato (soft, preserva histórico). Só
  // admin_master + senha + motivo. Cancela contrato + medições não pagas + OCs
  // vinculadas + financeiros não pagos das OCs. Pagos ficam intactos.
  cancelarContratoMaster: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      password: z.string().optional(),
      motivo: z.string().min(5, "Informe o motivo (mín. 5 caracteres)."),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertMasterComSenha(ctx.user, input.password);
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(
        and(eq(terceiroContratos.id, input.id), eq(terceiroContratos.companyId, input.companyId))
      );
      if (!contrato) throw new Error("Contrato não encontrado");
      if ((contrato as any).status === "cancelado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este contrato já está cancelado." });
      }
      const res = await cancelarContratoCascade(db, {
        contratoId: input.id,
        companyId: input.companyId,
        motivo: input.motivo.trim(),
        usuarioNome: (ctx.user as any).name || "Admin Master",
        usuarioId: ctx.user.id,
      });
      await createAuditLog({
        userId: ctx.user.id,
        userName: (ctx.user as any).name || null,
        companyId: input.companyId,
        action: "cancelar",
        module: "terceiros",
        entityType: "contrato",
        entityId: input.id,
        details: `Cancelamento em cascata do contrato "${(contrato as any).numeroContrato || input.id}" — motivo: ${input.motivo.trim()} — medições canceladas: ${res.medicoesCanceladas}, OCs canceladas: ${res.ocsCanceladas}, financeiros cancelados: ${res.financeirosCancelados}`,
      });
      return { ok: true, ...res };
    }),

  excluirContratosLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      let deleted = 0;
      for (const cid of input.ids) {
        const [contrato] = await db.select().from(terceiroContratos).where(
          and(eq(terceiroContratos.id, cid), eq(terceiroContratos.companyId, input.companyId))
        );
        if (!contrato) continue;
        const medicoes = await db.select({ id: terceiroMedicoes.id }).from(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, cid));
        for (const m of medicoes) {
          await db.delete(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, m.id));
        }
        await db.delete(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, cid));
        await db.delete(terceiroDocumentos).where(eq(terceiroDocumentos.contratoId, cid));
        await db.delete(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, cid));
        await db.delete(terceiroContratoRevisoes).where(eq(terceiroContratoRevisoes.contratoId, cid));
        await db.update(comprasCotacoes)
          .set({ status: "aprovada", contratoTerceiroId: null, atualizadoEm: new Date().toISOString() } as any)
          .where(sql`"contrato_terceiro_id" = ${cid} AND "company_id" = ${input.companyId}`);
        await db.delete(terceiroContratos).where(eq(terceiroContratos.id, cid));
        deleted++;
      }
      return { deleted };
    }),

  recalcularDatasCronograma: protectedProcedure
    .input(z.object({ contratoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(
        and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId))
      );
      if (!contrato) throw new Error("Contrato não encontrado");
      if (!contrato.obraId) throw new Error("Contrato não possui obra vinculada");

      const [proj] = await db.select({ id: planejamentoProjetos.id })
        .from(planejamentoProjetos)
        .where(and(eq(planejamentoProjetos.companyId, input.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
        .orderBy(desc(planejamentoProjetos.id))
        .limit(1);
      if (!proj) throw new Error("Nenhum projeto de planejamento encontrado para esta obra");

      const [rev] = await db.select({ id: planejamentoRevisoes.id })
        .from(planejamentoRevisoes)
        .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
        .orderBy(desc(planejamentoRevisoes.numero))
        .limit(1);
      if (!rev) throw new Error("Nenhuma revisão aprovada encontrada no cronograma");

      const contratoItens = await db.select({ eapCodigo: terceiroContratoItens.eapCodigo })
        .from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId));
      const eapCodes = [...new Set(contratoItens.map(it => (it as any).eapCodigo).filter(Boolean))] as string[];

      let dateRows: any;
      if (eapCodes.length > 0) {
        dateRows = await db.execute(sql`
          SELECT MIN(data_inicio) as min_inicio, MAX(data_fim) as max_fim
          FROM planejamento_atividades
          WHERE revisao_id = ${rev.id} AND projeto_id = ${proj.id}
            AND eap_codigo IN (${sql.join(eapCodes.map(c => sql`${c}`), sql`, `)})
            AND data_inicio IS NOT NULL AND disabled IS NOT TRUE
        `);
      }
      const row = (dateRows as any)?.rows?.[0];
      if (!row?.min_inicio) {
        dateRows = await db.execute(sql`
          SELECT MIN(data_inicio) as min_inicio, MAX(data_fim) as max_fim
          FROM planejamento_atividades
          WHERE revisao_id = ${rev.id} AND projeto_id = ${proj.id}
            AND data_inicio IS NOT NULL AND disabled IS NOT TRUE
        `);
      }
      const fallbackRow = (dateRows as any)?.rows?.[0];
      const finalRow = row?.min_inicio ? row : fallbackRow;
      if (!finalRow?.min_inicio) throw new Error("Nenhuma atividade com data encontrada no cronograma");

      const dataInicio = String(finalRow.min_inicio);
      const dataTermino = finalRow.max_fim ? String(finalRow.max_fim) : null;

      await db.update(terceiroContratos).set({
        dataInicio,
        dataTermino,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(terceiroContratos.id, input.contratoId));

      return { dataInicio, dataTermino, usouEap: eapCodes.length > 0 && !!row?.min_inicio };
    }),

  // ── ITENS DO CONTRATO ──────────────────────────────────────

  listarItens: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      // Rev. 3108 — guarda de tenant (code review): o endpoint só recebia contratoId.
      // Resolve a empresa do contrato e exige acesso do chamador (anti-IDOR cross-tenant).
      const [ctr] = await db.select({ companyId: terceiroContratos.companyId })
        .from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!ctr) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
      await _assertCompanyAccess(ctx.user, (ctr as any).companyId);

      const items = await db.select().from(terceiroContratoItens)
        .where(and(
          eq(terceiroContratoItens.contratoId, input.contratoId),
          eq(terceiroContratoItens.companyId, (ctr as any).companyId),
        ))
        .orderBy(asc(terceiroContratoItens.ordem));

      const eapCodes = [...new Set(items.map(it => (it as any).eapCodigo).filter(Boolean))] as string[];
      if (eapCodes.length === 0) return { items, hierarchy: [] };

      const [contrato] = await db.select({ obraId: terceiroContratos.obraId, companyId: terceiroContratos.companyId })
        .from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato?.obraId) return { items, hierarchy: [] };

      try {
        const [proj] = await db.select({ id: planejamentoProjetos.id })
          .from(planejamentoProjetos)
          .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
          .orderBy(desc(planejamentoProjetos.id))
          .limit(1);
        if (!proj) return { items, hierarchy: [] };

        const [rev] = await db.select({ id: planejamentoRevisoes.id })
          .from(planejamentoRevisoes)
          .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
          .orderBy(desc(planejamentoRevisoes.numero))
          .limit(1);
        if (!rev) return { items, hierarchy: [] };

        const allAtividades = await db.select({
          id: planejamentoAtividades.id,
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
          nivel: planejamentoAtividades.nivel,
          isGrupo: planejamentoAtividades.isGrupo,
          dataInicio: planejamentoAtividades.dataInicio,
          dataFim: planejamentoAtividades.dataFim,
          revisaoId: planejamentoAtividades.revisaoId,
        }).from(planejamentoAtividades)
          .where(and(
            eq(planejamentoAtividades.projetoId, proj.id),
            sql`${planejamentoAtividades.disabled} IS NOT TRUE`,
          ))
          .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.eapCodigo));

        const atividadeMap = new Map<string, { nome: string; nivel: number; isGrupo: boolean | null; dataInicio: string | null; dataFim: string | null }>();
        for (const a of allAtividades) {
          if (!a.eapCodigo) continue;
          const existing = atividadeMap.get(a.eapCodigo);
          if (!existing || a.revisaoId === rev.id) {
            atividadeMap.set(a.eapCodigo, { nome: a.nome, nivel: a.nivel ?? 0, isGrupo: a.isGrupo, dataInicio: a.dataInicio, dataFim: a.dataFim });
          }
        }

        const parentSet = new Set<string>();
        for (const eap of eapCodes) {
          const parts = eap.split(".");
          for (let i = 1; i < parts.length; i++) {
            parentSet.add(parts.slice(0, i).join("."));
          }
        }

        try {
          let orcId: number | null = (contrato as any).orcamentoId ?? null;
          if (!orcId) {
            const [orc] = await db.select({ id: orcamentos.id }).from(orcamentos)
              .where(and(eq(orcamentos.companyId, contrato.companyId), eq(orcamentos.obraId, contrato.obraId)))
              .orderBy(desc(orcamentos.id)).limit(1);
            if (orc) orcId = orc.id;
          }
          if (orcId) {
            const orcItens = await db.select({
              eapCodigo: orcamentoItens.eapCodigo,
              descricao: orcamentoItens.descricao,
              nivel: orcamentoItens.nivel,
            }).from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, orcId));
            for (const oi of orcItens) {
              if (oi.eapCodigo && oi.descricao) {
                atividadeMap.set(oi.eapCodigo, {
                  nome: oi.descricao,
                  nivel: oi.nivel ?? oi.eapCodigo.split(".").length,
                  isGrupo: true,
                  dataInicio: atividadeMap.get(oi.eapCodigo)?.dataInicio ?? null,
                  dataFim: atividadeMap.get(oi.eapCodigo)?.dataFim ?? null,
                });
              }
            }
          }
        } catch {}

        const hierarchy: any[] = [];
        for (const parentEap of parentSet) {
          const atv = atividadeMap.get(parentEap);
          const nivel = parentEap.split(".").length;
          hierarchy.push({
            _type: "grupo",
            eapCodigo: parentEap,
            nome: atv?.nome ?? `Nível ${parentEap}`,
            nivel: atv?.nivel ?? nivel,
            dataInicio: atv?.dataInicio ?? null,
            dataFim: atv?.dataFim ?? null,
          });
        }
        hierarchy.sort((a, b) => a.eapCodigo.localeCompare(b.eapCodigo, undefined, { numeric: true }));

        const enrichedItems = items.map(it => {
          const eap = (it as any).eapCodigo;
          const atv = eap ? atividadeMap.get(eap) : null;
          let origemPath: string | null = null;
          if (eap) {
            const parts = eap.split(".");
            const pathParts: string[] = [];
            for (let i = 1; i <= parts.length; i++) {
              const parentEap = parts.slice(0, i).join(".");
              const p = atividadeMap.get(parentEap);
              if (p) pathParts.push(p.nome);
            }
            if (pathParts.length > 1) origemPath = pathParts.slice(0, -1).join(" > ");
            else if (pathParts.length === 1 && atv) origemPath = pathParts[0];
          }
          return {
            ...it,
            atividadeNome: atv?.nome ?? null,
            atividadeDataInicio: atv?.dataInicio ?? null,
            atividadeDataFim: atv?.dataFim ?? null,
            atividadeNivel: atv?.nivel ?? null,
            origemPath,
          };
        });

        return { items: enrichedItems, hierarchy };
      } catch {
        return { items, hierarchy: [] };
      }
    }),

  adicionarItem: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      planejamentoAtividadeId: z.number().optional(),
      eapCodigo: z.string().optional(),
      orcamentoItemId: z.number().optional(),
      descricao: z.string(),
      unidade: z.string().optional(),
      quantidade: z.number().default(1),
      valorUnitario: z.number().default(0),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const valorTotal = input.quantidade * input.valorUnitario;
      const [item] = await db.insert(terceiroContratoItens).values({
        contratoId: input.contratoId,
        companyId: input.companyId,
        planejamentoAtividadeId: input.planejamentoAtividadeId ?? null,
        eapCodigo: input.eapCodigo ?? null,
        orcamentoItemId: input.orcamentoItemId ?? null,
        descricao: input.descricao,
        unidade: input.unidade ?? null,
        quantidade: String(input.quantidade),
        valorUnitario: String(input.valorUnitario),
        valorTotal: String(valorTotal),
        ordem: input.ordem ?? 0,
      } as any).returning();

      await _recalcularValorContrato(db, input.contratoId);
      return item;
    }),

  relinkEapItens: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");

      const [cot] = await db.select().from(comprasCotacoes)
        .where(eq((comprasCotacoes as any).contratoTerceiroId, input.contratoId));
      if (!cot) return { updated: 0, msg: "Cotação de origem não encontrada" };

      const cotItens = await db.select().from(comprasCotacoesItens)
        .where(eq(comprasCotacoesItens.cotacaoId, cot.id));

      const scItemIds = cotItens.map(ci => ci.solicitacaoItemId).filter(Boolean) as number[];
      if (scItemIds.length === 0) return { updated: 0, msg: "Itens da cotação não possuem vínculo com SC" };

      const scItems = await db.select({
        id: comprasSolicitacoesItens.id,
        eapCodigo: comprasSolicitacoesItens.eapCodigo,
        orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
        descricao: comprasSolicitacoesItens.descricao,
      }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
      const scMap = new Map(scItems.map(s => [s.id, s]));

      const cotToSc = new Map<number, typeof scItems[0]>();
      for (const ci of cotItens) {
        if (ci.solicitacaoItemId && scMap.has(ci.solicitacaoItemId)) {
          cotToSc.set(ci.id, scMap.get(ci.solicitacaoItemId)!);
        }
      }

      const contratoItens = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId))
        .orderBy(asc(terceiroContratoItens.ordem));

      let eapToAtividadeId: Record<string, number> = {};
      const [contratoRow] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (contratoRow?.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contratoRow.companyId), eq(planejamentoProjetos.obraId, contratoRow.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          if (proj) {
            const [rev] = await db.select({ id: planejamentoRevisoes.id })
              .from(planejamentoRevisoes)
              .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
              .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
            if (rev) {
              const atividades = await db.select({ id: planejamentoAtividades.id, eapCodigo: planejamentoAtividades.eapCodigo })
                .from(planejamentoAtividades)
                .where(and(eq(planejamentoAtividades.revisaoId, rev.id), eq(planejamentoAtividades.projetoId, proj.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`));
              for (const a of atividades) { if (a.eapCodigo) eapToAtividadeId[a.eapCodigo] = a.id; }
            }
          }
        } catch {}
      }

      let updated = 0;
      const cotItensOrdered = [...cotItens].sort((a, b) => a.id - b.id);

      for (let i = 0; i < contratoItens.length && i < cotItensOrdered.length; i++) {
        const ci = contratoItens[i];
        const cotItem = cotItensOrdered[i];
        const scInfo = cotToSc.get(cotItem.id);
        if (scInfo && scInfo.eapCodigo) {
          const upd: any = {};
          if (!(ci as any).eapCodigo) { upd.eapCodigo = scInfo.eapCodigo; upd.orcamentoItemId = scInfo.orcamentoItemId; }
          if (!ci.planejamentoAtividadeId && eapToAtividadeId[scInfo.eapCodigo]) {
            upd.planejamentoAtividadeId = eapToAtividadeId[scInfo.eapCodigo];
          }
          if (Object.keys(upd).length > 0) {
            await db.update(terceiroContratoItens).set(upd).where(eq(terceiroContratoItens.id, ci.id));
            updated++;
          }
        }
      }

      return { updated, msg: `${updated} item(ns) atualizado(s) com EAP e vínculo ao cronograma` };
    }),

  removerItem: protectedProcedure
    .input(z.object({ id: z.number(), contratoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(terceiroContratoItens).where(eq(terceiroContratoItens.id, input.id));
      await _recalcularValorContrato(db, input.contratoId);
      return { ok: true };
    }),

  listarAtividadesProjeto: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select({
        id: planejamentoAtividades.id,
        eapCodigo: planejamentoAtividades.eapCodigo,
        nome: planejamentoAtividades.nome,
        nivel: planejamentoAtividades.nivel,
        isGrupo: planejamentoAtividades.isGrupo,
        unidade: planejamentoAtividades.unidade,
        quantidadePlanejada: planejamentoAtividades.quantidadePlanejada,
      }).from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.projetoId, input.projetoId))
        .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.eapCodigo));
    }),

  importarAtividadesPlanejamento: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      projetoId: z.number(),
      atividadeIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const atividades = await db.select().from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.projetoId, input.projetoId),
          inArray(planejamentoAtividades.id, input.atividadeIds)
        ));
      let ordem = 0;
      for (const at of atividades) {
        await db.insert(terceiroContratoItens).values({
          contratoId: input.contratoId,
          companyId: input.companyId,
          planejamentoAtividadeId: at.id,
          eapCodigo: at.eapCodigo ?? null,
          descricao: at.nome,
          unidade: at.unidade ?? null,
          quantidade: String(at.quantidadePlanejada ?? 1),
          valorUnitario: "0",
          valorTotal: "0",
          ordem: ordem++,
        } as any);
      }
      return { importados: atividades.length };
    }),

  // ── MEDIÇÕES ──────────────────────────────────────────────

  listarMedicoes: protectedProcedure
    .input(z.object({ companyId: z.number(), contratoId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      // Rev. 3126 — guarda de tenancy: valida que o chamador tem acesso à empresa
      // pedida ANTES de consultar (evita IDOR por forja de companyId no input).
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      let rows = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.companyId, input.companyId))
        .orderBy(desc(terceiroMedicoes.numero));
      if (input.contratoId) rows = rows.filter(r => r.contratoId === input.contratoId);
      // Rev. 4778 — flag por medição: existe título no Financeiro? (poka-yoke visível
      // na tela: medição aprovada sem título ganha alerta + botão de reenvio).
      const comTitulo = new Set<number>();
      try {
        const ids = rows.map(r => r.id);
        if (ids.length > 0) {
          const entries = await db.select({ origemId: financialEntries.origemId }).from(financialEntries)
            .where(and(
              eq(financialEntries.companyId, input.companyId),
              eq(financialEntries.origemModulo, "terceiro_medicao"),
              inArray(financialEntries.origemId, ids),
            ));
          entries.forEach(e => { if (e.origemId != null) comTitulo.add(e.origemId); });
        }
      } catch {}
      return rows.map(r => ({ ...r, temTituloFinanceiro: comTitulo.has(r.id) }));
    }),

  // Rev. 4778 — ESTEIRA DO TERCEIRO: visão única do fluxo
  // Compras (cotação de serviço) → Contrato → Assinatura → Medição → Financeiro.
  // Alimenta o stepper da tela de Medições e o acompanhamento por contrato.
  esteiraTerceiros: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // 1) Cotações de SERVIÇO ainda sem contrato gerado (ponta solta no Compras).
      const cotsServico = await db.select({
        id: comprasCotacoes.id,
        status: comprasCotacoes.status,
        contratoTerceiroId: comprasCotacoes.contratoTerceiroId,
      }).from(comprasCotacoes)
        .where(and(
          eq(comprasCotacoes.companyId, input.companyId),
          eq(comprasCotacoes.tipo, "servico"),
          notInArray(comprasCotacoes.status, ["cancelada", "rejeitada"]),
        ));
      const cotacoesSemContrato = cotsServico.filter(c => !c.contratoTerceiroId).length;

      // 2) Contratos não-cancelados + status de assinatura (regra ADESIVA — envelope concluído).
      const contratos = await db.select().from(terceiroContratos)
        .where(and(
          eq(terceiroContratos.companyId, input.companyId),
          notInArray(terceiroContratos.status, ["cancelado", "cancelada", "rascunho"]),
        ));
      const contratoIds = contratos.map(c => c.id);
      const assinadosSet = new Set<number>();
      if (contratoIds.length > 0) {
        try {
          const envs = await db.select({
            contratoTerceiroId: integrasignEnvelopes.contratoTerceiroId,
            status: integrasignEnvelopes.status,
          }).from(integrasignEnvelopes)
            .where(and(
              eq(integrasignEnvelopes.companyId, input.companyId),
              inArray(integrasignEnvelopes.contratoTerceiroId, contratoIds),
              isNull(integrasignEnvelopes.excluidoEm),
            ));
          envs.forEach(e => { if (e.status === "concluido" && e.contratoTerceiroId != null) assinadosSet.add(e.contratoTerceiroId); });
        } catch {}
      }

      // 3) Medições + títulos no Financeiro.
      const meds = contratoIds.length > 0
        ? await db.select().from(terceiroMedicoes)
            .where(and(eq(terceiroMedicoes.companyId, input.companyId), inArray(terceiroMedicoes.contratoId, contratoIds)))
        : [];
      const medIds = meds.map(m => m.id);
      const comTitulo = new Set<number>();
      const pagoSet = new Set<number>();
      if (medIds.length > 0) {
        try {
          const entries = await db.select({ origemId: financialEntries.origemId, status: financialEntries.status }).from(financialEntries)
            .where(and(
              eq(financialEntries.companyId, input.companyId),
              eq(financialEntries.origemModulo, "terceiro_medicao"),
              inArray(financialEntries.origemId, medIds),
            ));
          entries.forEach(e => {
            if (e.origemId == null) return;
            comTitulo.add(e.origemId);
            if (e.status === "pago") pagoSet.add(e.origemId);
          });
        } catch {}
      }

      const aprovadaOuAlem = (s: any) => ["aprovada", "faturada", "paga"].includes(String(s));
      const medicoesAguardando = meds.filter(m => m.status === "aguardando_aprovacao").length;
      const aprovadasSemTitulo = meds.filter(m => aprovadaOuAlem(m.status) && !comTitulo.has(m.id)).length;
      const titulosAbertos = meds.filter(m => comTitulo.has(m.id) && !pagoSet.has(m.id)).length;
      const titulosPagos = meds.filter(m => pagoSet.has(m.id)).length;

      // 4) Acompanhamento por contrato (ciclo completo).
      const empresas = await db.select({ id: empresasTerceiras.id, nomeFantasia: empresasTerceiras.nomeFantasia, razaoSocial: empresasTerceiras.razaoSocial })
        .from(empresasTerceiras).where(eq(empresasTerceiras.companyId, input.companyId));
      const empMap: Record<number, string> = {};
      empresas.forEach(e => { empMap[e.id] = e.nomeFantasia || e.razaoSocial; });
      const obrasRows = await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(eq(obras.companyId, input.companyId));
      const obraMap: Record<number, string> = {};
      obrasRows.forEach(o => { obraMap[o.id] = o.nome; });

      const porContrato = contratos.map(c => {
        const mc = meds.filter(m => m.contratoId === c.id);
        const valorTotal = n(c.valorTotal);
        const valorMedido = mc.filter(m => aprovadaOuAlem(m.status)).reduce((s, m) => s + n(m.valorMedido), 0);
        return {
          id: c.id,
          numero: (c as any).numeroContrato || `#${c.id}`,
          descricao: c.descricao,
          empresaNome: empMap[c.empresaTerceiraId] || "—",
          obraNome: c.obraId ? (obraMap[c.obraId] || null) : null,
          status: c.status,
          assinado: assinadosSet.has(c.id),
          valorTotal,
          valorPago: n(c.valorPago),
          valorMedido,
          pctMedido: valorTotal > 0 ? (valorMedido / valorTotal) * 100 : 0,
          medicoes: mc.length,
          medicoesAguardando: mc.filter(m => m.status === "aguardando_aprovacao").length,
          medicoesSemTitulo: mc.filter(m => aprovadaOuAlem(m.status) && !comTitulo.has(m.id)).length,
          medicoesNoFinanceiro: mc.filter(m => comTitulo.has(m.id)).length,
          medicoesPagas: mc.filter(m => pagoSet.has(m.id)).length,
        };
      }).sort((a, b) => (b.medicoesSemTitulo - a.medicoesSemTitulo) || (b.medicoesAguardando - a.medicoesAguardando) || b.id - a.id);

      return {
        etapas: {
          cotacoesSemContrato,
          contratosAguardandoAssinatura: contratos.filter(c => !assinadosSet.has(c.id)).length,
          contratosAssinados: assinadosSet.size,
          medicoesAguardando,
          aprovadasSemTitulo,
          titulosAbertos,
          titulosPagos,
        },
        contratos: porContrato,
      };
    }),

  gerarMedicao: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      periodo: z.string(),
      dataReferencia: z.string().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");
      // Rev. 4817 — contrato encerrado/cancelado/suspenso não gera medição nova
      // (encerrado devolveu a sobra p/ Realocação; aditivo aprovado reabre).
      if (["encerrado", "cancelado", "suspenso"].includes(String(contrato.status))) {
        throw new Error(`Contrato ${contrato.status} não permite gerar nova medição.${contrato.status === "encerrado" ? " Um aditivo aprovado pelo sócio reabre o contrato." : ""}`);
      }

      if (input.dataInicio && input.dataFim) {
        const todasMedicoes = await db.select({
          id: terceiroMedicoes.id,
          numero: terceiroMedicoes.numero,
          dataInicio: terceiroMedicoes.dataInicio,
          dataFim: terceiroMedicoes.dataFim,
          periodo: terceiroMedicoes.periodo,
          status: terceiroMedicoes.status,
        }).from(terceiroMedicoes)
          .where(eq(terceiroMedicoes.contratoId, input.contratoId));
        const ativas = todasMedicoes.filter(m => m.status !== "rejeitada");
        for (const m of ativas) {
          if (m.dataInicio && m.dataFim) {
            if (input.dataInicio <= m.dataFim && input.dataFim >= m.dataInicio) {
              throw new Error(`As datas ${input.dataInicio} a ${input.dataFim} se sobrepõem à Medição ${String(m.numero).padStart(2, "0")} (${m.dataInicio} a ${m.dataFim}). Não é permitido gerar medições com períodos sobrepostos.`);
            }
          }
          if (m.periodo === input.periodo && !m.dataInicio) {
            throw new Error(`Já existe uma medição para o período ${input.periodo}. Delete ou rejeite a existente antes de gerar uma nova.`);
          }
        }
      }

      const itens = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId))
        .orderBy(asc(terceiroContratoItens.ordem));

      if (!itens.length) throw new Error("Contrato sem itens — adicione atividades antes de gerar medição");

      // Auto-link: vincular itens ao planejamento pelo EAP se ainda não vinculados
      const itensDesvinculados = itens.filter(i => !i.planejamentoAtividadeId);
      console.log(`[gerarMedicao] ${itensDesvinculados.length} itens desvinculados, obraId=${contrato.obraId}`);
      if (itensDesvinculados.length > 0 && contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          console.log(`[gerarMedicao] Projeto planejamento: ${proj ? proj.id : "NÃO ENCONTRADO"}`);
          if (proj) {
            const [rev] = await db.select({ id: planejamentoRevisoes.id })
              .from(planejamentoRevisoes)
              .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
              .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
            console.log(`[gerarMedicao] Revisão aprovada: ${rev ? rev.id : "NÃO ENCONTRADA"}`);
            if (rev) {
              const atividades = await db.select({ id: planejamentoAtividades.id, eapCodigo: planejamentoAtividades.eapCodigo, nome: planejamentoAtividades.nome })
                .from(planejamentoAtividades)
                .where(and(eq(planejamentoAtividades.revisaoId, rev.id), eq(planejamentoAtividades.projetoId, proj.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`));
              const eapMap: Record<string, number> = {};
              const nomeMap: Record<string, number> = {};
              for (const a of atividades) {
                if (a.eapCodigo) eapMap[a.eapCodigo] = a.id;
                if (a.nome) {
                  const nn = a.nome.trim().toLowerCase();
                  if (!(nn in nomeMap)) nomeMap[nn] = a.id;
                }
              }
              console.log(`[gerarMedicao] ${atividades.length} atividades no planejamento, ${Object.keys(eapMap).length} com EAP, ${Object.keys(nomeMap).length} com nome`);
              for (const item of itensDesvinculados) {
                const eap = (item as any).eapCodigo;
                let matched = false;
                if (eap && eapMap[eap]) {
                  await db.update(terceiroContratoItens).set({ planejamentoAtividadeId: eapMap[eap] }).where(eq(terceiroContratoItens.id, item.id));
                  (item as any).planejamentoAtividadeId = eapMap[eap];
                  console.log(`[gerarMedicao] Auto-link EAP: "${item.descricao}" → atividade ${eapMap[eap]} (EAP ${eap})`);
                  matched = true;
                }
                if (!matched && item.descricao) {
                  const descNorm = item.descricao.trim().toLowerCase();
                  if (nomeMap[descNorm]) {
                    await db.update(terceiroContratoItens).set({ planejamentoAtividadeId: nomeMap[descNorm] }).where(eq(terceiroContratoItens.id, item.id));
                    (item as any).planejamentoAtividadeId = nomeMap[descNorm];
                    console.log(`[gerarMedicao] Auto-link NOME: "${item.descricao}" → atividade ${nomeMap[descNorm]}`);
                    matched = true;
                  }
                }
                if (!matched) {
                  console.log(`[gerarMedicao] Sem match para "${item.descricao}" eap="${eap}"`);
                }
              }
            }
          }
        } catch (e) { console.warn("[gerarMedicao] Auto-link falhou:", e); }
      }

      // Contagem de medições anteriores
      const medicoesAnteriores = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.contratoId, input.contratoId));
      // Rev. 4801 — numeração sequencial que REAPROVEITA lacunas: se a Medição 01
      // for excluída, a próxima medição criada recebe o número 01 (menor livre).
      const numerosUsados = new Set(medicoesAnteriores.map(m => Number(m.numero) || 0));
      let numero = 1;
      while (numerosUsados.has(numero)) numero++;
      const valorAcumuladoAnterior = medicoesAnteriores
        .filter(m => m.status === "aprovada" || m.status === "paga")
        .reduce((s, m) => s + n(m.valorMedido), 0);

      // Pre-load avanços map: atividadeId → max percentualAcumulado
      const avancoMap: Record<number, number> = {};
      if (contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          if (proj) {
            const allAvancos = await db.select({
              atividadeId: planejamentoAvancos.atividadeId,
              percentualAcumulado: planejamentoAvancos.percentualAcumulado,
              semana: planejamentoAvancos.semana,
            }).from(planejamentoAvancos)
              .where(eq(planejamentoAvancos.projetoId, proj.id))
              .orderBy(desc(planejamentoAvancos.semana));
            for (const av of allAvancos) {
              if (!(av.atividadeId in avancoMap)) {
                avancoMap[av.atividadeId] = n(av.percentualAcumulado);
              }
            }
            console.log(`[gerarMedicao] avancoMap carregado: ${Object.keys(avancoMap).length} atividades com avanço`);
          }
        } catch (e) { console.warn("[gerarMedicao] Erro ao carregar avancoMap:", e); }
      }

      // Build eapToAtividadeId + hierarchical name matching maps
      const eapToAtividadeId: Record<string, number> = {};
      const cronoEapNomeGen: Record<string, string> = {};
      const nomeToAtividadesGen: Record<string, {id: number; eap: string}[]> = {};
      if (contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          if (proj) {
            const revs = await db.select({ id: planejamentoRevisoes.id })
              .from(planejamentoRevisoes)
              .where(eq(planejamentoRevisoes.projetoId, proj.id))
              .orderBy(desc(planejamentoRevisoes.numero));
            for (const rev of revs) {
              const ativs = await db.select({ id: planejamentoAtividades.id, eapCodigo: planejamentoAtividades.eapCodigo, nome: planejamentoAtividades.nome })
                .from(planejamentoAtividades)
                .where(and(eq(planejamentoAtividades.revisaoId, rev.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`));
              for (const a of ativs) {
                if (a.eapCodigo) {
                  if (!(a.eapCodigo in eapToAtividadeId)) eapToAtividadeId[a.eapCodigo] = a.id;
                  cronoEapNomeGen[a.eapCodigo] = a.nome;
                }
                if (a.nome && a.eapCodigo) {
                  const nomeNorm = a.nome.trim().toLowerCase().replace(/[:\s]+$/g, "").replace(/\s+/g, " ");
                  if (!nomeToAtividadesGen[nomeNorm]) nomeToAtividadesGen[nomeNorm] = [];
                  nomeToAtividadesGen[nomeNorm].push({id: a.id, eap: a.eapCodigo});
                }
              }
              if (Object.keys(eapToAtividadeId).length > 0) break;
            }
            console.log(`[gerarMedicao] eapToAtividadeId: ${Object.keys(eapToAtividadeId).length} EAPs, nomeAtiv: ${Object.keys(nomeToAtividadesGen).length}`);
          }
        } catch (e) { console.warn("[gerarMedicao] Erro ao carregar eapToAtividadeId:", e); }
      }

      // Build orcamento EAP→nome map for parent context matching
      const orcEapNomeGen: Record<string, string> = {};
      let orcIdGen = contrato.orcamentoId;
      if (!orcIdGen) {
        const itemWithOrc = itens.find((ic: any) => ic.orcamentoItemId);
        if ((itemWithOrc as any)?.orcamentoItemId) {
          const [orcItem] = await db.select({ orcamentoId: orcamentoItens.orcamentoId })
            .from(orcamentoItens).where(sql`${orcamentoItens.id} = ${(itemWithOrc as any).orcamentoItemId}`).limit(1);
          if (orcItem) orcIdGen = orcItem.orcamentoId;
        }
      }
      if (orcIdGen) {
        try {
          const orcItens = await db.select({ eapCodigo: orcamentoItens.eapCodigo, descricao: orcamentoItens.descricao })
            .from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, orcIdGen));
          for (const oi of orcItens) orcEapNomeGen[oi.eapCodigo] = oi.descricao;
        } catch {}
      }
      console.log(`[gerarMedicao] orcamentoId=${orcIdGen}, orcEapNomeGen: ${Object.keys(orcEapNomeGen).length} itens`);

      function normNameGen(s: string): string {
        return s.trim().toLowerCase().replace(/[:\s]+$/g, "").replace(/\s+/g, " ");
      }
      function getParentNamesGen(eap: string, map: Record<string, string>): string[] {
        const parts = eap.split(".");
        const names: string[] = [];
        for (let i = 1; i < parts.length; i++) {
          const parentEap = parts.slice(0, i).join(".");
          if (map[parentEap]) names.push(normNameGen(map[parentEap]));
        }
        return names;
      }

      const usedAtividadesGen = new Set<number>();

      // If all contract items have valorTotal=0, distribute contract total evenly
      const allItemsZeroGen = itens.every(ic => n(ic.valorTotal) === 0);
      const contratoTotalGen = n(contrato.valorTotal);
      if (allItemsZeroGen && contratoTotalGen > 0 && itens.length > 0) {
        const valorPorItem = contratoTotalGen / itens.length;
        console.log(`[gerarMedicao] Itens sem valor — distribuindo R$ ${contratoTotalGen.toFixed(2)} entre ${itens.length} itens (R$ ${valorPorItem.toFixed(2)}/item)`);
        for (const ic of itens) {
          (ic as any).valorTotal = String(valorPorItem);
          await db.update(terceiroContratoItens).set({ valorTotal: String(valorPorItem), valorUnitario: String(valorPorItem) } as any)
            .where(eq(terceiroContratoItens.id, ic.id));
        }
      }

      let valorMedidoPeriodo = 0;
      const itensMedicao: any[] = [];
      const itensNaoVinculados: string[] = [];

      console.log(`[gerarMedicao] Contrato ${input.contratoId}: ${itens.length} itens, verificando avanços...`);
      for (const item of itens) {
        let percentualFisico = n(item.percentualMedidoAcumulado);
        let atividadeIdUsada = item.planejamentoAtividadeId;

        // Fallback 1: if item has no linked activity but has eapCodigo, find via EAP map
        if (!atividadeIdUsada && (item as any).eapCodigo) {
          const eap = (item as any).eapCodigo;
          if (eapToAtividadeId[eap]) {
            atividadeIdUsada = eapToAtividadeId[eap];
            await db.update(terceiroContratoItens).set({ planejamentoAtividadeId: atividadeIdUsada }).where(eq(terceiroContratoItens.id, item.id));
            console.log(`[gerarMedicao] Fallback-EAP: "${item.descricao}" EAP=${eap} → atividade ${atividadeIdUsada}`);
          }
        }

        // Fallback 2: match by nome + parent hierarchy context
        if (!atividadeIdUsada && item.descricao) {
          const descNorm = normNameGen(item.descricao);
          const candidates = nomeToAtividadesGen[descNorm];
          if (candidates && candidates.length > 0) {
            const itemEap = (item as any).eapCodigo as string | null;
            if (candidates.length === 1) {
              if (!usedAtividadesGen.has(candidates[0].id)) {
                atividadeIdUsada = candidates[0].id;
                usedAtividadesGen.add(atividadeIdUsada);
              }
            } else if (itemEap) {
              const orcParents = getParentNamesGen(itemEap, orcEapNomeGen);
              let bestMatch: {id: number; score: number} | null = null;
              for (const cand of candidates) {
                if (usedAtividadesGen.has(cand.id)) continue;
                const cronoParents = getParentNamesGen(cand.eap, cronoEapNomeGen);
                let score = 0;
                for (const op of orcParents) {
                  for (const cp of cronoParents) {
                    if (op === cp) score += 2;
                    else if (op.includes(cp) || cp.includes(op)) score += 1;
                  }
                }
                if (!bestMatch || score > bestMatch.score) bestMatch = {id: cand.id, score};
              }
              if (bestMatch && bestMatch.score > 0) {
                atividadeIdUsada = bestMatch.id;
                usedAtividadesGen.add(atividadeIdUsada);
                console.log(`[gerarMedicao] Fallback-HIERARQUIA: "${item.descricao}" eap=${itemEap} → atividade ${atividadeIdUsada} (score=${bestMatch.score})`);
              }
            }
            if (atividadeIdUsada) {
              await db.update(terceiroContratoItens).set({ planejamentoAtividadeId: atividadeIdUsada }).where(eq(terceiroContratoItens.id, item.id));
              console.log(`[gerarMedicao] Fallback-NOME: "${item.descricao}" → atividade ${atividadeIdUsada}`);
            }
          }
        }

        if (atividadeIdUsada) {
          const avPct = avancoMap[atividadeIdUsada];
          if (avPct !== undefined) {
            percentualFisico = avPct;
            console.log(`[gerarMedicao] Item "${item.descricao}" atividadeId=${atividadeIdUsada} → avanco=${avPct}% (via map)`);
          } else {
            // Direct query as fallback
            const [avanco] = await db.select().from(planejamentoAvancos)
              .where(eq(planejamentoAvancos.atividadeId, atividadeIdUsada))
              .orderBy(desc(planejamentoAvancos.semana))
              .limit(1);
            console.log(`[gerarMedicao] Item "${item.descricao}" atividadeId=${atividadeIdUsada} → avanco=${avanco ? n(avanco.percentualAcumulado) : "SEM AVANCO"} (query direta)`);
            if (avanco) percentualFisico = n(avanco.percentualAcumulado);
          }
        } else {
          console.log(`[gerarMedicao] Item "${item.descricao}" SEM vínculo (eap=${(item as any).eapCodigo || "N/A"})`);
          itensNaoVinculados.push(item.descricao || `Item #${item.id}`);
        }

        const percentualAnterior = n(item.percentualMedidoAcumulado);
        // Rev. 4800 — cronograma é CONSULTIVO: a medição nasce ZERADA e o medido
        // oficial vem do LEVANTAMENTO DE CAMPO ou da digitação manual. O avanço
        // da obra fica gravado só como referência (percentualAvancoFisico) para
        // o comparativo "medido × avanço da obra".
        const vlrMatItem = n((item as any).vlrMat ?? "0");
        const vlrMdoItem = n((item as any).vlrMdo ?? "0");

        itensMedicao.push({
          contratoItemId: item.id,
          companyId: input.companyId,
          descricao: item.descricao,
          percentualAvancoFisico: String(percentualFisico),
          percentualAcumuladoAnterior: String(percentualAnterior),
          percentualMedidoPeriodo: "0",
          valorMedidoPeriodo: "0",
          valorAcumulado: String((percentualAnterior / 100) * n(item.valorTotal)),
          valorMatPeriodo: "0",
          valorMdoPeriodo: "0",
          valorMatAcumulado: String((percentualAnterior / 100) * vlrMatItem),
          valorMdoAcumulado: String((percentualAnterior / 100) * vlrMdoItem),
        });
      }

      const valorAcumulado = valorAcumuladoAnterior + valorMedidoPeriodo;
      const percentualGlobal = n(contrato.valorTotal) > 0
        ? (valorAcumulado / n(contrato.valorTotal)) * 100 : 0;

      const [medicao] = await db.insert(terceiroMedicoes).values({
        contratoId: input.contratoId,
        companyId: input.companyId,
        empresaTerceiraId: contrato.empresaTerceiraId,
        obraId: contrato.obraId ?? null,
        numero,
        periodo: input.periodo,
        dataReferencia: input.dataReferencia ?? null,
        dataInicio: input.dataInicio ?? null,
        dataFim: input.dataFim ?? null,
        valorMedido: String(valorMedidoPeriodo),
        valorAcumulado: String(valorAcumulado),
        percentualGlobal: String(percentualGlobal),
        status: "aguardando_aprovacao",
        geradoAutomaticamente: true,
        criadoPor: input.criadoPor ?? null,
      } as any).returning();

      for (const im of itensMedicao) {
        await db.insert(terceiroMedicaoItens).values({ ...im, medicaoId: medicao.id } as any);
      }

      // Gatilho financeiro em tempo real — fire-and-forget
      triggerFinancialSync(input.companyId, input.periodo);
      // Rev. 4799 — puxa o débito de FD do contrato AUTOMATICAMENTE ao gerar a
      // medição (usuário não precisa clicar); capado no valor medido.
      try { await _puxarFdAutomatico(db, contrato, medicao.id, input.criadoPor); }
      catch (e: any) { console.warn("[gerarMedicao] Auto-FD falhou:", e?.message); }

      return { medicao, itens: itensMedicao.length, itensNaoVinculados };
    }),

  // Rev. 3091 (Task #86) — CRIAÇÃO MANUAL da medição de terceiros, SEM cruzamento automático.
  // Cria a medição numerada do período com itens ZERADOS (status "rascunho", geradoAutomaticamente=false).
  // O usuário lança o medido por item manualmente (BRL) na planilha. Reusa numeração sequencial,
  // validação de sobreposição de datas e o "Dia da Medição" (período vem do client). Tenant guard explícito.
  criarMedicaoManual: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      periodo: z.string(),
      dataReferencia: z.string().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      criadoPor: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);

      const [contrato] = await db.select().from(terceiroContratos)
        .where(and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId)));
      if (!contrato) throw new Error("Contrato não encontrado");

      // Validação de sobreposição de datas (mesma regra da geração automática).
      if (input.dataInicio && input.dataFim) {
        const todasMedicoes = await db.select({
          numero: terceiroMedicoes.numero,
          dataInicio: terceiroMedicoes.dataInicio,
          dataFim: terceiroMedicoes.dataFim,
          periodo: terceiroMedicoes.periodo,
          status: terceiroMedicoes.status,
        }).from(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, input.contratoId));
        for (const m of todasMedicoes.filter(m => m.status !== "rejeitada")) {
          if (m.dataInicio && m.dataFim && input.dataInicio <= m.dataFim && input.dataFim >= m.dataInicio) {
            throw new Error(`As datas ${input.dataInicio} a ${input.dataFim} se sobrepõem à Medição ${String(m.numero).padStart(2, "0")} (${m.dataInicio} a ${m.dataFim}). Não é permitido criar medições com períodos sobrepostos.`);
          }
          if (m.periodo === input.periodo && !m.dataInicio) {
            throw new Error(`Já existe uma medição para o período ${input.periodo}. Exclua ou rejeite a existente antes de criar uma nova.`);
          }
        }
      }

      const itens = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId))
        .orderBy(asc(terceiroContratoItens.ordem));
      if (!itens.length) throw new Error("Contrato sem itens — adicione os serviços do contrato antes de criar a medição");

      // Itens sem valor: distribui o total do contrato (igual ao automático) p/ a planilha ter base.
      const allItemsZero = itens.every(ic => n(ic.valorTotal) === 0);
      const contratoTotal = n(contrato.valorTotal);
      if (allItemsZero && contratoTotal > 0 && itens.length > 0) {
        const valorPorItem = contratoTotal / itens.length;
        for (const ic of itens) {
          (ic as any).valorTotal = String(valorPorItem);
          await db.update(terceiroContratoItens).set({ valorTotal: String(valorPorItem), valorUnitario: String(valorPorItem) } as any)
            .where(eq(terceiroContratoItens.id, ic.id));
        }
      }

      const medicoesAnteriores = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.contratoId, input.contratoId));
      // Rev. 4801 — numeração sequencial que REAPROVEITA lacunas: se a Medição 01
      // for excluída, a próxima medição criada recebe o número 01 (menor livre).
      const numerosUsados = new Set(medicoesAnteriores.map(m => Number(m.numero) || 0));
      let numero = 1;
      while (numerosUsados.has(numero)) numero++;
      const valorAcumuladoAnterior = medicoesAnteriores
        .filter(m => m.status === "aprovada" || m.status === "paga")
        .reduce((s, m) => s + n(m.valorMedido), 0);
      const percentualGlobal = contratoTotal > 0 ? (valorAcumuladoAnterior / contratoTotal) * 100 : 0;

      const [medicao] = await db.insert(terceiroMedicoes).values({
        contratoId: input.contratoId,
        companyId: input.companyId,
        empresaTerceiraId: contrato.empresaTerceiraId,
        obraId: contrato.obraId ?? null,
        numero,
        periodo: input.periodo,
        dataReferencia: input.dataReferencia ?? null,
        dataInicio: input.dataInicio ?? null,
        dataFim: input.dataFim ?? null,
        valorMedido: "0",
        valorAcumulado: String(valorAcumuladoAnterior),
        percentualGlobal: String(percentualGlobal),
        status: "rascunho",
        geradoAutomaticamente: false,
        criadoPor: input.criadoPor ?? null,
      } as any).returning();

      for (const item of itens) {
        const percentualAnterior = n(item.percentualMedidoAcumulado);
        await db.insert(terceiroMedicaoItens).values({
          medicaoId: medicao.id,
          contratoItemId: item.id,
          companyId: input.companyId,
          descricao: item.descricao,
          percentualAvancoFisico: String(percentualAnterior),
          percentualAcumuladoAnterior: String(percentualAnterior),
          percentualMedidoPeriodo: "0",
          valorMedidoPeriodo: "0",
          valorAcumulado: String((percentualAnterior / 100) * n(item.valorTotal)),
          valorMatPeriodo: "0",
          valorMdoPeriodo: "0",
          valorMatAcumulado: String((percentualAnterior / 100) * n((item as any).vlrMat ?? "0")),
          valorMdoAcumulado: String((percentualAnterior / 100) * n((item as any).vlrMdo ?? "0")),
        } as any);
      }

      return { medicao, itens: itens.length };
    }),

  getMedicao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.id));
      if (!medicao) return null;
      // Rev. 3126 — guarda de tenancy: o endpoint recebe só {id}; deriva o companyId
      // da própria linha e valida o acesso do chamador (evita IDOR por enumeração de id).
      await _assertCompanyAccess(ctx.user, (medicao as any).companyId);
      const itens = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, medicao.contratoId));
      const [empresa] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, medicao.empresaTerceiraId));
      const docsAtivos = await db.select().from(terceiroDocumentos)
        .where(and(eq(terceiroDocumentos.contratoId, medicao.contratoId), eq(terceiroDocumentos.bloqueiaPagemento, true)));
      const temDocsPendentes = docsAtivos.some(d => d.status === "pendente");
      return { ...medicao, itens, contrato: contrato || null, empresa: empresa || null, temDocsPendentes };
    }),

  aprovarMedicao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), aprovadoPor: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // Rev. 4778 — guarda de tenancy (review): a rota aceitava {id, companyId} sem
      // validar o acesso do chamador à empresa → IDOR de aprovação cross-tenant.
      await _assertCompanyAccess(ctx.user, input.companyId);
      // Rev. 4798 — POKA-YOKE: FD de material pendente BLOQUEIA a aprovação.
      await _assertSemFdPendente(db, input.id, input.companyId);
      // Rev. 4835 — POKA-YOKE: se a medição tem levantamento de campo vinculado
      // ainda NÃO consolidado, a Memória de Cálculo precisa estar ASSINADA
      // (elaborador + responsável) antes de aprovar — a aprovação consolida
      // automaticamente e libera o pagamento.
      await _assertLevantamentoAssinado(db, input.id, input.companyId);
      // Rev. 1987 — BUGFIX A1 · Toda a aprovação agora roda em TRANSAÇÃO ATÔMICA.
      // Bug anterior: update medicao → loop update itens. Se o loop falhasse no
      // meio, a medição ficava "aprovada" mas itens do contrato meio-atualizados
      // → percentuais acumulados inconsistentes (passivo de re-aprovação manual).
      // Agora: tudo dentro de db.transaction → falha em qualquer item → rollback total.
      const medicao = await db.transaction(async (tx: any) => {
        const [existing] = await tx.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
        if (!existing) throw new Error("Medição não encontrada");
        if (existing.status !== "aguardando_aprovacao") throw new Error(`Medição não pode ser aprovada (status: ${existing.status})`);
        // Rev. 4798 — persiste o total de FD abatido também na aprovação simples
        // (antes só o nível sócio gravava fd_total_abatido).
        const fdRowsTx = await tx.select({ valor: terceiroMedicaoFds.valor }).from(terceiroMedicaoFds)
          .where(and(eq(terceiroMedicaoFds.companyId, input.companyId), eq(terceiroMedicaoFds.medicaoId, input.id)));
        const fdTotalTx = fdRowsTx.reduce((s: number, r: any) => s + n(r.valor), 0);
        const [med] = await tx.update(terceiroMedicoes)
          .set({ status: "aprovada", aprovadoPor: input.aprovadoPor, aprovadoEm: new Date().toISOString(), fdTotalAbatido: String(fdTotalTx), atualizadoEm: new Date().toISOString() } as any)
          .where(eq(terceiroMedicoes.id, input.id))
          .returning();

        // Atualiza percentual acumulado nos itens do contrato (dentro do tx → atomicidade)
        const itensMedicao = await tx.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
        for (const im of itensMedicao) {
          await tx.update(terceiroContratoItens)
            .set({
              // Rev. 4800 — consolida o MEDIDO (anterior + período), nunca o
              // avanço do cronograma (percentualAvancoFisico é só consultivo).
              percentualMedidoAcumulado: String(n(im.percentualAcumuladoAnterior) + n(im.percentualMedidoPeriodo)),
              valorMedidoAcumulado: im.valorAcumulado,
            })
            .where(eq(terceiroContratoItens.id, im.contratoItemId));
        }
        return med;
      });

      // Rev. 1987 — BUGFIX A2 · Gatilho financeiro AWAITED + try/catch (não mais silencioso).
      // Bug anterior: triggerFinancialSync era fire-and-forget — erro de sync
      // (ex: bridge indisponível, mês fechado, dados inconsistentes) era engolido
      // silenciosamente e a medição aprovada NUNCA virava lançamento financeiro
      // → contas a pagar não apareciam, conciliação quebrava.
      // Agora: awaited, falhas logadas no console com contexto. A aprovação
      // permanece bem-sucedida mesmo se o sync falhar (medição já está commitada),
      // mas o erro fica VISÍVEL pra operação investigar e re-disparar manualmente.
      // Rev. 4797 — Poka-Yoke: aprovar CONSOLIDA o levantamento vinculado
      // automaticamente (quantitativo congelado enquanto a medição for aprovada).
      await _consolidarLevantamentoDaMedicao(db, medicao, input.companyId, input.aprovadoPor).catch((e: any) =>
        console.error(`[aprovarMedicao] FALHA ao consolidar levantamento:`, e?.message || e));
      // Rev. 4778 — POKA-YOKE: título garantido direto (bypassa o toggle auto_import);
      // sync geral continua como complemento (respeita o toggle, não bloqueia).
      const financeiroOk = await _posAprovacaoFinanceiro(input.companyId, input.id, ctx.user?.id);
      try {
        await triggerFinancialSyncAwaited(input.companyId);
      } catch (syncErr: any) {
        console.error(`[aprovarMedicao] FALHA no sync financeiro pós-aprovação da medição #${input.id} (companyId=${input.companyId}):`, syncErr?.message || syncErr);
      }
      return { ...medicao, financeiroOk };
    }),

  cancelarAprovacao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [existing] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!existing) throw new Error("Medição não encontrada");
      if (existing.status !== "aprovada") throw new Error(`Apenas medições aprovadas podem ter a aprovação cancelada (status: ${existing.status})`);

      // Rev. 4798 (review) — reconcilia o FINANCEIRO ao desaprovar: o título da
      // medição sai junto (senão a reaprovação com valores diferentes deixaria
      // um título velho no Contas a Pagar). Título com BAIXA ATIVA é intocável:
      // exige estornar o pagamento antes de desaprovar.
      {
        const titulos = await db.select({ id: financialEntries.id }).from(financialEntries)
          .where(and(
            eq(financialEntries.companyId, input.companyId),
            eq(financialEntries.origemModulo, "terceiro_medicao"),
            eq(financialEntries.origemId, input.id),
          ));
        for (const t of titulos) {
          const baixas = await db.select({ id: financialEntryBaixas.id }).from(financialEntryBaixas)
            .where(and(eq(financialEntryBaixas.entryId, t.id), sql`${financialEntryBaixas.estornadaEm} IS NULL`)).limit(1);
          if (baixas.length > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Esta medição já tem PAGAMENTO baixado no Contas a Pagar. Estorne a baixa do título antes de cancelar a aprovação." });
          }
        }
        if (titulos.length > 0) {
          await db.delete(financialEntries).where(and(
            eq(financialEntries.companyId, input.companyId),
            eq(financialEntries.origemModulo, "terceiro_medicao"),
            eq(financialEntries.origemId, input.id),
          ));
        }
      }

      const itensMedicao = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));

      const outrasAprovadas = await db.select().from(terceiroMedicoes)
        .where(and(
          eq(terceiroMedicoes.contratoId, existing.contratoId),
          eq(terceiroMedicoes.companyId, input.companyId),
          inArray(terceiroMedicoes.status, ["aprovada", "paga"]),
          sql`${terceiroMedicoes.id} != ${input.id}`
        ));

      const outrosItens: any[] = [];
      for (const om of outrasAprovadas) {
        const its = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, om.id));
        outrosItens.push(...its);
      }

      for (const im of itensMedicao) {
        const somaPercPeriodo = outrosItens
          .filter(o => o.contratoItemId === im.contratoItemId)
          .reduce((s, o) => s + Number(o.percentualMedidoPeriodo || 0), 0);
        const somaValorPeriodo = outrosItens
          .filter(o => o.contratoItemId === im.contratoItemId)
          .reduce((s, o) => s + Number(o.valorMedidoPeriodo || 0), 0);

        await db.update(terceiroContratoItens)
          .set({
            percentualMedidoAcumulado: String(somaPercPeriodo),
            valorMedidoAcumulado: String(somaValorPeriodo),
          })
          .where(and(eq(terceiroContratoItens.id, im.contratoItemId), eq(terceiroContratoItens.companyId, input.companyId)));
      }

      const [medicao] = await db.update(terceiroMedicoes)
        .set({
          status: "aguardando_aprovacao",
          aprovadoPor: null,
          aprovadoEm: null,
          // Rev. 4797 — desaprovar p/ ajuste gera uma REVISÃO da medição
          revisao: sql`COALESCE(revisao, 0) + 1`,
          revisadoEm: new Date().toISOString(),
          revisadoPorNome: (ctx.user as any)?.name || null,
          atualizadoEm: new Date().toISOString(),
        } as any)
        .where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)))
        .returning();

      return medicao;
    }),

  rejeitarMedicao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), motivo: z.string(), rejeitadoPor: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!existing) throw new Error("Medição não encontrada");
      if (existing.status !== "aguardando_aprovacao") throw new Error(`Medição não pode ser rejeitada (status: ${existing.status})`);
      const [medicao] = await db.update(terceiroMedicoes)
        .set({
          status: "rejeitada",
          motivoRejeicao: input.motivo,
          rejeitadoPor: input.rejeitadoPor ?? null,
          rejeitadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        } as any)
        .where(eq(terceiroMedicoes.id, input.id))
        .returning();
      return medicao;
    }),

  // ============================================================================
  // Rev. 3079 — MEDIÇÃO DE TERCEIROS · NÚCLEO FUNCIONAL
  // (1) FD por período da medição (manual) — CRUD em terceiro_medicao_fds.
  // (2) Vínculo do levantamento de campo + alerta de divergência.
  // (3) Aprovação em 3 níveis: mede → gestor da obra → sócio adm (libera financeiro).
  // Tudo aditivo; guarda de tenancy via _assertCompanyAccess. ZERO ALTER/DROP/DELETE.
  // ============================================================================

  // Total de FD (manual) lançado p/ uma medição — abate do valor a pagar.
  listarFdsTerceiro: protectedProcedure
    .input(z.object({ contratoId: z.number(), companyId: z.number(), medicaoId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const conds = [eq(terceiroMedicaoFds.companyId, input.companyId), eq(terceiroMedicaoFds.contratoId, input.contratoId)];
      if (typeof input.medicaoId === "number") conds.push(eq(terceiroMedicaoFds.medicaoId, input.medicaoId));
      const rows = await db.select().from(terceiroMedicaoFds)
        .where(and(...conds))
        .orderBy(desc(terceiroMedicaoFds.dataFd), desc(terceiroMedicaoFds.id));
      const total = rows.reduce((s, r) => s + n(r.valor), 0);
      return { fds: rows, total };
    }),

  // Rev. 4798 — puxa AUTOMATICAMENTE os débitos de FD pendentes do contrato
  // para dentro de uma medição (1 lançamento origem "auto" com o total pendente
  // e a lista de OCs na descrição). Poka-Yoke: o usuário não precisa lembrar.
  puxarFdPendente: protectedProcedure
    .input(z.object({ companyId: z.number(), contratoId: z.number(), medicaoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [contrato] = await db.select().from(terceiroContratos)
        .where(and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId)));
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado para esta empresa." });
      const [med] = await db.select({ id: terceiroMedicoes.id, contratoId: terceiroMedicoes.contratoId, status: terceiroMedicoes.status, valorMedido: terceiroMedicoes.valorMedido })
        .from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!med || med.contratoId !== input.contratoId) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não pertence a este contrato/empresa." });
      if (med.status === "aprovada" || med.status === "paga") throw new TRPCError({ code: "BAD_REQUEST", message: "Medição já aprovada/paga — não é possível alterar os FDs." });
      return await _puxarFdAutomatico(db, contrato, input.medicaoId, (ctx.user as any)?.name);
    }),

  criarFdTerceiro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      medicaoId: z.number().nullable().optional(),
      descricao: z.string().min(1),
      valor: z.string(),
      dataFd: z.string(),
      anexoUrl: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      criadoPor: z.string().nullable().optional(),
      // Rev. 4801 — desconto genérico: fd | epi | ferramental | insumo | outro
      tipo: z.enum(["fd", "epi", "ferramental", "insumo", "outro"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      // Confere que o contrato pertence à empresa (anti-IDOR).
      const [contrato] = await db.select({ id: terceiroContratos.id, companyId: terceiroContratos.companyId })
        .from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato || contrato.companyId !== input.companyId) throw new Error("Contrato não encontrado para esta empresa.");
      if (typeof input.medicaoId === "number") {
        const [med] = await db.select({ id: terceiroMedicoes.id, companyId: terceiroMedicoes.companyId, contratoId: terceiroMedicoes.contratoId, status: terceiroMedicoes.status })
          .from(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.medicaoId));
        if (!med || med.companyId !== input.companyId || med.contratoId !== input.contratoId) throw new Error("Medição não pertence a este contrato/empresa.");
        if (med.status === "aprovada" || med.status === "paga") throw new Error("Medição já aprovada/paga — não é possível alterar os FDs.");
      }
      const [fd] = await db.insert(terceiroMedicaoFds).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        medicaoId: input.medicaoId ?? null,
        descricao: input.descricao.trim(),
        valor: input.valor,
        dataFd: input.dataFd,
        anexoUrl: input.anexoUrl ?? null,
        origem: "manual",
        tipo: input.tipo ?? "fd",
        observacoes: input.observacoes ?? null,
        criadoPor: input.criadoPor ?? null,
      } as any).returning();
      return fd;
    }),

  atualizarFdTerceiro: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      descricao: z.string().optional(),
      valor: z.string().optional(),
      dataFd: z.string().optional(),
      anexoUrl: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [fd] = await db.select().from(terceiroMedicaoFds).where(and(eq(terceiroMedicaoFds.id, input.id), eq(terceiroMedicaoFds.companyId, input.companyId)));
      if (!fd) throw new Error("FD não encontrado.");
      if (typeof fd.medicaoId === "number") {
        const [med] = await db.select({ status: terceiroMedicoes.status }).from(terceiroMedicoes).where(eq(terceiroMedicoes.id, fd.medicaoId));
        if (med && (med.status === "aprovada" || med.status === "paga")) throw new Error("Medição já aprovada/paga — FD travado.");
      }
      const patch: any = { atualizadoEm: new Date().toISOString() };
      if (input.descricao !== undefined) patch.descricao = input.descricao.trim();
      if (input.valor !== undefined) patch.valor = input.valor;
      if (input.dataFd !== undefined) patch.dataFd = input.dataFd;
      if (input.anexoUrl !== undefined) patch.anexoUrl = input.anexoUrl;
      if (input.observacoes !== undefined) patch.observacoes = input.observacoes;
      const [upd] = await db.update(terceiroMedicaoFds).set(patch)
        .where(and(eq(terceiroMedicaoFds.id, input.id), eq(terceiroMedicaoFds.companyId, input.companyId))).returning();
      return upd;
    }),

  excluirFdTerceiro: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      // Rev. 4827 — transação + MESMO advisory lock do _puxarFdAutomatico (478003,
      // por contrato): sem isso, um recálculo concorrente podia re-lançar o FD na
      // janela entre gravar o aviso e apagar a linha.
      await db.transaction(async (tx: any) => {
        const [fd] = await tx.select().from(terceiroMedicaoFds).where(and(eq(terceiroMedicaoFds.id, input.id), eq(terceiroMedicaoFds.companyId, input.companyId)));
        if (!fd) throw new Error("FD não encontrado.");
        if (fd.contratoId) await tx.execute(sql`SELECT pg_advisory_xact_lock(478003, ${fd.contratoId})`);
        if (typeof fd.medicaoId === "number") {
          const [med] = await tx.select({ status: terceiroMedicoes.status, fdExclusaoAlerta: terceiroMedicoes.fdExclusaoAlerta, fdExclusaoDispensa: terceiroMedicoes.fdExclusaoDispensa }).from(terceiroMedicoes)
            .where(and(eq(terceiroMedicoes.id, fd.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
          if (med && (med.status === "aprovada" || med.status === "paga")) throw new Error("Medição já aprovada/paga — FD travado.");
          // Rev. 4827 — excluir um desconto de FD deixa AVISO PERMANENTE na medição
          // ("Existem FDs pendentes"), visível em todos os pontos, inclusive depois
          // de aprovada, e soma o valor à dispensa consciente (libera a aprovação
          // só até esse teto). A exclusão também dispensa o re-lançamento automático.
          const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
          const quem = (ctx.user as any)?.name || (ctx.user as any)?.email || "usuário";
          const linha = `EXISTEM FDs PENDENTES — desconto de R$ ${n(fd.valor).toFixed(2).replace(".", ",")} (${fd.descricao || fd.tipo || "FD"}) excluído da medição por ${quem} em ${quando}. O débito continua pendente no contrato.`;
          const alerta = med?.fdExclusaoAlerta ? `${med.fdExclusaoAlerta}\n${linha}` : linha;
          const dispensa = n(med?.fdExclusaoDispensa) + n(fd.valor);
          await tx.update(terceiroMedicoes).set({ fdExclusaoAlerta: alerta, fdExclusaoDispensa: String(dispensa.toFixed(2)), atualizadoEm: new Date().toISOString() } as any)
            .where(and(eq(terceiroMedicoes.id, fd.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
        }
        await tx.delete(terceiroMedicaoFds).where(and(eq(terceiroMedicaoFds.id, input.id), eq(terceiroMedicaoFds.companyId, input.companyId)));
      });
      return { ok: true };
    }),

  // Vincula o levantamento de campo à medição + calcula o alerta de divergência
  // (levantado × cronograma). Tolerância vem de medicao_config (default 5%).
  vincularLevantamentoMedicao: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      levantamentoCampoId: z.number().nullable().optional(),
      quantidadeLevantada: z.string().nullable().optional(),
      unidadeLevantada: z.string().nullable().optional(),
      quantidadeCronograma: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [med] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!med) throw new Error("Medição não encontrada.");
      if (med.status === "aprovada" || med.status === "paga") throw new Error("Medição já aprovada/paga — levantamento travado.");

      // Anti-IDOR: o levantamento de campo (medicao_campo) informado precisa pertencer
      // à MESMA empresa, ao MESMO contrato e ter origem 'terceiro' (IDs colidem entre tabelas).
      if (typeof input.levantamentoCampoId === "number") {
        const [campo] = await db.select({ id: medicaoCampo.id, companyId: medicaoCampo.companyId, contratoId: medicaoCampo.contratoId, origem: medicaoCampo.origem })
          .from(medicaoCampo).where(eq(medicaoCampo.id, input.levantamentoCampoId));
        if (!campo || campo.companyId !== input.companyId || campo.contratoId !== med.contratoId || campo.origem !== "terceiro") {
          throw new Error("Levantamento de campo inválido para esta medição/contrato.");
        }
      }

      const [cfg] = await db.select({ tol: medicaoConfig.divergenciaToleranciaPct }).from(medicaoConfig).where(eq(medicaoConfig.companyId, input.companyId));
      const tolerancia = cfg ? n(cfg.tol) : 5;

      let percentualDivergencia: string | null = null;
      let alertaDivergencia: string | null = null;
      const qLev = input.quantidadeLevantada != null ? n(input.quantidadeLevantada) : null;
      const qCron = input.quantidadeCronograma != null ? n(input.quantidadeCronograma) : null;
      if (qLev != null && qCron != null && qCron > 0) {
        const div = ((qLev - qCron) / qCron) * 100;
        percentualDivergencia = String(div);
        if (Math.abs(div) > tolerancia) {
          alertaDivergencia = `Divergência de ${div.toFixed(2)}% entre levantado (${qLev}) e cronograma (${qCron}) — acima da tolerância de ${tolerancia}%.`;
        }
      }

      const [upd] = await db.update(terceiroMedicoes).set({
        levantamentoCampoId: input.levantamentoCampoId ?? med.levantamentoCampoId ?? null,
        quantidadeLevantada: input.quantidadeLevantada ?? med.quantidadeLevantada ?? null,
        unidadeLevantada: input.unidadeLevantada ?? med.unidadeLevantada ?? null,
        percentualDivergencia,
        alertaDivergencia,
        atualizadoEm: new Date().toISOString(),
      } as any).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId))).returning();
      // Rev. 4792 — ao vincular, os quantitativos já levantados fluem na hora
      // para a planilha da medição (rascunho).
      if (upd?.levantamentoCampoId) {
        await aplicarLevantamentoNaMedicaoTerceiro(db, upd.levantamentoCampoId).catch((e: any) => console.error("[Terceiros] aplicarLevantamento:", e));
      }
      return upd;
    }),

  // Rev. 4803 — Nível 1: quem FEZ a medição solicita a aprovação do gestor
  // (rascunho/rejeitada → aguardando_aprovacao). Poka-yoke: sem valor medido
  // não há o que aprovar.
  solicitarAprovacaoMedicao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), solicitadoPor: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [existing] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!existing) throw new Error("Medição não encontrada");
      if (existing.status !== "rascunho" && existing.status !== "rejeitada") {
        throw new Error(`Medição não pode ser enviada para aprovação (status: ${existing.status})`);
      }
      if (n(existing.valorMedido) <= 0) {
        throw new Error("A medição está zerada — lance o medido (levantamento ou planilha) antes de solicitar a aprovação.");
      }
      // Rev. 4827 — garante o desconto AUTOMÁTICO de FD antes de entrar no fluxo
      // de aprovação (inclusão é automática; o usuário só pode excluir depois).
      try {
        const [contratoFd] = await db.select().from(terceiroContratos)
          .where(and(eq(terceiroContratos.id, existing.contratoId), eq(terceiroContratos.companyId, input.companyId)));
        if (contratoFd) await _puxarFdAutomatico(db, contratoFd, input.id, input.solicitadoPor ?? null);
      } catch (e: any) { console.warn("[solicitarAprovacao] Auto-FD falhou:", e?.message); }
      const [med] = await db.update(terceiroMedicoes).set({
        status: "aguardando_aprovacao",
        nivelAprovacao: 0,
        gestorAprovadoPor: null,
        gestorAprovadoEm: null,
        motivoRejeicao: null,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(terceiroMedicoes.id, input.id)).returning();
      return med;
    }),

  // Nível 2 — Gestor da obra confirma a medição (não libera financeiro ainda).
  aprovarNivelGestor: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), aprovadoPor: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [existing] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!existing) throw new Error("Medição não encontrada");
      if (existing.status !== "aguardando_aprovacao") throw new Error(`Medição não está aguardando aprovação (status: ${existing.status})`);
      if ((existing.nivelAprovacao ?? 0) >= 1) throw new Error("Medição já aprovada pelo gestor da obra.");
      const [med] = await db.update(terceiroMedicoes).set({
        nivelAprovacao: 1,
        gestorAprovadoPor: input.aprovadoPor,
        gestorAprovadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(terceiroMedicoes.id, input.id)).returning();
      return med;
    }),

  // Nível 3 — Sócio adm aprova (libera financeiro a pagar). Exige nível gestor.
  // Replica a sincronização atômica de itens do contrato de aprovarMedicao e
  // persiste o total de FD do período abatido (fd_total_abatido).
  aprovarNivelSocio: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), aprovadoPor: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      // Rev. 4798 — POKA-YOKE: FD de material pendente BLOQUEIA a aprovação final.
      await _assertSemFdPendente(db, input.id, input.companyId);
      // Rev. 4835 — Memória de Cálculo assinada é pré-requisito (mesma regra do aprovarMedicao).
      await _assertLevantamentoAssinado(db, input.id, input.companyId);
      const fdRows = await db.select({ valor: terceiroMedicaoFds.valor }).from(terceiroMedicaoFds)
        .where(and(eq(terceiroMedicaoFds.companyId, input.companyId), eq(terceiroMedicaoFds.medicaoId, input.id)));
      const fdTotal = fdRows.reduce((s, r) => s + n(r.valor), 0);

      const medicao = await db.transaction(async (tx: any) => {
        const [existing] = await tx.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
        if (!existing) throw new Error("Medição não encontrada");
        if (existing.status !== "aguardando_aprovacao") throw new Error(`Medição não pode ser aprovada (status: ${existing.status})`);
        if ((existing.nivelAprovacao ?? 0) < 1) throw new Error("Aprove primeiro no nível do gestor da obra.");
        const [med] = await tx.update(terceiroMedicoes).set({
          status: "aprovada",
          nivelAprovacao: 2,
          socioAprovadoPor: input.aprovadoPor,
          socioAprovadoEm: new Date().toISOString(),
          aprovadoPor: input.aprovadoPor,
          aprovadoEm: new Date().toISOString(),
          fdTotalAbatido: String(fdTotal),
          atualizadoEm: new Date().toISOString(),
        } as any).where(eq(terceiroMedicoes.id, input.id)).returning();

        const itensMedicao = await tx.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
        for (const im of itensMedicao) {
          await tx.update(terceiroContratoItens).set({
            // Rev. 4800 — consolida o MEDIDO, nunca o avanço consultivo.
            percentualMedidoAcumulado: String(n(im.percentualAcumuladoAnterior) + n(im.percentualMedidoPeriodo)),
            valorMedidoAcumulado: im.valorAcumulado,
          }).where(eq(terceiroContratoItens.id, im.contratoItemId));
        }
        return med;
      });

      // Rev. 4797 — aprovação final também consolida o levantamento vinculado.
      await _consolidarLevantamentoDaMedicao(db, medicao, input.companyId, (ctx.user as any)?.name || null).catch((e: any) =>
        console.error(`[aprovarNivelSocio] FALHA ao consolidar levantamento:`, e?.message || e));
      // Rev. 4778 — POKA-YOKE: título garantido direto (bypassa o toggle auto_import).
      const financeiroOk = await _posAprovacaoFinanceiro(input.companyId, input.id, ctx.user?.id);
      try {
        await triggerFinancialSyncAwaited(input.companyId);
      } catch (syncErr: any) {
        console.error(`[aprovarNivelSocio] FALHA no sync financeiro pós-aprovação da medição #${input.id} (companyId=${input.companyId}):`, syncErr?.message || syncErr);
      }
      return { ...medicao, financeiroOk };
    }),

  // ============================================================
  // Rev. 4802 — ADITIVOS DE CONTRATO (excedente de medição)
  // Fluxo: medição libera só o saldo do contrato; o excedente vira proposta de
  // aditivo com justificativa + foto + estimativa, aprovada em 2 níveis
  // (gestor da obra → sócio adm). Aprovado → soma no item e no contrato.
  // ============================================================
  listarAditivos: protectedProcedure
    .input(z.object({ contratoId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.select().from(terceiroContratoAditivos)
        .where(and(eq(terceiroContratoAditivos.contratoId, input.contratoId), eq(terceiroContratoAditivos.companyId, input.companyId)))
        .orderBy(asc(terceiroContratoAditivos.numero));
      // junta a descrição do item do contrato p/ exibição
      const itens = await db.select({ id: terceiroContratoItens.id, descricao: terceiroContratoItens.descricao, unidade: terceiroContratoItens.unidade, eapCodigo: terceiroContratoItens.eapCodigo })
        .from(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, input.contratoId));
      const byId = new Map(itens.map((i: any) => [i.id, i]));
      return rows.map((a: any) => ({ ...a, item: byId.get(a.contratoItemId) || null }));
    }),

  criarAditivo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      contratoItemId: z.number(),
      medicaoId: z.number().optional(),
      quantidade: z.number().positive("Quantidade deve ser maior que zero"),
      valorUnitario: z.number().min(0),
      justificativa: z.string().trim().min(15, "Fundamente o motivo do acréscimo (mínimo 15 caracteres)"),
      fotoUrl: z.string().trim().min(1, "Foto do acréscimo é obrigatória"),
      // Rev. 4817 — fonte da verba escolhida pelo solicitante (nunca bloqueia)
      fonteVerba: z.enum(["realocacao", "verba_extra"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return await db.transaction(async (tx: any) => {
      // Lock por contrato: check-then-insert do "pendente único" sem corrida.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(478005, ${input.contratoId})`);
      const [contrato] = await tx.select().from(terceiroContratos)
        .where(and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId)));
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
      const [item] = await tx.select().from(terceiroContratoItens)
        .where(and(eq(terceiroContratoItens.id, input.contratoItemId), eq(terceiroContratoItens.contratoId, input.contratoId), eq(terceiroContratoItens.companyId, input.companyId)));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item do contrato não encontrado" });
      // Poka-yoke: aditivo precisa de LASTRO — nasce de uma medição do próprio
      // contrato com excedente registrado neste item, e a quantidade não pode
      // passar do excedente medido (evita "aumento contratual especulativo").
      if (input.medicaoId) {
        const [med] = await tx.select({ id: terceiroMedicoes.id }).from(terceiroMedicoes)
          .where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.contratoId, input.contratoId), eq(terceiroMedicoes.companyId, input.companyId)));
        if (!med) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada neste contrato" });
        const [mi] = await tx.select({ quantidadeExcedente: terceiroMedicaoItens.quantidadeExcedente }).from(terceiroMedicaoItens)
          .where(and(eq(terceiroMedicaoItens.medicaoId, input.medicaoId), eq(terceiroMedicaoItens.contratoItemId, input.contratoItemId)));
        const excedente = n(mi?.quantidadeExcedente);
        if (excedente <= 0.0001) throw new TRPCError({ code: "BAD_REQUEST", message: "Este item não tem excedente medido nesta medição." });
        if (input.quantidade > excedente + 0.005) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Quantidade acima do excedente medido (${excedente.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}). O aditivo deve ter lastro no levantamento.` });
        }
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O aditivo deve nascer de uma medição com excedente registrado." });
      }
      // Poka-yoke: não duplicar aditivo pendente do MESMO item.
      const pendentes = await tx.select({ id: terceiroContratoAditivos.id }).from(terceiroContratoAditivos)
        .where(and(
          eq(terceiroContratoAditivos.contratoId, input.contratoId),
          eq(terceiroContratoAditivos.contratoItemId, input.contratoItemId),
          eq(terceiroContratoAditivos.status, "pendente"),
        ));
      if (pendentes.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe um aditivo PENDENTE para este item. Aprove ou rejeite antes de criar outro." });
      const existentes = await tx.select({ numero: terceiroContratoAditivos.numero }).from(terceiroContratoAditivos)
        .where(eq(terceiroContratoAditivos.contratoId, input.contratoId));
      const numero = existentes.reduce((mx: number, r: any) => Math.max(mx, Number(r.numero) || 0), 0) + 1;
      const valorTotal = Math.round(input.quantidade * input.valorUnitario * 100) / 100;
      const [aditivo] = await tx.insert(terceiroContratoAditivos).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        contratoItemId: input.contratoItemId,
        medicaoId: input.medicaoId ?? null,
        numero,
        quantidade: String(input.quantidade),
        valorUnitario: String(input.valorUnitario),
        valorTotal: String(valorTotal),
        justificativa: input.justificativa,
        fotoUrl: input.fotoUrl,
        status: "pendente",
        criadoPor: (ctx.user as any)?.name || null,
        fonteVerba: input.fonteVerba ?? "realocacao",
      } as any).returning();
      return aditivo;
      });
    }),

  aprovarAditivoGestor: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), aprovadoPor: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [a] = await db.select().from(terceiroContratoAditivos)
        .where(and(eq(terceiroContratoAditivos.id, input.id), eq(terceiroContratoAditivos.companyId, input.companyId)));
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Aditivo não encontrado" });
      if (a.status !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: `Aditivo não está pendente (status: ${a.status})` });
      if ((a.nivelAprovacao ?? 0) >= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Aditivo já aprovado pelo gestor da obra." });
      const [upd] = await db.update(terceiroContratoAditivos).set({
        nivelAprovacao: 1,
        // Rev. 4816 — rastreabilidade: grava o usuário LOGADO, não texto do client
        gestorAprovadoPor: (ctx.user as any)?.name || (ctx.user as any)?.email || input.aprovadoPor,
        gestorAprovadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(terceiroContratoAditivos.id, input.id)).returning();
      return upd;
    }),

  // Aprovação FINAL (sócio adm obrigatório): soma quantidade/valor no item do
  // contrato + no valor total do contrato; reabre contrato encerrado.
  aprovarAditivoSocio: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), aprovadoPor: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return await db.transaction(async (tx: any) => {
        // lock por contrato: aprovação concorrente não pode somar 2×
        const [a] = await tx.select().from(terceiroContratoAditivos)
          .where(and(eq(terceiroContratoAditivos.id, input.id), eq(terceiroContratoAditivos.companyId, input.companyId)));
        if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Aditivo não encontrado" });
        await tx.execute(sql`SELECT pg_advisory_xact_lock(478005, ${a.contratoId})`);
        const [a2] = await tx.select().from(terceiroContratoAditivos).where(eq(terceiroContratoAditivos.id, input.id));
        if (!a2 || a2.status !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: `Aditivo não está pendente (status: ${a2?.status})` });
        if ((a2.nivelAprovacao ?? 0) < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Aprove primeiro no nível do gestor da obra." });

        const [item] = await tx.select().from(terceiroContratoItens)
          .where(and(eq(terceiroContratoItens.id, a2.contratoItemId), eq(terceiroContratoItens.companyId, input.companyId)));
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item do contrato não encontrado" });
        const [contrato] = await tx.select().from(terceiroContratos)
          .where(and(eq(terceiroContratos.id, a2.contratoId), eq(terceiroContratos.companyId, input.companyId)));
        if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });

        const novaQtd = n(item.quantidade) + n(a2.quantidade);
        const novoValorTotalItem = Math.round((n(item.valorTotal) + n(a2.valorTotal)) * 100) / 100;
        // % medido acumulado precisa ser RE-DERIVADO do valor (o teto cresceu).
        const novoPercMedido = novoValorTotalItem > 0 ? (n(item.valorMedidoAcumulado) / novoValorTotalItem) * 100 : 0;
        await tx.update(terceiroContratoItens).set({
          quantidade: String(novaQtd),
          valorTotal: String(novoValorTotalItem),
          percentualMedidoAcumulado: String(novoPercMedido),
        } as any).where(eq(terceiroContratoItens.id, item.id));

        const novoValorContrato = Math.round((n(contrato.valorTotal) + n(a2.valorTotal)) * 100) / 100;
        const reabrindo = contrato.status === "encerrado" || contrato.status === "concluido";
        await tx.update(terceiroContratos).set({
          valorTotal: String(novoValorContrato),
          // Aditivo aprovado REABRE o saldo de contrato encerrado/concluído.
          ...(reabrindo ? { status: "ativo" } : {}),
          atualizadoEm: new Date().toISOString(),
        } as any).where(eq(terceiroContratos.id, contrato.id));
        // Rev. 4817 — reabrir contrato ESTORNA o crédito de sobra que o
        // encerramento lançou na Realocação de Verba (senão o mesmo dinheiro
        // existiria duas vezes: no teto reaberto e no pote de realocação).
        if (reabrindo) {
          await tx.delete(budgetReallocations).where(and(
            eq(budgetReallocations.companyId, input.companyId),
            eq(budgetReallocations.origemEapItemNome, `Economia Contrato: ${contrato.numeroContrato || contrato.id}`),
          ));
        }

        // Rev. 4817 — FONTE DE VERBA: consome do saldo de Realocação até onde
        // ele alcança (nunca bloqueia; o descoberto fica marcado como prejuízo
        // consciente aprovado pelo sócio).
        let valorCoberto = 0;
        let realocacaoId: number | null = null;
        if ((a2 as any).fonteVerba !== "verba_extra") {
          // Lock por EMPRESA: serializa leitura de saldo + consumo entre
          // aprovações concorrentes de contratos diferentes (sem isso, dois
          // sócios aprovando ao mesmo tempo consumiriam o mesmo saldo 2x).
          await tx.execute(sql`SELECT pg_advisory_xact_lock(478006, ${input.companyId})`);
          let disponivel = 0;
          try {
            const saldos = await calcularSaldosRealocacaoGeral({ companyId: input.companyId, obraId: contrato.obraId ?? undefined });
            disponivel = n((saldos as any).sobrasDisponivelReal);
          } catch (e: any) {
            console.error("[Aditivo] Falha ao calcular saldo de realocação:", e?.message || e);
          }
          valorCoberto = Math.min(n(a2.valorTotal), Math.max(0, disponivel));
          valorCoberto = Math.round(valorCoberto * 100) / 100;
          if (valorCoberto > 0.01) {
            const [realoc] = await tx.insert(budgetReallocations).values({
              companyId: input.companyId,
              obraId: contrato.obraId ?? 0,
              origemEapItemNome: "Saldo de Realocação (aditivo)",
              destinoEapItemId: (item as any).orcamentoItemId ?? null,
              destinoEapItemNome: `Aditivo #${a2.numero} — ${contrato.numeroContrato || `CT-${contrato.id}`} · ${String((item as any).descricao || "").slice(0, 120)}`,
              valorRealocado: String(valorCoberto),
              motivo: `Aditivo #${a2.numero} do contrato ${contrato.numeroContrato || contrato.id} aprovado pelo sócio adm — consumo do saldo de realocação.`,
              usuarioId: (ctx.user as any)?.id ?? 0,
              usuarioNome: (ctx.user as any)?.name || (ctx.user as any)?.email || null,
            } as any).returning();
            realocacaoId = realoc?.id ?? null;
          }
        }

        const [upd] = await tx.update(terceiroContratoAditivos).set({
          status: "aprovado",
          nivelAprovacao: 2,
          socioAprovadoPor: (ctx.user as any)?.name || (ctx.user as any)?.email || input.aprovadoPor,
          socioAprovadoEm: new Date().toISOString(),
          valorCoberto: String(valorCoberto),
          realocacaoId,
          atualizadoEm: new Date().toISOString(),
        } as any).where(eq(terceiroContratoAditivos.id, input.id)).returning();

        // O teto (valorTotal do item) cresceu — TODO percentual gravado em cima
        // do teto antigo precisa ser re-escalado (valores em R$ não mudam), senão
        // o sync do levantamento volta a marcar excedente indevido e os % das
        // medições abertas ficam inflados. Medições FINALIZADAS (aprovada/paga)
        // ficam intactas: histórico.
        const fator = novoValorTotalItem > 0 ? n(item.valorTotal) / novoValorTotalItem : 0;
        await tx.execute(sql`
          UPDATE terceiro_medicao_itens mi SET
            percentual_acumulado_anterior = ROUND(COALESCE(mi.percentual_acumulado_anterior, 0) * ${fator}::numeric, 4),
            percentual_medido_periodo     = ROUND(COALESCE(mi.percentual_medido_periodo, 0) * ${fator}::numeric, 4),
            percentual_avanco_fisico      = ROUND(COALESCE(mi.percentual_avanco_fisico, 0) * ${fator}::numeric, 4),
            quantidade_excedente          = 0
          FROM terceiro_medicoes m
          WHERE m.id = mi.medicao_id
            AND mi.contrato_item_id = ${item.id}
            AND m.contrato_id = ${contrato.id}
            AND m.status NOT IN ('aprovada','paga')
        `);
        // % global das medições ABERTAS re-derivado do novo valor do contrato.
        await tx.execute(sql`
          UPDATE terceiro_medicoes SET
            percentual_global = ROUND(COALESCE(valor_medido, 0) / NULLIF(${novoValorContrato}::numeric, 0) * 100, 4)
          WHERE contrato_id = ${contrato.id}
            AND status NOT IN ('aprovada','paga')
        `);
        return upd;
      });
    }),

  rejeitarAditivo: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), rejeitadoPor: z.string(), motivo: z.string().trim().min(5, "Informe o motivo da rejeição") }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [a] = await db.select().from(terceiroContratoAditivos)
        .where(and(eq(terceiroContratoAditivos.id, input.id), eq(terceiroContratoAditivos.companyId, input.companyId)));
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Aditivo não encontrado" });
      if (a.status !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: `Aditivo não está pendente (status: ${a.status})` });
      const [upd] = await db.update(terceiroContratoAditivos).set({
        status: "rejeitado",
        rejeitadoPor: (ctx.user as any)?.name || (ctx.user as any)?.email || input.rejeitadoPor,
        rejeitadoEm: new Date().toISOString(),
        motivoRejeicao: input.motivo,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(terceiroContratoAditivos.id, input.id)).returning();
      return upd;
    }),

  // Rev. 4817 — Encerrar contrato: sobra (área estimada que mediu menos) volta
  // como CRÉDITO para a Realocação de Verba ("Economia Contrato: <nº>").
  // Reabrir via aditivo aprovado estorna o crédito (ver aprovarAditivoSocio).
  encerrarContrato: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(478005, ${input.id})`);
        // Serializa com o consumo de saldo das aprovações de aditivo (478006).
        await tx.execute(sql`SELECT pg_advisory_xact_lock(478006, ${input.companyId})`);
        const [contrato] = await tx.select().from(terceiroContratos)
          .where(and(eq(terceiroContratos.id, input.id), eq(terceiroContratos.companyId, input.companyId)));
        if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
        if (contrato.status === "encerrado") throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato já está encerrado." });
        if (contrato.status === "cancelado") throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato cancelado não pode ser encerrado." });
        // Poka-yoke: nada em aberto — medições pendentes precisam ser resolvidas antes.
        const abertas = await tx.select({ id: terceiroMedicoes.id }).from(terceiroMedicoes)
          .where(and(
            eq(terceiroMedicoes.contratoId, input.id),
            sql`${terceiroMedicoes.status} NOT IN ('aprovada','paga','cancelada','rejeitada')`,
          ));
        if (abertas.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Há ${abertas.length} medição(ões) em aberto (rascunho/pendente). Aprove, rejeite ou exclua antes de encerrar.` });
        // Aditivo pendente também trava (decisão financeira em curso).
        const adPend = await tx.select({ id: terceiroContratoAditivos.id }).from(terceiroContratoAditivos)
          .where(and(eq(terceiroContratoAditivos.contratoId, input.id), eq(terceiroContratoAditivos.status, "pendente")));
        if (adPend.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Há aditivo pendente de aprovação. Aprove ou rejeite antes de encerrar." });

        const itens = await tx.select({ valorMedidoAcumulado: terceiroContratoItens.valorMedidoAcumulado })
          .from(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, input.id));
        const medidoTotal = itens.reduce((s: number, i: any) => s + n(i.valorMedidoAcumulado), 0);
        const sobra = Math.round(Math.max(0, n(contrato.valorTotal) - medidoTotal) * 100) / 100;

        await tx.update(terceiroContratos).set({
          status: "encerrado",
          atualizadoEm: new Date().toISOString(),
        } as any).where(eq(terceiroContratos.id, input.id));

        let creditoId: number | null = null;
        if (sobra > 0.01) {
          // Idempotência: não duplicar crédito do mesmo contrato.
          const jaCreditado = await tx.select({ id: budgetReallocations.id }).from(budgetReallocations)
            .where(and(
              eq(budgetReallocations.companyId, input.companyId),
              eq(budgetReallocations.origemEapItemNome, `Economia Contrato: ${contrato.numeroContrato || contrato.id}`),
            ));
          if (jaCreditado.length === 0) {
            const [cred] = await tx.insert(budgetReallocations).values({
              companyId: input.companyId,
              obraId: contrato.obraId ?? 0,
              origemEapItemNome: `Economia Contrato: ${contrato.numeroContrato || contrato.id}`,
              destinoEapItemNome: "Crédito p/ Realocação de Verba",
              valorRealocado: String(sobra),
              motivo: `Encerramento do contrato ${contrato.numeroContrato || contrato.id}: contratado ${n(contrato.valorTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} − medido ${medidoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Sobra devolvida ao pote de realocação.`,
              usuarioId: (ctx.user as any)?.id ?? 0,
              usuarioNome: (ctx.user as any)?.name || (ctx.user as any)?.email || null,
            } as any).returning();
            creditoId = cred?.id ?? null;
          }
        }
        await createAuditLog({
          userId: (ctx.user as any)?.id,
          userName: (ctx.user as any)?.name || null,
          companyId: input.companyId,
          action: "encerrar",
          module: "terceiros",
          entityType: "contrato",
          entityId: input.id,
          details: `Contrato ${contrato.numeroContrato || contrato.id} encerrado. Sobra creditada na Realocação de Verba: R$ ${sobra.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        } as any);
        return { ok: true, sobra, creditoId };
      });
    }),

  // Rev. 4778 — Reenvio manual: medição aprovada sem título no Financeiro
  // (self-heal acionável pelo usuário direto na tela de Medições).
  reenviarMedicaoFinanceiro: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [med] = await db.select().from(terceiroMedicoes)
        .where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!med) throw new Error("Medição não encontrada");
      if (!["aprovada", "faturada", "paga"].includes(String(med.status)))
        throw new Error(`Só medições aprovadas podem ser reenviadas ao Financeiro (status: ${med.status})`);
      const ok = await garantirTituloDaMedicao(input.companyId, input.id);
      if (!ok) throw new Error("Não foi possível criar o título no Financeiro. Verifique se a medição tem valor medido > 0.");
      return { ok };
    }),

  gerarPdfMedicao: protectedProcedure
    .input(z.object({ medicaoId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      // Rev. 4827 — tenancy guard (review): faltava validar o acesso do chamador.
      await _assertCompanyAccess(ctx.user, input.companyId);
      return await gerarPdfMedicaoBuffer(db, input);
    }),

  excluirMedicao: protectedProcedure
    .input(z.object({ id: z.number(), contratoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId); // Rev. 4801 — tenancy guard
      const [medicao] = await db.select().from(terceiroMedicoes).where(
        and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId))
      );
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "paga") throw new Error("Não é possível excluir uma medição já paga");

      // Rev. 4801 — tudo atômico: reversão de acumulados + descontos + deleções.
      // Rev. 4804 — BUGFIX: reverter SEMPRE (qualquer status), recalculando o
      // acumulado do item a partir das medições aprovadas/pagas REMANESCENTES.
      // Antes só revertia se status==="aprovada"; um rascunho que passou pelo
      // recalcular já tinha gravado acumulado no item → exclusão deixava saldo
      // fantasma no contrato ("Medido Acumulado" sem nenhuma medição).
      let aditivosExcluidos = 0;
      let valorAditivoRevertido = 0;
      await db.transaction(async (tx: any) => {
        // Rev. 4818 — a medição que ORIGINOU um aditivo é o lastro dele: excluir
        // essa medição derruba o aditivo junto e DESFAZ todos os efeitos
        // (teto do item, valor do contrato, consumo de realocação, % das abertas).
        const aditivosDaMedicao = await tx.select().from(terceiroContratoAditivos)
          .where(and(eq(terceiroContratoAditivos.medicaoId, input.id), eq(terceiroContratoAditivos.companyId, input.companyId)));
        const itensAfetadosPorAditivo = new Set<number>();
        if (aditivosDaMedicao.length > 0) {
          // Serializa com o pote de realocação (mesmo lock das aprovações).
          await tx.execute(sql`SELECT pg_advisory_xact_lock(478006, ${input.companyId})`);
          const [contrato] = await tx.select().from(terceiroContratos)
            .where(and(eq(terceiroContratos.id, medicao.contratoId), eq(terceiroContratos.companyId, input.companyId)));
          for (const ad of aditivosDaMedicao) {
            if (ad.status === "aprovado" && contrato) {
              const [item] = await tx.select().from(terceiroContratoItens)
                .where(and(eq(terceiroContratoItens.id, ad.contratoItemId), eq(terceiroContratoItens.companyId, input.companyId)));
              if (item) {
                const tetoAntigo = n(item.valorTotal);
                const tetoNovo = Math.max(0, Math.round((tetoAntigo - n(ad.valorTotal)) * 100) / 100);
                await tx.update(terceiroContratoItens).set({
                  quantidade: String(Math.max(0, n(item.quantidade) - n(ad.quantidade))),
                  valorTotal: String(tetoNovo),
                } as any).where(eq(terceiroContratoItens.id, item.id));
                itensAfetadosPorAditivo.add(item.id);
                // % das medições ABERTAS remanescentes foram re-escaladas quando o
                // teto cresceu — desfaz com o fator INVERSO (valores em R$ não mudam).
                const fatorInv = tetoNovo > 0 ? tetoAntigo / tetoNovo : 0;
                await tx.execute(sql`
                  UPDATE terceiro_medicao_itens mi SET
                    percentual_acumulado_anterior = ROUND(COALESCE(mi.percentual_acumulado_anterior, 0) * ${fatorInv}::numeric, 4),
                    percentual_medido_periodo     = ROUND(COALESCE(mi.percentual_medido_periodo, 0) * ${fatorInv}::numeric, 4),
                    percentual_avanco_fisico      = ROUND(COALESCE(mi.percentual_avanco_fisico, 0) * ${fatorInv}::numeric, 4)
                  FROM terceiro_medicoes m
                  WHERE m.id = mi.medicao_id
                    AND mi.contrato_item_id = ${item.id}
                    AND m.contrato_id = ${medicao.contratoId}
                    AND m.id != ${input.id}
                    AND m.status NOT IN ('aprovada','paga')
                `);
              }
              const novoValorContrato = Math.max(0, Math.round((n(contrato.valorTotal) - n(ad.valorTotal)) * 100) / 100);
              (contrato as any).valorTotal = String(novoValorContrato);
              await tx.update(terceiroContratos).set({ valorTotal: String(novoValorContrato), atualizadoEm: new Date().toISOString() } as any)
                .where(eq(terceiroContratos.id, contrato.id));
              await tx.execute(sql`
                UPDATE terceiro_medicoes SET
                  percentual_global = ROUND(COALESCE(valor_medido, 0) / NULLIF(${novoValorContrato}::numeric, 0) * 100, 4)
                WHERE contrato_id = ${medicao.contratoId}
                  AND id != ${input.id}
                  AND status NOT IN ('aprovada','paga')
              `);
              // Devolve o consumo do pote de Realocação de Verba (se houve).
              if ((ad as any).realocacaoId) {
                await tx.delete(budgetReallocations).where(and(
                  eq(budgetReallocations.id, (ad as any).realocacaoId),
                  eq(budgetReallocations.companyId, input.companyId),
                ));
              }
              valorAditivoRevertido += n(ad.valorTotal);
            }
            await tx.delete(terceiroContratoAditivos).where(eq(terceiroContratoAditivos.id, ad.id));
            aditivosExcluidos++;
          }
        }

        {
          const itensMedicao = await tx.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
          const itemIds = Array.from(new Set(itensMedicao.map((im: any) => im.contratoItemId).filter(Boolean)));
          const outrasAprovadas = await tx.select({ id: terceiroMedicoes.id }).from(terceiroMedicoes)
            .where(and(
              eq(terceiroMedicoes.contratoId, medicao.contratoId),
              eq(terceiroMedicoes.companyId, input.companyId),
              inArray(terceiroMedicoes.status, ["aprovada", "paga"]),
              sql`${terceiroMedicoes.id} != ${input.id}`,
            ));
          const outrosItens: any[] = [];
          for (const om of outrasAprovadas) {
            const its = await tx.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, om.id));
            outrosItens.push(...its);
          }
          for (const itemId of itemIds) {
            const somaPerc = outrosItens.filter((o: any) => o.contratoItemId === itemId)
              .reduce((s: number, o: any) => s + n(o.percentualMedidoPeriodo), 0);
            const somaValor = outrosItens.filter((o: any) => o.contratoItemId === itemId)
              .reduce((s: number, o: any) => s + n(o.valorMedidoPeriodo), 0);
            // Rev. 4818 — item cujo teto encolheu (aditivo revertido): % re-derivado
            // do VALOR contra o teto atual (os % antigos eram relativos ao teto maior).
            let percFinal = somaPerc;
            if (itensAfetadosPorAditivo.has(itemId as number)) {
              const [itemAtual] = await tx.select({ valorTotal: terceiroContratoItens.valorTotal }).from(terceiroContratoItens)
                .where(eq(terceiroContratoItens.id, itemId));
              const teto = n(itemAtual?.valorTotal);
              percFinal = teto > 0 ? (somaValor / teto) * 100 : 0;
            }
            await tx.update(terceiroContratoItens).set({
              percentualMedidoAcumulado: String(percFinal),
              valorMedidoAcumulado: String(somaValor),
            }).where(and(eq(terceiroContratoItens.id, itemId), eq(terceiroContratoItens.companyId, input.companyId)));
          }
        }

        // Rev. 4801 — descontos da medição excluída: avulsos (EPI/insumo) voltam a
        // ficar PENDENTES no contrato (não somem); os agregados de FD auto são
        // apagados (o pendente das OCs volta a contar sozinho pela fórmula).
        await tx.update(terceiroMedicaoFds).set({ medicaoId: null, atualizadoEm: new Date().toISOString() })
          .where(and(eq(terceiroMedicaoFds.medicaoId, input.id), eq(terceiroMedicaoFds.companyId, input.companyId), eq(terceiroMedicaoFds.origem, "avulso")));
        await tx.delete(terceiroMedicaoFds)
          .where(and(eq(terceiroMedicaoFds.medicaoId, input.id), eq(terceiroMedicaoFds.companyId, input.companyId)));

        await tx.delete(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
        await tx.delete(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.id));
      });
      return { ok: true, aditivosExcluidos, valorAditivoRevertido: Math.round(valorAditivoRevertido * 100) / 100 };
    }),

  // Rev. 4801 — LIBERAÇÃO DA RETENÇÃO TÉCNICA (após a última medição do contrato).
  // Decisão do usuário: débito pendente (FD/EPI/insumo) ABATE AUTOMATICAMENTE da
  // retenção na liberação final; o líquido vira título no Contas a Pagar.
  liberarRetencaoTecnica: protectedProcedure
    .input(z.object({ contratoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [contrato] = await db.select().from(terceiroContratos)
        .where(and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId)));
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
      const perc = n((contrato as any).percRetencaoTecnica);
      if (perc <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Este contrato não tem Retenção Técnica configurada." });

      return await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(478004, ${input.contratoId})`);
        // Idempotência: só uma liberação por contrato.
        const [jaTem] = await tx.select({ id: financialEntries.id }).from(financialEntries)
          .where(and(
            eq(financialEntries.companyId, input.companyId),
            eq(financialEntries.origemModulo, "terceiro_retencao"),
            eq(financialEntries.origemId, input.contratoId),
            sql`${financialEntries.status} <> 'cancelado'`,
          )).limit(1);
        if (jaTem) throw new TRPCError({ code: "BAD_REQUEST", message: "A retenção técnica deste contrato já foi liberada." });

        const meds = await tx.select().from(terceiroMedicoes)
          .where(and(eq(terceiroMedicoes.contratoId, input.contratoId), eq(terceiroMedicoes.companyId, input.companyId)));
        const abertas = meds.filter((m: any) => m.status === "rascunho" || m.status === "aguardando_aprovacao");
        if (abertas.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Ainda há ${abertas.length} medição(ões) em rascunho/aguardando aprovação. Finalize todas antes de liberar a retenção.` });
        const fechadas = meds.filter((m: any) => m.status === "aprovada" || m.status === "paga");
        if (fechadas.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma medição aprovada/paga — não há retenção acumulada para liberar." });
        const retAcumulada = Math.round(fechadas.reduce((s: number, m: any) => s + n(m.valorMedido) * perc / 100, 0) * 100) / 100;

        // Débitos pendentes abatem da retenção (decisão do usuário).
        const { pendente, registros } = await _fdPendenteDoContrato(tx, contrato);
        let abatido = 0;
        if (pendente > 0.01) {
          let livre = retAcumulada;
          const avulsos = await tx.select().from(terceiroMedicaoFds)
            .where(and(
              eq(terceiroMedicaoFds.companyId, input.companyId),
              eq(terceiroMedicaoFds.contratoId, input.contratoId),
              eq(terceiroMedicaoFds.origem, "avulso"),
              sql`${terceiroMedicaoFds.medicaoId} IS NULL`,
              eq(terceiroMedicaoFds.abatidoRetencao, 0),
            )).orderBy(asc(terceiroMedicaoFds.dataFd), asc(terceiroMedicaoFds.id));
          for (const av of avulsos) {
            if (livre <= 0.01) break;
            const v = n(av.valor);
            if (v <= livre + 0.005) {
              await tx.update(terceiroMedicaoFds).set({ abatidoRetencao: 1, observacoes: `${av.observacoes ? av.observacoes + " — " : ""}Abatido da retenção técnica na liberação final.`, atualizadoEm: new Date().toISOString() })
                .where(eq(terceiroMedicaoFds.id, av.id));
              livre = Math.round((livre - v) * 100) / 100;
              abatido = Math.round((abatido + v) * 100) / 100;
            } else {
              const cabe = Math.round(livre * 100) / 100;
              const resto = Math.round((v - cabe) * 100) / 100;
              await tx.update(terceiroMedicaoFds).set({ abatidoRetencao: 1, valor: String(cabe.toFixed(2)), observacoes: `${av.observacoes ? av.observacoes + " — " : ""}Abatido da retenção técnica na liberação final.`, atualizadoEm: new Date().toISOString() })
                .where(eq(terceiroMedicaoFds.id, av.id));
              await tx.insert(terceiroMedicaoFds).values({
                companyId: input.companyId, contratoId: input.contratoId, medicaoId: null,
                descricao: `${av.descricao} (saldo restante)`.slice(0, 500),
                valor: String(resto.toFixed(2)), dataFd: av.dataFd, origem: "avulso",
                tipo: (av as any).tipo || "outro", observacoes: av.observacoes, criadoPor: av.criadoPor,
              } as any);
              abatido = Math.round((abatido + cabe) * 100) / 100;
              livre = 0;
            }
          }
          // Parte de FD das OCs que ainda resta, no espaço livre.
          if (livre > 0.01) {
            const restoOc = Math.min(Math.round((pendente - abatido) * 100) / 100, livre);
            if (restoOc > 0.01) {
              const ocsTxt = registros.map((r: any) => r.numeroOc || `OC #${r.id}`).join(", ");
              await tx.insert(terceiroMedicaoFds).values({
                companyId: input.companyId, contratoId: input.contratoId, medicaoId: null,
                descricao: `FD de material abatido da retenção técnica (${ocsTxt})`.slice(0, 500),
                valor: String(restoOc.toFixed(2)),
                dataFd: new Date().toISOString().slice(0, 10),
                origem: "auto", tipo: "fd", abatidoRetencao: 1,
                observacoes: "Abatido da retenção técnica na liberação final.",
                criadoPor: ctx.user?.name || null,
              } as any);
              abatido = Math.round((abatido + restoOc) * 100) / 100;
            }
          }
        }

        const liquido = Math.max(0, Math.round((retAcumulada - abatido) * 100) / 100);
        let entryId: number | null = null;
        if (liquido > 0.005) {
          const hoje = new Date().toISOString().slice(0, 10);
          const [fe] = await tx.insert(financialEntries).values({
            companyId: input.companyId,
            obraId: (contrato as any).obraId ?? null,
            contaNome: "Serviços de Terceiros",
            tipo: "despesa",
            natureza: "variavel",
            valorPrevisto: String(liquido.toFixed(2)),
            dataCompetencia: hoje.slice(0, 7) + "-01",
            dataVencimento: hoje,
            status: "a_pagar",
            origemModulo: "terceiro_retencao",
            origemId: input.contratoId,
            origemDescricao: `Liberação da Retenção Técnica (${perc}%) — contrato ${(contrato as any).numero || `#${input.contratoId}`}`,
            descricao: `Retenção Técnica liberada — contrato ${(contrato as any).numero || `#${input.contratoId}`}`,
          } as any).returning({ id: financialEntries.id });
          entryId = fe?.id ?? null;
        }
        const restantePosLiberacao = Math.max(0, Math.round((pendente - abatido) * 100) / 100);
        return { ok: true, retAcumulada, abatido, liquido, entryId, debitoRestante: restantePosLiberacao };
      });
    }),

  recalcularMedicao: protectedProcedure
    .input(z.object({ medicaoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId); // Rev. 4804 — tenancy guard (IDOR)
      const [medicao] = await db.select().from(terceiroMedicoes).where(
        and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId))
      );
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "aprovada" || medicao.status === "paga") throw new Error("Não é possível recalcular uma medição já aprovada/paga");

      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, medicao.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");

      // Rev. 4800 — a medição RESPEITA O QUANTITATIVO do levantamento: antes de
      // qualquer conta, reaplica o levantamento vinculado (qtd × preço unit.).
      if ((medicao as any).levantamentoCampoId) {
        try { await aplicarLevantamentoNaMedicaoTerceiro(db, (medicao as any).levantamentoCampoId); }
        catch (e: any) { console.warn("[recalcularMedicao] reaplicar levantamento falhou:", e?.message); }
      }

      const itensContrato = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, medicao.contratoId))
        .orderBy(asc(terceiroContratoItens.ordem));
      const itensMedicao = await db.select().from(terceiroMedicaoItens)
        .where(eq(terceiroMedicaoItens.medicaoId, input.medicaoId));

      // Build avancoMap + eapToAtividadeId + hierarchical name matching
      const avancoMap: Record<number, number> = {};
      const eapToAtividadeId: Record<string, number> = {};
      // cronograma: eap→nome map for building parent paths
      const cronoEapNome: Record<string, string> = {};
      // name → [{id, eap}] for multiple matches
      const nomeToAtividades: Record<string, {id: number; eap: string}[]> = {};
      if (contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          if (proj) {
            const allAvancos = await db.select({
              atividadeId: planejamentoAvancos.atividadeId,
              percentualAcumulado: planejamentoAvancos.percentualAcumulado,
            }).from(planejamentoAvancos)
              .where(eq(planejamentoAvancos.projetoId, proj.id))
              .orderBy(desc(planejamentoAvancos.semana));
            for (const av of allAvancos) {
              if (!(av.atividadeId in avancoMap)) avancoMap[av.atividadeId] = n(av.percentualAcumulado);
            }
            const revs = await db.select({ id: planejamentoRevisoes.id })
              .from(planejamentoRevisoes)
              .where(eq(planejamentoRevisoes.projetoId, proj.id))
              .orderBy(desc(planejamentoRevisoes.numero));
            for (const rev of revs) {
              const ativs = await db.select({ id: planejamentoAtividades.id, eapCodigo: planejamentoAtividades.eapCodigo, nome: planejamentoAtividades.nome })
                .from(planejamentoAtividades)
                .where(and(eq(planejamentoAtividades.revisaoId, rev.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`));
              for (const a of ativs) {
                if (a.eapCodigo) {
                  if (!(a.eapCodigo in eapToAtividadeId)) eapToAtividadeId[a.eapCodigo] = a.id;
                  cronoEapNome[a.eapCodigo] = a.nome;
                }
                if (a.nome && a.eapCodigo) {
                  const nomeNorm = a.nome.trim().toLowerCase().replace(/[:\s]+$/g, "").replace(/\s+/g, " ");
                  if (!nomeToAtividades[nomeNorm]) nomeToAtividades[nomeNorm] = [];
                  nomeToAtividades[nomeNorm].push({id: a.id, eap: a.eapCodigo});
                }
              }
              if (Object.keys(eapToAtividadeId).length > 0) break;
            }
          }
        } catch (e) { console.warn("[recalcularMedicao] Erro:", e); }
      }

      // Build orcamento EAP→nome map for parent context matching
      const orcEapNome: Record<string, string> = {};
      let orcId = contrato.orcamentoId;
      if (!orcId) {
        // Derive orcamentoId from contract items
        const itemWithOrc = itensContrato.find(ic => ic.orcamentoItemId);
        if (itemWithOrc?.orcamentoItemId) {
          const [orcItem] = await db.select({ orcamentoId: orcamentoItens.orcamentoId })
            .from(orcamentoItens).where(sql`${orcamentoItens.id} = ${itemWithOrc.orcamentoItemId}`).limit(1);
          if (orcItem) orcId = orcItem.orcamentoId;
        }
      }
      if (orcId) {
        try {
          const orcItensData = await db.select({ eapCodigo: orcamentoItens.eapCodigo, descricao: orcamentoItens.descricao })
            .from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, orcId));
          for (const oi of orcItensData) orcEapNome[oi.eapCodigo] = oi.descricao;
        } catch {}
      }
      console.log(`[recalcularMedicao] orcamentoId=${orcId}, orcEapNome: ${Object.keys(orcEapNome).length} itens`);

      // Normalize name: lowercase, strip trailing punctuation/colons, trim
      function normName(s: string): string {
        return s.trim().toLowerCase().replace(/[:\s]+$/g, "").replace(/\s+/g, " ");
      }

      // Helper: get parent names from EAP hierarchy (normalized)
      function getParentNames(eap: string, map: Record<string, string>): string[] {
        const parts = eap.split(".");
        const names: string[] = [];
        for (let i = 1; i < parts.length; i++) {
          const parentEap = parts.slice(0, i).join(".");
          if (map[parentEap]) names.push(normName(map[parentEap]));
        }
        return names;
      }

      // Track used activities to prevent duplicate matching
      const usedAtividades = new Set<number>();

      console.log(`[recalcularMedicao] avancoMap: ${Object.keys(avancoMap).length} atividades, eapMap: ${Object.keys(eapToAtividadeId).length} EAPs, nomeAtiv: ${Object.keys(nomeToAtividades).length}, orcEapNome: ${Object.keys(orcEapNome).length}`);

      // If all contract items have valorTotal=0, distribute contract total evenly
      const allItemsZero = itensContrato.every(ic => n(ic.valorTotal) === 0);
      const contratoTotal = n(contrato.valorTotal);
      if (allItemsZero && contratoTotal > 0 && itensContrato.length > 0) {
        const valorPorItem = contratoTotal / itensContrato.length;
        console.log(`[recalcularMedicao] Itens sem valor — distribuindo R$ ${contratoTotal.toFixed(2)} entre ${itensContrato.length} itens (R$ ${valorPorItem.toFixed(2)}/item)`);
        for (const ic of itensContrato) {
          (ic as any).valorTotal = String(valorPorItem);
          await db.update(terceiroContratoItens).set({ valorTotal: String(valorPorItem), valorUnitario: String(valorPorItem) } as any)
            .where(eq(terceiroContratoItens.id, ic.id));
        }
      }

      // Reset previous auto-links so hierarchical matching can re-assign correctly
      for (const ic of itensContrato) {
        if (ic.planejamentoAtividadeId) {
          usedAtividades.add(ic.planejamentoAtividadeId);
        }
      }
      // Clear usedAtividades and re-match ALL items for correct hierarchical assignment
      usedAtividades.clear();
      for (const ic of itensContrato) {
        (ic as any).planejamentoAtividadeId = null;
        await db.update(terceiroContratoItens).set({ planejamentoAtividadeId: null } as any)
          .where(eq(terceiroContratoItens.id, ic.id));
      }

      const outrasMedicoes = await db.select().from(terceiroMedicoes)
        .where(and(
          eq(terceiroMedicoes.contratoId, medicao.contratoId),
          eq(terceiroMedicoes.companyId, input.companyId),
          sql`${terceiroMedicoes.id} != ${input.medicaoId}`,
        ));
      const outrasMedicaoIds = outrasMedicoes
        .filter(om => om.status === "aprovada" || om.status === "paga")
        .map(om => om.id);
      const outrosItens = outrasMedicaoIds.length > 0
        ? await db.select().from(terceiroMedicaoItens)
            .where(sql`${terceiroMedicaoItens.medicaoId} IN (${sql.join(outrasMedicaoIds.map(id => sql`${id}`), sql`,`)})`)
        : [];
      const percAcumAnteriorPorItem: Record<number, number> = {};
      for (const oi of outrosItens) {
        percAcumAnteriorPorItem[oi.contratoItemId] = (percAcumAnteriorPorItem[oi.contratoItemId] || 0) + n(oi.percentualMedidoPeriodo);
      }

      // Rev. 4829 — "medido com o CLIENTE" (módulo Medição, lado cliente): busca
      // o acumulado por atividade/EAP dos boletins da mesma obra p/ comparar.
      const medidoClienteByAtiv: Record<number, number> = {};
      const medidoClienteByEap: Record<string, number> = {};
      try {
        if (contrato.obraId) {
          const rs: any = await db.execute(sql`
            SELECT i.atividade_id, i.eap_codigo, MAX(REPLACE(COALESCE(i.percentual_acumulado_atual::text,'0'),',','.')::numeric) AS pct
            FROM medicao_boletim_itens i
            JOIN medicao_boletins b ON b.id = i.boletim_id AND b.status IN ('enviado','aprovado','finalizado')
            JOIN medicao_contratos c ON c.id = b.contrato_id AND c.deleted_at IS NULL AND c.company_id = ${contrato.companyId}
            JOIN planejamento_projetos p ON p.id = c.projeto_id AND p.company_id = ${contrato.companyId}
            WHERE p.obra_id = ${contrato.obraId}
            GROUP BY i.atividade_id, i.eap_codigo`);
          for (const r of ((rs as any).rows ?? rs) as any[]) {
            const pct = Number(r.pct) || 0;
            if (r.atividade_id != null) medidoClienteByAtiv[Number(r.atividade_id)] = Math.max(medidoClienteByAtiv[Number(r.atividade_id)] || 0, pct);
            if (r.eap_codigo) medidoClienteByEap[String(r.eap_codigo)] = Math.max(medidoClienteByEap[String(r.eap_codigo)] || 0, pct);
          }
        }
      } catch (e: any) { console.warn("[recalcularMedicao] Lookup medido cliente falhou:", e?.message); }

      let valorMedidoPeriodo = 0;
      let somaAvancoPonderado = 0, somaPesoAvanco = 0;
      const itensResultado: { descricao: string; eapCodigo: string | null; vinculado: boolean; percentual: number; medidoAcum: number; avancoObra: number | null; medidoCliente: number | null }[] = [];
      // Rev. 4800 — cronograma é CONSULTIVO: coleta divergências medido × obra
      const divergencias: { descricao: string; medidoAcum: number; avancoObra: number; tipo: "acima" | "abaixo" }[] = [];
      const TOLERANCIA_PCT = 3;
      for (const itemMed of itensMedicao) {
        const itemContrato = itensContrato.find(ic => ic.id === itemMed.contratoItemId);
        if (!itemContrato) continue;

        let atividadeId: number | null = null;
        // Fallback 1: match by EAP code
        if (!atividadeId && (itemContrato as any).eapCodigo) {
          const eap = (itemContrato as any).eapCodigo;
          if (eapToAtividadeId[eap]) {
            atividadeId = eapToAtividadeId[eap];
            await db.update(terceiroContratoItens).set({ planejamentoAtividadeId: atividadeId }).where(eq(terceiroContratoItens.id, itemContrato.id));
            console.log(`[recalcularMedicao] Link EAP "${eap}" → ativId ${atividadeId}`);
          }
        }
        // Fallback 2: match by nome + parent hierarchy context
        if (!atividadeId && itemContrato.descricao) {
          const descNorm = normName(itemContrato.descricao);
          const candidates = nomeToAtividades[descNorm];
          if (candidates && candidates.length > 0) {
            const itemEap = (itemContrato as any).eapCodigo as string | null;
            if (candidates.length === 1) {
              if (!usedAtividades.has(candidates[0].id)) {
                atividadeId = candidates[0].id;
                usedAtividades.add(atividadeId);
              }
            } else if (itemEap) {
              // Multiple candidates — match by parent hierarchy context
              const orcParents = getParentNames(itemEap, orcEapNome);
              console.log(`[recalcularMedicao] MULTI-MATCH "${itemContrato.descricao}" eap=${itemEap} orcParents=[${orcParents.join(";")}] candidates=${candidates.length}`);
              let bestMatch: {id: number; score: number; eap: string} | null = null;
              for (const cand of candidates) {
                if (usedAtividades.has(cand.id)) continue;
                const cronoParents = getParentNames(cand.eap, cronoEapNome);
                let score = 0;
                for (const op of orcParents) {
                  for (const cp of cronoParents) {
                    if (op === cp) score += 2;
                    else if (op.includes(cp) || cp.includes(op)) score += 1;
                  }
                }
                console.log(`[recalcularMedicao]   cand eap=${cand.eap} cronoParents=[${cronoParents.join(";")}] score=${score}`);
                if (!bestMatch || score > bestMatch.score) bestMatch = {id: cand.id, score, eap: cand.eap};
              }
              if (bestMatch && bestMatch.score > 0) {
                atividadeId = bestMatch.id;
                usedAtividades.add(atividadeId);
                console.log(`[recalcularMedicao] → BEST: eap=${bestMatch.eap} ativId=${atividadeId} score=${bestMatch.score}`);
              } else {
                console.log(`[recalcularMedicao] → NO MATCH (best score=0 or no candidates left)`);
              }
            }
            if (atividadeId) {
              await db.update(terceiroContratoItens).set({ planejamentoAtividadeId: atividadeId }).where(eq(terceiroContratoItens.id, itemContrato.id));
            }
          }
        }
        if (!atividadeId) {
          console.log(`[recalcularMedicao] Item sem link: id=${itemContrato.id} eap=${(itemContrato as any).eapCodigo || "NULL"} desc="${itemContrato.descricao}"`);
        }

        let percentualFisico = n(itemContrato.percentualMedidoAcumulado);
        if (atividadeId) {
          const avPct = avancoMap[atividadeId];
          if (avPct !== undefined) {
            percentualFisico = avPct;
          } else {
            const [av] = await db.select().from(planejamentoAvancos)
              .where(eq(planejamentoAvancos.atividadeId, atividadeId))
              .orderBy(desc(planejamentoAvancos.semana)).limit(1);
            if (av) percentualFisico = n(av.percentualAcumulado);
          }
        }
        console.log(`[recalcularMedicao] Item "${itemContrato.descricao}" ativId=${atividadeId} → ${percentualFisico}% valorTotal=${itemContrato.valorTotal} valorUnit=${itemContrato.valorUnitario} qtd=${itemContrato.quantidade}`);

        const percentualAnterior = percAcumAnteriorPorItem[itemContrato.id] || 0;
        // Rev. 4800 — o cronograma NÃO escreve mais o medido (pedido do usuário:
        // "o valor do cronograma não pode vir na medição, tem que ser apenas
        // consultivo"). O medido oficial vem do LEVANTAMENTO DE CAMPO ou da
        // digitação manual; aqui só recalculamos os TOTAIS a partir do que já
        // está na planilha e gravamos o avanço da obra como referência.
        const percentualPeriodo = n(itemMed.percentualMedidoPeriodo);
        const valorPeriodo = n(itemMed.valorMedidoPeriodo) || (percentualPeriodo / 100) * n(itemContrato.valorTotal);
        const medidoAcum = percentualAnterior + percentualPeriodo;
        const valorAcumuladoItem = (medidoAcum / 100) * n(itemContrato.valorTotal);
        valorMedidoPeriodo += valorPeriodo;
        // Rev. 4829 — avanço global da obra ponderado pelo valor dos itens vinculados
        if (atividadeId) { somaAvancoPonderado += percentualFisico * n(itemContrato.valorTotal); somaPesoAvanco += n(itemContrato.valorTotal); }
        const eapC = (itemContrato as any).eapCodigo as string | null;
        const medidoCliente = (atividadeId != null && medidoClienteByAtiv[atividadeId] !== undefined)
          ? medidoClienteByAtiv[atividadeId]
          : (eapC && medidoClienteByEap[eapC] !== undefined ? medidoClienteByEap[eapC] : null);
        itensResultado.push({
          descricao: itemContrato.descricao,
          eapCodigo: eapC || null,
          vinculado: !!atividadeId,
          percentual: percentualFisico,
          medidoAcum: Math.round(medidoAcum * 10) / 10,
          avancoObra: atividadeId ? Math.round(percentualFisico * 10) / 10 : null,
          medidoCliente: medidoCliente !== null ? Math.round(medidoCliente * 10) / 10 : null,
        });

        await db.update(terceiroMedicaoItens).set({
          // consultivo: avanço da obra fica gravado só como referência visual
          percentualAvancoFisico: String(percentualFisico),
          percentualFisicoReal: String(percentualFisico),
          percentualAcumuladoAnterior: String(percentualAnterior),
          valorAcumulado: String(valorAcumuladoItem),
        } as any).where(eq(terceiroMedicaoItens.id, itemMed.id));

        // Cruzamento medido × avanço da obra (só p/ itens vinculados com avanço)
        if (atividadeId && (percentualFisico > 0 || medidoAcum > 0)) {
          const diff = medidoAcum - percentualFisico;
          if (Math.abs(diff) > TOLERANCIA_PCT) {
            divergencias.push({
              descricao: itemContrato.descricao || `Item #${itemContrato.id}`,
              medidoAcum: Math.round(medidoAcum * 10) / 10,
              avancoObra: Math.round(percentualFisico * 10) / 10,
              tipo: diff > 0 ? "acima" : "abaixo",
            });
          }
        }
      }

      // Rev. 4804 — BUGFIX: recalcular NÃO grava mais o acumulado nos ITENS DO
      // CONTRATO. Essas colunas só podem refletir medições APROVADAS/PAGAS
      // (quem escreve é aprovar/cancelarAprovacao/excluir). Antes, recalcular um
      // RASCUNHO já "consolidava" o medido no contrato; se o rascunho fosse
      // excluído, a reversão era pulada (status ≠ aprovada) e o contrato ficava
      // com "Medido Acumulado"/"Saldo a Liberar" fantasma sem nenhuma medição.

      const valorAcumuladoAnterior = outrasMedicoes
        .filter(m => m.status === "aprovada" || m.status === "paga")
        .reduce((s, m) => s + n(m.valorMedido), 0);
      const valorAcumulado = valorAcumuladoAnterior + valorMedidoPeriodo;
      const percentualGlobal = n(contrato.valorTotal) > 0 ? (valorAcumulado / n(contrato.valorTotal)) * 100 : 0;

      // Rev. 4800 — grava o RESULTADO do comparativo (consultivo, não bloqueia)
      const acima = divergencias.filter(d => d.tipo === "acima");
      const abaixo = divergencias.filter(d => d.tipo === "abaixo");
      let alertaTexto: string | null = null;
      if (divergencias.length > 0) {
        const partes: string[] = [];
        if (acima.length > 0) partes.push(`${acima.length} item(ns) com medido ACIMA do avanço da obra (ex.: ${acima[0].descricao}: medido ${acima[0].medidoAcum}% × obra ${acima[0].avancoObra}%)`);
        if (abaixo.length > 0) partes.push(`${abaixo.length} item(ns) com medido ABAIXO do avanço da obra (ex.: ${abaixo[0].descricao}: medido ${abaixo[0].medidoAcum}% × obra ${abaixo[0].avancoObra}%)`);
        alertaTexto = `Comparativo com o avanço da obra: ${partes.join("; ")}.`;
      }

      await db.update(terceiroMedicoes).set({
        valorMedido: String(valorMedidoPeriodo),
        valorAcumulado: String(valorAcumulado),
        percentualGlobal: String(percentualGlobal),
        alertaDivergencia: alertaTexto,
      } as any).where(eq(terceiroMedicoes.id, input.medicaoId));

      // Rev. 4799 — com o valor medido atualizado, completa (top-up) o desconto
      // automático de FD pendente do contrato até o teto do período.
      try { await _puxarFdAutomatico(db, contrato, input.medicaoId, null); }
      catch (e: any) { console.warn("[recalcularMedicao] Auto-FD falhou:", e?.message); }

      const vinculados = itensResultado.filter(i => i.vinculado).length;
      const naoVinculados = itensResultado.filter(i => !i.vinculado).length;
      const avancoObraGlobal = somaPesoAvanco > 0 ? somaAvancoPonderado / somaPesoAvanco : 0;
      const temMedicaoCliente = Object.keys(medidoClienteByAtiv).length > 0 || Object.keys(medidoClienteByEap).length > 0;
      return { ok: true, valorMedido: valorMedidoPeriodo, percentualGlobal, avancoObraGlobal, temMedicaoCliente, itens: itensResultado, vinculados, naoVinculados, divergencias, alertaDivergencia: alertaTexto, totalEaps: Object.keys(eapToAtividadeId).length, totalAvancos: Object.keys(avancoMap).length };
    }),

  editarMedicao: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      periodo: z.string().optional(),
      dataReferencia: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      status: z.enum(["rascunho", "aguardando_aprovacao"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(
        and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId))
      );
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "paga") throw new Error("Não é possível editar uma medição já paga");

      const upd: any = { atualizadoEm: new Date().toISOString() };
      if (input.periodo !== undefined) upd.periodo = input.periodo;
      if (input.dataReferencia !== undefined) upd.dataReferencia = input.dataReferencia;
      if (input.observacoes !== undefined) upd.observacoes = input.observacoes;
      if (input.status !== undefined) {
        upd.status = input.status;
        if (input.status === "rascunho") {
          upd.aprovadoPor = null;
          upd.aprovadoEm = null;
        }
      }

      const [updated] = await db.update(terceiroMedicoes).set(upd).where(eq(terceiroMedicoes.id, input.id)).returning();
      return updated;
    }),

  registrarPagamento: protectedProcedure
    .input(z.object({ medicaoId: z.number(), contratoId: z.number(), valor: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(terceiroMedicoes)
        .set({ status: "paga", atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroMedicoes.id, input.medicaoId));
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      const novoValorPago = n(contrato?.valorPago) + input.valor;
      const [c] = await db.update(terceiroContratos)
        .set({ valorPago: String(novoValorPago), atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroContratos.id, input.contratoId))
        .returning();
      return c;
    }),

  editarMedicaoItem: protectedProcedure
    .input(z.object({
      medicaoItemId: z.number(),
      medicaoId: z.number(),
      companyId: z.number(),
      // Lançamento manual (Task #86): aceita % do período OU o valor medido em BRL.
      // Quando valorMedidoPeriodo é informado, o % é derivado do valorTotal do item.
      percentualMedidoPeriodo: z.number().optional(),
      valorMedidoPeriodo: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [medicao] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "paga") throw new Error("Não é possível editar itens de uma medição já paga");

      const [item] = await db.select().from(terceiroMedicaoItens).where(and(eq(terceiroMedicaoItens.id, input.medicaoItemId), eq(terceiroMedicaoItens.medicaoId, input.medicaoId)));
      if (!item) throw new Error("Item da medição não encontrado");

      const [contratoItem] = await db.select().from(terceiroContratoItens).where(and(eq(terceiroContratoItens.id, item.contratoItemId), eq(terceiroContratoItens.companyId, input.companyId)));
      if (!contratoItem) throw new Error("Item do contrato não encontrado");

      const percentualAnterior = n(item.percentualAcumuladoAnterior);
      // Resolve o % do período: se veio valor em BRL, deriva do valorTotal do item; senão usa o % informado.
      const valorTotalItemEdit = n(contratoItem.valorTotal);
      const percentualInformado = input.valorMedidoPeriodo !== undefined
        ? (valorTotalItemEdit > 0 ? (input.valorMedidoPeriodo / valorTotalItemEdit) * 100 : 0)
        : (input.percentualMedidoPeriodo ?? 0);
      const novoPercentualPeriodo = Math.max(0, Math.min(100 - percentualAnterior, percentualInformado));
      const novoPercentualFisico = percentualAnterior + novoPercentualPeriodo;
      const novoValorPeriodo = (novoPercentualPeriodo / 100) * n(contratoItem.valorTotal);
      const novoValorAcumulado = (novoPercentualFisico / 100) * n(contratoItem.valorTotal);
      const novoValorMatPeriodo = (novoPercentualPeriodo / 100) * n((contratoItem as any).vlrMat ?? "0");
      const novoValorMdoPeriodo = (novoPercentualPeriodo / 100) * n((contratoItem as any).vlrMdo ?? "0");
      const novoValorMatAcumulado = (novoPercentualFisico / 100) * n((contratoItem as any).vlrMat ?? "0");
      const novoValorMdoAcumulado = (novoPercentualFisico / 100) * n((contratoItem as any).vlrMdo ?? "0");

      const percentualFisicoRealAntes = n(item.percentualFisicoReal ?? item.percentualAvancoFisico);
      const fisicoRealPeriodo = Math.max(0, percentualFisicoRealAntes - percentualAnterior);
      const editadoManualmente = Math.abs(novoPercentualPeriodo - fisicoRealPeriodo) > 0.01;

      await db.update(terceiroMedicaoItens).set({
        percentualMedidoPeriodo: String(novoPercentualPeriodo),
        percentualAvancoFisico: String(novoPercentualFisico),
        valorMedidoPeriodo: String(novoValorPeriodo),
        valorAcumulado: String(novoValorAcumulado),
        valorMatPeriodo: String(novoValorMatPeriodo),
        valorMdoPeriodo: String(novoValorMdoPeriodo),
        valorMatAcumulado: String(novoValorMatAcumulado),
        valorMdoAcumulado: String(novoValorMdoAcumulado),
        editadoManualmente: editadoManualmente,
        percentualFisicoReal: item.percentualFisicoReal ?? String(n(item.percentualAvancoFisico)),
      } as any).where(eq(terceiroMedicaoItens.id, input.medicaoItemId));

      const todosItens = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.medicaoId));
      const novoValorMedido = todosItens.reduce((s, i) => s + (i.id === input.medicaoItemId ? novoValorPeriodo : n(i.valorMedidoPeriodo)), 0);
      const medicoesAprovadas = (await db.select().from(terceiroMedicoes)
        .where(and(eq(terceiroMedicoes.contratoId, medicao.contratoId), eq(terceiroMedicoes.companyId, input.companyId), inArray(terceiroMedicoes.status, ["aprovada", "paga"]))))
        .reduce((s, m) => s + (m.id === input.medicaoId ? 0 : n(m.valorMedido)), 0);
      const novoValorAcumuladoMedicao = medicoesAprovadas + novoValorMedido;
      const [contrato] = await db.select().from(terceiroContratos).where(and(eq(terceiroContratos.id, medicao.contratoId), eq(terceiroContratos.companyId, input.companyId)));
      const novoPercentualGlobal = n(contrato?.valorTotal) > 0 ? (novoValorAcumuladoMedicao / n(contrato.valorTotal)) * 100 : 0;

      const todosItensAtualizado = todosItens.map(i => i.id === input.medicaoItemId ? { ...i, editadoManualmente, percentualMedidoPeriodo: String(novoPercentualPeriodo), percentualFisicoReal: item.percentualFisicoReal ?? String(n(item.percentualAvancoFisico)) } : i);
      const itensDivergentes = todosItensAtualizado.filter(i => {
        const realPerc = n(i.percentualFisicoReal);
        const anterior = n(i.percentualAcumuladoAnterior);
        const realPeriodo = Math.max(0, realPerc - anterior);
        const medidoPeriodo = n(i.percentualMedidoPeriodo);
        return i.editadoManualmente && Math.abs(medidoPeriodo - realPeriodo) > 0.01 && medidoPeriodo > realPeriodo;
      });

      const alertaDivergencia = itensDivergentes.length > 0
        ? `⚠ ${itensDivergentes.length} item(ns) com % de avanço superior ao avanço físico real do cronograma. Alteração manual em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
        : null;

      await db.update(terceiroMedicoes).set({
        valorMedido: String(novoValorMedido),
        valorAcumulado: String(novoValorAcumuladoMedicao),
        percentualGlobal: String(novoPercentualGlobal),
        alertaDivergencia: alertaDivergencia,
        atualizadoEm: new Date().toISOString(),
      } as any).where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));

      // Rev. 4827 — medido mudou → completa o desconto automático de FD
      // pendente do contrato (o usuário não precisa clicar em nada).
      if (contrato) {
        try { await _puxarFdAutomatico(db, contrato, input.medicaoId, null); }
        catch (e: any) { console.warn("[atualizarMedicaoItem] Auto-FD falhou:", e?.message); }
      }

      if (medicao.status === "aprovada") {
        const todasMedicoesAprovadas = await db.select().from(terceiroMedicoes)
          .where(and(eq(terceiroMedicoes.contratoId, medicao.contratoId), eq(terceiroMedicoes.companyId, input.companyId), inArray(terceiroMedicoes.status, ["aprovada", "paga"])));
        const todasMedicaoIds = todasMedicoesAprovadas.map(m => m.id);
        const todosItensAprovados = todasMedicaoIds.length > 0
          ? await db.select().from(terceiroMedicaoItens).where(inArray(terceiroMedicaoItens.medicaoId, todasMedicaoIds))
          : [];

        const contratoItemIds = new Set(todosItens.map(i => i.contratoItemId));
        for (const ciId of contratoItemIds) {
          const somaPercPeriodo = todosItensAprovados
            .filter(i => i.contratoItemId === ciId)
            .reduce((s, i) => s + (i.id === input.medicaoItemId ? novoPercentualPeriodo : n(i.percentualMedidoPeriodo)), 0);
          const somaValorPeriodo = todosItensAprovados
            .filter(i => i.contratoItemId === ciId)
            .reduce((s, i) => s + (i.id === input.medicaoItemId ? novoValorPeriodo : n(i.valorMedidoPeriodo)), 0);

          await db.update(terceiroContratoItens)
            .set({ percentualMedidoAcumulado: String(somaPercPeriodo), valorMedidoAcumulado: String(somaValorPeriodo) })
            .where(and(eq(terceiroContratoItens.id, ciId), eq(terceiroContratoItens.companyId, input.companyId)));
        }
      }

      return { ok: true, alertaDivergencia };
    }),

  salvarRetencoes: protectedProcedure
    .input(z.object({
      medicaoId: z.number(),
      companyId: z.number(),
      retencaoISS: z.number().default(0),
      retencaoINSS: z.number().default(0),
      retencaoIRRF: z.number().default(0),
      outrasRetencoes: z.number().default(0),
      retencaoTecnica: z.number().default(0),
      descontos: z.number().default(0),
      observacoesRetencao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "aprovada" || medicao.status === "paga") throw new Error("Não é possível editar retenções de uma medição já aprovada/paga");
      await db.update(terceiroMedicoes).set({
        retencaoISS: String(input.retencaoISS),
        retencaoINSS: String(input.retencaoINSS),
        retencaoIRRF: String(input.retencaoIRRF),
        outrasRetencoes: String(input.outrasRetencoes),
        retencaoTecnica: String(input.retencaoTecnica),
        descontos: String(input.descontos),
        observacoesRetencao: input.observacoesRetencao || null,
        atualizadoEm: new Date().toISOString(),
      } as any).where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
      return { ok: true };
    }),

  salvarRetencaoConfig: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      percISS: z.number().min(0).max(100).default(0),
      percINSS: z.number().min(0).max(100).default(0),
      percIRRF: z.number().min(0).max(100).default(0),
      percOutrasRetencoes: z.number().min(0).max(100).default(0),
      percRetencaoTecnica: z.number().min(0).max(100).default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId)));
      if (!contrato) throw new Error("Contrato não encontrado");
      await db.update(terceiroContratos).set({
        percISS: String(input.percISS),
        percINSS: String(input.percINSS),
        percIRRF: String(input.percIRRF),
        percOutrasRetencoes: String(input.percOutrasRetencoes),
        percRetencaoTecnica: String(input.percRetencaoTecnica),
        atualizadoEm: new Date().toISOString(),
      } as any).where(and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId)));
      return { ok: true };
    }),

  removerMedicaoItem: protectedProcedure
    .input(z.object({ medicaoItemId: z.number(), medicaoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // Rev. 4827 — tenancy guard (review): rota aceitava só ids → IDOR cross-tenant.
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [medicao] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "aprovada" || medicao.status === "paga") throw new Error("Não é possível remover itens de uma medição já aprovada/paga");

      await db.delete(terceiroMedicaoItens).where(and(eq(terceiroMedicaoItens.id, input.medicaoItemId), eq(terceiroMedicaoItens.medicaoId, input.medicaoId)));

      const todosItens = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.medicaoId));
      const novoValorMedido = todosItens.reduce((s, i) => s + n(i.valorMedidoPeriodo), 0);
      const medicoesAprovadas = (await db.select().from(terceiroMedicoes)
        .where(and(eq(terceiroMedicoes.contratoId, medicao.contratoId), inArray(terceiroMedicoes.status, ["aprovada", "paga"]))))
        .reduce((s, m) => s + n(m.valorMedido), 0);
      const novoValorAcumuladoMedicao = medicoesAprovadas + novoValorMedido;
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, medicao.contratoId));
      const novoPercentualGlobal = n(contrato?.valorTotal) > 0 ? (novoValorAcumuladoMedicao / n(contrato.valorTotal)) * 100 : 0;

      await db.update(terceiroMedicoes).set({
        valorMedido: String(novoValorMedido),
        valorAcumulado: String(novoValorAcumuladoMedicao),
        percentualGlobal: String(novoPercentualGlobal),
        atualizadoEm: new Date().toISOString(),
      }).where(eq(terceiroMedicoes.id, input.medicaoId));

      // Rev. 4827 — top-up automático do FD após mudança no medido
      if (contrato) {
        try { await _puxarFdAutomatico(db, contrato, input.medicaoId, null); }
        catch (e: any) { console.warn("[removerMedicaoItem] Auto-FD falhou:", e?.message); }
      }

      return { ok: true, restantes: todosItens.length };
    }),

  historicoMedicaoItem: protectedProcedure
    .input(z.object({ contratoId: z.number(), contratoItemId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const medicoes = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.contratoId, input.contratoId))
        .orderBy(asc(terceiroMedicoes.numero));
      const result: any[] = [];
      for (const m of medicoes) {
        const [item] = await db.select().from(terceiroMedicaoItens)
          .where(and(eq(terceiroMedicaoItens.medicaoId, m.id), eq(terceiroMedicaoItens.contratoItemId, input.contratoItemId)));
        if (item) {
          result.push({
            medicaoId: m.id,
            numero: m.numero,
            periodo: m.periodo,
            status: m.status,
            percentualPeriodo: n(item.percentualMedidoPeriodo),
            percentualAcumulado: n(item.percentualAcumuladoAnterior) + n(item.percentualMedidoPeriodo), // Rev. 4800 — acumulado MEDIDO
            valorPeriodo: n(item.valorMedidoPeriodo),
            valorAcumulado: n(item.valorAcumulado),
          });
        }
      }
      return result;
    }),

  // ── DOCUMENTOS ────────────────────────────────────────────

  listarDocumentos: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(terceiroDocumentos)
        .where(eq(terceiroDocumentos.contratoId, input.contratoId))
        .orderBy(desc(terceiroDocumentos.criadoEm));
    }),

  criarDocumento: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      companyId: z.number(),
      empresaTerceiraId: z.number(),
      tipo: z.string(),
      descricao: z.string().optional(),
      competencia: z.string().optional(),
      dataVencimento: z.string().optional(),
      bloqueiaPagemento: z.boolean().default(false),
      enviadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [doc] = await db.insert(terceiroDocumentos).values({
        contratoId: input.contratoId,
        companyId: input.companyId,
        empresaTerceiraId: input.empresaTerceiraId,
        tipo: input.tipo,
        descricao: input.descricao ?? null,
        competencia: input.competencia ?? null,
        dataVencimento: input.dataVencimento ?? null,
        bloqueiaPagemento: input.bloqueiaPagemento,
        enviadoPor: input.enviadoPor ?? null,
        status: "pendente",
      } as any).returning();
      return doc;
    }),

  atualizarDocumento: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.string().optional(),
      url: z.string().optional(),
      validadoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const upd: any = { atualizadoEm: new Date().toISOString() };
      if (input.status) upd.status = input.status;
      if (input.url) upd.url = input.url;
      if (input.validadoPor) { upd.validadoPor = input.validadoPor; upd.validadoEm = new Date().toISOString(); }
      const [doc] = await db.update(terceiroDocumentos).set(upd).where(eq(terceiroDocumentos.id, input.id)).returning();
      return doc;
    }),

  // ── PREVISÃO DE CAIXA ─────────────────────────────────────

  previsaoCaixa: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      let contratos = await db.select().from(terceiroContratos)
        .where(and(
          eq(terceiroContratos.companyId, input.companyId),
          eq(terceiroContratos.status, "ativo")
        ));
      if (input.obraId) contratos = contratos.filter(c => c.obraId === input.obraId);
      if (!contratos.length) return { semanas: [], meses: [], totalPrevisto: 0, totalRealizado: 0, contratos: [] };

      const empresas = await db.select({ id: empresasTerceiras.id, nomeFantasia: empresasTerceiras.nomeFantasia, razaoSocial: empresasTerceiras.razaoSocial })
        .from(empresasTerceiras).where(eq(empresasTerceiras.companyId, input.companyId));
      const empMap: Record<number, string> = {};
      empresas.forEach(e => { empMap[e.id] = e.nomeFantasia || e.razaoSocial; });

      const contratosIds = contratos.map(c => c.id);
      const todosItens = await db.select().from(terceiroContratoItens)
        .where(inArray(terceiroContratoItens.contratoId, contratosIds));

      // Helper: get Monday of a given date
      function getMonday(d: Date): string {
        const day = d.getDay();
        const diff = (day + 6) % 7;
        const mon = new Date(d);
        mon.setDate(mon.getDate() - diff);
        return mon.toISOString().slice(0, 10);
      }

      // Helper: generate all Monday keys between two dates
      function getWeeksBetween(start: Date, end: Date): string[] {
        const weeks: string[] = [];
        const cur = new Date(start);
        while (cur <= end) {
          const mon = getMonday(cur);
          if (!weeks.includes(mon)) weeks.push(mon);
          cur.setDate(cur.getDate() + 7);
        }
        const lastMon = getMonday(end);
        if (!weeks.includes(lastMon)) weeks.push(lastMon);
        return weeks;
      }

      // Resolve atividades from the LATEST revision of each projeto.
      // Cada contrato aponta para um projeto via planejamentoProjetoId OU, na ausência dele,
      // via obra → planejamento_projetos.obra_id (Rev. 2848). Da última revisão aprovada de
      // cada projeto montamos DOIS índices: por ID de atividade (atividadesMap) e por código
      // EAP (eapMapPorRev[revId][eap]) — este último é o FALLBACK quando o planejamentoAtividadeId
      // do item está órfão (cronograma reimportado) ou o contrato não tem projeto vinculado.
      const obraIds = [...new Set(contratos.map(c => c.obraId).filter(Boolean))] as number[];
      const projetoPorObra: Record<number, number> = {};
      if (obraIds.length > 0) {
        const projsObra = await db.select({ id: planejamentoProjetos.id, obraId: planejamentoProjetos.obraId })
          .from(planejamentoProjetos)
          .where(and(
            eq(planejamentoProjetos.companyId, input.companyId),
            inArray(planejamentoProjetos.obraId, obraIds),
          ))
          .orderBy(desc(planejamentoProjetos.id));
        for (const p of projsObra) {
          if (p.obraId != null && projetoPorObra[p.obraId] == null) projetoPorObra[p.obraId] = p.id;
        }
      }

      // Projeto efetivo de cada contrato: link direto OU via obra
      const projetoDoContrato: Record<number, number | null> = {};
      for (const c of contratos) {
        projetoDoContrato[c.id] = (c.planejamentoProjetoId as number | null)
          ?? (c.obraId != null ? (projetoPorObra[c.obraId] ?? null) : null);
      }

      const projetoIds = [...new Set(Object.values(projetoDoContrato).filter((v): v is number => typeof v === "number"))];
      let atividadesMap: Record<number, { dataInicio: string; dataFim: string }> = {};
      const eapMapPorRev: Record<number, Record<string, { dataInicio: string; dataFim: string }>> = {};
      const latestRevPerProject: Record<number, number> = {};

      if (projetoIds.length > 0) {
        // Última revisão aprovada por projeto
        const allRevs = await db.select({ id: planejamentoRevisoes.id, projetoId: planejamentoRevisoes.projetoId, numero: planejamentoRevisoes.numero })
          .from(planejamentoRevisoes)
          .where(and(
            inArray(planejamentoRevisoes.projetoId, projetoIds),
            eq(planejamentoRevisoes.status, "aprovada"),
          ))
          .orderBy(desc(planejamentoRevisoes.numero));

        for (const rev of allRevs) {
          if (!latestRevPerProject[rev.projetoId]) latestRevPerProject[rev.projetoId] = rev.id;
        }
        const revIds = Object.values(latestRevPerProject);

        if (revIds.length > 0) {
          const atividades = await db.select({
            id: planejamentoAtividades.id,
            eapCodigo: planejamentoAtividades.eapCodigo,
            dataInicio: planejamentoAtividades.dataInicio,
            dataFim: planejamentoAtividades.dataFim,
            revisaoId: planejamentoAtividades.revisaoId,
            isGrupo: planejamentoAtividades.isGrupo,
            disabled: planejamentoAtividades.disabled,
          }).from(planejamentoAtividades)
            .where(and(
              inArray(planejamentoAtividades.revisaoId, revIds),
              eq(planejamentoAtividades.disabled, false),
            ))
            // ordenação determinística: "primeira folha com data ganha" no eapMap precisa ser estável
            .orderBy(asc(planejamentoAtividades.ordem), asc(planejamentoAtividades.id));

          for (const a of atividades) {
            if (a.dataInicio && a.dataFim && !a.isGrupo) {
              atividadesMap[a.id] = { dataInicio: a.dataInicio, dataFim: a.dataFim };
              if (a.eapCodigo && a.revisaoId != null) {
                if (!eapMapPorRev[a.revisaoId]) eapMapPorRev[a.revisaoId] = {};
                // primeira atividade-folha com data ganha (EAP costuma ser único por revisão)
                if (!eapMapPorRev[a.revisaoId][a.eapCodigo]) {
                  eapMapPorRev[a.revisaoId][a.eapCodigo] = { dataInicio: a.dataInicio, dataFim: a.dataFim };
                }
              }
            }
          }
        }
      }

      // Also load atividades directly linked by ID (fallback for items with planejamentoAtividadeId set)
      const directAtivIds = todosItens.filter(i => i.planejamentoAtividadeId && !atividadesMap[i.planejamentoAtividadeId]).map(i => i.planejamentoAtividadeId!);
      if (directAtivIds.length > 0) {
        const directAtivs = await db.select({
          id: planejamentoAtividades.id,
          dataInicio: planejamentoAtividades.dataInicio,
          dataFim: planejamentoAtividades.dataFim,
          isGrupo: planejamentoAtividades.isGrupo,
        }).from(planejamentoAtividades)
          .where(inArray(planejamentoAtividades.id, directAtivIds));
        for (const a of directAtivs) {
          if (a.dataInicio && a.dataFim && !a.isGrupo) {
            atividadesMap[a.id] = { dataInicio: a.dataInicio, dataFim: a.dataFim };
          }
        }
      }

      // Resolve a janela de datas de um item: 1) ID direto da atividade; 2) FALLBACK por EAP
      // (obra/projeto → última revisão aprovada → casa eap_codigo). Cobre itens órfãos ou
      // contratos sem projeto vinculado sem precisar revincular item a item (Rev. 2848).
      function resolverAtividadeItem(item: typeof todosItens[number]): { dataInicio: string; dataFim: string } | null {
        if (item.planejamentoAtividadeId && atividadesMap[item.planejamentoAtividadeId]) {
          return atividadesMap[item.planejamentoAtividadeId];
        }
        const projId = projetoDoContrato[item.contratoId];
        if (projId == null) return null;
        const revId = latestRevPerProject[projId];
        if (!revId) return null;
        const eap = (item.eapCodigo as string | null) || null;
        if (eap && eapMapPorRev[revId]?.[eap]) return eapMapPorRev[revId][eap];
        return null;
      }

      // Helper: generate all month keys (YYYY-MM) between two dates, inclusive
      function getMonthsBetween(start: Date, end: Date): string[] {
        const months: string[] = [];
        let y = start.getFullYear();
        let m = start.getMonth();
        const ey = end.getFullYear();
        const em = end.getMonth();
        while (y < ey || (y === ey && m <= em)) {
          months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
          m++;
          if (m > 11) { m = 0; y++; }
        }
        return months;
      }

      // Mapa de contratos p/ enriquecer o detalhamento (drill-down do histórico)
      const contratoMap: Record<number, { descricao: string; empresaNome: string }> = {};
      for (const c of contratos) {
        contratoMap[c.id] = {
          descricao: c.descricao || `Contrato #${c.id}`,
          empresaNome: empMap[c.empresaTerceiraId] || "—",
        };
      }

      // PREVISTO: distribute item value across weeks (chart) AND months (análise) between dataInicio/dataFim
      const semanasMapPrev: Record<string, number> = {};
      const mesesMapPrev: Record<string, number> = {};
      // previstoDetalhe[mes][contratoId] = { contratoDescricao, empresaNome, valor }
      const previstoDetalhe: Record<string, Record<number, { contratoDescricao: string; empresaNome: string; valor: number }>> = {};
      for (const item of todosItens) {
        const ativ = resolverAtividadeItem(item);
        if (!ativ) continue;

        const inicio = new Date(ativ.dataInicio + "T12:00:00");
        const fim = new Date(ativ.dataFim + "T12:00:00");
        if (fim < inicio) continue;

        const weeks = getWeeksBetween(inicio, fim);
        if (weeks.length > 0) {
          const valorPorSemana = n(item.valorTotal) / weeks.length;
          for (const sem of weeks) {
            semanasMapPrev[sem] = (semanasMapPrev[sem] || 0) + valorPorSemana;
          }
        }

        const meses = getMonthsBetween(inicio, fim);
        if (meses.length > 0) {
          const valorPorMes = n(item.valorTotal) / meses.length;
          const ctr = contratoMap[item.contratoId];
          for (const mes of meses) {
            mesesMapPrev[mes] = (mesesMapPrev[mes] || 0) + valorPorMes;
            if (!previstoDetalhe[mes]) previstoDetalhe[mes] = {};
            if (!previstoDetalhe[mes][item.contratoId]) {
              previstoDetalhe[mes][item.contratoId] = {
                contratoDescricao: ctr?.descricao || `Contrato #${item.contratoId}`,
                empresaNome: ctr?.empresaNome || "—",
                valor: 0,
              };
            }
            previstoDetalhe[mes][item.contratoId].valor += valorPorMes;
          }
        }
      }

      // REALIZADO: usa medições do contrato (todas exceto cancelada/rejeitada)
      const semanasMapReal: Record<string, number> = {};
      const mesesMapReal: Record<string, number> = {};
      // realizadoDetalhe[mes] = lista de medições (histórico clicável)
      const realizadoDetalhe: Record<string, Array<{ id: number; numero: number; contratoDescricao: string; empresaNome: string; valor: number; periodo: string; dataReferencia: string | null; status: string }>> = {};
      let totalRealizado = 0;
      if (contratosIds.length > 0) {
        const todasMedicoes = await db.select().from(terceiroMedicoes)
          .where(and(
            eq(terceiroMedicoes.companyId, input.companyId),
            inArray(terceiroMedicoes.contratoId, contratosIds),
          ));
        const medicoesValidas = todasMedicoes.filter(m => m.status !== "cancelada" && m.status !== "rejeitada");

        for (const med of medicoesValidas) {
          const valorMed = n(med.valorMedido);
          if (valorMed <= 0) continue;
          totalRealizado += valorMed;

          const refDate = med.aprovadoEm ? new Date(med.aprovadoEm) : new Date(med.criadoEm);
          const semanaKey = getMonday(refDate);
          semanasMapReal[semanaKey] = (semanasMapReal[semanaKey] || 0) + valorMed;

          // Mês do realizado = periodo (YYYY-MM) da medição (verdade contábil); fallback p/ refDate
          const mesKey = (med.periodo && /^\d{4}-\d{2}$/.test(med.periodo))
            ? med.periodo
            : `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}`;
          mesesMapReal[mesKey] = (mesesMapReal[mesKey] || 0) + valorMed;
          const ctr = contratoMap[med.contratoId];
          if (!realizadoDetalhe[mesKey]) realizadoDetalhe[mesKey] = [];
          realizadoDetalhe[mesKey].push({
            id: med.id,
            numero: med.numero ?? 1,
            contratoDescricao: ctr?.descricao || `Contrato #${med.contratoId}`,
            empresaNome: ctr?.empresaNome || "—",
            valor: valorMed,
            periodo: med.periodo,
            dataReferencia: med.dataReferencia ?? null,
            status: med.status || "—",
          });
        }
      }

      const allSemanas = new Set([...Object.keys(semanasMapPrev), ...Object.keys(semanasMapReal)]);
      const semanas = [...allSemanas]
        .sort()
        .map(semana => ({
          semana,
          previsto: semanasMapPrev[semana] || 0,
          realizado: semanasMapReal[semana] || 0,
        }));

      const totalPrevisto = semanas.reduce((s, w) => s + w.previsto, 0);

      // Agregação MENSAL (mês a mês / ano a ano) + detalhe p/ drill-down clicável
      const allMeses = new Set([...Object.keys(mesesMapPrev), ...Object.keys(mesesMapReal)]);
      const meses = [...allMeses]
        .sort()
        .map(mes => ({
          mes,
          previsto: mesesMapPrev[mes] || 0,
          realizado: mesesMapReal[mes] || 0,
          previstoDetalhe: Object.values(previstoDetalhe[mes] || {}).sort((a, b) => b.valor - a.valor),
          realizadoDetalhe: (realizadoDetalhe[mes] || []).sort((a, b) => b.valor - a.valor),
        }));

      return {
        semanas,
        meses,
        totalPrevisto,
        totalRealizado,
        contratos: contratos.map(c => ({
          ...c,
          empresaNome: empMap[c.empresaTerceiraId] || "—",
          percentualPago: n(c.valorTotal) > 0 ? (n(c.valorPago) / n(c.valorTotal)) * 100 : 0,
        })),
      };
    }),

  // ── DASHBOARD ─────────────────────────────────────────────

  dashboardTerceiroContratos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const contratos = await db.select().from(terceiroContratos)
        .where(eq(terceiroContratos.companyId, input.companyId));

      const medicoes = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.companyId, input.companyId));

      const totalContratos = contratos.filter(c => c.status === "ativo").length;
      const valorTotalContratado = contratos.filter(c => c.status === "ativo").reduce((s, c) => s + n(c.valorTotal), 0);
      const valorTotalPago = contratos.filter(c => c.status === "ativo").reduce((s, c) => s + n(c.valorPago), 0);
      const medicoesAguardando = medicoes.filter(m => m.status === "aguardando_aprovacao").length;
      const medicoesAprovadas = medicoes.filter(m => m.status === "aprovada").length;
      const valorMedicoesAprovadas = medicoes.filter(m => m.status === "aprovada").reduce((s, m) => s + n(m.valorMedido), 0);

      return {
        totalContratos,
        valorTotalContratado,
        valorTotalPago,
        saldoALiberar: valorTotalContratado - valorTotalPago,
        medicoesAguardando,
        medicoesAprovadas,
        valorMedicoesAprovadas,
        percentualMedioExecucao: valorTotalContratado > 0 ? (valorTotalPago / valorTotalContratado) * 100 : 0,
      };
    }),

  // ──────────────────────────────────────────────────────────────
  // INTEGRAÇÃO COMPRAS → TERCEIROS
  // Gera contrato de serviço a partir de uma cotação aprovada,
  // vinculando (ou criando) a empresa terceira a partir do fornecedor.
  // ──────────────────────────────────────────────────────────────
  gerarContratoFromCotacao: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 1. Carregar cotação
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new Error("Cotação não encontrada");
      if ((cot as any).tipo !== "servico") throw new Error("Apenas cotações do tipo 'serviço' podem gerar contratos de terceiros");
      if ((cot as any).contratoTerceiroId) throw new Error("Esta cotação já gerou um contrato de serviço");

      const isPendente = cot.status === "pendente";

      // 2. Carregar itens
      const itens = await db.select().from(comprasCotacoesItens)
        .where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));

      // 3. Carregar fornecedor
      if (!cot.fornecedorId) throw new Error("A cotação não possui fornecedor vinculado");
      const [forn] = await db.select().from(fornecedores).where(eq(fornecedores.id, cot.fornecedorId));
      if (!forn) throw new Error("Fornecedor da cotação não encontrado");

      const fornParts = await db.select().from(comprasCotacaoFornecedores).where(
        and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, cot.fornecedorId))
      );
      const fornInfoCheck = fornParts[0] ?? null;
      const condPag = (fornInfoCheck as any)?.condicaoPagamento ?? cot.condicaoPagamento;
      const formaPag = (fornInfoCheck as any)?.formaPagamento ?? (cot as any).formaPagamento;
      const prazoEntrega = (fornInfoCheck as any)?.prazoEntregaDias;
      const tipoPagCheck = (fornInfoCheck as any)?.tipoPagamento ?? "";
      const isMdoMedicao = (tipoPagCheck === "medicao" || (condPag ?? "").toLowerCase().includes("medição"));
      // Rev. 2074 — Pedido do usuário (IMG_0980): "Não tem prazo nem
      // endereço de entrega quando é mão de obra, arruma esta lógica".
      // Este endpoint só é chamado para cotações tipo='servico' (guard
      // logo acima). Para MDO puro não existe entrega física — espelha
      // Rev. 2073 (compras.ts). Mantemos dispensaPrazo composto pra
      // ficar consistente com a semântica usada em todos os fluxos.
      const isServicoPuro = (cot as any).tipo === "servico";
      const dispensaPrazo = isServicoPuro || isMdoMedicao;
      if (!condPag && !formaPag) throw new Error("Defina a Forma de Pagamento antes de aprovar. Edite as condições do vencedor na cotação.");
      if (!dispensaPrazo && (!prazoEntrega || Number(prazoEntrega) <= 0)) throw new Error("Defina o Prazo de Entrega antes de aprovar. Edite as condições do vencedor na cotação.");

      // 4. Find-or-create empresa terceira vinculada ao fornecedor
      const existing = await db.select().from(empresasTerceiras)
        .where(and(
          eq(empresasTerceiras.companyId, input.companyId),
          eq((empresasTerceiras as any).fornecedorId, forn.id),
        ));

      let empresaTerceiraId: number;
      let isNova = false;

      if (existing.length > 0) {
        empresaTerceiraId = existing[0].id;
      } else {
        const [nova] = await db.insert(empresasTerceiras).values({
          companyId: input.companyId,
          fornecedorId: forn.id,
          razaoSocial: upperCaseEmpresa(forn.razaoSocial),
          nomeFantasia: forn.nomeFantasia ? upperCaseEmpresa(forn.nomeFantasia) : null,
          cnpj: forn.cnpj || "",
          cep: forn.cep || null,
          logradouro: forn.endereco || null,
          numero: forn.numero || null,
          complemento: forn.complemento || null,
          bairro: forn.bairro || null,
          cidade: forn.cidade || null,
          estado: forn.estado || null,
          telefone: forn.telefone || null,
          email: forn.email || null,
          responsavelNome: forn.contatoNome || null,
          banco: forn.banco || null,
          agencia: forn.agencia || null,
          conta: forn.conta || null,
          pixChave: forn.pix || null,
          status: "ativa",
        } as any).returning();
        empresaTerceiraId = nova.id;
        isNova = true;
      }

      // 5. Consultar datas das atividades do cronograma (planejamento) vinculadas ao escopo contratado
      //    Início = primeira data_inicio das atividades contratadas
      //    Término = última data_fim das atividades contratadas
      //    Se não encontrar no cronograma, datas ficam null (preenchidas manualmente)
      let dataInicioContrato: string | null = null;
      let dataTerminoContrato: string | null = null;
      try {
        if (cot.obraId) {
          const scItemIds = itens.map(it => it.solicitacaoItemId).filter(Boolean) as number[];
          let eapCodes: string[] = [];
          if (scItemIds.length > 0) {
            const scItems = await db.select({
              eapCodigo: comprasSolicitacoesItens.eapCodigo,
            }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
            eapCodes = [...new Set(scItems.map(s => s.eapCodigo).filter(Boolean))] as string[];
          }

          let found = false;

          if (eapCodes.length > 0) {
            try {
              const cronoDates = await db.execute(sql`
                WITH latest_rev AS (
                  SELECT pr.id as rev_id, pp.id as proj_id
                  FROM planejamento_projetos pp
                  JOIN planejamento_revisoes pr ON pr.projeto_id = pp.id AND pr.status = 'aprovada'
                  WHERE pp.obra_id = ${cot.obraId}
                  ORDER BY pr.numero DESC
                  LIMIT 1
                )
                SELECT MIN(pa.data_inicio) as min_inicio, MAX(pa.data_fim) as max_fim
                FROM planejamento_atividades pa
                JOIN latest_rev lr ON pa.projeto_id = lr.proj_id AND pa.revisao_id = lr.rev_id
                WHERE pa.data_inicio IS NOT NULL
                  AND pa.disabled IS NOT TRUE
                  AND pa.eap_codigo IN (${sql.join(eapCodes.map(c => sql`${c}`), sql`, `)})
              `);
              const row = (cronoDates as any).rows?.[0];
              if (row?.min_inicio) {
                dataInicioContrato = String(row.min_inicio).slice(0, 10);
                found = true;
              }
              if (row?.max_fim) {
                dataTerminoContrato = String(row.max_fim).slice(0, 10);
                found = true;
              }
              if (found) console.log(`[gerarContratoFromCotacao] Datas via EAP cronograma (${eapCodes.length} códigos): ${dataInicioContrato} a ${dataTerminoContrato}`);
            } catch (eapErr) {
              console.warn("[gerarContratoFromCotacao] Erro na busca por EAP:", eapErr);
            }
          }

          if (!found) {
            try {
              const descricoes = itens
                .map(it => {
                  let d = it.descricao || "";
                  d = d.replace(/^\[[^\]]+\]\s*/, "").trim().toLowerCase();
                  return d;
                })
                .filter(d => d.length > 5);
              const uniqueDescricoes = [...new Set(descricoes)];

              if (uniqueDescricoes.length > 0) {
                const escapeLike = (s: string) => s.replace(/[%_\\]/g, c => "\\" + c);
                const likeClauses = uniqueDescricoes.map(d => sql`LOWER(pa.nome) LIKE ${"%" + escapeLike(d.slice(0, 40)) + "%"} ESCAPE '\\'`);
                const cronoDates = await db.execute(sql`
                  SELECT MIN(pa.data_inicio) as min_inicio, MAX(pa.data_fim) as max_fim
                  FROM planejamento_projetos pp
                  JOIN planejamento_revisoes pr ON pr.projeto_id = pp.id AND pr.status = 'aprovada'
                  JOIN planejamento_atividades pa ON pa.projeto_id = pp.id AND pa.revisao_id = pr.id
                  WHERE pp.obra_id = ${cot.obraId}
                    AND pa.data_inicio IS NOT NULL
                    AND pa.disabled IS NOT TRUE
                    AND (${sql.join(likeClauses, sql` OR `)})
                `);
                const row = (cronoDates as any).rows?.[0];
                if (row?.min_inicio) {
                  dataInicioContrato = String(row.min_inicio).slice(0, 10);
                  found = true;
                }
                if (row?.max_fim) {
                  dataTerminoContrato = String(row.max_fim).slice(0, 10);
                  found = true;
                }
                if (found) console.log(`[gerarContratoFromCotacao] Datas por descrição no cronograma: ${dataInicioContrato} a ${dataTerminoContrato}`);
              }
            } catch (descErr) {
              console.warn("[gerarContratoFromCotacao] Erro na busca por descrição:", descErr);
            }
          }

          if (!found) {
            console.log(`[gerarContratoFromCotacao] Obra ${cot.obraId} sem cronograma no planejamento — datas do contrato em branco`);
          }
        }
      } catch (e) {
        console.warn("[gerarContratoFromCotacao] Erro ao consultar datas do cronograma:", e);
      }

      // 6. Gerar número de contrato CT-AAAA-NNN
      const year = new Date().getFullYear();
      const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` })
        .from(terceiroContratos)
        .where(and(
          eq(terceiroContratos.companyId, input.companyId),
          sql`EXTRACT(YEAR FROM criado_em) = ${year}`,
        ));
      const seq = (Number(cnt) + 1).toString().padStart(3, "0");
      const numeroContrato = `CT-${year}-${seq}`;

      // 7. Criar contrato
      const valorTotal = parseFloat(String(cot.total || "0"));
      // Rev. 4832 — herda condição de pagamento padrão da obra (mesma regra do criarContrato).
      const herdadoCot = await _herdarCondicaoPagamentoDaObra(db, cot.obraId, input.companyId);
      const [contrato] = await db.insert(terceiroContratos).values({
        ...herdadoCot,
        companyId: input.companyId,
        empresaTerceiraId,
        obraId: cot.obraId || null,
        numeroContrato,
        descricao: cot.descricao || `Contrato gerado da cotação ${cot.numeroCotacao}`,
        tipoContrato: "empreitada_global",
        valorTotal: String(valorTotal),
        valorPago: "0",
        dataInicio: dataInicioContrato,
        dataTermino: dataTerminoContrato,
        status: "ativo",
        observacoes: `Gerado automaticamente da cotação ${cot.numeroCotacao}.${cot.condicaoPagamento ? ` Cond. pagamento: ${cot.condicaoPagamento}.` : ""}${(cot as any).modalidadeFd && (cot as any).modalidadeFd !== "normal" ? ` [FD ${(cot as any).fdPagador === "cliente" ? "Cliente" : "FC"}: R$ ${parseFloat((cot as any).fdValor || "0").toFixed(2)}]` : ""}`,
      }).returning();

      // 7. Criar itens do contrato a partir dos itens da cotação (com EAP do SC)
      if (itens.length > 0) {
        const respostas = await db.select({
          itemId: comprasCotacaoRespostas.itemId,
          precoUnitario: comprasCotacaoRespostas.precoUnitario,
          total: comprasCotacaoRespostas.total,
          quantidade: comprasCotacaoRespostas.quantidade,
          totalMat: (comprasCotacaoRespostas as any).totalMat,
          totalMdo: (comprasCotacaoRespostas as any).totalMdo,
        }).from(comprasCotacaoRespostas).where(
          and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, cot.fornecedorId!))
        );
        const respostaMap: Record<number, { precoUnitario: number; total: number; quantidade: number | null; totalMat: number; totalMdo: number }> = {};
        for (const r of respostas) {
          respostaMap[r.itemId] = {
            precoUnitario: parseFloat(String(r.precoUnitario || "0")),
            total: parseFloat(String(r.total || "0")),
            quantidade: r.quantidade ? parseFloat(String(r.quantidade)) : null,
            totalMat: parseFloat(String((r as any).totalMat || "0")),
            totalMdo: parseFloat(String((r as any).totalMdo || "0")),
          };
        }

        const scItemIds = itens.map(it => it.solicitacaoItemId).filter(Boolean) as number[];
        let scItemMap: Record<number, { eapCodigo: string | null; orcamentoItemId: number | null }> = {};
        if (scItemIds.length > 0) {
          const scItems = await db.select({
            id: comprasSolicitacoesItens.id,
            eapCodigo: comprasSolicitacoesItens.eapCodigo,
            orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
          }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
          for (const si of scItems) scItemMap[si.id] = { eapCodigo: si.eapCodigo, orcamentoItemId: si.orcamentoItemId };
        }

        let eapToAtividadeId: Record<string, number> = {};
        let nomeToAtividadeIdLocal: Record<string, number> = {};
        if (cot.obraId) {
          try {
            const [proj] = await db.select({ id: planejamentoProjetos.id })
              .from(planejamentoProjetos)
              .where(and(eq(planejamentoProjetos.companyId, input.companyId), eq(planejamentoProjetos.obraId, cot.obraId)))
              .orderBy(desc(planejamentoProjetos.id)).limit(1);
            if (proj) {
              const [rev] = await db.select({ id: planejamentoRevisoes.id })
                .from(planejamentoRevisoes)
                .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
                .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
              if (rev) {
                const atividades = await db.select({ id: planejamentoAtividades.id, eapCodigo: planejamentoAtividades.eapCodigo, nome: planejamentoAtividades.nome })
                  .from(planejamentoAtividades)
                  .where(and(eq(planejamentoAtividades.revisaoId, rev.id), eq(planejamentoAtividades.projetoId, proj.id), sql`${planejamentoAtividades.disabled} IS NOT TRUE`));
                for (const a of atividades) {
                  if (a.eapCodigo) eapToAtividadeId[a.eapCodigo] = a.id;
                  if (a.nome) {
                    const nn = a.nome.trim().toLowerCase();
                    if (!(nn in nomeToAtividadeIdLocal)) nomeToAtividadeIdLocal[nn] = a.id;
                  }
                }
              }
            }
          } catch {}
        }

        await db.insert(terceiroContratoItens).values(
          itens.map((it, idx) => {
            const scInfo = it.solicitacaoItemId ? scItemMap[it.solicitacaoItemId] : null;
            const eap = scInfo?.eapCodigo ?? null;
            const resp = respostaMap[it.id];
            const precoUnit = resp ? resp.precoUnitario : parseFloat(String(it.precoUnitario || "0"));
            const qty = parseFloat(String(it.quantidade || "1"));
            const totalItem = resp ? resp.total : (precoUnit * qty);
            return {
              contratoId: contrato.id,
              companyId: input.companyId,
              descricao: it.descricao,
              unidade: it.unidade || "vb",
              quantidade: String(qty),
              valorUnitario: String(precoUnit),
              valorTotal: String(totalItem),
              vlrMat: resp?.totalMat ? String(resp.totalMat.toFixed(2)) : null,
              vlrMdo: resp?.totalMdo ? String(resp.totalMdo.toFixed(2)) : null,
              eapCodigo: eap,
              orcamentoItemId: scInfo?.orcamentoItemId ?? null,
              planejamentoAtividadeId: eap && eapToAtividadeId[eap] ? eapToAtividadeId[eap] : (it.descricao && nomeToAtividadeIdLocal[it.descricao.trim().toLowerCase()] ? nomeToAtividadeIdLocal[it.descricao.trim().toLowerCase()] : null),
              ordem: idx,
            };
          })
        );
      }

      // 8. Marcar cotação como concluída (contrato gerado no módulo Terceiros)
      const cotUpdate: any = { contratoTerceiroId: contrato.id, status: "concluida" };
      if (isPendente) {
        cotUpdate.condicaoPagamento = "Medição conforme avanço físico";
      }
      await db.update(comprasCotacoes)
        .set(cotUpdate)
        .where(eq(comprasCotacoes.id, input.cotacaoId));

      if (cot.solicitacaoId) {
        await db.update(comprasSolicitacoes)
          .set({ status: "concluida", atualizadoEm: new Date().toISOString() })
          .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      return { contratoId: contrato.id, numeroContrato, empresaTerceiraId, isNova };
    }),

  reverterAprovacaoOS: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const userRole = (ctx.user as any)?.role;
      if (userRole !== "admin" && userRole !== "admin_master") {
        throw new Error("Apenas administradores podem reverter a aprovação de uma OS");
      }

      const db = await getDb();

      const [cot] = await db.select().from(comprasCotacoes).where(
        and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId))
      );
      if (!cot) throw new Error("Cotação não encontrada");
      if (cot.status !== "concluida") throw new Error("Só é possível reverter cotações com status 'concluída'");
      const contratoId = (cot as any).contratoTerceiroId;
      if (!contratoId) throw new Error("Cotação não possui contrato de serviço vinculado");

      const [contrato] = await db.select().from(terceiroContratos).where(
        and(eq(terceiroContratos.id, contratoId), eq(terceiroContratos.companyId, input.companyId))
      );
      if (!contrato) throw new Error("Contrato de serviço não encontrado ou não pertence a esta empresa");

      const medicoes = await db.select({ id: terceiroMedicoes.id, status: terceiroMedicoes.status })
        .from(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, contratoId));
      const temMedicaoPaga = medicoes.some(m => m.status === "paga");
      if (temMedicaoPaga) throw new Error("Não é possível reverter: o contrato possui medições já pagas");
      const temMedicaoAprovada = medicoes.some(m => m.status === "aprovada");
      if (temMedicaoAprovada) throw new Error("Não é possível reverter: o contrato possui medições aprovadas. Exclua-as primeiro.");

      for (const m of medicoes) {
        await db.delete(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, m.id));
      }
      await db.delete(terceiroMedicoes).where(eq(terceiroMedicoes.contratoId, contratoId));
      await db.delete(terceiroDocumentos).where(eq(terceiroDocumentos.contratoId, contratoId));
      await db.delete(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, contratoId));
      await db.delete(terceiroContratoRevisoes).where(eq(terceiroContratoRevisoes.contratoId, contratoId));
      await db.delete(terceiroContratos).where(eq(terceiroContratos.id, contratoId));

      await db.update(comprasCotacoes)
        .set({ status: "aprovada", contratoTerceiroId: null, atualizadoEm: new Date().toISOString() } as any)
        .where(eq(comprasCotacoes.id, input.cotacaoId));

      if (cot.solicitacaoId) {
        await db.update(comprasSolicitacoes)
          .set({ status: "concluida", atualizadoEm: new Date().toISOString() })
          .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // TEMPLATE DE CONTRATO
  // ══════════════════════════════════════════════════════════════

  getTemplate: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [tpl] = await db.select().from(terceiroContratoTemplates)
        .where(and(
          eq(terceiroContratoTemplates.companyId, input.companyId),
          eq(terceiroContratoTemplates.ativo, true)
        ))
        .orderBy(desc(terceiroContratoTemplates.versao))
        .limit(1);
      let comp: any = null;
      try {
        const rows = await db.select({
          razaoSocial: companies.razaoSocial,
          cnpj: companies.cnpj,
          logoUrl: companies.logoUrl,
          docRodapeTexto: companies.docRodapeTexto,
          docMarcaDaguaUrl: companies.docMarcaDaguaUrl,
          docMarcaDaguaOpacidade: companies.docMarcaDaguaOpacidade,
        }).from(companies).where(eq(companies.id, input.companyId));
        comp = rows[0] || null;
      } catch (e: any) {
        console.error("[getTemplate] Error fetching company:", e.message);
        const fallback = await db.execute(sql`SELECT "razaoSocial", "cnpj", "logoUrl", "doc_rodape_texto" as "docRodapeTexto", "doc_marca_dagua_url" as "docMarcaDaguaUrl", "doc_marca_dagua_opacidade" as "docMarcaDaguaOpacidade" FROM companies WHERE id = ${input.companyId} LIMIT 1`);
        comp = (fallback as any).rows?.[0] || null;
      }
      if (!tpl) return { id: 0, companyId: input.companyId, nome: "Contrato Padrão", texto: "", ativo: true, versao: 0, criadoEm: "", atualizadoEm: "", companyData: comp };
      return { ...tpl, companyData: comp };
    }),

  salvarTemplate: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      texto: z.string().min(1),
      id: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (input.id) {
        const [cur] = await db.select().from(terceiroContratoTemplates)
          .where(and(eq(terceiroContratoTemplates.id, input.id), eq(terceiroContratoTemplates.companyId, input.companyId)));
        if (!cur) throw new Error("Template não encontrado ou sem permissão");
        const versaoAtual = cur.versao ?? 1;
        const novaVersao = versaoAtual + 1;
        if (cur.texto) {
          await db.insert(terceiroTemplateRevisoes).values({
            templateId: input.id,
            companyId: cur.companyId,
            versao: versaoAtual,
            nome: cur.nome,
            texto: cur.texto,
            observacao: "Edição manual",
            criadoPor: ctx.user?.name ?? "sistema",
          });
        }
        await db.update(terceiroContratoTemplates)
          .set({ nome: input.nome, texto: input.texto, versao: novaVersao, atualizadoEm: new Date().toISOString() })
          .where(and(eq(terceiroContratoTemplates.id, input.id), eq(terceiroContratoTemplates.companyId, input.companyId)));
        return { id: input.id, versao: novaVersao };
      }
      await db.update(terceiroContratoTemplates)
        .set({ ativo: false })
        .where(eq(terceiroContratoTemplates.companyId, input.companyId));
      const [novo] = await db.insert(terceiroContratoTemplates)
        .values({ companyId: input.companyId, nome: input.nome, texto: input.texto, ativo: true, versao: 1 })
        .returning();
      return { id: novo.id, versao: 1 };
    }),

  listarTemplateRevisoes: protectedProcedure
    .input(z.object({ templateId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(terceiroTemplateRevisoes)
        .where(and(
          eq(terceiroTemplateRevisoes.templateId, input.templateId),
          eq(terceiroTemplateRevisoes.companyId, input.companyId)
        ))
        .orderBy(desc(terceiroTemplateRevisoes.versao));
    }),

  restaurarTemplateRevisao: protectedProcedure
    .input(z.object({ templateId: z.number(), revisaoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [rev] = await db.select().from(terceiroTemplateRevisoes)
        .where(and(
          eq(terceiroTemplateRevisoes.id, input.revisaoId),
          eq(terceiroTemplateRevisoes.companyId, input.companyId),
          eq(terceiroTemplateRevisoes.templateId, input.templateId)
        ));
      if (!rev) throw new Error("Revisão não encontrada ou sem permissão");

      const [cur] = await db.select().from(terceiroContratoTemplates)
        .where(and(eq(terceiroContratoTemplates.id, input.templateId), eq(terceiroContratoTemplates.companyId, input.companyId)));
      if (!cur) throw new Error("Template não encontrado ou sem permissão");
      const versaoAtual = cur.versao ?? 1;

      if (cur.texto) {
        await db.insert(terceiroTemplateRevisoes).values({
          templateId: input.templateId,
          companyId: cur.companyId,
          versao: versaoAtual,
          nome: cur.nome,
          texto: cur.texto,
          observacao: `Substituído ao restaurar versão ${rev.versao}`,
          criadoPor: ctx.user?.name ?? "sistema",
        });
      }

      const novaVersao = versaoAtual + 1;
      await db.update(terceiroContratoTemplates)
        .set({ nome: rev.nome, texto: rev.texto, versao: novaVersao, atualizadoEm: new Date().toISOString() })
        .where(and(eq(terceiroContratoTemplates.id, input.templateId), eq(terceiroContratoTemplates.companyId, input.companyId)));

      return { versao: novaVersao, texto: rev.texto, nome: rev.nome };
    }),

  salvarDocLayout: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      logoUrl: z.string().nullable().optional(),
      docRodapeTexto: z.string().nullable().optional(),
      docMarcaDaguaUrl: z.string().nullable().optional(),
      docMarcaDaguaOpacidade: z.number().min(0).max(1).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const setClauses: any[] = [];
      if (input.logoUrl !== undefined) setClauses.push(sql`"logoUrl" = ${input.logoUrl}`);
      if (input.docRodapeTexto !== undefined) setClauses.push(sql`"doc_rodape_texto" = ${input.docRodapeTexto}`);
      if (input.docMarcaDaguaUrl !== undefined) setClauses.push(sql`"doc_marca_dagua_url" = ${input.docMarcaDaguaUrl}`);
      if (input.docMarcaDaguaOpacidade !== undefined) setClauses.push(sql`"doc_marca_dagua_opacidade" = ${input.docMarcaDaguaOpacidade}`);
      if (setClauses.length > 0) {
        const setFragment = sql.join(setClauses, sql`, `);
        await db.execute(sql`UPDATE companies SET ${setFragment} WHERE id = ${input.companyId}`);
      }
      return { ok: true };
    }),

  gerarTextoContrato: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");

      let [template] = await db.select().from(terceiroContratoTemplates)
        .where(and(
          eq(terceiroContratoTemplates.companyId, contrato.companyId),
          eq(terceiroContratoTemplates.ativo, true)
        ))
        .orderBy(desc(terceiroContratoTemplates.versao))
        .limit(1);
      if (!template) {
        const defaultText = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS Nº {{NUMERO_CONTRATO}}

Pelo presente instrumento particular de contrato de prestação de serviços, as partes abaixo identificadas:

CONTRATANTE: {{CONTRATANTE_NOME}}, inscrita no CNPJ sob o nº {{CONTRATANTE_CNPJ}}, com sede em {{CONTRATANTE_ENDERECO}}, neste ato representada por {{CONTRATANTE_REPRESENTANTE}}.

CONTRATADA: {{CONTRATADA_NOME}}, inscrita no CNPJ sob o nº {{CONTRATADA_CNPJ}}, com sede em {{CONTRATADA_ENDERECO}}, neste ato representada por {{CONTRATADA_REPRESENTANTE}}, {{CONTRATADA_CARGO}}.

Têm entre si, justo e contratado, o seguinte:

CLÁUSULA PRIMEIRA – DO OBJETO

1.1 O presente contrato tem por objeto a prestação de serviços de {{DESCRICAO_OBJETO}}, a serem executados na obra {{OBRA_NOME}}, conforme escopo detalhado abaixo:

{{TABELA_ITENS}}

CLÁUSULA SEGUNDA – DO PRAZO

2.1 Os serviços deverão ser iniciados em {{DATA_INICIO}} e concluídos até {{DATA_TERMINO}}, salvo prorrogação por acordo escrito entre as partes.

2.2 As datas acima foram definidas com base na revisão do cronograma: {{REVISAO_CRONOGRAMA}}.

CLÁUSULA TERCEIRA – DO VALOR E FORMA DE PAGAMENTO

3.1 O valor total do presente contrato é de {{VALOR_TOTAL}}.

3.2 CRITÉRIOS DE MEDIÇÃO E PAGAMENTO — Os pagamentos serão processados conforme o fluxo obrigatório abaixo, cujos prazos são improrrogáveis salvo acordo formal entre as partes:

{{FLUXOGRAMA_PAGAMENTO}}

a) MEDIÇÃO FÍSICA (Dia {{DIA_MEDICAO}} de cada mês) — Levantamento e conferência do avanço físico dos serviços efetivamente executados, a ser realizado conjuntamente pelo gestor da obra e o representante da CONTRATADA no canteiro;

b) APROVAÇÃO DA MEDIÇÃO (Até {{PRAZO_APROVACAO}} dias úteis após a medição) — Análise e aprovação da medição pelo gestor do contrato da CONTRATANTE. A medição poderá ser aprovada total ou parcialmente, cabendo à CONTRATADA acatar os ajustes solicitados;

c) DOCUMENTAÇÃO COMPROBATÓRIA — Após aprovação da medição, a CONTRATADA deverá enviar obrigatoriamente: Nota Fiscal/Fatura, guias de recolhimento de INSS e FGTS quitadas, Certidão Negativa de Débitos Trabalhistas (CNDT), comprovante de seguro de vida dos funcionários alocados na obra e demais documentos que a CONTRATANTE julgar necessários. A ausência de qualquer documento suspende o fluxo de pagamento até a regularização;

d) EMISSÃO DA NOTA FISCAL (Até {{PRAZO_EMISSAO_NF}} dias úteis após aprovação) — Liberação para emissão da Nota Fiscal pela CONTRATADA, que deverá ser emitida com os dados corretos da CONTRATANTE e o valor exato da medição aprovada;

e) LIBERAÇÃO DA ORDEM DE PAGAMENTO (Até {{PRAZO_LIBERACAO_OP}} dias úteis após recebimento da NF) — Conferência da Nota Fiscal e liberação da Ordem de Pagamento (OP) pela área financeira da CONTRATANTE;

f) PAGAMENTO (Dia {{DIA_PAGAMENTO}} do mês subsequente) — Crédito em conta bancária da CONTRATADA, referente à medição aprovada do mês anterior.

3.3 RESUMO DOS PRAZOS:
• Dia da Medição: dia {{DIA_MEDICAO}} de cada mês
• Prazo de Aprovação: até {{PRAZO_APROVACAO}} dias úteis após a medição
• Prazo para Emissão da NF: até {{PRAZO_EMISSAO_NF}} dias úteis após aprovação
• Prazo para Liberação da OP: até {{PRAZO_LIBERACAO_OP}} dias úteis após NF
• Dia do Pagamento: dia {{DIA_PAGAMENTO}} do mês subsequente

3.4 O descumprimento dos prazos estabelecidos na subcláusula 3.2 por parte da CONTRATADA (itens "c" e "d") implicará no adiamento automático do pagamento para o ciclo subsequente, sem incidência de juros ou multa a favor da CONTRATADA.

3.5 A CONTRATANTE não será responsabilizada pelo atraso no pagamento quando este decorrer de pendências documentais ou irregularidades na Nota Fiscal emitida pela CONTRATADA.

3.6 Serviços executados sem a devida autorização do gestor do contrato ou em desacordo com as especificações não serão objeto de medição nem de pagamento.

CLÁUSULA QUARTA – DAS OBRIGAÇÕES DA CONTRATADA

4.1 A CONTRATADA se obriga a:
a) Executar os serviços de acordo com as normas técnicas vigentes e especificações do projeto;
b) Fornecer toda a mão de obra necessária, devidamente registrada e equipada com EPIs;
c) Manter preposto no local da obra para representá-la junto à CONTRATANTE;
d) Responder por todos os encargos trabalhistas, previdenciários e fiscais de seus empregados;
e) Apresentar os documentos exigidos para pagamento conforme cláusula 3.2, alínea "c".

CLÁUSULA QUINTA – DAS OBRIGAÇÕES DA CONTRATANTE

5.1 Efetuar os pagamentos nas condições estabelecidas neste contrato.
5.2 Fornecer acesso ao local da obra e disponibilizar as informações técnicas necessárias.
5.3 Designar fiscal para acompanhamento e aprovação dos serviços.

CLÁUSULA SEXTA – DA RESCISÃO

6.1 O presente contrato poderá ser rescindido por qualquer das partes, mediante notificação por escrito com antecedência mínima de 30 (trinta) dias.

CLÁUSULA SÉTIMA – DO FORO

7.1 Fica eleito o foro da Comarca de {{CIDADE_ESTADO}} para dirimir quaisquer dúvidas ou litígios oriundos do presente contrato, com renúncia de qualquer outro, por mais privilegiado que seja.

E por estarem assim justos e contratados, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, juntamente com 2 (duas) testemunhas.

{{CIDADE_ESTADO}}, {{DATA_ASSINATURA}}.


_________________________________________
{{CONTRATANTE_NOME}}
CNPJ: {{CONTRATANTE_CNPJ}}
Representante: {{CONTRATANTE_REPRESENTANTE}}


_________________________________________
{{CONTRATADA_NOME}}
CNPJ: {{CONTRATADA_CNPJ}}
Representante: {{CONTRATADA_REPRESENTANTE}}


TESTEMUNHAS:

1. _________________________________________
   Nome: {{TESTEMUNHA_FINANCEIRO}}
   Cargo: Responsável Financeiro

2. _________________________________________
   Nome: {{TESTEMUNHA_GESTOR_PROJETO}}
   Cargo: Gestor de Projeto`;
        const [novo] = await db.insert(terceiroContratoTemplates)
          .values({ companyId: contrato.companyId, nome: "Contrato Padrão", texto: defaultText, ativo: true, versao: 1 })
          .returning();
        template = novo;
      }

      const [empresa] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, contrato.empresaTerceiraId));
      const [company] = await db.select().from(companies).where(eq(companies.id, contrato.companyId));
      const [obra] = contrato.obraId ? await db.select().from(obras).where(eq(obras.id, contrato.obraId)) : [null];

      const itensContrato = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId))
        .orderBy(asc(terceiroContratoItens.ordem), asc(terceiroContratoItens.eapCodigo));

      let revisaoCronoLabel = "";
      if (contrato.obraId) {
        try {
          const [proj] = await db.select({ id: planejamentoProjetos.id })
            .from(planejamentoProjetos)
            .where(and(eq(planejamentoProjetos.companyId, contrato.companyId), eq(planejamentoProjetos.obraId, contrato.obraId)))
            .orderBy(desc(planejamentoProjetos.id)).limit(1);
          if (proj) {
            const [rev] = await db.select({
              numero: planejamentoRevisoes.numero,
              descricao: planejamentoRevisoes.descricao,
              dataRevisao: planejamentoRevisoes.dataRevisao,
              isBaseline: planejamentoRevisoes.isBaseline,
            }).from(planejamentoRevisoes)
              .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
              .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
            if (rev) {
              const nomeRev = rev.isBaseline ? `Baseline (Rev ${String(rev.numero).padStart(2, "0")})` : `Rev ${String(rev.numero).padStart(2, "0")}`;
              const descPart = rev.descricao ? ` — ${rev.descricao}` : "";
              revisaoCronoLabel = `${nomeRev}${descPart}`;
            }
          }
        } catch {}
      }

      const fmtDate = (d: string | null | undefined) => {
        if (!d) return "___/___/______";
        const [y, m, day] = d.slice(0, 10).split("-");
        return `${day}/${m}/${y}`;
      };
      const fmtMoney = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
      const fmtNum = (v: any) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(v) || 0);
      const endEmpresa = [empresa?.logradouro, empresa?.numero, empresa?.bairro, empresa?.cidade, empresa?.estado].filter(Boolean).join(", ");
      const endCompany = company?.endereco ?? [company?.cidade, company?.estado].filter(Boolean).join(" - ") ?? "";

      let tabelaItens = "";
      if (itensContrato.length > 0) {
        const linhaHeader = "EAP          | Descrição                                          | Un    | Qtd       | Vlr Unit.      | Total";
        const linhaSep =    "-------------|-------------------------------------------------------|-------|-----------|----------------|----------------";
        const sanitize = (s: string) => s.replace(/\|/g, "/").replace(/[\r\n]+/g, " ").trim();
        const linhasItens = itensContrato.map(it => {
          const eap = sanitize(it.eapCodigo || "—").padEnd(12);
          const desc = sanitize(it.descricao || "").padEnd(55);
          const un = sanitize(it.unidade || "—").padEnd(5);
          const qtd = fmtNum(it.quantidade).padStart(9);
          const vUnit = fmtMoney(it.valorUnitario).padStart(14);
          const vTotal = fmtMoney(it.valorTotal).padStart(14);
          return `${eap} | ${desc} | ${un} | ${qtd} | ${vUnit} | ${vTotal}`;
        });
        const totalGeral = itensContrato.reduce((s, it) => s + Number(it.valorTotal || 0), 0);
        tabelaItens = [
          "",
          "ESCOPO DETALHADO DOS SERVIÇOS (EAP):",
          "",
          linhaHeader,
          linhaSep,
          ...linhasItens,
          linhaSep,
          `${"".padEnd(12)} | ${"".padEnd(55)} | ${"".padEnd(5)} | ${"".padEnd(9)} | ${"TOTAL:".padStart(14)} | ${fmtMoney(totalGeral).padStart(14)}`,
          "",
        ].join("\n");
      }

      const vars: Record<string, string> = {
        "NUMERO_CONTRATO": contrato.numeroContrato ?? "_______________",
        "ANO_ATUAL": new Date().getFullYear().toString(),
        "CONTRATANTE_NOME": company?.razaoSocial ?? "_______________",
        "CONTRATANTE_CNPJ": company?.cnpj ?? "_______________",
        "CONTRATANTE_ENDERECO": endCompany || "_______________",
        "CONTRATANTE_REPRESENTANTE": "Felipe Costa Alves",
        "CONTRATANTE_CARGO": "Sócio Administrador",
        "CONTRATADA_NOME": empresa?.razaoSocial ?? "_______________",
        "CONTRATADA_CNPJ": empresa?.cnpj ?? "_______________",
        "CONTRATADA_ENDERECO": endEmpresa || "_______________",
        "CONTRATADA_REPRESENTANTE": empresa?.responsavelNome ?? "_______________",
        "CONTRATADA_CARGO": empresa?.responsavelCargo ?? "Representante Legal",
        "OBRA_NOME": obra?.nome ?? contrato.obraNome ?? "_______________",
        "DESCRICAO_OBJETO": contrato.descricao ?? "_______________",
        "VALOR_TOTAL": fmtMoney(contrato.valorTotal),
        "DATA_INICIO": fmtDate(contrato.dataInicio ?? undefined),
        "DATA_TERMINO": fmtDate(contrato.dataTermino ?? undefined),
        "CIDADE_ESTADO": [company?.cidade, company?.estado].filter(Boolean).join(" - ") || "Montes Claros - MG",
        "DATA_ASSINATURA": fmtDate(new Date().toISOString()),
        "TABELA_ITENS": tabelaItens,
        "QTD_ITENS": String(itensContrato.length),
        "TESTEMUNHA_FINANCEIRO": contrato.testemunhaFinanceiro || (company as any)?.gestorFinanceiroNome || "_______________",
        // SEMPRE o "Engenheiro / Responsável" do cadastro da obra (sem fallback legado).
        "TESTEMUNHA_GESTOR_PROJETO": obra?.responsavel || "_______________",
        "REVISAO_CRONOGRAMA": revisaoCronoLabel || "—",
        "DIA_MEDICAO": String(contrato.diaMedicao ?? 25),
        "PRAZO_APROVACAO": String(contrato.prazoAprovacaoDias ?? 5),
        "PRAZO_EMISSAO_NF": String(contrato.prazoEmissaoNf ?? 3),
        "PRAZO_LIBERACAO_OP": String(contrato.prazoLiberacaoOp ?? 5),
        "DIA_PAGAMENTO": String(contrato.diaPagamento ?? 10),
        "FLUXOGRAMA_PAGAMENTO": "{{FLUXOGRAMA_PAGAMENTO}}",
      };

      let texto = template.texto;
      for (const [k, v] of Object.entries(vars)) {
        texto = texto.replaceAll(`{{${k}}}`, v);
      }

      // Salvar revisão da versão atual, se já tiver texto
      const versaoAtual = contrato.versaoTexto ?? 0;
      if (contrato.textoContrato && versaoAtual > 0) {
        await db.insert(terceiroContratoRevisoes).values({
          contratoId: contrato.id,
          companyId: contrato.companyId,
          versao: versaoAtual,
          texto: contrato.textoContrato,
          observacao: "Substituído por regeneração automática",
          criadoPor: ctx.user?.name ?? "sistema",
        });
      }

      const novaVersao = versaoAtual + 1;
      await db.update(terceiroContratos)
        .set({ textoContrato: texto, templateId: template.id, versaoTexto: novaVersao, atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroContratos.id, input.contratoId));

      return { texto, versao: novaVersao };
    }),

  salvarTextoContrato: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      texto: z.string(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");

      // Arquivar versão atual como revisão
      const versaoAtual = contrato.versaoTexto ?? 0;
      if (contrato.textoContrato) {
        await db.insert(terceiroContratoRevisoes).values({
          contratoId: contrato.id,
          companyId: contrato.companyId,
          versao: versaoAtual,
          texto: contrato.textoContrato,
          observacao: input.observacao ?? "Edição manual",
          criadoPor: ctx.user?.name ?? "sistema",
        });
      }

      const novaVersao = versaoAtual + 1;
      await db.update(terceiroContratos)
        .set({ textoContrato: input.texto, versaoTexto: novaVersao, atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroContratos.id, input.contratoId));

      return { versao: novaVersao };
    }),

  listarRevisoes: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(terceiroContratoRevisoes)
        .where(eq(terceiroContratoRevisoes.contratoId, input.contratoId))
        .orderBy(desc(terceiroContratoRevisoes.versao));
    }),

  restaurarRevisao: protectedProcedure
    .input(z.object({ contratoId: z.number(), revisaoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [rev] = await db.select().from(terceiroContratoRevisoes).where(eq(terceiroContratoRevisoes.id, input.revisaoId));
      if (!rev) throw new Error("Revisão não encontrada");

      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, input.contratoId));
      const versaoAtual = contrato?.versaoTexto ?? 0;

      if (contrato?.textoContrato) {
        await db.insert(terceiroContratoRevisoes).values({
          contratoId: input.contratoId,
          companyId: rev.companyId,
          versao: versaoAtual,
          texto: contrato.textoContrato,
          observacao: `Substituído ao restaurar revisão v${rev.versao}`,
          criadoPor: ctx.user?.name ?? "sistema",
        });
      }

      const novaVersao = versaoAtual + 1;
      await db.update(terceiroContratos)
        .set({ textoContrato: rev.texto, versaoTexto: novaVersao, atualizadoEm: new Date().toISOString() })
        .where(eq(terceiroContratos.id, input.contratoId));

      return { versao: novaVersao };
    }),
});

async function _recalcularValorContrato(db: any, contratoId: number) {
  const itens = await db.select().from(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, contratoId));
  const total = itens.reduce((s: number, i: any) => s + n(i.valorTotal), 0);
  await db.update(terceiroContratos).set({ valorTotal: String(total), atualizadoEm: new Date().toISOString() })
    .where(eq(terceiroContratos.id, contratoId));
}


// Rev. 4854 — extraído do procedure gerarPdfMedicao para permitir a rota
// pública do FCSign (assinante vê o boletim completo em PDF pelo token).
// ATENÇÃO: quem chama é responsável pelo guard de tenancy/token.
export async function gerarPdfMedicaoBuffer(db: any, input: { medicaoId: number; companyId: number }): Promise<{ base64: string; filename: string }> {
      const [medicao] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!medicao) throw new Error("Medição não encontrada");
      // Rev. 4834 — tenancy em TODAS as queries (review): contrato/empresa/obra/itens escopados por companyId.
      const [contrato] = await db.select().from(terceiroContratos).where(and(eq(terceiroContratos.id, medicao.contratoId), eq(terceiroContratos.companyId, input.companyId)));
      if (!contrato) throw new Error("Contrato não encontrado");
      const [empresa] = await db.select().from(empresasTerceiras).where(and(eq(empresasTerceiras.id, contrato.empresaTerceiraId), eq(empresasTerceiras.companyId, input.companyId)));
      const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
      let obraNome = "";
      if (contrato.obraId) {
        const [obra] = await db.select().from(obras).where(and(eq(obras.id, contrato.obraId), eq(obras.companyId, input.companyId)));
        if (obra) obraNome = obra.nome;
      }
      const itensMedicao = await db.select().from(terceiroMedicaoItens).where(and(eq(terceiroMedicaoItens.medicaoId, input.medicaoId), eq(terceiroMedicaoItens.companyId, input.companyId)));
      const itensContrato = await db.select().from(terceiroContratoItens).where(and(eq(terceiroContratoItens.contratoId, contrato.id), eq(terceiroContratoItens.companyId, input.companyId))).orderBy(asc(terceiroContratoItens.ordem));

      const itensEnriquecidos = itensMedicao.map(im => {
        const ci = itensContrato.find(c => c.id === im.contratoItemId);
        return {
          descricao: ci?.descricao || im.descricao || "",
          eapCodigo: (ci as any)?.eapCodigo || "",
          unidade: ci?.unidade || "-",
          quantidade: n(ci?.quantidade),
          valorUnitario: n(ci?.valorUnitario),
          valorTotal: n(ci?.valorTotal),
          percAnterior: n(im.percentualAcumuladoAnterior),
          percPeriodo: n(im.percentualMedidoPeriodo),
          percAcumulado: n(im.percentualAcumuladoAnterior) + n(im.percentualMedidoPeriodo), // Rev. 4800 — acumulado MEDIDO
          valorPeriodo: n(im.valorMedidoPeriodo),
          valorAcumulado: n(im.valorAcumulado),
        };
      });
      itensEnriquecidos.sort((a, b) => a.eapCodigo.localeCompare(b.eapCodigo, undefined, { numeric: true }));

      let hierMap = new Map<string, string>();
      try {
        const orcamentoId = contrato.orcamentoId || (itensContrato.length > 0 ? (itensContrato[0] as any).orcamentoItemId ? undefined : undefined : undefined);
        const eapCodes = [...new Set(itensContrato.map((it: any) => it.eapCodigo).filter(Boolean))] as string[];
        if (eapCodes.length > 0) {
          const parentEaps = new Set<string>();
          for (const eap of eapCodes) {
            const parts = eap.split(".");
            for (let i = 1; i < parts.length; i++) parentEaps.add(parts.slice(0, i).join("."));
          }
          const allEaps = [...new Set([...eapCodes, ...parentEaps])];
          if (allEaps.length > 0) {
            const atividadesRows = await db.select({ eapCodigo: planejamentoAtividades.eapCodigo, nome: planejamentoAtividades.nome })
              .from(planejamentoAtividades)
              .where(inArray(planejamentoAtividades.eapCodigo, allEaps));
            for (const a of atividadesRows) { if (a.eapCodigo && a.nome) hierMap.set(a.eapCodigo, a.nome); }
          }
          if (hierMap.size === 0 && contrato.orcamentoId) {
            const orcRows = await db.select({ eapCodigo: orcamentoItens.eapCodigo, descricao: orcamentoItens.descricao })
              .from(orcamentoItens)
              .where(and(eq(orcamentoItens.orcamentoId, contrato.orcamentoId), inArray(orcamentoItens.eapCodigo, allEaps)));
            for (const o of orcRows) { if (o.eapCodigo && o.descricao) hierMap.set(o.eapCodigo, o.descricao); }
          }
        }
      } catch {}

      const totalValorContrato = itensEnriquecidos.reduce((s, i) => s + i.valorTotal, 0);
      const totalValorPeriodo = itensEnriquecidos.reduce((s, i) => s + i.valorPeriodo, 0);
      const totalValorAcumulado = itensEnriquecidos.reduce((s, i) => s + i.valorAcumulado, 0);

      const pISS = n((contrato as any).percISS);
      const pINSS = n((contrato as any).percINSS);
      const pIRRF = n((contrato as any).percIRRF);
      const pOutras = n((contrato as any).percOutrasRetencoes);
      const pRetTecnica = n((contrato as any).percRetencaoTecnica);
      const retISS = pISS > 0 ? totalValorPeriodo * pISS / 100 : n((medicao as any).retencaoISS);
      const retINSS = pINSS > 0 ? totalValorPeriodo * pINSS / 100 : n((medicao as any).retencaoINSS);
      const retIRRF = pIRRF > 0 ? totalValorPeriodo * pIRRF / 100 : n((medicao as any).retencaoIRRF);
      const retOutras = pOutras > 0 ? totalValorPeriodo * pOutras / 100 : n((medicao as any).outrasRetencoes);
      const retTecnica = pRetTecnica > 0 ? totalValorPeriodo * pRetTecnica / 100 : n((medicao as any).retencaoTecnica);
      const descontos = n((medicao as any).descontos);
      const totalRetencoes = retISS + retINSS + retIRRF + retOutras + retTecnica;
      // Rev. 4800 — FDs do período no relatório: lista item a item o que foi
      // descontado (descrição + data + valor), para não haver dúvida.
      const fdsDaMedicao = await db.select().from(terceiroMedicaoFds)
        .where(and(
          eq(terceiroMedicaoFds.medicaoId, input.medicaoId),
          eq(terceiroMedicaoFds.companyId, input.companyId),
        )).orderBy(asc(terceiroMedicaoFds.dataFd), asc(terceiroMedicaoFds.id));
      const totalFdPdf = fdsDaMedicao.reduce((s: number, f: any) => s + n(f.valor), 0);
      const valorLiquido = totalValorPeriodo - totalRetencoes - descontos - totalFdPdf;

      let retTecnicaAcumulada = 0;
      if (pRetTecnica > 0) {
        const todasMedicoes = await db.select().from(terceiroMedicoes)
          .where(and(
            eq(terceiroMedicoes.contratoId, (medicao as any).contratoId),
            eq(terceiroMedicoes.companyId, input.companyId),
          ));
        retTecnicaAcumulada = todasMedicoes
          .filter((md: any) => md.status === "aprovada" || md.status === "paga")
          .reduce((acc: number, md: any) => acc + n(md.valorMedido) * pRetTecnica / 100, 0);
      }

      const PDFDocument = (await import("pdfkit")).default;
      const fs = await import("fs");
      const path = await import("path");

      function resolveLogoSource(logoUrl: string | null | undefined): string | Buffer | null {
        if (!logoUrl) return null;
        if (logoUrl.startsWith("data:image")) {
          const matches = logoUrl.match(/^data:image\/\w+;base64,(.+)$/);
          if (matches?.[1]) return Buffer.from(matches[1], "base64");
          return null;
        }
        if (logoUrl.startsWith("/uploads/")) {
          const localPath = path.join(process.cwd(), "server", logoUrl);
          if (fs.existsSync(localPath)) return localPath;
        }
        // Rev. 4796 — logo em asset público (ex.: /logo-fc.jpg). Anti-traversal:
        // resolve e EXIGE que o caminho final continue dentro do diretório base.
        if (logoUrl.startsWith("/")) {
          for (const base of ["client/public", "dist/public"]) {
            const baseDir = path.resolve(process.cwd(), base);
            const p = path.resolve(baseDir, "." + path.posix.normalize(logoUrl));
            if (p.startsWith(baseDir + path.sep) && fs.existsSync(p)) return p;
          }
        }
        return null;
      }

      // Rev. 4793 — assinatura digital (FCSign): mostra no PDF o status do envelope
      let envelopeAss: any = null;
      try {
        const envs = await db.select().from(integrasignEnvelopes)
          .where(and(
            eq(integrasignEnvelopes.companyId, input.companyId),
            eq((integrasignEnvelopes as any).medicaoTerceiroId, input.medicaoId),
            sql`${integrasignEnvelopes.excluidoEm} IS NULL`,
          )).orderBy(desc(integrasignEnvelopes.id)).limit(1);
        envelopeAss = envs[0] ?? null;
      } catch { /* coluna pode não existir ainda */ }
      let signatariosAss: any[] = [];
      if (envelopeAss) {
        try {
          signatariosAss = await db.select().from(integrasignSignatarios)
            .where(eq(integrasignSignatarios.envelopeId, envelopeAss.id))
            .orderBy(asc(integrasignSignatarios.ordemAssinatura));
        } catch {}
      }

      // Rev. 4834 — HISTÓRICO DE LEVANTAMENTO DE CAMPO no boletim (documento
      // único, pedido do usuário): todos os levantamentos vinculados a esta
      // medição, com contornos medidos e registro fotográfico embutidos.
      type FotoPdf = { legenda: string; buffer: Buffer | null };
      type CampoPdf = { titulo: string; criadoPorNome: string; contornos: any[]; fotos: FotoPdf[] };
      const camposPdf: CampoPdf[] = [];
      try {
        // O vínculo principal vive na MEDIÇÃO (terceiro_medicoes.levantamento_campo_id);
        // campo.medicaoId nem sempre é populado — busca pelos dois caminhos.
        const levCampoId = Number((medicao as any).levantamentoCampoId || 0);
        const campos = await db.select().from(medicaoCampo).where(and(
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.origem, "terceiro"),
          sql`${medicaoCampo.deletedAt} IS NULL`,
          levCampoId > 0
            ? sql`(${medicaoCampo.id} = ${levCampoId} OR ${(medicaoCampo as any).medicaoId} = ${input.medicaoId})`
            : eq((medicaoCampo as any).medicaoId, input.medicaoId),
        )).orderBy(asc(medicaoCampo.numero));
        const fs2 = await import("fs");
        const path2 = await import("path");
        const uploadsRoot = path2.join(process.cwd(), "server/uploads");
        const resolveFotoBuffer = async (url: string | null): Promise<Buffer | null> => {
          if (!url || !url.startsWith("/uploads/")) return null;
          // PDFKit só embute JPEG/PNG — vídeos (.mov/.mp4) e outros formatos ficam de fora.
          if (!/\.(jpe?g|png)$/i.test(url)) return null;
          const key = decodeURIComponent(url.replace(/^\/uploads\//, ""));
          // Rev. 4834 — anti-IDOR (review): a chave DEVE pertencer ao tenant deste
          // boletim (prefixo canônico das fotos de levantamento). Qualquer path
          // fora desse escopo (ex.: arquivo de outra empresa) é rejeitado.
          if (!key.startsWith(`medicao-campo/${input.companyId}/`)) return null;
          const p = path2.resolve(uploadsRoot, key);
          // anti-traversal: só dentro do diretório de uploads
          if (p !== uploadsRoot && !p.startsWith(uploadsRoot + path2.sep)) return null;
          try {
            let buf: Buffer | null = null;
            buf = await fs2.promises.readFile(p).catch(() => null);
            if (!buf) {
              const { dbRetrieve } = await import("../storage");
              const r = await dbRetrieve(key);
              buf = r?.buffer ?? null;
            }
            if (!buf) return null;
            // Rev. 4834 — fotos de celular chegam com 4-6MB cada; sem compressão o
            // PDF passava de 17MB (estoura o proxy no iPad). Reduz p/ 1280px JPEG.
            try {
              const sharp = (await import("sharp")).default;
              return await sharp(buf).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
            } catch { return buf; }
          } catch { return null; }
        };
        for (const campo of campos) {
          const contornos = await db.select().from(medicaoCampoContornos).where(and(
            eq(medicaoCampoContornos.medicaoCampoId, campo.id),
            eq(medicaoCampoContornos.companyId, input.companyId),
            sql`${medicaoCampoContornos.deletedAt} IS NULL`,
          )).orderBy(asc(medicaoCampoContornos.tipo), asc(medicaoCampoContornos.numero), asc(medicaoCampoContornos.id));
          const fotosRows = await db.select().from(medicaoCampoFotos).where(and(
            eq(medicaoCampoFotos.medicaoCampoId, campo.id),
            eq(medicaoCampoFotos.companyId, input.companyId),
            sql`${medicaoCampoFotos.deletedAt} IS NULL`,
          )).orderBy(asc(medicaoCampoFotos.id));
          const contornoRotulo = new Map<number, string>(contornos.map((c: any) => [c.id, c.rotulo || c.servico || ""]));
          const fotos: FotoPdf[] = [];
          for (const f of fotosRows) {
            const buffer = await resolveFotoBuffer((f as any).arquivoUrl);
            fotos.push({
              legenda: (f as any).legenda || contornoRotulo.get((f as any).contornoId) || "Foto do levantamento",
              buffer,
            });
          }
          camposPdf.push({
            titulo: `Nº ${String(campo.numero).padStart(3, "0")}${campo.titulo ? ` — ${campo.titulo}` : ""}`,
            criadoPorNome: (campo as any).criadoPorNome || "",
            contornos,
            fotos,
          });
        }
      } catch (e: any) {
        console.warn("[gerarPdfMedicao] levantamento de campo indisponível no PDF:", e?.message);
      }

      return new Promise<{ base64: string; filename: string }>((resolve, reject) => {
        // Rev. 4793 — PAISAGEM: a medição inteira cabe na largura (qtds medidas
        // em números + valores), leitura muito mais fácil no iPad e impressa.
        const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true });
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => {
          const buf = Buffer.concat(chunks);
          const numStr = String(medicao.numero || 1).padStart(2, "0");
          resolve({ base64: buf.toString("base64"), filename: `Medicao_${numStr}_${medicao.periodo}.pdf` });
        });
        doc.on("error", reject);

        const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const PCT = (v: number) => v.toFixed(1) + "%";
        const mL = 40;
        const mR = 40;
        const pageW = doc.page.width - mL - mR;
        const primary = "#1B3A5C";
        const accent = "#2980b9";

        const pageBottom = doc.page.height - 44;

        // Rev. 4834 — padrão "Memória de Cálculo" (pedido do usuário): logo GRANDE
        // centralizado sobre fundo branco + faixa azul-marinho com o título em
        // caixa alta espaçada. O box da medição fica à direita da faixa.
        const logoSrc = resolveLogoSource((company as any)?.logoUrl);
        let logoRendered = false;
        if (logoSrc) {
          try { doc.image(logoSrc, doc.page.width / 2 - 60, 10, { fit: [120, 44] }); logoRendered = true; } catch { logoRendered = false; }
        }
        if (!logoRendered) {
          doc.font("Helvetica-Bold").fontSize(18).fillColor(primary)
            .text(company?.name || "FC Engenharia", 0, 24, { width: doc.page.width, align: "center" });
        }
        if (company?.cnpj) {
          doc.font("Helvetica").fontSize(6.5).fillColor("#7a8699")
            .text(`${company?.name || "FC Engenharia"} · CNPJ: ${company.cnpj}`, 0, 56, { width: doc.page.width, align: "center" });
        }

        const barY = 66, barH = 26;
        doc.rect(mL - 4, barY, doc.page.width - mL - mR + 8, barH).fill(primary);
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff")
          .text("B O L E T I M   D E   M E D I Ç Ã O   —   C O N T R A T O   D E   T E R C E I R O S", mL - 4, barY + 9, { width: doc.page.width - mL - mR + 8, align: "center" });

        const statusLabels: Record<string, string> = { rascunho: "Rascunho", aguardando_aprovacao: "Aguard. Aprovação", aprovada: "Aprovada", paga: "Paga", rejeitada: "Rejeitada" };
        const revNum = Number((medicao as any).revisao || 0);
        const numBox = `Nº ${String(medicao.numero || 1).padStart(2, "0")}${revNum > 0 ? ` · REV. ${revNum}` : ""}`;
        doc.roundedRect(doc.page.width - mR - 128, barY + 2, 124, barH - 4, 3).fill("#ffffff");
        doc.font("Helvetica").fontSize(5.5).fillColor(primary).text(`MEDIÇÃO · ${medicao.periodo || "-"}  ·  ${statusLabels[medicao.status || "rascunho"] || medicao.status || "-"}`, doc.page.width - mR - 124, barY + 5, { width: 116, align: "center" });
        doc.font("Helvetica-Bold").fontSize(11).fillColor(primary).text(numBox, doc.page.width - mR - 124, barY + 11.5, { width: 116, align: "center" });

        let y = barY + barH + 10;

        // Rev. 4796 — datas do contrato + ritmo (adiantado/em dia/atrasado)
        const fmtBR = (d: any) => {
          if (!d) return "-";
          const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
          const [a, m2, dd] = s.split("-");
          return dd && m2 && a ? `${dd}/${m2}/${a}` : s;
        };
        const toDate = (d: any) => {
          if (!d) return null;
          const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
          const t = new Date(s + "T12:00:00");
          return isNaN(t.getTime()) ? null : t;
        };
        const percAcumGlobal = totalValorContrato > 0 ? totalValorAcumulado / totalValorContrato * 100 : 0;
        const ini = toDate((contrato as any).dataInicio);
        const fim = toDate((contrato as any).dataTermino);
        const ref = toDate((medicao as any).dataFim) || new Date();
        let ritmo: { label: string; cor: string; bg: string; detalhe: string } | null = null;
        if (ini && fim && fim.getTime() > ini.getTime()) {
          const percTempo = Math.max(0, Math.min(100, (ref.getTime() - ini.getTime()) / (fim.getTime() - ini.getTime()) * 100));
          const delta = percAcumGlobal - percTempo;
          const det = `Físico ${percAcumGlobal.toFixed(1)}% × Prazo ${percTempo.toFixed(1)}% (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} p.p.)`;
          if (delta >= 5) ritmo = { label: "ADIANTADO", cor: "#065f46", bg: "#d1fae5", detalhe: det };
          else if (delta <= -5) ritmo = { label: "ATRASADO", cor: "#991b1b", bg: "#fee2e2", detalhe: det };
          else ritmo = { label: "EM DIA", cor: "#1e40af", bg: "#dbeafe", detalhe: det };
        }

        // ── Faixa de identificação (3 linhas × 4 colunas) ──
        doc.roundedRect(mL, y, pageW, 68, 3).fill("#f4f6f9");
        const infoColW = pageW / 4;
        const infoLine = (label: string, value: string, ci: number, row: number) => {
          const x = mL + 10 + ci * infoColW;
          const yy = y + 6 + row * 21;
          doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#7a8699").text(label, x, yy);
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#1a1a2e").text(value || "-", x, yy + 8, { width: infoColW - 16, height: 12, ellipsis: true });
        };
        infoLine("Nº DO CONTRATO", (contrato as any).numeroContrato || `#${contrato.id}`, 0, 0);
        infoLine("CONTRATO", contrato.descricao || "-", 1, 0);
        infoLine("TERCEIRO (CONTRATADA)", empresa?.razaoSocial || empresa?.nomeFantasia || "-", 2, 0);
        infoLine("CNPJ TERCEIRO", empresa?.cnpj || "-", 3, 0);
        infoLine("OBRA", obraNome || "-", 0, 1);
        infoLine("INÍCIO DO CONTRATO", fmtBR((contrato as any).dataInicio), 1, 1);
        infoLine("TÉRMINO DO CONTRATO", fmtBR((contrato as any).dataTermino), 2, 1);
        infoLine("VALOR DO CONTRATO", BRL(n(contrato.valorTotal)), 3, 1);
        infoLine("PERÍODO MEDIDO", `${fmtBR((medicao as any).dataInicio)}  a  ${fmtBR((medicao as any).dataFim)}`, 0, 2);
        infoLine("MEDIDO NO PERÍODO", BRL(totalValorPeriodo), 1, 2);
        infoLine("ACUMULADO", `${BRL(totalValorAcumulado)}  (${percAcumGlobal.toFixed(1)}%)`, 2, 2);
        if (ritmo) {
          const x = mL + 10 + 3 * infoColW;
          doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#7a8699").text("RITMO DO CONTRATO", x, y + 6 + 2 * 21);
          const bw = doc.widthOfString(ritmo.label, { size: 7.5 } as any) + 60;
          doc.roundedRect(x, y + 6 + 2 * 21 + 8, Math.min(infoColW - 16, 88), 11, 5.5).fill(ritmo.bg);
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(ritmo.cor).text(ritmo.label, x, y + 6 + 2 * 21 + 10.5, { width: Math.min(infoColW - 16, 88), align: "center" });
          void bw;
        } else {
          infoLine("RITMO DO CONTRATO", "Sem datas no contrato", 3, 2);
        }
        y += 68 + 4;
        if (ritmo) {
          doc.font("Helvetica").fontSize(6.5).fillColor("#7a8699").text(`Ritmo: ${ritmo.detalhe} — referência: ${fmtBR(ref)}`, mL + 2, y);
          y += 12;
        } else {
          y += 6;
        }

        // Rev. 4793 — paisagem: contratado (Qtd/V.Total) + MEDIÇÃO ATUAL em
        // números (Qtd. medida do período destacada) + acumulado, tudo na tela.
        const cols = [
          { label: "EAP", width: 52, align: "left" as const },
          { label: "Atividade", width: 168, align: "left" as const },
          { label: "Unid.", width: 32, align: "center" as const },
          { label: "Qtd. Contr.", width: 52, align: "right" as const },
          { label: "V.Unit.", width: 54, align: "right" as const },
          { label: "V.Total Contr.", width: 62, align: "right" as const },
          { label: "Ant.%", width: 36, align: "right" as const },
          { label: "Per.%", width: 36, align: "right" as const, destaque: true },
          { label: "Qtd. Período", width: 56, align: "right" as const, destaque: true },
          { label: "V.Período", width: 62, align: "right" as const, destaque: true },
          { label: "Acum.%", width: 40, align: "right" as const },
          { label: "Qtd. Acum.", width: 56, align: "right" as const },
          { label: "V.Acum.", width: 62, align: "right" as const },
        ] as Array<{ label: string; width: number; align: "left" | "center" | "right"; destaque?: boolean }>;
        const tableW = cols.reduce((s, c) => s + c.width, 0);
        const DESTAQUE_BG = "#dbeafe";
        const destaqueX = mL + cols.slice(0, 7).reduce((s, c) => s + c.width, 0);
        const destaqueW = cols[7].width + cols[8].width + cols[9].width;

        const drawTableHeader = (yPos: number) => {
          let xOff = mL;
          doc.rect(mL, yPos, tableW, 16).fill(primary);
          doc.rect(destaqueX, yPos, destaqueW, 16).fill("#2d5a8a");
          doc.fillColor("#fff").fontSize(6.5).font("Helvetica-Bold");
          for (const c of cols) {
            doc.text(c.label, xOff + 2, yPos + 5, { width: c.width - 5, align: c.align });
            xOff += c.width;
          }
          return yPos + 16;
        };

        y = drawTableHeader(y);

        const renderedGroups = new Set<string>();
        let rowIdx = 0;

        for (const item of itensEnriquecidos) {
          const eap = item.eapCodigo;
          if (eap) {
            const parts = eap.split(".");
            for (let depth = 1; depth < parts.length; depth++) {
              const parentEap = parts.slice(0, depth).join(".");
              if (!renderedGroups.has(parentEap)) {
                renderedGroups.add(parentEap);
                if (y > pageBottom - 30) { doc.addPage(); y = 36; y = drawTableHeader(y); }
                const isTop = depth === 1;
                const bgColor = isTop ? "#e8edf4" : "#f3f5f8";
                doc.rect(mL, y, tableW, 14).fill(bgColor);
                if (isTop) doc.rect(mL, y, 3, 14).fill("#d4a017");
                doc.fillColor(primary).font("Helvetica-Bold").fontSize(7);
                doc.text(parentEap, mL + 5, y + 4);
                const indent = 5 + (depth - 1) * 10;
                const nome = hierMap.get(parentEap) || `Nível ${parentEap}`;
                doc.text(`» ${nome}`, mL + 52 + indent, y + 4, { width: tableW - 60 - indent, height: 10, ellipsis: true });
                y += 14;
                rowIdx = 0;
              }
            }
          }

          if (y > pageBottom - 20) { doc.addPage(); y = 36; y = drawTableHeader(y); }
          if (rowIdx % 2 === 0) doc.rect(mL, y, tableW, 13).fill("#fafbfc");
          doc.rect(destaqueX, y, destaqueW, 13).fill(rowIdx % 2 === 0 ? "#e3eefc" : DESTAQUE_BG);
          doc.fillColor("#333").font("Helvetica").fontSize(6.5);
          let xOff = mL;
          const indent = eap ? Math.max(0, (eap.split(".").length - 1) * 6) : 0;
          const QTD = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const qtdPeriodo = item.quantidade * item.percPeriodo / 100;
          const qtdAcumulada = item.quantidade * item.percAcumulado / 100;
          const vals = [
            { v: eap || "-", a: "left" as const },
            { v: item.descricao.substring(0, 42), a: "left" as const },
            { v: item.unidade, a: "center" as const },
            { v: QTD(item.quantidade), a: "right" as const },
            { v: BRL(item.valorUnitario), a: "right" as const },
            { v: BRL(item.valorTotal), a: "right" as const },
            { v: PCT(item.percAnterior), a: "right" as const },
            { v: PCT(item.percPeriodo), a: "right" as const },
            { v: `${QTD(qtdPeriodo)} ${item.unidade !== "-" ? item.unidade : ""}`.trim(), a: "right" as const },
            { v: BRL(item.valorPeriodo), a: "right" as const },
            { v: PCT(item.percAcumulado), a: "right" as const },
            { v: `${QTD(qtdAcumulada)} ${item.unidade !== "-" ? item.unidade : ""}`.trim(), a: "right" as const },
            { v: BRL(item.valorAcumulado), a: "right" as const },
          ];
          for (let ci = 0; ci < cols.length; ci++) {
            const c = cols[ci];
            const cellX = ci === 1 ? xOff + indent : xOff;
            const cellW = ci === 1 ? c.width - indent : c.width;
            if (c.destaque) doc.font("Helvetica-Bold").fillColor("#1d4ed8"); else doc.font("Helvetica").fillColor("#333");
            doc.text(vals[ci].v, cellX + 2, y + 4, { width: cellW - 5, align: vals[ci].a, lineBreak: false });
            xOff += c.width;
          }
          doc.strokeColor("#e5e7eb").lineWidth(0.3).moveTo(mL, y + 13).lineTo(mL + tableW, y + 13).stroke();
          y += 13;
          rowIdx++;
        }

        if (y > pageBottom - 20) { doc.addPage(); y = 36; }
        doc.rect(mL, y, tableW, 16).fill("#e2e8f0");
        doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(7);
        doc.text("TOTAL", mL + 5, y + 5);
        const colX = (i: number) => mL + cols.slice(0, i).reduce((s, c) => s + c.width, 0);
        doc.text(BRL(totalValorContrato), colX(5) + 2, y + 5, { width: cols[5].width - 5, align: "right", lineBreak: false });
        doc.fillColor("#1d4ed8").text(BRL(totalValorPeriodo), colX(9) + 2, y + 5, { width: cols[9].width - 5, align: "right", lineBreak: false });
        doc.fillColor("#1e293b").text(BRL(totalValorAcumulado), colX(12) + 2, y + 5, { width: cols[12].width - 5, align: "right", lineBreak: false });
        y += 24;

        // Rev. 4827 — aviso permanente: desconto de FD excluído desta medição.
        if ((medicao as any).fdExclusaoAlerta) {
          const alertaTxt = String((medicao as any).fdExclusaoAlerta);
          const altH = doc.heightOfString(alertaTxt, { width: tableW - 16 }) + 26;
          if (y > pageBottom - altH) { doc.addPage(); y = 36; }
          doc.rect(mL, y, tableW, altH).fill("#fef2f2").stroke("#fca5a5");
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#dc2626").text("⚠ EXISTEM FDs PENDENTES", mL + 8, y + 6);
          doc.font("Helvetica").fontSize(7).fillColor("#b91c1c").text(alertaTxt, mL + 8, y + 17, { width: tableW - 16 });
          y += altH + 8;
        }

        if (totalRetencoes > 0 || descontos > 0 || totalFdPdf > 0) {
          if (y > pageBottom - (120 + fdsDaMedicao.length * 13)) { doc.addPage(); y = 36; }
          doc.font("Helvetica-Bold").fontSize(9).fillColor(primary).text("RETENÇÕES E DESCONTOS", mL, y);
          y += 14;
          doc.strokeColor(accent).lineWidth(0.8).moveTo(mL, y).lineTo(mL + 200, y).stroke();
          y += 8;
          doc.fontSize(8).font("Helvetica").fillColor("#333");
          if (retISS > 0) { doc.text(`ISS${pISS > 0 ? ` (${pISS}%)` : ""}: ${BRL(retISS)}`, mL, y); y += 13; }
          if (retINSS > 0) { doc.text(`INSS${pINSS > 0 ? ` (${pINSS}%)` : ""}: ${BRL(retINSS)}`, mL, y); y += 13; }
          if (retIRRF > 0) { doc.text(`IRRF${pIRRF > 0 ? ` (${pIRRF}%)` : ""}: ${BRL(retIRRF)}`, mL, y); y += 13; }
          if (retOutras > 0) { doc.text(`Outras Retenções${pOutras > 0 ? ` (${pOutras}%)` : ""}: ${BRL(retOutras)}`, mL, y); y += 13; }
          if (retTecnica > 0) { doc.text(`Retenção Técnica${pRetTecnica > 0 ? ` (${pRetTecnica}%)` : ""}: ${BRL(retTecnica)} *`, mL, y); y += 13; }
          if (descontos > 0) { doc.text(`Descontos: ${BRL(descontos)}`, mL, y); y += 13; }
          // Rev. 4800 — cada FD descontado sai discriminado no boletim
          if (totalFdPdf > 0) {
            doc.font("Helvetica-Bold").fillColor("#92400e").text(`Descontos lançados neste período (FD, EPI, ferramental...): - ${BRL(totalFdPdf)}`, mL, y); y += 13;
            doc.font("Helvetica").fontSize(7.5).fillColor("#555");
            // Rev. 4801 — cada desconto sai discriminado com o TIPO no boletim
            const tipoLabelPdf: Record<string, string> = { fd: "FD Compra", epi: "EPI", ferramental: "Ferramental", insumo: "Insumo", outro: "Outro" };
            for (const f of fdsDaMedicao) {
              if (y > pageBottom - 20) { doc.addPage(); y = 36; doc.font("Helvetica").fontSize(7.5).fillColor("#555"); }
              const dt = f.dataFd ? new Date(`${String(f.dataFd).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "-";
              const origemTxt = f.origem === "auto" ? " (desconto automático)" : f.origem === "avulso" ? " (lançado fora da medição)" : "";
              doc.text(`   • ${dt} — [${tipoLabelPdf[(f as any).tipo || "fd"] || "Outro"}] ${f.descricao}${origemTxt}: - ${BRL(n(f.valor))}`, mL, y, { width: pageW - 20 });
              y += 12;
            }
            doc.fontSize(8).fillColor("#333");
          }
          doc.font("Helvetica-Bold").text(`Total Retenções: ${BRL(totalRetencoes)}`, mL, y); y += 13;
          if (retTecnica > 0) { doc.font("Helvetica").fontSize(7).fillColor("#666").text(`* Retenção Técnica: valor retido e liberado somente após a última medição do contrato. Acumulado: ${BRL(retTecnicaAcumulada)}`, mL, y); y += 13; }
          if ((medicao as any).observacoesRetencao) { doc.font("Helvetica").fontSize(7).text(`Obs.: ${(medicao as any).observacoesRetencao}`, mL, y); y += 13; }
          y += 8;
        }

        if (y > pageBottom - 70) { doc.addPage(); y = 36; }
        // ── Resumo financeiro em linha (paisagem) ──
        doc.roundedRect(mL, y, pageW, 44, 4).lineWidth(1.2).stroke(primary);
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(primary).text("RESUMO FINANCEIRO", mL + 12, y + 7);
        const summCol = (pageW - 200) / 3;
        const summItem = (label: string, valor: string, ci: number, bold = false) => {
          const x = mL + 12 + ci * summCol;
          doc.font("Helvetica").fontSize(7).fillColor("#666").text(label, x, y + 20);
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#333").text(valor, x, y + 29);
        };
        summItem("Valor Bruto do Período", BRL(totalValorPeriodo), 0);
        summItem("Retenções", `- ${BRL(totalRetencoes)}`, 1);
        summItem("Descontos + FD", `- ${BRL(descontos + totalFdPdf)}`, 2);
        doc.roundedRect(mL + pageW - 185, y + 8, 173, 28, 3).fill("#d1fae5");
        doc.font("Helvetica").fontSize(6.5).fillColor("#065f46").text("VALOR LÍQUIDO A PAGAR", mL + pageW - 177, y + 13);
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#065f46").text(BRL(valorLiquido), mL + pageW - 177, y + 21);
        y += 44 + 12;

        // ── Assinatura digital — FCSign (sem papel) ──
        if (y > pageBottom - 66) { doc.addPage(); y = 36; }
        doc.roundedRect(mL, y, pageW, 58, 4).fill("#f4f6f9");
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(primary).text("ASSINATURA DIGITAL — FCSIGN", mL + 12, y + 8);
        if (envelopeAss) {
          const envStatus: Record<string, string> = { rascunho: "Envelope criado (aguardando envio)", enviado: "Enviado para assinatura", em_andamento: "Assinaturas em andamento", concluido: "ASSINADO DIGITALMENTE", cancelado: "Envelope cancelado", recusado: "Assinatura recusada" };
          doc.font("Helvetica").fontSize(7).fillColor("#333")
            .text(`Envelope #${envelopeAss.id} · ${envStatus[envelopeAss.status] || envelopeAss.status}${envelopeAss.dataConclusao ? ` em ${new Date(envelopeAss.dataConclusao).toLocaleDateString("pt-BR")}` : ""} · Documento com hash e trilha de auditoria no módulo FCSign.`, mL + 12, y + 20, { width: pageW - 24 });
          let sx = mL + 12;
          const sigColW = Math.min(240, (pageW - 24) / Math.max(1, signatariosAss.length));
          for (const s of signatariosAss) {
            const assinado = !!s.dataAssinatura;
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(assinado ? "#065f46" : "#92600a").text(`${assinado ? "✓" : "…"} ${s.nome}`, sx, y + 34, { width: sigColW - 10, height: 9, ellipsis: true });
            doc.font("Helvetica").fontSize(6.5).fillColor("#666").text(`${s.papel === "fornecedor" ? "Contratada" : "Contratante"}${assinado ? ` — assinado em ${new Date(s.dataAssinatura).toLocaleDateString("pt-BR")}` : " — pendente"}`, sx, y + 44, { width: sigColW - 10 });
            sx += sigColW;
          }
        } else {
          doc.font("Helvetica").fontSize(7).fillColor("#333")
            .text("Este boletim é validado por assinatura eletrônica no módulo FCSign (sem papel): contratante e contratada assinam pelo link recebido, com hash do documento e trilha de auditoria. Envie para assinatura pelo botão \"Assinar no FCSign\" na medição.", mL + 12, y + 20, { width: pageW - 24 });
          const sigW = 220;
          doc.strokeColor("#9aa7b8").lineWidth(0.5);
          doc.moveTo(mL + 40, y + 46).lineTo(mL + 40 + sigW, y + 46).stroke();
          doc.moveTo(mL + pageW - 40 - sigW, y + 46).lineTo(mL + pageW - 40, y + 46).stroke();
          doc.fontSize(6.5).font("Helvetica").fillColor("#666");
          doc.text(`Contratante — ${company?.name || ""}`, mL + 40, y + 49, { width: sigW, align: "center" });
          doc.text(`Contratada — ${empresa?.razaoSocial || empresa?.nomeFantasia || ""}`, mL + pageW - 40 - sigW, y + 49, { width: sigW, align: "center" });
        }

        // ── Rev. 4834 — MEMÓRIA DE CÁLCULO / LEVANTAMENTO DE CAMPO (com fotos) ──
        const fmtQtd = (c: any) => {
          const q = n(c.quantidade);
          const un = c.unidade || (c.tipo === "area" ? "m²" : c.tipo === "perimetro" || c.tipo === "linear" ? "m" : c.tipo === "volume" ? "m³" : "");
          return `${q.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${un}`.trim();
        };
        const tipoLabel: Record<string, string> = { area: "Área", perimetro: "Perímetro / Linear", linear: "Perímetro / Linear", volume: "Volume", contagem: "Contagem", parede: "Parede" };
        for (const campo of camposPdf) {
          doc.addPage();
          // faixa-título no mesmo padrão do cabeçalho
          doc.rect(mL - 4, 36, doc.page.width - mL - mR + 8, 24).fill(primary);
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
            .text("M E M Ó R I A   D E   C Á L C U L O   —   L E V A N T A M E N T O   D E   C A M P O", mL - 4, 44, { width: doc.page.width - mL - mR + 8, align: "center" });
          y = 36 + 24 + 8;
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor(primary).text(`Levantamento ${campo.titulo}`, mL, y);
          if (campo.criadoPorNome) {
            doc.font("Helvetica").fontSize(7).fillColor("#666").text(`Realizado por: ${campo.criadoPorNome}`, mL + pageW - 240, y + 1, { width: 240, align: "right" });
          }
          y += 16;

          // tabela de contornos
          if (campo.contornos.length > 0) {
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#333").text("Contornos medidos", mL, y); y += 11;
            const cw = [34, 92, 130, pageW - 34 - 92 - 130 - 110, 110];
            const cx = [mL, mL + cw[0], mL + cw[0] + cw[1], mL + cw[0] + cw[1] + cw[2], mL + cw[0] + cw[1] + cw[2] + cw[3]];
            const headRow = () => {
              doc.rect(mL, y, pageW, 12).fill("#eef1f5");
              doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#555");
              ["Nº", "Tipo", "Local / Nome", "Item vinculado", "Quantidade"].forEach((h, i) => doc.text(h, cx[i] + 3, y + 3.5, { width: cw[i] - 6, align: i === 4 ? "right" : "left" }));
              y += 12;
            };
            headRow();
            let idxPorTipo: Record<string, number> = {};
            for (const c of campo.contornos) {
              if (y > pageBottom - 14) { doc.addPage(); y = 36; headRow(); }
              const t = tipoLabel[c.tipo] || c.tipo || "-";
              idxPorTipo[t] = (idxPorTipo[t] || 0) + 1;
              doc.rect(mL, y, pageW, 11).strokeColor("#e3e7ee").lineWidth(0.4).stroke();
              doc.font("Helvetica").fontSize(6.5).fillColor("#333");
              doc.text(String(c.numero ?? idxPorTipo[t]).padStart(3, "0"), cx[0] + 3, y + 3, { width: cw[0] - 6 });
              doc.text(t, cx[1] + 3, y + 3, { width: cw[1] - 6, height: 8, ellipsis: true });
              doc.text(c.rotulo || c.servico || "-", cx[2] + 3, y + 3, { width: cw[2] - 6, height: 8, ellipsis: true });
              doc.text(c.itemDescricao || "-", cx[3] + 3, y + 3, { width: cw[3] - 6, height: 8, ellipsis: true });
              doc.font("Helvetica-Bold").text(fmtQtd(c), cx[4] + 3, y + 3, { width: cw[4] - 6, align: "right" });
              y += 11;
            }
            y += 10;
          }

          // registro fotográfico
          const fotosOk = campo.fotos.filter(f => f.buffer);
          if (fotosOk.length > 0) {
            if (y > pageBottom - 130) { doc.addPage(); y = 36; }
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#333").text(`Registro fotográfico (${fotosOk.length})`, mL, y); y += 12;
            const perRow = 5, gap = 8;
            const cellW = (pageW - gap * (perRow - 1)) / perRow;
            const imgH = cellW * 0.72, cellH = imgH + 14;
            let col = 0;
            for (const f of fotosOk) {
              if (col === 0 && y + cellH > pageBottom) { doc.addPage(); y = 36; }
              const x = mL + col * (cellW + gap);
              try {
                doc.save();
                doc.rect(x, y, cellW, imgH).clip();
                doc.image(f.buffer as Buffer, x, y, { cover: [cellW, imgH], align: "center", valign: "center" } as any);
                doc.restore();
                doc.rect(x, y, cellW, imgH).strokeColor("#d4d9e0").lineWidth(0.5).stroke();
              } catch {
                doc.rect(x, y, cellW, imgH).fill("#f0f2f5");
                doc.font("Helvetica").fontSize(6).fillColor("#999").text("foto indisponível", x, y + imgH / 2 - 3, { width: cellW, align: "center" });
              }
              doc.font("Helvetica").fontSize(6).fillColor("#555").text((f.legenda || "").toUpperCase(), x, y + imgH + 3, { width: cellW, height: 8, ellipsis: true });
              col++;
              if (col === perRow) { col = 0; y += cellH + 6; }
            }
            if (col > 0) y += cellH + 6;
          }
        }

        // Rev. 4854 — RUBRICA EM TODAS AS PÁGINAS (pedido do usuário): cada
        // assinante que já assinou tem sua rubrica carimbada no rodapé de
        // todas as páginas do boletim (bufferPages permite revisitar).
        try {
          const rubricas = (signatariosAss || []).filter((s: any) =>
            s.status === "assinado" && typeof s.rubricaImagem === "string" && s.rubricaImagem.startsWith("data:image"));
          if (rubricas.length > 0) {
            const range = doc.bufferedPageRange();
            for (let pi = range.start; pi < range.start + range.count; pi++) {
              doc.switchToPage(pi);
              let rx = doc.page.width - 40 - rubricas.length * 48;
              const ry = doc.page.height - 30;
              for (const s of rubricas) {
                try {
                  const b64 = String(s.rubricaImagem).split(",")[1];
                  if (b64) {
                    doc.image(Buffer.from(b64, "base64"), rx, ry - 18, { fit: [44, 16] });
                    doc.font("Helvetica").fontSize(4.5).fillColor("#8a94a3")
                      .text(String(s.nome || "").split(" ")[0].toUpperCase(), rx, ry, { width: 44, align: "center", lineBreak: false });
                  }
                } catch {}
                rx += 48;
              }
            }
          }
        } catch {}

        doc.end();
      });
}
