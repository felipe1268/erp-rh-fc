import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser, getEffectiveAllowedObraIds, getUserCompanyLinks, createAuditLog } from "../db";
import { assertAiModuleEnabled, isAiModuleEnabled } from "../_core/aiConfig";
import { triggerFinancialSync } from "../services/financialEventTrigger";
import { criarParcelasFinanceiras } from "../services/purchaseFinancialBridge";
import { getTipoPagamentoInfo } from "../../shared/paymentConditions";
import { normalizarTexto } from "../../shared/textNormalization";
import { upperCaseEmpresa } from "../../shared/normalizeNomeEmpresa";
import { invokeLLM, invokeAnthropicVision } from "../_core/llm";
import { storagePut } from "../storage";
import { enviarConviteAssinatura } from "../services/integrasignEmail";
import { resolveSocioAdministradorSigner, resolveGestorObraSigner } from "../services/signatariosContrato";

const classificacaoProgress = new Map<string, { etapa: string; loteAtual: number; totalLotes: number; itensProcessados: number; totalItens: number; startedAt: number }>();
function classifKey(orcId: number, compId: number) { return `${compId}-${orcId}`; }

// Rev. 2388 — Helpers de auditoria do Almoxarifado.
// Rev. 2400 — Toggle global por empresa (exigeSenha / exigeJustificativa).
async function getAlmoxAuditoriaConfig(companyId: number) {
  const db = await getDb();
  if (!db) return { exigeSenha: true, exigeJustificativa: true, exigeAprovacao: true };
  const { companies } = await import("../../drizzle/schema");
  const [row] = await db.select({
    s: companies.almoxarifadoExigeSenha,
    j: companies.almoxarifadoExigeJustificativa,
    a: companies.almoxarifadoExigeAprovacao,
  }).from(companies).where(eq(companies.id, companyId));
  return {
    exigeSenha: row ? Number(row.s ?? 1) === 1 : true,
    exigeJustificativa: row ? Number(row.j ?? 1) === 1 : true,
    exigeAprovacao: row ? Number(row.a ?? 1) === 1 : true,
  };
}

// Rev. 2462 — Quando a empresa NÃO exige aprovação do gestor, o registro
// de auditoria entra direto como `validado` (auto-aprovado pelo próprio
// usuário que executou a ação). Mantém o rastro completo (user, hora,
// IP, antes/depois) mas não gera pendência pro gestor.
export async function getAuditoriaInicialFields(
  companyId: number,
  ctx: { user: { id: number; name?: string | null } }
): Promise<Record<string, any>> {
  const cfg = await getAlmoxAuditoriaConfig(companyId);
  if (cfg.exigeAprovacao) return {};
  return {
    statusValidacao: "validado",
    validadoPorId: ctx.user.id,
    validadoPorNome: ctx.user.name || null,
    validadoEm: new Date().toISOString(),
    observacaoValidacao: "Auto-validado: aprovação não exigida pela empresa.",
  };
}
async function verificarSenhaSeLocal(ctx: any, senha: string | undefined, exigeSenha: boolean = true) {
  // Rev. 2400 — Toggle global desliga a verificação.
  if (!exigeSenha) return;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const { users } = await import("../../drizzle/schema");
  const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  // Sem password local (OAuth) → libera com base na justificativa.
  if (!user.password) return;
  if (!senha) throw new TRPCError({ code: "BAD_REQUEST", message: "Senha obrigatória." });
  const bcrypt = await import("bcryptjs");
  if (!bcrypt.compareSync(senha, user.password)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta." });
  }
}
function justificativaFinal(j: string | undefined, exige: boolean): string {
  const t = (j ?? "").trim();
  if (exige) {
    if (t.length < 10) throw new TRPCError({ code: "BAD_REQUEST", message: "Justifique com ao menos 10 caracteres." });
    return t;
  }
  return t.length > 0 ? t : "Auditoria desabilitada nas configurações da empresa.";
}
function getClientIp(ctx: any): string | null {
  const req = ctx?.req;
  if (!req) return null;
  const xf = req.headers?.["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim().slice(0, 64);
  return (req.ip || req.socket?.remoteAddress || null)?.slice(0, 64) ?? null;
}

// Rev. 2389 — Guarda determinística pra impedir que OCs de SERVIÇO / ADMINISTRATIVO
// virem item de Almoxarifado (acontecia com Internet, Mensalidade Ponto Facial,
// Papel Timbrado, Serviço de Manutenção, etc.). Heurística por keywords no nome do
// item + unidade. Retorna razão pra logar quando bloqueia. Aplicada em:
// (1) `atualizarStatusOrdem` (OC entregue → almox) e (2) `warehouse.registerSmartEntry`
// (criação manual de item novo no recebimento inteligente).
// Rev. 2508 — implementação movida pra `shared/naturezaItemAlmox.ts`
// (passou a ser reusada também no client, na timeline de Movimentações).
// Rev. 2538 — IMPORT local (não re-export puro): `export { X } from "..."`
// NÃO cria binding no escopo do módulo, então o uso direto em
// `atualizarStatusOrdem` (L8327) quebrava em produção com
// "classificarNaturezaItemAlmox is not defined". Importamos pro escopo local
// E re-exportamos pra manter compat com `warehouse.ts` (import dinâmico).
import { classificarNaturezaItemAlmox } from "../../shared/naturezaItemAlmox";
export { classificarNaturezaItemAlmox };
import crypto from "crypto";
import { eq, and, desc, asc, ilike, or, sql, gte, lte, inArray, isNull } from "drizzle-orm";
import {
  fornecedores, avaliacoesFornecedor, almoxarifadoItens, almoxarifadoMovimentacoes,
  almoxarifadoCategorias, almoxarifadoUnidades, almoxarifadoRecebimentos,
  almoxarifadoAuditoria, almoxarifadoBaias,
  obraResponsaveisEstoque,
  comprasSolicitacoes, comprasSolicitacoesItens,
  comprasCotacoes, comprasCotacoesItens,
  comprasCotacaoFornecedores, comprasCotacaoRespostas,
  comprasCotacaoPropostas, comprasCondicoesPagamento,
  comprasOrdens, comprasOrdensItens, comprasEntregasProgramadas,
  comprasRiscoDebitos,
  comprasReservasSaldo, comprasReservasLog,
  users,
  obras,
  orcamentos, orcamentoItens, orcamentoInsumos,
  composicaoInsumos, composicoesCatalogo, insumosCatalogo,
  bdiIndiretos, orcamentoBdi,
  planejamentoProjetos, planejamentoRevisoes, planejamentoAtividades,
  financialEntries, financialAccounts,
  purchaseAccountsPayable,
  almoxarifadoNotificacoes,
  purchaseOrders, purchaseRequests, purchaseQuotations,
  budgetReallocations,
  ocNumberConfig, pjContracts, pjDocumentos, bdiFd, fdAjustes, medicaoFdRegistros, medicaoContratos,
  integrasignEnvelopes, integrasignSignatarios, integrasignAuditLog,
  terceiroContratos, terceiroContratoItens, empresasTerceiras,
  disciplinaClassificacoes, disciplinaCorrecoes,
} from "../../drizzle/schema";
const n = (v: any) => parseFloat(v ?? "0") || 0;

// Rev. 1607 — Classificador IA do tipo de controle do item de almoxarifado.
// Decide se o item é de "estoque" (controle normal de saldo) ou "aplicacao_direta"
// (recebido e aplicado na obra na mesma hora — concreto usinado, argamassa pronta,
// asfalto a quente, fibras, aditivos químicos prontos para uso, locação de equipamento etc.).
// Default seguro = "estoque" em caso de dúvida.
async function classificarTipoControleIA(args: {
  nome: string;
  categoria?: string;
  unidade?: string;
}): Promise<{ tipoControle: "estoque" | "aplicacao_direta"; justificativa: string; confianca: "alta" | "media" | "baixa" }> {
  const result = await invokeLLM({
    messages: [{
      role: "user",
      content: `Você é um especialista em logística de obras de construção civil pesada e edificações no Brasil.

Sua tarefa: classificar o item abaixo em um dos dois tipos de controle de almoxarifado:

1) "estoque" → Item que é guardado no almoxarifado e tem controle de saldo (entrada/saída).
   Ex.: cimento em sacos, areia ensacada, parafusos, tintas, ferramentas, EPIs, ferro, madeira,
   tubos, conexões, registros, fios, lâmpadas, brita ensacada, materiais de pintura, miudezas.

2) "aplicacao_direta" → Item recebido na obra e aplicado/consumido IMEDIATAMENTE,
   que NÃO faz sentido guardar no almoxarifado porque tem cura, validade curtíssima
   (perecível em horas), ou é entregue por caminhão direto no ponto de uso.
   Ex.: concreto usinado (m³), argamassa industrializada pronta em silo, graute fluido pronto,
   asfalto CBUQ a quente, emulsão asfáltica em obra, brita/areia a granel descarregada na pista,
   solo-cimento usinado, gesso projetado em obra, jato de areia em obra, locação de bomba/grua/guindaste
   por hora-máquina, serviços de bombeamento de concreto, mão-de-obra terceirizada.

REGRA DE OURO: na dúvida, classifique como "estoque" (mais seguro — pode ser corrigido depois).
Só use "aplicacao_direta" quando há ALTA confiança de que o item é consumido na hora.

Item:
- Nome: ${args.nome}
${args.categoria ? `- Categoria: ${args.categoria}` : ""}
${args.unidade ? `- Unidade: ${args.unidade}` : ""}

Responda APENAS com um objeto JSON no formato:
{
  "tipoControle": "estoque" | "aplicacao_direta",
  "justificativa": "<1 frase curta explicando o motivo>",
  "confianca": "alta" | "media" | "baixa"
}`,
    }],
    maxTokens: 200,
  });
  const text = (result.content ?? "").toString();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("IA não retornou JSON válido");
  const parsed = JSON.parse(match[0]);
  const tipo = parsed.tipoControle === "aplicacao_direta" ? "aplicacao_direta" : "estoque";
  // Por segurança, baixa confiança vira "estoque" para não bloquear o fluxo.
  const tipoFinal = (tipo === "aplicacao_direta" && parsed.confianca === "baixa") ? "estoque" : tipo;
  return {
    tipoControle: tipoFinal,
    justificativa: String(parsed.justificativa || "").slice(0, 500),
    confianca: parsed.confianca === "alta" ? "alta" : parsed.confianca === "baixa" ? "baixa" : "media",
  };
}

type InsumoWithAlloc = { alocacaoMat?: any; alocacaoMdo?: any; alocacaoEquip?: any; [k: string]: any };
function filterInsumosByTipo(insumos: InsumoWithAlloc[], scTipo: string, incluirEquip = false): InsumoWithAlloc[] {
  return insumos.filter(i => {
    const mat = n(i.alocacaoMat);
    const mdo = n(i.alocacaoMdo);
    const equip = n(i.alocacaoEquip);
    const isEquip = equip > 0 || (mat === 0 && mdo === 0);
    if (scTipo === 'material') return mat > 0;
    if (scTipo === 'servico') return mdo > 0;
    if (scTipo === 'equipamento') return isEquip;
    if (scTipo === 'pacote') return incluirEquip ? true : !isEquip;
    return mat > 0;
  });
}

const iaExtractionJobs = new Map<string, { status: string; startedAt: number; result?: any; error?: string }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of iaExtractionJobs) {
    if (now - v.startedAt > 10 * 60 * 1000) iaExtractionJobs.delete(k);
  }
}, 60000);

/**
 * Rev. 1985 — Gera próximo número de OC/OS de forma ATÔMICA (fix race C1).
 *
 * Bug original (Rev. <=1984): código fazia read-then-write em duas operações
 * separadas (SELECT proximo_numero_os → UPDATE +1). Dois compradores
 * simultâneos liam o mesmo valor e gravavam o mesmo número → duplicidade.
 * Material usava COUNT(*) — mesmo problema, agravado se algum OC fosse
 * apagado no histórico.
 *
 * Solução: pg_advisory_xact_lock por companyId+escopo dentro de transação.
 * Lock serializa apenas a numeração — não toca outras tabelas, não bloqueia
 * leituras. Padrão já usado em `fechamentoPonto.ts` e `comunicadosInternos.ts`.
 *
 * Escopo 1001 = "compras_numeration" (compartilhado entre OS e OC material
 * por simplicidade — disputa só com outro chamador desta mesma função na
 * mesma empresa, milissegundos).
 */
export async function gerarProximoNumeroOC(companyId: number, ordemTipo: "compra" | "servico" | "pacote"): Promise<string> {
  const db = await getDb();
  return await db.transaction(async (tx: any) => {
    // Rev. 2080 — cast `::int` em AMBOS os args. Postgres não tem overload
    // `pg_advisory_xact_lock(bigint, int)` — só `(bigint)` ou `(int, int)`.
    // O cast errado quebrava criação de OC em produção ("function does not exist").
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${companyId}::int, 1001::int)`);
    const year = new Date().getFullYear();

    // Rev. 1988 — Pós-revisão arquitetural: contador agora é PERSISTIDO dentro
    // do lock pra TODOS os tipos (material/servico/pacote). Lock + COUNT(*)
    // sozinhos não bastam porque o INSERT da OC acontece DEPOIS, fora da
    // transação — duas chamadas concorrentes liam o mesmo COUNT antes do
    // primeiro insert e duplicavam. Solução: usar coluna `proximoNumero` do
    // `ocNumberConfig` (que já existia como legado/default 1) como contador
    // persistente pra OC material. Schema INTACTO (zero ALTER — coluna já
    // existe). Bootstrap por COUNT(*) só na PRIMEIRA chamada (ou se
    // proximoNumero estiver no valor padrão 1 e já houver OCs históricas).
    const [config] = await tx.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, companyId)).limit(1);

    if (ordemTipo === "compra") {
      const prefMat = "OC";
      const digitos = config?.digitosSequencial ?? 4;
      // Bootstrap: se proximoNumero é o default (1) e já existem OCs, calcula a partir do count atual.
      let proxMat = config?.proximoNumero ?? 1;
      // Rev. 2483 — Bootstrap por MAX(seq parsed do numeroOc) ao invés de COUNT(*).
      // COUNT(*) era inflado por rascunhos (RASCUNHO-YYYY-N) e desconsiderava OCs
      // deletadas — podia subestimar/superestimar o próximo. Parsing do prefixo
      // OC-YYYY- garante alinhamento real com o que o usuário vê.
      if (proxMat <= 1) {
        // NB: barras duplas \\d são obrigatórias — em template literal JS, \d
        // vira "d" (cooked string), então sem o escape o regex enviado ao
        // Postgres seria '^OC-d{4}-(d+)$' e nunca casaria. Bug pego no code
        // review da Rev. 2483.
        const maxRow = await tx.execute(sql`
          SELECT COALESCE(MAX(CAST(SUBSTRING(numero_oc FROM '^OC-\\d{4}-(\\d+)$') AS INTEGER)), 0) AS m
          FROM compras_ordens
          WHERE company_id = ${companyId}
            AND numero_oc ~ '^OC-\\d{4}-\\d+$'
        `);
        const r = (maxRow as any).rows || maxRow;
        const atual = parseInt(String(r?.[0]?.m ?? 0)) || 0;
        proxMat = Math.max(atual + 1, proxMat);
      }
      if (!config) {
        await tx.insert(ocNumberConfig).values({ companyId, proximoNumero: proxMat + 1, prefixo: prefMat } as any);
      } else {
        await tx.update(ocNumberConfig)
          .set({ proximoNumero: proxMat + 1, updatedAt: new Date().toISOString() } as any)
          .where(eq(ocNumberConfig.companyId, companyId));
      }
      return `${prefMat}-${year}-${String(proxMat).padStart(digitos, "0")}`;
    }

    // Serviço/Pacote: numeração via tabela de configuração.
    if (!config) {
      // Primeira OS desta empresa: insere config com próximo=2, retorna 1.
      await tx.insert(ocNumberConfig).values({ companyId, proximoNumeroOs: 2, prefixoOs: "OS" } as any);
      return `OS-${year}-${"1".padStart(3, "0")}`;
    }
    const proxOs = config.proximoNumeroOs ?? 1;
    const prefOs = config.prefixoOs ?? "OS";
    const digitos = config.digitosSequencial ?? 3;
    await tx.update(ocNumberConfig)
      .set({ proximoNumeroOs: proxOs + 1, updatedAt: new Date().toISOString() } as any)
      .where(eq(ocNumberConfig.companyId, companyId));
    return `${prefOs}-${year}-${String(proxOs).padStart(digitos, "0")}`;
  });
}

/**
 * Rev. 4006 — Código automático de material (Almoxarifado).
 *
 * Todos os 2823 materiais existentes foram renumerados para o padrão
 * MAT-NNNN (4 dígitos, sequencial por empresa, ordem de criação) via
 * migração pontual direto no Neon. Esta função garante que TODO material
 * novo cadastrado (manual, auto-cadastro via OC/recebimento, importação
 * MasControle) saia com código nesse mesmo padrão, sem duplicidade em
 * concorrência.
 *
 * Mesmo padrão de `gerarProximoNumeroOC`: pg_advisory_xact_lock por
 * companyId (escopo 1010 = "almoxarifado_codigo_material") DENTRO da
 * transação que faz o INSERT — lock + leitura do MAX + insert atômicos,
 * evita corrida entre 2 cadastros simultâneos gerando o mesmo código.
 */
export async function criarItemAlmoxarifadoComCodigo(
  db: any,
  companyId: number,
  values: Record<string, any>,
): Promise<any> {
  return await db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${companyId}::int, 1010::int)`);
    let codigoInterno = values.codigoInterno;
    if (!codigoInterno) {
      const maxRow: any = await tx.execute(sql`
        SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_interno FROM '^MAT-(\\d+)$') AS INTEGER)), 0) AS m
        FROM almoxarifado_itens
        WHERE company_id = ${companyId}
          AND codigo_interno ~ '^MAT-\\d+$'
      `);
      const rows = maxRow.rows || maxRow;
      const proximo = (Number(rows?.[0]?.m) || 0) + 1;
      codigoInterno = `MAT-${String(proximo).padStart(4, "0")}`;
    }
    const [item] = await tx.insert(almoxarifadoItens).values({
      ...values,
      // Rev. 4010 — padroniza nome (1ª maiúscula + resto minúsculo) independente
      // de como a origem (usuário/import/OC) digitou/gravou o nome.
      nome: values.nome != null ? sql`padronizar_nome_material(${values.nome}::text)` : values.nome,
      codigoInterno,
    } as any).returning();
    return item;
  });
}

async function gerarContratoTerceiroDeOS(params: {
  ocId: number;
  companyId: number;
  obraId: number | null;
  fornecedorId: number;
  fornecedorNome: string | null;
  total: number;
  itensOS: Array<{ descricao: string; unidade?: string | null; quantidade: string; precoUnitario: string; total: string; insumoCodigo?: string | null; eapCodigo?: string | null }>;
  userId: number;
  userName: string;
  moduloMedicao?: string | null;
}) {
  const db = await getDb();
  try {
    const existCheck = await db.execute(sql`
      SELECT tc.id, tc.numero_contrato as "numeroContrato"
      FROM terceiro_contratos tc
      WHERE tc.company_id = ${params.companyId}
        AND EXISTS (SELECT 1 FROM compras_ordens co WHERE co.id = ${params.ocId} AND co.contrato_id = tc.id)
      LIMIT 1
    `);
    const existingTC = (existCheck as any).rows?.[0];
    if (existingTC) {
      console.log(`[gerarContratoTerceiroDeOS] Contrato Terceiro #${existingTC.id} já existe para OC #${params.ocId}, ignorando duplicata`);
      return { id: existingTC.id, numeroContrato: existingTC.numeroContrato, terceiroContratoId: existingTC.id };
    }

    // Rev. 1986 — BUGFIX C2 · numeração de contrato CT-YYYY-NNNN agora ATÔMICA.
    // Bug original: COUNT(*) + INSERT em operações separadas → 2 contratos
    // simultâneos pra mesma empresa recebiam o MESMO número.
    // Solução: pg_advisory_xact_lock(companyId, 1002) dentro de transação
    // envolvendo TODO o fluxo (lookup empresa terceira + count + insert).
    // Escopo 1002 = "contracts_numeration" (distinto do 1001 de OC/OS).
    const txResult = await db.transaction(async (tx: any) => {
      // Rev. 2080 — cast `::int` em AMBOS os args (era `::bigint` errado).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${params.companyId}::int, 1002::int)`);

      const [forn] = await tx.select().from(fornecedores).where(and(eq(fornecedores.id, params.fornecedorId), eq(fornecedores.companyId, params.companyId)));
      const cnpjRaw = forn?.cnpj?.trim() || "";
      const cnpj = cnpjRaw.replace(/\D/g, "").length >= 11 ? cnpjRaw : "";
      const razaoSocial = forn?.razaoSocial ?? params.fornecedorNome ?? "";

      const ano = new Date().getFullYear();
      const countContratos = await tx.execute(sql`
        SELECT COUNT(*) as c FROM terceiro_contratos WHERE company_id = ${params.companyId}
      `);
      const seqC = (parseInt(String((countContratos as any).rows?.[0]?.c ?? "0")) + 1).toString().padStart(4, "0");
      const numContrato = `CT-${ano}-${seqC}`;

      let hoje = new Date().toISOString().slice(0, 10);
      let dataFim = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);

      if (params.obraId) {
        try {
          const descricoes = params.itensOS
            .map(it => {
              let d = it.descricao || "";
              d = d.replace(/^\[[^\]]+\]\s*/, "").trim().toLowerCase();
              return d;
            })
            .filter(d => d.length > 5);

          let found = false;
          if (descricoes.length > 0) {
            const escapeLike = (s: string) => s.replace(/[%_\\]/g, c => "\\" + c);
            const likeClauses = descricoes.map(d => sql`LOWER(pa.nome) LIKE ${"%" + escapeLike(d.slice(0, 40)) + "%"} ESCAPE '\\'`);
            const cronoDates = await tx.execute(sql`
              SELECT MIN(pa.data_inicio) as primeiro_inicio, MAX(pa.data_fim) as ultimo_termino
              FROM planejamento_projetos pp
              JOIN planejamento_atividades pa ON pa.projeto_id = pp.id
              WHERE pp.obra_id = ${params.obraId}
                AND pa.data_inicio IS NOT NULL
                AND (${sql.join(likeClauses, sql` OR `)})
            `);
            const row = (cronoDates as any).rows?.[0];
            if (row?.primeiro_inicio) { hoje = String(row.primeiro_inicio).slice(0, 10); found = true; }
            if (row?.ultimo_termino) { dataFim = String(row.ultimo_termino).slice(0, 10); found = true; }
            if (found) console.log(`[gerarContratoTerceiroDeOS] Datas do cronograma (por nome): ${hoje} a ${dataFim}`);
          }

          if (!found) {
            const fallback = await tx.execute(sql`
              SELECT MIN(pa.data_inicio) as primeiro_inicio, MAX(pa.data_fim) as ultimo_termino
              FROM planejamento_projetos pp
              JOIN planejamento_atividades pa ON pa.projeto_id = pp.id
              WHERE pp.obra_id = ${params.obraId} AND pa.data_inicio IS NOT NULL
            `);
            const fbRow = (fallback as any).rows?.[0];
            if (fbRow?.primeiro_inicio) hoje = String(fbRow.primeiro_inicio).slice(0, 10);
            if (fbRow?.ultimo_termino) dataFim = String(fbRow.ultimo_termino).slice(0, 10);
            console.log(`[gerarContratoTerceiroDeOS] Datas do cronograma (fallback obra): ${hoje} a ${dataFim}`);
          }
        } catch (e: any) {
          console.error(`[gerarContratoTerceiroDeOS] Erro ao buscar datas cronograma:`, e?.message);
        }
      }

      let empTerceiraId: number | null = null;
      if (cnpj) {
        const [existEmp] = await tx.select({ id: empresasTerceiras.id }).from(empresasTerceiras)
          .where(and(eq(empresasTerceiras.companyId, params.companyId), eq(empresasTerceiras.cnpj, cnpj))).limit(1);
        if (existEmp) {
          empTerceiraId = existEmp.id;
        } else {
          const [novaEmp] = await tx.insert(empresasTerceiras).values({
            companyId: params.companyId,
            razaoSocial: upperCaseEmpresa(razaoSocial || params.fornecedorNome || "Empresa Terceira"),
            cnpj,
            responsavelNome: razaoSocial || params.fornecedorNome || "",
            status: "ativa",
            fornecedorId: params.fornecedorId,
          } as any).returning();
          empTerceiraId = novaEmp.id;
        }
      } else {
        const nomeEmpresa = upperCaseEmpresa(razaoSocial || params.fornecedorNome || "Empresa Terceira");
        const existEmpByName = await tx.execute(sql`
          SELECT id FROM empresas_terceiras WHERE "companyId" = ${params.companyId} AND razao_social = ${nomeEmpresa} AND (cnpj IS NULL OR cnpj = '') LIMIT 1
        `);
        if ((existEmpByName as any).rows?.length > 0) {
          empTerceiraId = (existEmpByName as any).rows[0].id;
        } else {
          const insertEmpRes = await tx.execute(sql`
            INSERT INTO empresas_terceiras ("companyId", razao_social, cnpj, responsavel_nome, status, fornecedor_id, created_at, updated_at)
            VALUES (${params.companyId}, ${nomeEmpresa}, '', ${nomeEmpresa}, 'ativa', ${params.fornecedorId}, NOW(), NOW())
            RETURNING id
          `);
          empTerceiraId = (insertEmpRes as any).rows[0].id;
        }
      }

      if (!empTerceiraId) {
        console.error(`[gerarContratoTerceiroDeOS] Não foi possível criar/encontrar empresa terceira para OC #${params.ocId}`);
        return null;
      }

      const obraNome = params.obraId ? (await tx.select({ nome: obras.nome }).from(obras).where(eq(obras.id, params.obraId)).limit(1))?.[0]?.nome ?? null : null;
      const itensDescr = params.itensOS.map(it => `${it.descricao} — ${it.quantidade} ${it.unidade || "un"}`).join("; ");
      const tipoContratoMap: Record<string, string> = {
        medicao_mensal: "preco_unitario",
        medicao_avanco: "preco_unitario",
        medicao_etapa: "preco_unitario",
        empreitada: "empreitada_global",
        administracao: "administracao",
      };
      const tipoContratoTC = tipoContratoMap[params.moduloMedicao ?? ""] ?? "empreitada_global";

      // Rev. 3040 — nome do contrato HERDA o título da Solicitação (SC) que originou
      // a OC (cadeia OC→cotação→SC). Mantém a padronização definida pelo solicitante
      // (ex.: "Forro de Gesso") em vez do auto-gerado "Prestação de serviços — OS N: ...".
      // Fallback p/ o concat antigo quando a SC não tem título ou a cadeia está incompleta.
      let scTitulo = "";
      try {
        const scRows = await tx
          .select({ titulo: comprasSolicitacoes.titulo })
          .from(comprasOrdens)
          .innerJoin(comprasCotacoes, eq(comprasCotacoes.id, comprasOrdens.cotacaoId))
          .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoes.id, comprasCotacoes.solicitacaoId))
          .where(eq(comprasOrdens.id, params.ocId))
          .limit(1);
        scTitulo = (scRows?.[0]?.titulo ?? "").trim();
      } catch (e: any) {
        console.error(`[gerarContratoTerceiroDeOS] Erro ao buscar título da SC:`, e?.message);
      }
      const descricaoContrato = (scTitulo
        ? scTitulo
        : `Prestação de serviços — OS ${params.ocId}: ${itensDescr}`).slice(0, 500);

      const [tcInner] = await tx.insert(terceiroContratos).values({
        companyId: params.companyId,
        empresaTerceiraId: empTerceiraId,
        obraId: params.obraId,
        obraNome: obraNome,
        numeroContrato: numContrato,
        descricao: descricaoContrato,
        tipoContrato: tipoContratoTC,
        valorTotal: String(params.total.toFixed(2)),
        dataInicio: hoje,
        dataTermino: dataFim,
        status: "ativo",
        criadoPor: params.userName,
      }).returning();
      return { tc: tcInner, numContrato, empTerceiraId };
    });

    if (!txResult || !txResult.tc) {
      // empresa terceira não pôde ser criada — abortar contrato
      return null;
    }
    const tc = txResult.tc;
    const numContrato = txResult.numContrato;
    const empTerceiraId = txResult.empTerceiraId;

    for (let i = 0; i < params.itensOS.length; i++) {
      const it = params.itensOS[i];
      await db.insert(terceiroContratoItens).values({
        contratoId: tc.id,
        companyId: params.companyId,
        eapCodigo: (it as any).eapCodigo ?? null,
        descricao: it.descricao,
        unidade: it.unidade || "un",
        quantidade: it.quantidade,
        valorUnitario: it.precoUnitario,
        valorTotal: it.total,
        ordem: i + 1,
      });
    }

    await db.update(comprasOrdens).set({
      contratoId: tc.id,
      atualizadoEm: new Date().toISOString(),
    } as any).where(eq(comprasOrdens.id, params.ocId));

    console.log(`[gerarContratoTerceiroDeOS] Contrato Terceiro #${tc.id} (${numContrato}) criado para empresa #${empTerceiraId} — OC #${params.ocId}`);
    return { id: tc.id, numeroContrato: numContrato, terceiroContratoId: tc.id };
  } catch (err: any) {
    console.error(`[gerarContratoTerceiroDeOS] Erro FATAL:`, err?.message);
    return null;
  }
}

async function criarEnvelopeIntegraSign(params: {
  companyId: number;
  ocId: number;
  contratoId: number;
  obraId: number | null;
  titulo: string;
  textoContrato: string;
  fornecedorNome: string;
  fornecedorEmail: string;
  fornecedorCnpj: string;
  userId: number;
  userName: string;
}) {
  const db = await getDb();
  try {
    const [existing] = await db.select({ id: integrasignEnvelopes.id })
      .from(integrasignEnvelopes)
      .where(and(
        eq(integrasignEnvelopes.companyId, params.companyId),
        eq(integrasignEnvelopes.ordemCompraId, params.ocId),
        sql`${integrasignEnvelopes.status} NOT IN ('cancelado', 'expirado', 'recusado')`,
      ))
      .limit(1);
    if (existing) {
      console.log(`[IntegraSign] Envelope já existe para OC #${params.ocId}, ignorando duplicata`);
      return existing;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [envelope] = await db.insert(integrasignEnvelopes).values({
      companyId: params.companyId,
      contratoTerceiroId: params.contratoId,
      ordemCompraId: params.ocId,
      obraId: params.obraId,
      titulo: params.titulo,
      descricao: `Contrato de serviço gerado automaticamente via OC — ${params.fornecedorNome}`,
      textoContrato: params.textoContrato,
      status: "rascunho",
      totalSignatariosObrigatorios: 3,
      criadoPorId: params.userId,
      criadoPorNome: params.userName,
    }).returning();

    // Rev. 3050 — TODO contrato é assinado por 3 signatários (cada um com seus
    // respectivos dados): FORNECEDOR + GESTOR DA OBRA + SÓCIO ADMINISTRADOR.
    // O gestor da obra vem do responsável cadastrado na obra (fallback: quem gerou
    // a OC); o sócio administrador é o definido em Configurações → Sócios. Fallbacks
    // robustos garantem que qualquer falha NÃO quebre a criação do envelope.
    const socioAdmin = await resolveSocioAdministradorSigner(db, params.companyId);
    const gestorObra = await resolveGestorObraSigner(db, params.companyId, params.obraId);

    const signatarios = [
      { papel: "fornecedor", ordem: 1, nome: params.fornecedorNome, email: params.fornecedorEmail, cpfCnpj: params.fornecedorCnpj, cargo: "Representante Legal", empresaNome: params.fornecedorNome },
      { papel: "gestor_projeto", ordem: 2, nome: gestorObra.nome || params.userName, email: "", cpfCnpj: gestorObra.cpfCnpj, cargo: "Gestor da Obra", empresaNome: "FC Engenharia" },
      { papel: "diretor", ordem: 3, nome: socioAdmin.nome, email: "", cpfCnpj: socioAdmin.cpfCnpj, cargo: "Sócio Administrador", empresaNome: "FC Engenharia" },
    ];

    for (const sig of signatarios) {
      await db.insert(integrasignSignatarios).values({
        companyId: params.companyId,
        envelopeId: envelope.id,
        papel: sig.papel,
        ordemAssinatura: sig.ordem,
        nome: sig.nome,
        email: sig.email,
        cpfCnpj: sig.cpfCnpj ?? null,
        cargo: sig.cargo,
        empresaNome: sig.empresaNome,
        token: crypto.randomBytes(48).toString("hex"),
        tokenExpiraEm: expiresAt.toISOString(),
        status: "pendente",
      });
    }

    await db.insert(integrasignAuditLog).values({
      companyId: params.companyId,
      envelopeId: envelope.id,
      acao: "envelope_criado_auto",
      detalhes: `Envelope criado automaticamente a partir da aprovação da OC. Contrato #${params.contratoId}`,
      userId: params.userId,
      userName: params.userName,
    });

    console.log(`[IntegraSign] Envelope #${envelope.id} criado automaticamente para OC #${params.ocId} → Contrato #${params.contratoId}`);
    return envelope;
  } catch (err: any) {
    console.error(`[IntegraSign] Erro ao criar envelope automático:`, err?.message);
    return null;
  }
}

const conversaoCache = new Map<string, { unidadeComercial: string; fatorConversao: number; embalagem: string }>();

async function ensureConversaoCacheTable() {
  const db = await getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS insumos_conversao_cache (
      chave TEXT PRIMARY KEY,
      unidade_comercial TEXT NOT NULL,
      fator_conversao NUMERIC NOT NULL,
      embalagem TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}
let conversaoTableReady = false;

async function getConversaoIA(insumos: { descricao: string; unidade: string }[]): Promise<Record<string, { unidadeComercial: string; fatorConversao: number; embalagem: string }>> {
  if (!conversaoTableReady) {
    await ensureConversaoCacheTable();
    conversaoTableReady = true;
  }
  const db = await getDb();

  const toResolve: { descricao: string; unidade: string; chave: string }[] = [];
  const result: Record<string, { unidadeComercial: string; fatorConversao: number; embalagem: string }> = {};

  for (const ins of insumos) {
    const chave = `${ins.descricao.toLowerCase().trim()}|${ins.unidade.toLowerCase().trim()}`;
    if (conversaoCache.has(chave)) {
      result[chave] = conversaoCache.get(chave)!;
      continue;
    }
    const dbRow = await db.execute(sql`SELECT unidade_comercial, fator_conversao, embalagem FROM insumos_conversao_cache WHERE chave = ${chave} LIMIT 1`);
    const rows = (dbRow as any).rows || [];
    if (rows.length > 0) {
      const cached = { unidadeComercial: rows[0].unidade_comercial, fatorConversao: parseFloat(rows[0].fator_conversao), embalagem: rows[0].embalagem };
      conversaoCache.set(chave, cached);
      result[chave] = cached;
      continue;
    }
    toResolve.push({ ...ins, chave });
  }

  if (toResolve.length === 0) return result;

  const batchSize = 20;
  for (let i = 0; i < toResolve.length; i += batchSize) {
    const batch = toResolve.slice(i, i + batchSize);
    const lista = batch.map((b, idx) => `${idx + 1}. "${b.descricao}" (unidade orçamento: ${b.unidade})`).join("\n");

    try {
      const aiResult = await invokeLLM({
        messages: [
          { role: "system", content: `Você é um especialista em materiais de construção civil no Brasil. Para cada insumo, informe como ele é REALMENTE vendido no mercado (embalagem comercial, unidade de venda, fator de conversão).

REGRAS:
- Responda APENAS com JSON válido, sem markdown
- O JSON deve ser um array de objetos com: idx, embalagem, unidadeComercial, fatorConversao
- embalagem: descrição curta da embalagem comercial real (ex: "saco 50kg", "balde 18L", "tambor 200L", "barra 12m", "caminhão 6m³", "m²", "m³")
- unidadeComercial: unidade de venda (ex: "saco", "balde", "lata", "galão", "barra", "caminhão", "m²", "rolo")
- fatorConversao: quantas unidades orçadas cabem em 1 embalagem comercial (ex: 1 saco de cimento = 50kg, então fator = 50)
- Se o insumo já é vendido na mesma unidade do orçamento (ex: m², m³, un), retorne fatorConversao = 1 e embalagem = unidade original
- NÃO invente embalagens que não existem no mercado. Cal líquido é vendido em baldes/tambores, não em sacos.
- Considere as formas de comercialização mais comuns no mercado brasileiro de construção civil` },
          { role: "user", content: `Determine a embalagem comercial real para cada insumo:\n${lista}` }
        ],
        maxTokens: 2048,
      });

      const content = aiResult.choices[0]?.message?.content || "";
      const textContent = typeof content === "string" ? content : (content as any[]).map((c: any) => c.text || "").join("");
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { idx: number; embalagem: string; unidadeComercial: string; fatorConversao: number }[];
        for (const item of parsed) {
          const batchItem = batch[item.idx - 1];
          if (!batchItem) continue;
          const fator = Number(item.fatorConversao);
          if (!isFinite(fator) || fator <= 0) continue;
          const conv = { unidadeComercial: item.unidadeComercial || "", fatorConversao: fator, embalagem: item.embalagem || "" };
          result[batchItem.chave] = conv;
          conversaoCache.set(batchItem.chave, conv);
          try {
            await db.execute(sql`INSERT INTO insumos_conversao_cache (chave, unidade_comercial, fator_conversao, embalagem) VALUES (${batchItem.chave}, ${conv.unidadeComercial}, ${conv.fatorConversao}, ${conv.embalagem}) ON CONFLICT (chave) DO UPDATE SET unidade_comercial = ${conv.unidadeComercial}, fator_conversao = ${conv.fatorConversao}, embalagem = ${conv.embalagem}`);
          } catch {}
        }
      }
    } catch (e: any) {
      console.error("[ConversaoIA] Erro:", e.message);
    }
  }

  return result;
}

async function calcScoreFornecedor(db: any, fornecedorId: number, companyId: number) {
  const ocsRows = await db.select().from(comprasOrdens)
    .where(and(
      eq(comprasOrdens.companyId, companyId),
      eq(comprasOrdens.fornecedorId, fornecedorId),
    ));

  const totalOCs = ocsRows.length;
  let ocsPontuais = 0;
  let ocsComData = 0;
  let totalValorOCs = 0;

  for (const oc of ocsRows) {
    totalValorOCs += n(oc.total);
    if (oc.dataEntregaPrevista && oc.dataEntregaReal) {
      ocsComData++;
      if (new Date(oc.dataEntregaReal) <= new Date(oc.dataEntregaPrevista)) ocsPontuais++;
    } else if (oc.dataEntregaPrevista && !oc.dataEntregaReal && oc.status === "entregue") {
      ocsComData++;
      ocsPontuais++;
    }
  }
  const taxaPontualidade = ocsComData > 0 ? ocsPontuais / ocsComData : 1;

  const companyCotIds = await db.select({ id: comprasCotacoes.id })
    .from(comprasCotacoes).where(eq(comprasCotacoes.companyId, companyId));
  const cotIdSet = new Set(companyCotIds.map((c: any) => c.id));

  const cotacoesParticipadas = cotIdSet.size > 0
    ? await db.select({
        cotacaoId: comprasCotacaoFornecedores.cotacaoId,
        totalOrcado: comprasCotacaoFornecedores.totalOrcado,
        selecionado: comprasCotacaoFornecedores.selecionado,
        prazoEntregaDias: comprasCotacaoFornecedores.prazoEntregaDias,
      }).from(comprasCotacaoFornecedores)
        .where(and(
          eq(comprasCotacaoFornecedores.fornecedorId, fornecedorId),
          inArray(comprasCotacaoFornecedores.cotacaoId, [...cotIdSet]),
        ))
    : [];

  let cotacoesVencidas = 0;
  let cotacoesComPreco = 0;
  let melhorPrecoCount = 0;
  let cotacoesComPrazo = 0;
  let melhorPrazoCount = 0;

  if (cotacoesParticipadas.length > 0) {
    const participatedCotIds = [...new Set(cotacoesParticipadas.map((cp: any) => cp.cotacaoId))];
    const allPartRows = await db.select({
      cotacaoId: comprasCotacaoFornecedores.cotacaoId,
      fornecedorId: comprasCotacaoFornecedores.fornecedorId,
      totalOrcado: comprasCotacaoFornecedores.totalOrcado,
      prazoEntregaDias: comprasCotacaoFornecedores.prazoEntregaDias,
    }).from(comprasCotacaoFornecedores)
      .where(inArray(comprasCotacaoFornecedores.cotacaoId, participatedCotIds));

    const minPriceByCot: Record<number, number> = {};
    const minPrazoByCot: Record<number, number> = {};
    for (const row of allPartRows) {
      const v = n(row.totalOrcado);
      if (v > 0 && (!(row.cotacaoId in minPriceByCot) || v < minPriceByCot[row.cotacaoId])) {
        minPriceByCot[row.cotacaoId] = v;
      }
      const prazo = row.prazoEntregaDias ?? 0;
      if (prazo > 0 && (!(row.cotacaoId in minPrazoByCot) || prazo < minPrazoByCot[row.cotacaoId])) {
        minPrazoByCot[row.cotacaoId] = prazo;
      }
    }

    for (const cp of cotacoesParticipadas) {
      const totalForn = n(cp.totalOrcado);
      if (totalForn > 0) {
        cotacoesComPreco++;
        if (cp.selecionado) cotacoesVencidas++;
        if (totalForn <= (minPriceByCot[cp.cotacaoId] ?? Infinity)) melhorPrecoCount++;
      }
      const prazo = cp.prazoEntregaDias ?? 0;
      if (prazo > 0) {
        cotacoesComPrazo++;
        if (prazo <= (minPrazoByCot[cp.cotacaoId] ?? Infinity)) melhorPrazoCount++;
      }
    }
  }
  const taxaCompetitividade = cotacoesComPreco > 0 ? melhorPrecoCount / cotacoesComPreco : 0;
  const taxaPrazoEntrega = cotacoesComPrazo > 0 ? melhorPrazoCount / cotacoesComPrazo : 0;

  const avaliacoesRows = await db.select({
      nota: avaliacoesFornecedor.nota,
      comentario: avaliacoesFornecedor.comentario,
      criadoEm: avaliacoesFornecedor.criadoEm,
    })
    .from(avaliacoesFornecedor)
    .where(and(
      eq(avaliacoesFornecedor.fornecedorId, fornecedorId),
      eq(avaliacoesFornecedor.companyId, companyId),
    ))
    .orderBy(desc(avaliacoesFornecedor.criadoEm));
  const mediaAvaliacoes = avaliacoesRows.length > 0
    ? avaliacoesRows.reduce((s: number, r: any) => s + r.nota, 0) / avaliacoesRows.length
    : 0;
  const totalAvaliacoes = avaliacoesRows.length;
  const ultimasAvaliacoes = avaliacoesRows.slice(0, 5).map((a: any) => ({
    nota: a.nota,
    comentario: a.comentario,
    criadoEm: a.criadoEm,
  }));

  const ocIds = ocsRows.map((oc: any) => oc.id);
  let totalRecebimentos = 0;
  let totalDivergencias = 0;
  if (ocIds.length > 0) {
    const recebimentosRows = await db.select({
      temDivergencia: almoxarifadoRecebimentos.temDivergencia,
    }).from(almoxarifadoRecebimentos)
      .where(and(
        eq(almoxarifadoRecebimentos.companyId, companyId),
        inArray(almoxarifadoRecebimentos.ordemCompraId, ocIds),
      ));
    totalRecebimentos = recebimentosRows.length;
    totalDivergencias = recebimentosRows.filter((r: any) => r.temDivergencia).length;
  }
  const taxaSemDivergencia = totalRecebimentos > 0
    ? (totalRecebimentos - totalDivergencias) / totalRecebimentos
    : 1;

  let score = 0;
  score += taxaPontualidade * 5 * 0.25;
  score += taxaCompetitividade * 5 * 0.20;
  score += taxaSemDivergencia * 5 * 0.15;
  score += taxaPrazoEntrega * 5 * 0.15;
  score += (totalAvaliacoes > 0 ? mediaAvaliacoes : 3) * 0.15;
  score += Math.min(totalOCs / 10, 1) * 5 * 0.10;
  score = Math.round(Math.min(score, 5) * 10) / 10;

  return {
    score,
    totalOCs,
    totalValorOCs,
    taxaPontualidade: Math.round(taxaPontualidade * 100),
    ocsComData,
    ocsPontuais,
    cotacoesParticipadas: cotacoesParticipadas.length,
    cotacoesVencidas,
    taxaCompetitividade: Math.round(taxaCompetitividade * 100),
    taxaPrazoEntrega: Math.round(taxaPrazoEntrega * 100),
    mediaAvaliacoes: totalAvaliacoes > 0 ? Math.round(mediaAvaliacoes * 10) / 10 : null,
    totalAvaliacoes,
    totalDivergencias,
    totalRecebimentos,
    taxaSemDivergencia: Math.round(taxaSemDivergencia * 100),
    ultimasAvaliacoes,
  };
}

// ══════════════════════════════════════════════════════════════
// RESERVAS PREVENTIVAS DE SALDO (Rev. 1386)
// Helpers que orquestram a criação, consumo e liberação de reservas
// quando uma cotação fecha com déficit (DI-08 + Economia em Compras).
// ══════════════════════════════════════════════════════════════

const RESERVA_PRAZO_DIAS = 7;

async function _registrarLogReserva(opts: {
  reservaId: number;
  acao: string;
  companyId?: number | null;          // se não informado, derivamos da reserva
  executadoPorId?: number | null;
  executadoPorNome?: string | null;
  prazoAdicionalDias?: number | null;
  motivo?: string | null;
  valorImpactado?: number | null;
  detalhes?: string | null;
}) {
  try {
    const db = await getDb();
    let companyId = opts.companyId ?? null;
    if (!companyId && opts.reservaId > 0) {
      const [r] = await db.select({ companyId: comprasReservasSaldo.companyId })
        .from(comprasReservasSaldo).where(eq(comprasReservasSaldo.id, opts.reservaId));
      companyId = r?.companyId ?? 0;
    }
    await db.insert(comprasReservasLog).values({
      companyId:          companyId ?? 0,
      reservaId:          opts.reservaId,
      acao:               opts.acao,
      executadoPorId:     opts.executadoPorId ?? null,
      executadoPorNome:   opts.executadoPorNome ?? null,
      prazoAdicionalDias: opts.prazoAdicionalDias ?? null,
      motivo:             opts.motivo ?? null,
      valorImpactado:     opts.valorImpactado != null ? String(opts.valorImpactado) : null,
      detalhes:           opts.detalhes ?? null,
    } as any);
  } catch (e: any) {
    console.warn("[ReservasLog] Falha ao registrar log:", e?.message);
  }
}

/**
 * Garante que o usuário tem acesso à companyId solicitada.
 *
 * Rev. 1744 — Helper estava QUEBRADO desde sempre: comparava `companyId`
 * (number) contra `getCompaniesForUser(...)` que retorna ARRAY DE OBJETOS
 * Company (não IDs). `allowed.includes(companyId)` era SEMPRE false → toda
 * chamada caía em "Sem acesso a esta empresa." inclusive para admin_master.
 * O sintoma que estourava era o `verificarTravamentoCompras` disparado pelo
 * `ReservasAlertModal` no DashboardLayout sempre que a empresa selecionada
 * mudava (especialmente após cadastrar uma empresa nova).
 *
 * Fix replicando a regra robusta de `terceiros.ts` (Rev. 1702):
 *  - admin / admin_master → libera (paridade com getCompaniesForUser L197).
 *  - Usuário com vínculos em `user_companies` → enforça membership real.
 *  - Usuário SEM nenhum vínculo (controle por grupo/módulo) → libera.
 */
async function _assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Sem acesso a esta empresa. (user=${ctxUser.id} role=${ctxUser.role} req=${companyId})` });
  }
}

async function _criarOuAtualizarReserva(opts: {
  companyId: number;
  obraId?: number | null;
  cotacaoId: number;
  ordemId?: number | null;
  valorDi08: number;
  valorEconomia: number;
  responsavelId?: number | null;
  responsavelNome?: string | null;
  motivo?: string;
}) {
  const db = await getDb();
  const totalReservado = (opts.valorDi08 || 0) + (opts.valorEconomia || 0);
  if (totalReservado <= 0.01) return null;

  const [existing] = await db.select().from(comprasReservasSaldo)
    .where(and(
      eq(comprasReservasSaldo.cotacaoId, opts.cotacaoId),
      eq(comprasReservasSaldo.status, "ativa"),
    ))
    .limit(1);

  if (existing) {
    await db.update(comprasReservasSaldo).set({
      valorDi08Reservado:     String(opts.valorDi08.toFixed(2)),
      valorEconomiaReservada: String(opts.valorEconomia.toFixed(2)),
      ordemId:                opts.ordemId ?? existing.ordemId ?? null,
      atualizadoEm:           new Date().toISOString(),
    } as any).where(eq(comprasReservasSaldo.id, existing.id));
    await _registrarLogReserva({
      reservaId: existing.id, acao: "atualizada",
      valorImpactado: totalReservado,
      detalhes: `DI-08: R$ ${opts.valorDi08.toFixed(2)} | Economia: R$ ${opts.valorEconomia.toFixed(2)}`,
    });
    return existing.id;
  }

  const prazo = new Date();
  prazo.setDate(prazo.getDate() + RESERVA_PRAZO_DIAS);

  const [nova] = await db.insert(comprasReservasSaldo).values({
    companyId:               opts.companyId,
    obraId:                  opts.obraId ?? null,
    cotacaoId:               opts.cotacaoId,
    ordemId:                 opts.ordemId ?? null,
    responsavelOriginalId:   opts.responsavelId ?? null,
    responsavelOriginalNome: opts.responsavelNome ?? null,
    valorDi08Reservado:      String(opts.valorDi08.toFixed(2)),
    valorEconomiaReservada:  String(opts.valorEconomia.toFixed(2)),
    prazoLimite:             prazo.toISOString(),
    status:                  "ativa",
    motivo:                  opts.motivo ?? null,
  } as any).returning({ id: comprasReservasSaldo.id });

  if (nova?.id) {
    await _registrarLogReserva({
      reservaId: nova.id, acao: "criada",
      executadoPorId: opts.responsavelId, executadoPorNome: opts.responsavelNome,
      valorImpactado: totalReservado,
      motivo: opts.motivo,
      detalhes: `DI-08: R$ ${opts.valorDi08.toFixed(2)} | Economia: R$ ${opts.valorEconomia.toFixed(2)} | Prazo: ${prazo.toISOString().slice(0,10).split("-").reverse().join("/")}`,
    });
  }
  return nova?.id ?? null;
}

async function _liberarReservasDaCotacao(opts: {
  cotacaoId: number;
  acao: "consumida" | "liberada" | "expirada";
  motivo?: string;
  executadoPorId?: number | null;
  executadoPorNome?: string | null;
  companyId?: number; // guarda de tenant (Rev. 2820): quando informado, libera SÓ reservas da empresa
}) {
  const db = await getDb();
  const ativas = await db.select().from(comprasReservasSaldo)
    .where(and(
      eq(comprasReservasSaldo.cotacaoId, opts.cotacaoId),
      eq(comprasReservasSaldo.status, "ativa"),
      opts.companyId != null ? eq(comprasReservasSaldo.companyId, opts.companyId) : undefined,
    ));
  for (const r of ativas) {
    await db.update(comprasReservasSaldo).set({
      status: opts.acao,
      atualizadoEm: new Date().toISOString(),
    } as any).where(eq(comprasReservasSaldo.id, r.id));
    await _registrarLogReserva({
      reservaId: r.id, acao: opts.acao,
      executadoPorId: opts.executadoPorId, executadoPorNome: opts.executadoPorNome,
      motivo: opts.motivo,
      valorImpactado: n(r.valorDi08Reservado) + n(r.valorEconomiaReservada),
    });
  }
  return ativas.length;
}

async function _liberarReservasDeCotacoes(cotacaoIds: number[], acao: "consumida" | "liberada" | "expirada", motivo?: string, companyId?: number) {
  if (cotacaoIds.length === 0) return 0;
  let total = 0;
  for (const id of cotacaoIds) {
    total += await _liberarReservasDaCotacao({ cotacaoId: id, acao, motivo, companyId });
  }
  return total;
}

/**
 * AUTO-BAIXA (Rev. 2820): toda reserva preventiva ATIVA cuja cotação JÁ tem
 * pelo menos uma OC gerada (não-cancelada) é automaticamente liberada como
 * "consumida". Reflete a regra de negócio: a reserva só faz sentido enquanto
 * a cotação está em aberto; assim que o comprador gera a OC, a compra está
 * encaminhada e o saldo deve voltar. Idempotente (só toca em reservas "ativa")
 * e cobre tanto o passado (reservas órfãs/vencidas) quanto o futuro. Reusa
 * `_liberarReservasDaCotacao` (logging + status). ZERO ALTER/DROP/DELETE.
 */
async function _autoLiberarReservasComOcGerada(companyId: number): Promise<number> {
  const db = await getDb();
  const ativas = await db.select({ cotacaoId: comprasReservasSaldo.cotacaoId })
    .from(comprasReservasSaldo)
    .where(and(
      eq(comprasReservasSaldo.companyId, companyId),
      eq(comprasReservasSaldo.status, "ativa"),
    ));
  const cotacaoIds = [...new Set(ativas.map(r => r.cotacaoId).filter((x): x is number => x != null))];
  if (cotacaoIds.length === 0) return 0;
  const ocs = await db.select({ cotacaoId: comprasOrdens.cotacaoId })
    .from(comprasOrdens)
    .where(and(
      eq(comprasOrdens.companyId, companyId),
      inArray(comprasOrdens.cotacaoId, cotacaoIds),
      sql`${comprasOrdens.status} != 'cancelada'`,
    ));
  const comOc = [...new Set(ocs.map(o => o.cotacaoId).filter((x): x is number => x != null))];
  let total = 0;
  for (const cid of comOc) {
    total += await _liberarReservasDaCotacao({
      cotacaoId: cid, acao: "consumida",
      motivo: "OC já gerada para a cotação (baixa automática)",
      companyId,
    });
  }
  return total;
}

/**
 * AUTO-LIMPEZA (Rev. 2822): toda reserva preventiva ATIVA cuja cotação NÃO existe
 * mais (foi excluída do sistema) é liberada automaticamente. Essas reservas órfãs
 * ficaram presas em status "ativa" porque foram criadas antes dos ganchos de
 * liberação por exclusão de cotação (ou por um caminho de exclusão que não as
 * soltou). Como a cotação sumiu, a reserva não reserva nada que faça sentido — só
 * entope a lista e vence em 7 dias. Reusa `_liberarReservasDaCotacao` (acao
 * "liberada" + log), é idempotente (só toca "ativa") e cobre todo o backlog
 * histórico. ZERO ALTER/DROP/DELETE.
 */
async function _autoLiberarReservasOrfas(companyId: number): Promise<number> {
  const db = await getDb();
  const ativas = await db.select({ cotacaoId: comprasReservasSaldo.cotacaoId })
    .from(comprasReservasSaldo)
    .where(and(
      eq(comprasReservasSaldo.companyId, companyId),
      eq(comprasReservasSaldo.status, "ativa"),
    ));
  const cotacaoIds = [...new Set(ativas.map(r => r.cotacaoId).filter((x): x is number => x != null))];
  if (cotacaoIds.length === 0) return 0;
  const existentes = await db.select({ id: comprasCotacoes.id })
    .from(comprasCotacoes)
    .where(and(
      eq(comprasCotacoes.companyId, companyId),
      inArray(comprasCotacoes.id, cotacaoIds),
    ));
  const existSet = new Set(existentes.map(c => c.id));
  const orfas = cotacaoIds.filter(id => !existSet.has(id));
  let total = 0;
  for (const cid of orfas) {
    total += await _liberarReservasDaCotacao({
      cotacaoId: cid, acao: "liberada",
      motivo: "Cotação não existe mais — limpeza automática",
      companyId,
    });
  }
  return total;
}

/**
 * AUTO-LIMPEZA (Rev. 2823): toda reserva preventiva ATIVA cuja cotação ainda
 * EXISTE mas está CANCELADA/RECUSADA é liberada automaticamente. Diferente das
 * órfãs (cotação excluída — Rev. 2822), aqui a cotação continua na tabela, só
 * que com status final, então o self-heal de órfãs não a pega. Cobre os caminhos
 * de cancelamento que não soltaram a reserva (ex.: auto-cancelamento por estar
 * sem itens — Rev. 2295) e qualquer backlog histórico. Reusa
 * `_liberarReservasDaCotacao` (acao "liberada" + log), idempotente (só toca
 * "ativa"). ZERO ALTER/DROP/DELETE.
 */
async function _autoLiberarReservasCotacaoCancelada(companyId: number): Promise<number> {
  const db = await getDb();
  const ativas = await db.select({ cotacaoId: comprasReservasSaldo.cotacaoId })
    .from(comprasReservasSaldo)
    .where(and(
      eq(comprasReservasSaldo.companyId, companyId),
      eq(comprasReservasSaldo.status, "ativa"),
    ));
  const cotacaoIds = [...new Set(ativas.map(r => r.cotacaoId).filter((x): x is number => x != null))];
  if (cotacaoIds.length === 0) return 0;
  const canceladas = await db.select({ id: comprasCotacoes.id })
    .from(comprasCotacoes)
    .where(and(
      eq(comprasCotacoes.companyId, companyId),
      inArray(comprasCotacoes.id, cotacaoIds),
      sql`${comprasCotacoes.status} IN ('cancelada', 'recusada')`,
    ));
  let total = 0;
  for (const c of canceladas) {
    total += await _liberarReservasDaCotacao({
      cotacaoId: c.id, acao: "liberada",
      motivo: "Cotação cancelada/recusada — limpeza automática",
      companyId,
    });
  }
  return total;
}

/**
 * SANEAMENTO COMPLETO DAS RESERVAS (Rev. 2822 + 2823): roda as três auto-baixas
 * em sequência (OC já gerada + cotação inexistente + cotação cancelada/recusada).
 * Cada uma é tolerante a falha (try/catch) para nunca derrubar a leitura que a
 * chama. Idempotente.
 */
async function _autoSanearReservas(companyId: number): Promise<void> {
  try { await _autoLiberarReservasComOcGerada(companyId); } catch (e: any) { console.warn("[saneamentoReservas] OC já gerada falhou:", e?.message); }
  try { await _autoLiberarReservasOrfas(companyId); } catch (e: any) { console.warn("[saneamentoReservas] órfãs falhou:", e?.message); }
  try { await _autoLiberarReservasCotacaoCancelada(companyId); } catch (e: any) { console.warn("[saneamentoReservas] canceladas falhou:", e?.message); }
}

/**
 * Verifica se um usuário (perfil de Compras) está travado para criar
 * novas operações deficitárias. Retorna lista de reservas pendentes da empresa.
 * Travamento ocorre quando há ≥1 reserva ativa cujo prazo expirou (≥7 dias).
 */
async function _statusTravamentoCompras(companyId: number) {
  const db = await getDb();
  await _autoSanearReservas(companyId);
  const agora = new Date();
  const reservas = await db.select().from(comprasReservasSaldo)
    .where(and(
      eq(comprasReservasSaldo.companyId, companyId),
      eq(comprasReservasSaldo.status, "ativa"),
    ))
    .orderBy(asc(comprasReservasSaldo.prazoLimite));
  const enriched = reservas.map(r => {
    const prazo = new Date(r.prazoLimite);
    const diffMs = prazo.getTime() - agora.getTime();
    const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const diasDecorridos = Math.max(0, RESERVA_PRAZO_DIAS - diasRestantes);
    return {
      id: r.id,
      cotacaoId: r.cotacaoId,
      obraId: r.obraId,
      ordemId: r.ordemId,
      responsavelId: r.responsavelOriginalId,
      responsavelNome: r.responsavelOriginalNome,
      valorDi08: n(r.valorDi08Reservado),
      valorEconomia: n(r.valorEconomiaReservada),
      valorTotal: n(r.valorDi08Reservado) + n(r.valorEconomiaReservada),
      prazoLimite: r.prazoLimite,
      diasRestantes,
      diasDecorridos,
      vencida: diasRestantes <= 0,
      criadoEm: r.criadoEm,
      motivo: r.motivo,
    };
  });
  const vencidas = enriched.filter(r => r.vencida);
  return {
    travado: vencidas.length > 0,
    reservasAtivas: enriched,
    vencidas,
    totalReservadoDi08: enriched.reduce((s, r) => s + r.valorDi08, 0),
    totalReservadoEconomia: enriched.reduce((s, r) => s + r.valorEconomia, 0),
  };
}

const PERFIS_COMPRAS = new Set([
  "comprador", "compras", "gerente_compras", "diretor_compras",
  "lider_compras", "supervisor_compras",
]);

function _isPerfilCompras(role?: string | null): boolean {
  if (!role) return false;
  if (role === "admin_master" || role === "diretor") return true; // master/diretor sempre veem
  return PERFIS_COMPRAS.has(role);
}

// Rev. 1799 — R-014 · Geração de numero_sc 100% atômica via counter table com UPSERT.
// HISTÓRICO: Rev. 1743 usava `MAX(suffix)+1+offset` com 8 retries — race condition
// óbvia entre leitores simultâneos. Rev. 1790 adicionou `pg_advisory_xact_lock` por
// (empresa, ano) — serializou os caminhos com lock, mas:
//   (a) Rev. 1795 descobriu que outros módulos (epis/frotas) inseriam SEM lock.
//   (b) Mesmo com lock em TODOS os caminhos, prod ainda mostrou race em 14/05/2026:
//       3 retries computando MESMO 'SC-2026-0010' (logs `code: '23505'` x3 seguidas).
//       Causa: combinação de release/reacquire do lock entre tentativas + leitura
//       MAX que pode retornar valor stale por motivo de visibility/snapshot MVCC
//       quando há transações concorrentes em vôo de outros caminhos não rastreados.
//
// SOLUÇÃO DEFINITIVA (R-014): tabela `compras_sc_counters(company_id, ano, ultimo_seq)`
// com PRIMARY KEY (company_id, ano). A geração faz UM ÚNICO statement:
//   INSERT INTO compras_sc_counters(company_id, ano, ultimo_seq) VALUES ($1, $2, 1)
//   ON CONFLICT (company_id, ano)
//   DO UPDATE SET ultimo_seq = compras_sc_counters.ultimo_seq + 1, atualizado_em = NOW()
//   RETURNING ultimo_seq;
// → Postgres adquire row-level lock no UPSERT, atomicamente incrementa, retorna o
//   novo valor. ZERO race possível, sem advisory lock, sem retry, sem leitura de MAX.
//
// O índice `uq_compras_solicitacoes_numero (company_id, numero_sc)` continua como
// rede de segurança: se ALGUM bug futuro reintroduzir colisão, o INSERT da SC ainda
// falhará 23505 — mas em condições normais de operação nunca dispara.
export async function gerarProximoNumeroScAtomico(tx: any, companyId: number): Promise<string> {
  const ano = new Date().getFullYear();
  const prefixo = `SC-${ano}-`;
  // DEFENSIVE: no branch INSERT (primeira SC desta empresa/ano), inicializa o counter
  // com COALESCE(MAX(seq),0)+1 da tabela compras_solicitacoes — assim, mesmo que o
  // seed do ColFix não tenha rodado para esta empresa (nova empresa criada após o
  // boot, restore parcial, ou import manual sem semear o counter), a primeira SC
  // alocada NUNCA colide com SCs pré-existentes. Sob concorrência: dois writers
  // computando o mesmo MAX é OK — apenas um vence o INSERT (ganha row-level lock),
  // o outro cai no DO UPDATE e incrementa em cima do valor já gravado pelo vencedor.
  // No branch DO UPDATE (caminho normal), apenas incrementa atomicamente.
  const rows = await tx.execute(sql`
    INSERT INTO compras_sc_counters (company_id, ano, ultimo_seq)
    VALUES (
      ${companyId},
      ${ano},
      COALESCE(
        (SELECT MAX(CAST(SUBSTRING(numero_sc FROM 9) AS INTEGER))
         FROM compras_solicitacoes
         WHERE company_id = ${companyId}
           AND numero_sc ~ ${'^SC-' + String(ano) + '-\\d+$'}),
        0
      ) + 1
    )
    ON CONFLICT (company_id, ano)
    DO UPDATE SET ultimo_seq = compras_sc_counters.ultimo_seq + 1,
                  atualizado_em = NOW()
    RETURNING ultimo_seq
  `);
  const r = (rows as any).rows || rows;
  const seq = parseInt(String(r?.[0]?.ultimo_seq ?? 0)) || 0;
  if (seq <= 0) {
    throw new Error(`[gerarProximoNumeroScAtomico] counter retornou seq inválido (${seq}) para company=${companyId} ano=${ano}`);
  }
  return `${prefixo}${String(seq).padStart(4, "0")}`;
}

// Rev. 1799 — alias mantido para compat com epis.ts/frotas.ts.
// Antes envolvia advisory lock + MAX+1; agora apenas delega ao UPSERT atômico.
export async function lockEGerarNumeroSc(tx: any, companyId: number): Promise<string> {
  return await gerarProximoNumeroScAtomico(tx, companyId);
}

export const comprasRouter = router({

  // ══════════════════════════════════════════════════════════════
  // FORNECEDORES
  // ══════════════════════════════════════════════════════════════

  listarFornecedores: protectedProcedure
    .input(z.object({
      companyId:       z.number(),
      busca:           z.string().optional(),
      categoria:       z.string().optional(),
      ativo:           z.boolean().optional(),
      // Rev. 3457 — quando true, retorna fornecedores de TODAS as empresas
      // acessíveis ao usuário (não só a empresa corrente). Usado na conciliação
      // para que o dropdown mostre todos os fornecedores do grupo FC, independente
      // de qual empresa está selecionada no contexto.
      includeAllGroup: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // Rev. 3457 — expandir para todas as empresas do grupo quando solicitado
      let companyIds: number[] = [input.companyId];
      if (input.includeAllGroup) {
        const userCos = await getCompaniesForUser(ctx.user.id, ctx.user.role);
        if (userCos.length > 0) {
          companyIds = userCos.map((c: any) => Number(c.id)).filter((n: number) => Number.isFinite(n));
        }
      }

      const rows = await db.select().from(fornecedores)
        .where(and(
          companyIds.length === 1
            ? eq(fornecedores.companyId, companyIds[0])
            : inArray(fornecedores.companyId, companyIds),
          input.ativo !== undefined
            ? (input.ativo
                ? or(eq(fornecedores.ativo, true), isNull(fornecedores.ativo))
                : eq(fornecedores.ativo, false))
            : undefined,
        ))
        .orderBy(asc(fornecedores.razaoSocial));

      let result = rows;
      if (input.busca) {
        const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const b = strip(input.busca.toLowerCase());
        const bDigits = b.replace(/\D/g, "");
        result = result.filter(f =>
          strip(f.razaoSocial?.toLowerCase() ?? "").includes(b) ||
          strip(f.nomeFantasia?.toLowerCase() ?? "").includes(b) ||
          f.cnpj?.includes(input.busca) ||
          (bDigits.length >= 3 && f.cnpj?.replace(/\D/g, "").includes(bDigits)) ||
          strip(f.cidade?.toLowerCase() ?? "").includes(b)
        );
      }
      if (input.categoria) {
        result = result.filter(f =>
          Array.isArray(f.categorias) && (f.categorias as string[]).includes(input.categoria!)
        );
      }
      // Rev. 3440 — carregar ciclo de fechamento de empresas_terceiras para cada fornecedor
      const fornIds = result.map(f => f.id);
      let cicloMap: Record<number, any> = {};
      if (fornIds.length > 0) {
        const cicloRows = await db.select({
          fornecedorId: (empresasTerceiras as any).fornecedorId,
          cicloPagamento: empresasTerceiras.cicloPagamento,
          cicloDiaFechamento: empresasTerceiras.cicloDiaFechamento,
          cicloNumParcelas: empresasTerceiras.cicloNumParcelas,
          cicloPrazoParcela: empresasTerceiras.cicloPrazoParcela,
          cicloFormaPagamento: empresasTerceiras.cicloFormaPagamento,
          cicloDataReferencia: (empresasTerceiras as any).cicloDataReferencia,
          regrasProdutoJson: (empresasTerceiras as any).regrasProdutoJson,
        }).from(empresasTerceiras)
          .where(and(
            inArray((empresasTerceiras as any).fornecedorId, fornIds),
            eq(empresasTerceiras.companyId, input.companyId),
            isNull(empresasTerceiras.deletedAt),
          ));
        for (const r of cicloRows as any[]) {
          if (r.fornecedorId) cicloMap[r.fornecedorId] = r;
        }
      }
      return result.map(f => ({ ...f, ...(cicloMap[f.id] || {}) }));
    }),

  getFornecedor: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [f] = await db.select().from(fornecedores).where(eq(fornecedores.id, input.id));
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado" });
      await _assertCompanyAccess(ctx.user, f.companyId);
      return f;
    }),

  criarFornecedor: protectedProcedure
    .input(z.object({
      companyId:       z.number(),
      cnpj:            z.string().optional(),
      razaoSocial:     z.string().min(1),
      nomeFantasia:    z.string().optional(),
      situacaoReceita: z.string().optional(),
      endereco:        z.string().optional(),
      numero:          z.string().optional(),
      complemento:     z.string().optional(),
      bairro:          z.string().optional(),
      cidade:          z.string().optional(),
      estado:          z.string().optional(),
      cep:             z.string().optional(),
      telefone:        z.string().optional(),
      email:           z.string().optional(),
      contatoNome:     z.string().optional(),
      contatoCelular:  z.string().optional(),
      contatoEmail:    z.string().optional(),
      banco:           z.string().optional(),
      agencia:         z.string().optional(),
      conta:           z.string().optional(),
      pix:             z.string().optional(),
      naturezaJuridica: z.string().optional(),
      porte:            z.string().optional(),
      capitalSocial:    z.string().optional(),
      atividadePrincipal: z.string().optional(),
      atividadesCnae:   z.string().optional(),
      dataAbertura:     z.string().optional(),
      regimeTributario: z.string().optional(),
      inscricaoEstadual: z.string().optional(),
      inscricaoMunicipal: z.string().optional(),
      representanteLegal: z.string().optional(),
      representanteCpf:   z.string().optional(),
      representanteCargo: z.string().optional(),
      socios:           z.array(z.any()).optional(),
      categorias:      z.array(z.string()).optional(),
      isPrestadorServico: z.boolean().optional(),
      isFornecedor:    z.boolean().optional(),
      observacoes:     z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // Anti-duplicidade no MESMO módulo (fornecedores): rejeita se já existir
      // registro ativo com o mesmo CNPJ no tenant.
      const cnpjN = (input.cnpj || "").replace(/\D/g, "");
      if (cnpjN) {
        const existentes = await db.select().from(fornecedores).where(
          eq(fornecedores.companyId, input.companyId),
        );
        const dup = (existentes as any[]).find(f => (f.cnpj || "").replace(/\D/g, "") === cnpjN);
        if (dup) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Já existe um cadastro em Compras com este CNPJ (#${dup.id} — ${dup.razaoSocial}). Não é permitido duplicar.`,
          });
        }
      }
      const [f] = await db.insert(fornecedores).values({
        companyId:       input.companyId,
        cnpj:            input.cnpj ?? null,
        razaoSocial:     upperCaseEmpresa(input.razaoSocial),
        nomeFantasia:    input.nomeFantasia ? upperCaseEmpresa(input.nomeFantasia) : null,
        situacaoReceita: input.situacaoReceita ?? null,
        endereco:        input.endereco ?? null,
        numero:          input.numero ?? null,
        complemento:     input.complemento ?? null,
        bairro:          input.bairro ?? null,
        cidade:          input.cidade ?? null,
        estado:          input.estado ?? null,
        cep:             input.cep ?? null,
        telefone:        input.telefone ?? null,
        email:           input.email ?? null,
        contatoNome:     input.contatoNome ?? null,
        contatoCelular:  input.contatoCelular ?? null,
        contatoEmail:    input.contatoEmail ?? null,
        banco:           input.banco ?? null,
        agencia:         input.agencia ?? null,
        conta:           input.conta ?? null,
        pix:             input.pix ?? null,
        naturezaJuridica: input.naturezaJuridica ?? null,
        porte:            input.porte ?? null,
        capitalSocial:    input.capitalSocial ?? null,
        atividadePrincipal: input.atividadePrincipal ?? null,
        atividadesCnae:   input.atividadesCnae ?? null,
        dataAbertura:     input.dataAbertura ?? null,
        regimeTributario: input.regimeTributario ?? null,
        inscricaoEstadual: input.inscricaoEstadual ?? null,
        inscricaoMunicipal: input.inscricaoMunicipal ?? null,
        representanteLegal: input.representanteLegal ?? null,
        representanteCpf:   input.representanteCpf ?? null,
        representanteCargo: input.representanteCargo ?? null,
        socios:           sql`${JSON.stringify(input.socios ?? [])}::json`,
        categorias:      sql`${JSON.stringify(input.categorias ?? [])}::json`,
        isPrestadorServico: input.isPrestadorServico ?? false,
        isFornecedor:    input.isFornecedor ?? true,
        observacoes:     input.observacoes ?? null,
        ativo:           true,
      }).returning();
      return f;
    }),

  atualizarFornecedor: protectedProcedure
    .input(z.object({
      id:              z.number(),
      cnpj:            z.string().optional(),
      razaoSocial:     z.string().min(1).optional(),
      nomeFantasia:    z.string().optional(),
      situacaoReceita: z.string().optional(),
      endereco:        z.string().optional(),
      numero:          z.string().optional(),
      complemento:     z.string().optional(),
      bairro:          z.string().optional(),
      cidade:          z.string().optional(),
      estado:          z.string().optional(),
      cep:             z.string().optional(),
      telefone:        z.string().optional(),
      email:           z.string().optional(),
      contatoNome:     z.string().optional(),
      contatoCelular:  z.string().optional(),
      contatoEmail:    z.string().optional(),
      banco:           z.string().optional(),
      agencia:         z.string().optional(),
      conta:           z.string().optional(),
      pix:             z.string().optional(),
      naturezaJuridica: z.string().optional(),
      porte:            z.string().optional(),
      capitalSocial:    z.string().optional(),
      atividadePrincipal: z.string().optional(),
      atividadesCnae:   z.string().optional(),
      dataAbertura:     z.string().optional(),
      regimeTributario: z.string().optional(),
      inscricaoEstadual: z.string().optional(),
      inscricaoMunicipal: z.string().optional(),
      representanteLegal: z.string().optional(),
      representanteCpf:   z.string().optional(),
      representanteCargo: z.string().optional(),
      socios:           z.array(z.any()).optional(),
      categorias:      z.array(z.string()).optional(),
      isPrestadorServico: z.boolean().optional(),
      isFornecedor:    z.boolean().optional(),
      observacoes:     z.string().optional(),
      ativo:           z.boolean().optional(),
      // Rev. 3440 — Ciclo de Fechamento (gravado em empresas_terceiras via fornecedor_id)
      // Rev. 3514 — adicionado "quinzenal_semana" + cicloDataReferencia
      cicloPagamento:      z.enum(["avista", "semanal", "quinzenal", "quinzenal_semana", "mensal", "personalizado"]).optional().nullable(),
      cicloDiaFechamento:  z.number().int().min(0).max(31).optional().nullable(),
      cicloNumParcelas:    z.number().int().min(1).max(24).optional().nullable(),
      cicloPrazoParcela:   z.number().int().min(0).max(365).optional().nullable(),
      cicloFormaPagamento: z.enum(["cheque", "pix", "boleto", "transferencia"]).optional().nullable(),
      cicloDataReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      // Rev. 3516 — regras especiais de pagamento por produto
      regrasProdutoJson: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { id, categorias, socios, cicloPagamento, cicloDiaFechamento, cicloNumParcelas, cicloPrazoParcela, cicloFormaPagamento, cicloDataReferencia, regrasProdutoJson, ...rest } = input;
      // Tenant auth + anti-duplicidade no MESMO módulo (fornecedores) ao editar.
      const [existing] = await db.select().from(fornecedores).where(eq(fornecedores.id, id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
      await _assertCompanyAccess(ctx.user, (existing as any).companyId);
      const norm = (s?: string | null) => (s || "").replace(/\D/g, "");
      const novoCnpj = rest.cnpj !== undefined ? norm(rest.cnpj) : norm((existing as any).cnpj);
      if (novoCnpj && novoCnpj !== norm((existing as any).cnpj)) {
        const candidatos = await db.select().from(fornecedores).where(eq(fornecedores.companyId, (existing as any).companyId));
        const dup = (candidatos as any[]).find(c => c.id !== id && norm(c.cnpj) === novoCnpj && c.ativo !== false);
        if (dup) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Já existe outro fornecedor cadastrado com este CNPJ (#${dup.id} — ${dup.razaoSocial}). Não é permitido duplicar.`,
          });
        }
      }
      const data: any = { ...rest, atualizadoEm: new Date().toISOString() };
      if (categorias !== undefined) {
        data.categorias = sql`${JSON.stringify(categorias)}::json`;
      }
      if (socios !== undefined) {
        data.socios = sql`${JSON.stringify(socios)}::json`;
      }
      // Rev. 2881 — padroniza nome em Title Case culto também na edição de fornecedor.
      if (data.razaoSocial !== undefined && data.razaoSocial !== null) data.razaoSocial = upperCaseEmpresa(data.razaoSocial);
      if (data.nomeFantasia !== undefined && data.nomeFantasia !== null) data.nomeFantasia = upperCaseEmpresa(data.nomeFantasia);
      await db.update(fornecedores)
        .set(data)
        .where(eq(fornecedores.id, id));
      // Rev. 3440 — sync ciclo de fechamento → empresas_terceiras (WHERE fornecedor_id=id)
      // Rev. 3514 — inclui cicloDataReferencia
      // Rev. 3530 — upsert: se não existir linha em empresasTerceiras para este fornecedor,
      //   cria-a primeiro (fornecedores sem CNPJ ou criados antes do ciclo perdiam dados silenciosamente).
      const cicloPayload: Record<string, any> = {};
      if (cicloPagamento !== undefined) cicloPayload.cicloPagamento = cicloPagamento;
      if (cicloDiaFechamento !== undefined) cicloPayload.cicloDiaFechamento = cicloDiaFechamento;
      if (cicloNumParcelas !== undefined) cicloPayload.cicloNumParcelas = cicloNumParcelas;
      if (cicloPrazoParcela !== undefined) cicloPayload.cicloPrazoParcela = cicloPrazoParcela;
      if (cicloFormaPagamento !== undefined) cicloPayload.cicloFormaPagamento = cicloFormaPagamento;
      if (cicloDataReferencia !== undefined) cicloPayload.cicloDataReferencia = cicloDataReferencia;
      if (regrasProdutoJson !== undefined) cicloPayload.regrasProdutoJson = regrasProdutoJson;
      if (Object.keys(cicloPayload).length > 0) {
        const [existsTerceira] = await db
          .select({ id: empresasTerceiras.id })
          .from(empresasTerceiras)
          .where(and(
            eq((empresasTerceiras as any).fornecedorId, id),
            eq(empresasTerceiras.companyId, (existing as any).companyId),
            isNull(empresasTerceiras.deletedAt),
          ))
          .limit(1);
        if (existsTerceira) {
          await db.update(empresasTerceiras)
            .set(cicloPayload)
            .where(and(
              eq((empresasTerceiras as any).fornecedorId, id),
              eq(empresasTerceiras.companyId, (existing as any).companyId),
              isNull(empresasTerceiras.deletedAt),
            ));
        } else {
          // Cria a linha mínima + campos de ciclo/regras já preenchidos
          await db.insert(empresasTerceiras).values({
            companyId: (existing as any).companyId,
            razaoSocial: upperCaseEmpresa((existing as any).razaoSocial || (existing as any).nomeFantasia || "Fornecedor"),
            cnpj: (existing as any).cnpj || "",
            status: "ativa",
            fornecedorId: id,
            ...cicloPayload,
          } as any);
        }
      }
      return { success: true };
    }),

  excluirFornecedor: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [existing] = await db.select().from(fornecedores).where(eq(fornecedores.id, input.id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
      await _assertCompanyAccess(ctx.user, (existing as any).companyId);
      await db.update(fornecedores)
        .set({ ativo: false, atualizadoEm: new Date().toISOString() })
        .where(eq(fornecedores.id, input.id));
      return { success: true };
    }),

  // Busca dados do CNPJ via BrasilAPI (proxy server-side evita CORS)
  buscarCNPJ: protectedProcedure
    .input(z.object({ cnpj: z.string() }))
    .query(async ({ input }) => {
      const cnpjLimpo = input.cnpj.replace(/\D/g, "");
      if (cnpjLimpo.length !== 14) throw new TRPCError({ code: "BAD_REQUEST", message: "CNPJ inválido" });

      function extrairSocios(qsa: any[]): { nome: string; qualificacao: string; cpfMascarado: string; dataEntrada: string; faixaEtaria: string; representanteLegal: string }[] {
        if (!Array.isArray(qsa)) return [];
        return qsa.map((s: any) => ({
          nome: s.nome_socio || s.nome || "",
          qualificacao: s.qualificacao_socio || s.qual || "",
          cpfMascarado: s.cnpj_cpf_do_socio || "",
          dataEntrada: s.data_entrada_sociedade || "",
          faixaEtaria: s.faixa_etaria || "",
          representanteLegal: s.nome_representante_legal || "",
        }));
      }

      function encontrarRepresentante(qsa: any[]): { nome: string; cpf: string; cargo: string } {
        if (!Array.isArray(qsa) || qsa.length === 0) return { nome: "", cpf: "", cargo: "" };
        const admin = qsa.find((s: any) => {
          const q = (s.qualificacao_socio || s.qual || "").toLowerCase();
          return q.includes("administrador") || q.includes("diretor") || q.includes("presidente") || q.includes("gerente");
        });
        const rep = admin || qsa[0];
        return {
          nome: rep.nome_socio || rep.nome || "",
          cpf: rep.cnpj_cpf_do_socio || "",
          cargo: rep.qualificacao_socio || rep.qual || "",
        };
      }

      async function tentarBrasilAPI() {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json() as any;
        const socios = extrairSocios(data.qsa);
        const rep = encontrarRepresentante(data.qsa);
        const cnaesSecundarios = Array.isArray(data.cnaes_secundarios)
          ? data.cnaes_secundarios.map((c: any) => `${c.codigo} - ${c.descricao}`).join("; ")
          : "";
        return {
          cnpj:            cnpjLimpo,
          razaoSocial:     data.razao_social ?? "",
          nomeFantasia:    data.nome_fantasia ?? "",
          situacaoReceita: data.descricao_situacao_cadastral ?? "",
          situacaoCodigo:  data.codigo_situacao_cadastral ?? 0,
          endereco:        data.logradouro ? `${data.descricao_tipo_de_logradouro ?? ""} ${data.logradouro}`.trim() : "",
          numero:          data.numero ?? "",
          complemento:     data.complemento ?? "",
          bairro:          data.bairro ?? "",
          cidade:          data.municipio ?? "",
          estado:          data.uf ?? "",
          cep:             data.cep ?? "",
          telefone:        data.ddd_telefone_1 ?? "",
          email:           data.email ?? "",
          naturezaJuridica: data.natureza_juridica ?? "",
          porte:           data.porte ?? "",
          capitalSocial:   data.capital_social != null ? String(data.capital_social) : "",
          atividadePrincipal: data.cnae_fiscal_descricao ?? "",
          atividadesCnae:  cnaesSecundarios,
          dataAbertura:    data.data_inicio_atividade ?? "",
          regimeTributario: data.opcao_pelo_simples ? "Simples Nacional" : data.opcao_pelo_mei ? "MEI" : data.regime_tributario ?? "",
          socios,
          representanteLegal: rep.nome,
          representanteCpf:   rep.cpf,
          representanteCargo: rep.cargo,
        };
      }

      async function tentarReceitaWS() {
        const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpjLimpo}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const d = await res.json() as any;
        if (d.status === "ERROR") return null;
        const socios = Array.isArray(d.qsa) ? d.qsa.map((s: any) => ({
          nome: s.nome || "",
          qualificacao: s.qual || "",
          cpfMascarado: "",
          dataEntrada: "",
          faixaEtaria: "",
          representanteLegal: "",
        })) : [];
        const rep = socios.length > 0 ? {
          nome: socios.find((s: any) => (s.qualificacao || "").toLowerCase().includes("administrador"))?.nome || socios[0].nome,
          cpf: "",
          cargo: socios.find((s: any) => (s.qualificacao || "").toLowerCase().includes("administrador"))?.qualificacao || socios[0].qualificacao,
        } : { nome: "", cpf: "", cargo: "" };
        const ativPrincipal = d.atividade_principal?.[0]?.text || "";
        const cnaesSecundarios = Array.isArray(d.atividades_secundarias)
          ? d.atividades_secundarias.map((a: any) => `${a.code} - ${a.text}`).join("; ")
          : "";
        return {
          cnpj:            cnpjLimpo,
          razaoSocial:     d.nome ?? "",
          nomeFantasia:    d.fantasia ?? "",
          situacaoReceita: d.situacao ?? "",
          situacaoCodigo:  d.situacao === "ATIVA" ? 2 : 0,
          endereco:        d.logradouro ?? "",
          numero:          d.numero ?? "",
          complemento:     d.complemento ?? "",
          bairro:          d.bairro ?? "",
          cidade:          d.municipio ?? "",
          estado:          d.uf ?? "",
          cep:             (d.cep ?? "").replace(/[.\-]/g, ""),
          telefone:        d.telefone ?? "",
          email:           d.email ?? "",
          naturezaJuridica: d.natureza_juridica ?? "",
          porte:           d.porte ?? "",
          capitalSocial:   d.capital_social ?? "",
          atividadePrincipal: ativPrincipal,
          atividadesCnae:  cnaesSecundarios,
          dataAbertura:    d.abertura ?? "",
          regimeTributario: d.simples?.optante ? "Simples Nacional" : "",
          socios,
          representanteLegal: rep.nome,
          representanteCpf:   rep.cpf,
          representanteCargo: rep.cargo,
        };
      }

      try {
        const resultado = await tentarBrasilAPI() || await tentarReceitaWS();
        if (!resultado) throw new TRPCError({ code: "NOT_FOUND", message: "CNPJ não encontrado na Receita Federal. Verifique se o CNPJ está correto." });
        return resultado;
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        console.error("[buscarCNPJ] Erro:", e.message);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao consultar a Receita Federal. Tente novamente em alguns segundos." });
      }
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — ITENS
  // ══════════════════════════════════════════════════════════════

  listarItens: protectedProcedure
    .input(z.object({
      companyId:                z.number(),
      obraId:                   z.number().nullable().optional(),
      busca:                    z.string().optional(),
      categoria:                z.string().optional(),
      apenasAbaixoMinimo:       z.boolean().optional(),
      // Rev. 1607 — Filtros do tipo de controle. Por padrão, oculta itens de
      // "aplicação direta" (não fazem parte do estoque tradicional).
      // Se `apenasAplicacaoDireta = true`, retorna SOMENTE esses itens.
      incluirAplicacaoDireta:   z.boolean().optional(),
      apenasAplicacaoDireta:    z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();

      const conditions: any[] = [
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
      ];

      if (input.obraId === null) {
        conditions.push(sql`${almoxarifadoItens.obraId} IS NULL`);
      } else if (input.obraId !== undefined) {
        conditions.push(eq(almoxarifadoItens.obraId, input.obraId));
      }

      // Filtro centralizado por obras permitidas. null => sem restrição.
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      console.log(`[listarItens] user=${ctx.user.id}/${ctx.user.role} company=${input.companyId} obra=${input.obraId === undefined ? 'undef' : input.obraId} allowed=${allowed === null ? 'null(admin)' : '[' + allowed.length + ']' + JSON.stringify(allowed.slice(0, 5))}`);
      if (allowed !== null) {
        if (allowed.length === 0) {
          console.log(`[listarItens] RETORNANDO VAZIO — user sem obras permitidas`);
          return [];
        }
        // Inclui itens do estoque central (obraId IS NULL) e dos obras permitidas.
        // Usar só inArray() excluiria os itens centrais porque NULL nunca satisfaz IN(...).
        conditions.push(or(isNull(almoxarifadoItens.obraId), inArray(almoxarifadoItens.obraId, allowed)));
      }

      // Rev. 1607 — Filtro do tipo de controle (estoque vs aplicação direta).
      // Default: oculta aplicação direta. Se apenasAplicacaoDireta=true, mostra só esses.
      if (input.apenasAplicacaoDireta) {
        conditions.push(sql`${almoxarifadoItens.tipoControle} = 'aplicacao_direta'`);
      } else if (!input.incluirAplicacaoDireta) {
        conditions.push(sql`(${almoxarifadoItens.tipoControle} IS NULL OR ${almoxarifadoItens.tipoControle} <> 'aplicacao_direta')`);
      }

      const rows = await db.select().from(almoxarifadoItens)
        .where(and(...conditions))
        .orderBy(asc(almoxarifadoItens.nome));
      console.log(`[listarItens] retornando ${rows.length} itens`);

      let result = rows;
      if (input.busca) {
        const b = input.busca.toLowerCase();
        result = result.filter(i =>
          i.nome.toLowerCase().includes(b) ||
          i.codigoInterno?.toLowerCase().includes(b) ||
          i.categoria?.toLowerCase().includes(b)
        );
      }
      if (input.categoria) {
        result = result.filter(i => i.categoria === input.categoria);
      }
      if (input.apenasAbaixoMinimo) {
        result = result.filter(i => n(i.quantidadeAtual) < n(i.quantidadeMinima));
      }
      return result;
    }),

  criarItem: protectedProcedure
    .input(z.object({
      companyId:             z.number(),
      obraId:                z.number().nullable().optional(),
      nome:                  z.string().min(1),
      unidade:               z.string().default("un"),
      categoria:             z.string().nullable().optional(),
      codigoInterno:         z.string().nullable().optional(),
      quantidadeAtual:       z.number().optional(),
      quantidadeMinima:      z.number().optional(),
      observacoes:           z.string().nullable().optional(),
      // Rev. 4011 — Especificação técnica separada do nome.
      especificacao:         z.string().nullable().optional(),
      fotoUrl:               z.string().nullable().optional(),
      valorUnitario:         z.number().nullable().optional(),
      origem:                z.enum(["proprio", "alugado"]).optional(),
      fornecedorLocacao:     z.string().nullable().optional(),
      dataInicioLocacao:     z.string().nullable().optional(),
      dataVencimentoLocacao: z.string().nullable().optional(),
      valorLocacaoMensal:    z.number().nullable().optional(),
      diasAlertaLocacao:     z.number().nullable().optional(),
      observacoesLocacao:    z.string().nullable().optional(),
      // Rev. 1607 — Override manual do tipo de controle (admin). Quando ausente, IA classifica.
      tipoControle:          z.enum(["estoque", "aplicacao_direta"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // Rev. 1607 — Classificação automática por IA do tipo de controle.
      // Default seguro: 'estoque'. IA só decide 'aplicacao_direta' quando o item é claramente
      // de aplicação imediata na obra (ex.: concreto usinado, argamassa pronta, asfalto a quente).
      let tipoControle: "estoque" | "aplicacao_direta" = input.tipoControle ?? "estoque";
      let tipoControleClassificadoIa = false;
      let tipoControleJustificativa: string | null = null;
      if (!input.tipoControle) {
        try {
          const cls = await classificarTipoControleIA({
            nome: input.nome,
            categoria: input.categoria ?? undefined,
            unidade: input.unidade,
          });
          tipoControle = cls.tipoControle;
          tipoControleClassificadoIa = true;
          tipoControleJustificativa = cls.justificativa;
        } catch (e: any) {
          console.warn(`[criarItem] IA classificação falhou (default 'estoque'):`, e?.message || e);
        }
      }

      // Rev. 1607 — Aplicação direta NÃO mantém saldo: força quantidadeAtual = 0
      // mesmo se o usuário/IA tentou criar com saldo inicial.
      const qtdInicial = tipoControle === "aplicacao_direta" ? 0 : (input.quantidadeAtual ?? 0);

      const item = await criarItemAlmoxarifadoComCodigo(db, input.companyId, {
        companyId:             input.companyId,
        obraId:                input.obraId ?? null,
        nome:                  input.nome,
        unidade:               input.unidade,
        categoria:             input.categoria ?? null,
        codigoInterno:         input.codigoInterno ?? null,
        quantidadeAtual:       String(qtdInicial),
        quantidadeMinima:      String(input.quantidadeMinima ?? 0),
        observacoes:           input.observacoes ?? null,
        especificacao:         input.especificacao ?? null,
        fotoUrl:               input.fotoUrl ?? null,
        valorUnitario:         input.valorUnitario != null ? String(input.valorUnitario) : null,
        ativo:                 true,
        origem:                input.origem ?? "proprio",
        fornecedorLocacao:     input.fornecedorLocacao ?? null,
        dataInicioLocacao:     input.dataInicioLocacao ?? null,
        dataVencimentoLocacao: input.dataVencimentoLocacao ?? null,
        valorLocacaoMensal:    input.valorLocacaoMensal != null ? String(input.valorLocacaoMensal) : null,
        diasAlertaLocacao:     input.diasAlertaLocacao ?? 7,
        observacoesLocacao:    input.observacoesLocacao ?? null,
        tipoControle,
        tipoControleClassificadoIa,
        tipoControleJustificativa,
        criadoPorId:           ctx.user?.id ?? null,
        criadoPorNome:         ctx.user?.name || null,
      });
      return item;
    }),

  // Rev. 1607 — Reclassifica um item existente via IA (botão na UI; bom para backfill).
  // Exige companyId para garantir isolamento por tenant (anti-IDOR).
  reclassificarTipoControleIA: protectedProcedure
    .input(z.object({ itemId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // Tenant isolation — confirma que a empresa do item pertence ao usuário.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowedCompanies.map((c: any) => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      await assertAiModuleEnabled(input.companyId, "compras");

      const [it] = await db.select().from(almoxarifadoItens).where(and(
        eq(almoxarifadoItens.id, input.itemId),
        eq(almoxarifadoItens.companyId, input.companyId),
      ));
      if (!it) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado nesta empresa" });

      // Filtro adicional por obras permitidas (mesma regra de listarItens).
      const allowedObras = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowedObras !== null && it.obraId !== null && !allowedObras.includes(it.obraId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }

      const cls = await classificarTipoControleIA({
        nome: it.nome,
        categoria: it.categoria ?? undefined,
        unidade: it.unidade,
      });

      // Se virou aplicação direta e ainda há saldo/movimentos não-zero, NÃO permite a troca
      // sem reconciliação manual (evita "sumir" itens com estoque real).
      const saldoAtual = n(it.quantidadeAtual);
      if (cls.tipoControle === "aplicacao_direta" && saldoAtual > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `IA classificou como "Aplicação Direta", mas o item tem ${saldoAtual} ${it.unidade} em estoque. Zere o saldo manualmente antes de reclassificar.`,
        });
      }

      await db.update(almoxarifadoItens).set({
        tipoControle: cls.tipoControle,
        tipoControleClassificadoIa: true,
        tipoControleJustificativa: cls.justificativa,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(almoxarifadoItens.id, input.itemId));
      return cls;
    }),

  // Rev. 2373 — Sobrescreve manualmente o tipoControle (operador decide).
  // Usado pelo toggle "Insumo a granel (aplicação direta)" no cadastro.
  // Guarda a mesma proteção do reclassificarIA: NÃO permite virar
  // aplicação direta se ainda há saldo (evita "sumir" estoque real).
  definirTipoControleManual: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      companyId: z.number(),
      tipoControle: z.enum(["estoque", "aplicacao_direta"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowedCompanies.map((c: any) => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const [it] = await db.select().from(almoxarifadoItens).where(and(
        eq(almoxarifadoItens.id, input.itemId),
        eq(almoxarifadoItens.companyId, input.companyId),
      ));
      if (!it) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado nesta empresa" });
      const allowedObras = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowedObras !== null && it.obraId !== null && !allowedObras.includes(it.obraId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }
      const saldoAtual = n(it.quantidadeAtual);
      if (input.tipoControle === "aplicacao_direta" && saldoAtual > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Este item tem ${saldoAtual} ${it.unidade} em estoque. Zere o saldo antes de marcar como "insumo a granel".`,
        });
      }
      const justificativa = input.tipoControle === "aplicacao_direta"
        ? `Marcado manualmente como insumo a granel por ${ctx.user.name || ctx.user.id}: recebimentos vão direto pra obra, não somam saldo.`
        : `Marcado manualmente como estoque normal por ${ctx.user.name || ctx.user.id}: entradas somam ao saldo, saídas descontam.`;
      await db.update(almoxarifadoItens).set({
        tipoControle: input.tipoControle,
        tipoControleClassificadoIa: false,
        tipoControleJustificativa: justificativa,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(almoxarifadoItens.id, input.itemId));
      return { tipoControle: input.tipoControle, justificativa };
    }),

  atualizarItem: protectedProcedure
    .input(z.object({
      id:                    z.number(),
      nome:                  z.string().optional(),
      unidade:               z.string().optional(),
      categoria:             z.string().optional(),
      codigoInterno:         z.string().optional(),
      quantidadeMinima:      z.number().optional(),
      observacoes:           z.string().optional(),
      // Rev. 4011 — Especificação técnica separada do nome.
      especificacao:         z.string().nullable().optional(),
      fotoUrl:               z.string().nullable().optional(),
      valorUnitario:         z.number().nullable().optional(),
      origem:                z.enum(["proprio", "alugado"]).optional(),
      fornecedorLocacao:     z.string().nullable().optional(),
      dataInicioLocacao:     z.string().nullable().optional(),
      dataVencimentoLocacao: z.string().nullable().optional(),
      valorLocacaoMensal:    z.number().nullable().optional(),
      diasAlertaLocacao:     z.number().nullable().optional(),
      observacoesLocacao:    z.string().nullable().optional(),
      quantidadeAtual:       z.number().nullable().optional(),
      // Rev. 2388 — Auditoria obrigatória SE quantidadeAtual está mudando vs DB.
      // Rev. 2400 — `justificativa` agora é opcional; validação min10 aplicada
      // condicionalmente conforme `companies.almoxarifado_exige_justificativa`.
      auditoria: z.object({
        senha: z.string().optional(),
        justificativa: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { id, auditoria, ...data } = input;
      const [itemAcc] = await db.select({ companyId: almoxarifadoItens.companyId }).from(almoxarifadoItens).where(eq(almoxarifadoItens.id, id));
      if (itemAcc) await _assertCompanyAccess(ctx.user, itemAcc.companyId);
      // Rev. 2388 — Detectar alteração manual de quantidade.
      let qtdAnterior: number | null = null;
      let qtdNova: number | null = null;
      let qtdMudou = false;
      let justificativaUsada: string | null = null;
      if (data.quantidadeAtual !== undefined && data.quantidadeAtual !== null) {
        const [atual] = await db.select().from(almoxarifadoItens).where(eq(almoxarifadoItens.id, id));
        if (atual) {
          qtdAnterior = Number(atual.quantidadeAtual ?? 0);
          qtdNova = Number(data.quantidadeAtual);
          // Comparação por inteiros (escala 1000) evita imprecisão de FP do JS.
          if (Math.round(qtdNova * 1000) !== Math.round(qtdAnterior * 1000)) {
            qtdMudou = true;
            // Rev. 2400 — Lê toggle global da empresa do item.
            const cfg = await getAlmoxAuditoriaConfig(atual.companyId);
            justificativaUsada = justificativaFinal(auditoria?.justificativa, cfg.exigeJustificativa);
            await verificarSenhaSeLocal(ctx, auditoria?.senha, cfg.exigeSenha);
          }
        }
      }
      const updates: any = {
        atualizadoEm: new Date().toISOString(),
        atualizadoPorId: ctx.user?.id ?? null,
        atualizadoPorNome: ctx.user?.name || null,
      };
      // Rev. 4010 — padroniza nome (1ª maiúscula + resto minúsculo) também na edição.
      if (data.nome !== undefined)                 updates.nome = data.nome != null ? sql`padronizar_nome_material(${data.nome}::text)` : data.nome;
      if (data.unidade !== undefined)              updates.unidade = data.unidade;
      if (data.categoria !== undefined)            updates.categoria = data.categoria;
      if (data.codigoInterno !== undefined)        updates.codigoInterno = data.codigoInterno;
      if (data.quantidadeMinima !== undefined)     updates.quantidadeMinima = String(data.quantidadeMinima);
      if (data.observacoes !== undefined)          updates.observacoes = data.observacoes;
      if ('especificacao' in data)                 updates.especificacao = data.especificacao;
      if ('fotoUrl' in data)                       updates.fotoUrl = data.fotoUrl;
      if ('valorUnitario' in data)                 updates.valorUnitario = data.valorUnitario != null ? String(data.valorUnitario) : null;
      if (data.origem !== undefined)               updates.origem = data.origem;
      if ('fornecedorLocacao' in data)             updates.fornecedorLocacao = data.fornecedorLocacao;
      if ('dataInicioLocacao' in data)             updates.dataInicioLocacao = data.dataInicioLocacao;
      if ('dataVencimentoLocacao' in data)         updates.dataVencimentoLocacao = data.dataVencimentoLocacao;
      if ('valorLocacaoMensal' in data)            updates.valorLocacaoMensal = data.valorLocacaoMensal != null ? String(data.valorLocacaoMensal) : null;
      if ('diasAlertaLocacao' in data && data.diasAlertaLocacao != null) updates.diasAlertaLocacao = data.diasAlertaLocacao;
      if ('observacoesLocacao' in data)            updates.observacoesLocacao = data.observacoesLocacao;
      if (data.quantidadeAtual !== undefined && data.quantidadeAtual !== null) {
        updates.quantidadeAtual = String(data.quantidadeAtual);
        // Rev. 2392 — edição manual com qty>0 reativa item soft-deleted (zerou via transferência).
        if (Number(data.quantidadeAtual) > 0) updates.ativo = true;
      }
      // Sanitização defensiva de datas: garantir formato yyyy-MM-dd. Datas vazias viram null.
      for (const k of ["dataInicioLocacao", "dataVencimentoLocacao"] as const) {
        if (k in updates) {
          const v = updates[k];
          if (v === "" || v == null) { updates[k] = null; continue; }
          // Converter dd/MM/yyyy → yyyy-MM-dd (caso venha de legacy)
          if (typeof v === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
            const [d, m, y] = v.split("/");
            updates[k] = `${y}-${m}-${d}`;
          }
        }
      }
      try {
        await db.update(almoxarifadoItens).set(updates).where(eq(almoxarifadoItens.id, id));
      } catch (err: any) {
        console.error("[compras.atualizarItem] erro DB:", err?.message, "updates:", JSON.stringify(updates));
        throw err;
      }
      // Rev. 2388 — Log de auditoria SE houve mudança real de quantidade.
      // Rev. 2400 — `justificativaUsada` é resolvida pelo helper conforme config.
      if (qtdMudou && justificativaUsada) {
        const [itemDb] = await db.select().from(almoxarifadoItens).where(eq(almoxarifadoItens.id, id));
        if (itemDb) {
          // Rev. 2462 — auto-validado quando aprovação não é exigida.
          const auditExtra = await getAuditoriaInicialFields(itemDb.companyId, ctx);
          await db.insert(almoxarifadoAuditoria).values({
            companyId: itemDb.companyId,
            obraId: itemDb.obraId,
            userId: ctx.user.id,
            userNome: ctx.user.name || null,
            acao: "alterar_quantidade",
            entidadeTipo: "almoxarifado_item",
            entidadeId: itemDb.id,
            entidadeNome: itemDb.nome,
            dadosAntes: { quantidadeAtual: qtdAnterior } as any,
            dadosDepois: { quantidadeAtual: qtdNova } as any,
            justificativa: justificativaUsada,
            ip: getClientIp(ctx),
            ...auditExtra,
          });
        }
      }
      return { success: true };
    }),

  // Rev. 2382 — Atualizar categoria em lote (multi-seleção no Almoxarifado).
  // Só UPDATE escopado por companyId + ids[]. R-001/R-007/R-010 OK.
  atualizarCategoriaEmLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(1).max(500),
      categoria: z.string().min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const res: any = await db.update(almoxarifadoItens).set({
        categoria: input.categoria.trim(),
        atualizadoEm: new Date().toISOString(),
        atualizadoPorId: ctx.user?.id ?? null,
        atualizadoPorNome: ctx.user?.name || null,
      }).where(and(
        eq(almoxarifadoItens.companyId, input.companyId),
        inArray(almoxarifadoItens.id, input.ids),
      ));
      const itensAtualizados = Number(res.rowCount ?? res.rows?.length ?? 0);
      return { ok: true as const, itensAtualizados };
    }),

  // Rev. 2383 — Atualizar categoria em lote POR NOME (usado no view
  // Consolidado "Todos almoxarifados", onde o card agrega N item_ids).
  // Faz UPDATE escopado por companyId em todos os itens cujo `lower(nome)`
  // bate. R-001/R-007/R-010 OK (só UPDATE, zero DDL/DELETE).
  atualizarCategoriaPorNomeEmLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nomes: z.array(z.string()).min(1).max(500),
      categoria: z.string().min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const nomesLower = Array.from(new Set(
        input.nomes.map(n => (n || "").toLowerCase().trim()).filter(Boolean)
      ));
      if (nomesLower.length === 0) {
        return { ok: false as const, motivo: "Nenhum nome válido.", itensAtualizados: 0 };
      }
      const res: any = await db.update(almoxarifadoItens).set({
        categoria: input.categoria.trim(),
        atualizadoEm: new Date().toISOString(),
        atualizadoPorId: ctx.user?.id ?? null,
        atualizadoPorNome: ctx.user?.name || null,
      }).where(and(
        eq(almoxarifadoItens.companyId, input.companyId),
        inArray(sql`lower(${almoxarifadoItens.nome})`, nomesLower),
      ));
      const itensAtualizados = Number(res.rowCount ?? res.rows?.length ?? 0);
      return { ok: true as const, itensAtualizados };
    }),

  // Rev. 2382 — Unificar itens iguais em lote (mesma obra, mesmo nome
  // normalizado). Canonical = item com MAIOR quantidade do grupo (escolha
  // do user). Soma quantidades no canonical, migra movimentações e
  // recebimentos pra ele, marca os outros como ativo=false (soft-delete,
  // R-010 OK). Agrupamento por nome normalizado (strip prefixo/sufixo
  // `[N.N]` igual ao usado em `buscarFotoWebPorNome`).
  unificarItensEmLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(2).max(500),
      dryRun: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      const rows = await db.select().from(almoxarifadoItens).where(and(
        eq(almoxarifadoItens.companyId, input.companyId),
        inArray(almoxarifadoItens.id, input.ids),
        eq(almoxarifadoItens.ativo, true),
      ));
      if (rows.length < 2) {
        return { ok: false as const, motivo: "Menos de 2 itens ativos selecionados.", grupos: [], totalItensInativados: 0 };
      }
      const norm = (s: string) => (s || "")
        .replace(/^\s*\[[0-9.]+\]\s*/i, "")
        .replace(/\s*\[[0-9.]+\]\s*$/i, "")
        .toLowerCase().trim();
      type Item = typeof rows[number];
      const buckets = new Map<string, Item[]>();
      for (const r of rows) {
        const key = `${r.obraId ?? "null"}__${norm(r.nome)}__${(r.unidade || "").toLowerCase()}`;
        const arr = buckets.get(key) || [];
        arr.push(r);
        buckets.set(key, arr);
      }
      const grupos: any[] = [];
      for (const [key, arr] of buckets.entries()) {
        if (arr.length < 2) continue;
        const sorted = [...arr].sort((a, b) => {
          const qa = Number(a.quantidadeAtual ?? 0);
          const qb = Number(b.quantidadeAtual ?? 0);
          if (qb !== qa) return qb - qa;
          return Number(a.id) - Number(b.id);
        });
        const canonical = sorted[0];
        const outros = sorted.slice(1);
        const somaOutros = outros.reduce((s, it) => s + Number(it.quantidadeAtual ?? 0), 0);
        grupos.push({
          chave: key,
          canonicalId: canonical.id,
          canonicalNome: canonical.nome,
          obraId: canonical.obraId,
          unidade: canonical.unidade,
          qtdAntes: Number(canonical.quantidadeAtual ?? 0),
          qtdDepois: Number(canonical.quantidadeAtual ?? 0) + somaOutros,
          inativadosIds: outros.map(o => o.id),
          inativadosNomes: outros.map(o => ({ id: o.id, nome: o.nome, qtd: Number(o.quantidadeAtual ?? 0) })),
        });
      }
      if (grupos.length === 0) {
        return { ok: false as const, motivo: "Nenhum grupo de duplicatas encontrado entre os selecionados (precisa ter mesmo nome, obra e unidade).", grupos: [], totalItensInativados: 0 };
      }
      if (input.dryRun) {
        return { ok: true as const, dryRun: true as const, grupos, totalItensInativados: grupos.reduce((s, g) => s + g.inativadosIds.length, 0) };
      }
      // Transação garante atomicidade: ou todos os grupos são unificados,
      // ou nada muda (sugestão architect Rev. 2382).
      const totalInativados = await db.transaction(async (tx) => {
        let total = 0;
        for (const g of grupos) {
          if (g.inativadosIds.length === 0) continue;
          // 1) Migrar movimentações pro canonical
          await tx.execute(sql`
            UPDATE almoxarifado_movimentacoes
               SET item_id = ${g.canonicalId}
             WHERE company_id = ${input.companyId}
               AND item_id IN (${sql.join(g.inativadosIds.map((x: number) => sql`${x}`), sql`, `)})
          `);
          // 2) Migrar recebimentos (itemId opcional)
          await tx.execute(sql`
            UPDATE almoxarifado_recebimento_itens
               SET item_id = ${g.canonicalId}
             WHERE item_id IN (${sql.join(g.inativadosIds.map((x: number) => sql`${x}`), sql`, `)})
          `);
          // 3) Somar quantidades no canonical
          await tx.update(almoxarifadoItens).set({
            quantidadeAtual: String(g.qtdDepois),
            atualizadoEm: new Date().toISOString(),
            atualizadoPorId: ctx.user?.id ?? null,
            atualizadoPorNome: ctx.user?.name || null,
          }).where(eq(almoxarifadoItens.id, g.canonicalId));
          // 4) Inativar os outros (NUNCA DELETE — R-010)
          const resInat: any = await tx.update(almoxarifadoItens).set({
            ativo: false,
            observacoes: sql`COALESCE(observacoes, '') || ${`\n[Unificado em ${new Date().toISOString().slice(0, 10)} no item #${g.canonicalId}]`}`,
            atualizadoEm: new Date().toISOString(),
            atualizadoPorId: ctx.user?.id ?? null,
            atualizadoPorNome: ctx.user?.name || null,
          }).where(and(
            eq(almoxarifadoItens.companyId, input.companyId),
            inArray(almoxarifadoItens.id, g.inativadosIds),
          ));
          total += Number(resInat.rowCount ?? resInat.rows?.length ?? g.inativadosIds.length);
        }
        return total;
      });
      return { ok: true as const, grupos, totalItensInativados: totalInativados };
    }),

  // Rev. 2377 — Busca de foto "como usuário normal faria" pros itens do
  // Almoxarifado. Mesma estratégia da Rev. 2366 (Equipamentos Locados):
  // DuckDuckGo Images, 1ª foto válida, UPDATE em todos os itens da empresa
  // com o mesmo `nome` que estejam SEM foto. Sem LLM, sem cascade.
  buscarFotoWebPorNome: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1).max(500),
      sobrescrever: z.boolean().optional().default(false),
      queryOverride: z.string().min(1).max(500).optional(),
      dryRun: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      };

      const queryDDG = (input.queryOverride || input.nome).trim();
      const ctrl1 = new AbortController();
      const t1 = setTimeout(() => ctrl1.abort(), 9000);
      let vqd: string | null = null;
      try {
        const r1 = await fetch(
          `https://duckduckgo.com/?q=${encodeURIComponent(queryDDG)}&iax=images&ia=images`,
          { signal: ctrl1.signal, headers: { ...headers, "Accept": "text/html,application/xhtml+xml" } }
        );
        const html = await r1.text();
        const m = html.match(/vqd=["']([\d-]+)["']/)
              || html.match(/vqd=([\d-]+)/)
              || html.match(/&vqd=([\w-]+)&/);
        if (m) vqd = m[1];
      } catch (e: any) {
        console.error("[compras.buscarFotoWebPorNome] vqd fetch falhou:", e?.message || e);
      } finally { clearTimeout(t1); }

      if (!vqd) {
        return {
          ok: false as const,
          motivo: "Busca web indisponível no momento (não foi possível obter token da DuckDuckGo).",
          fotoUrl: null,
          itensAtualizados: 0,
          nome: input.nome,
        };
      }

      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 9000);
      let fotoUrl: string | null = null;
      try {
        const url = `https://duckduckgo.com/i.js?l=br-pt&o=json&q=${encodeURIComponent(queryDDG)}&vqd=${vqd}&f=,,,,,&p=1`;
        const r2 = await fetch(url, {
          signal: ctrl2.signal,
          headers: { ...headers, "Accept": "application/json", "Referer": "https://duckduckgo.com/" },
        });
        if (r2.ok) {
          const j: any = await r2.json();
          const results: any[] = Array.isArray(j?.results) ? j.results : [];
          for (const it of results) {
            const u = String(it?.image || "");
            if (/^https:\/\//.test(u)
                && /\.(jpe?g|png|webp)(\?|$)/i.test(u)
                && u.length <= 1000) {
              fotoUrl = u;
              break;
            }
          }
        }
      } catch (e: any) {
        console.error("[compras.buscarFotoWebPorNome] i.js fetch falhou:", e?.message || e);
      } finally { clearTimeout(t2); }

      if (!fotoUrl) {
        return {
          ok: false as const,
          motivo: "Nenhuma foto válida encontrada na 1ª página de resultados.",
          fotoUrl: null,
          itensAtualizados: 0,
          nome: input.nome,
        };
      }

      if (input.dryRun) {
        return {
          ok: true as const,
          fotoUrl,
          itensAtualizados: 0,
          nome: input.nome,
          dryRun: true as const,
        };
      }

      // UPDATE em todos os itens da empresa com o mesmo nome SEM foto
      // (ou sobrescreve se sobrescrever=true). NUNCA toca itens inativos.
      // Match NORMALIZADO: o frontend agrupa por nome "limpo" (sem prefixo/sufixo
      // `[N.N]` do código interno), mas o banco guarda o nome original.
      // Pra casar, normalizamos AMBOS os lados via regex no SQL.
      const condFoto = input.sobrescrever
        ? sql`1=1`
        : sql`(foto_url IS NULL OR foto_url = '')`;
      const res: any = await db.execute(sql`
        UPDATE almoxarifado_itens
           SET foto_url = ${fotoUrl}, atualizado_em = NOW()
         WHERE company_id = ${input.companyId}
           AND lower(btrim(regexp_replace(regexp_replace(nome, '^[[][0-9.]+[]][[:space:]]*', ''), '[[:space:]]*[[][0-9.]+[]]$', '')))
             = lower(btrim(regexp_replace(regexp_replace(${input.nome}::text, '^[[][0-9.]+[]][[:space:]]*', ''), '[[:space:]]*[[][0-9.]+[]]$', '')))
           AND ativo = TRUE
           AND ${condFoto}
      `);
      const itensAtualizados = Number(res.rowCount ?? res.rows?.length ?? 0);

      return {
        ok: true as const,
        fotoUrl,
        itensAtualizados,
        nome: input.nome,
      };
    }),

  getItensLocadosVencendo: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoItens)
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
          eq(almoxarifadoItens.origem, "alugado"),
        ));
      const hoje = new Date();
      return rows
        .filter(i => i.dataVencimentoLocacao)
        .map(i => {
          const venc = new Date(i.dataVencimentoLocacao!);
          const diffDias = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          const alertaDias = (i as any).diasAlertaLocacao ?? 7;
          return { ...i, diasParaVencimento: diffDias, alertaDias };
        })
        .filter(i => i.diasParaVencimento <= i.alertaDias)
        .sort((a, b) => a.diasParaVencimento - b.diasParaVencimento);
    }),

  devolverLocacaoItem: protectedProcedure
    .input(z.object({ id: z.number(), observacao: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [itemAcc] = await db.select({ companyId: almoxarifadoItens.companyId }).from(almoxarifadoItens).where(eq(almoxarifadoItens.id, input.id));
      if (itemAcc) await _assertCompanyAccess(ctx.user, itemAcc.companyId);
      const obs = input.observacao ? `\nDevolução em ${new Date().toLocaleDateString("pt-BR")}: ${input.observacao}` : `\nDevolução em ${new Date().toLocaleDateString("pt-BR")}`;
      await db.update(almoxarifadoItens).set({
        origem: "proprio",
        fornecedorLocacao: null,
        dataInicioLocacao: null,
        dataVencimentoLocacao: null,
        valorLocacaoMensal: null,
        observacoesLocacao: sql`COALESCE(observacoes_locacao, '') || ${obs}`,
        ativo: false,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(almoxarifadoItens.id, input.id));
      return { success: true };
    }),

  excluirItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      // Rev. 2388 — Controle rígido: justificativa obrigatória + senha
      // se o user tem login local. Gera log em almoxarifado_auditoria.
      // Rev. 2400 — Ambos agora opcionais; obrigatoriedade é controlada pelo
      // toggle por empresa em `companies.almoxarifado_exige_*`.
      senha: z.string().optional(),
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [item] = await db.select().from(almoxarifadoItens).where(eq(almoxarifadoItens.id, input.id));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
      await _assertCompanyAccess(ctx.user, item.companyId);
      const cfg = await getAlmoxAuditoriaConfig(item.companyId);
      const justUsada = justificativaFinal(input.justificativa, cfg.exigeJustificativa);
      await verificarSenhaSeLocal(ctx, input.senha, cfg.exigeSenha);
      await db.update(almoxarifadoItens)
        .set({ ativo: false, atualizadoEm: new Date().toISOString() })
        .where(eq(almoxarifadoItens.id, input.id));
      // Rev. 2445 — CASCADE: desativa baias vinculadas ao item.
      // Antes (bug user 22:38): user deletava "Item TESTE -areia" mas a
      // baia ligada continuava ativa e aparecia no Inventário Visual via
      // fallback "baias com itemId apontando pra item NÃO-agregado".
      // Item deletado → baia some de tudo.
      const baiasDesativadas = await db.update(almoxarifadoBaias)
        .set({ ativo: false, atualizadoEm: new Date().toISOString() } as any)
        .where(and(eq(almoxarifadoBaias.itemId, input.id), eq(almoxarifadoBaias.ativo, true)))
        .returning({ id: almoxarifadoBaias.id, nome: almoxarifadoBaias.nome, obraId: almoxarifadoBaias.obraId });
      // Rev. 2462 — auto-validado quando aprovação não é exigida.
      const auditExtraItem = await getAuditoriaInicialFields(item.companyId, ctx);
      await db.insert(almoxarifadoAuditoria).values({
        companyId: item.companyId,
        obraId: item.obraId,
        userId: ctx.user.id,
        userNome: ctx.user.name || null,
        acao: "excluir_item",
        entidadeTipo: "almoxarifado_item",
        entidadeId: item.id,
        entidadeNome: item.nome,
        dadosAntes: item as any,
        dadosDepois: { ativo: false, baiasDesativadas } as any,
        justificativa: justUsada,
        ip: getClientIp(ctx),
        ...auditExtraItem,
      });
      return { success: true, baiasDesativadas: baiasDesativadas.length };
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — ESTOQUE CONSOLIDADO
  // ══════════════════════════════════════════════════════════════

  listarItensConsolidado: protectedProcedure
    .input(z.object({ companyId: z.number(), busca: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      // Rev. 1609 — Consistência com listarItens: aplicar filtro de obras permitidas.
      // Antes, um usuário restrito podia ver o consolidado completo da empresa ao trocar
      // o seletor para "todos", contornando a restrição da view por obra.
      const conds: any[] = [
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
      ];
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) {
          console.log(`[listarItensConsolidado] user=${ctx.user.id}/${ctx.user.role} company=${input.companyId} → SEM obras permitidas, retornando vazio`);
          return { itens: [], totalGeral: 0 };
        }
        // Inclui itens centrais (obraId IS NULL) + obras permitidas.
        conds.push(or(isNull(almoxarifadoItens.obraId), inArray(almoxarifadoItens.obraId, allowed)));
      }
      const rows = await db.select().from(almoxarifadoItens)
        .where(and(...conds))
        .orderBy(asc(almoxarifadoItens.nome));
      console.log(`[listarItensConsolidado] user=${ctx.user.id}/${ctx.user.role} company=${input.companyId} allowed=${allowed === null ? 'null(admin)' : '['+allowed.length+']'} → ${rows.length} itens`);

      const busca = input.busca?.toLowerCase();
      const filtered = busca
        ? rows.filter(i => i.nome.toLowerCase().includes(busca) || i.categoria?.toLowerCase().includes(busca) || i.codigoInterno?.toLowerCase().includes(busca))
        : rows;

      // Group by (nome + unidade + categoria) and sum quantities
      const map = new Map<string, any>();
      for (const item of filtered) {
        const key = `${item.nome.toLowerCase()}|${item.unidade}`;
        if (!map.has(key)) {
          map.set(key, {
            nome: item.nome, unidade: item.unidade, categoria: item.categoria,
            codigoInterno: item.codigoInterno,
            quantidadeTotal: 0, quantidadeMinima: 0, valorUnitario: null,
            valorTotalEstoque: 0, almoxarifados: [], fotoUrl: null,
            precoPreenchidoIa: false,
          });
        }
        const entry = map.get(key)!;
        const qty = n(item.quantidadeAtual);
        entry.quantidadeTotal += qty;
        entry.quantidadeMinima += n(item.quantidadeMinima);
        if (!entry.fotoUrl && (item as any).fotoUrl) entry.fotoUrl = (item as any).fotoUrl;
        if (!entry.valorUnitario && item.valorUnitario) {
          entry.valorUnitario = item.valorUnitario;
        }
        // Flag "IA" no agrupado: true se QUALQUER item contribuinte com preço foi preenchido por IA
        if (item.valorUnitario && (item as any).precoPreenchidoIa) {
          entry.precoPreenchidoIa = true;
        }
        if (item.obraId) {
          entry.almoxarifados.push({ tipo: "obra", obraId: item.obraId, quantidade: qty, itemId: item.id });
        } else {
          entry.almoxarifados.push({ tipo: "central", quantidade: qty, itemId: item.id });
        }
      }
      const result = Array.from(map.values()).map(e => ({
        ...e,
        valorTotalEstoque: n(e.valorUnitario) * e.quantidadeTotal,
      }));
      const totalGeral = result.reduce((s, r) => s + r.valorTotalEstoque, 0);
      return { itens: result, totalGeral };
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — IA: PREENCHIMENTO EM LOTE DE PREÇOS FALTANTES
  // ══════════════════════════════════════════════════════════════
  // Rev. 1604 — Para todos os itens da company que estão sem valor_unitario
  // (NULL ou 0), pede à IA estimar o preço médio de mercado em lotes,
  // grava `valor_unitario` + flag `preco_preenchido_ia=true` + `preco_ia_em`.
  preencherPrecosFaltantesIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(), // se passado, restringe à obra
      tamanhoLote: z.number().min(5).max(40).default(20),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      await assertAiModuleEnabled(input.companyId, "compras");
      const db = await getDb();

      // 1) Pega todos itens sem preço
      const conds: any[] = [
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
        or(isNull(almoxarifadoItens.valorUnitario), eq(almoxarifadoItens.valorUnitario, "0")),
      ];
      if (input.obraId === null) {
        conds.push(isNull(almoxarifadoItens.obraId));
      } else if (input.obraId !== undefined) {
        conds.push(eq(almoxarifadoItens.obraId, input.obraId));
      }
      // Aplica filtro de obras permitidas (mesma regra de listarItens) para impedir
      // que um usuário com escopo restrito atualize preços de obras que não administra.
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) {
          return { processados: 0, atualizados: 0, falhas: 0, mensagem: "Sem permissão em nenhuma obra desta empresa." };
        }
        if (input.obraId !== undefined && input.obraId !== null && !allowed.includes(input.obraId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta obra." });
        }
        conds.push(or(isNull(almoxarifadoItens.obraId), inArray(almoxarifadoItens.obraId, allowed)));
      }
      const todos = await db.select().from(almoxarifadoItens).where(and(...conds));
      if (todos.length === 0) {
        return { processados: 0, atualizados: 0, falhas: 0, mensagem: "Nenhum item sem preço encontrado." };
      }

      // 2) Processa em lotes
      const lotes: typeof todos[] = [];
      for (let i = 0; i < todos.length; i += input.tamanhoLote) {
        lotes.push(todos.slice(i, i + input.tamanhoLote));
      }

      let atualizados = 0;
      let falhas = 0;

      for (const lote of lotes) {
        const linhas = lote.map((it) => `${it.id}|${it.nome}|${it.unidade}|${it.categoria ?? "-"}`).join("\n");
        const prompt = `Você é um especialista em precificação de materiais e equipamentos de construção civil no Brasil em 2025.

Para CADA item abaixo (formato: id|nome|unidade|categoria), estime o PREÇO MÉDIO UNITÁRIO de mercado para compra/aquisição em Reais (R$). Use seu conhecimento de mercado para itens comuns (cimento, aço, ferramentas, EPIs, hidráulica, elétrica, etc).

Itens:
${linhas}

REGRAS IMPORTANTES:
- Se o nome for muito vago (ex.: "Almoço", "Diversos", "Material X") ou se for impossível estimar com confiança, use preco=0 e confianca="baixa".
- Caso contrário, dê o melhor preço médio realista para o varejo brasileiro de construção.
- Considere a unidade (kg, m², un, sc, L etc) ao precificar.
- NÃO invente valores absurdos. Para itens incertos, prefira preco=0.

Responda APENAS com um JSON no formato (sem markdown, sem comentários):
{"itens":[{"id":<id>,"preco":<numero_em_reais>,"confianca":"alta"|"media"|"baixa"}]}`;

        try {
          const result = await invokeLLM({
            messages: [{ role: "user", content: prompt }],
            maxTokens: 4096,
          });
          const text = result.content ?? "";
          const match = text.match(/\{[\s\S]*\}/);
          if (!match) { falhas += lote.length; continue; }
          const parsed = JSON.parse(match[0]);
          const respostas: Array<{ id: number; preco: number; confianca?: string }> = parsed.itens || [];
          const byId = new Map(respostas.map((r) => [Number(r.id), r]));

          const agora = new Date().toISOString();
          for (const it of lote) {
            const r = byId.get(it.id);
            if (!r || !Number.isFinite(Number(r.preco)) || Number(r.preco) <= 0) {
              falhas++;
              continue;
            }
            await db.update(almoxarifadoItens)
              .set({
                valorUnitario: String(Number(r.preco).toFixed(2)),
                precoPreenchidoIa: true,
                precoIaEm: agora,
              } as any)
              .where(eq(almoxarifadoItens.id, it.id));
            atualizados++;
          }
        } catch (err: any) {
          console.error("[preencherPrecosFaltantesIA] Lote falhou:", err?.message || err);
          falhas += lote.length;
        }
      }

      return {
        processados: todos.length,
        atualizados,
        falhas,
        mensagem: `${atualizados} de ${todos.length} itens atualizados pela IA${falhas > 0 ? ` · ${falhas} falharam (nome muito vago ou erro de IA)` : ""}.`,
      };
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — IA: SUGERIR CATEGORIAS PARA ITENS SEM CATEGORIA
  // ══════════════════════════════════════════════════════════════
  // Rev. 2386 — Analisa itens sem categoria (NULL/vazio) e sugere uma
  // categoria pra cada um, escolhendo APENAS dentre as categorias já
  // cadastradas na empresa (almoxarifado_categorias). Retorna sugestões
  // pro frontend revisar e aplicar (não escreve no banco — apply é feito
  // pelo client via `atualizarCategoriaPorNomeEmLote`).
  sugerirCategoriasIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      tamanhoLote: z.number().min(5).max(50).default(25),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 0) Validar acesso à empresa (paridade com atualizarCategoriaEmLote)
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedCompanyIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedCompanyIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      await assertAiModuleEnabled(input.companyId, "compras");

      // 1) Categorias disponíveis (vocabulário fechado pra IA escolher)
      const categoriasRows = await db.select().from(almoxarifadoCategorias)
        .where(eq(almoxarifadoCategorias.companyId, input.companyId))
        .orderBy(asc(almoxarifadoCategorias.ordem), asc(almoxarifadoCategorias.nome));
      const categorias = categoriasRows.map(r => r.nome);
      if (categorias.length === 0) {
        return { sugestoes: [], total: 0, mensagem: "Cadastre ao menos uma categoria antes de pedir sugestões à IA." };
      }

      // 2) Itens sem categoria, escopados por permissão de obra
      const conds: any[] = [
        eq(almoxarifadoItens.companyId, input.companyId),
        eq(almoxarifadoItens.ativo, true),
        or(isNull(almoxarifadoItens.categoria), eq(almoxarifadoItens.categoria, "")),
      ];
      if (input.obraId === null) {
        conds.push(isNull(almoxarifadoItens.obraId));
      } else if (input.obraId !== undefined) {
        conds.push(eq(almoxarifadoItens.obraId, input.obraId));
      }
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) {
          return { sugestoes: [], total: 0, mensagem: "Sem permissão em nenhuma obra desta empresa." };
        }
        if (input.obraId !== undefined && input.obraId !== null && !allowed.includes(input.obraId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta obra." });
        }
        conds.push(or(isNull(almoxarifadoItens.obraId), inArray(almoxarifadoItens.obraId, allowed)));
      }
      const todos = await db.select({
        id: almoxarifadoItens.id,
        nome: almoxarifadoItens.nome,
        unidade: almoxarifadoItens.unidade,
      }).from(almoxarifadoItens).where(and(...conds));

      // Deduplicar por nome lower (consolidado pra LLM, mas devolve IDs por nome)
      const porNomeLower = new Map<string, { nome: string; unidade: string | null; ids: number[] }>();
      for (const it of todos) {
        const k = (it.nome || "").toLowerCase().trim();
        if (!k) continue;
        const cur = porNomeLower.get(k);
        if (cur) cur.ids.push(it.id);
        else porNomeLower.set(k, { nome: it.nome, unidade: it.unidade, ids: [it.id] });
      }
      const nomesUnicos = Array.from(porNomeLower.values());
      if (nomesUnicos.length === 0) {
        return { sugestoes: [], total: 0, mensagem: "Nenhum item sem categoria encontrado." };
      }

      // 3) Processa em lotes
      const lotes: typeof nomesUnicos[] = [];
      for (let i = 0; i < nomesUnicos.length; i += input.tamanhoLote) {
        lotes.push(nomesUnicos.slice(i, i + input.tamanhoLote));
      }

      const sugestoes: Array<{
        nome: string;
        unidade: string | null;
        qtdItens: number;
        ids: number[];
        categoriaSugerida: string | null;
        confianca: "alta" | "media" | "baixa";
      }> = [];
      let falhas = 0;

      for (const [idxLote, lote] of lotes.entries()) {
        const linhas = lote.map((it, i) => `${i + 1}|${it.nome}|${it.unidade ?? "-"}`).join("\n");
        const prompt = `Você é um especialista em organização de almoxarifado de obras de construção civil no Brasil.

Para CADA item abaixo (formato: indice|nome|unidade), escolha A MELHOR categoria DENTRE A LISTA FECHADA fornecida. NÃO invente categorias novas — use EXATAMENTE um dos nomes da lista.

Lista de categorias disponíveis (escolha apenas dessas):
${categorias.map(c => `- ${c}`).join("\n")}

Itens para classificar:
${linhas}

REGRAS:
- Use EXATAMENTE o nome da categoria como está na lista (preserve acentos, maiúsculas/minúsculas).
- Se o nome do item for muito vago/ambíguo pra escolher com confiança, retorne categoria=null e confianca="baixa".
- Caso contrário, use confianca="alta" quando o match é óbvio (ex.: "Cimento CP-II 50kg" → "Insumos"), "media" quando faz sentido mas tem alternativa plausível.

Responda APENAS com um JSON (sem markdown, sem comentários extras):
{"itens":[{"indice":<numero>,"categoria":"<nome_exato_da_lista_ou_null>","confianca":"alta"|"media"|"baixa"}]}`;

        try {
          const result = await invokeLLM({
            messages: [{ role: "user", content: prompt }],
            maxTokens: 4096,
          });
          const text = (result as any)?.choices?.[0]?.message?.content ?? (result as any)?.content ?? "";
          const match = String(text).match(/\{[\s\S]*\}/);
          if (!match) { falhas += lote.length; continue; }
          const parsed = JSON.parse(match[0]);
          const respostas: Array<{ indice: number; categoria: string | null; confianca?: string }> = parsed.itens || [];
          const byIdx = new Map(respostas.map(r => [Number(r.indice), r]));

          const categoriasSet = new Set(categorias);
          for (const [i, it] of lote.entries()) {
            const r = byIdx.get(i + 1);
            const sug = r?.categoria && categoriasSet.has(r.categoria) ? r.categoria : null;
            const conf = (r?.confianca === "alta" || r?.confianca === "media" || r?.confianca === "baixa")
              ? r.confianca : (sug ? "media" : "baixa");
            sugestoes.push({
              nome: it.nome,
              unidade: it.unidade,
              qtdItens: it.ids.length,
              ids: it.ids,
              categoriaSugerida: sug,
              confianca: conf as any,
            });
          }
        } catch (err: any) {
          console.error(`[sugerirCategoriasIA] Lote ${idxLote + 1}/${lotes.length} falhou:`, err?.message || err);
          falhas += lote.length;
          for (const it of lote) {
            sugestoes.push({
              nome: it.nome,
              unidade: it.unidade,
              qtdItens: it.ids.length,
              ids: it.ids,
              categoriaSugerida: null,
              confianca: "baixa",
            });
          }
        }
      }

      // Ordena: com sugestão (alta → media → baixa) primeiro, depois sem sugestão
      const ordemConf: any = { alta: 0, media: 1, baixa: 2 };
      sugestoes.sort((a, b) => {
        if (!!a.categoriaSugerida !== !!b.categoriaSugerida) return a.categoriaSugerida ? -1 : 1;
        return (ordemConf[a.confianca] ?? 3) - (ordemConf[b.confianca] ?? 3);
      });

      const comSugestao = sugestoes.filter(s => s.categoriaSugerida).length;
      return {
        sugestoes,
        total: sugestoes.length,
        comSugestao,
        falhas,
        categoriasDisponiveis: categorias,
        mensagem: `IA analisou ${sugestoes.length} item(ns) distinto(s). ${comSugestao} com sugestão${falhas > 0 ? ` · ${falhas} falharam` : ""}.`,
      };
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — IA: SUGESTÃO DE PREÇO POR FOTO
  // ══════════════════════════════════════════════════════════════

  sugerirPrecoIA: protectedProcedure
    .input(z.object({
      nome: z.string(),
      unidade: z.string().optional(),
      categoria: z.string().optional(),
      fotoUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertAiModuleEnabled((ctx.user as any)?.companyId, "compras");
      const content: any[] = [];
      if (input.fotoUrl) {
        try {
          if (input.fotoUrl.startsWith("data:")) {
            content.push({ type: "image_url", image_url: { url: input.fotoUrl, detail: "low" } });
          } else {
            const imgResp = await fetch(input.fotoUrl);
            if (imgResp.ok) {
              const buf = Buffer.from(await imgResp.arrayBuffer());
              const ct = imgResp.headers.get("content-type") || "image/jpeg";
              const b64 = `data:${ct};base64,${buf.toString("base64")}`;
              content.push({ type: "image_url", image_url: { url: b64, detail: "low" } });
            }
          }
        } catch {}
      }
      content.push({
        type: "text",
        text: `Você é um especialista em precificação de materiais e equipamentos de construção civil no Brasil.
Com base ${input.fotoUrl ? "na imagem e " : ""}no nome do item abaixo, estime o preço médio unitário de mercado (em Reais, R$) para compra/aquisição deste item.

Item: ${input.nome}
${input.unidade ? `Unidade: ${input.unidade}` : ""}
${input.categoria ? `Categoria: ${input.categoria}` : ""}

Responda APENAS com um objeto JSON no formato:
{
  "precoSugerido": <número em reais, ex: 45.90>,
  "descricao": "<breve descrição do item identificado>",
  "justificativa": "<1-2 frases explicando a base da estimativa>",
  "confianca": "alta" | "media" | "baixa"
}`,
      });

      const result = await invokeLLM({
        messages: [{ role: "user", content }],
        maxTokens: 300,
      });

      try {
        const text = result.content ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("JSON não encontrado na resposta");
        return JSON.parse(match[0]);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou preço válido. Tente novamente." });
      }
    }),

  buscarPorCodigoBarras: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      codigo: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const code = input.codigo.trim();

      const existing = await db.select().from(almoxarifadoItens)
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
          sql`LOWER(${almoxarifadoItens.codigoInterno}) = ${code.toLowerCase()}`
        ))
        .limit(1);

      if (existing.length > 0) {
        const item = existing[0];
        return {
          found: true as const,
          source: "local" as const,
          nome: item.nome,
          unidade: item.unidade,
          categoria: item.categoria ?? "",
          valorUnitario: item.valorUnitario ? parseFloat(String(item.valorUnitario)) : null,
          fotoUrl: (item as any).fotoUrl ?? null,
          descricao: `Item já cadastrado no almoxarifado`,
        };
      }

      // Fallback IA — só dispara se o módulo de IA "compras" estiver ligado p/ a empresa.
      // (lookup local acima continua valendo mesmo com IA desligada)
      if (!(await isAiModuleEnabled(input.companyId, "compras"))) {
        return { found: false as const, source: "ia" as const };
      }

      try {
        const result = await invokeLLM({
          messages: [{ role: "user", content: `Você é um especialista em materiais de construção civil e produtos em geral no Brasil.

Dado o código de barras / EAN / código interno abaixo, identifique o produto e retorne suas informações.

Código: ${code}

Se for um código EAN-13, EAN-8 ou GTIN válido, identifique o produto real.
Se for um código interno (não padronizado), tente inferir pelo padrão se possível.

Responda APENAS com um objeto JSON:
{
  "identificado": true/false,
  "nome": "<nome completo do produto>",
  "descricao": "<breve descrição>",
  "categoria": "<uma das: Elétrica, Hidráulica, Pisos, Pintura, Ferramentas, Louças e Metais, Alvenaria, Madeira, Serralheria, Impermeabilização, Segurança, Limpeza, Diversos>",
  "unidade": "<un, m, m², kg, L, sc, cx, pc, rolo, barra, pç>",
  "precoEstimado": <número em reais ou null se desconhecido>,
  "confianca": "alta" | "media" | "baixa"
}

Se não conseguir identificar, retorne {"identificado": false}.` }],
          maxTokens: 400,
        });

        const text = result.content ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return { found: false as const, source: "ia" as const };

        const parsed = JSON.parse(match[0]);
        if (!parsed.identificado) return { found: false as const, source: "ia" as const };

        return {
          found: true as const,
          source: "ia" as const,
          nome: parsed.nome || "",
          unidade: parsed.unidade || "un",
          categoria: parsed.categoria || "",
          valorUnitario: parsed.precoEstimado ?? null,
          fotoUrl: null,
          descricao: parsed.descricao || "",
          confianca: parsed.confianca || "baixa",
        };
      } catch {
        return { found: false as const, source: "ia" as const };
      }
    }),

  // ══════════════════════════════════════════════════════════════
  // ALMOXARIFADO — MOVIMENTAÇÕES
  // ══════════════════════════════════════════════════════════════

  registrarMovimento: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      itemId:      z.number(),
      tipo:        z.enum(["entrada", "saida", "ajuste"]),
      quantidade:  z.number().positive(),
      obraId:      z.number().optional(),
      obraNome:    z.string().optional(),
      motivo:      z.string().optional(),
      usuarioId:   z.number().optional(),
      usuarioNome: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // Verifica saldo disponível para saída
      if (input.tipo === "saida") {
        const [item] = await db.select().from(almoxarifadoItens)
          .where(eq(almoxarifadoItens.id, input.itemId));
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
        if (n(item.quantidadeAtual) < input.quantidade) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Saldo insuficiente. Disponível: ${n(item.quantidadeAtual)} ${item.unidade}`,
          });
        }
      }

      // Registra movimentação
      await db.insert(almoxarifadoMovimentacoes).values({
        companyId:   input.companyId,
        itemId:      input.itemId,
        tipo:        input.tipo,
        quantidade:  String(input.quantidade),
        obraId:      input.obraId ?? null,
        obraNome:    input.obraNome ?? null,
        motivo:      input.motivo ?? null,
        usuarioId:   input.usuarioId ?? null,
        usuarioNome: input.usuarioNome ?? null,
        observacoes: input.observacoes ?? null,
      });

      // Atualiza saldo do item.
      // Rev. 2392 — se for ENTRADA (delta>0), reativa item caso estivesse soft-deleted.
      const delta = input.tipo === "entrada" ? input.quantidade : -input.quantidade;
      const updateSet: any = {
        quantidadeAtual: sql`GREATEST(0, ${almoxarifadoItens.quantidadeAtual}::numeric + ${delta})`,
        atualizadoEm: new Date().toISOString(),
      };
      if (delta > 0) updateSet.ativo = true;
      await db.update(almoxarifadoItens)
        .set(updateSet)
        .where(eq(almoxarifadoItens.id, input.itemId));

      return { success: true };
    }),

  listarMovimentos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      itemId:    z.number().optional(),
      limite:    z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return db.select().from(almoxarifadoMovimentacoes)
        .where(and(
          eq(almoxarifadoMovimentacoes.companyId, input.companyId),
          input.itemId ? eq(almoxarifadoMovimentacoes.itemId, input.itemId) : undefined,
        ))
        .orderBy(desc(almoxarifadoMovimentacoes.criadoEm))
        .limit(input.limite ?? 200);
    }),

  // Categorias distintas dos itens do almoxarifado (legado - mantido para compatibilidade)
  listarCategoriasAlmoxarifado: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoCategorias)
        .where(eq(almoxarifadoCategorias.companyId, input.companyId))
        .orderBy(asc(almoxarifadoCategorias.ordem), asc(almoxarifadoCategorias.nome));
      return rows.map(r => r.nome);
    }),

  // ══════════════════════════════════════════════════════════════
  // CATEGORIAS DO ALMOXARIFADO (CRUD)
  // ══════════════════════════════════════════════════════════════
  listarCategorias: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return db.select().from(almoxarifadoCategorias)
        .where(eq(almoxarifadoCategorias.companyId, input.companyId))
        .orderBy(asc(almoxarifadoCategorias.ordem), asc(almoxarifadoCategorias.nome));
    }),

  criarCategoria: protectedProcedure
    .input(z.object({ companyId: z.number(), nome: z.string().min(1, "Nome obrigatório"), ordem: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const existing = await db.select().from(almoxarifadoCategorias)
        .where(and(eq(almoxarifadoCategorias.companyId, input.companyId), eq(almoxarifadoCategorias.nome, input.nome.trim())));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Categoria já existe" });
      const [cat] = await db.insert(almoxarifadoCategorias).values({
        companyId: input.companyId,
        nome: input.nome.trim(),
        ordem: input.ordem ?? 0,
      }).returning();
      return cat;
    }),

  atualizarCategoria: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), nome: z.string().min(1), ordem: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const dup = await db.select().from(almoxarifadoCategorias)
        .where(and(
          eq(almoxarifadoCategorias.companyId, input.companyId),
          eq(almoxarifadoCategorias.nome, input.nome.trim()),
        ));
      if (dup.length > 0 && dup[0].id !== input.id) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma categoria com este nome" });
      await db.update(almoxarifadoCategorias).set({ nome: input.nome.trim(), ordem: input.ordem ?? 0 })
        .where(and(eq(almoxarifadoCategorias.id, input.id), eq(almoxarifadoCategorias.companyId, input.companyId)));
      return { success: true };
    }),

  // Rev. 2394 — Excluir categoria + migrar itens pra "Sem categoria" (NULL)
  // de forma atômica. Antes só apagava a row da categoria deixando os itens
  // com a string órfã, agora UPDATE compras_itens SET categoria=NULL primeiro,
  // depois DELETE da row de categoria. Retorna count de itens migrados.
  excluirCategoria: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return await db.transaction(async (tx: any) => {
        const [cat] = await tx.select().from(almoxarifadoCategorias)
          .where(and(eq(almoxarifadoCategorias.id, input.id), eq(almoxarifadoCategorias.companyId, input.companyId)));
        if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada" });
        const migr = await tx.execute(sql`
          UPDATE almoxarifado_itens
             SET categoria = NULL
           WHERE company_id = ${input.companyId} AND categoria = ${cat.nome}
        `);
        const itensMigrados = Number((migr as any)?.rowCount ?? (migr as any)?.affectedRows ?? 0);
        await tx.delete(almoxarifadoCategorias)
          .where(and(eq(almoxarifadoCategorias.id, input.id), eq(almoxarifadoCategorias.companyId, input.companyId)));
        return { success: true, itensMigrados, categoriaNome: cat.nome };
      });
    }),

  // Rev. 2394 — Conta itens por categoria (inclui "Sem categoria" como NULL/'').
  // Usado pela UI de Configurações pra mostrar quantos itens cada categoria tem
  // antes de excluir.
  contarItensPorCategoria: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT COALESCE(NULLIF(TRIM(categoria), ''), '__sem__') AS categoria, COUNT(*)::int AS total
          FROM almoxarifado_itens
         WHERE company_id = ${input.companyId} AND ativo = true
         GROUP BY 1
      `);
      const map: Record<string, number> = {};
      for (const r of (rows as any).rows ?? rows as any) {
        map[String(r.categoria)] = Number(r.total);
      }
      return map;
    }),

  // Rev. 2395 — Limpa categorias ÓRFÃS: itens cuja string em
  // `almoxarifado_itens.categoria` não bate com nenhum `nome` em
  // `almoxarifado_categorias` (foram apagadas antes da Rev. 2394 ou
  // direto no banco). Move tudo pra NULL ("Sem categoria"). Idempotente.
  // Retorna count + lista das categorias órfãs encontradas.
  limparCategoriasOrfas: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const orfasRows = await db.execute(sql`
        SELECT TRIM(categoria) AS categoria, COUNT(*)::int AS total
          FROM almoxarifado_itens
         WHERE company_id = ${input.companyId}
           AND ativo = true
           AND categoria IS NOT NULL
           AND TRIM(categoria) <> ''
           AND TRIM(categoria) NOT IN (
             SELECT nome FROM almoxarifado_categorias WHERE company_id = ${input.companyId}
           )
         GROUP BY 1
         ORDER BY 2 DESC
      `);
      const orfas: Array<{ categoria: string; total: number }> =
        (((orfasRows as any).rows ?? orfasRows as any) as any[]).map((r: any) => ({
          categoria: String(r.categoria),
          total: Number(r.total),
        }));
      if (orfas.length === 0) return { itensMigrados: 0, categoriasOrfas: [] };
      const upd = await db.execute(sql`
        UPDATE almoxarifado_itens
           SET categoria = NULL
         WHERE company_id = ${input.companyId}
           AND ativo = true
           AND categoria IS NOT NULL
           AND TRIM(categoria) <> ''
           AND TRIM(categoria) NOT IN (
             SELECT nome FROM almoxarifado_categorias WHERE company_id = ${input.companyId}
           )
      `);
      const itensMigrados = Number((upd as any)?.rowCount ?? orfas.reduce((s, o) => s + o.total, 0));
      return { itensMigrados, categoriasOrfas: orfas };
    }),

  // ══════════════════════════════════════════════════════════════
  // UNIDADES DE MEDIDA DO ALMOXARIFADO (CRUD)
  // ══════════════════════════════════════════════════════════════
  listarUnidades: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.select().from(almoxarifadoUnidades)
        .where(eq(almoxarifadoUnidades.companyId, input.companyId))
        .orderBy(asc(almoxarifadoUnidades.sigla));

      if (rows.length === 0) {
        const defaults = [
          { sigla: "un", descricao: "Unidade" },
          { sigla: "pç", descricao: "Peça" },
          { sigla: "cx", descricao: "Caixa" },
          { sigla: "sc", descricao: "Saco" },
          { sigla: "rolo", descricao: "Rolo" },
          { sigla: "barra", descricao: "Barra" },
          { sigla: "fardo", descricao: "Fardo" },
          { sigla: "pct", descricao: "Pacote" },
          { sigla: "m", descricao: "Metro" },
          { sigla: "m²", descricao: "Metro quadrado" },
          { sigla: "m³", descricao: "Metro cúbico" },
          { sigla: "kg", descricao: "Quilograma" },
          { sigla: "g", descricao: "Grama" },
          { sigla: "t", descricao: "Tonelada" },
          { sigla: "L", descricao: "Litro" },
          { sigla: "mL", descricao: "Mililitro" },
          { sigla: "galão", descricao: "Galão" },
          { sigla: "vb", descricao: "Verba" },
          { sigla: "gl", descricao: "Global" },
          { sigla: "kit", descricao: "Kit" },
          { sigla: "par", descricao: "Par" },
          { sigla: "dz", descricao: "Dúzia" },
        ];
        const inserted = await db.insert(almoxarifadoUnidades)
          .values(defaults.map(d => ({ companyId: input.companyId, sigla: d.sigla, descricao: d.descricao })))
          .returning();
        return inserted.sort((a, b) => a.sigla.localeCompare(b.sigla));
      }

      return rows;
    }),

  criarUnidade: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      sigla:     z.string().min(1).max(20),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const sigla = input.sigla.trim();
      const existing = await db.select().from(almoxarifadoUnidades)
        .where(and(eq(almoxarifadoUnidades.companyId, input.companyId), eq(almoxarifadoUnidades.sigla, sigla)));
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Unidade já cadastrada" });
      const [row] = await db.insert(almoxarifadoUnidades).values({
        companyId: input.companyId,
        sigla,
        descricao: input.descricao?.trim() || null,
      }).returning();
      return row;
    }),

  excluirUnidade: protectedProcedure
    .input(z.object({
      id: z.number(), companyId: z.number(),
      // Rev. 2388 — Controle rígido (mesmo padrão de excluirItem).
      // Rev. 2400 — Ambos opcionais; obrigatoriedade via toggle por empresa.
      senha: z.string().optional(),
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [unidade] = await db.select().from(almoxarifadoUnidades)
        .where(and(eq(almoxarifadoUnidades.id, input.id), eq(almoxarifadoUnidades.companyId, input.companyId)));
      if (!unidade) throw new TRPCError({ code: "NOT_FOUND", message: "Unidade não encontrada." });
      const emUso = await db.select({ id: almoxarifadoItens.id })
        .from(almoxarifadoItens)
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
          sql`${almoxarifadoItens.unidade} = (SELECT sigla FROM almoxarifado_unidades WHERE id = ${input.id})`,
        ))
        .limit(1);
      if (emUso.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Esta unidade está em uso por um ou mais itens e não pode ser excluída." });
      const cfg = await getAlmoxAuditoriaConfig(input.companyId);
      const justUsada = justificativaFinal(input.justificativa, cfg.exigeJustificativa);
      await verificarSenhaSeLocal(ctx, input.senha, cfg.exigeSenha);
      await db.delete(almoxarifadoUnidades)
        .where(and(eq(almoxarifadoUnidades.id, input.id), eq(almoxarifadoUnidades.companyId, input.companyId)));
      // Rev. 2462 — auto-validado quando aprovação não é exigida.
      const auditExtraUnid = await getAuditoriaInicialFields(input.companyId, ctx);
      await db.insert(almoxarifadoAuditoria).values({
        companyId: input.companyId,
        obraId: null,
        userId: ctx.user.id,
        userNome: ctx.user.name || null,
        acao: "excluir_unidade",
        entidadeTipo: "almoxarifado_unidade",
        entidadeId: unidade.id,
        entidadeNome: unidade.sigla,
        dadosAntes: unidade as any,
        dadosDepois: null,
        justificativa: justUsada,
        ip: getClientIp(ctx),
        ...auditExtraUnid,
      });
      return { success: true };
    }),

  // Categorias distintas dos fornecedores
  listarCategoriasFornecedores: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.select({ categorias: fornecedores.categorias })
        .from(fornecedores)
        .where(and(
          eq(fornecedores.companyId, input.companyId),
          eq(fornecedores.ativo, true),
        ));
      const set = new Set<string>();
      rows.forEach(r => {
        if (Array.isArray(r.categorias)) (r.categorias as string[]).forEach(c => set.add(c));
      });
      return Array.from(set).sort();
    }),

  // ══════════════════════════════════════════════════════════════
  // SOLICITAÇÕES DE COMPRA (SC)
  // ══════════════════════════════════════════════════════════════

  listarSolicitacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), aprovacaoStatus: z.string().optional(), busca: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.select().from(comprasSolicitacoes)
        .where(and(
          eq(comprasSolicitacoes.companyId, input.companyId),
          input.status ? eq(comprasSolicitacoes.status, input.status) : undefined,
          input.aprovacaoStatus ? eq(comprasSolicitacoes.aprovacaoStatus, input.aprovacaoStatus) : undefined,
        ))
        .orderBy(desc(comprasSolicitacoes.criadoEm));
      const ids = rows.map(r => r.id);
      let itensCounts: Record<number, { total: number; atendidos: number }> = {};
      if (ids.length > 0) {
        const allItens = await db.select().from(comprasSolicitacoesItens)
          .where(sql`${comprasSolicitacoesItens.solicitacaoId} = ANY(${sql.raw("ARRAY[" + ids.join(",") + "]::int[]")})`);
        allItens.forEach(it => {
          if (!itensCounts[it.solicitacaoId]) itensCounts[it.solicitacaoId] = { total: 0, atendidos: 0 };
          itensCounts[it.solicitacaoId].total++;
          if (n(it.quantidadeAtendida) >= n(it.quantidade)) itensCounts[it.solicitacaoId].atendidos++;
        });
      }

      let scWithCotacao = new Set<number>();
      let scWithOC = new Set<number>();
      // Rev. 1684: rastrear status de entrega de cada OC por SC para separar
      // pendência de ENTREGA (logística) de pendência FINANCEIRA (pagamento).
      const scOCStatuses = new Map<number, string[]>();
      const pushOCStatus = (scId: number | null | undefined, st: string | null | undefined) => {
        if (!scId) return;
        if (!scOCStatuses.has(scId)) scOCStatuses.set(scId, []);
        scOCStatuses.get(scId)!.push(String(st ?? ""));
      };
      if (ids.length > 0) {
        const activeCots = await db.select({ id: comprasCotacoes.id, solicitacaoId: comprasCotacoes.solicitacaoId, status: comprasCotacoes.status }).from(comprasCotacoes)
          .where(and(
            sql`${comprasCotacoes.solicitacaoId} = ANY(${sql.raw("ARRAY[" + ids.join(",") + "]::int[]")})`,
            sql`${comprasCotacoes.status} NOT IN ('cancelada')`,
          ));
        activeCots.forEach(c => { if (c.solicitacaoId) scWithCotacao.add(c.solicitacaoId); });

        const activeOrdens = await db.select({ solicitacaoId: comprasOrdens.solicitacaoId, status: comprasOrdens.status }).from(comprasOrdens)
          .where(and(
            sql`${comprasOrdens.solicitacaoId} = ANY(${sql.raw("ARRAY[" + ids.join(",") + "]::int[]")})`,
            sql`${comprasOrdens.status} NOT IN ('cancelada')`,
          ));
        activeOrdens.forEach(o => {
          if (o.solicitacaoId) scWithOC.add(o.solicitacaoId);
          pushOCStatus(o.solicitacaoId, o.status);
        });

        const cotIds = activeCots.map(c => c.id);
        if (cotIds.length > 0) {
          const ocsViaCot = await db.select({ cotacaoId: comprasOrdens.cotacaoId, status: comprasOrdens.status }).from(comprasOrdens)
            .where(and(
              sql`${comprasOrdens.cotacaoId} = ANY(${sql.raw("ARRAY[" + cotIds.join(",") + "]::int[]")})`,
              sql`${comprasOrdens.status} NOT IN ('cancelada')`,
            ));
          const cotIdToStatuses = new Map<number, string[]>();
          ocsViaCot.forEach(o => {
            if (!o.cotacaoId) return;
            if (!cotIdToStatuses.has(o.cotacaoId)) cotIdToStatuses.set(o.cotacaoId, []);
            cotIdToStatuses.get(o.cotacaoId)!.push(String(o.status ?? ""));
          });
          activeCots.forEach(c => {
            if (!c.solicitacaoId) return;
            const sts = cotIdToStatuses.get(c.id);
            if (sts && sts.length > 0) {
              scWithOC.add(c.solicitacaoId);
              sts.forEach(st => pushOCStatus(c.solicitacaoId, st));
            }
          });
        }

        const pendingIds = rows.filter(r => r.status === "pendente").map(r => r.id);
        const toFixIds = pendingIds.filter(id => scWithCotacao.has(id) || scWithOC.has(id));
        if (toFixIds.length > 0) {
          await db.update(comprasSolicitacoes)
            .set({ status: "cotacao", atualizadoEm: new Date().toISOString() })
            .where(sql`${comprasSolicitacoes.id} = ANY(${sql.raw("ARRAY[" + toFixIds.join(",") + "]::int[]")})`);
          console.log(`[listarSolicitacoes] auto-heal: ${toFixIds.length} SC(s) corrigida(s) de pendente → cotacao:`, toFixIds);
        }
      }

      // Rev. 1684: status de OC que sinalizam ENTREGA logística concluída
      // (independente do status financeiro / pagamento da SC).
      const OC_ENTREGUE_STATUSES = new Set(["entregue", "recebida", "recebido", "concluida"]);
      let result = rows.map(r => {
        let status = r.status;
        if (status === "pendente" && (scWithCotacao.has(r.id) || scWithOC.has(r.id))) {
          status = "cotacao";
        }
        const ocSts = scOCStatuses.get(r.id) ?? [];
        const _ocsEntregues = ocSts.length > 0 && ocSts.every(st => OC_ENTREGUE_STATUSES.has(st));
        return { ...r, status, _hasOC: scWithOC.has(r.id), _ocsEntregues, _itens: itensCounts[r.id] ?? { total: 0, atendidos: 0 } };
      });
      if (input.busca) {
        const b = input.busca.toLowerCase();
        result = result.filter(r =>
          r.numeroSc?.toLowerCase().includes(b) ||
          r.titulo?.toLowerCase().includes(b) ||
          r.departamento?.toLowerCase().includes(b) ||
          r.observacoes?.toLowerCase().includes(b)
        );
      }
      const prioridadeOrdem: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
      result.sort((a, b) => {
        const pa = prioridadeOrdem[a.prioridade ?? "normal"] ?? 2;
        const pb = prioridadeOrdem[b.prioridade ?? "normal"] ?? 2;
        if (pa !== pb) return pa - pb;
        return new Date(b.criadoEm ?? 0).getTime() - new Date(a.criadoEm ?? 0).getTime();
      });
      return result;
    }),

  getSolicitacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      console.log("[getSolicitacao] step1: fetching SC id=" + input.id);
      const scRows = await db.select().from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
      const sc = scRows[0];
      if (!sc) throw new TRPCError({ code: "NOT_FOUND" });

      console.log("[getSolicitacao] step2: checking permissions for user=" + ctx.user.id + " role=" + ctx.user.role);
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      console.log("[getSolicitacao] step2b: allowedCompanies type=" + typeof allowedCompanies + " isArray=" + Array.isArray(allowedCompanies) + " length=" + (allowedCompanies?.length ?? "null"));
      const allowedIds = (allowedCompanies || []).map((c: any) => c.id);
      if (!allowedIds.includes(sc.companyId)) throw new TRPCError({ code: "FORBIDDEN" });

      console.log("[getSolicitacao] step3: fetching itens");
      const itensRaw = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));

      // Enrich items with parent EAP description (for insumos linked to an orcamento item)
      const orcItemIds = [...new Set(itensRaw.map((i: any) => i.orcamentoItemId).filter(Boolean) as number[])];
      const orcItensMap: Record<number, { descricao: string | null; eapCodigo: string | null }> = {};
      if (orcItemIds.length > 0) {
        try {
          const orcRows = await db.select({
            id: orcamentoItens.id,
            descricao: orcamentoItens.descricao,
            eapCodigo: orcamentoItens.eapCodigo,
          }).from(orcamentoItens).where(inArray(orcamentoItens.id, orcItemIds));
          for (const r of orcRows) orcItensMap[r.id] = { descricao: r.descricao, eapCodigo: r.eapCodigo };
        } catch (e: any) { console.warn("[getSolicitacao] orcamentoItens enrichment failed:", e?.message); }
      }

      // Fallback: for items without orcamentoItemId but with eapCodigo, lookup by (companyId, obraId, eapCodigo)
      const eapCodigosFallback = [...new Set(
        itensRaw
          .filter((i: any) => !i.orcamentoItemId && i.eapCodigo)
          .map((i: any) => i.eapCodigo as string)
      )];
      const eapByCodigoMap: Record<string, { descricao: string | null; eapCodigo: string }> = {};
      if (eapCodigosFallback.length > 0 && sc.obraId) {
        try {
          const orcsObra = await db.select({ id: orcamentos.id })
            .from(orcamentos)
            .where(and(
              eq(orcamentos.companyId, sc.companyId),
              eq(orcamentos.obraId, sc.obraId),
              isNull(orcamentos.deletedAt),
            ));
          if (orcsObra.length > 0) {
            const orcIds = orcsObra.map(o => o.id);
            const eapRows = await db.select({
              descricao: orcamentoItens.descricao,
              eapCodigo: orcamentoItens.eapCodigo,
            })
              .from(orcamentoItens)
              .where(and(
                inArray(orcamentoItens.orcamentoId, orcIds),
                inArray(orcamentoItens.eapCodigo, eapCodigosFallback),
              ));
            for (const r of eapRows) {
              if (r.eapCodigo && !eapByCodigoMap[r.eapCodigo]) {
                eapByCodigoMap[r.eapCodigo] = { descricao: r.descricao, eapCodigo: r.eapCodigo };
              }
            }
          }
        } catch (e: any) { console.warn("[getSolicitacao] eapCodigo fallback failed:", e?.message); }
      }

      const itens = itensRaw.map((i: any) => {
        const parentById = i.orcamentoItemId ? orcItensMap[i.orcamentoItemId] : null;
        const parentByCodigo = !parentById && i.eapCodigo ? eapByCodigoMap[i.eapCodigo] : null;
        const parent = parentById || parentByCodigo;
        // Rev. 2956 — um item VINCULADO a uma linha de orçamento (orcamentoItemId) NUNCA é
        // "avulso" (que, por definição, é item SEM vínculo orçamentário). Sanitiza o flag
        // estagnado motivoSemVerba='avulso' que sobra quando um item criado avulso é DEPOIS
        // vinculado a uma EAP (o editarSolicitacao com cotação ativa não limpava o flag).
        // Read-only: não muta o banco; só corrige a leitura (R-001/R-007/R-010).
        const avulsoStale = i.motivoSemVerba === "avulso" && i.orcamentoItemId != null;
        return {
          ...i,
          semVerba: avulsoStale ? false : i.semVerba,
          motivoSemVerba: avulsoStale ? null : i.motivoSemVerba,
          parentEapDescricao: parent?.descricao || null,
          parentEapCodigo: parent?.eapCodigo || i.eapCodigo || null,
        };
      });

      console.log("[getSolicitacao] step4: fetching nomes");
      let solicitanteNome: string | null = null;
      let aprovadorNome: string | null = null;
      if (sc.solicitanteId) {
        const uRows = await db.select({ nome: users.name }).from(users).where(eq(users.id, sc.solicitanteId));
        solicitanteNome = uRows[0]?.nome || null;
      }
      if (!solicitanteNome && (sc as any).criadoPorNome) {
        solicitanteNome = (sc as any).criadoPorNome;
      }
      if (sc.aprovadorId) {
        const uRows = await db.select({ nome: users.name }).from(users).where(eq(users.id, sc.aprovadorId));
        aprovadorNome = uRows[0]?.nome || null;
      }

      console.log("[getSolicitacao] step5: fetching cotacoes");
      let cotacoes: any[] = [];
      try {
        cotacoes = await db.select({
          id: comprasCotacoes.id,
          numeroCotacao: comprasCotacoes.numeroCotacao,
          status: comprasCotacoes.status,
          criadoEm: comprasCotacoes.criadoEm,
          total: comprasCotacoes.total,
          criadoPorNome: comprasCotacoes.criadoPorNome,
        }).from(comprasCotacoes)
          .where(and(eq(comprasCotacoes.solicitacaoId, input.id), eq(comprasCotacoes.companyId, sc.companyId)))
          .orderBy(desc(comprasCotacoes.criadoEm));
      } catch (e: any) { console.warn("[getSolicitacao] cotacoes query failed:", e?.message); }

      console.log("[getSolicitacao] step6: fetching ordens");
      let ordens: any[] = [];
      try {
        ordens = await db.select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          status: comprasOrdens.status,
          fornecedorNome: comprasOrdens.fornecedorNome,
          total: comprasOrdens.total,
          criadoEm: comprasOrdens.criadoEm,
          aprovacaoStatus: comprasOrdens.aprovacaoStatus,
          aprovadorId: comprasOrdens.aprovadorId,
          criadoPorNome: comprasOrdens.criadoPorNome,
          cotacaoId: comprasOrdens.cotacaoId, // Rev. 1687 — necessário p/ derivar _temOC
        }).from(comprasOrdens)
          .where(and(eq(comprasOrdens.solicitacaoId, input.id), eq(comprasOrdens.companyId, sc.companyId)))
          .orderBy(desc(comprasOrdens.criadoEm));
      } catch (e: any) { console.warn("[getSolicitacao] ordens query failed:", e?.message); }

      console.log("[getSolicitacao] step7: fetching aprovadores + recebimentos");
      const ocAprovadorIds = [...new Set(ordens.filter(o => o.aprovadorId).map(o => o.aprovadorId!))];
      const ocAprovadores: Record<number, string> = {};
      if (ocAprovadorIds.length > 0) {
        try {
          const aprovUsers = await db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, ocAprovadorIds));
          for (const u of aprovUsers) ocAprovadores[u.id] = u.nome || "";
        } catch (e: any) { console.warn("[getSolicitacao] aprovadores query failed:", e?.message); }
      }

      let recebimentos: any[] = [];
      const ocIds = ordens.map(o => o.id).filter(Boolean);
      if (ocIds.length > 0) {
        try {
          recebimentos = await db.select({
            id: almoxarifadoRecebimentos.id,
            ordemCompraId: almoxarifadoRecebimentos.ordemCompraId,
            criadoEm: almoxarifadoRecebimentos.criadoEm,
            usuarioNome: almoxarifadoRecebimentos.usuarioNome,
            status: almoxarifadoRecebimentos.status,
            numeroNf: almoxarifadoRecebimentos.numeroNf,
          }).from(almoxarifadoRecebimentos)
            .where(inArray(almoxarifadoRecebimentos.ordemCompraId, ocIds));
        } catch (e: any) { console.warn("[getSolicitacao] recebimentos query failed:", e?.message); }
      }

      console.log("[getSolicitacao] step8: building result, sc keys=" + Object.keys(sc).join(","));
      return {
        id: sc.id,
        companyId: sc.companyId,
        numeroSc: sc.numeroSc,
        obraId: sc.obraId,
        projetoId: sc.projetoId,
        solicitanteId: sc.solicitanteId,
        departamento: sc.departamento,
        titulo: sc.titulo,
        tipo: sc.tipo,
        dataNecessidade: sc.dataNecessidade,
        prioridade: sc.prioridade,
        status: sc.status,
        aprovacaoStatus: sc.aprovacaoStatus,
        aprovadorId: sc.aprovadorId,
        aprovadoEm: sc.aprovadoEm,
        observacoes: sc.observacoes,
        imagemReferenciaUrl: sc.imagemReferenciaUrl,
        anexos: sc.anexos || [],
        vehicleId: sc.vehicleId,
        maintenanceId: sc.maintenanceId,
        origemModulo: sc.origemModulo,
        incluirEquipamentos: sc.incluirEquipamentos,
        criadoEm: sc.criadoEm,
        atualizadoEm: sc.atualizadoEm,
        itens: itens || [],
        solicitanteNome,
        aprovadorNome,
        rastreio: {
          // Rev. 1687 — flag `_temOC`: indica se a cotação já tem ao menos uma OC
          // ATIVA (ignorando rascunho/cancelada). Permite ao client derivar um
          // status efetivo "Aprovada" mesmo quando o status cru no banco ficou
          // travado em 'pendente' (caso de OC criada por path manual ou de
          // cotações legadas anteriores ao auto-update). Mesmo padrão da
          // Rev. 1684 (KPI Pend. de Entrega).
          cotacoes: (cotacoes || []).map(c => {
            const ocsAtivas = (ordens || []).filter((o: any) =>
              o.cotacaoId === c.id &&
              !["rascunho", "cancelada"].includes(String(o.status ?? ""))
            );
            return {
              id: c.id,
              numeroCotacao: c.numeroCotacao,
              status: c.status,
              criadoEm: c.criadoEm,
              total: parseFloat(String(c.total || "0")),
              criadoPorNome: c.criadoPorNome || null,
              _temOC: ocsAtivas.length > 0,
            };
          }),
          ordens: (ordens || []).map(o => ({
            id: o.id, numeroOc: o.numeroOc, status: o.status, fornecedorNome: o.fornecedorNome,
            total: parseFloat(String(o.total || "0")), criadoEm: o.criadoEm,
            aprovacaoStatus: o.aprovacaoStatus, aprovadorId: o.aprovadorId,
            aprovadorNome: o.aprovadorId ? (ocAprovadores[o.aprovadorId] || null) : null,
            criadoPorNome: o.criadoPorNome || null,
          })),
          recebimentos: recebimentos || [],
        },
        // Rev. 1693 — flag derivada: TODAS as OCs vinculadas estão em status
        // de entrega (entregue/recebida/recebido/concluida). Permite ao client
        // exibir badge "Aguardando Pagamento" em vez de "Pendente" quando só
        // o financeiro está em aberto. Mesmo padrão da Rev. 1684.
        _ocsEntregues: (() => {
          const OC_ENTREGUE = new Set(["entregue", "recebida", "recebido", "concluida"]);
          const sts = (ordens || [])
            .map(o => String(o.status ?? "").toLowerCase())
            .filter(s => s && s !== "rascunho" && s !== "cancelada");
          return sts.length > 0 && sts.every(s => OC_ENTREGUE.has(s));
        })(),
      };
      } catch (err: any) {
        console.error("[getSolicitacao] CRASH for SC id=" + input.id + ":", err?.message);
        console.error("[getSolicitacao] STACK:", err?.stack);
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err?.message || "Erro interno" });
      }
    }),

  criarSolicitacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      projetoId: z.number().nullable().optional(),
      solicitanteId: z.number().nullable().optional(),
      vehicleId: z.number().nullable().optional(),
      departamento: z.string().optional(),
      titulo: z.string().optional(),
      prioridade: z.string().optional(),
      dataNecessidade: z.string().optional(),
      observacoes: z.string().optional(),
      imagemReferenciaUrl: z.string().optional(),
      anexos: z.array(z.object({ url: z.string(), nome: z.string(), tipo: z.string(), ts: z.number() })).optional(),
      tipo: z.enum(["material", "servico", "pacote", "equipamento", "pecas_veiculo"]).optional(),
      incluirEquipamentos: z.boolean().optional(),
      // Rev. 2290 — Locação na SC.
      isLocacao: z.boolean().optional(),
      locacaoDuracaoDias: z.number().int().positive().optional().nullable(),
      locacaoDataInicioPrevista: z.string().optional().nullable(),
      locacaoDataFimPrevista: z.string().optional().nullable(),
      userId: z.number().optional(),
      userName: z.string().optional(),
      itens: z.array(z.object({
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        observacoes: z.string().optional(),
        orcamentoItemId: z.number().optional(),
        eapCodigo: z.string().optional(),
        insumoCodigo: z.string().optional(),
        composicaoCodigo: z.string().optional(),
        precoMeta: z.number().optional(),
        quantidadeServico: z.number().optional(),
        coeficiente: z.number().optional(),
        origemEap: z.boolean().optional(),
        semVerba: z.boolean().optional(),
        motivoSemVerba: z.string().optional(),
        incluirAjudante: z.boolean().optional(),
        metaMdoProfissional: z.number().optional(),
        metaMdoAjudante: z.number().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (input.tipo === "pecas_veiculo" && !input.vehicleId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um veículo para SC de Peças Veículo." });
      }
      if (input.vehicleId) {
        const vRows = await db.execute(sql`SELECT id FROM vehicles WHERE id = ${input.vehicleId} AND "companyId" = ${input.companyId}`);
        const vr = (vRows as any).rows || vRows;
        if (!vr || vr.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Veículo não encontrado ou não pertence a esta empresa." });
      }
      // Rev. 1799 — R-014 · Geração de numero_sc 100% atômica via counter table com UPSERT.
      // Sem retry, sem advisory lock, sem MAX+1 — colisão matematicamente impossível.
      // Histórico das tentativas anteriores (Rev. 1743/1790/1795) no comentário do helper
      // gerarProximoNumeroScAtomico em compras.ts L878.
      const tipoSC = input.tipo ?? "material";
      let sc: any = null;
      let numeroSc = "";
      try {
        sc = await db.transaction(async (tx: any) => {
          numeroSc = await gerarProximoNumeroScAtomico(tx, input.companyId);
          const inserted = await tx.insert(comprasSolicitacoes).values({
            companyId: input.companyId,
            numeroSc,
            obraId: input.obraId ?? null,
            projetoId: input.projetoId ?? null,
            solicitanteId: input.solicitanteId ?? null,
            vehicleId: input.vehicleId ?? null,
            departamento: input.departamento,
            titulo: normalizarTexto(input.titulo),
            prioridade: input.prioridade ?? "normal",
            dataNecessidade: input.dataNecessidade,
            observacoes: input.observacoes,
            imagemReferenciaUrl: input.imagemReferenciaUrl ?? null,
            anexos: input.anexos || [],
            tipo: tipoSC,
            incluirEquipamentos: input.incluirEquipamentos ?? false,
            // Rev. 2290 — Locação só vale para tipo=equipamento.
            isLocacao: tipoSC === "equipamento" ? (input.isLocacao ?? false) : false,
            locacaoDuracaoDias: tipoSC === "equipamento" && input.isLocacao ? (input.locacaoDuracaoDias ?? null) : null,
            locacaoDataInicioPrevista: tipoSC === "equipamento" && input.isLocacao ? (input.locacaoDataInicioPrevista ?? null) : null,
            locacaoDataFimPrevista: tipoSC === "equipamento" && input.isLocacao ? (input.locacaoDataFimPrevista ?? null) : null,
            // Rev. 2294 — Aprovação automática: a existência da SC JÁ É a aprovação.
            // O fluxo de aprovação manual (aprovarSolicitacao) foi descontinuado;
            // a SC nasce pronta pra ser cotada e o botão "Enviar para Cotação"
            // aparece imediatamente.
            status: "pendente",
            aprovacaoStatus: "aprovada",
            aprovadoEm: new Date().toISOString(),
            aprovadorId: input.userId ?? null,
            aprovadorNome: input.userName ?? null,
            criadoPorId: input.userId ?? null,
            criadoPorNome: input.userName ?? null,
          } as any).returning();
          return inserted[0];
        });
      } catch (e: any) {
        const code = e?.code || e?.cause?.code;
        const constraint = e?.constraint || e?.cause?.constraint || "";
        const detail = e?.detail || e?.cause?.detail || "";
        const causeMsg = e?.cause?.message || "";
        const pgMsg = e?.cause?.hint || e?.hint || "";
        console.error("[compras.criarSolicitacao] insert falhou (R-014)", {
          companyId: input.companyId,
          numeroScTentativa: numeroSc,
          tipoSC,
          isLocacao: input.isLocacao,
          locacaoDuracaoDias: input.locacaoDuracaoDias,
          locacaoDataInicioPrevista: input.locacaoDataInicioPrevista,
          locacaoDataFimPrevista: input.locacaoDataFimPrevista,
          code,
          constraint,
          detail,
          table: e?.table || e?.cause?.table,
          column: e?.column || e?.cause?.column,
          causeMessage: causeMsg,
          message: e?.message,
          stack: e?.stack?.split("\n").slice(0, 8).join("\n"),
        });
        // Rev. 2291 — Sempre incluir a mensagem REAL do Postgres (cause.message) +
        // detail/hint, pra o usuário ver no toast por que falhou (não só "Failed query: insert into…").
        let friendly = [causeMsg, detail, pgMsg].filter(Boolean).join(" · ") || e?.message || "Erro desconhecido";
        if (code === "23505" && constraint.includes("uq_compras_solicitacoes_numero")) {
          // Não deveria mais acontecer com o counter atômico — se acontecer, é bug grave
          // (counter dessincronizado da tabela). Mensagem aponta exatamente o problema.
          friendly = `Numero de SC ${numeroSc} colidiu (counter dessincronizado). Reinicie o servidor para re-semear o contador.`;
        }
        else if (code === "23502") friendly = `Campo obrigatório vazio: ${e?.column || "(coluna não identificada)"}.`;
        else if (code === "23503") friendly = `Referência inválida (FK): ${constraint || e?.detail || ""}.`;
        else if (code === "22001") friendly = `Texto muito longo para a coluna ${e?.column || ""}.`;
        else if (code === "22P02") friendly = `Tipo de dado inválido: ${e?.detail || e?.message || ""}.`;
        throw new TRPCError({ code: "BAD_REQUEST", message: `Erro ao criar SC: ${friendly}` });
      }
      if (!sc) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha desconhecida ao criar SC." });
      }
      let scItensInseridos: any[] = [];
      if (input.itens.length > 0) {
        scItensInseridos = await db.insert(comprasSolicitacoesItens).values(
          input.itens.map(it => ({
            solicitacaoId: sc.id,
            descricao: normalizarTexto(it.descricao),
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            observacoes: it.observacoes,
            statusItem: "pendente",
            orcamentoItemId: it.orcamentoItemId ?? null,
            eapCodigo: it.eapCodigo ?? null,
            insumoCodigo: it.insumoCodigo ?? null,
            composicaoCodigo: it.composicaoCodigo ?? null,
            precoMeta: it.precoMeta ? String(it.precoMeta) : null,
            quantidadeServico: it.quantidadeServico ? String(it.quantidadeServico) : null,
            coeficiente: it.coeficiente ? String(it.coeficiente) : null,
            origemEap: it.origemEap ?? false,
            semVerba: it.semVerba ?? false,
            motivoSemVerba: it.motivoSemVerba ?? null,
            incluirAjudante: it.incluirAjudante ?? true,
            metaMdoProfissional: it.metaMdoProfissional ? String(it.metaMdoProfissional) : null,
            metaMdoAjudante: it.metaMdoAjudante ? String(it.metaMdoAjudante) : null,
          }))
        ).returning();
      }

      // Rev. 2295 — Auto-cotação: junto com a Rev. 2294 (aprovação automática),
      // toda SC já nasce com uma Cotação "pendente" vinculada, que aparece
      // direto na tela /compras/cotacoes. Compras não precisa mais abrir a SC
      // e clicar "Enviar para Cotação" — o engenheiro pediu "se tem SC, o
      // ERP já entende como aprovada E já joga pra cotação".
      // Falhar aqui NÃO derruba a criação da SC (try/catch com log) — o usuário
      // ainda pode disparar manualmente pelo botão "Enviar para Cotação".
      //
      // ATOMICIDADE (review architect Rev. 2295): cotação + itens + UPDATE da
      // SC rodam dentro de db.transaction. Se algo falhar no meio, nada é
      // persistido — evita estados inconsistentes do tipo "cotação ativa sem
      // itens" que bloqueariam o retry manual em `criarCotacao` (L3406 — gate
      // de cotação ativa).
      try {
        if (scItensInseridos.length > 0) {
          await db.transaction(async (tx: any) => {
            // Rev. 4001 — pg_advisory_xact_lock(companyId, 1001) ANTES do COUNT(*),
            // igual ao padrão já usado em criarCotacao/dividirCotacao/cotarItensRestantes.
            // Faltava aqui: duas SCs de obras diferentes criadas quase juntas
            // liam o mesmo COUNT(*) antes do primeiro INSERT commitar e
            // recebiam o MESMO numeroCotacao (bug reportado: várias SCs de
            // obras distintas com o mesmo "COT-XXXX-2026").
            await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.companyId}::int, 1001::int)`);
            const yr = new Date().getFullYear();
            const cnt = await tx.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, input.companyId));
            const seq = (parseInt(String(cnt[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
            const numeroCotacao = `COT-${yr}-${seq}`;
            const [cotAuto] = await tx.insert(comprasCotacoes).values({
              companyId: input.companyId,
              numeroCotacao,
              descricao: normalizarTexto(input.titulo) ?? numeroSc,
              prioridade: input.prioridade ?? "normal",
              tipo: tipoSC,
              obraId: input.obraId ?? null,
              solicitacaoId: sc.id,
              fornecedorId: null,
              total: "0",
              status: "pendente",
              criadoPorId: input.userId ?? null,
              criadoPorNome: input.userName ?? null,
            } as any).returning();
            await tx.insert(comprasCotacoesItens).values(
              scItensInseridos.map((it: any, idx: number) => {
                const inp = input.itens[idx];
                return {
                  cotacaoId: cotAuto.id,
                  solicitacaoItemId: it.id,
                  descricao: normalizarTexto(inp?.descricao || it.descricao),
                  unidade: inp?.unidade ?? it.unidade ?? "un",
                  quantidade: String(inp?.quantidade ?? it.quantidade ?? 1),
                  precoUnitario: "0",
                  descontoPct: "0",
                  total: "0",
                };
              })
            );
            await tx.update(comprasSolicitacoes)
              .set({ status: "cotacao", atualizadoEm: new Date().toISOString() })
              .where(eq(comprasSolicitacoes.id, sc.id));
            console.log(`[compras.criarSolicitacao] Rev. 2295 auto-cotação ${numeroCotacao} criada pra SC ${numeroSc} (${scItensInseridos.length} itens, tipo=${tipoSC}${input.isLocacao ? ", LOCAÇÃO" : ""}).`);
          });
        }
      } catch (e: any) {
        // Não derruba a criação da SC. O usuário ainda pode gerar via botão "Enviar para Cotação".
        // A transação acima garante que NADA da auto-cotação foi persistido se chegou aqui — não há "cotação órfã".
        console.error(`[compras.criarSolicitacao] Rev. 2295 FALHA ao auto-criar cotação pra SC ${numeroSc} (transação revertida):`, e?.cause?.message || e?.message || e);
      }

      return sc;
    }),

  uploadImagemReferenciaSC: protectedProcedure
    .input(z.object({
      solicitacaoId: z.number().optional(),
      companyId: z.number(),
      fileBase64: z.string().max(14_000_000),
      fileName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const allowedExts = new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf", "mp4", "mov", "avi", "mkv", "heic", "heif", "bmp", "tiff", "tif", "svg"]);
      const ext = input.fileName.split(".").pop()?.toLowerCase() || "jpg";
      if (!allowedExts.has(ext)) throw new TRPCError({ code: "BAD_REQUEST", message: "Formato não suportado. Aceitos: imagens, PDF e vídeos." });
      const buffer = Buffer.from(input.fileBase64, "base64");
      const maxSize = ["mp4", "mov", "avi", "mkv"].includes(ext) ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (buffer.length > maxSize) throw new TRPCError({ code: "BAD_REQUEST", message: `Arquivo muito grande (máx. ${maxSize / 1024 / 1024} MB).` });
      if (input.solicitacaoId) {
        const [sc] = await db.select({ id: comprasSolicitacoes.id }).from(comprasSolicitacoes)
          .where(and(eq(comprasSolicitacoes.id, input.solicitacaoId), eq(comprasSolicitacoes.companyId, input.companyId)));
        if (!sc) throw new TRPCError({ code: "FORBIDDEN", message: "SC não encontrada ou sem permissão." });
      }
      const ts = Date.now();
      const key = `compras/sc-anexos/${input.companyId}-${input.solicitacaoId || 'new'}-${ts}.${ext}`;
      const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska", heic: "image/heic", heif: "image/heif", bmp: "image/bmp", tiff: "image/tiff", tif: "image/tiff", svg: "image/svg+xml" };
      const contentType = mimeMap[ext] || "application/octet-stream";
      const { url } = await storagePut(key, buffer, contentType);

      const isImage = ["jpg","jpeg","png","webp","gif","heic","heif","bmp","tiff","tif","svg"].includes(ext);
      const isVideo = ["mp4","mov","avi","mkv"].includes(ext);
      const tipo = isImage ? "imagem" : isVideo ? "video" : "pdf";

      if (input.solicitacaoId) {
        const [current] = await db.select({ anexos: comprasSolicitacoes.anexos, imagemReferenciaUrl: comprasSolicitacoes.imagemReferenciaUrl }).from(comprasSolicitacoes)
          .where(eq(comprasSolicitacoes.id, input.solicitacaoId));
        const existingAnexos = Array.isArray(current?.anexos) ? current.anexos as any[] : [];
        const newAnexo = { url, nome: input.fileName, tipo, ts };
        await db.update(comprasSolicitacoes)
          .set({
            anexos: [...existingAnexos, newAnexo],
            imagemReferenciaUrl: current?.imagemReferenciaUrl || (isImage ? url : null),
            atualizadoEm: new Date().toISOString(),
          })
          .where(and(eq(comprasSolicitacoes.id, input.solicitacaoId), eq(comprasSolicitacoes.companyId, input.companyId)));
      }
      return { url, nome: input.fileName, tipo, ts };
    }),

  removeAnexoSC: protectedProcedure
    .input(z.object({ solicitacaoId: z.number(), companyId: z.number(), url: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [sc] = await db.select({ anexos: comprasSolicitacoes.anexos, imagemReferenciaUrl: comprasSolicitacoes.imagemReferenciaUrl }).from(comprasSolicitacoes)
        .where(and(eq(comprasSolicitacoes.id, input.solicitacaoId), eq(comprasSolicitacoes.companyId, input.companyId)));
      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "SC não encontrada." });
      const anexos = Array.isArray(sc.anexos) ? (sc.anexos as any[]).filter(a => a.url !== input.url) : [];
      const firstImage = anexos.find((a: any) => a.tipo === "imagem");
      await db.update(comprasSolicitacoes)
        .set({
          anexos,
          imagemReferenciaUrl: sc.imagemReferenciaUrl === input.url ? (firstImage?.url || null) : sc.imagemReferenciaUrl,
          atualizadoEm: new Date().toISOString(),
        })
        .where(and(eq(comprasSolicitacoes.id, input.solicitacaoId), eq(comprasSolicitacoes.companyId, input.companyId)));
      return { ok: true };
    }),

  uploadAnexoOrdem: protectedProcedure
    .input(z.object({
      ordemId: z.number().optional(),
      companyId: z.number(),
      fileBase64: z.string().max(30_000_000),
      fileName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const imageExts = new Set(["png", "jpg", "jpeg", "webp", "gif", "heic", "bmp"]);
      const allowedExts = new Set([...imageExts, "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"]);
      const ext = input.fileName.split(".").pop()?.toLowerCase() || "";
      if (!allowedExts.has(ext)) throw new TRPCError({ code: "BAD_REQUEST", message: "Formato não suportado. Aceitos: imagens (JPG, PNG, etc.), PDF, DOC, XLS e outros." });
      const buffer = Buffer.from(input.fileBase64, "base64");
      const maxSize = 20 * 1024 * 1024;
      if (buffer.length > maxSize) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande (máx. 20 MB)." });
      const ts = Date.now();
      const key = `compras/oc-anexos/${input.companyId}-${input.ordemId || "new"}-${ts}.${ext}`;
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        heic: "image/heic",
        bmp: "image/bmp",
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        txt: "text/plain",
        csv: "text/csv",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";
      const { url } = await storagePut(key, buffer, contentType);
      const tipo = imageExts.has(ext) ? "imagem" : ext === "pdf" ? "pdf" : "documento";
      const novoAnexo = { url, nome: input.fileName, tipo, ts };
      if (input.ordemId) {
        const [oc] = await db.select({ id: comprasOrdens.id, anexos: comprasOrdens.anexos }).from(comprasOrdens)
          .where(and(eq(comprasOrdens.id, input.ordemId), eq(comprasOrdens.companyId, input.companyId)));
        if (!oc) throw new TRPCError({ code: "FORBIDDEN", message: "OC não encontrada." });
        const existingAnexos = Array.isArray(oc.anexos) ? oc.anexos as any[] : [];
        await db.update(comprasOrdens)
          .set({ anexos: [...existingAnexos, novoAnexo] as any })
          .where(eq(comprasOrdens.id, input.ordemId));
      }
      return novoAnexo;
    }),

  removeAnexoOrdem: protectedProcedure
    .input(z.object({ ordemId: z.number(), companyId: z.number(), url: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [oc] = await db.select({ anexos: comprasOrdens.anexos }).from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.ordemId), eq(comprasOrdens.companyId, input.companyId)));
      if (!oc) throw new TRPCError({ code: "FORBIDDEN", message: "OC não encontrada." });
      const anexos = Array.isArray(oc.anexos) ? (oc.anexos as any[]).filter(a => a.url !== input.url) : [];
      await db.update(comprasOrdens)
        .set({ anexos: anexos as any })
        .where(eq(comprasOrdens.id, input.ordemId));
      return { ok: true };
    }),

  atualizarStatusSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [scAcc] = await db.select({ companyId: comprasSolicitacoes.companyId }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
      if (scAcc) await _assertCompanyAccess(ctx.user, scAcc.companyId);
      await db.update(comprasSolicitacoes).set({ status: input.status, atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.id));
      return { ok: true };
    }),

  aprovarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), aprovacaoStatus: z.string(), aprovadorId: z.number().optional(), aprovadorNome: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [scAcc] = await db.select({ companyId: comprasSolicitacoes.companyId }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
      if (scAcc) await _assertCompanyAccess(ctx.user, scAcc.companyId);
      const aprovId = input.aprovadorId ?? ctx.user?.id ?? null;
      const aprovNome = input.aprovadorNome || ctx.user?.name || ctx.user?.email || null;
      await db.update(comprasSolicitacoes).set({
        aprovacaoStatus: input.aprovacaoStatus,
        aprovadorId: aprovId,
        aprovadorNome: aprovNome,
        aprovadoEm: input.aprovacaoStatus !== "aguardando" ? new Date().toISOString() : null,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasSolicitacoes.id, input.id));

      let cotacaoCriada: any = null;

      if (input.aprovacaoStatus === "aprovada") {
        const [sc] = await db.select().from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
        if (sc) {
          const existingCots = await db.select({ id: comprasCotacoes.id, status: comprasCotacoes.status })
            .from(comprasCotacoes)
            .where(and(
              eq(comprasCotacoes.solicitacaoId, input.id),
              eq(comprasCotacoes.companyId, sc.companyId),
            ));
          const activeCots = existingCots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));

          if (activeCots.length === 0) {
            const scItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));

            const itensMapped = scItens.map(it => ({
              descricao: normalizarTexto(it.descricao),
              unidade: it.unidade ?? "un",
              quantidade: n(it.quantidade),
              precoUnitario: 0,
              solicitacaoItemId: it.id,
              semVerba: it.semVerba ?? false,
              motivoSemVerba: it.motivoSemVerba ?? null,
            }));
            const totalGeral = 0;

            // Rev. 4001 — numeração + insert dentro de db.transaction com
            // pg_advisory_xact_lock(companyId, 1001), igual ao padrão já usado
            // em criarCotacao/dividirCotacao/cotarItensRestantes. Antes usava
            // COUNT(*) fora de transação/lock — duas aprovações de SCs de obras
            // diferentes quase simultâneas podiam gerar o MESMO numeroCotacao.
            const cot = await db.transaction(async (tx: any) => {
              await tx.execute(sql`SELECT pg_advisory_xact_lock(${sc.companyId}::int, 1001::int)`);
              const count = await tx.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, sc.companyId));
              const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
              const numeroCotacaoTx = `COT-${new Date().getFullYear()}-${seq}`;

              const [cotRow] = await tx.insert(comprasCotacoes).values({
                companyId: sc.companyId,
                numeroCotacao: numeroCotacaoTx,
                descricao: sc.titulo || sc.departamento || "Cotação automática",
                prioridade: sc.prioridade ?? "normal",
                obraId: sc.obraId ?? null,
                solicitacaoId: sc.id,
                total: String(totalGeral.toFixed(2)),
                status: "pendente",
                tipo: sc.tipo ?? "material",
                criadoPorId: input.aprovadorId ?? null,
                criadoPorNome: input.aprovadorNome ?? null,
              } as any).returning();

              if (itensMapped.length > 0) {
                await tx.insert(comprasCotacoesItens).values(
                  itensMapped.map(it => ({
                    cotacaoId: cotRow.id,
                    solicitacaoItemId: it.solicitacaoItemId ?? null,
                    descricao: it.descricao,
                    unidade: it.unidade,
                    quantidade: String(it.quantidade),
                    precoUnitario: "0",
                    descontoPct: "0",
                    total: "0",
                    semVerba: it.semVerba ?? false,
                    motivoSemVerba: it.motivoSemVerba ?? null,
                  }))
                );
              }
              return cotRow;
            });
            const numeroCotacao = cot.numeroCotacao;

            await db.update(comprasSolicitacoes).set({ status: "cotacao", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.id));
            cotacaoCriada = { id: cot.id, numeroCotacao };
          }
        }
      }

      return { ok: true, cotacaoCriada };
    }),

  desaprovarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [sc] = await db.select().from(comprasSolicitacoes).where(and(eq(comprasSolicitacoes.id, input.id), eq(comprasSolicitacoes.companyId, input.companyId)));
      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada." });
      if (sc.status === "recebido" || sc.status === "recebido_parcial") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível desaprovar uma solicitação que já possui recebimentos." });
      }
      const linkedCots = await db.select({ id: comprasCotacoes.id, status: comprasCotacoes.status, numeroCotacao: comprasCotacoes.numeroCotacao })
        .from(comprasCotacoes)
        .where(and(eq(comprasCotacoes.solicitacaoId, input.id), eq(comprasCotacoes.companyId, input.companyId)));
      const activeCots = linkedCots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));
      for (const cot of activeCots) {
        const linkedOCs = await db.select({ id: comprasOrdens.id }).from(comprasOrdens).where(eq(comprasOrdens.cotacaoId, cot.id));
        if (linkedOCs.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cotação COT vinculada já possui Ordem de Compra. Cancele a OC antes de desaprovar.` });
        }
      }
      const allCotIds = linkedCots.map(c => c.id);
      if (allCotIds.length > 0) {
        await db.delete(comprasCotacaoRespostas).where(inArray(comprasCotacaoRespostas.cotacaoId, allCotIds));
        await db.delete(comprasCotacaoPropostas).where(inArray(comprasCotacaoPropostas.cotacaoId, allCotIds));
        await db.delete(comprasCotacaoFornecedores).where(inArray(comprasCotacaoFornecedores.cotacaoId, allCotIds));
        await db.delete(comprasCotacoesItens).where(inArray(comprasCotacoesItens.cotacaoId, allCotIds));
        await db.execute(sql`DELETE FROM compras_risco_debitos WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
        await db.execute(sql`DELETE FROM purchase_quotation_tokens WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
        await db.execute(sql`DELETE FROM purchase_negotiations WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
        await db.execute(sql`DELETE FROM supplier_price_history WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
        await db.delete(comprasCotacoes).where(inArray(comprasCotacoes.id, allCotIds));
      }
      await db.update(comprasSolicitacoes).set({
        status: "pendente",
        aprovacaoStatus: "aguardando",
        aprovadorId: null,
        aprovadoEm: null,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasSolicitacoes.id, input.id));
      return { ok: true, cotacoesExcluidas: allCotIds.length };
    }),

  registrarRecebimentoItem: protectedProcedure
    .input(z.object({ itemId: z.number(), solicitacaoId: z.number(), quantidadeAtendida: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [scAcc] = await db.select({ companyId: comprasSolicitacoes.companyId }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      if (scAcc) await _assertCompanyAccess(ctx.user, scAcc.companyId);
      const [item] = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      if (item.solicitacaoId !== input.solicitacaoId) throw new TRPCError({ code: "BAD_REQUEST", message: "Item não pertence a esta solicitação" });
      const qtdTotal = n(item.quantidade);
      const novaQtd = Math.min(input.quantidadeAtendida, qtdTotal);
      const novoStatus = novaQtd >= qtdTotal ? "recebido" : novaQtd > 0 ? "recebido_parcial" : "pendente";
      await db.update(comprasSolicitacoesItens).set({
        quantidadeAtendida: String(novaQtd),
        statusItem: novoStatus,
      }).where(eq(comprasSolicitacoesItens.id, input.itemId));
      // update SC status based on all items
      const allItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.solicitacaoId));
      const todoRecebido = allItens.every(it => n(it.quantidadeAtendida) >= n(it.quantidade));
      const algumRecebido = allItens.some(it => n(it.quantidadeAtendida) > 0);
      if (todoRecebido) {
        await db.update(comprasSolicitacoes).set({ status: "aprovado", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      } else if (algumRecebido) {
        await db.update(comprasSolicitacoes).set({ atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      }
      return { ok: true, statusItem: novoStatus };
    }),

  cancelarItemSc: protectedProcedure
    .input(z.object({ itemId: z.number(), solicitacaoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [scAcc] = await db.select({ companyId: comprasSolicitacoes.companyId }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      if (scAcc) await _assertCompanyAccess(ctx.user, scAcc.companyId);
      const [item] = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.id, input.itemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
      if (item.solicitacaoId !== input.solicitacaoId) throw new TRPCError({ code: "BAD_REQUEST", message: "Item não pertence a esta solicitação" });
      await db.execute(sql`UPDATE compras_cotacoes_itens SET solicitacao_item_id = NULL WHERE solicitacao_item_id = ${input.itemId}`);
      await db.execute(sql`UPDATE compras_ordens_itens SET solicitacao_item_id = NULL WHERE solicitacao_item_id = ${input.itemId}`);
      await db.delete(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.id, input.itemId));
      await db.update(comprasSolicitacoes).set({ atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      return { ok: true };
    }),

  excluirSolicitacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const [scAcc] = await db.select({ companyId: comprasSolicitacoes.companyId }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
      if (scAcc) await _assertCompanyAccess(ctx.user, scAcc.companyId);

      const linkedCots = await db.select({ id: comprasCotacoes.id, numeroCotacao: comprasCotacoes.numeroCotacao, status: comprasCotacoes.status })
        .from(comprasCotacoes)
        .where(eq(comprasCotacoes.solicitacaoId, input.id));
      const allCotIds = linkedCots.map(c => c.id);

      if (allCotIds.length > 0) {
        const linkedOCs = await db.select({ id: comprasOrdens.id, numeroOc: comprasOrdens.numeroOc, status: comprasOrdens.status })
          .from(comprasOrdens)
          .where(inArray(comprasOrdens.cotacaoId, allCotIds));
        const ocsAtivas = linkedOCs.filter(o => !["cancelada", "recebido"].includes(o.status ?? ""));
        if (ocsAtivas.length > 0) {
          throw new Error(`Não é possível excluir: esta SC possui Ordem de Compra em andamento (${ocsAtivas.map(o => o.numeroOc).join(", ")}).`);
        }

        const ocIds = linkedOCs.map(o => o.id);
        if (ocIds.length > 0) {
          await db.delete(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocIds));
          await db.delete(comprasOrdens).where(inArray(comprasOrdens.id, ocIds));
        }

        await db.delete(comprasCotacaoRespostas).where(inArray(comprasCotacaoRespostas.cotacaoId, allCotIds));
        await db.delete(comprasCotacaoPropostas).where(inArray(comprasCotacaoPropostas.cotacaoId, allCotIds));
        await db.delete(comprasCotacaoFornecedores).where(inArray(comprasCotacaoFornecedores.cotacaoId, allCotIds));
        await db.delete(comprasCotacoesItens).where(inArray(comprasCotacoesItens.cotacaoId, allCotIds));
        await db.execute(sql`DELETE FROM compras_risco_debitos WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
        await db.execute(sql`DELETE FROM purchase_quotation_tokens WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
        await db.execute(sql`DELETE FROM purchase_negotiations WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
        await db.execute(sql`DELETE FROM supplier_price_history WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
        await db.delete(comprasCotacoes).where(inArray(comprasCotacoes.id, allCotIds));
      }

      await db.delete(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));
      await db.delete(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.id));
      return { ok: true };
    }),

  excluirSolicitacoesEmLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowedCompanies.map((c: any) => c.id);
      if (!allowedIds.includes(input.companyId)) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });
      const owned = await db.select({ id: comprasSolicitacoes.id }).from(comprasSolicitacoes).where(and(inArray(comprasSolicitacoes.id, input.ids), eq(comprasSolicitacoes.companyId, input.companyId)));
      const ownedIds = owned.map(o => o.id);
      if (ownedIds.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma SC encontrada" });

      const errors: string[] = [];
      let deleted = 0;
      for (const scId of ownedIds) {
        try {
          const linkedCots = await db.select({ id: comprasCotacoes.id, status: comprasCotacoes.status }).from(comprasCotacoes).where(eq(comprasCotacoes.solicitacaoId, scId));
          const allCotIds = linkedCots.map(c => c.id);
          if (allCotIds.length > 0) {
            const linkedOCs = await db.select({ id: comprasOrdens.id, status: comprasOrdens.status }).from(comprasOrdens).where(inArray(comprasOrdens.cotacaoId, allCotIds));
            const ocsAtivas = linkedOCs.filter(o => !["cancelada", "recebido"].includes(o.status ?? ""));
            if (ocsAtivas.length > 0) { errors.push(`SC #${scId}: possui OC em andamento`); continue; }
            const ocIds = linkedOCs.map(o => o.id);
            if (ocIds.length > 0) {
              await db.delete(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocIds));
              await db.delete(comprasOrdens).where(inArray(comprasOrdens.id, ocIds));
            }
            await db.delete(comprasCotacaoRespostas).where(inArray(comprasCotacaoRespostas.cotacaoId, allCotIds));
            await db.delete(comprasCotacaoPropostas).where(inArray(comprasCotacaoPropostas.cotacaoId, allCotIds));
            await db.delete(comprasCotacaoFornecedores).where(inArray(comprasCotacaoFornecedores.cotacaoId, allCotIds));
            await db.delete(comprasCotacoesItens).where(inArray(comprasCotacoesItens.cotacaoId, allCotIds));
            await db.execute(sql`DELETE FROM compras_risco_debitos WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
            await db.execute(sql`DELETE FROM purchase_quotation_tokens WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
            await db.execute(sql`DELETE FROM purchase_negotiations WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
            await db.execute(sql`DELETE FROM supplier_price_history WHERE cotacao_id IN (${sql.join(allCotIds.map(id => sql`${id}`), sql`, `)})`);
            await db.delete(comprasCotacoes).where(inArray(comprasCotacoes.id, allCotIds));
          }
          await db.delete(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, scId));
          await db.delete(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, scId));
          deleted++;
        } catch (e: any) { errors.push(`SC #${scId}: ${e.message}`); }
      }
      return { ok: true, count: deleted, errors };
    }),

  // ══════════════════════════════════════════════════════════════
  // COTAÇÕES
  // ══════════════════════════════════════════════════════════════

  listarCotacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), solicitacaoId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.select().from(comprasCotacoes)
        .where(and(
          eq(comprasCotacoes.companyId, input.companyId),
          input.status ? eq(comprasCotacoes.status, input.status) : undefined,
          input.solicitacaoId ? eq(comprasCotacoes.solicitacaoId, input.solicitacaoId) : undefined,
        ))
        .orderBy(desc(comprasCotacoes.criadoEm));
      const scIds = [...new Set(rows.map(r => r.solicitacaoId).filter(Boolean))] as number[];
      let scMap: Record<number, { titulo: string; tipo: string; numeroSc: string | null }> = {};
      if (scIds.length > 0) {
        const scs = await db.select({ id: comprasSolicitacoes.id, titulo: comprasSolicitacoes.titulo, tipo: comprasSolicitacoes.tipo, numeroSc: comprasSolicitacoes.numeroSc }).from(comprasSolicitacoes).where(inArray(comprasSolicitacoes.id, scIds));
        for (const sc of scs) scMap[sc.id] = { titulo: sc.titulo, tipo: sc.tipo, numeroSc: sc.numeroSc };
      }

      // Rev. 2826 — Status de ENTREGA por cotação (read-only) para o filtro "A entregar"
      // (OC gerada mas ainda não entregue). Cruza as OCs não-canceladas vinculadas a cada
      // cotação; "entregue" = status em (entregue/entregue_parcial/concluida/recebido) OU
      // dataEntregaReal preenchida. "atrasada" = pendente + dataEntregaPrevista < hoje.
      const cotIds = rows.map(r => r.id);
      const ocByCot: Record<number, { temOc: boolean; entregaPendente: boolean; entregaAtrasada: boolean }> = {};
      if (cotIds.length > 0) {
        const ocs = await db.select({
          cotacaoId: comprasOrdens.cotacaoId,
          status: comprasOrdens.status,
          dataEntregaPrevista: comprasOrdens.dataEntregaPrevista,
          dataEntregaReal: comprasOrdens.dataEntregaReal,
        }).from(comprasOrdens).where(and(
          eq(comprasOrdens.companyId, input.companyId),
          inArray(comprasOrdens.cotacaoId, cotIds),
        ));
        const hoje = new Date().toISOString().slice(0, 10);
        const ENTREGUE = new Set(["entregue", "entregue_parcial", "concluida", "recebido"]);
        // Alinhado ao resto do módulo: rascunho/cancelada NÃO contam como OC ativa.
        for (const o of ocs) {
          if (o.cotacaoId == null || o.status === "cancelada" || o.status === "rascunho") continue;
          const cur = ocByCot[o.cotacaoId] ?? { temOc: false, entregaPendente: false, entregaAtrasada: false };
          cur.temOc = true;
          const entregue = ENTREGUE.has(String(o.status)) || !!o.dataEntregaReal;
          if (!entregue) {
            cur.entregaPendente = true;
            if (o.dataEntregaPrevista && o.dataEntregaPrevista < hoje) cur.entregaAtrasada = true;
          }
          ocByCot[o.cotacaoId] = cur;
        }
      }

      return rows.map(r => {
        const sc = r.solicitacaoId ? scMap[r.solicitacaoId] : null;
        let tipo = r.tipo;
        if (sc && sc.tipo && (sc.tipo === "servico" || sc.tipo === "pacote") && tipo === "material") {
          tipo = sc.tipo === "pacote" ? "servico" : sc.tipo;
        }
        const oc = ocByCot[r.id];
        return {
          ...r,
          descricao: sc?.titulo || r.descricao,
          numeroSc: sc?.numeroSc ?? null,
          tipo,
          temOc: !!oc?.temOc,
          entregaPendente: !!oc?.entregaPendente,
          entregaAtrasada: !!oc?.entregaAtrasada,
        };
      });
    }),

  getCotacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.id));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND" });
      await _assertCompanyAccess(ctx.user, cot.companyId);
      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.id));

      // Rev. 4013 — tipo de contrato da obra, para exibir a seleção de
      // regime de custo (cliente/empresa-sem-risco/empresa-com-risco) só
      // quando fizer sentido (obras "Fornecimento de MDO").
      let obraTipoContrato: string | null = null;
      if (cot.obraId) {
        const [ob] = await db.select({ tipoContrato: obras.tipoContrato }).from(obras).where(eq(obras.id, cot.obraId));
        obraTipoContrato = ob?.tipoContrato ?? null;
      }

      // Rastreabilidade: SC vinculada
      let scInfo: { numeroSc: string | null; criadoPorNome: string | null; aprovadorNome: string | null; aprovadoEm: string | null } | null = null;
      if (cot.solicitacaoId) {
        const [sc] = await db.select({
          numeroSc: comprasSolicitacoes.numeroSc,
          criadoPorNome: comprasSolicitacoes.criadoPorNome,
          aprovadorNome: comprasSolicitacoes.aprovadorNome,
          aprovadorId: comprasSolicitacoes.aprovadorId,
          aprovadoEm: comprasSolicitacoes.aprovadoEm,
        }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
        if (sc) {
          let aprovNome = sc.aprovadorNome;
          if (!aprovNome && sc.aprovadorId) {
            const [u] = await db.select({ nome: users.name }).from(users).where(eq(users.id, sc.aprovadorId));
            aprovNome = u?.nome ?? null;
          }
          scInfo = { numeroSc: sc.numeroSc, criadoPorNome: sc.criadoPorNome, aprovadorNome: aprovNome, aprovadoEm: sc.aprovadoEm };
        }
      }

      // Rev. 4017 — Item 8: rastreio inverso — OCs geradas a partir desta cotação
      const ordensVinculadas = await db.select({
        id: comprasOrdens.id,
        numeroOc: comprasOrdens.numeroOc,
        status: comprasOrdens.status,
      }).from(comprasOrdens).where(eq(comprasOrdens.cotacaoId, input.id));

      let fornecedorContato: { contatoNome: string | null; telefone: string | null; contatoCelular: string | null; contatoEmail: string | null; email: string | null; nomeFantasia: string | null; razaoSocial: string | null } | null = null;
      if (cot.fornecedorId) {
        const [f] = await db.select({
          contatoNome: fornecedores.contatoNome,
          telefone: fornecedores.telefone,
          contatoCelular: fornecedores.contatoCelular,
          contatoEmail: fornecedores.contatoEmail,
          email: fornecedores.email,
          nomeFantasia: fornecedores.nomeFantasia,
          razaoSocial: fornecedores.razaoSocial,
        }).from(fornecedores).where(eq(fornecedores.id, cot.fornecedorId));
        fornecedorContato = f ?? null;
      }

      // Se há um fornecedor vencedor selecionado, enriquecer os itens com preços reais do Mapa
      if (cot.fornecedorId) {
        const respostas = await db.select().from(comprasCotacaoRespostas).where(
          and(
            eq(comprasCotacaoRespostas.cotacaoId, input.id),
            eq(comprasCotacaoRespostas.fornecedorId, cot.fornecedorId),
          )
        );
        if (respostas.length > 0) {
          const respostaByItemId = new Map(respostas.map(r => [r.itemId, r]));
          const itensEnriquecidos = itens.map(it => {
            const r = respostaByItemId.get(it.id);
            if (!r) return it;
            return {
              ...it,
              precoUnitario: r.precoUnitario ?? it.precoUnitario,
              descontoPct:   r.descontoPct   ?? it.descontoPct,
              quantidade:    r.quantidade    ?? it.quantidade,
              total:         r.total         ?? it.total,
            };
          });
          return { ...cot, itens: itensEnriquecidos, fornecedorContato, scInfo, obraTipoContrato, ordensVinculadas };
        }
      }

      return { ...cot, itens, fornecedorContato, scInfo, obraTipoContrato, ordensVinculadas };
    }),

  criarCotacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricao: z.string().optional(),
      prioridade: z.string().optional(),
      tipo: z.enum(["material", "servico", "pacote", "equipamento", "pecas_veiculo"]).optional().default("material"),
      obraId: z.number().nullable().optional(),
      solicitacaoId: z.number().nullable().optional(),
      fornecedorId: z.number().nullable().optional(),
      dataValidade: z.string().optional(),
      condicaoPagamento: z.string().optional(),
      tipoPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(),
      prazoEntregaDias: z.number().nullable().optional(),
      observacoes: z.string().optional(),
      userId: z.number().optional(),
      userName: z.string().optional(),
      itens: z.array(z.object({
        solicitacaoItemId: z.number().nullable().optional(),
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        precoUnitario: z.number(),
        descontoPct: z.number().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      let tipoFinal = input.tipo ?? "material";
      if (input.solicitacaoId) {
        const [sc] = await db.select({ id: comprasSolicitacoes.id, aprovacaoStatus: comprasSolicitacoes.aprovacaoStatus, status: comprasSolicitacoes.status, tipo: comprasSolicitacoes.tipo })
          .from(comprasSolicitacoes)
          .where(eq(comprasSolicitacoes.id, input.solicitacaoId));
        // Rev. 2294 — Aprovação automática: SC já nasce aprovada,
        // logo o gate "sc.aprovacaoStatus !== 'aprovada'" foi removido.
        if (sc && sc.aprovacaoStatus === "recusada") {
          throw new Error("Esta solicitação foi recusada e não pode ser cotada.");
        }
        if (sc?.tipo) {
          tipoFinal = sc.tipo as string;
        }

        const existingCots = await db.select({ id: comprasCotacoes.id, numeroCotacao: comprasCotacoes.numeroCotacao, status: comprasCotacoes.status })
          .from(comprasCotacoes)
          .where(and(
            eq(comprasCotacoes.solicitacaoId, input.solicitacaoId),
            eq(comprasCotacoes.companyId, input.companyId),
          ));
        const activeCots = existingCots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));
        if (activeCots.length > 0) {
          // Rev. 2295 — defesa em profundidade: cotação "ativa" SEM itens (órfã,
          // resultado teórico de uma falha parcial pré-transação) é
          // auto-cancelada aqui pra desbloquear retry. Com a transação
          // adicionada no `criarSolicitacao` isso virou cinto+suspensório, mas
          // protege casos legados (cotações criadas antes desta revisão) e
          // qualquer rota futura que insira cotação fora de tx.
          const cotIds = activeCots.map(c => c.id);
          const itensRows = await db.select({ cotacaoId: comprasCotacoesItens.cotacaoId })
            .from(comprasCotacoesItens)
            .where(inArray(comprasCotacoesItens.cotacaoId, cotIds));
          const cotsComItens = new Set(itensRows.map(r => r.cotacaoId));
          const cotsOrfas = activeCots.filter(c => !cotsComItens.has(c.id));
          if (cotsOrfas.length > 0) {
            await db.update(comprasCotacoes)
              .set({ status: "cancelada", observacoes: sql`COALESCE(${comprasCotacoes.observacoes}, '') || ' [Rev.2295: auto-cancelada por estar sem itens]'` })
              .where(inArray(comprasCotacoes.id, cotsOrfas.map(c => c.id)));
            // Rev. 2823 — libera reservas preventivas das cotações auto-canceladas.
            await _liberarReservasDeCotacoes(cotsOrfas.map(c => c.id), "liberada", "Cotação auto-cancelada (sem itens)", input.companyId);
            console.log(`[compras.criarCotacao] Rev. 2295 auto-cancelou ${cotsOrfas.length} cotação(ões) órfã(s) sem itens pra SC ${input.solicitacaoId}:`, cotsOrfas.map(c => c.numeroCotacao).join(", "));
          }
          const stillActive = activeCots.filter(c => cotsComItens.has(c.id));
          if (stillActive.length > 0) {
            // Rev. 2806 — COTAÇÃO PARCIAL: uma SC pode ter VÁRIAS cotações
            // ativas ao mesmo tempo, desde que o MESMO item não esteja em
            // duas delas (anti-duplicidade — evita comprar o item 2x). A regra
            // passou de "1 cotação ativa por SC" para "1 cotação ativa por ITEM".
            const stillActiveIds = stillActive.map(c => c.id);
            const numeroPorCotacao = new Map(stillActive.map(c => [c.id, c.numeroCotacao]));
            const itensCobertos = await db.select({ solicitacaoItemId: comprasCotacoesItens.solicitacaoItemId, cotacaoId: comprasCotacoesItens.cotacaoId })
              .from(comprasCotacoesItens)
              .where(inArray(comprasCotacoesItens.cotacaoId, stillActiveIds));
            const cobertoPara = new Map<number, string>(); // solicitacaoItemId -> numeroCotacao que já o cobre
            for (const r of itensCobertos) {
              if (r.solicitacaoItemId != null && !cobertoPara.has(r.solicitacaoItemId)) {
                cobertoPara.set(r.solicitacaoItemId, numeroPorCotacao.get(r.cotacaoId) ?? "");
              }
            }
            const requestedIds = input.itens.map(it => it.solicitacaoItemId).filter((x): x is number => x != null);
            const conflitos = [...new Set(requestedIds.filter(id => cobertoPara.has(id)))];
            if (conflitos.length > 0) {
              const cotsConflito = [...new Set(conflitos.map(id => cobertoPara.get(id)).filter(Boolean))];
              throw new Error(`${conflitos.length} ${conflitos.length === 1 ? "item já está" : "itens já estão"} em cotação ativa (${cotsConflito.join(", ")}). Para cotá-${conflitos.length === 1 ? "lo" : "los"} novamente, cancele a cotação correspondente ou remova ${conflitos.length === 1 ? "esse item dela" : "esses itens dela"}.`);
            }
            // Sem conflito de itens → permite criar cotação parcial adicional para a mesma SC.
          }
        }
      }

      const itensMapped = input.itens.map(it => {
        const desc = it.descontoPct ?? 0;
        const total = n(it.quantidade) * n(it.precoUnitario) * (1 - desc / 100);
        return { ...it, total: total.toFixed(2) };
      });
      const totalGeral = itensMapped.reduce((s, it) => s + n(it.total), 0);

      // Rev. 4001 — numeração + insert dentro de db.transaction com
      // pg_advisory_xact_lock(companyId, 1001). Este é o endpoint PRINCIPAL de
      // criação manual de cotação (via botão "Enviar para Cotação"); usava
      // COUNT(*) fora de qualquer lock/transação — 2 cotações criadas quase
      // juntas (obras diferentes ou não) liam o mesmo COUNT(*) e recebiam o
      // MESMO numeroCotacao. Bug reportado: "várias solicitações de várias
      // obras com a mesma numeração COT-XXXX-2026".
      const cot = await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.companyId}::int, 1001::int)`);
        const count = await tx.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, input.companyId));
        const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
        const numeroCotacao = `COT-${new Date().getFullYear()}-${seq}`;

        const [cotRow] = await tx.insert(comprasCotacoes).values({
          companyId: input.companyId,
          numeroCotacao,
          descricao: normalizarTexto(input.descricao),
          prioridade: input.prioridade ?? "normal",
          tipo: tipoFinal,
          obraId: input.obraId ?? null,
          solicitacaoId: input.solicitacaoId ?? null,
          fornecedorId: input.fornecedorId ?? null,
          dataValidade: input.dataValidade,
          condicaoPagamento: input.condicaoPagamento,
          tipoPagamento: input.tipoPagamento ?? null,
          numeroParcelas: input.numeroParcelas ?? 1,
          prazoEntregaDias: input.prazoEntregaDias ?? null,
          observacoes: input.observacoes,
          total: String(totalGeral.toFixed(2)),
          status: "pendente",
          criadoPorId: input.userId ?? null,
          criadoPorNome: input.userName ?? null,
        } as any).returning();

        if (itensMapped.length > 0) {
          await tx.insert(comprasCotacoesItens).values(
            itensMapped.map(it => ({
              cotacaoId: cotRow.id,
              solicitacaoItemId: it.solicitacaoItemId ?? null,
              descricao: normalizarTexto(it.descricao),
              unidade: it.unidade,
              quantidade: String(it.quantidade),
              precoUnitario: String(it.precoUnitario),
              descontoPct: String(it.descontoPct ?? 0),
              total: it.total,
            }))
          );
        }
        if (input.solicitacaoId) {
          await tx.update(comprasSolicitacoes).set({ status: "cotacao", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
        }
        return cotRow;
      });
      return cot;
    }),

  // Rev. 2806 — COTAÇÃO PARCIAL: divide uma cotação existente, MOVENDO um
  // subconjunto de itens para uma NOVA cotação separada (mesma SC). Os itens
  // (e as respostas dos fornecedores referentes a eles) saem da original; os
  // fornecedores convidados são replicados na nova cotação para continuar a
  // disputa. Cada cotação fica com seu próprio número COT-AAAA-NNNN.
  dividirCotacao: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      // Rev. 4014 — cada item pode informar a QUANTIDADE que sai para a nova
      // cotação (default = quantidade total do item, mantendo compat com o
      // comportamento antigo de "mover item inteiro"). `itemIds` legado ainda
      // é aceito (equivale a mover 100% da quantidade de cada item).
      itens: z.array(z.object({ id: z.number(), quantidade: z.number().positive() })).min(1).optional(),
      itemIds: z.array(z.number()).min(1).optional(),
      descricao: z.string().optional(),
      userId: z.number().optional(),
      userName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new Error("Cotação não encontrada.");
      await _assertCompanyAccess(ctx.user, cot.companyId);
      if (["cancelada", "recusada", "aprovada", "concluida"].includes(cot.status ?? "")) {
        throw new Error("Só é possível dividir cotações ainda em aberto (pendentes). Esta cotação já foi aprovada/cancelada/concluída.");
      }
      const ocs = await db.select({ id: comprasOrdens.id, numeroOc: comprasOrdens.numeroOc })
        .from(comprasOrdens)
        .where(eq(comprasOrdens.cotacaoId, cot.id));
      if (ocs.length > 0) {
        throw new Error(`Esta cotação já gerou Ordem de Compra (${ocs.map(o => o.numeroOc).join(", ")}) e não pode ser dividida.`);
      }
      const allItens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, cot.id));
      const allIds = new Set(allItens.map(it => it.id));

      // Rev. 4014 — normaliza entrada legada (`itemIds`) pra nova forma (`itens`
      // com quantidade = 100% do item), pra não quebrar chamadores antigos.
      const rawItens = input.itens ?? (input.itemIds ?? []).map(id => ({ id, quantidade: Infinity }));
      const requestMap = new Map<number, number>();
      for (const it of rawItens) {
        if (allIds.has(it.id)) requestMap.set(it.id, it.quantidade);
      }
      if (requestMap.size === 0) throw new Error("Nenhum item válido selecionado para dividir.");

      type ItemRow = typeof allItens[number];
      const fullMoveItems: ItemRow[] = [];
      const partialMoveItems: { item: ItemRow; moveQty: number }[] = [];
      for (const it of allItens) {
        const req = requestMap.get(it.id);
        if (req == null) continue;
        const totalQty = n(it.quantidade);
        const moveQty = Math.min(Math.max(req, 0), totalQty);
        if (moveQty <= 1e-9) continue; // ignora seleção de quantidade zero/negativa
        if (moveQty >= totalQty - 1e-9) {
          fullMoveItems.push(it);
        } else {
          partialMoveItems.push({ item: it, moveQty });
        }
      }
      if (fullMoveItems.length === 0 && partialMoveItems.length === 0) {
        throw new Error("Nenhum item válido selecionado para dividir.");
      }
      if (fullMoveItems.length >= allItens.length) {
        throw new Error("Selecione menos itens (ou quantidades menores) — pelo menos 1 item deve permanecer na cotação original.");
      }
      const moveIds = fullMoveItems.map(it => it.id);

      const round2 = (v: number) => Math.round(v * 100) / 100;
      const round3 = (v: number) => Math.round(v * 1000) / 1000;
      const allTotal = allItens.reduce((s, it) => s + n(it.total), 0);
      const movedTotalFull = fullMoveItems.reduce((s, it) => s + n(it.total), 0);
      const movedTotalPartial = partialMoveItems.reduce((s, { item, moveQty }) => {
        const totalQty = n(item.quantidade) || 1;
        return s + round2(n(item.total) * (moveQty / totalQty));
      }, 0);
      const movedTotal = movedTotalFull + movedTotalPartial;
      const restantesTotal = round2(allTotal - movedTotal);

      // Rev. 2806 — TODO o split roda dentro de UMA transação com advisory lock
      // por empresa (serializa numeração + re-parent + recálculo de totais).
      // Se qualquer passo falhar, ROLLBACK total (sem estado meio-movido).
      const nova = await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${cot.companyId}::int, 1001::int)`);

        const count = await tx.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, cot.companyId));
        const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
        const numeroCotacao = `COT-${new Date().getFullYear()}-${seq}`;

        const [novaRow] = await tx.insert(comprasCotacoes).values({
          companyId: cot.companyId,
          numeroCotacao,
          divididaDeId: cot.id,
          descricao: normalizarTexto(input.descricao) ?? cot.descricao,
          prioridade: cot.prioridade ?? "normal",
          tipo: cot.tipo ?? "material",
          obraId: cot.obraId ?? null,
          solicitacaoId: cot.solicitacaoId ?? null,
          fornecedorId: cot.fornecedorId ?? null,
          dataValidade: cot.dataValidade ?? null,
          condicaoPagamento: cot.condicaoPagamento ?? null,
          tipoPagamento: cot.tipoPagamento ?? null,
          formaPagamento: cot.formaPagamento ?? null,
          numeroParcelas: cot.numeroParcelas ?? 1,
          prazoEntregaDias: cot.prazoEntregaDias ?? null,
          observacoes: `Dividida da cotação ${cot.numeroCotacao}.`,
          total: String(movedTotal.toFixed(2)),
          status: "pendente",
          criadoPorId: input.userId ?? ctx.user?.id ?? null,
          criadoPorNome: input.userName ?? ctx.user?.name ?? ctx.user?.email ?? null,
        } as any).returning();

        // Move os itens selecionados INTEIRAMENTE (re-parent: preserva os ids,
        // mantendo válidas as referências de OC/respostas que apontam pra
        // cotacao_item.id).
        if (moveIds.length > 0) {
          await tx.update(comprasCotacoesItens).set({ cotacaoId: novaRow.id }).where(inArray(comprasCotacoesItens.id, moveIds));
          // Move as respostas dos fornecedores referentes a esses itens.
          await tx.update(comprasCotacaoRespostas)
            .set({ cotacaoId: novaRow.id, propostaId: null })
            .where(and(eq(comprasCotacaoRespostas.cotacaoId, cot.id), inArray(comprasCotacaoRespostas.itemId, moveIds)));
        }

        // Rev. 4014 — Itens com QUANTIDADE PARCIAL: cria um novo item na cotação
        // nova com a fração movida (mesma descrição/preço/rastreio de SC) e
        // reduz a quantidade/total do item original que fica pra trás. As
        // respostas de fornecedor (já lançadas) são divididas na mesma
        // proporção, senão o orçamento por fornecedor ficaria incoerente.
        for (const { item, moveQty } of partialMoveItems) {
          const totalQty = n(item.quantidade) || 1;
          const ratio = moveQty / totalQty;
          const remQty = round3(totalQty - moveQty);
          const itemTotal = n(item.total);
          const movedItemTotal = round2(itemTotal * ratio);
          const remItemTotal = round2(itemTotal - movedItemTotal);

          const [novoItem] = await tx.insert(comprasCotacoesItens).values({
            cotacaoId: novaRow.id,
            solicitacaoItemId: item.solicitacaoItemId ?? null,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: String(round3(moveQty)),
            precoUnitario: item.precoUnitario,
            descontoPct: item.descontoPct,
            total: String(movedItemTotal.toFixed(2)),
            semVerba: item.semVerba,
            motivoSemVerba: item.motivoSemVerba,
          } as any).returning();

          await tx.update(comprasCotacoesItens)
            .set({ quantidade: String(remQty), total: String(remItemTotal.toFixed(2)) })
            .where(eq(comprasCotacoesItens.id, item.id));

          const respostasItem = await tx.select().from(comprasCotacaoRespostas)
            .where(and(eq(comprasCotacaoRespostas.cotacaoId, cot.id), eq(comprasCotacaoRespostas.itemId, item.id)));
          for (const r of respostasItem) {
            const rQty = n(r.quantidade);
            const rTotal = n(r.total);
            const rMovedQty = round3(rQty * ratio);
            const rMovedTotal = round2(rTotal * ratio);
            await tx.insert(comprasCotacaoRespostas).values({
              cotacaoId: novaRow.id,
              fornecedorId: r.fornecedorId,
              itemId: novoItem.id,
              propostaId: null,
              quantidade: String(rMovedQty),
              precoUnitario: r.precoUnitario,
              descontoPct: r.descontoPct,
              total: String(rMovedTotal.toFixed(2)),
              observacoes: r.observacoes,
            } as any);
            await tx.update(comprasCotacaoRespostas)
              .set({ quantidade: String(round3(rQty - rMovedQty)), total: String(round2(rTotal - rMovedTotal).toFixed(2)) })
              .where(eq(comprasCotacaoRespostas.id, r.id));
          }
        }

        // Replica os fornecedores convidados na nova cotação, recalculando o
        // totalOrcado a partir das respostas QUE FORAM MOVIDAS.
        const forns = await tx.select().from(comprasCotacaoFornecedores).where(eq(comprasCotacaoFornecedores.cotacaoId, cot.id));
        if (forns.length > 0) {
          const movedResp = await tx.select({ fornecedorId: comprasCotacaoRespostas.fornecedorId, total: comprasCotacaoRespostas.total })
            .from(comprasCotacaoRespostas).where(eq(comprasCotacaoRespostas.cotacaoId, novaRow.id));
          const totalPorFornNova = new Map<number, number>();
          for (const r of movedResp) totalPorFornNova.set(r.fornecedorId, (totalPorFornNova.get(r.fornecedorId) ?? 0) + n(r.total));
          await tx.insert(comprasCotacaoFornecedores).values(
            forns.map((f: any) => ({
              cotacaoId: novaRow.id,
              fornecedorId: f.fornecedorId,
              prazoEntregaDias: f.prazoEntregaDias,
              condicaoPagamento: f.condicaoPagamento,
              tipoPagamento: f.tipoPagamento,
              formaPagamento: f.formaPagamento,
              numeroParcelas: f.numeroParcelas,
              observacoes: f.observacoes,
              totalOrcado: String((totalPorFornNova.get(f.fornecedorId) ?? 0).toFixed(2)),
              selecionado: false,
              freteTipo: f.freteTipo ?? "cif",
              valorFrete: f.valorFrete ?? "0",
              transportadora: f.transportadora,
              moduloMedicao: f.moduloMedicao,
              isEstoque: f.isEstoque ?? false,
              almoxarifadoOrigemId: f.almoxarifadoOrigemId,
            })) as any
          );

          // Recalcula o totalOrcado dos fornecedores da cotação ORIGINAL (as
          // respostas dos itens movidos saíram — sem isso o valor fica stale).
          const respRestantes = await tx.select({ fornecedorId: comprasCotacaoRespostas.fornecedorId, total: comprasCotacaoRespostas.total })
            .from(comprasCotacaoRespostas).where(eq(comprasCotacaoRespostas.cotacaoId, cot.id));
          const totalPorFornOrig = new Map<number, number>();
          for (const r of respRestantes) totalPorFornOrig.set(r.fornecedorId, (totalPorFornOrig.get(r.fornecedorId) ?? 0) + n(r.total));
          for (const f of forns) {
            await tx.update(comprasCotacaoFornecedores)
              .set({ totalOrcado: String((totalPorFornOrig.get(f.fornecedorId) ?? 0).toFixed(2)) })
              .where(eq(comprasCotacaoFornecedores.id, f.id));
          }
        }

        // Atualiza o total da cotação original (sem os itens movidos).
        await tx.update(comprasCotacoes).set({ total: String(restantesTotal.toFixed(2)) }).where(eq(comprasCotacoes.id, cot.id));

        return novaRow;
      });

      return { nova, movidos: moveIds.length };
    }),

  // Rev. 2807 — Cancela a DIVISÃO de uma cotação: devolve TODOS os itens (e as
  // respostas) da cotação-filha de volta à cotação ORIGINAL e remove a filha,
  // como se a divisão nunca tivesse acontecido. Só funciona em cotações criadas
  // por uma divisão (têm `dividida_de_id`) e ainda em aberto, sem OC gerada.
  cancelarDivisaoCotacao: protectedProcedure
    .input(z.object({ cotacaoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // Leitura "rápida" só p/ o guard de empresa (barata, sem lock). TODA a
      // validação que decide se a operação prossegue é RE-FEITA dentro da
      // transação sob lock (abaixo) p/ evitar TOCTOU — apontado no code review.
      const [filhaPre] = await db.select({ companyId: comprasCotacoes.companyId })
        .from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!filhaPre) throw new Error("Cotação não encontrada.");
      await _assertCompanyAccess(ctx.user, filhaPre.companyId);

      // Rev. 2807 — Tudo dentro de UMA transação com advisory lock por empresa:
      // (re)validação sob lock + re-parent dos itens/respostas + recálculo dos
      // totais + remoção da filha rodam serializados. Falha em qualquer passo
      // (inclusive validação) → ROLLBACK total.
      const resultado = await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${filhaPre.companyId}::int, 1001::int)`);

        // Re-lê a FILHA já sob lock (snapshot autoritativo).
        const [filha] = await tx.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
        if (!filha) throw new Error("Cotação não encontrada.");
        if (!filha.divididaDeId) {
          throw new Error("Esta cotação não foi criada por uma divisão — não há divisão para cancelar.");
        }
        if (["cancelada", "recusada", "aprovada", "concluida"].includes(filha.status ?? "")) {
          throw new Error("Só é possível cancelar a divisão de cotações ainda em aberto (pendentes).");
        }
        const [orig] = await tx.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, filha.divididaDeId));
        if (!orig) throw new Error("A cotação original não existe mais — não é possível devolver os itens.");
        if (orig.companyId !== filha.companyId) throw new Error("Cotação original de outra empresa.");
        if (["cancelada", "recusada", "aprovada", "concluida"].includes(orig.status ?? "")) {
          throw new Error("A cotação original já foi aprovada/cancelada/concluída — não é possível devolver os itens a ela.");
        }
        const ocs = await tx.select({ numeroOc: comprasOrdens.numeroOc })
          .from(comprasOrdens).where(eq(comprasOrdens.cotacaoId, filha.id));
        if (ocs.length > 0) {
          throw new Error(`Esta cotação já gerou Ordem de Compra (${ocs.map((o: any) => o.numeroOc).join(", ")}) e não pode ser desfeita.`);
        }

        const itensFilha = await tx.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, filha.id));
        const devolvidos = itensFilha.length;

        // Fornecedores replicados da filha (lidos ANTES de apagar) — usados p/
        // recriar na original qualquer fornecedor que tenha resposta mas não
        // exista mais na original (consistência fornecedor↔resposta).
        const fornsFilha = await tx.select().from(comprasCotacaoFornecedores).where(eq(comprasCotacaoFornecedores.cotacaoId, filha.id));

        // Devolve itens + respostas pra cotação original (re-parent: preserva ids).
        await tx.update(comprasCotacoesItens).set({ cotacaoId: orig.id }).where(eq(comprasCotacoesItens.cotacaoId, filha.id));
        await tx.update(comprasCotacaoRespostas).set({ cotacaoId: orig.id, propostaId: null }).where(eq(comprasCotacaoRespostas.cotacaoId, filha.id));

        // Remove os fornecedores replicados da filha (a original já tem os seus).
        await tx.delete(comprasCotacaoFornecedores).where(eq(comprasCotacaoFornecedores.cotacaoId, filha.id));

        // Recalcula o totalOrcado dos fornecedores da ORIGINAL (agora com todas
        // as respostas de volta) e o total geral da original.
        const respOrig = await tx.select({ fornecedorId: comprasCotacaoRespostas.fornecedorId, total: comprasCotacaoRespostas.total })
          .from(comprasCotacaoRespostas).where(eq(comprasCotacaoRespostas.cotacaoId, orig.id));
        const totalPorForn = new Map<number, number>();
        for (const r of respOrig) totalPorForn.set(r.fornecedorId, (totalPorForn.get(r.fornecedorId) ?? 0) + n(r.total));

        // Garante que TODO fornecedor com resposta na original tenha sua linha
        // em comprasCotacaoFornecedores (se sumiu, recria a partir da filha).
        const fornsOrig = await tx.select().from(comprasCotacaoFornecedores).where(eq(comprasCotacaoFornecedores.cotacaoId, orig.id));
        const fornsOrigIds = new Set(fornsOrig.map((f: any) => f.fornecedorId));
        const fornsFilhaPorId = new Map(fornsFilha.map((f: any) => [f.fornecedorId, f]));
        for (const fid of totalPorForn.keys()) {
          if (!fornsOrigIds.has(fid)) {
            const base: any = fornsFilhaPorId.get(fid);
            await tx.insert(comprasCotacaoFornecedores).values({
              cotacaoId: orig.id,
              fornecedorId: fid,
              condicaoPagamento: base?.condicaoPagamento ?? null,
              tipoPagamento: base?.tipoPagamento ?? null,
              formaPagamento: base?.formaPagamento ?? null,
              numeroParcelas: base?.numeroParcelas ?? null,
              prazoEntregaDias: base?.prazoEntregaDias ?? null,
              totalOrcado: String((totalPorForn.get(fid) ?? 0).toFixed(2)),
            });
            fornsOrigIds.add(fid);
          }
        }
        for (const f of fornsOrig) {
          await tx.update(comprasCotacaoFornecedores)
            .set({ totalOrcado: String((totalPorForn.get(f.fornecedorId) ?? 0).toFixed(2)) })
            .where(eq(comprasCotacaoFornecedores.id, f.id));
        }
        const itensOrig = await tx.select({ total: comprasCotacoesItens.total }).from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, orig.id));
        const totalOrig = itensOrig.reduce((s: number, it: any) => s + n(it.total), 0);
        await tx.update(comprasCotacoes).set({ total: String(totalOrig.toFixed(2)) }).where(eq(comprasCotacoes.id, orig.id));

        // Remove a cotação-filha (agora vazia).
        await tx.delete(comprasCotacoes).where(eq(comprasCotacoes.id, filha.id));

        return { devolvidos, originalId: orig.id, originalNumero: orig.numeroCotacao };
      });

      return { ok: true, originalId: resultado.originalId, originalNumero: resultado.originalNumero, devolvidos: resultado.devolvidos };
    }),

  // Rev. 2806 — Cria, em 1 clique, uma nova cotação só com os itens da SC que
  // ainda NÃO estão cobertos por nenhuma cotação ativa ("cotar restantes").
  cotarItensRestantes: protectedProcedure
    .input(z.object({ solicitacaoId: z.number(), userId: z.number().optional(), userName: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [sc] = await db.select().from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      if (!sc) throw new Error("Solicitação não encontrada.");
      await _assertCompanyAccess(ctx.user, sc.companyId);
      if (sc.aprovacaoStatus === "recusada") throw new Error("Esta solicitação foi recusada e não pode ser cotada.");

      // Rev. 2806 — Tudo dentro de UMA transação com advisory lock por empresa:
      // o check de cobertura + insert da cotação rodam serializados, evitando que
      // 2 requisições paralelas criem cobertura duplicada do mesmo item.
      return await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${sc.companyId}::int, 1001::int)`);

        const scItens = await tx.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, sc.id));
        const cots = await tx.select({ id: comprasCotacoes.id, status: comprasCotacoes.status })
          .from(comprasCotacoes)
          .where(and(eq(comprasCotacoes.solicitacaoId, sc.id), eq(comprasCotacoes.companyId, sc.companyId)));
        const ativas = cots.filter((c: any) => !["cancelada", "recusada"].includes(c.status ?? "")).map((c: any) => c.id);
        const cobertos = new Set<number>();
        if (ativas.length > 0) {
          const rows = await tx.select({ solicitacaoItemId: comprasCotacoesItens.solicitacaoItemId })
            .from(comprasCotacoesItens).where(inArray(comprasCotacoesItens.cotacaoId, ativas));
          for (const r of rows) if (r.solicitacaoItemId != null) cobertos.add(r.solicitacaoItemId);
        }
        const restantes = scItens.filter((it: any) => !cobertos.has(it.id));
        if (restantes.length === 0) throw new Error("Todos os itens desta solicitação já estão em cotação.");

        const count = await tx.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, sc.companyId));
        const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
        const numeroCotacao = `COT-${new Date().getFullYear()}-${seq}`;
        const [nova] = await tx.insert(comprasCotacoes).values({
          companyId: sc.companyId,
          numeroCotacao,
          descricao: sc.titulo || sc.numeroSc,
          prioridade: sc.prioridade ?? "normal",
          tipo: (sc.tipo as string) ?? "material",
          obraId: sc.obraId ?? null,
          solicitacaoId: sc.id,
          observacoes: "Cotação dos itens restantes da solicitação.",
          total: "0",
          status: "pendente",
          criadoPorId: input.userId ?? ctx.user?.id ?? null,
          criadoPorNome: input.userName ?? ctx.user?.name ?? ctx.user?.email ?? null,
        } as any).returning();
        await tx.insert(comprasCotacoesItens).values(
          restantes.map((it: any) => ({
            cotacaoId: nova.id,
            solicitacaoItemId: it.id,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            precoUnitario: "0",
            descontoPct: "0",
            total: "0",
          })) as any
        );
        await tx.update(comprasSolicitacoes).set({ status: "cotacao", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, sc.id));
        return { nova, itens: restantes.length };
      });
    }),

  // Rev. 2806 — Cobertura de itens da SC: quantos itens já estão em cotação
  // ativa vs pendentes, e a lista de cotações "irmãs" da mesma SC (navegação).
  getCoberturaSolicitacao: protectedProcedure
    .input(z.object({ solicitacaoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [sc] = await db.select({ companyId: comprasSolicitacoes.companyId }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      if (!sc) return { total: 0, cobertos: 0, pendentes: 0, itens: [], cotacoes: [] };
      await _assertCompanyAccess(ctx.user, sc.companyId);
      const scItens = await db.select({ id: comprasSolicitacoesItens.id, descricao: comprasSolicitacoesItens.descricao })
        .from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.solicitacaoId));
      const cots = await db.select({ id: comprasCotacoes.id, numeroCotacao: comprasCotacoes.numeroCotacao, status: comprasCotacoes.status })
        .from(comprasCotacoes)
        .where(and(eq(comprasCotacoes.solicitacaoId, input.solicitacaoId), eq(comprasCotacoes.companyId, sc.companyId)));
      const ativas = cots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));
      const numeroPorCotacao = new Map(ativas.map(c => [c.id, c.numeroCotacao]));
      const coberturaItem = new Map<number, { cotacaoId: number; numeroCotacao: string }>();
      if (ativas.length > 0) {
        const rows = await db.select({ solicitacaoItemId: comprasCotacoesItens.solicitacaoItemId, cotacaoId: comprasCotacoesItens.cotacaoId })
          .from(comprasCotacoesItens).where(inArray(comprasCotacoesItens.cotacaoId, ativas.map(c => c.id)));
        for (const r of rows) {
          if (r.solicitacaoItemId != null && !coberturaItem.has(r.solicitacaoItemId)) {
            coberturaItem.set(r.solicitacaoItemId, { cotacaoId: r.cotacaoId, numeroCotacao: numeroPorCotacao.get(r.cotacaoId) ?? "" });
          }
        }
      }
      const itens = scItens.map(it => {
        const cov = coberturaItem.get(it.id);
        return { solicitacaoItemId: it.id, descricao: it.descricao, cotacaoId: cov?.cotacaoId ?? null, numeroCotacao: cov?.numeroCotacao ?? null };
      });
      const cobertos = itens.filter(it => it.cotacaoId != null).length;
      return {
        total: scItens.length,
        cobertos,
        pendentes: scItens.length - cobertos,
        itens,
        cotacoes: cots.map(c => ({ id: c.id, numeroCotacao: c.numeroCotacao, status: c.status })),
      };
    }),

  aprovarCotacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cotAcc] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.id));
      if (cotAcc) await _assertCompanyAccess(ctx.user, cotAcc.companyId);
      await db.update(comprasCotacoes).set({
        status: "aprovada",
        aprovadoPorId: ctx.user?.id ?? null,
        aprovadoPorNome: ctx.user?.name || ctx.user?.email || null,
        aprovadoEm: new Date().toISOString(),
      } as any).where(eq(comprasCotacoes.id, input.id));
      return { ok: true };
    }),

  atualizarStatusCotacao: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cotAcc] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.id));
      if (cotAcc) await _assertCompanyAccess(ctx.user, cotAcc.companyId);
      await db.update(comprasCotacoes).set({ status: input.status }).where(eq(comprasCotacoes.id, input.id));
      return { ok: true };
    }),

  excluirCotacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // 0. Buscar a cotação para pegar solicitacaoId (revertida ao final)
      const [cot] = await db.select({ solicitacaoId: comprasCotacoes.solicitacaoId, companyId: comprasCotacoes.companyId })
        .from(comprasCotacoes)
        .where(eq(comprasCotacoes.id, input.id));
      if (cot) await _assertCompanyAccess(ctx.user, cot.companyId);

      // 1. Encontrar OCs vinculadas a esta cotação
      const ocs = await db.select({ id: comprasOrdens.id })
        .from(comprasOrdens)
        .where(eq(comprasOrdens.cotacaoId, input.id));

      if (ocs.length > 0) {
        const ocIds = ocs.map(o => o.id);

        // 2. Deletar itens das OCs
        await db.delete(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocIds));

        // 3. Deletar as OCs
        await db.delete(comprasOrdens).where(inArray(comprasOrdens.id, ocIds));
      }

      // 4. Reverter SC para "pendente" (usando solicitacaoId da cotação)
      if (cot?.solicitacaoId) {
        await db.update(comprasSolicitacoes)
          .set({ status: "pendente" })
          .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      // 5. Deletar respostas e participantes da cotação
      await db.delete(comprasCotacaoRespostas).where(eq(comprasCotacaoRespostas.cotacaoId, input.id));
      await db.delete(comprasCotacaoFornecedores).where(eq(comprasCotacaoFornecedores.cotacaoId, input.id));

      // 6. Deletar itens da cotação
      await db.delete(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.id));

      // 6b. FIX: estornar débitos de Reserva de Risco (DI-08) e realocações de
      // sobras vinculados a esta cotação. Sem isso, ficavam débitos órfãos
      // descontando o saldo da reserva indefinidamente.
      await db.delete(comprasRiscoDebitos).where(eq(comprasRiscoDebitos.cotacaoId, input.id));
      await db.delete(budgetReallocations).where(and(
        sql`${budgetReallocations.origemEapItemNome} LIKE 'Economia OC:%'`,
        sql`${budgetReallocations.destinoEapItemNome} = ${`Cotação #${input.id}`}`,
      ));

      // Rev. 1386 — libera reservas preventivas da cotação excluída.
      await _liberarReservasDaCotacao({ cotacaoId: input.id, acao: "liberada", motivo: "Cotação excluída" });

      // 7. Deletar a cotação
      await db.delete(comprasCotacoes).where(eq(comprasCotacoes.id, input.id));

      return { ok: true };
    }),

  excluirCotacoesEmLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowedCompanies.map((c: any) => c.id);
      if (!allowedIds.includes(input.companyId)) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });
      const owned = await db.select({ id: comprasCotacoes.id, solicitacaoId: comprasCotacoes.solicitacaoId }).from(comprasCotacoes).where(and(inArray(comprasCotacoes.id, input.ids), eq(comprasCotacoes.companyId, input.companyId)));
      const ownedIds = owned.map(o => o.id);
      if (ownedIds.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma cotação encontrada" });

      const ocs = await db.select({ id: comprasOrdens.id }).from(comprasOrdens).where(inArray(comprasOrdens.cotacaoId, ownedIds));
      if (ocs.length > 0) {
        const ocIds = ocs.map(o => o.id);
        await db.delete(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocIds));
        await db.delete(comprasOrdens).where(inArray(comprasOrdens.id, ocIds));
      }

      const scIds = [...new Set(owned.filter(o => o.solicitacaoId).map(o => o.solicitacaoId!))];
      if (scIds.length > 0) {
        await db.update(comprasSolicitacoes).set({ status: "pendente" }).where(inArray(comprasSolicitacoes.id, scIds));
      }

      await db.delete(comprasCotacaoRespostas).where(inArray(comprasCotacaoRespostas.cotacaoId, ownedIds));
      await db.delete(comprasCotacaoFornecedores).where(inArray(comprasCotacaoFornecedores.cotacaoId, ownedIds));
      await db.delete(comprasCotacoesItens).where(inArray(comprasCotacoesItens.cotacaoId, ownedIds));
      // FIX: estornar débitos de risco e realocações de sobras vinculados às cotações em lote.
      await db.delete(comprasRiscoDebitos).where(inArray(comprasRiscoDebitos.cotacaoId, ownedIds));
      const destinosCot = ownedIds.map(id => `Cotação #${id}`);
      await db.delete(budgetReallocations).where(and(
        sql`${budgetReallocations.origemEapItemNome} LIKE 'Economia OC:%'`,
        inArray(budgetReallocations.destinoEapItemNome, destinosCot),
      ));
      // Rev. 1386 — libera reservas preventivas das cotações excluídas em lote.
      await _liberarReservasDeCotacoes(ownedIds, "liberada", "Cotação excluída em lote");
      await db.delete(comprasCotacoes).where(inArray(comprasCotacoes.id, ownedIds));
      return { ok: true, count: ownedIds.length };
    }),

  // ══════════════════════════════════════════════════════════════
  // MAPA DE COTAÇÃO (comparativo multi-fornecedor)
  // ══════════════════════════════════════════════════════════════

  getMapaCotacao: protectedProcedure
    .input(z.object({ cotacaoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND" });
      await _assertCompanyAccess(ctx.user, cot.companyId);
      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));
      const participantes = await db.select().from(comprasCotacaoFornecedores).where(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId));
      const respostas = await db.select().from(comprasCotacaoRespostas).where(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId));
      const fornIds = participantes.map(p => p.fornecedorId);
      const forns = fornIds.length > 0 ? await db.select().from(fornecedores).where(inArray(fornecedores.id, fornIds)) : [];

      // Buscar metaUnitario via SC item → orcamento item → orcamento.metaPercentual
      // Calcula ao vivo: custoUnitTotal × (1 − metaPercentual), igual ao EAP faz
      const scItemIds = itens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
      let scItens: any[] = [];
      if (scItemIds.length > 0) {
        scItens = await db.select({
          id: comprasSolicitacoesItens.id,
          orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
          eapCodigo: comprasSolicitacoesItens.eapCodigo,
          insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
          composicaoCodigo: comprasSolicitacoesItens.composicaoCodigo,
          origemEap: comprasSolicitacoesItens.origemEap,
          solicitacaoId: comprasSolicitacoesItens.solicitacaoId,
          precoMeta: comprasSolicitacoesItens.precoMeta,
          coeficiente: comprasSolicitacoesItens.coeficiente,
          semVerba: comprasSolicitacoesItens.semVerba,
          motivoSemVerba: comprasSolicitacoesItens.motivoSemVerba,
          incluirAjudante: comprasSolicitacoesItens.incluirAjudante,
          metaMdoProfissional: comprasSolicitacoesItens.metaMdoProfissional,
          metaMdoAjudante: comprasSolicitacoesItens.metaMdoAjudante,
        }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
      }
      const orcItemIds = scItens.map(s => s.orcamentoItemId).filter(Boolean) as number[];
      let orcItensData: any[] = [];
      if (orcItemIds.length > 0) {
        orcItensData = await db.select({
          id: orcamentoItens.id,
          orcamentoId: orcamentoItens.orcamentoId,
          custoUnitMat: orcamentoItens.custoUnitMat,
          custoUnitMdo: orcamentoItens.custoUnitMdo,
          custoUnitTotal: orcamentoItens.custoUnitTotal,
          metaUnitTotal: orcamentoItens.metaUnitTotal,
          metaUnitMat: orcamentoItens.metaUnitMat,
          metaUnitMdo: orcamentoItens.metaUnitMdo,
          custoUnitEquip: orcamentoItens.custoUnitEquip,
          metaUnitEquip: orcamentoItens.metaUnitEquip,
          quantidade: orcamentoItens.quantidade,
          unidade: orcamentoItens.unidade,
          eapCodigo: orcamentoItens.eapCodigo,
          servicoCodigo: orcamentoItens.servicoCodigo,
          descricao: orcamentoItens.descricao,
        }).from(orcamentoItens).where(inArray(orcamentoItens.id, orcItemIds));
      }

      const composicaoMap: Record<string, Array<{ insumoCodigo: string; descricao: string; unidade: string; coeficiente: number; precoUnitario: number; alocacaoMat: number; alocacaoMdo: number; custoTotal: number }>> = {};
      {
        const svcCodigos = [...new Set(orcItensData.filter((o: any) => o.servicoCodigo).map((o: any) => o.servicoCodigo!))] as string[];
        if (svcCodigos.length > 0 && cot.companyId) {
          const compInsumos = await db.select({
            composicaoCodigo: composicaoInsumos.composicaoCodigo,
            insumoCodigo: composicaoInsumos.insumoCodigo,
            insumoDescricao: composicaoInsumos.insumoDescricao,
            unidade: composicaoInsumos.unidade,
            quantidade: composicaoInsumos.quantidade,
            precoUnitario: composicaoInsumos.precoUnitario,
            alocacaoMat: composicaoInsumos.alocacaoMat,
            alocacaoMdo: composicaoInsumos.alocacaoMdo,
            alocacaoEquip: composicaoInsumos.alocacaoEquip,
            custoUnitTotal: composicaoInsumos.custoUnitTotal,
          }).from(composicaoInsumos)
            .where(and(eq(composicaoInsumos.companyId, Number(cot.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCodigos)));
          for (const ins of compInsumos) {
            if (!composicaoMap[ins.composicaoCodigo]) composicaoMap[ins.composicaoCodigo] = [];
            const coef = n(ins.quantidade);
            const preco = n(ins.precoUnitario);
            composicaoMap[ins.composicaoCodigo].push({
              insumoCodigo: ins.insumoCodigo ?? "",
              descricao: ins.insumoDescricao ?? "",
              unidade: ins.unidade ?? "un",
              coeficiente: coef,
              precoUnitario: preco,
              alocacaoMat: n(ins.alocacaoMat),
              alocacaoMdo: n(ins.alocacaoMdo),
              alocacaoEquip: n(ins.alocacaoEquip),
              custoTotal: n(ins.custoUnitTotal),
            });
          }
        }
      }
      const scItemToOrcServicoCodigo: Record<number, string | null> = {};
      for (const s of scItens) {
        if (s.orcamentoItemId) {
          const orc = orcItensData.find((o: any) => o.id === s.orcamentoItemId);
          scItemToOrcServicoCodigo[s.id] = orc?.servicoCodigo ?? null;
        }
      }

      // Buscar metaPercentual de cada orçamento vinculado
      const orcIds = [...new Set(orcItensData.map((o: any) => o.orcamentoId).filter(Boolean))] as number[];
      let orcData: any[] = [];
      if (orcIds.length > 0) {
        orcData = await db.select({ id: orcamentos.id, metaPercentual: orcamentos.metaPercentual })
          .from(orcamentos).where(inArray(orcamentos.id, orcIds));
      }
      const orcToMetaPerc: Record<number, number> = {};
      for (const o of orcData) orcToMetaPerc[o.id] = n(o.metaPercentual);

      // Buscar descrições dos ancestrais para montar breadcrumb (EAP path)
      // Ex: "02.02.01.92.93" → ancestrais: ["02", "02.02", "02.02.01", "02.02.01.92"]
      const ancestorCodeSet = new Set<string>();
      for (const o of orcItensData) {
        if (!o.eapCodigo) continue;
        const parts = String(o.eapCodigo).split(".");
        for (let k = 1; k < parts.length; k++) {
          ancestorCodeSet.add(parts.slice(0, k).join("."));
        }
      }
      const ancestorCodes = [...ancestorCodeSet];
      let ancestorItens: any[] = [];
      if (ancestorCodes.length > 0 && orcIds.length > 0) {
        ancestorItens = await db.select({
          orcamentoId: orcamentoItens.orcamentoId,
          eapCodigo: orcamentoItens.eapCodigo,
          descricao: orcamentoItens.descricao,
          nivel: orcamentoItens.nivel,
        }).from(orcamentoItens)
          .where(and(inArray(orcamentoItens.orcamentoId, orcIds), inArray(orcamentoItens.eapCodigo, ancestorCodes)));
      }
      // Mapa: `${orcamentoId}:${eapCodigo}` → descricao
      const ancestorMap: Record<string, string> = {};
      for (const a of ancestorItens) ancestorMap[`${a.orcamentoId}:${a.eapCodigo}`] = a.descricao;

      const scItemToOrcItem: Record<number, number> = {};
      const scItemToPrecoMeta: Record<number, number> = {};
      const scItemToIncluirAjudante: Record<number, boolean> = {};
      const scItemToMetaMdoProf: Record<number, number> = {};
      const scItemToMetaMdoAjud: Record<number, number> = {};
      const scItemToTraceability: Record<number, { eapCodigo?: string; insumoCodigo?: string; composicaoCodigo?: string; origemEap?: boolean; solicitacaoId?: number; semVerba?: boolean; motivoSemVerba?: string; coeficiente?: number }> = {};
      for (const s of scItens) {
        if (s.orcamentoItemId) scItemToOrcItem[s.id] = s.orcamentoItemId;
        const pm = n(s.precoMeta);
        if (pm > 0) scItemToPrecoMeta[s.id] = pm;
        scItemToIncluirAjudante[s.id] = s.incluirAjudante ?? true;
        scItemToMetaMdoProf[s.id] = n(s.metaMdoProfissional);
        scItemToMetaMdoAjud[s.id] = n(s.metaMdoAjudante);
        scItemToTraceability[s.id] = { eapCodigo: s.eapCodigo, insumoCodigo: s.insumoCodigo, composicaoCodigo: s.composicaoCodigo, origemEap: s.origemEap, solicitacaoId: s.solicitacaoId, coeficiente: n(s.coeficiente) };
      }

      const scIds = [...new Set(scItens.map(s => s.solicitacaoId).filter(Boolean))] as number[];
      let scMap: Record<number, string> = {};
      if (scIds.length > 0) {
        const scs = await db.select({ id: comprasSolicitacoes.id, numeroSc: comprasSolicitacoes.numeroSc }).from(comprasSolicitacoes).where(inArray(comprasSolicitacoes.id, scIds));
        for (const sc of scs) scMap[sc.id] = sc.numeroSc;
      }

      let tipoEfetivoEarly = (cot.tipo === "servico" || cot.tipo === "pacote" || cot.tipo === "equipamento") ? cot.tipo : "material";
      let incluirEquipamentosMapa = false;
      if (cot.solicitacaoId) {
        const [scTipoCheck] = await db.select({ tipo: comprasSolicitacoes.tipo, incluirEquipamentos: comprasSolicitacoes.incluirEquipamentos }).from(comprasSolicitacoes).where(and(eq(comprasSolicitacoes.id, cot.solicitacaoId), eq(comprasSolicitacoes.companyId, Number(cot.companyId))));
        if (scTipoCheck) {
          if (tipoEfetivoEarly === "material" && (scTipoCheck.tipo === "servico" || scTipoCheck.tipo === "pacote" || scTipoCheck.tipo === "equipamento")) tipoEfetivoEarly = scTipoCheck.tipo;
          incluirEquipamentosMapa = scTipoCheck.incluirEquipamentos ?? false;
        }
      }
      const isCotacaoMdoEarly = tipoEfetivoEarly === 'servico' || tipoEfetivoEarly === 'pacote';
      const scTipoFilter = tipoEfetivoEarly === 'pacote'
        ? sql`1=1`
        : tipoEfetivoEarly === 'servico'
        ? sql`s.tipo IN ('servico', 'pacote')`
        : tipoEfetivoEarly === 'equipamento'
        ? sql`s.tipo = 'equipamento'`
        : sql`(s.tipo IS NULL OR s.tipo = 'material')`;

      const insCodigos = scItens.filter(s => s.insumoCodigo).map(s => s.insumoCodigo!);
      const insCodigosUnique = [...new Set(insCodigos)];
      let insumoOrcMap: Record<string, number> = {};
      let insumoSolicMap: Record<string, number> = {};
      let insumoCompMap: Record<string, number> = {};
      if (insCodigosUnique.length > 0 && cot.obraId) {
        const cotOrcRows = await db.select({ id: orcamentos.id }).from(orcamentos)
          .where(and(eq(orcamentos.companyId, cot.companyId), eq(orcamentos.obraId, cot.obraId), isNull(orcamentos.deletedAt)))
          .orderBy(desc(orcamentos.createdAt)).limit(1);
        const cotOrcIds = cotOrcRows.map(o => o.id);
        if (cotOrcIds.length > 0) {
          const orcItemsForIns = await db.select({
            id: orcamentoItens.id,
            servicoCodigo: orcamentoItens.servicoCodigo,
            quantidade: orcamentoItens.quantidade,
          }).from(orcamentoItens)
            .where(and(inArray(orcamentoItens.orcamentoId, cotOrcIds), eq(orcamentoItens.companyId, cot.companyId)));
          const svcsComCodigo = orcItemsForIns.filter(it => it.servicoCodigo);
          if (svcsComCodigo.length > 0) {
            const svcCodigos = [...new Set(svcsComCodigo.map(it => it.servicoCodigo!))];
            const allCompIns = await db.select({
              composicaoCodigo: composicaoInsumos.composicaoCodigo,
              insumoCodigo: composicaoInsumos.insumoCodigo,
              quantidade: composicaoInsumos.quantidade,
              alocacaoMat: composicaoInsumos.alocacaoMat,
              alocacaoMdo: composicaoInsumos.alocacaoMdo,
              alocacaoEquip: composicaoInsumos.alocacaoEquip,
            }).from(composicaoInsumos)
              .where(and(eq(composicaoInsumos.companyId, Number(cot.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCodigos)));
            const filteredCompIns = filterInsumosByTipo(allCompIns as any[], tipoEfetivoEarly, incluirEquipamentosMapa);
            for (const ins of filteredCompIns) {
              const code = ins.insumoCodigo;
              if (!code || !insCodigosUnique.includes(code)) continue;
              const coef = n(ins.quantidade);
              const matchSvcs = svcsComCodigo.filter(s => s.servicoCodigo === ins.composicaoCodigo);
              for (const svc of matchSvcs) {
                insumoOrcMap[code] = (insumoOrcMap[code] ?? 0) + n(svc.quantidade) * coef;
              }
            }
          }
        }
        if (insCodigosUnique.length > 0) {
          const solRows = await db.execute(sql`
            SELECT si.insumo_codigo, COALESCE(SUM(si.quantidade::numeric), 0) as total
            FROM compras_solicitacoes_itens si
            JOIN compras_solicitacoes s ON s.id = si.solicitacao_id
            WHERE si.insumo_codigo IN (${sql.join(insCodigosUnique.map(c => sql`${c}`), sql`, `)})
              AND s.company_id = ${cot.companyId} AND s.status NOT IN ('cancelado')
              AND s.obra_id = ${cot.obraId}
              AND ${scTipoFilter}
            GROUP BY si.insumo_codigo
          `);
          for (const r of (solRows as any).rows ?? []) insumoSolicMap[r.insumo_codigo] = n(r.total);

          const compRows = await db.execute(sql`
            SELECT si.insumo_codigo, COALESCE(SUM(oi2.quantidade::numeric), 0) as total
            FROM compras_solicitacoes_itens si
            JOIN compras_ordens_itens oi2 ON oi2.solicitacao_item_id = si.id
            JOIN compras_ordens o ON o.id = oi2.ordem_id AND o.status NOT IN ('cancelada') AND o.company_id = ${cot.companyId}
            JOIN compras_solicitacoes s ON s.id = si.solicitacao_id AND s.obra_id = ${cot.obraId}
            WHERE si.insumo_codigo IN (${sql.join(insCodigosUnique.map(c => sql`${c}`), sql`, `)})
              AND ${scTipoFilter}
            GROUP BY si.insumo_codigo
          `);
          for (const r of (compRows as any).rows ?? []) insumoCompMap[r.insumo_codigo] = n(r.total);
        }
      }

      // Mapa: orcamentoItemId → { metaUnitario (total, mat, mdo), eapPath }
      const orcItemToMeta: Record<number, number> = {};
      const orcItemToMetaMat: Record<number, number> = {};
      const orcItemToMetaMdo: Record<number, number> = {};
      const orcItemToMetaEquip: Record<number, number> = {};
      const orcItemToPath: Record<number, string> = {};
      const orcItemToDescricao: Record<number, string> = {};
      const orcItemToEapCodigo: Record<number, string> = {};
      for (const o of orcItensData) {
        orcItemToDescricao[o.id] = o.descricao ?? "";
        orcItemToEapCodigo[o.id] = o.eapCodigo ?? "";
      }
      for (const o of orcItensData) {
        const metaPerc = orcToMetaPerc[o.orcamentoId] ?? 0;
        const metaDireta = n(o.metaUnitTotal);
        orcItemToMeta[o.id] = metaDireta > 0
          ? metaDireta
          : n(o.custoUnitTotal) * (1 - metaPerc);
        const metaMatDireta = n(o.metaUnitMat);
        orcItemToMetaMat[o.id] = metaMatDireta > 0
          ? metaMatDireta
          : n(o.custoUnitMat) * (1 - metaPerc);
        const metaMdoDireta = n(o.metaUnitMdo);
        orcItemToMetaMdo[o.id] = metaMdoDireta > 0
          ? metaMdoDireta
          : n(o.custoUnitMdo) * (1 - metaPerc);
        const metaEquipDireta = n(o.metaUnitEquip);
        orcItemToMetaEquip[o.id] = metaEquipDireta > 0
          ? metaEquipDireta
          : n(o.custoUnitEquip) * (1 - metaPerc);
        // Montar breadcrumb com até 3 níveis intermediários
        if (o.eapCodigo) {
          const parts = String(o.eapCodigo).split(".");
          const labels: string[] = [];
          for (let k = 1; k < parts.length; k++) {
            const code = parts.slice(0, k).join(".");
            const desc = ancestorMap[`${o.orcamentoId}:${code}`];
            if (desc) labels.push(desc);
          }
          orcItemToPath[o.id] = labels.slice(0, 3).join(" › ");
        }
      }

      const orcItemToCustoMat: Record<number, number> = {};
      const orcItemToCustoMdo: Record<number, number> = {};
      const orcItemToCustoEquip: Record<number, number> = {};
      const orcItemToCustoTotal: Record<number, number> = {};
      const svcCodeToCompInfo: Record<string, { descricao: string; unidade: string; qtdOrcada: number; metaTotal: number; eapCodigo: string }> = {};
      for (const o of orcItensData) {
        orcItemToCustoMat[o.id] = n(o.custoUnitMat);
        orcItemToCustoMdo[o.id] = n(o.custoUnitMdo);
        orcItemToCustoEquip[o.id] = n(o.custoUnitEquip);
        orcItemToCustoTotal[o.id] = n(o.custoUnitTotal);
        if (o.servicoCodigo) {
          const metaPerc = orcToMetaPerc[o.orcamentoId] ?? 0;
          const metaDireta = n(o.metaUnitTotal);
          const metaVal = metaDireta > 0 ? metaDireta : n(o.custoUnitTotal) * (1 - metaPerc);
          const existing = svcCodeToCompInfo[o.servicoCodigo];
          if (existing) {
            existing.qtdOrcada += n(o.quantidade);
          } else {
            svcCodeToCompInfo[o.servicoCodigo] = {
              descricao: o.descricao ?? "",
              unidade: o.unidade ?? "un",
              qtdOrcada: n(o.quantidade),
              metaTotal: metaVal,
              eapCodigo: o.eapCodigo ?? "",
            };
          }
        }
      }

      const orcItemToQtdOrcada: Record<number, number> = {};
      for (const o of orcItensData) orcItemToQtdOrcada[o.id] = n(o.quantidade);

      const orcItemToQtdSolicitada: Record<string, number> = {};
      if (orcItemIds.length > 0) {
        const solicitadoRows = await db.execute(sql`
          SELECT si.orcamento_item_id, si.insumo_codigo, COALESCE(SUM(si.quantidade::numeric), 0) as total_solicitado
          FROM compras_solicitacoes_itens si
          JOIN compras_solicitacoes s ON s.id = si.solicitacao_id
          WHERE si.orcamento_item_id IN (${sql.join(orcItemIds.map(id => sql`${id}`), sql`, `)})
            AND s.company_id = ${cot.companyId}
            AND s.status NOT IN ('cancelado')
            AND ${scTipoFilter}
          GROUP BY si.orcamento_item_id, si.insumo_codigo
        `);
        for (const r of (solicitadoRows as any).rows ?? []) {
          const key = r.insumo_codigo ? `${r.orcamento_item_id}:${r.insumo_codigo}` : String(r.orcamento_item_id);
          orcItemToQtdSolicitada[key] = n(r.total_solicitado);
        }
      }

      const orcItemToQtdComprada: Record<string, number> = {};
      if (orcItemIds.length > 0) {
        const compradoRows = await db.execute(sql`
          SELECT si.orcamento_item_id, si.insumo_codigo,
                 COALESCE(SUM(oi2.quantidade::numeric), 0) as total_comprado
          FROM compras_solicitacoes_itens si
          JOIN compras_ordens_itens oi2 ON oi2.solicitacao_item_id = si.id
          JOIN compras_ordens o ON o.id = oi2.ordem_id AND o.status NOT IN ('cancelada')
          JOIN compras_solicitacoes s ON s.id = si.solicitacao_id
          WHERE si.orcamento_item_id IN (${sql.join(orcItemIds.map(id => sql`${id}`), sql`, `)})
            AND ${scTipoFilter}
          GROUP BY si.orcamento_item_id, si.insumo_codigo
        `);
        for (const r of (compradoRows as any).rows ?? []) {
          const key = r.insumo_codigo ? `${r.orcamento_item_id}:${r.insumo_codigo}` : String(r.orcamento_item_id);
          orcItemToQtdComprada[key] = n(r.total_comprado);
        }
      }

      const tipoEfetivo = tipoEfetivoEarly;
      const isCotacaoMdo = isCotacaoMdoEarly;
      const itensComMeta = itens.map(it => {
        const orcId = it.solicitacaoItemId ? scItemToOrcItem[it.solicitacaoItemId] : undefined;
        const trace = it.solicitacaoItemId ? scItemToTraceability[it.solicitacaoItemId] : undefined;
        const insCode = trace?.insumoCodigo ?? "";
        const coef = trace?.coeficiente ?? 0;
        const isInsumoDeComposicao = !!(insCode && coef > 0);
        const metaFromSC = it.solicitacaoItemId ? (scItemToPrecoMeta[it.solicitacaoItemId] ?? 0) : 0;

        let metaUnitarioTotal: number;
        let metaUnitarioMat: number;
        let metaUnitarioMdo: number;
        let metaUnitarioEquip: number;

        if (isInsumoDeComposicao && tipoEfetivo === 'equipamento' && orcId) {
          const metaFromOrcEquip = orcItemToMetaEquip[orcId] ?? 0;
          metaUnitarioMat = 0;
          metaUnitarioMdo = 0;
          metaUnitarioEquip = metaFromOrcEquip;
          metaUnitarioTotal = metaFromOrcEquip;
        } else if (isInsumoDeComposicao && metaFromSC > 0 && orcId) {
          const custoTotalComp = orcItemToCustoTotal[orcId] ?? 0;
          const metaTotalComp = orcItemToMeta[orcId] ?? 0;
          const effectiveMetaRate = custoTotalComp > 0 ? (1 - metaTotalComp / custoTotalComp) : 0;
          const puComMeta = effectiveMetaRate > 0
            ? Math.round(metaFromSC * (1 - effectiveMetaRate) * 100) / 100
            : Math.round(metaFromSC * 100) / 100;

          if (tipoEfetivo === 'servico') {
            metaUnitarioMat = 0;
            metaUnitarioMdo = puComMeta;
            metaUnitarioEquip = 0;
          } else {
            metaUnitarioMat = puComMeta;
            metaUnitarioMdo = 0;
            metaUnitarioEquip = 0;
          }
          metaUnitarioTotal = puComMeta;
        } else {
          const metaFromOrcTotal = orcId ? (orcItemToMeta[orcId] ?? 0) : 0;
          const metaFromOrcMat = orcId ? (orcItemToMetaMat[orcId] ?? 0) : 0;
          const metaFromOrcMdo = orcId ? (orcItemToMetaMdo[orcId] ?? 0) : 0;
          const metaFromOrcEquip = orcId ? (orcItemToMetaEquip[orcId] ?? 0) : 0;
          metaUnitarioTotal = metaFromOrcTotal > 0 ? metaFromOrcTotal : metaFromSC;
          metaUnitarioMat = metaFromOrcMat;
          metaUnitarioMdo = metaFromOrcMdo;
          metaUnitarioEquip = metaFromOrcEquip;
        }

        const incluirAjud = it.solicitacaoItemId ? (scItemToIncluirAjudante[it.solicitacaoItemId] ?? true) : true;
        const metaMdoProf = it.solicitacaoItemId ? (scItemToMetaMdoProf[it.solicitacaoItemId] ?? 0) : 0;
        const metaMdoAjud = it.solicitacaoItemId ? (scItemToMetaMdoAjud[it.solicitacaoItemId] ?? 0) : 0;

        let metaUnitario: number;
        if (isInsumoDeComposicao && tipoEfetivo === 'equipamento' && orcId) {
          metaUnitario = metaUnitarioEquip;
        } else if (isInsumoDeComposicao && metaFromSC > 0 && orcId) {
          metaUnitario = metaUnitarioTotal;
        } else if (tipoEfetivo === 'pacote') {
          if (!incluirEquipamentosMapa && metaUnitarioEquip > 0) {
            metaUnitario = metaUnitarioTotal > 0 ? (metaUnitarioTotal - metaUnitarioEquip) : (metaUnitarioMat + metaUnitarioMdo);
          } else {
            metaUnitario = metaUnitarioTotal > 0 ? metaUnitarioTotal : (metaUnitarioMat + metaUnitarioMdo + metaUnitarioEquip);
          }
        } else if (tipoEfetivo === 'equipamento' && metaUnitarioEquip > 0) {
          metaUnitario = metaUnitarioEquip;
        } else if (tipoEfetivo === 'servico' && metaUnitarioMdo > 0) {
          if (!incluirAjud && metaMdoProf > 0) {
            const totalMdoCusto = metaMdoProf + metaMdoAjud;
            metaUnitario = totalMdoCusto > 0 ? metaUnitarioMdo * (metaMdoProf / totalMdoCusto) : metaUnitarioMdo;
          } else {
            metaUnitario = metaUnitarioMdo;
          }
        } else if (!isCotacaoMdo && tipoEfetivo !== 'equipamento' && metaUnitarioMat > 0) {
          metaUnitario = metaUnitarioMat;
        } else {
          metaUnitario = metaUnitarioTotal;
        }

        const eapPath = orcId ? (orcItemToPath[orcId] ?? "") : "";
        const scNumero = trace?.solicitacaoId ? (scMap[trace.solicitacaoId] ?? "") : "";
        const qtdEstaSC = n(it.quantidade);
        const metaQtd = (isInsumoDeComposicao && tipoEfetivo === 'equipamento' && orcId)
          ? (orcItemToQtdOrcada[orcId] ?? 0)
          : null;

        let qtdOrcada = 0;
        let qtdTotalSolicitada = 0;
        let qtdComprada = 0;
        let fonteVinculo: "item" | "insumo" | null = null;

        if (isInsumoDeComposicao && insCode && insumoOrcMap[insCode] !== undefined) {
          fonteVinculo = "insumo";
          qtdOrcada = insumoOrcMap[insCode];
          qtdTotalSolicitada = insumoSolicMap[insCode] ?? 0;
          qtdComprada = insumoCompMap[insCode] ?? 0;
        } else if (orcId) {
          fonteVinculo = "item";
          if (isInsumoDeComposicao) {
            qtdOrcada = (orcItemToQtdOrcada[orcId] ?? 0) * coef;
          } else {
            qtdOrcada = orcItemToQtdOrcada[orcId] ?? 0;
          }
          const compoundKey = insCode ? `${orcId}:${insCode}` : "";
          const simpleKey = String(orcId);
          qtdTotalSolicitada = (compoundKey && orcItemToQtdSolicitada[compoundKey] !== undefined)
            ? orcItemToQtdSolicitada[compoundKey]
            : (orcItemToQtdSolicitada[simpleKey] ?? 0);
          qtdComprada = (compoundKey && orcItemToQtdComprada[compoundKey] !== undefined)
            ? orcItemToQtdComprada[compoundKey]
            : (orcItemToQtdComprada[simpleKey] ?? 0);
        } else if (insCode && insumoOrcMap[insCode] !== undefined) {
          fonteVinculo = "insumo";
          qtdOrcada = insumoOrcMap[insCode];
          qtdTotalSolicitada = insumoSolicMap[insCode] ?? 0;
          qtdComprada = insumoCompMap[insCode] ?? 0;
        }

        const vinculado = fonteVinculo === "item" || fonteVinculo === "insumo";
        const consumido = Math.max(qtdTotalSolicitada, qtdComprada);
        const qtdSaldoRaw = vinculado ? qtdOrcada - consumido : -qtdEstaSC;
        const qtdSaldo = Math.round(qtdSaldoRaw * 1000) / 1000;
        const svcCode = it.solicitacaoItemId ? scItemToOrcServicoCodigo[it.solicitacaoItemId] : null;
        const composicaoInsumosList = svcCode ? (composicaoMap[svcCode] ?? []) : [];
        const compCode = svcCode ?? (trace?.composicaoCodigo ?? "");
        const compInfo = compCode ? svcCodeToCompInfo[compCode] : undefined;
        const parentEapDescricao = orcId ? (orcItemToDescricao[orcId] ?? "") : "";
        const parentEapCodigo = orcId ? (orcItemToEapCodigo[orcId] ?? trace?.eapCodigo ?? "") : (trace?.eapCodigo ?? "");
        // Rev. 2956 — item vinculado a uma linha de orçamento (orcId) NUNCA é "avulso";
        // sanitiza flag estagnado motivoSemVerba='avulso' (read-only).
        const avulsoStaleCot = (it as any).motivoSemVerba === "avulso" && orcId != null;
        return { ...it, metaUnitario, metaUnitarioTotal, metaUnitarioMat, metaUnitarioMdo, metaUnitarioEquip, metaQtd, eapPath, parentEapDescricao, parentEapCodigo, scNumero, eapCodigo: trace?.eapCodigo ?? "", origemEap: trace?.origemEap ?? false, insumoCodigo: insCode, qtdOrcada, qtdTotalSolicitada, qtdComprada, qtdEstaSC, qtdSaldo, fonteVinculo, semVerba: avulsoStaleCot ? false : ((it as any).semVerba ?? false), motivoSemVerba: avulsoStaleCot ? null : ((it as any).motivoSemVerba ?? null), incluirAjudante: incluirAjud, metaMdoProfissional: metaMdoProf, metaMdoAjudante: metaMdoAjud, composicaoInsumos: composicaoInsumosList, composicaoCodigo: compCode, composicaoDescricao: compInfo?.descricao ?? "", composicaoUnidade: compInfo?.unidade ?? "", composicaoQtdOrcada: compInfo?.qtdOrcada ?? 0, composicaoMetaTotal: compInfo?.metaTotal ?? 0, composicaoEapCodigo: compInfo?.eapCodigo ?? "" };
      });

      const respostaMap: Record<string, { precoUnitario: string; descontoPct: string; total: string; quantidade: string }> = {};
      for (const r of respostas) respostaMap[`${r.itemId}_${r.fornecedorId}`] = {
        precoUnitario: r.precoUnitario ?? "0", descontoPct: r.descontoPct ?? "0", total: r.total ?? "0",
        quantidade: r.quantidade ?? "0",
      };
      const totaisPorFornecedor: Record<number, number> = {};
      for (const p of participantes) {
        const totalItens = itensComMeta.reduce((acc, it) => {
          const r = respostaMap[`${it.id}_${p.fornecedorId}`];
          return acc + n(r?.total ?? 0);
        }, 0);
        const pFreteTipo = (p as any).freteTipo ?? "cif";
        const pValorFrete = pFreteTipo === "fob" ? n((p as any).valorFrete) : 0;
        totaisPorFornecedor[p.fornecedorId] = totalItens + pValorFrete;
      }
      // Quais itens da cotação já têm OC gerada (exceto canceladas)
      const itensJaEmOC: number[] = [];
      try {
        const ocsAtivas = await db.select({ id: comprasOrdens.id })
          .from(comprasOrdens)
          .where(and(eq(comprasOrdens.cotacaoId, input.cotacaoId), sql`${comprasOrdens.status} != 'cancelada'`));
        if (ocsAtivas.length > 0) {
          const ocItensAtivos = await db.select({ cotacaoItemId: comprasOrdensItens.cotacaoItemId })
            .from(comprasOrdensItens)
            .where(and(
              inArray(comprasOrdensItens.ordemId, ocsAtivas.map(o => o.id)),
              sql`${comprasOrdensItens.cotacaoItemId} is not null`
            ));
          for (const oi of ocItensAtivos) {
            if (oi.cotacaoItemId) itensJaEmOC.push(oi.cotacaoItemId);
          }
        }
      } catch (_) { /* coluna ainda não existe — retorna lista vazia */ }

      return { cotacao: cot, tipoEfetivo, incluirEquipamentos: incluirEquipamentosMapa, itens: itensComMeta, participantes: participantes.map(p => ({ ...p, fornecedor: forns.find(f => f.id === p.fornecedorId) })), respostaMap, totaisPorFornecedor, itensJaEmOC };
    }),

  adicionarFornecedorMapa: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cotAcc] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (cotAcc) await _assertCompanyAccess(ctx.user, cotAcc.companyId);
      await db.insert(comprasCotacaoFornecedores).values({ cotacaoId: input.cotacaoId, fornecedorId: input.fornecedorId }).onConflictDoNothing();
      return { ok: true };
    }),

  removerFornecedorMapa: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cotAcc] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (cotAcc) await _assertCompanyAccess(ctx.user, cotAcc.companyId);
      await db.delete(comprasCotacaoRespostas).where(and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId)));
      await db.delete(comprasCotacaoFornecedores).where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true };
    }),

  // Rev. 1640 — Atender pelo Estoque (Almoxarifado) como fornecedor virtual.
  // Insere uma "linha de fornecedor" sentinel (fornecedorId=0, isEstoque=true) e
  // pré-preenche as respostas com o preço médio do almoxarifado para cada item,
  // limitando a quantidade ao saldo disponível. Se o item não existir no almox
  // (sem match por nome/codigoInterno), insere com preço=0 e qty=0 — o usuário
  // verá esse item como "sem cobertura no estoque" no mapa.
  // Rev. 2466 — Query auxiliar pro modal "Selecionar do Estoque" (botão
  // "Atender pelo Estoque" no Mapa de Cotação). Retorna itens do almoxarifado
  // da empresa (filtra por obra: só central + obra atual), apenas com
  // saldo > 0, ordenado por nome. Frontend exibe checkboxes pro user marcar
  // o que deseja usar; IDs marcados são enviados pra `adicionarEstoqueAoMapa`
  // via `almoxItemIds` que restringe o auto-match a esses itens.
  listEstoqueDisponivel: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      // Rev. 2470 — Lista TODO o estoque disponível da empresa (Central
      // + TODAS as obras) com saldo > 0. O `obraId` do input é mantido
      // por retrocompat mas IGNORADO no filtro: o user reportou que itens
      // da Central / de outras obras não apareciam quando a cotação era
      // de uma obra X (filtro antigo: `OR(isNull(obraId), eq(obraId, X))`
      // descartava o resto). A UI tem busca por nome e pílula com a
      // origem (Central ou nome da obra), então mostrar tudo é seguro.
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { obras } = await import("../../drizzle/schema");
      const itens = await db.select({
        id: almoxarifadoItens.id,
        nome: almoxarifadoItens.nome,
        codigoInterno: almoxarifadoItens.codigoInterno,
        unidade: almoxarifadoItens.unidade,
        quantidadeAtual: almoxarifadoItens.quantidadeAtual,
        valorUnitario: almoxarifadoItens.valorUnitario,
        obraId: almoxarifadoItens.obraId,
        obraNome: obras.nome,
        categoria: almoxarifadoItens.categoria,
      }).from(almoxarifadoItens)
        .leftJoin(obras, eq(obras.id, almoxarifadoItens.obraId))
        .where(and(
          eq(almoxarifadoItens.companyId, input.companyId),
          eq(almoxarifadoItens.ativo, true),
        ));
      return itens
        .filter(i => parseFloat(String(i.quantidadeAtual) || "0") > 0)
        .map(i => ({
          id: i.id,
          nome: i.nome,
          codigoInterno: i.codigoInterno,
          unidade: i.unidade,
          quantidadeAtual: parseFloat(String(i.quantidadeAtual) || "0"),
          valorUnitario: parseFloat(String(i.valorUnitario) || "0"),
          obraId: i.obraId,
          obraNome: i.obraNome ?? null,
          categoria: i.categoria,
          isCentral: i.obraId == null,
        }))
        .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    }),

  adicionarEstoqueAoMapa: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      companyId: z.number(),
      obraId: z.number().optional(),
      // Rev. 2466 — IDs dos itens do almoxarifado escolhidos pelo user no
      // modal de seleção. Quando presente, o auto-match passa a restringir
      // aos itens dessa lista (em vez de varrer o almox inteiro). Mantém
      // retrocompat: ausente = comportamento original (varredura completa).
      almoxItemIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      // Rev. 2466 — Quando o cliente envia `almoxItemIds` presente mas
      // vazio, é bug (botão Confirmar deveria estar disabled). NÃO podemos
      // fazer fallback silencioso pra varredura total — viola a semântica
      // de "seleção explícita". Rejeita com BAD_REQUEST.
      if (input.almoxItemIds !== undefined && input.almoxItemIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione ao menos um item do estoque." });
      }
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });
      // Defesa extra: cotação deve pertencer à empresa do input (impede
      // que um usuário com acesso a 2 empresas force cotação alheia).
      if ((cot as any).companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cotação não pertence a esta empresa." });
      }
      const obraId = input.obraId ?? cot.obraId ?? null;

      // Já existe linha de Estoque?
      const existente = await db.select().from(comprasCotacaoFornecedores)
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), sql`COALESCE(${comprasCotacaoFornecedores.isEstoque}, false) = true`)).limit(1);
      if (existente.length > 0) return { ok: true, jaExistia: true };

      await db.insert(comprasCotacaoFornecedores).values({
        cotacaoId: input.cotacaoId,
        fornecedorId: 0,
        isEstoque: true,
        condicaoPagamento: "À vista (transferência interna)",
        formaPagamento: "transferencia_estoque",
        prazoEntregaDias: 0,
        numeroParcelas: 1,
        freteTipo: "cif",
        valorFrete: "0",
      } as any);

      // Pré-popula respostas com preço médio
      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));
      const scIds = itens.map(it => it.solicitacaoItemId).filter(Boolean) as number[];
      const scItens = scIds.length > 0
        ? await db.select().from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scIds))
        : [];
      // Carrega itens do almoxarifado da empresa (filtra por obra quando aplicável)
      const almoxConds = [eq(almoxarifadoItens.companyId, input.companyId), eq(almoxarifadoItens.ativo, true)];
      // Rev. 4015 — Item 3 do docx: quando o user ESCOLHE explicitamente os itens no modal
      // "Selecionar do Estoque" (que já lista TODA a empresa desde a Rev. 2470 — "mostrar
      // tudo é seguro"), a whitelist de `almoxItemIds` é confiável por si só; restringir
      // TAMBÉM por obra (central+destino) fazia o auto-match ignorar a escolha explícita do
      // user sempre que o saldo estivesse em OUTRA obra (ex.: SC-2026-0163, item só tinha
      // saldo na obra 90005 mas a cotação era da obra 90004) — resultava em qty=0/preço=0
      // silenciosamente, e mais tarde travava a OC com "sem correspondência"/"saldo
      // insuficiente". Só aplica o filtro de obra na varredura CEGA (sem seleção explícita).
      const temSelecaoExplicita = !!(input.almoxItemIds && input.almoxItemIds.length > 0);
      if (obraId && !temSelecaoExplicita) almoxConds.push(or(isNull(almoxarifadoItens.obraId), eq(almoxarifadoItens.obraId, obraId))!);
      if (temSelecaoExplicita) {
        almoxConds.push(inArray(almoxarifadoItens.id, input.almoxItemIds!));
      }
      const almox = await db.select().from(almoxarifadoItens).where(and(...almoxConds));
      const norm = (x: string|null|undefined) => (x ?? "").toLowerCase().trim().replace(/\s+/g," ");
      const byCodigo = new Map<string, typeof almox[0]>();
      const byNome = new Map<string, typeof almox[0]>();
      for (const a of almox) {
        if (a.codigoInterno) byCodigo.set(norm(a.codigoInterno), a);
        if (a.nome) byNome.set(norm(a.nome), a);
      }

      let totalEstoque = 0;
      for (const it of itens) {
        const sc = scItens.find(s => s.id === it.solicitacaoItemId);
        const candCodigo = (sc?.insumoCodigo ?? "").toString();
        let match = (candCodigo && byCodigo.get(norm(candCodigo))) || byNome.get(norm(it.descricao)) || null;
        if (!match) {
          // tenta match parcial por contém (apenas se descrição >= 4 chars)
          const d = norm(it.descricao);
          if (d.length >= 4) match = almox.find(a => norm(a.nome).includes(d) || d.includes(norm(a.nome))) ?? null;
        }
        const qtdPedida = n(it.quantidade);
        const saldo = match ? n(match.quantidadeAtual) : 0;
        const qty = Math.min(qtdPedida, saldo);
        const preco = match ? n(match.valorUnitario) : 0;
        const total = qty * preco;
        totalEstoque += total;
        await db.insert(comprasCotacaoRespostas).values({
          cotacaoId: input.cotacaoId,
          fornecedorId: 0,
          itemId: it.id,
          quantidade: String(qty),
          precoUnitario: String(preco),
          descontoPct: "0",
          total: String(total.toFixed(2)),
        } as any).onConflictDoUpdate({
          target: [comprasCotacaoRespostas.cotacaoId, comprasCotacaoRespostas.fornecedorId, comprasCotacaoRespostas.itemId],
          set: { quantidade: String(qty), precoUnitario: String(preco), descontoPct: "0", total: String(total.toFixed(2)) },
        });
      }

      await db.update(comprasCotacaoFornecedores).set({ totalOrcado: String(totalEstoque.toFixed(2)) } as any)
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, 0)));

      return { ok: true, totalEstoque, itens: itens.length };
    }),

  salvarRespostasLote: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      fornecedorId: z.number(),
      propostaId: z.number().optional(),
      prazoEntregaDias: z.number().nullable().optional(),
      condicaoPagamento: z.string().optional(),
      tipoPagamento: z.string().optional(),
      formaPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(),
      freteTipo: z.string().optional(),
      valorFrete: z.number().optional(),
      transportadora: z.string().optional(),
      moduloMedicao: z.enum(["medicao_mensal", "medicao_avanco", "medicao_etapa", "empreitada", "administracao"]).optional(),
      respostas: z.array(z.object({
        itemId: z.number(),
        precoUnitario: z.number(),
        descontoPct: z.number().optional(),
        quantidade: z.number().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cotAcc] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (cotAcc) await _assertCompanyAccess(ctx.user, cotAcc.companyId);
      const validItemIds = new Set(
        (await db.select({ id: comprasCotacoesItens.id }).from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId)))
          .map(r => r.id)
      );
      let totalForn = 0;
      for (const r of input.respostas) {
        if (!validItemIds.has(r.itemId)) continue;
        const desc = r.descontoPct ?? 0;
        let qty = r.quantidade ?? 0;
        const isPacoteChildZero = r.precoUnitario === 0 && qty === 0;
        if (qty <= 0 && !isPacoteChildZero) {
          const itRow = await db.select({ quantidade: comprasCotacoesItens.quantidade }).from(comprasCotacoesItens).where(eq(comprasCotacoesItens.id, r.itemId));
          qty = n(itRow[0]?.quantidade ?? 1);
        }
        const total = qty * r.precoUnitario * (1 - desc / 100);
        totalForn += total;
        await db.insert(comprasCotacaoRespostas).values({
          cotacaoId: input.cotacaoId, fornecedorId: input.fornecedorId, itemId: r.itemId,
          propostaId: input.propostaId ?? null,
          quantidade: String(qty), precoUnitario: String(r.precoUnitario), descontoPct: String(desc), total: String(total.toFixed(2)),
        }).onConflictDoUpdate({ target: [comprasCotacaoRespostas.cotacaoId, comprasCotacaoRespostas.fornecedorId, comprasCotacaoRespostas.itemId], set: {
          quantidade: String(qty), precoUnitario: String(r.precoUnitario), descontoPct: String(desc), total: String(total.toFixed(2)),
          propostaId: input.propostaId ?? null,
        }});
      }
      const valorFrete = n(input.valorFrete);
      const isFob = (input.freteTipo ?? "cif") === "fob";
      const totalComFrete = totalForn + (isFob ? valorFrete : 0);

      await db.update(comprasCotacaoFornecedores).set({
        totalOrcado: String(totalComFrete.toFixed(2)),
        prazoEntregaDias: input.prazoEntregaDias ?? null,
        condicaoPagamento: input.condicaoPagamento ?? null,
        tipoPagamento: input.tipoPagamento ?? null,
        formaPagamento: input.formaPagamento ?? null,
        numeroParcelas: input.numeroParcelas ?? null,
        freteTipo: input.freteTipo ?? "cif",
        valorFrete: String(valorFrete.toFixed(2)),
        transportadora: input.transportadora ?? null,
        moduloMedicao: input.moduloMedicao ?? null,
      } as any)
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true, total: totalComFrete };
    }),

  listarPropostasFornecedor: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const propostas = await db.select().from(comprasCotacaoPropostas)
        .where(and(
          eq(comprasCotacaoPropostas.cotacaoId, input.cotacaoId),
          eq(comprasCotacaoPropostas.fornecedorId, input.fornecedorId),
          eq(comprasCotacaoPropostas.companyId, input.companyId),
        ))
        .orderBy(desc(comprasCotacaoPropostas.criadoEm));
      return propostas;
    }),

  excluirProposta: protectedProcedure
    .input(z.object({ propostaId: z.number(), cotacaoId: z.number(), fornecedorId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [proposta] = await db.select().from(comprasCotacaoPropostas)
        .where(and(
          eq(comprasCotacaoPropostas.id, input.propostaId),
          eq(comprasCotacaoPropostas.cotacaoId, input.cotacaoId),
          eq(comprasCotacaoPropostas.fornecedorId, input.fornecedorId),
          eq(comprasCotacaoPropostas.companyId, input.companyId),
        ));
      if (!proposta) throw new Error("Proposta não encontrada ou acesso negado");
      await db.delete(comprasCotacaoRespostas)
        .where(and(
          eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId),
          eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId),
          eq(comprasCotacaoRespostas.propostaId, input.propostaId),
        ));
      await db.update(comprasCotacaoPropostas)
        .set({ status: "excluida" } as any)
        .where(eq(comprasCotacaoPropostas.id, input.propostaId));
      const remaining = await db.select({ total: comprasCotacaoRespostas.total }).from(comprasCotacaoRespostas)
        .where(and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId)));
      const newTotal = remaining.reduce((acc, r) => acc + n(r.total), 0);
      await db.update(comprasCotacaoFornecedores)
        .set({ totalOrcado: String(newTotal.toFixed(2)) } as any)
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true };
    }),

  salvarCondicoesComerciais: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      fornecedorId: z.number(),
      companyId: z.number(),
      formaPagamento: z.string().optional(),
      tipoPagamento: z.string().optional(),
      condicaoPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(),
      prazoEntregaDias: z.number().optional(),
      observacoes: z.string().optional(),
      moduloMedicao: z.string().optional(),
      // Rev. 4019 — cartão FC escolhido (sugerido ou sobreposto pelo usuário) quando
      // formaPagamento="cartao"; guardado já na Cotação p/ herdar na OC gerada e permitir
      // o match automático item-da-fatura↔OC na conciliação do cartão.
      cartaoId: z.number().nullable().optional(),
      // Rev. 4073 — marca que o comprador optou por fugir do ciclo/regra cadastrada do fornecedor.
      excecaoManual: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [cot] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot || cot.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Cotação não pertence à empresa" });
      const updateData: any = {};
      if (input.formaPagamento !== undefined) updateData.formaPagamento = input.formaPagamento || null;
      if (input.tipoPagamento !== undefined) updateData.tipoPagamento = input.tipoPagamento || null;
      if (input.condicaoPagamento !== undefined) updateData.condicaoPagamento = input.condicaoPagamento || null;
      if (input.numeroParcelas !== undefined) updateData.numeroParcelas = input.numeroParcelas;
      if (input.prazoEntregaDias !== undefined) updateData.prazoEntregaDias = input.prazoEntregaDias;
      if (input.observacoes !== undefined) updateData.observacoes = input.observacoes;
      if (input.moduloMedicao !== undefined) updateData.moduloMedicao = input.moduloMedicao || null;
      if (input.cartaoId !== undefined) updateData.cartaoId = input.cartaoId;
      if (input.excecaoManual !== undefined) updateData.excecaoManual = input.excecaoManual;
      if (Object.keys(updateData).length > 0) {
        if (input.fornecedorId === 0) {
          await db.update(comprasCotacoes)
            .set(updateData)
            .where(eq(comprasCotacoes.id, input.cotacaoId));
        } else {
          await db.update(comprasCotacaoFornecedores)
            .set(updateData)
            .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
        }
      }
      return { ok: true };
    }),

  salvarAnexoFornecedor: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), fornecedorId: z.number(), arquivoUrl: z.string(), arquivoNome: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cotAcc] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (cotAcc) await _assertCompanyAccess(ctx.user, cotAcc.companyId);
      await db.update(comprasCotacaoFornecedores)
        .set({ arquivoUrl: input.arquivoUrl, arquivoNome: input.arquivoNome })
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true };
    }),

  uploadAnexoFornecedor: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      fornecedorId: z.number(),
      companyId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const ext = input.fileName.split('.').pop() || 'pdf';
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `cotacoes/${input.companyId}/${input.cotacaoId}/forn-${input.fornecedorId}-${randomSuffix}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await db.update(comprasCotacaoFornecedores)
        .set({ arquivoUrl: url, arquivoNome: input.fileName })
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      return { ok: true, url };
    }),

  extrairCotacaoIA: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      fornecedorId: z.number(),
      companyId: z.number(),
      // Rev. 2800 — leitura por IA passou a aceitar MÚLTIPLOS arquivos numa só
      // chamada (várias fotos/páginas da mesma cotação). `fileBase64`/`fileName`/
      // `mimeType` continuam aceitos (1 arquivo, retrocompat); `arquivos` (array)
      // tem prioridade quando enviado.
      fileBase64: z.string().max(15_000_000).optional(),
      fileName: z.string().optional(),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/jpg"]).optional(),
      arquivos: z.array(z.object({
        fileBase64: z.string().max(15_000_000),
        fileName: z.string(),
        mimeType: z.enum(["application/pdf", "image/jpeg", "image/jpg"]),
      })).min(1).max(10).optional(),
      tipoProposta: z.enum(["complemento", "revisao"]).default("complemento"),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      await assertAiModuleEnabled(input.companyId, "compras");
      // Rev. 2800 — normaliza p/ lista de arquivos (array tem prioridade).
      const arquivos = (input.arquivos && input.arquivos.length > 0)
        ? input.arquivos
        : (input.fileBase64 && input.fileName && input.mimeType
            ? [{ fileBase64: input.fileBase64, fileName: input.fileName, mimeType: input.mimeType }]
            : []);
      if (arquivos.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum arquivo enviado para leitura" });
      const fileNameRef = arquivos.length === 1 ? arquivos[0].fileName : `${arquivos.length} arquivos (${arquivos[0].fileName} …)`;

      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes)
        .where(and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId)));
      if (!cot) throw new TRPCError({ code: "FORBIDDEN", message: "Cotação não encontrada ou sem permissão" });

      const [forn] = await db.select({ id: comprasCotacaoFornecedores.id }).from(comprasCotacaoFornecedores)
        .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      if (!forn) throw new TRPCError({ code: "BAD_REQUEST", message: "Fornecedor não é participante desta cotação" });

      const itens = await db.select().from(comprasCotacoesItens)
        .where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));

      if (itens.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum item na cotação" });

      const existingRespostas = await db.select().from(comprasCotacaoRespostas)
        .where(and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId)));

      const jobId = `ia-${input.cotacaoId}-${input.fornecedorId}-${Date.now()}`;
      const itensRef = itens.map(it => {
        const existing = existingRespostas.find(r => r.itemId === it.id);
        return {
          id: it.id,
          descricao: it.descricao,
          unidade: it.unidade,
          quantidade: it.quantidade,
          jaPreenchido: existing ? { precoUnitario: n(existing.precoUnitario), quantidade: n(existing.quantidade) } : null,
        };
      });

      iaExtractionJobs.set(jobId, { status: "processing", startedAt: Date.now() });

      (async () => {
        try {
          const systemPrompt = `Você é um assistente especializado em compras de construção civil. Sua tarefa é extrair itens, quantidades e preços unitários de documentos de cotação/orçamento de fornecedores.

REGRAS CRÍTICAS:
- Extraia TODOS os itens do documento com: descrição, quantidade, unidade, preço unitário e preço total
- Valores devem ser numéricos (sem R$, sem pontos de milhar - use ponto como separador decimal)
- Se não conseguir identificar um campo, use null
- Retorne JSON válido, sem texto adicional

INTELIGÊNCIA DE MATCHING:
- Vários itens da SC podem ser o MESMO produto, divididos por atividade/EAP (ex: mesmo material aparece 3x com quantidades diferentes)
- Um item do fornecedor pode corresponder a MÚLTIPLOS itens da SC se forem o mesmo produto
- Se o fornecedor cota "Bacia acoplada" e a SC tem 3 linhas de "Bacia acoplada" com quantidades diferentes, faça match com TODOS eles
- Use matchItemIds (array) quando um item do fornecedor cobre múltiplos itens da SC`;

          const jaPreenchidosInfo = itensRef.filter(it => it.jaPreenchido).length > 0
            ? `\n\nITENS JÁ PREENCHIDOS POR PROPOSTAS ANTERIORES (para contexto):\n${itensRef.filter(it => it.jaPreenchido).map(it => `- [ID:${it.id}] ${it.descricao}: R$ ${it.jaPreenchido!.precoUnitario.toFixed(2)} x ${it.jaPreenchido!.quantidade}`).join("\n")}`
            : "";

          const prompt = `Analise ${arquivos.length > 1 ? `estes ${arquivos.length} documentos/imagens (são páginas/partes da MESMA cotação do mesmo fornecedor — considere TODOS em conjunto, sem duplicar itens repetidos entre páginas)` : "este documento"} de cotação/orçamento de fornecedor e extraia todos os itens.

ITENS DA SOLICITAÇÃO DE COMPRA (para referência de matching):
${itensRef.map((it, i) => `${i + 1}. [ID:${it.id}] ${it.descricao} | Qtd solicitada: ${it.quantidade} ${it.unidade || "un"}${it.jaPreenchido ? " (JÁ PREENCHIDO)" : ""}`).join("\n")}
${jaPreenchidosInfo}

INSTRUÇÕES:
1. Extraia TODOS os itens do documento do fornecedor
2. Para cada item extraído, faça matching com os itens da SC por semelhança de descrição
3. IMPORTANTE: Se um item do fornecedor corresponde a vários itens da SC (mesmo produto em linhas diferentes), use matchItemIds (array com todos os IDs)
4. Se o item do fornecedor corresponde a apenas um item da SC, use matchItemId (singular)
5. Compare a quantidade cotada pelo fornecedor com a quantidade total solicitada na SC
6. Extraia condição de pagamento, prazo de entrega e forma de pagamento se mencionados
7. FORMA DE PAGAMENTO: identifique como o pagamento será feito (boleto, pix, transferencia, cheque, cartao, deposito). Procure menções a "boleto", "PIX", "transferência bancária", "depósito", etc.
8. PARCELAMENTO: identifique o tipo de parcelamento. Classifique como um destes valores: a_vista, 7ddl, 14ddl, 21ddl, 28ddl, 30ddl, 30_60, 30_60_90, entrada_30, entrada_30_60, medicao. Se não corresponder a nenhum, use "personalizado".

Retorne APENAS um JSON válido neste formato:
{
  "itensExtraidos": [
    {
      "descricaoFornecedor": "descrição como aparece no documento",
      "quantidade": 10,
      "unidade": "un",
      "precoUnitario": 25.50,
      "precoTotal": 255.00,
      "matchItemId": 123,
      "matchItemIds": [123, 456, 789],
      "matchConfianca": "alta",
      "matchDescricaoSC": "descrição do item da SC que deu match"
    }
  ],
  "condicaoPagamento": "30 DDL" ou null,
  "formaPagamento": "boleto" ou "pix" ou "transferencia" ou "cheque" ou "cartao" ou "deposito" ou null,
  "tipoPagamento": "30ddl" ou "30_60" ou "a_vista" etc. ou null,
  "prazoEntrega": "15 dias" ou null,
  "observacoes": "informações relevantes extraídas" ou null
}`;

          const resultText = await invokeAnthropicVision({
            prompt,
            files: arquivos.map(a => ({ base64: a.fileBase64, mimeType: a.mimeType === "image/jpg" ? "image/jpeg" : a.mimeType })),
            systemPrompt,
            maxTokens: 4096,
          });

          console.log("[extrairCotacaoIA] Resultado bruto (500 chars):", resultText.substring(0, 500));

          let jsonStr = resultText.trim();
          const jsonMatch2 = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch2) jsonStr = jsonMatch2[1].trim();
          const startIdx = jsonStr.indexOf("{");
          const endIdx = jsonStr.lastIndexOf("}");
          if (startIdx >= 0 && endIdx > startIdx) jsonStr = jsonStr.substring(startIdx, endIdx + 1);

          const parsed = JSON.parse(jsonStr);
          console.log("[extrairCotacaoIA] Parsed OK. itens:", (parsed.itensExtraidos ?? parsed.itens ?? []).length);

          const rawItens = (parsed.itensExtraidos ?? parsed.itens ?? []);
          const itensExtraidos: any[] = [];

          for (const item of rawItens) {
            const descForn = String(item.descricaoFornecedor ?? item.descricao ?? "");
            const qtdForn = parseFloat(item.quantidade) || null;
            const unidade = item.unidade || null;
            const precoUnit = parseFloat(item.precoUnitario ?? item.preco_unitario) || null;
            const precoTotal = parseFloat(item.precoTotal ?? item.preco_total) || null;
            const confianca = item.matchConfianca ?? item.match_confianca ?? null;
            const descSC = item.matchDescricaoSC ?? item.match_descricao_sc ?? null;

            const multiIds: number[] = item.matchItemIds ?? item.match_item_ids ?? [];
            const singleId = item.matchItemId ?? item.match_item_id ?? null;
            const allMatchIds = multiIds.length > 0 ? multiIds : (singleId ? [singleId] : []);

            if (allMatchIds.length > 1 && precoUnit != null) {
              const totalQtdSC = allMatchIds.reduce((acc: number, id: number) => {
                const ref = itensRef.find(r => r.id === id);
                return acc + n(ref?.quantidade);
              }, 0);

              for (const matchId of allMatchIds) {
                const ref = itensRef.find(r => r.id === matchId);
                const qtdItem = n(ref?.quantidade);
                const proporcao = totalQtdSC > 0 ? qtdItem / totalQtdSC : 1 / allMatchIds.length;
                const qtdDistribuida = qtdForn ? Math.round(qtdForn * proporcao * 100) / 100 : qtdItem;

                itensExtraidos.push({
                  descricaoFornecedor: descForn,
                  quantidade: qtdDistribuida,
                  quantidadeSC: qtdItem,
                  unidade,
                  precoUnitario: precoUnit,
                  precoTotal: precoUnit * qtdDistribuida,
                  matchItemId: matchId,
                  matchConfianca: confianca,
                  matchDescricaoSC: ref?.descricao ?? descSC,
                  distribuido: true,
                  grupoDistribuicao: allMatchIds,
                  quantidadeFornecedorOriginal: qtdForn,
                });
              }
            } else {
              const matchId = allMatchIds[0] ?? null;
              const ref = matchId ? itensRef.find(r => r.id === matchId) : null;
              const qtdSC = ref ? n(ref.quantidade) : null;

              itensExtraidos.push({
                descricaoFornecedor: descForn,
                quantidade: qtdForn,
                quantidadeSC: qtdSC,
                unidade,
                precoUnitario: precoUnit,
                precoTotal,
                matchItemId: matchId,
                matchConfianca: confianca,
                matchDescricaoSC: ref?.descricao ?? descSC,
                distribuido: false,
                grupoDistribuicao: null,
                quantidadeFornecedorOriginal: qtdForn,
              });
            }
          }

          const matchedIds = new Set(itensExtraidos.filter((i: any) => i.matchItemId).map((i: any) => i.matchItemId));
          const itensSemMatch = itensRef.filter(it => !matchedIds.has(it.id));
          const itensExtras = itensExtraidos.filter((i: any) => !i.matchItemId);

          const alertas: any[] = [];
          for (const item of itensExtraidos) {
            if (!item.matchItemId || item.quantidadeSC == null || item.quantidade == null) continue;
            const diff = item.quantidade - item.quantidadeSC;
            if (Math.abs(diff) > 0.01) {
              const pctCobertura = (item.quantidade / item.quantidadeSC) * 100;
              alertas.push({
                matchItemId: item.matchItemId,
                descricao: item.matchDescricaoSC || item.descricaoFornecedor,
                tipo: diff < 0 ? "parcial" : "excedente",
                qtdCotada: item.quantidade,
                qtdSolicitada: item.quantidadeSC,
                diferenca: Math.abs(diff),
                pctCobertura: Math.round(pctCobertura * 10) / 10,
              });
            }
          }

          if (itensSemMatch.length > 0) {
            for (const it of itensSemMatch) {
              alertas.push({
                matchItemId: it.id,
                descricao: it.descricao,
                tipo: "sem_cotacao",
                qtdCotada: 0,
                qtdSolicitada: n(it.quantidade),
                diferenca: n(it.quantidade),
                pctCobertura: 0,
              });
            }
          }

          const [proposta] = await db.insert(comprasCotacaoPropostas).values({
            cotacaoId: input.cotacaoId,
            fornecedorId: input.fornecedorId,
            companyId: input.companyId,
            fileName: fileNameRef,
            tipo: input.tipoProposta,
            status: "ativa",
            itensExtraidos: itensExtraidos.length,
            itensComMatch: matchedIds.size,
            condicaoPagamento: parsed.condicaoPagamento ?? null,
            prazoEntrega: parsed.prazoEntrega ?? null,
            observacoesIa: parsed.observacoes ?? null,
          }).returning({ id: comprasCotacaoPropostas.id });

          if (input.tipoProposta === "revisao") {
            const antigas = await db.select().from(comprasCotacaoPropostas)
              .where(and(
                eq(comprasCotacaoPropostas.cotacaoId, input.cotacaoId),
                eq(comprasCotacaoPropostas.fornecedorId, input.fornecedorId),
                eq(comprasCotacaoPropostas.status, "ativa"),
              ));
            for (const ant of antigas) {
              if (ant.id === proposta.id) continue;
              await db.update(comprasCotacaoPropostas)
                .set({ status: "substituida", substituiPropostaId: proposta.id } as any)
                .where(eq(comprasCotacaoPropostas.id, ant.id));
              await db.delete(comprasCotacaoRespostas)
                .where(and(
                  eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId),
                  eq(comprasCotacaoRespostas.fornecedorId, input.fornecedorId),
                  eq(comprasCotacaoRespostas.propostaId, ant.id),
                ));
            }
          }

          const iaFormaPag = parsed.formaPagamento ?? null;
          const iaTipoPag = parsed.tipoPagamento ?? null;
          if (iaFormaPag || iaTipoPag || parsed.condicaoPagamento) {
            const updateCond: any = {};
            if (iaFormaPag) updateCond.formaPagamento = iaFormaPag;
            if (iaTipoPag) updateCond.tipoPagamento = iaTipoPag;
            if (parsed.condicaoPagamento) updateCond.condicaoPagamento = parsed.condicaoPagamento;
            if (iaTipoPag) {
              const tipoInfo = getTipoPagamentoInfo(iaTipoPag);
              if (tipoInfo) updateCond.numeroParcelas = tipoInfo.parcelas;
            }
            await db.update(comprasCotacaoFornecedores)
              .set(updateCond)
              .where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
          }

          iaExtractionJobs.set(jobId, {
            status: "done",
            startedAt: Date.now(),
            result: {
              propostaId: proposta.id,
              itensExtraidos,
              itensSemMatch,
              itensExtras,
              alertas,
              condicaoPagamento: parsed.condicaoPagamento ?? null,
              formaPagamento: iaFormaPag,
              tipoPagamento: iaTipoPag,
              prazoEntrega: parsed.prazoEntrega ?? null,
              observacoes: parsed.observacoes ?? null,
              totalItensExtraidos: itensExtraidos.length,
              totalMatches: matchedIds.size,
              totalSemMatch: itensSemMatch.length,
              totalExtras: itensExtras.length,
              totalAlertas: alertas.length,
              tipoProposta: input.tipoProposta,
              fileName: fileNameRef,
            },
          });
          console.log("[extrairCotacaoIA] Job", jobId, "concluído. Proposta", proposta.id, "tipo:", input.tipoProposta, "matches:", matchedIds.size, "alertas:", alertas.length);
        } catch (err: any) {
          console.error("[extrairCotacaoIA] Erro no job:", err.message);
          iaExtractionJobs.set(jobId, { status: "error", startedAt: Date.now(), error: err.message || "Erro desconhecido" });
        }
      })();

      return { jobId };
    }),

  getIaExtractionResult: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = iaExtractionJobs.get(input.jobId);
      if (!job) return { status: "not_found" as const };
      if (job.status === "processing") return { status: "processing" as const };
      if (job.status === "error") {
        iaExtractionJobs.delete(input.jobId);
        return { status: "error" as const, error: job.error };
      }
      const result = job.result;
      iaExtractionJobs.delete(input.jobId);
      return { status: "done" as const, ...result };
    }),

  getSaldosRealocacaoGeral: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      await _autoSanearReservas(input.companyId);

      // ── 1. DI-08: pega o latest orcamento por obra ─────────────────────
      // FIX: filtrar isNull(deletedAt) e padronizar ordering por createdAt (igual a listarEconomiasOC).
      const orcs = await db.select({ id: orcamentos.id, obraId: orcamentos.obraId })
        .from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          isNull(orcamentos.deletedAt),
          input.obraId ? eq(orcamentos.obraId, input.obraId) : undefined,
        ))
        .orderBy(desc(orcamentos.createdAt), desc(orcamentos.id));

      // latest per obra (ignora orçamentos sem obraId)
      const latestPerObra = new Map<number, number>();
      for (const o of orcs) {
        if (o.obraId && !latestPerObra.has(o.obraId)) latestPerObra.set(o.obraId, o.id);
      }
      const latestOrcIds = [...latestPerObra.values()];

      let di08Rows: { orcamentoId: number; valorAbsoluto: string | null }[] = [];
      if (latestOrcIds.length > 0) {
        di08Rows = await db.select({ orcamentoId: orcamentoBdi.orcamentoId, valorAbsoluto: orcamentoBdi.valorAbsoluto })
          .from(orcamentoBdi)
          .where(and(inArray(orcamentoBdi.orcamentoId, latestOrcIds), eq(orcamentoBdi.codigo, "DI-08")));
      }
      const di08Total = di08Rows.reduce((s, r) => s + n(r.valorAbsoluto), 0);

      // ── débitos de risco ───────────────────────────────────────────────
      // FIX CRÍTICO: o cálculo anterior filtrava por `orcamentoId IN latestOrcIds`,
      // mas a tela "Realocações" (listarDebitosRisco) mostra TODOS os débitos da
      // empresa/obra. Quando um débito foi feito contra uma versão antiga do
      // orçamento (revisão), `Utilizado` aparecia R$ 0 enquanto o histórico
      // mostrava débitos reais. Agora alinhamos: somamos TODOS os débitos
      // por companyId (+ obraId quando filtrado), espelhando exatamente o
      // total mostrado em listarDebitosRisco.
      const debConds: any[] = [eq(comprasRiscoDebitos.companyId, input.companyId)];
      if (input.obraId) debConds.push(eq(comprasRiscoDebitos.obraId, input.obraId));
      const allDebitos = await db.select({ valor: comprasRiscoDebitos.valor })
        .from(comprasRiscoDebitos)
        .where(and(...debConds));
      const di08Usado = allDebitos.reduce((s, r) => s + n(r.valor), 0);
      const di08Disponivel = Math.max(0, di08Total - di08Usado);

      // ── 2. Sobras das compras: comparação item-a-item (meta × qty vs comprado) ─
      // FIX: removido "aguardando_aprovacao_extra" — OCs nesse estado ainda não
      // foram efetivamente aprovadas e geravam economia falsa.
      const ocsConds: any[] = [
        eq(comprasOrdens.companyId, input.companyId),
        inArray(comprasOrdens.status as any, ["aprovada", "recebida", "parcialmente_recebida"]),
      ];
      if (input.obraId) ocsConds.push(eq(comprasOrdens.obraId, input.obraId));
      const ocs = await db.select({ id: comprasOrdens.id, obraId: comprasOrdens.obraId }).from(comprasOrdens).where(and(...ocsConds));

      let totalSobras = 0;
      if (ocs.length > 0) {
        const ocItens = await db.select().from(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocs.map(o => o.id)));
        const scItemIds = ocItens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
        let scItens: { id: number; orcamentoItemId: number | null; precoMeta: string | null; insumoCodigo: string | null; solicitacaoId: number }[] = [];
        if (scItemIds.length > 0) {
          scItens = await db.select({
            id: comprasSolicitacoesItens.id,
            orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
            precoMeta: comprasSolicitacoesItens.precoMeta,
            insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
            solicitacaoId: comprasSolicitacoesItens.solicitacaoId,
          }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
        }
        const orcIds = scItens.map(s => s.orcamentoItemId).filter(Boolean) as number[];
        let metas: { id: number; metaUnitTotal: string | null; unidade: string | null }[] = [];
        if (orcIds.length > 0) {
          metas = await db.select({ id: orcamentoItens.id, metaUnitTotal: orcamentoItens.metaUnitTotal, unidade: orcamentoItens.unidade })
            .from(orcamentoItens).where(inArray(orcamentoItens.id, orcIds));
        }
        const scToOrc: Record<number, number> = {};
        const scToPrecoMeta: Record<number, number> = {};
        const scToInsumoCodigo: Record<number, string> = {};
        for (const s of scItens) {
          if (s.orcamentoItemId) scToOrc[s.id] = s.orcamentoItemId;
          if (n(s.precoMeta) > 0) scToPrecoMeta[s.id] = n(s.precoMeta);
          if (s.insumoCodigo) scToInsumoCodigo[s.id] = s.insumoCodigo;
        }
        const orcToMetaUnit: Record<number, number> = {};
        const orcToUnidade: Record<number, string> = {};
        for (const m of metas) {
          orcToMetaUnit[m.id] = n(m.metaUnitTotal);
          if (m.unidade) orcToUnidade[m.id] = String(m.unidade).toLowerCase().trim();
        }
        // Contagem: quantos itens de SC apontam para o mesmo orcamento_item_id?
        // Se >1 → metaUnitTotal NÃO representa preço unitário do insumo (é verba agregada)
        const orcToScCount: Record<number, number> = {};
        for (const s of scItens) {
          if (s.orcamentoItemId) orcToScCount[s.orcamentoItemId] = (orcToScCount[s.orcamentoItemId] ?? 0) + 1;
        }
        // Unidades agregadas — não usar metaUnitTotal como preço unitário do insumo
        const UNID_AGREGADA = new Set(["vb", "verba", "gl", "global", "cj", "conjunto", "und. global"]);

        const needInsumoLookup = scItens.filter(s => n(s.precoMeta) <= 0 && s.insumoCodigo);
        const insumoPricePerObra: Record<number, Record<string, number>> = {};
        if (needInsumoLookup.length > 0) {
          const obraIds = [...new Set(ocs.map(o => o.obraId).filter(Boolean) as number[])];
          for (const obraId of obraIds) {
            const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
              .from(orcamentos)
              .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, obraId), isNull(orcamentos.deletedAt)))
              .orderBy(desc(orcamentos.createdAt)).limit(1);
            if (!orc) continue;
            const orcItems = await db.select({ servicoCodigo: orcamentoItens.servicoCodigo })
              .from(orcamentoItens).where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));
            const svcCods = [...new Set(orcItems.filter(it => it.servicoCodigo).map(it => it.servicoCodigo!))];
            if (!svcCods.length) continue;
            const allInsumos = await db.select({
              insumoCodigo: composicaoInsumos.insumoCodigo,
              precoUnitario: composicaoInsumos.precoUnitario,
              alocacaoMat: composicaoInsumos.alocacaoMat,
              alocacaoMdo: composicaoInsumos.alocacaoMdo,
            }).from(composicaoInsumos)
              .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCods)));
            const matOnly = allInsumos.filter(i => n(i.alocacaoMat) > 0);
            const obraMap: Record<string, number> = {};
            for (const ins of matOnly) {
              if (ins.insumoCodigo && n(ins.precoUnitario) > 0) obraMap[ins.insumoCodigo] = n(ins.precoUnitario);
            }
            insumoPricePerObra[obraId] = obraMap;
          }
        }

        const ocToObra: Record<number, number> = {};
        for (const oc of ocs) if (oc.obraId) ocToObra[oc.id] = oc.obraId;

        const ocTotalComprado: Record<number, number> = {};
        const ocTotalMeta: Record<number, number> = {};
        for (const it of ocItens) {
          const ocId = it.ordemId;
          if (!it.solicitacaoItemId) continue;
          // PRIORIDADE 1: precoMeta da própria SC (definido pelo solicitante) — mais confiável
          let metaUnit = scToPrecoMeta[it.solicitacaoItemId] ?? 0;
          // PRIORIDADE 2: lookup pelo insumo_codigo na composição (preço real do insumo)
          if (metaUnit === 0) {
            const ic = scToInsumoCodigo[it.solicitacaoItemId];
            const obraId = ocToObra[ocId];
            if (ic && obraId) metaUnit = insumoPricePerObra[obraId]?.[ic] ?? 0;
          }
          // PRIORIDADE 3: metaUnitTotal do orçamento — APENAS se NÃO for verba agregada
          if (metaUnit === 0) {
            const orcId = scToOrc[it.solicitacaoItemId];
            if (orcId) {
              const unid = orcToUnidade[orcId] ?? "";
              const isAgregada = UNID_AGREGADA.has(unid);
              const compartilhado = (orcToScCount[orcId] ?? 0) > 1;
              if (!isAgregada && !compartilhado) {
                metaUnit = orcToMetaUnit[orcId] ?? 0;
              }
            }
          }
          if (metaUnit === 0) continue;
          const qty = n(it.quantidade);
          ocTotalComprado[ocId] = (ocTotalComprado[ocId] ?? 0) + n(it.precoUnitario) * qty;
          ocTotalMeta[ocId]     = (ocTotalMeta[ocId]     ?? 0) + metaUnit * qty;
        }
        for (const ocId of Object.keys(ocTotalMeta)) {
          const sobra = (ocTotalMeta[+ocId] ?? 0) - (ocTotalComprado[+ocId] ?? 0);
          if (sobra > 0.01) totalSobras += sobra;
        }
      }

      // ── FIX double-spending: descontar sobras já consumidas via confirmarRealocacaoSobras ──
      // Cada chamada de confirmarRealocacaoSobras grava em budget_reallocations com
      // origemEapItemNome começando com "Economia OC:". Sem este desconto, a mesma
      // economia poderia ser usada para cobrir várias cotações deficitárias.
      const realocConds: any[] = [
        eq(budgetReallocations.companyId, input.companyId),
        sql`${budgetReallocations.origemEapItemNome} LIKE 'Economia OC:%'`,
      ];
      if (input.obraId) realocConds.push(eq(budgetReallocations.obraId, input.obraId));
      const realocConsumidas = await db.select({ valor: budgetReallocations.valorRealocado })
        .from(budgetReallocations).where(and(...realocConds));
      const sobrasJaConsumidas = realocConsumidas.reduce((s, r) => s + n(r.valor), 0);
      const sobrasLiquidas = Math.max(0, totalSobras - sobrasJaConsumidas);

      // ── Rev. 1386 — Saldo reservado por cotações deficitárias em aberto ──
      const reservasConds: any[] = [
        eq(comprasReservasSaldo.companyId, input.companyId),
        eq(comprasReservasSaldo.status, "ativa"),
      ];
      if (input.obraId) reservasConds.push(eq(comprasReservasSaldo.obraId, input.obraId));
      const reservasAtivas = await db.select({
        di08: comprasReservasSaldo.valorDi08Reservado,
        eco:  comprasReservasSaldo.valorEconomiaReservada,
      }).from(comprasReservasSaldo).where(and(...reservasConds));
      const di08Reservado = reservasAtivas.reduce((s, r) => s + n(r.di08), 0);
      const sobrasReservadas = reservasAtivas.reduce((s, r) => s + n(r.eco), 0);
      const di08DisponivelReal = Math.max(0, di08Disponivel - di08Reservado);
      const sobrasDisponivelReal = Math.max(0, sobrasLiquidas - sobrasReservadas);

      return {
        di08Total,
        di08Usado,
        di08Disponivel,
        di08Reservado,
        di08DisponivelReal,
        totalSobras: sobrasLiquidas,
        totalSobrasBruto: totalSobras,
        sobrasJaConsumidas,
        sobrasReservadas,
        sobrasDisponivelReal,
        totalReservado: di08Reservado + sobrasReservadas,
        totalDisponivel: di08Disponivel + sobrasLiquidas,
        totalDisponivelReal: di08DisponivelReal + sobrasDisponivelReal,
        totalReservasAtivas: reservasAtivas.length,
      };
    }),

  buscarSaldosRealocacao: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional(), cotacaoId: z.number().optional(), deficit: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // ── 1. RESERVA DE RISCO (BDI DI-08) ──────────────────────────────
      let riscoInicial = 0;
      let riscoOrcamentoId: number | null = null;
      if (input.obraId) {
        // FIX: filtrar isNull(deletedAt) e padronizar ordering por createdAt
        const [orc] = await db.select({ id: orcamentos.id })
          .from(orcamentos)
          .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
          .orderBy(desc(orcamentos.createdAt), desc(orcamentos.id))
          .limit(1);
        if (orc) {
          riscoOrcamentoId = orc.id;
          const [di08] = await db.select({ valorAbsoluto: orcamentoBdi.valorAbsoluto })
            .from(orcamentoBdi)
            .where(and(eq(orcamentoBdi.orcamentoId, orc.id), eq(orcamentoBdi.codigo, "DI-08")));
          riscoInicial = n(di08?.valorAbsoluto ?? 0);
        }
      }
      // FIX CRÍTICO: somar TODOS os débitos da obra (não só os do orçamento atual),
      // para alinhar com listarDebitosRisco e evitar mostrar "Utilizado: R$ 0"
      // quando há débitos vinculados a versões antigas do orçamento.
      const debitosRisco = input.obraId
        ? await db.select({ valor: comprasRiscoDebitos.valor })
            .from(comprasRiscoDebitos)
            .where(and(
              eq(comprasRiscoDebitos.companyId, input.companyId),
              eq(comprasRiscoDebitos.obraId, input.obraId),
            ))
        : [];
      const riscoUsado = debitosRisco.reduce((s, x) => s + n(x.valor), 0);
      const riscoDisponivel = Math.max(0, riscoInicial - riscoUsado);

      // ── 2. SOBRAS DE OCs APROVADAS ─────────────────────────────────────
      // FIX: removido "aguardando_aprovacao_extra" — sobras só de OCs efetivamente aprovadas.
      const ocs = await db.select({
        id: comprasOrdens.id,
        numeroOc: comprasOrdens.numeroOc,
        obraId: comprasOrdens.obraId,
      }).from(comprasOrdens).where(and(
        eq(comprasOrdens.companyId, input.companyId),
        inArray(comprasOrdens.status as any, ["aprovada", "recebida", "parcialmente_recebida"]),
        input.obraId ? eq(comprasOrdens.obraId, input.obraId) : undefined,
      ));

      type Sobra = { descricao: string; unidade: string; ocNumero: string; vlrMeta: number; vlrComprado: number; sobra: number };
      const sobras: Sobra[] = [];

      if (ocs.length > 0) {
        const ocItens = await db.select().from(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocs.map(o => o.id)));
        const scItemIds = ocItens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
        let scItensOc: any[] = [];
        if (scItemIds.length > 0) {
          scItensOc = await db.select({ id: comprasSolicitacoesItens.id, orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId, precoMeta: comprasSolicitacoesItens.precoMeta, insumoCodigo: comprasSolicitacoesItens.insumoCodigo })
            .from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
        }
        const orcIdsOc = scItensOc.map(s => s.orcamentoItemId).filter(Boolean) as number[];
        let orcMetasOc: any[] = [];
        if (orcIdsOc.length > 0) {
          orcMetasOc = await db.select({ id: orcamentoItens.id, metaUnitTotal: orcamentoItens.metaUnitTotal })
            .from(orcamentoItens).where(inArray(orcamentoItens.id, orcIdsOc));
        }
        const scToOrc: Record<number, number> = {};
        const scToPrecoMeta: Record<number, number> = {};
        const scToInsumoCod: Record<number, string> = {};
        for (const s of scItensOc) {
          if (s.orcamentoItemId) scToOrc[s.id] = s.orcamentoItemId;
          if (n(s.precoMeta) > 0) scToPrecoMeta[s.id] = n(s.precoMeta);
          if (s.insumoCodigo) scToInsumoCod[s.id] = s.insumoCodigo;
        }
        const orcToMeta: Record<number, number> = {};
        for (const o of orcMetasOc) orcToMeta[o.id] = n(o.metaUnitTotal);

        const needInsLookup = scItensOc.filter((s: any) => !s.orcamentoItemId && n(s.precoMeta) <= 0 && s.insumoCodigo);
        const insPricePerObra: Record<number, Record<string, number>> = {};
        if (needInsLookup.length > 0) {
          const obraIds = [...new Set(ocs.map(o => o.obraId).filter(Boolean) as number[])];
          for (const obraId of obraIds) {
            const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
              .from(orcamentos)
              .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, obraId), isNull(orcamentos.deletedAt)))
              .orderBy(desc(orcamentos.createdAt)).limit(1);
            if (!orc) continue;
            const orcItems = await db.select({ servicoCodigo: orcamentoItens.servicoCodigo })
              .from(orcamentoItens).where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));
            const svcCods = [...new Set(orcItems.filter(it => it.servicoCodigo).map(it => it.servicoCodigo!))];
            if (!svcCods.length) continue;
            const allIns = await db.select({
              insumoCodigo: composicaoInsumos.insumoCodigo,
              precoUnitario: composicaoInsumos.precoUnitario,
              alocacaoMat: composicaoInsumos.alocacaoMat,
              alocacaoMdo: composicaoInsumos.alocacaoMdo,
            }).from(composicaoInsumos)
              .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCods)));
            const matOnly = allIns.filter(i => n(i.alocacaoMat) > 0);
            const obraMap: Record<string, number> = {};
            for (const ins of matOnly) {
              if (ins.insumoCodigo && n(ins.precoUnitario) > 0) obraMap[ins.insumoCodigo] = n(ins.precoUnitario);
            }
            insPricePerObra[obraId] = obraMap;
          }
        }

        const ocToObraMap: Record<number, number> = {};
        for (const oc of ocs) if (oc.obraId) ocToObraMap[oc.id] = oc.obraId;

        for (const it of ocItens) {
          if (!it.solicitacaoItemId) continue;
          const orcId = scToOrc[it.solicitacaoItemId];
          let metaUnit = orcId ? (orcToMeta[orcId] ?? 0) : 0;
          if (metaUnit === 0) metaUnit = scToPrecoMeta[it.solicitacaoItemId] ?? 0;
          if (metaUnit === 0) {
            const ic = scToInsumoCod[it.solicitacaoItemId];
            const obraId = ocToObraMap[it.ordemId];
            if (ic && obraId) metaUnit = insPricePerObra[obraId]?.[ic] ?? 0;
          }
          if (metaUnit === 0) continue;
          const qty = n(it.quantidade);
          const vlrMeta = metaUnit * qty;
          const vlrComprado = n(it.precoUnitario) * qty;
          const sobra = vlrMeta - vlrComprado;
          if (sobra > 0.01) {
            const oc = ocs.find(o => o.id === it.ordemId);
            sobras.push({ descricao: it.descricao || "—", unidade: it.unidade || "", ocNumero: oc?.numeroOc || String(it.ordemId), vlrMeta, vlrComprado, sobra });
          }
        }
        sobras.sort((a, b) => b.sobra - a.sobra);
      }

      const totalSobrasBruto = sobras.reduce((s, x) => s + x.sobra, 0);
      // FIX double-spending: descontar sobras já realocadas via confirmarRealocacaoSobras
      const realocCondsBR: any[] = [
        eq(budgetReallocations.companyId, input.companyId),
        sql`${budgetReallocations.origemEapItemNome} LIKE 'Economia OC:%'`,
      ];
      if (input.obraId) realocCondsBR.push(eq(budgetReallocations.obraId, input.obraId));
      const realocBR = await db.select({ valor: budgetReallocations.valorRealocado })
        .from(budgetReallocations).where(and(...realocCondsBR));
      const sobrasJaConsumidas = realocBR.reduce((s, r) => s + n(r.valor), 0);
      const totalSobras = Math.max(0, totalSobrasBruto - sobrasJaConsumidas);
      const totalCobertura = riscoDisponivel + totalSobras;

      // Verifica débitos de risco feitos especificamente para esta cotação
      const debitosEstaCotacao = input.cotacaoId
        ? await db.select({ id: comprasRiscoDebitos.id, valor: comprasRiscoDebitos.valor, observacao: comprasRiscoDebitos.observacao, criadoEm: comprasRiscoDebitos.criadoEm })
            .from(comprasRiscoDebitos)
            .where(eq(comprasRiscoDebitos.cotacaoId, input.cotacaoId))
            .orderBy(asc(comprasRiscoDebitos.id))
        : [];
      const totalDebitadoEstaCotacao = debitosEstaCotacao.reduce((s, x) => s + n(x.valor), 0);
      const cobertoPorRisco = totalDebitadoEstaCotacao >= input.deficit - 0.01;

      // ── Rev. 1386 — Cria/atualiza reserva preventiva para esta cotação ──
      // Quando o usuário consulta saldos para cobrir um déficit, criamos uma
      // reserva ativa que protege o saldo até a cotação ser resolvida.
      if (input.cotacaoId && input.deficit > 0.01 && !cobertoPorRisco) {
        try {
          const [cotInfo] = await db.select({
            criadoPorId:   comprasCotacoes.criadoPorId,
            criadoPorNome: comprasCotacoes.criadoPorNome,
            obraId:        comprasCotacoes.obraId,
          }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId)).limit(1);

          // Já existe reserva ativa? Se sim, o helper apenas atualiza valores.
          // O dono da reserva é (a) quem gerou a OC com déficit, ou
          // (b) fallback para criadoPor da cotação.
          const [ocAguardando] = await db.select({
            id: comprasOrdens.id,
            criadoPorId: comprasOrdens.criadoPorId,
            criadoPorNome: comprasOrdens.criadoPorNome,
          }).from(comprasOrdens)
            .where(and(
              eq(comprasOrdens.cotacaoId, input.cotacaoId),
              eq(comprasOrdens.status as any, "aguardando_aprovacao_extra"),
            ))
            .limit(1);

          const respId = ocAguardando?.criadoPorId ?? cotInfo?.criadoPorId ?? null;
          const respNome = ocAguardando?.criadoPorNome ?? cotInfo?.criadoPorNome ?? null;

          // Distribui déficit entre DI-08 (até disponível) e Economia (resto).
          const restanteAposRisco = Math.max(0, input.deficit - totalDebitadoEstaCotacao);
          const reservarDi08 = Math.min(restanteAposRisco, riscoDisponivel);
          const reservarEconomia = Math.max(0, restanteAposRisco - reservarDi08);

          await _criarOuAtualizarReserva({
            companyId:      input.companyId,
            obraId:         cotInfo?.obraId ?? input.obraId ?? null,
            cotacaoId:      input.cotacaoId,
            ordemId:        ocAguardando?.id ?? null,
            valorDi08:      reservarDi08,
            valorEconomia:  reservarEconomia,
            responsavelId:  respId,
            responsavelNome: respNome,
            motivo:         `Déficit detectado em Cotação #${input.cotacaoId}: R$ ${restanteAposRisco.toFixed(2)}`,
          });
        } catch (e: any) {
          console.warn("[buscarSaldosRealocacao] Falha ao criar reserva:", e?.message);
        }
      }

      return {
        risco: { inicial: riscoInicial, usado: riscoUsado, disponivel: riscoDisponivel, orcamentoId: riscoOrcamentoId },
        sobras: sobras.slice(0, 20),
        totalSobras,
        deficit: input.deficit,
        cobreDeficit: totalCobertura >= input.deficit,
        semCobertura: totalCobertura < 0.01,
        cobertoPorRisco,
        totalDebitadoEstaCotacao,
        debitosEstaCotacao,
      };
    }),

  debitarDoRisco: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      orcamentoId: z.number(),
      cotacaoId: z.number().optional(),
      valor: z.number().positive(),
      deficit: z.number().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // Valida que não excede disponível na reserva global
      const debitos = await db.select({ valor: comprasRiscoDebitos.valor })
        .from(comprasRiscoDebitos)
        .where(eq(comprasRiscoDebitos.orcamentoId, input.orcamentoId));
      const [di08] = await db.select({ valorAbsoluto: orcamentoBdi.valorAbsoluto })
        .from(orcamentoBdi)
        .where(and(eq(orcamentoBdi.orcamentoId, input.orcamentoId), eq(orcamentoBdi.codigo, "DI-08")));
      const inicial = n(di08?.valorAbsoluto ?? 0);
      const usado = debitos.reduce((s, x) => s + n(x.valor), 0);
      const disponivel = Math.max(0, inicial - usado);
      if (input.valor > disponivel + 0.01) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Valor solicitado (${input.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) excede a reserva disponível (${disponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).` });
      }
      // Valida que não excede o déficit desta cotação específica
      if (input.cotacaoId && input.deficit !== undefined) {
        const debitosEsta = await db.select({ valor: comprasRiscoDebitos.valor })
          .from(comprasRiscoDebitos)
          .where(eq(comprasRiscoDebitos.cotacaoId, input.cotacaoId));
        const totalEsta = debitosEsta.reduce((s, x) => s + n(x.valor), 0);
        const restante = Math.max(0, input.deficit - totalEsta);
        if (input.valor > restante + 0.01) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `O débito de ${input.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} excede o déficit restante desta cotação (${restante.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).` });
        }
      }
      await db.insert(comprasRiscoDebitos).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        orcamentoId: input.orcamentoId,
        cotacaoId: input.cotacaoId ?? null,
        valor: String(input.valor),
        observacao: input.observacao ?? null,
      });

      let ocsAprovadas = false;
      if (input.cotacaoId && input.deficit !== undefined) {
        const debitosTotais = await db.select({ valor: comprasRiscoDebitos.valor })
          .from(comprasRiscoDebitos)
          .where(eq(comprasRiscoDebitos.cotacaoId, input.cotacaoId));
        const totalDebCot = debitosTotais.reduce((s, x) => s + n(x.valor), 0);
        if (totalDebCot >= input.deficit - 0.01) {
          const ocsAguardando = await db.select({ id: comprasOrdens.id })
            .from(comprasOrdens)
            .where(and(
              eq(comprasOrdens.companyId, input.companyId),
              eq(comprasOrdens.cotacaoId, input.cotacaoId),
              eq(comprasOrdens.status as any, "aguardando_aprovacao_extra"),
            ));
          for (const oc of ocsAguardando) {
            await db.update(comprasOrdens)
              .set({
                status: "aprovada",
                aprovacaoStatus: "aprovado",
                aprovacaoExtraMotivo: `Déficit coberto via reserva de risco (DI-08)`,
              } as any)
              .where(and(eq(comprasOrdens.id, oc.id), eq(comprasOrdens.companyId, input.companyId)));
          }
          ocsAprovadas = ocsAguardando.length > 0;
        }
        // Rev. 1386 — Se cotação totalmente coberta, libera reserva como consumida.
        if (totalDebCot >= input.deficit - 0.01) {
          await _liberarReservasDaCotacao({
            cotacaoId: input.cotacaoId,
            acao: "consumida",
            motivo: `Déficit coberto via débito de Reserva de Risco (DI-08): R$ ${totalDebCot.toFixed(2)}`,
          });
        }
      }

      return { ok: true, novoDisponivel: disponivel - input.valor, ocsAprovadas };
    }),

  confirmarRealocacaoSobras: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      cotacaoId: z.number(),
      deficit: z.number().positive(),
      sobrasIndices: z.array(z.number()),
      completarComRisco: z.boolean().default(false),
      usuarioId: z.number(),
      usuarioNome: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // FIX: removido "aguardando_aprovacao_extra" para alinhar com getSaldosRealocacaoGeral/buscarSaldosRealocacao.
      // Mantê-lo aqui causava: (a) sobra "falsa" de OC ainda não aprovada, e (b) descasamento dos índices
      // entre o que a UI lista (sem aguardando_aprovacao_extra) e o que esta mutation reconstrói.
      const q = await db.select({
        id: comprasOrdens.id,
        numeroOc: comprasOrdens.numeroOc,
        obraId: comprasOrdens.obraId,
      }).from(comprasOrdens).where(and(
        eq(comprasOrdens.companyId, input.companyId),
        inArray(comprasOrdens.status as any, ["aprovada", "recebida", "parcialmente_recebida"]),
        eq(comprasOrdens.obraId, input.obraId),
      ));

      if (q.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma OC encontrada para esta obra." });

      const ocItens = await db.select().from(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, q.map(o => o.id)));
      const scItemIds = ocItens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
      let scItensOc: any[] = [];
      if (scItemIds.length > 0) {
        scItensOc = await db.select({ id: comprasSolicitacoesItens.id, orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId, precoMeta: comprasSolicitacoesItens.precoMeta, insumoCodigo: comprasSolicitacoesItens.insumoCodigo })
          .from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
      }
      const orcIdsOc = scItensOc.map((s: any) => s.orcamentoItemId).filter(Boolean) as number[];
      let orcMetasOc: any[] = [];
      if (orcIdsOc.length > 0) {
        orcMetasOc = await db.select({ id: orcamentoItens.id, metaUnitTotal: orcamentoItens.metaUnitTotal })
          .from(orcamentoItens).where(inArray(orcamentoItens.id, orcIdsOc));
      }
      const scToOrc: Record<number, number> = {};
      const scToPrecoMeta: Record<number, number> = {};
      const scToInsumoCod: Record<number, string> = {};
      for (const s of scItensOc) {
        if (s.orcamentoItemId) scToOrc[s.id] = s.orcamentoItemId;
        if (n(s.precoMeta) > 0) scToPrecoMeta[s.id] = n(s.precoMeta);
        if (s.insumoCodigo) scToInsumoCod[s.id] = s.insumoCodigo;
      }
      const orcToMeta: Record<number, number> = {};
      for (const o of orcMetasOc) orcToMeta[o.id] = n(o.metaUnitTotal);

      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt)).limit(1);
      const insPriceMap: Record<string, number> = {};
      if (orc) {
        const orcItems = await db.select({ servicoCodigo: orcamentoItens.servicoCodigo })
          .from(orcamentoItens).where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));
        const svcCods = [...new Set(orcItems.filter(it => it.servicoCodigo).map(it => it.servicoCodigo!))];
        if (svcCods.length > 0) {
          const allIns = await db.select({
            insumoCodigo: composicaoInsumos.insumoCodigo,
            precoUnitario: composicaoInsumos.precoUnitario,
            alocacaoMat: composicaoInsumos.alocacaoMat,
            alocacaoMdo: composicaoInsumos.alocacaoMdo,
          }).from(composicaoInsumos)
            .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCods)));
          for (const ins of allIns.filter(i => n(i.alocacaoMat) > 0)) {
            if (ins.insumoCodigo && n(ins.precoUnitario) > 0) insPriceMap[ins.insumoCodigo] = n(ins.precoUnitario);
          }
        }
      }

      type Sobra = { descricao: string; unidade: string; ocNumero: string; vlrMeta: number; vlrComprado: number; sobra: number };
      const sobras: Sobra[] = [];
      for (const it of ocItens) {
        if (!it.solicitacaoItemId) continue;
        const orcId = scToOrc[it.solicitacaoItemId];
        let metaUnit = orcId ? (orcToMeta[orcId] ?? 0) : 0;
        if (metaUnit === 0) metaUnit = scToPrecoMeta[it.solicitacaoItemId] ?? 0;
        if (metaUnit === 0) {
          const ic = scToInsumoCod[it.solicitacaoItemId];
          if (ic) metaUnit = insPriceMap[ic] ?? 0;
        }
        if (metaUnit === 0) continue;
        const qty = n(it.quantidade);
        const vlrMeta = metaUnit * qty;
        const vlrComprado = n(it.precoUnitario) * qty;
        const sobra = vlrMeta - vlrComprado;
        if (sobra > 0.01) {
          const oc = q.find(o => o.id === it.ordemId);
          sobras.push({ descricao: it.descricao || "—", unidade: it.unidade || "", ocNumero: oc?.numeroOc || String(it.ordemId), vlrMeta, vlrComprado, sobra });
        }
      }
      sobras.sort((a, b) => b.sobra - a.sobra);

      let totalSobrasSel = 0;
      const sobrasDesc: string[] = [];
      for (const idx of input.sobrasIndices) {
        if (idx >= 0 && idx < sobras.length) {
          totalSobrasSel += sobras[idx].sobra;
          sobrasDesc.push(`${sobras[idx].ocNumero}: ${sobras[idx].descricao} (${sobras[idx].sobra.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`);
        }
      }

      // FIX double-spending server-side: validar que o valor a realocar
      // não excede a economia LÍQUIDA disponível (sobras totais − já consumidas).
      // Se outro usuário consumiu sobras simultaneamente, esta mutation falha
      // ao invés de criar realocações inválidas.
      const totalSobrasOcs = sobras.reduce((s, x) => s + x.sobra, 0);
      const consumidasRows = await db.select({ valor: budgetReallocations.valorRealocado })
        .from(budgetReallocations).where(and(
          eq(budgetReallocations.companyId, input.companyId),
          eq(budgetReallocations.obraId, input.obraId),
          sql`${budgetReallocations.origemEapItemNome} LIKE 'Economia OC:%'`,
        ));
      const consumido = consumidasRows.reduce((s, r) => s + n(r.valor), 0);
      const economiaLiquida = Math.max(0, totalSobrasOcs - consumido);
      if (totalSobrasSel > economiaLiquida + 0.01) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Saldo de Economia em Compras insuficiente. Disponível: ${economiaLiquida.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} | Solicitado: ${totalSobrasSel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Recarregue a tela — outro usuário pode ter consumido essas sobras.`,
        });
      }

      if (totalSobrasSel > 0) {
        const valorRealocar = Math.min(totalSobrasSel, input.deficit);
        await db.insert(budgetReallocations).values({
          companyId: input.companyId,
          obraId: input.obraId,
          origemEapItemNome: `Economia OC: ${sobrasDesc.join("; ").substring(0, 250)}`,
          destinoEapItemNome: `Cotação #${input.cotacaoId}`,
          valorRealocado: String(valorRealocar.toFixed(2)),
          motivo: `Realocação de sobras de compras para cobrir déficit da Cotação #${input.cotacaoId}`,
          usuarioId: input.usuarioId,
          usuarioNome: input.usuarioNome ?? null,
        } as any);
      }

      let riscoDebitado = 0;
      if (input.completarComRisco && totalSobrasSel < input.deficit) {
        const falta = input.deficit - totalSobrasSel;
        if (orc) {
          const [di08] = await db.select({ valorAbsoluto: orcamentoBdi.valorAbsoluto })
            .from(orcamentoBdi)
            .where(and(eq(orcamentoBdi.orcamentoId, orc.id), eq(orcamentoBdi.codigo, "DI-08")));
          const inicial = n(di08?.valorAbsoluto ?? 0);
          const debitos = await db.select({ valor: comprasRiscoDebitos.valor })
            .from(comprasRiscoDebitos).where(eq(comprasRiscoDebitos.orcamentoId, orc.id));
          const usado = debitos.reduce((s, x) => s + n(x.valor), 0);
          const disponivel = Math.max(0, inicial - usado);
          riscoDebitado = Math.min(falta, disponivel);
          if (riscoDebitado > 0.01) {
            await db.insert(comprasRiscoDebitos).values({
              companyId: input.companyId,
              obraId: input.obraId,
              orcamentoId: orc.id,
              cotacaoId: input.cotacaoId,
              valor: String(riscoDebitado.toFixed(2)),
              observacao: `Complemento via risco — Cotação #${input.cotacaoId}`,
            });
          }
        }
      }

      const totalCoberto = totalSobrasSel + riscoDebitado;
      const cobreDeficit = totalCoberto >= input.deficit - 0.01;

      if (cobreDeficit) {
        const ocsAguardando = await db.select({ id: comprasOrdens.id })
          .from(comprasOrdens)
          .where(and(
            eq(comprasOrdens.companyId, input.companyId),
            eq(comprasOrdens.cotacaoId, input.cotacaoId),
            eq(comprasOrdens.status as any, "aguardando_aprovacao_extra"),
          ));
        for (const oc of ocsAguardando) {
          await db.update(comprasOrdens)
            .set({
              status: "aprovada",
              aprovacaoStatus: "aprovado",
              aprovacaoExtraMotivo: `Déficit coberto via realocação de verba (sobras${riscoDebitado > 0 ? " + risco DI-08" : ""})`,
            } as any)
            .where(and(eq(comprasOrdens.id, oc.id), eq(comprasOrdens.companyId, input.companyId)));
        }
      }

      // Rev. 1386 — libera reserva como consumida se cotação foi coberta.
      if (cobreDeficit) {
        await _liberarReservasDaCotacao({
          cotacaoId: input.cotacaoId,
          acao: "consumida",
          motivo: `Déficit coberto via realocação de sobras${riscoDebitado > 0 ? " + DI-08" : ""}: R$ ${totalCoberto.toFixed(2)}`,
          executadoPorId: input.usuarioId,
          executadoPorNome: input.usuarioNome,
        });
      }

      return {
        ok: true,
        totalSobrasRealocadas: Math.min(totalSobrasSel, input.deficit),
        riscoDebitado,
        totalCoberto,
        cobreDeficit,
        ocsAprovadas: cobreDeficit,
      };
    }),

  reverterDebitoRisco: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), senhaMaster: z.string().min(1, "Senha do ADM Master obrigatória") }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      if ((ctx.user as any)?.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Administrador Master pode desfazer um débito da Reserva de Risco." });
      }
      const db = await getDb();
      const [masterUser] = await db.select({ password: users.password }).from(users).where(eq(users.id, (ctx.user as any).id));
      if (!masterUser?.password) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário master não encontrado." });
      const bcrypt = await import("bcryptjs");
      const senhaValida = bcrypt.compareSync(input.senhaMaster, masterUser.password);
      if (!senhaValida) throw new TRPCError({ code: "FORBIDDEN", message: "Senha incorreta. Operação negada." });
      const [row] = await db.select().from(comprasRiscoDebitos).where(and(eq(comprasRiscoDebitos.id, input.id), eq(comprasRiscoDebitos.companyId, input.companyId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Débito não encontrado." });
      await db.delete(comprasRiscoDebitos).where(eq(comprasRiscoDebitos.id, input.id));
      return { ok: true, valorRestituido: n(row.valor) };
    }),

  listarDebitosRisco: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const conds: any[] = [eq(comprasRiscoDebitos.companyId, input.companyId)];
      if (input.obraId) conds.push(eq(comprasRiscoDebitos.obraId, input.obraId));
      const rows = await db.select({
        id: comprasRiscoDebitos.id,
        obraId: comprasRiscoDebitos.obraId,
        orcamentoId: comprasRiscoDebitos.orcamentoId,
        cotacaoId: comprasRiscoDebitos.cotacaoId,
        valor: comprasRiscoDebitos.valor,
        observacao: comprasRiscoDebitos.observacao,
        criadoEm: comprasRiscoDebitos.criadoEm,
      }).from(comprasRiscoDebitos).where(and(...conds)).orderBy(desc(comprasRiscoDebitos.criadoEm));
      // Enrich with cotacao numeroCotacao and obra nome
      const cotacaoIds = [...new Set(rows.map(r => r.cotacaoId).filter(Boolean))] as number[];
      const obraIds = [...new Set(rows.map(r => r.obraId).filter(Boolean))] as number[];
      const [cotacoes, obrasRows] = await Promise.all([
        cotacaoIds.length > 0 ? db.select({ id: comprasCotacoes.id, numeroCotacao: comprasCotacoes.numeroCotacao }).from(comprasCotacoes).where(inArray(comprasCotacoes.id, cotacaoIds)) : [],
        obraIds.length > 0 ? db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIds)) : [],
      ]);
      const cotMap = new Map(cotacoes.map(c => [c.id, c.numeroCotacao]));
      const obraMap = new Map(obrasRows.map(o => [o.id, o.nome]));
      return rows.map(r => ({
        ...r,
        numeroCotacao: r.cotacaoId ? cotMap.get(r.cotacaoId) ?? null : null,
        obraNome: r.obraId ? obraMap.get(r.obraId) ?? null : null,
      }));
    }),

  // ── Lista detalhada das OCs que geraram economia (sobra positiva) ──
  // Usado na tela de Realocação para mostrar a origem da "Economia em Compras"
  listarEconomiasOC: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // FIX: removido "aguardando_aprovacao_extra" — só conta economia de OCs efetivamente aprovadas.
      const ocsConds: any[] = [
        eq(comprasOrdens.companyId, input.companyId),
        inArray(comprasOrdens.status as any, ["aprovada", "recebida", "parcialmente_recebida"]),
      ];
      if (input.obraId) ocsConds.push(eq(comprasOrdens.obraId, input.obraId));

      const ocs = await db.select({
        id: comprasOrdens.id,
        numeroOc: comprasOrdens.numeroOc,
        obraId: comprasOrdens.obraId,
        status: comprasOrdens.status,
        criadoEm: comprasOrdens.criadoEm,
      }).from(comprasOrdens).where(and(...ocsConds));

      if (ocs.length === 0) return [];

      const ocItens = await db.select().from(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocs.map(o => o.id)));
      const scItemIds = ocItens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
      let scItens: { id: number; orcamentoItemId: number | null; precoMeta: string | null; insumoCodigo: string | null; solicitacaoId: number }[] = [];
      if (scItemIds.length > 0) {
        scItens = await db.select({
          id: comprasSolicitacoesItens.id,
          orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
          precoMeta: comprasSolicitacoesItens.precoMeta,
          insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
          solicitacaoId: comprasSolicitacoesItens.solicitacaoId,
        }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
      }
      const orcIds = scItens.map(s => s.orcamentoItemId).filter(Boolean) as number[];
      let metas: { id: number; metaUnitTotal: string | null; unidade: string | null }[] = [];
      if (orcIds.length > 0) {
        metas = await db.select({ id: orcamentoItens.id, metaUnitTotal: orcamentoItens.metaUnitTotal, unidade: orcamentoItens.unidade })
          .from(orcamentoItens).where(inArray(orcamentoItens.id, orcIds));
      }
      const scToOrc: Record<number, number> = {};
      const scToPrecoMeta: Record<number, number> = {};
      const scToInsumoCodigo: Record<number, string> = {};
      for (const s of scItens) {
        if (s.orcamentoItemId) scToOrc[s.id] = s.orcamentoItemId;
        if (n(s.precoMeta) > 0) scToPrecoMeta[s.id] = n(s.precoMeta);
        if (s.insumoCodigo) scToInsumoCodigo[s.id] = s.insumoCodigo;
      }
      const orcToMetaUnit: Record<number, number> = {};
      const orcToUnidade: Record<number, string> = {};
      for (const m of metas) {
        orcToMetaUnit[m.id] = n(m.metaUnitTotal);
        if (m.unidade) orcToUnidade[m.id] = String(m.unidade).toLowerCase().trim();
      }
      // Contagem: quantos itens de SC apontam para o mesmo orcamento_item_id?
      const orcToScCount: Record<number, number> = {};
      for (const s of scItens) {
        if (s.orcamentoItemId) orcToScCount[s.orcamentoItemId] = (orcToScCount[s.orcamentoItemId] ?? 0) + 1;
      }
      const UNID_AGREGADA = new Set(["vb", "verba", "gl", "global", "cj", "conjunto", "und. global"]);

      // Lookup de preço por insumo (para itens com insumoCodigo, independente de ter orcamentoItemId)
      const needInsumoLookup = scItens.filter(s => n(s.precoMeta) <= 0 && s.insumoCodigo);
      const insumoPricePerObra: Record<number, Record<string, number>> = {};
      if (needInsumoLookup.length > 0) {
        const obraIds = [...new Set(ocs.map(o => o.obraId).filter(Boolean) as number[])];
        for (const obraId of obraIds) {
          const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
            .from(orcamentos)
            .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, obraId), isNull(orcamentos.deletedAt)))
            .orderBy(desc(orcamentos.createdAt)).limit(1);
          if (!orc) continue;
          const orcItems = await db.select({ servicoCodigo: orcamentoItens.servicoCodigo })
            .from(orcamentoItens).where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));
          const svcCods = [...new Set(orcItems.filter(it => it.servicoCodigo).map(it => it.servicoCodigo!))];
          if (!svcCods.length) continue;
          const allInsumos = await db.select({
            insumoCodigo: composicaoInsumos.insumoCodigo,
            precoUnitario: composicaoInsumos.precoUnitario,
            alocacaoMat: composicaoInsumos.alocacaoMat,
          }).from(composicaoInsumos)
            .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCods)));
          const matOnly = allInsumos.filter(i => n(i.alocacaoMat) > 0);
          const obraMap: Record<string, number> = {};
          for (const ins of matOnly) {
            if (ins.insumoCodigo && n(ins.precoUnitario) > 0) obraMap[ins.insumoCodigo] = n(ins.precoUnitario);
          }
          insumoPricePerObra[obraId] = obraMap;
        }
      }

      const ocToObra: Record<number, number> = {};
      for (const oc of ocs) if (oc.obraId) ocToObra[oc.id] = oc.obraId;

      const ocTotalComprado: Record<number, number> = {};
      const ocTotalMeta: Record<number, number> = {};
      const ocQtdItens: Record<number, number> = {};
      for (const it of ocItens) {
        const ocId = it.ordemId;
        if (!it.solicitacaoItemId) continue;
        // PRIORIDADE 1: precoMeta da própria SC (definido pelo solicitante) — mais confiável
        let metaUnit = scToPrecoMeta[it.solicitacaoItemId] ?? 0;
        // PRIORIDADE 2: lookup pelo insumo_codigo na composição (preço real do insumo)
        if (metaUnit === 0) {
          const ic = scToInsumoCodigo[it.solicitacaoItemId];
          const obraId = ocToObra[ocId];
          if (ic && obraId) metaUnit = insumoPricePerObra[obraId]?.[ic] ?? 0;
        }
        // PRIORIDADE 3: metaUnitTotal do orçamento — APENAS se NÃO for verba agregada/compartilhada
        if (metaUnit === 0) {
          const orcId = scToOrc[it.solicitacaoItemId];
          if (orcId) {
            const unid = orcToUnidade[orcId] ?? "";
            const isAgregada = UNID_AGREGADA.has(unid);
            const compartilhado = (orcToScCount[orcId] ?? 0) > 1;
            if (!isAgregada && !compartilhado) {
              metaUnit = orcToMetaUnit[orcId] ?? 0;
            }
          }
        }
        if (metaUnit === 0) continue;
        const qty = n(it.quantidade);
        ocTotalComprado[ocId] = (ocTotalComprado[ocId] ?? 0) + n(it.precoUnitario) * qty;
        ocTotalMeta[ocId]     = (ocTotalMeta[ocId]     ?? 0) + metaUnit * qty;
        ocQtdItens[ocId]      = (ocQtdItens[ocId]      ?? 0) + 1;
      }

      // Enriquecer com nomes de obra
      const obraIds = [...new Set(ocs.map(o => o.obraId).filter(Boolean) as number[])];
      const obrasRows = obraIds.length > 0
        ? await db.select({ id: obras.id, nome: obras.nome }).from(obras).where(inArray(obras.id, obraIds))
        : [];
      const obraMap = new Map(obrasRows.map(o => [o.id, o.nome]));

      const result = ocs.map(oc => {
        const totalMeta = ocTotalMeta[oc.id] ?? 0;
        const totalComprado = ocTotalComprado[oc.id] ?? 0;
        const sobra = totalMeta - totalComprado;
        return {
          id: oc.id,
          numeroOc: oc.numeroOc,
          obraId: oc.obraId,
          obraNome: oc.obraId ? obraMap.get(oc.obraId) ?? null : null,
          status: oc.status,
          criadoEm: oc.criadoEm,
          totalMeta,
          totalComprado,
          sobra,
          qtdItensComMeta: ocQtdItens[oc.id] ?? 0,
        };
      })
      .filter(r => r.sobra > 0.01)
      .sort((a, b) => b.sobra - a.sobra);

      return result;
    }),

  solicitarAutorizacaoCompra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      cotacaoId: z.number(),
      deficit: z.number(),
      solicitanteNome: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // Grava um registro de pedido de autorização como observação especial na cotação
      await db.update(comprasCotacoes)
        .set({ observacoes: sql`COALESCE(observacoes || E'\n', '') || ${`[AGUARDANDO AUTORIZAÇÃO MASTER — Déficit de R$ ${input.deficit.toFixed(2)} em relação ao orçamento. Solicitado por: ${input.solicitanteNome ?? "Usuário"}]`}` })
        .where(eq(comprasCotacoes.id, input.cotacaoId));
      return { ok: true };
    }),

  selecionarVencedorMapa: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      fornecedorId: z.number(),
      // Rev. 4013 — regime de custo/risco, aplicável a obras "Fornecimento de MDO".
      regimeCusto: z.enum(["empresa_com_risco", "empresa_sem_risco", "cliente_paga"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cotAcc] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (cotAcc) await _assertCompanyAccess(ctx.user, cotAcc.companyId);
      await db.update(comprasCotacaoFornecedores).set({ selecionado: false }).where(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId));
      await db.update(comprasCotacaoFornecedores).set({ selecionado: true }).where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      const [p] = await db.select().from(comprasCotacaoFornecedores).where(and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, input.fornecedorId)));
      await db.update(comprasCotacoes).set({
        fornecedorId: input.fornecedorId,
        total: p.totalOrcado ?? "0",
        prazoEntregaDias: p.prazoEntregaDias ?? null,
        condicaoPagamento: p.condicaoPagamento ?? null,
        tipoPagamento: p.tipoPagamento ?? null,
        formaPagamento: (p as any).formaPagamento ?? null,
        numeroParcelas: p.numeroParcelas ?? null,
        ...(input.regimeCusto ? { regimeCusto: input.regimeCusto } : {}),
      } as any).where(eq(comprasCotacoes.id, input.cotacaoId));
      return { ok: true };
    }),

  cancelarVencedorMapa: protectedProcedure
    .input(z.object({ cotacaoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cotAcc] = await db.select({ companyId: comprasCotacoes.companyId }).from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (cotAcc) await _assertCompanyAccess(ctx.user, cotAcc.companyId);
      // Remove seleção de todos os fornecedores
      await db.update(comprasCotacaoFornecedores)
        .set({ selecionado: false })
        .where(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId));
      // Limpa fornecedor vencedor da cotação mas mantém o total intacto para referência
      await db.update(comprasCotacoes)
        .set({ fornecedorId: null })
        .where(eq(comprasCotacoes.id, input.cotacaoId));
      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════
  // ORDENS DE COMPRA (OC)
  // ══════════════════════════════════════════════════════════════

  listarOrdens: protectedProcedure
    .input(z.object({ companyId: z.number(), status: z.string().optional(), busca: z.string().optional(), apenasAtrasadas: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      let rows = await db.select().from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          input.status ? eq(comprasOrdens.status, input.status) : undefined,
        ))
        .orderBy(desc(comprasOrdens.criadoEm));
      if (input.busca) {
        const b = input.busca.toLowerCase();
        rows = rows.filter(r => r.numeroOc?.toLowerCase().includes(b) || r.observacoes?.toLowerCase().includes(b));
      }

      const allItemIds = new Set<number>();
      const ordemIds = rows.map(r => r.id);
      let itemsByOrdem: Record<number, number[]> = {};
      if (ordemIds.length > 0) {
        const allItems = await db.select({ id: comprasOrdensItens.id, ordemId: comprasOrdensItens.ordemId })
          .from(comprasOrdensItens)
          .where(inArray(comprasOrdensItens.ordemId, ordemIds));
        for (const item of allItems) {
          allItemIds.add(item.id);
          if (!itemsByOrdem[item.ordemId]) itemsByOrdem[item.ordemId] = [];
          itemsByOrdem[item.ordemId].push(item.id);
        }
      }

      let entregasProgramadasMap: Record<number, { dataEntrega: string; status: string }[]> = {};
      if (allItemIds.size > 0) {
        const entregas = await db.select({
          ordemItemId: comprasEntregasProgramadas.ordemItemId,
          dataEntrega: comprasEntregasProgramadas.dataEntrega,
          status: comprasEntregasProgramadas.status,
        }).from(comprasEntregasProgramadas)
          .where(inArray(comprasEntregasProgramadas.ordemItemId, Array.from(allItemIds)));
        for (const e of entregas) {
          if (!entregasProgramadasMap[e.ordemItemId]) entregasProgramadasMap[e.ordemItemId] = [];
          entregasProgramadasMap[e.ordemItemId].push({ dataEntrega: e.dataEntrega, status: e.status });
        }
      }

      // NÚMERO REAL DA COTAÇÃO DE ORIGEM: a tela mostrava "Cotação #<id>" usando o ID INTERNO
      // (`cotacaoId`), que NÃO bate com o número visível da cotação (`COT-AAAA-NNNN`). Busca o
      // `numeroCotacao` em lote p/ expor `cotacaoNumero` e exibir o número correto (mesma ideia
      // da Rev. 2803, que trouxe o número real da SC pra tela de cotação).
      const cotacaoIdsList = [...new Set(rows.map(r => r.cotacaoId).filter(Boolean) as number[])];
      const cotacaoNumeroMap: Record<number, string> = {};
      if (cotacaoIdsList.length > 0) {
        const cotRows = await db.select({ id: comprasCotacoes.id, numeroCotacao: comprasCotacoes.numeroCotacao })
          .from(comprasCotacoes).where(inArray(comprasCotacoes.id, cotacaoIdsList));
        for (const c of cotRows) cotacaoNumeroMap[c.id] = c.numeroCotacao;
      }

      const result = rows.map(r => {
        const itemIds = itemsByOrdem[r.id] || [];
        let proximaEntregaProgramada: string | null = null;
        for (const itemId of itemIds) {
          const entregas = entregasProgramadasMap[itemId] || [];
          const pendentes = entregas.filter(e => e.status === "pendente").sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega));
          if (pendentes.length > 0) {
            if (!proximaEntregaProgramada || pendentes[0].dataEntrega < proximaEntregaProgramada) {
              proximaEntregaProgramada = pendentes[0].dataEntrega;
            }
          }
        }
        return { ...r, proximaEntregaProgramada, cotacaoNumero: r.cotacaoId ? (cotacaoNumeroMap[r.cotacaoId] ?? null) : null };
      });

      if (input.apenasAtrasadas) {
        const hoje = new Date().toISOString().slice(0, 10);
        const closedStatuses = ["entregue", "cancelada", "recebido"];
        return result.filter(r => {
          if (closedStatuses.includes(r.status)) return false;
          const dataRef = r.proximaEntregaProgramada || r.dataEntregaPrevista;
          return dataRef && dataRef < hoje;
        });
      }

      return result;
    }),

  getOrdem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND" });
      await _assertCompanyAccess(ctx.user, oc.companyId);
      const itensRaw = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
      const scItemIdsForEnrich = itensRaw.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
      let scSemVerbaMap: Record<number, { semVerba: boolean; motivoSemVerba: string | null; eapCodigo: string | null; orcamentoItemId: number | null }> = {};
      if (scItemIdsForEnrich.length > 0) {
        const scFlags = await db.select({
          id: comprasSolicitacoesItens.id,
          semVerba: comprasSolicitacoesItens.semVerba,
          motivoSemVerba: comprasSolicitacoesItens.motivoSemVerba,
          eapCodigo: comprasSolicitacoesItens.eapCodigo,
          orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
        }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIdsForEnrich));
        for (const f of scFlags) scSemVerbaMap[f.id] = { semVerba: f.semVerba ?? false, motivoSemVerba: f.motivoSemVerba ?? null, eapCodigo: f.eapCodigo ?? null, orcamentoItemId: f.orcamentoItemId ?? null };
      }
      const itens = itensRaw.map(it => {
        const scFlags = it.solicitacaoItemId ? scSemVerbaMap[it.solicitacaoItemId] : null;
        // VÍNCULO DE ETAPA (EAP) RESTAURADO: OCs criadas a partir de cotação não persistiam o
        // `insumoCodigo` (código da etapa do orçamento) no item da OC, então o seletor de etapa
        // abria VAZIO ao editar. Quando o item da OC não tem `insumoCodigo` próprio, herda o
        // `eapCodigo` do item da SC de origem (read-only; não grava no banco). Persiste no
        // primeiro save da edição (confirmarRascunhoOrdem grava `insumoCodigo = eapCodigo`).
        const insumoCodigo = (it as any).insumoCodigo || scFlags?.eapCodigo || null;
        // Rev. 2956 — item vinculado a orçamento (orcamentoItemId) NUNCA é "avulso";
        // sanitiza flag estagnado motivoSemVerba='avulso' (read-only).
        const avulsoStaleOc = scFlags?.motivoSemVerba === "avulso" && scFlags?.orcamentoItemId != null;
        return { ...it, insumoCodigo, semVerba: avulsoStaleOc ? false : (scFlags?.semVerba ?? false), motivoSemVerba: avulsoStaleOc ? null : (scFlags?.motivoSemVerba ?? null) };
      });
      let fornecedor = null;
      if (oc.fornecedorId) {
        const [f] = await db.select({
          razaoSocial: fornecedores.razaoSocial,
          nomeFantasia: fornecedores.nomeFantasia,
          cnpj: fornecedores.cnpj,
          telefone: fornecedores.telefone,
          email: fornecedores.email,
          contatoNome: fornecedores.contatoNome,
          contatoCelular: fornecedores.contatoCelular,
          contatoEmail: fornecedores.contatoEmail,
        }).from(fornecedores).where(eq(fornecedores.id, oc.fornecedorId));
        fornecedor = f ?? null;
      }
      let proximaEntregaProgramada: string | null = null;
      if (itens.length > 0) {
        const itemIds = itens.map(i => i.id);
        const entregas = await db.select({
          dataEntrega: comprasEntregasProgramadas.dataEntrega,
          status: comprasEntregasProgramadas.status,
        }).from(comprasEntregasProgramadas)
          .where(inArray(comprasEntregasProgramadas.ordemItemId, itemIds));
        const pendentes = entregas.filter(e => e.status === "pendente").sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega));
        if (pendentes.length > 0) {
          proximaEntregaProgramada = pendentes[0].dataEntrega;
        }
      }
      // Rastreabilidade: cotação + SC vinculadas
      let cotInfo: { numeroCotacao: string | null; criadoPorNome: string | null; aprovadoPorNome: string | null; aprovadoEm: string | null } | null = null;
      let scInfo: { numeroSc: string | null; criadoPorNome: string | null; aprovadorNome: string | null; aprovadoEm: string | null } | null = null;
      if (oc.cotacaoId) {
        const [cot] = await db.select({
          numeroCotacao: comprasCotacoes.numeroCotacao,
          criadoPorNome: comprasCotacoes.criadoPorNome,
          aprovadoPorNome: comprasCotacoes.aprovadoPorNome,
          aprovadoEm: comprasCotacoes.aprovadoEm,
          solicitacaoId: comprasCotacoes.solicitacaoId,
        }).from(comprasCotacoes).where(eq(comprasCotacoes.id, oc.cotacaoId));
        if (cot) {
          cotInfo = { numeroCotacao: cot.numeroCotacao, criadoPorNome: cot.criadoPorNome, aprovadoPorNome: cot.aprovadoPorNome, aprovadoEm: cot.aprovadoEm };
          if (cot.solicitacaoId) {
            const [sc] = await db.select({
              numeroSc: comprasSolicitacoes.numeroSc,
              criadoPorNome: comprasSolicitacoes.criadoPorNome,
              aprovadorNome: comprasSolicitacoes.aprovadorNome,
              aprovadorId: comprasSolicitacoes.aprovadorId,
              aprovadoEm: comprasSolicitacoes.aprovadoEm,
            }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
            if (sc) {
              let aprovNome = sc.aprovadorNome;
              if (!aprovNome && sc.aprovadorId) {
                const [u] = await db.select({ nome: users.name }).from(users).where(eq(users.id, sc.aprovadorId));
                aprovNome = u?.nome ?? null;
              }
              scInfo = { numeroSc: sc.numeroSc, criadoPorNome: sc.criadoPorNome, aprovadorNome: aprovNome, aprovadoEm: sc.aprovadoEm };
            }
          }
        }
      }
      // Aprovador da OC (resolve nome se só temos id)
      let ocAprovadorNome: string | null = (oc as any).aprovadorNome ?? null;
      if (!ocAprovadorNome && oc.aprovadorId) {
        const [u] = await db.select({ nome: users.name }).from(users).where(eq(users.id, oc.aprovadorId));
        ocAprovadorNome = u?.nome ?? null;
      }

      return { ...oc, itens, fornecedor, proximaEntregaProgramada, cotInfo, scInfo, aprovadorNome: ocAprovadorNome };
    }),

  autorizarCompraSemVerba: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      cotacaoId: z.number(),
      adminEmail: z.string().min(1, "E-mail do admin é obrigatório"),
      adminSenha: z.string().min(1, "Senha do admin é obrigatória"),
      justificativa: z.string().min(5, "Justificativa deve ter ao menos 5 caracteres"),
      itensSemVerba: z.array(z.object({
        descricao: z.string(),
        quantidade: z.number(),
        unidade: z.string(),
        valorTotal: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [admin] = await db.select({
        id: users.id, name: users.name, role: users.role, password: users.password,
      }).from(users).where(eq(users.email, input.adminEmail)).limit(1);
      if (!admin) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário admin não encontrado com este e-mail" });
      if (admin.role !== "admin" && admin.role !== "admin_master")
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem autorizar compras sem verba" });
      const bcrypt = await import("bcryptjs");
      const senhaValida = await bcrypt.compare(input.adminSenha, admin.password);
      if (!senhaValida) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });
      const allowed = await getCompaniesForUser(admin.id, admin.role);
      if (!allowed.some((c: any) => c.id === input.companyId))
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin não tem acesso a esta empresa" });
      const resumoItens = input.itensSemVerba.map(i => `${i.descricao} (${i.quantidade} ${i.unidade})`).join("; ");
      const valorTotal = input.itensSemVerba.reduce((s, i) => s + i.valorTotal, 0);
      await db.update(comprasCotacoes)
        .set({ observacoes: sql`COALESCE(observacoes || E'\n', '') || ${`[AUTORIZAÇÃO SEM VERBA — Admin: ${admin.name} (${input.adminEmail}) em ${new Date().toLocaleString("pt-BR")}. Valor: R$ ${valorTotal.toFixed(2)}. Itens: ${resumoItens}. Justificativa: ${input.justificativa}]`}` })
        .where(and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId)));
      return { ok: true, adminNome: admin.name, adminId: admin.id };
    }),

  criarOrdemDeCotacao: protectedProcedure
    .input(z.object({
      companyId: z.number(), cotacaoId: z.number(), userId: z.number().optional(), userName: z.string().optional(),
      autorizacaoSemVerba: z.object({ adminId: z.number(), adminNome: z.string(), justificativa: z.string() }).optional(),
      comoRascunho: z.boolean().optional(),
      // Rev. 2091 — Atender pelo Estoque: obra de ORIGEM escolhida pelo user (de qual almoxarifado sai o material).
      // null/undefined => comportamento legado (busca em obraId IS NULL OR obraId = obraDestino da SC).
      obraOrigemId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });
      if (cot.status === "aprovada") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta cotação já foi aprovada e possui OC gerada." });

      const existingOC = await db.select({ id: comprasOrdens.id }).from(comprasOrdens)
        .where(and(eq(comprasOrdens.cotacaoId, input.cotacaoId), sql`${comprasOrdens.status} != 'cancelada'`))
        .limit(1);
      if (existingOC.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe uma OC ativa para esta cotação." });

      // Identifica o vencedor do mapa: igual ao frontend (selecionado=true, senão o mais barato com totalOrcado > 0)
      // Fallback: se total_orcado está nulo, calcula dos itens de resposta em tempo real
      const todosParticipantes = await db.select().from(comprasCotacaoFornecedores)
        .where(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId));
      const vencedorSelecionado = todosParticipantes.find(p => p.selecionado === true) ?? null;

      // Calcula totais ao vivo das respostas para todos os participantes (fallback quando total_orcado é nulo)
      const todasRespostas = await db.select().from(comprasCotacaoRespostas)
        .where(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId));
      const itensCotacao = await db.select({ id: comprasCotacoesItens.id, quantidade: comprasCotacoesItens.quantidade })
        .from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));
      const totalVivoPorForn: Record<number, number> = {};
      for (const r of todasRespostas) {
        const it = itensCotacao.find(i => i.id === r.itemId);
        const qty = parseFloat(it?.quantidade ?? "1");
        const preco = parseFloat(r.precoUnitario ?? "0");
        if (preco > 0) totalVivoPorForn[r.fornecedorId] = (totalVivoPorForn[r.fornecedorId] ?? 0) + preco * qty;
      }
      // Adiciona frete FOB ao total vivo
      for (const p of todosParticipantes) {
        if ((p as any).freteTipo === "fob") totalVivoPorForn[p.fornecedorId] = (totalVivoPorForn[p.fornecedorId] ?? 0) + n((p as any).valorFrete);
      }

      const getTotal = (p: typeof todosParticipantes[0]) => {
        const stored = n(p.totalOrcado);
        return stored > 0 ? stored : (totalVivoPorForn[p.fornecedorId] ?? 0);
      };

      const melhorForn = (() => {
        const comTotal = todosParticipantes.filter(p => getTotal(p) > 0);
        if (comTotal.length === 0) return null;
        return comTotal.reduce((best, curr) => {
          const bTotal = getTotal(best); const cTotal = getTotal(curr);
          if (cTotal < bTotal) return curr;
          if (cTotal === bTotal && (curr.prazoEntregaDias ?? 9999) < (best.prazoEntregaDias ?? 9999)) return curr;
          return best;
        }, comTotal[0]);
      })();
      const fornInfoCheck = vencedorSelecionado ?? melhorForn ?? (cot.fornecedorId ? todosParticipantes.find(p => p.fornecedorId === cot.fornecedorId) ?? null : null);
      console.log(`[criarOrdemDeCotacao] cotacaoId=${input.cotacaoId} participantes=${todosParticipantes.length} vencedorSelecionado=${vencedorSelecionado?.fornecedorId ?? "none"} melhorForn=${melhorForn?.fornecedorId ?? "none"} fornInfoCheck=${fornInfoCheck?.fornecedorId ?? "none"} totaisVivos=${JSON.stringify(totalVivoPorForn)}`);
      if (!fornInfoCheck) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum fornecedor vencedor identificado. Acesse o Mapa de Cotação, verifique se há preços preenchidos e, se necessário, clique em 'Selecionar como Vencedor'." });
      const vencedorFornecedorId = fornInfoCheck.fornecedorId;

      const condPag = fornInfoCheck.condicaoPagamento ?? cot.condicaoPagamento;
      const formaPag = fornInfoCheck.formaPagamento ?? (cot as any).formaPagamento;
      const prazoEntrega = fornInfoCheck.prazoEntregaDias;
      const tipoPagCheck = fornInfoCheck.tipoPagamento ?? "";
      const isMdoMedicao = ((cot as any).tipo === "servico" || (cot as any).tipo === "pacote") && (tipoPagCheck === "medicao" || (condPag ?? "").toLowerCase().includes("medição"));
      // Rev. 2073 — MDO puro (tipo='servico') NUNCA tem prazo de entrega.
      // O modal de cotação esconde o campo em modo MDO; a validação tem
      // que espelhar isso. Antes só dispensava MDO+medicao, deixando MDO
      // parcelado pedindo um campo que não existe no fluxo. Pacote
      // (material+MDO) continua exigindo prazo pro material (exceto em
      // medição → mobilização).
      const isServicoPuro = (cot as any).tipo === "servico";
      const dispensaPrazo = isServicoPuro || isMdoMedicao;
      // Rev. 1640 — Atendimento pelo Estoque dispensa condição/prazo (transferência interna imediata)
      const isEstoqueWinner = (fornInfoCheck as any).isEstoque === true;
      if (!isEstoqueWinner) {
        if (!condPag && !formaPag) throw new TRPCError({ code: "BAD_REQUEST", message: "Defina a Condição de Pagamento antes de gerar a OC. No Mapa de Cotação, edite o card do fornecedor vencedor e preencha a Forma de Pagamento." });
        if (!dispensaPrazo && (!prazoEntrega || Number(prazoEntrega) <= 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Defina o Prazo de Entrega antes de gerar a OC. No Mapa de Cotação, edite o card do fornecedor vencedor e preencha o Prazo de Entrega." });
      }

      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));

      // VÍNCULO DE ETAPA (EAP) NA OC: o item da cotação não carrega o código da etapa; ele vive
      // no item da SC de origem (`comprasSolicitacoesItens.eapCodigo`). Mapeia scItemId→eapCodigo
      // para gravar em `comprasOrdensItens.insumoCodigo` no insert abaixo (caso contrário o
      // seletor de etapa abre vazio ao editar a OC).
      const scEapMapCot: Record<number, string | null> = {};
      {
        const scIds = [...new Set(itens.map(i => i.solicitacaoItemId).filter(Boolean) as number[])];
        if (scIds.length > 0) {
          const scRows = await db.select({ id: comprasSolicitacoesItens.id, eapCodigo: comprasSolicitacoesItens.eapCodigo })
            .from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scIds));
          for (const r of scRows) scEapMapCot[r.id] = r.eapCodigo ?? null;
        }
      }

      // Busca preços do fornecedor vencedor no mapa de cotação
      const respostasForn = await db.select().from(comprasCotacaoRespostas).where(
        and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, vencedorFornecedorId))
      );
      const precoMap = new Map(respostasForn.map(r => [r.itemId, r]));

      const fornInfo = fornInfoCheck;
      const freteValor = n((fornInfo as any)?.valorFrete);
      const freteTipoOC = (fornInfo as any)?.freteTipo ?? "cif";
      const transportadoraOC = (fornInfo as any)?.transportadora ?? null;
      const freteParaTotal = freteTipoOC === "fob" ? freteValor : 0;

      const prazoEntregaDias = (fornInfo as any)?.prazoEntregaDias ?? null;
      let dataEntregaPrevista: string | null = null;
      if (prazoEntregaDias && Number(prazoEntregaDias) > 0) {
        const d = new Date();
        d.setDate(d.getDate() + Number(prazoEntregaDias));
        dataEntregaPrevista = d.toISOString().slice(0, 10);
      }

      const scTipo = cot.solicitacaoId
        ? (await db.select({ tipo: comprasSolicitacoes.tipo }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, cot.solicitacaoId)))?.[0]?.tipo ?? "material"
        : "material";
      const isServico = scTipo === "servico" || scTipo === "pacote";
      const ordemTipo = scTipo === "pacote" ? "pacote" : (scTipo === "servico" ? "servico" : "compra");

      // Rev. 1985 — numeração atômica via advisory lock (fix race C1)
      const numeroOc = await gerarProximoNumeroOC(input.companyId, ordemTipo as "compra" | "servico" | "pacote");

      const subtotalItens = n(cot.total) - freteParaTotal;
      const subtotal = Math.max(subtotalItens, 0);
      const totalOC = subtotal + freteParaTotal;

      // ── Rev. 1386 — Travamento Cirúrgico (Opção C) ──
      // Bloqueia APENAS criação de novas OCs deficitárias quando há reserva
      // vencida (>7 dias) na empresa. Operações saudáveis seguem livres.
      // Hierarquia: admin_master e diretor passam direto. Para perfis de
      // Compras, verifica travamento e impede a geração até reserva ser
      // resolvida ou prazo estendido.
      // (A verificação fina por estouro vem logo abaixo; aqui só preparamos
      //  o flag travamento se o estouro existir, evitando consulta inútil.)
      const userRoleCheck: string | undefined = (ctx?.user as any)?.role;
      const podeIgnorarTravamento = userRoleCheck === "admin_master" || userRoleCheck === "diretor";

      let extraAprovacaoRequerida = false;
      let extraMotivo = "";
      // Rev. 4013 — obras "Fornecimento de MDO" podem marcar, na equalização,
      // que este item é repasse (empresa paga mas sem risco/BDI) ou que o
      // cliente paga direto: em ambos os casos o estouro de orçamento vira
      // só informativo e NUNCA bloqueia a criação da OC.
      const regimeCustoCot = ((cot as any).regimeCusto as string | null) ?? "empresa_com_risco";
      const semRiscoOrcamentario = regimeCustoCot === "empresa_sem_risco" || regimeCustoCot === "cliente_paga";
      if (cot.obraId && !semRiscoOrcamentario) {
        try {
          const solicitacaoItemIds = itens.map(it => it.solicitacaoItemId).filter(Boolean);
          if (solicitacaoItemIds.length > 0) {
            const scItens = await db.select({
              insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
              descricao: comprasSolicitacoesItens.descricao,
              id: comprasSolicitacoesItens.id,
            }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, solicitacaoItemIds as number[]));

            const itensParaVerificar = itens.map(it => {
              const scItem = scItens.find(s => s.id === it.solicitacaoItemId);
              const resp = precoMap.get(it.id);
              const qty = resp ? n(resp.quantidade) : n(it.quantidade);
              return { insumoCodigo: scItem?.insumoCodigo || undefined, descricao: scItem?.descricao || it.descricao, quantidade: qty };
            }).filter(it => it.insumoCodigo);

            if (itensParaVerificar.length > 0) {
              const [orcCheck] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
                .from(orcamentos)
                .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, cot.obraId!), isNull(orcamentos.deletedAt)))
                .orderBy(desc(orcamentos.createdAt)).limit(1);
              if (orcCheck) {
                const insCodigos = itensParaVerificar.map(it => it.insumoCodigo!);
                const orcItCheck = await db.select({ servicoCodigo: orcamentoItens.servicoCodigo, quantidade: orcamentoItens.quantidade })
                  .from(orcamentoItens).where(and(eq(orcamentoItens.orcamentoId, orcCheck.id), eq(orcamentoItens.companyId, input.companyId)));
                const svcCods = [...new Set(orcItCheck.filter(it => it.servicoCodigo).map(it => it.servicoCodigo!))];
                if (svcCods.length > 0) {
                  const insCheck = await db.select({ composicaoCodigo: composicaoInsumos.composicaoCodigo, insumoCodigo: composicaoInsumos.insumoCodigo, quantidade: composicaoInsumos.quantidade, alocacaoMat: composicaoInsumos.alocacaoMat, alocacaoMdo: composicaoInsumos.alocacaoMdo })
                    .from(composicaoInsumos).where(and(eq(composicaoInsumos.companyId, Number(orcCheck.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCods)));
                  const matOnly = insCheck.filter(i => n(i.alocacaoMat) > 0);
                  const qtdOrcMap: Record<string, number> = {};
                  for (const ins of matOnly) {
                    if (!insCodigos.includes(ins.insumoCodigo || "")) continue;
                    const coef = n(ins.quantidade);
                    for (const svc of orcItCheck.filter(s => s.servicoCodigo === ins.composicaoCodigo)) {
                      qtdOrcMap[ins.insumoCodigo || ""] = (qtdOrcMap[ins.insumoCodigo || ""] || 0) + (n(svc.quantidade) * coef);
                    }
                  }
                  const ocExist = await db.select({ insumoCodigo: comprasSolicitacoesItens.insumoCodigo, quantidade: comprasOrdensItens.quantidade })
                    .from(comprasOrdensItens)
                    .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
                    .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
                    .where(and(eq(comprasOrdens.companyId, input.companyId), eq(comprasOrdens.obraId, cot.obraId!), sql`${comprasOrdens.status} NOT IN ('cancelada')`));
                  const jaCompMap: Record<string, number> = {};
                  for (const oc of ocExist) { jaCompMap[oc.insumoCodigo || ""] = (jaCompMap[oc.insumoCodigo || ""] || 0) + n(oc.quantidade); }
                  const estouros: string[] = [];
                  for (const item of itensParaVerificar) {
                    const qtdOrc = qtdOrcMap[item.insumoCodigo!] || 0;
                    if (qtdOrc <= 0) continue;
                    const jaCom = jaCompMap[item.insumoCodigo!] || 0;
                    const epsOc = 0.01;
                    if (jaCom + item.quantidade > qtdOrc + epsOc) {
                      const exc = Math.round(((jaCom + item.quantidade - qtdOrc) / qtdOrc) * 100);
                      estouros.push(`${item.descricao}: orçado ${qtdOrc.toLocaleString("pt-BR")}, já comprado ${jaCom.toLocaleString("pt-BR")}, novo ${item.quantidade.toLocaleString("pt-BR")} (+${exc}%)`);
                    }
                  }
                  if (estouros.length > 0) {
                    extraAprovacaoRequerida = true;
                    extraMotivo = `Insumos acima do orçamento:\n${estouros.join("\n")}`;
                    // Rev. 1386 — Travamento Cirúrgico
                    if (!podeIgnorarTravamento && _isPerfilCompras(userRoleCheck)) {
                      const status = await _statusTravamentoCompras(input.companyId);
                      if (status.travado) {
                        const lista = status.vencidas.slice(0, 3).map(r =>
                          `• Cot. #${r.cotacaoId} (${r.diasDecorridos}d) — R$ ${r.valorTotal.toFixed(2)}`
                        ).join("\n");
                        throw new TRPCError({
                          code: "FORBIDDEN",
                          message:
`🔒 NOVAS COTAÇÕES DEFICITÁRIAS BLOQUEADAS

Há ${status.vencidas.length} reserva(s) preventiva(s) vencida(s) (>7 dias) que precisam ser resolvidas pela equipe de Compras antes de criar novas OCs com déficit:

${lista}

Como destravar:
1) Resolver as reservas pendentes (cobrir o déficit em Realocações)
2) Solicitar a um gerente/diretor a extensão de prazo
3) Em emergência: usar SC de Emergência (dupla aprovação)

Operações saudáveis (sem déficit) continuam liberadas normalmente.`
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e: any) {
          // Rev. 1386 — Travamento: o FORBIDDEN deve propagar e bloquear a criação da OC.
          if (e instanceof TRPCError) throw e;
          console.warn("[criarOrdemDeCotacao] Erro na verificação de saldo:", e?.message);
        }
      }

      // Rev. 2290 — Herdar dados de locação da SC original quando o
      // engenheiro marcou "É Locação" lá (suprimentos cotou como aluguel,
      // OC nasce com os campos preenchidos automaticamente).
      let scLocacao: { isLocacao: boolean; dataInicio: string | null; dataFim: string | null; duracaoDias: number | null } | null = null;
      if (cot.solicitacaoId) {
        try {
          const [scSrc] = await db.select({
            isLocacao: comprasSolicitacoes.isLocacao,
            locacaoDataInicioPrevista: comprasSolicitacoes.locacaoDataInicioPrevista,
            locacaoDataFimPrevista: comprasSolicitacoes.locacaoDataFimPrevista,
            locacaoDuracaoDias: comprasSolicitacoes.locacaoDuracaoDias,
          }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
          if (scSrc?.isLocacao) {
            scLocacao = {
              isLocacao: true,
              dataInicio: scSrc.locacaoDataInicioPrevista ?? null,
              dataFim: scSrc.locacaoDataFimPrevista ?? null,
              duracaoDias: scSrc.locacaoDuracaoDias ?? null,
            };
          }
        } catch (e: any) {
          console.warn("[criarOrdemDeCotacao] Herança locação SC→OC falhou:", e?.message);
        }
      }

      const [oc] = await db.insert(comprasOrdens).values({
        companyId: input.companyId,
        numeroOc,
        cotacaoId: input.cotacaoId,
        solicitacaoId: cot.solicitacaoId ?? null,
        obraId: cot.obraId ?? null,
        ...(scLocacao ? {
          isLocacao: true,
          locacaoDataInicio: scLocacao.dataInicio,
          locacaoDataFim: scLocacao.dataFim,
          locacaoDuracaoDias: scLocacao.duracaoDias,
        } : {}),
        fornecedorId: isEstoqueWinner ? null : (vencedorFornecedorId ?? null),
        fornecedorNome: isEstoqueWinner
          ? "Estoque (Almoxarifado)"
          : (vencedorFornecedorId ? (await db.select({ nome: fornecedores.nomeFantasia, razao: fornecedores.razaoSocial }).from(fornecedores).where(eq(fornecedores.id, vencedorFornecedorId))).map(f => f.nome || f.razao || null)[0] ?? null : null),
        criadoPorId: input.userId ?? null,
        criadoPorNome: input.userName ?? null,
        tipo: isEstoqueWinner ? "estoque" : ordemTipo,
        // Rev. 2294 — Aprovação automática: OC nasce sempre aprovada (a
        // existência da SC já é a aprovação). O estouro de orçamento NÃO
        // bloqueia mais a OC — fica apenas registrado em aprovacaoExtraMotivo
        // pra auditoria/histórico (sem gate).
        status: input.comoRascunho ? "rascunho" : "aprovada",
        aprovacaoStatus: input.comoRascunho ? "aguardando" : "aprovado",
        aprovacaoExtraRequerida: extraAprovacaoRequerida,
        aprovacaoExtraMotivo: extraAprovacaoRequerida ? extraMotivo : null,
        subtotal: String(subtotal.toFixed(2)),
        frete: String(freteValor.toFixed(2)),
        freteTipo: freteTipoOC,
        transportadora: transportadoraOC,
        outrasDespesas: "0",
        impostos: "0",
        desconto: "0",
        total: String(totalOC.toFixed(2)),
        condicaoPagamento: fornInfo?.condicaoPagamento ?? cot.condicaoPagamento ?? null,
        tipoPagamento: fornInfo?.tipoPagamento ?? cot.tipoPagamento ?? null,
        formaPagamento: (fornInfo as any)?.formaPagamento ?? (cot as any).formaPagamento ?? null,
        // Rev. 4019 — herda o cartão FC escolhido na Cotação, pra permitir o match
        // automático item-da-fatura↔OC na conciliação do cartão.
        cartaoId: (fornInfo as any)?.cartaoId ?? (cot as any).cartaoId ?? null,
        numeroParcelas: fornInfo?.numeroParcelas ?? cot.numeroParcelas ?? 1,
        // Rev. 4016 — Item 9: OC gerada a partir de cotação herda o anexo
        // da proposta do fornecedor vencedor (arquivoUrl/arquivoNome já
        // preenchidos no mapa de cotação), senão a OC nascia sem anexo
        // algum mesmo quando havia proposta/orçamento anexado.
        anexos: (!isEstoqueWinner && (fornInfo as any)?.arquivoUrl)
          ? [{ url: (fornInfo as any).arquivoUrl, nome: (fornInfo as any).arquivoNome || "Proposta do fornecedor", tipo: "proposta", ts: Date.now() }]
          : [],
        dataEntregaPrevista: dataEntregaPrevista,
        pendenteCoberturaOrcamentaria: itens.some(it => (it as any).semVerba === true),
        regimeCusto: regimeCustoCot,
        ...((cot as any).modalidadeFd && (cot as any).modalidadeFd !== "normal" ? {
          modalidadeFd: (cot as any).modalidadeFd === "fd_fc" ? "fd_terceiro" : (cot as any).modalidadeFd,
          fdValor: (cot as any).fdValor,
          fdStatus: "pendente_aprovacao",
          fdBdiItemId: (cot as any).fdBdiItemId ?? null,
        } : {}),
        ...(input.autorizacaoSemVerba ? {
          aprovacaoExtraAdminId: input.autorizacaoSemVerba.adminId,
          aprovacaoExtraAdminNome: input.autorizacaoSemVerba.adminNome,
          aprovacaoExtraJustificativa: input.autorizacaoSemVerba.justificativa,
          aprovacaoExtraMotivo: "Compra sem verba orçamentária autorizada pelo admin",
          aprovacaoExtraEm: new Date().toISOString(),
        } : {}),
      } as any).returning();

      // Rascunho: skip financial sync and downstream actions
      if (input.comoRascunho) {
        try { await _liberarReservasDaCotacao({ cotacaoId: input.cotacaoId, acao: "consumida", motivo: "OC gerada para a cotação (rascunho)", executadoPorId: input.userId, executadoPorNome: input.userName ?? null, companyId: input.companyId }); } catch (e: any) { console.warn("[criarOrdemDeCotacao] baixa de reserva (rascunho) falhou:", e?.message); }
        return { id: oc.id, numeroOc, rascunho: true };
      }

      // Gatilho financeiro — OC criada gera despesa imediatamente
      triggerFinancialSync(input.companyId);

      try {
        const scFrotasRes = await db.execute(sql`SELECT vehicle_id, maintenance_id, origem_modulo FROM compras_solicitacoes WHERE id = ${cot.solicitacaoId} AND origem_modulo = 'frotas'`);
        const scFrotas = ((scFrotasRes as any).rows || scFrotasRes)[0];
        if (scFrotas?.vehicle_id || scFrotas?.maintenance_id) {
          await db.execute(sql`UPDATE compras_ordens SET vehicle_id = ${scFrotas.vehicle_id}, maintenance_id = ${scFrotas.maintenance_id} WHERE id = ${oc.id}`);
          if (scFrotas.maintenance_id) {
            await db.execute(sql`UPDATE fleet_maintenances SET oc_id = ${oc.id}, oc_numero = ${numeroOc}, custo = ${String(totalOC.toFixed(2))} WHERE id = ${scFrotas.maintenance_id}`);
            console.log(`[criarOrdemDeCotacao] Frotas sync: Manutenção #${scFrotas.maintenance_id} vinculada à OC #${oc.id} (${numeroOc}), custo atualizado para R$ ${totalOC.toFixed(2)}`);
          }
        }
      } catch (syncErr: any) { console.warn("[criarOrdemDeCotacao] Frotas sync error:", syncErr?.message); }

      if (itens.length > 0) {
        await db.insert(comprasOrdensItens).values(
          itens.map(it => {
            const resp = precoMap.get(it.id);
            // Rev. 2769 — VÍNCULO DA SOLICITAÇÃO PRESERVADO NA OC (cotação por PACOTE).
            // Em cotação por pacote o fornecedor consolida os valores em poucas linhas e
            // deixa as demais ZERADAS (qtd 0 E preço 0 = não cotou aquela linha). A OC herdava
            // esse zero e o item "perdia o vínculo" (qtd 0 / em branco). Agora, SÓ em pacote,
            // uma resposta zerada é tratada como "não cotada": a OC mantém a QUANTIDADE DA
            // SOLICITAÇÃO (it.quantidade) mas com PREÇO/TOTAL 0 (o fornecedor não cotou esta
            // linha) — restaura o vínculo SEM injetar preço fantasma, de modo que a soma dos
            // itens continua idêntica ao total da OC (que vem de cot.total).
            const isPacoteCot = ordemTipo === "pacote" || (cot as any).tipo === "pacote";
            const respZerado = !!resp && isPacoteCot && n(resp.quantidade) === 0 && n(resp.precoUnitario) === 0;
            const usarResp = !!resp && !respZerado;
            const pu = usarResp ? n(resp!.precoUnitario) : (respZerado ? 0 : n(it.precoUnitario));
            const qty = usarResp ? n(resp!.quantidade) : n(it.quantidade);
            const tot = usarResp ? n(resp!.total) : (pu * qty);
            return {
              ordemId: oc.id,
              solicitacaoItemId: it.solicitacaoItemId ?? null,
              insumoCodigo: it.solicitacaoItemId ? (scEapMapCot[it.solicitacaoItemId] ?? null) : null,
              descricao: normalizarTexto(it.descricao),
              unidade: it.unidade,
              quantidade: String(qty),
              precoUnitario: String(pu.toFixed(4)),
              total: String(tot.toFixed(2)),
            };
          })
        );
      }
      // Rev. 1640 — Atendimento pelo Estoque: faz baixa do almoxarifado + lançamento financeiro
      // já PAGO (transferência interna), pulando parcelas tradicionais.
      // Pre-check (fail-fast) e decremento ATÔMICO (CAS) para evitar race + ghost OC.
      if (isEstoqueWinner && !extraAprovacaoRequerida) {
        // Rev. 2091 — Validação de autorização: se o user escolheu uma obra de ORIGEM específica
        // (não null = central), garantir que essa obra esteja nas obras permitidas dele.
        // Espelha a regra de `listarItens` pra evitar broken access control (baixar estoque
        // de uma obra fora da alçada do usuário). Central (null) é sempre acessível.
        if (input.obraOrigemId !== undefined && input.obraOrigemId !== null) {
          const allowedOrigem = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
          if (allowedOrigem !== null && !allowedOrigem.includes(input.obraOrigemId)) {
            await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
            await db.delete(comprasOrdens).where(eq(comprasOrdens.id, oc.id));
            throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para usar essa obra como origem da transferência de estoque." });
          }
        }
        const obraNomeRow = oc.obraId
          ? (await db.execute(sql`SELECT nome FROM obras WHERE id = ${oc.obraId} LIMIT 1`) as any).rows?.[0]?.nome
          : null;
        const scIdsForLink = itens.map(it => it.solicitacaoItemId).filter(Boolean) as number[];
        const scItensLink = scIdsForLink.length > 0
          ? await db.select().from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scIdsForLink))
          : [];
        const almoxConds: any[] = [eq(almoxarifadoItens.companyId, input.companyId), eq(almoxarifadoItens.ativo, true)];
        // Rev. 2091 — Se o user escolheu obra de ORIGEM no modal "Transferir do Estoque",
        // filtramos estritamente por aquela obra (=null trata "Almoxarifado Central").
        // Rev. 4015 — Item 3 do docx: quando o user NÃO escolhe obra de origem, o legado
        // restringia a central+destino, mas isso diverge do que o próprio pré-preenchimento
        // (`adicionarEstoqueAoMapa`, já corrigido nesta revisão) e o modal "Selecionar do
        // Estoque" (Rev. 2470) já enxergam — company-wide. Ex.: SC-2026-0163, saldo só existia
        // na obra 90005 mas a cotação era da obra 90004: o pré-preenchimento (widened) achava e
        // capava a quantidade corretamente, mas este segundo re-match (estrito) não achava o
        // item de novo e disparava falso "sem correspondência"/"saldo insuficiente" na hora de
        // gerar a OC. Mantém company-wide como padrão; obraOrigemId explícito ainda restringe.
        if (input.obraOrigemId !== undefined) {
          if (input.obraOrigemId === null) almoxConds.push(isNull(almoxarifadoItens.obraId));
          else almoxConds.push(eq(almoxarifadoItens.obraId, input.obraOrigemId));
        }
        const almoxList = await db.select().from(almoxarifadoItens).where(and(...almoxConds));
        const norm = (x: string|null|undefined) => (x ?? "").toLowerCase().trim().replace(/\s+/g," ");
        const findAlmox = (descricao: string, scItemId: number|null) => {
          const sc = scItemId ? scItensLink.find(s => s.id === scItemId) : null;
          const candCodigo = norm(sc?.insumoCodigo);
          if (candCodigo) {
            const m = almoxList.find(a => norm(a.codigoInterno) === candCodigo);
            if (m) return m;
          }
          const d = norm(descricao);
          let m = almoxList.find(a => norm(a.nome) === d);
          if (m) return m;
          if (d.length >= 4) m = almoxList.find(a => norm(a.nome).includes(d) || d.includes(norm(a.nome))) ?? null;
          return m ?? null;
        };

        // Resolve match + saldo de TODOS antes de qualquer escrita (fail-fast).
        type Plano = { it: typeof itens[0]; almoxIt: typeof almoxList[0]; qty: number; preco: number; tot: number };
        const plano: Plano[] = [];
        const erros: string[] = [];
        for (const it of itens) {
          const resp = precoMap.get(it.id);
          const qty = resp ? n(resp.quantidade) : n(it.quantidade);
          if (qty <= 0) continue;
          const almoxIt = findAlmox(it.descricao, it.solicitacaoItemId ?? null);
          if (!almoxIt) { erros.push(`"${it.descricao}" sem correspondência no almoxarifado`); continue; }
          const saldoAtual = n(almoxIt.quantidadeAtual);
          if (saldoAtual + 1e-6 < qty) { erros.push(`"${it.descricao}": saldo ${saldoAtual} < pedido ${qty}`); continue; }
          const preco = n(almoxIt.valorUnitario);
          plano.push({ it, almoxIt, qty, preco, tot: preco * qty });
        }
        if (erros.length > 0) {
          // Reverte a OC criada (ghost) e aborta com mensagem clara.
          await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
          await db.delete(comprasOrdens).where(eq(comprasOrdens.id, oc.id));
          throw new TRPCError({ code: "BAD_REQUEST", message: `Não foi possível atender pelo estoque:\n• ${erros.join("\n• ")}` });
        }

        let totalAtendido = 0;
        const decrementados: Array<{ itemId: number; qty: number }> = [];
        try {
          for (const linha of plano) {
            // Decremento ATÔMICO (CAS): só decrementa se ainda houver saldo. Detecta race entre o pre-check e o write.
            const upd = await db.execute(sql`UPDATE almoxarifado_itens SET quantidade_atual = COALESCE(quantidade_atual,0) - ${linha.qty}, atualizado_em = NOW() WHERE id = ${linha.almoxIt.id} AND COALESCE(quantidade_atual,0) >= ${linha.qty} RETURNING id`);
            const rows = ((upd as any).rows ?? upd) as any[];
            if (!rows || rows.length === 0) {
              throw new TRPCError({ code: "CONFLICT", message: `Saldo do item "${linha.it.descricao}" foi consumido por outra operação. Tente novamente.` });
            }
            decrementados.push({ itemId: linha.almoxIt.id, qty: linha.qty });
            await db.insert(almoxarifadoMovimentacoes).values({
              companyId: input.companyId,
              itemId: linha.almoxIt.id,
              tipo: "saida",
              quantidade: String(linha.qty),
              obraId: oc.obraId ?? null,
              obraNome: obraNomeRow ?? null,
              motivo: `OC #${numeroOc} (Atendimento pelo Estoque${input.obraOrigemId !== undefined ? ` — origem: ${input.obraOrigemId === null ? "Almoxarifado Central" : `obra #${input.obraOrigemId}`}${oc.obraId ? ` → destino: ${obraNomeRow ?? `obra #${oc.obraId}`}` : ""}` : ""}) — Cot. #${input.cotacaoId}`,
              usuarioId: input.userId ?? null,
              usuarioNome: input.userName ?? "Sistema",
            } as any);
            if (linha.it.solicitacaoItemId) {
              await db.execute(sql`UPDATE compras_solicitacoes_itens SET quantidade_atendida = COALESCE(quantidade_atendida,0) + ${linha.qty}, status_item = CASE WHEN COALESCE(quantidade_atendida,0) + ${linha.qty} >= quantidade THEN 'atendido' ELSE 'parcial' END WHERE id = ${linha.it.solicitacaoItemId}`);
            }
            totalAtendido += linha.tot;
          }
        } catch (e) {
          // Compensação: devolve o saldo dos itens já decrementados e remove a OC ghost.
          for (const d of decrementados) {
            try { await db.execute(sql`UPDATE almoxarifado_itens SET quantidade_atual = COALESCE(quantidade_atual,0) + ${d.qty} WHERE id = ${d.itemId}`); } catch (_) {}
            try { await db.delete(almoxarifadoMovimentacoes).where(and(eq(almoxarifadoMovimentacoes.itemId, d.itemId), eq(almoxarifadoMovimentacoes.companyId, input.companyId), sql`motivo LIKE ${`OC #${numeroOc}%`}`)); } catch (_) {}
          }
          await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
          await db.delete(comprasOrdens).where(eq(comprasOrdens.id, oc.id));
          throw e;
        }

        // Lançamento financeiro: já PAGO (transferência interna do estoque para a obra)
        if (totalAtendido > 0) {
          const hoje = new Date().toISOString().slice(0,10);
          const [fe] = await db.insert(financialEntries).values({
            companyId: input.companyId,
            obraId: oc.obraId ?? null,
            obraNome: obraNomeRow ?? null,
            tipo: "despesa",
            natureza: "operacional",
            valorPrevisto: String(totalAtendido.toFixed(2)),
            valorRealizado: String(totalAtendido.toFixed(2)),
            dataCompetencia: hoje,
            dataVencimento: hoje,
            dataPagamento: hoje,
            status: "pago",
            origemModulo: "transferencia_estoque",
            origemId: oc.id,
            origemDescricao: `Atendimento via Estoque — OC ${numeroOc} (Cot. #${input.cotacaoId})`,
            descricao: `Transferência de estoque para ${obraNomeRow ?? `obra #${oc.obraId ?? "—"}`} — OC ${numeroOc}`,
            criadoPorId: input.userId ?? null,
            criadoPorNome: input.userName ?? "Sistema",
          } as any).returning();
          if (fe?.id) {
            await db.update(comprasOrdens).set({ financialEntryId: fe.id, status: "concluida", dataEntregaReal: hoje } as any).where(eq(comprasOrdens.id, oc.id));
          }
        } else {
          await db.update(comprasOrdens).set({ status: "concluida", dataEntregaReal: new Date().toISOString().slice(0,10) } as any).where(eq(comprasOrdens.id, oc.id));
        }
      } else if (cot.fornecedorId && !extraAprovacaoRequerida) {
        const forn = await db.select().from(fornecedores).where(eq(fornecedores.id, cot.fornecedorId));
        let ocVehicleId = (oc as any).vehicle_id ?? (oc as any).vehicleId ?? null;
        if (!ocVehicleId && cot.solicitacaoId) {
          try {
            const scVehRes = await db.execute(sql`SELECT vehicle_id FROM compras_solicitacoes WHERE id = ${cot.solicitacaoId} AND vehicle_id IS NOT NULL`);
            ocVehicleId = ((scVehRes as any).rows || scVehRes)?.[0]?.vehicle_id ?? null;
          } catch(_) {}
        }
        const { entryIds, apIds } = await criarParcelasFinanceiras({
          ocId: oc.id,
          companyId: input.companyId,
          obraId: oc.obraId ?? undefined,
          supplierId: oc.fornecedorId,
          supplierNome: forn?.[0]?.razaoSocial || null,
          valorTotal: n(oc.total),
          tipo: (oc as any).tipo,
          tipoPagamento: oc.tipoPagamento,
          condicaoPagamento: (oc as any).condicaoPagamento,
          formaPagamento: (oc as any).formaPagamento || null,
          numeroParcelas: oc.numeroParcelas ?? 1,
          dataBase: oc.dataEntregaPrevista || null,
          numero: oc.numeroOc,
          vehicleId: ocVehicleId,
        }, input.userId ?? 0, input.userName ?? "Sistema");

        if (entryIds.length > 0) {
          await db.update(comprasOrdens).set({
            financialEntryId: entryIds[0],
          }).where(eq(comprasOrdens.id, oc.id));
        }
      }

      await db.update(comprasCotacoes).set({
        status: "aprovada",
        aprovadoPorId: ctx.user?.id ?? input.userId ?? null,
        aprovadoPorNome: ctx.user?.name || ctx.user?.email || input.userName || null,
        aprovadoEm: new Date().toISOString(),
      } as any).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (cot.solicitacaoId) {
        await db.update(comprasSolicitacoes).set({ status: "aprovado", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      let contratoGeradoId: number | null = null;
      let terceiroContratoGeradoId: number | null = null;

      const moduloMedicaoForn = (fornInfoCheck as any)?.moduloMedicao ?? null;
      const isMedicaoPagamento = ["medicao_mensal", "medicao_avanco", "medicao_etapa", "empreitada"].includes(moduloMedicaoForn ?? "");
      const deveCriarContrato = (isServico || isMedicaoPagamento) && !extraAprovacaoRequerida && cot.fornecedorId && !isEstoqueWinner;

      if (deveCriarContrato) {
        const ocItensForContract = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));

        let itensContrato: Array<{ descricao: string; unidade?: string | null; quantidade: string; precoUnitario: string; total: string; insumoCodigo?: string | null; eapCodigo?: string | null }>;

        const isPacote = (cot as any).tipo === "pacote" || scTipo === "pacote";
        if (isPacote && cot.obraId) {
          const cotItensRaw = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));
          const scItemIds = cotItensRaw.map(ci => ci.solicitacaoItemId).filter(Boolean) as number[];
          const scItensForComp = scItemIds.length > 0
            ? await db.select({ id: comprasSolicitacoesItens.id, orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds))
            : [];
          const orcItemIdsComp = [...new Set(scItensForComp.map(s => s.orcamentoItemId).filter(Boolean))] as number[];
          const orcItensComp = orcItemIdsComp.length > 0
            ? await db.select({ id: orcamentoItens.id, servicoCodigo: orcamentoItens.servicoCodigo, descricao: orcamentoItens.descricao, unidade: orcamentoItens.unidade, quantidade: orcamentoItens.quantidade, eapCodigo: orcamentoItens.eapCodigo }).from(orcamentoItens).where(inArray(orcamentoItens.id, orcItemIdsComp))
            : [];
          const compGroups: Record<string, { descricao: string; unidade: string; qtd: number; eapCodigo: string }> = {};
          for (const oi of orcItensComp) {
            if (!oi.servicoCodigo) continue;
            if (compGroups[oi.servicoCodigo]) {
              compGroups[oi.servicoCodigo].qtd += n(oi.quantidade);
            } else {
              compGroups[oi.servicoCodigo] = { descricao: oi.descricao ?? "", unidade: oi.unidade ?? "un", qtd: n(oi.quantidade), eapCodigo: oi.eapCodigo ?? "" };
            }
          }
          const compKeys = Object.keys(compGroups);
          if (compKeys.length > 0) {
            const fornResps = cot.fornecedorId
              ? await db.select().from(comprasCotacaoRespostas).where(and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, cot.fornecedorId)))
              : [];
            const respMap = new Map(fornResps.map(r => [r.itemId, r]));
            const cotItemToSvcCode: Record<number, string> = {};
            for (const ci of cotItensRaw) {
              const scItem = scItensForComp.find(s => s.id === ci.solicitacaoItemId);
              if (scItem?.orcamentoItemId) {
                const oi = orcItensComp.find(o => o.id === scItem.orcamentoItemId);
                if (oi?.servicoCodigo) cotItemToSvcCode[ci.id] = oi.servicoCodigo;
              }
            }
            const compPrices: Record<string, number> = {};
            for (const ci of cotItensRaw) {
              const resp = respMap.get(ci.id);
              if (resp && n(resp.precoUnitario) > 0 && cotItemToSvcCode[ci.id]) {
                const svc = cotItemToSvcCode[ci.id];
                if (!compPrices[svc]) compPrices[svc] = n(resp.precoUnitario);
              }
            }
            itensContrato = compKeys.map(svc => {
              const g = compGroups[svc];
              const pu = compPrices[svc] ?? 0;
              const tot = pu * g.qtd;
              return { descricao: g.descricao, unidade: g.unidade, quantidade: String(g.qtd), precoUnitario: String(pu.toFixed(4)), total: String(tot.toFixed(2)), insumoCodigo: svc, eapCodigo: g.eapCodigo };
            });
          } else {
            itensContrato = ocItensForContract.map(it => ({ descricao: it.descricao, unidade: it.unidade, quantidade: String(it.quantidade), precoUnitario: String(it.precoUnitario), total: String(it.total), insumoCodigo: (it as any).insumoCodigo ?? null }));
          }
        } else {
          itensContrato = ocItensForContract.map(it => ({ descricao: it.descricao, unidade: it.unidade, quantidade: String(it.quantidade), precoUnitario: String(it.precoUnitario), total: String(it.total), insumoCodigo: (it as any).insumoCodigo ?? null }));
        }

        console.log(`[criarOrdemDeCotacao] Criando contrato terceiro para OC #${oc.id}, fornecedorId=${cot.fornecedorId}, moduloMedicao=${moduloMedicaoForn}, itens=${itensContrato.length}`);
        const contratoTerceiro = await gerarContratoTerceiroDeOS({
          ocId: oc.id,
          companyId: input.companyId,
          obraId: cot.obraId ?? null,
          fornecedorId: cot.fornecedorId!,
          fornecedorNome: oc.fornecedorNome ?? null,
          total: n(oc.total),
          itensOS: itensContrato,
          userId: input.userId ?? 0,
          userName: input.userName ?? "Sistema",
          moduloMedicao: moduloMedicaoForn,
        });
        console.log(`[criarOrdemDeCotacao] Resultado gerarContratoTerceiroDeOS:`, contratoTerceiro ? `Terceiro #${contratoTerceiro.id}` : "null");

        if (contratoTerceiro) {
          contratoGeradoId = contratoTerceiro.id;
          terceiroContratoGeradoId = contratoTerceiro.terceiroContratoId ?? null;
          if (terceiroContratoGeradoId) {
            await db.update(comprasCotacoes).set({ contratoTerceiroId: terceiroContratoGeradoId } as any).where(eq(comprasCotacoes.id, input.cotacaoId));
          }
          const [fornForSign] = await db.select().from(fornecedores)
            .where(and(eq(fornecedores.id, cot.fornecedorId), eq(fornecedores.companyId, input.companyId)));

          const itensDesc = ocItensForContract.map(it => `• ${it.descricao} — ${it.quantidade} ${it.unidade || "un"} × R$ ${n(it.precoUnitario).toFixed(2)}`).join("\n");
          const textoContrato = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\nContrato nº: ${contratoTerceiro.numeroContrato || "N/A"}\nOC: ${oc.numeroOc}\n\nCONTRATANTE: FC Engenharia\nCONTRATADA: ${oc.fornecedorNome || "N/A"}\nCNPJ: ${fornForSign?.cnpj || "N/A"}\n\nOBJETO DO CONTRATO:\nPrestação de serviços conforme especificações abaixo:\n\n${itensDesc}\n\nVALOR TOTAL: R$ ${n(oc.total).toFixed(2)}\n\nAs partes concordam com os termos acima descritos e assinam eletronicamente este contrato.`;

          criarEnvelopeIntegraSign({
            companyId: input.companyId,
            ocId: oc.id,
            contratoId: contratoTerceiro.id,
            obraId: cot.obraId ?? null,
            titulo: `Contrato de Serviço — OC ${oc.numeroOc} — ${oc.fornecedorNome || "Fornecedor"}`,
            textoContrato,
            fornecedorNome: oc.fornecedorNome || "Fornecedor",
            fornecedorEmail: fornForSign?.email || "",
            fornecedorCnpj: fornForSign?.cnpj || "",
            userId: input.userId ?? 0,
            userName: input.userName ?? "Sistema",
          }).catch(err => console.error(`[IntegraSign] Erro auto-trigger:`, err?.message));
        }
      }

      try { await _liberarReservasDaCotacao({ cotacaoId: input.cotacaoId, acao: "consumida", motivo: "OC gerada para a cotação", executadoPorId: input.userId, executadoPorNome: input.userName ?? null, companyId: input.companyId }); } catch (e: any) { console.warn("[criarOrdemDeCotacao] baixa de reserva falhou:", e?.message); }
      return { ...oc, contratoGeradoId, terceiroContratoGeradoId };
    }),

  criarOCsParciais: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      cotacaoId: z.number(),
      itensPorFornecedor: z.array(z.object({
        fornecedorId: z.number(),
        itemIds: z.array(z.number()),
      })),
      comoRascunho: z.boolean().optional(),
      userId: z.number().optional(),
      userName: z.string().optional(),
      autorizacaoSemVerba: z.object({ adminId: z.number(), adminNome: z.string(), justificativa: z.string() }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(eq(comprasCotacoes.id, input.cotacaoId));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });
      if (!["pendente", "aprovada"].includes(cot.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta cotação não pode receber novas OCs neste status." });
      }

      const todosItens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));

      // VÍNCULO DE ETAPA (EAP) NA OC: item da cotação não carrega o código da etapa; ele vive no
      // item da SC (`comprasSolicitacoesItens.eapCodigo`). Mapeia scItemId→eapCodigo p/ gravar em
      // `comprasOrdensItens.insumoCodigo` (senão o seletor de etapa abre vazio ao editar a OC).
      const scEapMapParcial: Record<number, string | null> = {};
      {
        const scIds = [...new Set(todosItens.map(i => i.solicitacaoItemId).filter(Boolean) as number[])];
        if (scIds.length > 0) {
          const scRows = await db.select({ id: comprasSolicitacoesItens.id, eapCodigo: comprasSolicitacoesItens.eapCodigo })
            .from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scIds));
          for (const r of scRows) scEapMapParcial[r.id] = r.eapCodigo ?? null;
        }
      }

      // Rev. 2290 — Carrega tipo + dados de locação da SC origem
      // numa única query, para herdar em TODAS as OCs parciais geradas.
      const scSrc = cot.solicitacaoId
        ? (await db.select({
            tipo: comprasSolicitacoes.tipo,
            isLocacao: comprasSolicitacoes.isLocacao,
            locacaoDataInicioPrevista: comprasSolicitacoes.locacaoDataInicioPrevista,
            locacaoDataFimPrevista: comprasSolicitacoes.locacaoDataFimPrevista,
            locacaoDuracaoDias: comprasSolicitacoes.locacaoDuracaoDias,
          }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, cot.solicitacaoId)))?.[0] ?? null
        : null;
      const scTipo = scSrc?.tipo ?? "material";
      const ordemTipo = scTipo === "pacote" ? "pacote" : (scTipo === "servico" ? "servico" : "compra");
      const scLocacaoParcial = scSrc?.isLocacao ? {
        isLocacao: true,
        locacaoDataInicio: scSrc.locacaoDataInicioPrevista ?? null,
        locacaoDataFim: scSrc.locacaoDataFimPrevista ?? null,
        locacaoDuracaoDias: scSrc.locacaoDuracaoDias ?? null,
      } : null;

      const ocsGeradas: { id: number; numeroOc: string; fornecedorId: number }[] = [];

      for (const grupo of input.itensPorFornecedor) {
        if (grupo.itemIds.length === 0) continue;

        const [fornPart] = await db.select().from(comprasCotacaoFornecedores).where(
          and(eq(comprasCotacaoFornecedores.cotacaoId, input.cotacaoId), eq(comprasCotacaoFornecedores.fornecedorId, grupo.fornecedorId))
        );
        if (!fornPart) continue;

        const itensGrupo = todosItens.filter(it => grupo.itemIds.includes(it.id));
        if (itensGrupo.length === 0) continue;

        const respostas = await db.select().from(comprasCotacaoRespostas).where(
          and(
            eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId),
            eq(comprasCotacaoRespostas.fornecedorId, grupo.fornecedorId),
            inArray(comprasCotacaoRespostas.itemId, grupo.itemIds)
          )
        );
        const precoMap = new Map(respostas.map(r => [r.itemId, r]));

        const condPag = (fornPart as any).condicaoPagamento ?? cot.condicaoPagamento ?? null;
        const formaPag = (fornPart as any).formaPagamento ?? (cot as any).formaPagamento ?? null;
        const tipoPag = (fornPart as any).tipoPagamento ?? cot.tipoPagamento ?? null;
        const cartaoIdPag = (fornPart as any).cartaoId ?? (cot as any).cartaoId ?? null;
        const numeroParcelas = fornPart.numeroParcelas ?? cot.numeroParcelas ?? 1;
        const freteValor = n((fornPart as any).valorFrete ?? 0);
        const freteTipo = (fornPart as any).freteTipo ?? "cif";
        const transportadora = (fornPart as any).transportadora ?? null;
        const freteParaTotal = freteTipo === "fob" ? freteValor : 0;
        const prazoEntregaDias = (fornPart as any).prazoEntregaDias ?? null;

        let subtotal = 0;
        for (const it of itensGrupo) {
          const resp = precoMap.get(it.id);
          const pu = resp ? n(resp.precoUnitario) : n(it.precoUnitario);
          const qty = resp ? n(resp.quantidade) : n(it.quantidade);
          subtotal += pu * qty;
        }
        const totalOC = subtotal + freteParaTotal;

        let dataEntregaPrevista: string | null = null;
        if (prazoEntregaDias && Number(prazoEntregaDias) > 0) {
          const d = new Date();
          d.setDate(d.getDate() + Number(prazoEntregaDias));
          dataEntregaPrevista = d.toISOString().slice(0, 10);
        }

        // Rev. 1985 — numeração atômica via advisory lock (fix race C1)
        const numeroOc = await gerarProximoNumeroOC(input.companyId, ordemTipo as "compra" | "servico" | "pacote");

        const [fornData] = await db.select({ nome: fornecedores.nomeFantasia, razao: fornecedores.razaoSocial }).from(fornecedores).where(eq(fornecedores.id, grupo.fornecedorId));
        const fornNome = fornData?.nome || fornData?.razao || null;

        const [oc] = await db.insert(comprasOrdens).values({
          companyId: input.companyId,
          numeroOc,
          cotacaoId: input.cotacaoId,
          solicitacaoId: cot.solicitacaoId ?? null,
          obraId: cot.obraId ?? null,
          // Rev. 2290 — Herda locação da SC em TODAS as OCs parciais.
          ...(scLocacaoParcial ?? {}),
          fornecedorId: grupo.fornecedorId,
          fornecedorNome: fornNome,
          criadoPorId: input.userId ?? null,
          criadoPorNome: input.userName ?? null,
          tipo: ordemTipo,
          status: input.comoRascunho ? "rascunho" : "aprovada",
          aprovacaoStatus: input.comoRascunho ? "aguardando" : "aprovado",
          aprovacaoExtraRequerida: false,
          subtotal: String(subtotal.toFixed(2)),
          frete: String(freteValor.toFixed(2)),
          freteTipo,
          transportadora,
          outrasDespesas: "0",
          impostos: "0",
          desconto: "0",
          total: String(totalOC.toFixed(2)),
          condicaoPagamento: condPag,
          tipoPagamento: tipoPag,
          formaPagamento: formaPag,
          cartaoId: cartaoIdPag,
          numeroParcelas,
          dataEntregaPrevista,
          pendenteCoberturaOrcamentaria: false,
          ...(input.autorizacaoSemVerba ? {
            aprovacaoExtraAdminId: input.autorizacaoSemVerba.adminId,
            aprovacaoExtraAdminNome: input.autorizacaoSemVerba.adminNome,
            aprovacaoExtraJustificativa: input.autorizacaoSemVerba.justificativa,
            aprovacaoExtraMotivo: "Compra sem verba orçamentária autorizada pelo admin",
            aprovacaoExtraEm: new Date().toISOString(),
          } : {}),
        } as any).returning();

        if (itensGrupo.length > 0) {
          await db.insert(comprasOrdensItens).values(
            itensGrupo.map(it => {
              const resp = precoMap.get(it.id);
              const pu = resp ? n(resp.precoUnitario) : n(it.precoUnitario);
              const qty = resp ? n(resp.quantidade) : n(it.quantidade);
              const tot = pu * qty;
              return {
                ordemId: oc.id,
                solicitacaoItemId: it.solicitacaoItemId ?? null,
                cotacaoItemId: it.id,
                insumoCodigo: it.solicitacaoItemId ? (scEapMapParcial[it.solicitacaoItemId] ?? null) : null,
                descricao: normalizarTexto(it.descricao),
                unidade: it.unidade,
                quantidade: String(qty),
                precoUnitario: String(pu.toFixed(4)),
                total: String(tot.toFixed(2)),
              };
            })
          );
        }

        if (!input.comoRascunho && grupo.fornecedorId) {
          try {
            const { entryIds } = await criarParcelasFinanceiras({
              ocId: oc.id,
              companyId: input.companyId,
              obraId: oc.obraId ?? undefined,
              supplierId: grupo.fornecedorId,
              supplierNome: fornData?.razao || null,
              valorTotal: totalOC,
              tipo: (oc as any).tipo,
              tipoPagamento: tipoPag,
              condicaoPagamento: (oc as any).condicaoPagamento,
              formaPagamento: formaPag ?? null,
              numeroParcelas: Number(numeroParcelas),
              dataBase: dataEntregaPrevista,
              numero: oc.numeroOc,
            }, input.userId ?? 0, input.userName ?? "Sistema");
            if (entryIds.length > 0) {
              await db.update(comprasOrdens).set({ financialEntryId: entryIds[0] }).where(eq(comprasOrdens.id, oc.id));
            }
          } catch (finErr: any) {
            console.warn(`[criarOCsParciais] Erro ao criar parcelas financeiras para OC ${oc.id}:`, finErr?.message);
          }
        }

        ocsGeradas.push({ id: oc.id, numeroOc, fornecedorId: grupo.fornecedorId });
      }

      if (ocsGeradas.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma OC foi gerada. Verifique se os itens e fornecedores estão corretamente configurados." });
      }

      if (!input.comoRascunho) {
        // Verificar se TODOS os itens da cotação agora têm OC (pode ter sido gerada em rodadas anteriores)
        const ocsExistentes = await db.select({ id: comprasOrdens.id })
          .from(comprasOrdens)
          .where(and(eq(comprasOrdens.cotacaoId, input.cotacaoId), sql`${comprasOrdens.status} != 'rascunho'`));
        const ocItemsCobertos = ocsExistentes.length > 0
          ? await db.select({ cotacaoItemId: comprasOrdensItens.cotacaoItemId })
              .from(comprasOrdensItens)
              .where(and(
                inArray(comprasOrdensItens.ordemId, ocsExistentes.map(o => o.id)),
                sql`${comprasOrdensItens.cotacaoItemId} is not null`
              ))
          : [];
        const itemIdsCobertos = new Set(ocItemsCobertos.map(i => i.cotacaoItemId).filter(Boolean));
        const todosCobertos = todosItens.every(it => itemIdsCobertos.has(it.id));

        if (todosCobertos) {
          // Todos os itens cobertos → cotação concluída
          await db.update(comprasCotacoes).set({
            status: "aprovada",
            aprovadoPorId: ctx.user?.id ?? input.userId ?? null,
            aprovadoPorNome: ctx.user?.name || ctx.user?.email || input.userName || null,
            aprovadoEm: new Date().toISOString(),
          } as any).where(eq(comprasCotacoes.id, input.cotacaoId));

          if (cot.solicitacaoId) {
            await db.update(comprasSolicitacoes).set({ status: "aprovado", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
          }
        } else {
          // Ainda há itens sem OC → manter pendente para novas rodadas
          await db.update(comprasCotacoes).set({
            status: "pendente",
          }).where(eq(comprasCotacoes.id, input.cotacaoId));
        }
        triggerFinancialSync(input.companyId);
      }

      try { await _liberarReservasDaCotacao({ cotacaoId: input.cotacaoId, acao: "consumida", motivo: "OC(s) gerada(s) para a cotação", executadoPorId: input.userId, executadoPorNome: input.userName ?? null, companyId: input.companyId }); } catch (e: any) { console.warn("[criarOCsParciais] baixa de reserva falhou:", e?.message); }
      return { ocsGeradas };
    }),

  cancelarAprovacaoCotacao: protectedProcedure
    .input(z.object({
      cotacaoId:    z.number(),
      companyId:    z.number(),
      justificativa: z.string().min(1, "Informe a justificativa"),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const userRole = (ctx.user as any)?.role;
      console.log(`[CancelarAprovacao] cotacaoId=${input.cotacaoId} companyId=${input.companyId} userRole=${userRole}`);
      if (userRole !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o Administrador Master pode cancelar uma aprovação de cotação." });
      }
      const db = await getDb();

      const [cot] = await db.select().from(comprasCotacoes).where(
        and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId))
      );
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
      console.log(`[CancelarAprovacao] status real='${cot.status}' (tipo=${typeof cot.status})`);
      if (!["aprovada", "encerrada"].includes(cot.status ?? "")) throw new TRPCError({ code: "BAD_REQUEST", message: `Cotação não está aprovada (status atual: ${cot.status}).` });

      // Busca OCs vinculadas
      const ocs = await db.select().from(comprasOrdens).where(eq(comprasOrdens.cotacaoId, input.cotacaoId));
      for (const oc of ocs) {
        if (["entregue", "recebida", "parcialmente_recebida"].includes(oc.status ?? "")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `OC ${oc.numeroOc} já foi ${oc.status} e não pode ser revertida.` });
        }
        await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
        await db.delete(comprasOrdens).where(eq(comprasOrdens.id, oc.id));
      }

      // Reverte cotação → pendente
      await db.update(comprasCotacoes)
        .set({ status: "pendente" })
        .where(eq(comprasCotacoes.id, input.cotacaoId));

      // Reverte solicitação → cotacao (se houver vínculo)
      if (cot.solicitacaoId) {
        await db.update(comprasSolicitacoes)
          .set({ status: "cotacao", atualizadoEm: new Date().toISOString() })
          .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
      }

      return { ok: true, ocsRemovidas: ocs.length };
    }),

  cancelarCotacao: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      companyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(
        and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId))
      );
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
      if (["cancelada"].includes(cot.status ?? "")) throw new TRPCError({ code: "BAD_REQUEST", message: "Cotação já está cancelada." });

      const ocs = await db.select().from(comprasOrdens).where(eq(comprasOrdens.cotacaoId, input.cotacaoId));
      for (const oc of ocs) {
        if (["entregue", "recebida", "parcialmente_recebida"].includes(oc.status ?? "")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `OC ${oc.numeroOc} já foi ${oc.status} e não pode ser revertida.` });
        }
        await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
        await db.delete(comprasOrdens).where(eq(comprasOrdens.id, oc.id));
      }

      await db.update(comprasCotacoes)
        .set({ status: "cancelada" })
        .where(eq(comprasCotacoes.id, input.cotacaoId));

      // FIX: estornar débitos de Reserva de Risco e realocações de sobras
      // vinculados a esta cotação. Cancelar a cotação sem estornar deixa
      // a reserva consumida indevidamente.
      await db.delete(comprasRiscoDebitos).where(eq(comprasRiscoDebitos.cotacaoId, input.cotacaoId));
      await db.delete(budgetReallocations).where(and(
        sql`${budgetReallocations.origemEapItemNome} LIKE 'Economia OC:%'`,
        sql`${budgetReallocations.destinoEapItemNome} = ${`Cotação #${input.cotacaoId}`}`,
      ));
      // Rev. 1386 — libera reservas preventivas da cotação cancelada.
      await _liberarReservasDaCotacao({ cotacaoId: input.cotacaoId, acao: "liberada", motivo: "Cotação cancelada" });

      if (cot.solicitacaoId) {
        const otherActive = await db.select({ id: comprasCotacoes.id }).from(comprasCotacoes)
          .where(and(
            eq(comprasCotacoes.solicitacaoId, cot.solicitacaoId),
            eq(comprasCotacoes.companyId, input.companyId),
            sql`${comprasCotacoes.id} != ${input.cotacaoId}`,
            sql`${comprasCotacoes.status} NOT IN ('cancelada', 'recusada')`,
          ));
        if (otherActive.length === 0) {
          await db.update(comprasSolicitacoes)
            .set({ status: "aprovado", atualizadoEm: new Date().toISOString() })
            .where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
        }
      }

      return { ok: true, ocsRemovidas: ocs.length };
    }),

  criarOrdemManual: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      fornecedorId: z.number().nullable().optional(),
      numeroNf: z.string().optional(),
      formaPagamento: z.string().optional(),
      contaBancariaId: z.number().int().optional(),
      cartaoId: z.number().int().nullable().optional(),
      condicaoPagamento: z.string().min(1, "Condição de pagamento é obrigatória"),
      numeroParcelas: z.number().int().min(1).max(60).optional(),
      parcelasJson: z.array(z.object({
        numero: z.number(),
        vencimento: z.string().optional(),
        valor: z.number(),
      })).optional(),
      prazoEntregaDias: z.number().optional(),
      dataEntregaPrevista: z.string().optional(),
      dataVencimento: z.string().optional(),
      observacoes: z.string().optional(),
      frete: z.number().optional(),
      outrasDespesas: z.number().optional(),
      impostos: z.number().optional(),
      desconto: z.number().optional(),
      modalidadeFd: z.enum(["normal", "fd_cliente", "fd_fc"]).optional(),
      userId: z.number().optional(),
      userName: z.string().optional(),
      anexos: z.array(z.object({ url: z.string(), nome: z.string(), tipo: z.string(), ts: z.number() })).optional(),
      itens: z.array(z.object({
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        precoUnitario: z.number(),
        insumoCodigo: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      if (!input.condicaoPagamento?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Condição de pagamento é obrigatória para gerar OC." });
      if (!input.prazoEntregaDias && !input.dataEntregaPrevista) throw new TRPCError({ code: "BAD_REQUEST", message: "Prazo de entrega é obrigatório para gerar OC." });
      const db = await getDb();
      // Rev. 2483 — usa gerador atômico único (advisory lock + ocNumberConfig.proximoNumero
      // persistido). Antes: COUNT(*)+1 racy + bypass do contador → duplicava com OCs
      // criadas via purchaseRouter (218 vs 0218).
      const numeroOc = await gerarProximoNumeroOC(input.companyId, "compra");
      const subtotal = input.itens.reduce((s, it) => s + n(it.quantidade) * n(it.precoUnitario), 0);
      const frete = n(input.frete);
      const outrasDespesas = n(input.outrasDespesas);
      const impostos = n(input.impostos);
      const desconto = n(input.desconto);
      const total = subtotal + frete + outrasDespesas + impostos - desconto;

      let fornecedorNome: string | null = null;
      if (input.fornecedorId) {
        const [forn] = await db.select({ nomeFantasia: fornecedores.nomeFantasia, razaoSocial: fornecedores.razaoSocial })
          .from(fornecedores).where(eq(fornecedores.id, input.fornecedorId));
        fornecedorNome = forn?.nomeFantasia || forn?.razaoSocial || null;
      }

      const [oc] = await db.insert(comprasOrdens).values({
        companyId: input.companyId,
        numeroOc,
        obraId: input.obraId ?? null,
        fornecedorId: input.fornecedorId ?? null,
        fornecedorNome,
        dataEntregaPrevista: input.dataEntregaPrevista,
        dataVencimento: input.dataVencimento ?? null,
        numeroNf: input.numeroNf ?? null,
        formaPagamento: input.formaPagamento ?? null,
        contaBancariaId: input.contaBancariaId ?? null,
        cartaoId: input.cartaoId ?? null,
        numeroParcelas: input.numeroParcelas ?? 1,
        parcelasJson: input.parcelasJson ? (input.parcelasJson as any) : null,
        observacoes: input.observacoes,
        condicaoPagamento: input.condicaoPagamento,
        anexos: input.anexos ? (input.anexos as any) : null,
        status: "pendente",
        aprovacaoStatus: "aguardando",
        criadoPorId: input.userId ?? null,
        criadoPorNome: input.userName ?? null,
        subtotal: String(subtotal.toFixed(2)),
        frete: String(frete.toFixed(2)),
        outrasDespesas: String(outrasDespesas.toFixed(2)),
        impostos: String(impostos.toFixed(2)),
        desconto: String(desconto.toFixed(2)),
        total: String(total.toFixed(2)),
        modalidadeFd: input.modalidadeFd ?? "normal",
        fdPagador: input.modalidadeFd === "fd_cliente" ? "cliente" : input.modalidadeFd === "fd_fc" ? "fc" : null,
      } as any).returning();
      if (input.itens.length > 0) {
        await db.insert(comprasOrdensItens).values(
          input.itens.map(it => ({
            ordemId: oc.id,
            descricao: normalizarTexto(it.descricao),
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            precoUnitario: String(it.precoUnitario),
            total: String((n(it.quantidade) * n(it.precoUnitario)).toFixed(2)),
            insumoCodigo: it.insumoCodigo ?? null,
          }))
        );
      }
      // Gatilho financeiro — OC manual criada gera despesa imediatamente
      triggerFinancialSync(input.companyId);
      return oc;
    }),

  salvarRascunhoOrdem: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      fornecedorId: z.number().nullable().optional(),
      numeroNf: z.string().optional(),
      formaPagamento: z.string().optional(),
      contaBancariaId: z.number().nullable().optional(),
      cartaoId: z.number().int().nullable().optional(),
      condicaoPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(),
      parcelasJson: z.array(z.object({ numero: z.number(), vencimento: z.string().optional(), valor: z.number() })).optional(),
      dataEntregaPrevista: z.string().nullable().optional(),
      dataVencimento: z.string().nullable().optional(),
      observacoes: z.string().optional(),
      frete: z.number().optional(),
      outrasDespesas: z.number().optional(),
      impostos: z.number().optional(),
      desconto: z.number().optional(),
      modalidadeFd: z.enum(["normal", "fd_cliente", "fd_fc"]).optional(),
      userId: z.number().optional(),
      userName: z.string().optional(),
      anexos: z.array(z.object({ url: z.string(), nome: z.string(), tipo: z.string(), ts: z.number() })).optional(),
      itens: z.array(z.object({
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        precoUnitario: z.number(),
        insumoCodigo: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const n = (v: any) => parseFloat(String(v ?? "0")) || 0;
      const subtotal = (input.itens ?? []).reduce((s, it) => s + n(it.quantidade) * n(it.precoUnitario), 0);
      const frete = n(input.frete);
      const outrasDespesas = n(input.outrasDespesas);
      const impostos = n(input.impostos);
      const desconto = n(input.desconto);
      const total = subtotal + frete + outrasDespesas + impostos - desconto;
      let fornecedorNome: string | null = null;
      if (input.fornecedorId) {
        const [f] = await db.select({ nomeFantasia: fornecedores.nomeFantasia, razaoSocial: fornecedores.razaoSocial })
          .from(fornecedores).where(eq(fornecedores.id, input.fornecedorId));
        fornecedorNome = f?.nomeFantasia || f?.razaoSocial || null;
      }
      const dadosUpdate = {
        obraId: input.obraId ?? null,
        fornecedorId: input.fornecedorId ?? null,
        fornecedorNome,
        numeroNf: input.numeroNf ?? null,
        formaPagamento: input.formaPagamento ?? null,
        contaBancariaId: input.contaBancariaId ?? null,
        cartaoId: input.cartaoId ?? null,
        condicaoPagamento: input.condicaoPagamento ?? "",
        numeroParcelas: input.numeroParcelas ?? 1,
        parcelasJson: input.parcelasJson ? (input.parcelasJson as any) : null,
        dataEntregaPrevista: input.dataEntregaPrevista ?? null,
        dataVencimento: input.dataVencimento ?? null,
        observacoes: input.observacoes ?? null,
        frete: String(frete.toFixed(2)),
        outrasDespesas: String(outrasDespesas.toFixed(2)),
        impostos: String(impostos.toFixed(2)),
        desconto: String(desconto.toFixed(2)),
        subtotal: String(subtotal.toFixed(2)),
        total: String(total.toFixed(2)),
        anexos: input.anexos ? (input.anexos as any) : null,
        modalidadeFd: input.modalidadeFd ?? "normal",
        fdPagador: input.modalidadeFd === "fd_cliente" ? "cliente" : input.modalidadeFd === "fd_fc" ? "fc" : null,
        atualizadoEm: new Date().toISOString(),
      };
      if (input.id) {
        const [existing] = await db.select({ id: comprasOrdens.id, status: comprasOrdens.status })
          .from(comprasOrdens).where(and(eq(comprasOrdens.id, input.id), eq(comprasOrdens.companyId, input.companyId)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "OC não encontrada." });
        if (existing.status === "cancelada" || existing.status === "entregue") throw new TRPCError({ code: "FORBIDDEN", message: "OC cancelada ou entregue não pode ser editada." });
        await db.update(comprasOrdens).set({ ...dadosUpdate, status: "rascunho" } as any).where(eq(comprasOrdens.id, input.id));
        if (input.itens !== undefined) {
          await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
          const validos = input.itens.filter(i => i.descricao?.trim());
          if (validos.length > 0) {
            await db.insert(comprasOrdensItens).values(validos.map(it => ({
              ordemId: input.id!,
              descricao: normalizarTexto(it.descricao),
              unidade: it.unidade ?? "un",
              quantidade: String(it.quantidade),
              precoUnitario: String(it.precoUnitario),
              total: String((n(it.quantidade) * n(it.precoUnitario)).toFixed(2)),
              insumoCodigo: it.insumoCodigo ?? null,
            })));
          }
        }
        return { id: input.id };
      } else {
        // Rev. 2483 — Rascunho usa timestamp+random (não-sequencial, sem colisão e
        // sem "queimar" número do contador OC pra um rascunho que pode nunca virar OC).
        const numeroOc = `RASCUNHO-${new Date().getFullYear()}-${Date.now().toString(36)}${Math.floor(Math.random()*1000).toString(36)}`;
        const [oc] = await db.insert(comprasOrdens).values({
          companyId: input.companyId,
          numeroOc,
          status: "rascunho",
          aprovacaoStatus: "aguardando",
          criadoPorId: input.userId ?? null,
          criadoPorNome: input.userName ?? null,
          ...dadosUpdate,
        } as any).returning();
        const validos = (input.itens ?? []).filter(i => i.descricao?.trim());
        if (validos.length > 0) {
          await db.insert(comprasOrdensItens).values(validos.map(it => ({
            ordemId: oc.id,
            descricao: normalizarTexto(it.descricao),
            unidade: it.unidade ?? "un",
            quantidade: String(it.quantidade),
            precoUnitario: String(it.precoUnitario),
            total: String((n(it.quantidade) * n(it.precoUnitario)).toFixed(2)),
            insumoCodigo: it.insumoCodigo ?? null,
          })));
        }
        return { id: oc.id };
      }
    }),

  confirmarRascunhoOrdem: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      obraId: z.number().nullable().optional(),
      fornecedorId: z.number().nullable().optional(),
      numeroNf: z.string().optional(),
      formaPagamento: z.string().optional(),
      contaBancariaId: z.number().nullable().optional(),
      cartaoId: z.number().int().nullable().optional(),
      condicaoPagamento: z.string().optional(),
      numeroParcelas: z.number().optional(),
      parcelasJson: z.array(z.object({ numero: z.number(), vencimento: z.string().optional(), valor: z.number() })).optional(),
      dataEntregaPrevista: z.string().nullable().optional(),
      dataVencimento: z.string().nullable().optional(),
      observacoes: z.string().optional(),
      frete: z.number().optional(),
      outrasDespesas: z.number().optional(),
      impostos: z.number().optional(),
      desconto: z.number().optional(),
      modalidadeFd: z.enum(["normal", "fd_cliente", "fd_fc"]).optional(),
      userId: z.number().optional(),
      userName: z.string().optional(),
      anexos: z.array(z.object({ url: z.string(), nome: z.string(), tipo: z.string(), ts: z.number() })).optional(),
      itens: z.array(z.object({
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        precoUnitario: z.number(),
        insumoCodigo: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const n = (v: any) => parseFloat(String(v ?? "0")) || 0;
      const [oc] = await db.select().from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.id), eq(comprasOrdens.companyId, input.companyId)));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND" });
      if (oc.status === "cancelada" || oc.status === "entregue") throw new TRPCError({ code: "FORBIDDEN", message: "OC cancelada ou entregue não pode ser editada." });
      const obraIdFinal = input.obraId ?? oc.obraId;
      const condPagFinal = input.condicaoPagamento ?? oc.condicaoPagamento ?? "";
      if (!obraIdFinal) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a Obra antes de confirmar a OC." });
      if (!condPagFinal.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a Condição de Pagamento antes de confirmar a OC." });
      // Generate new OC number only if coming from rascunho; otherwise preserve existing number
      let numeroOc = oc.numeroOc ?? "";
      if (oc.status === "rascunho") {
        // Rev. 2483 — usa gerador atômico único.
        numeroOc = await gerarProximoNumeroOC(input.companyId, "compra");
      }
      const subtotal = (input.itens !== undefined ? input.itens : []).reduce((s, it) => s + n(it.quantidade) * n(it.precoUnitario), 0);
      const frete = n(input.frete ?? oc.frete);
      const outrasDespesas = n(input.outrasDespesas ?? oc.outrasDespesas);
      const impostos = n(input.impostos ?? oc.impostos);
      const desconto = n(input.desconto ?? oc.desconto);
      const total = (input.itens !== undefined ? subtotal : n(oc.subtotal)) + frete + outrasDespesas + impostos - desconto;
      let fornecedorNome: string | null = oc.fornecedorNome ?? null;
      const fornIdFinal = input.fornecedorId ?? oc.fornecedorId;
      if (input.fornecedorId !== undefined && input.fornecedorId) {
        const [f] = await db.select({ nomeFantasia: fornecedores.nomeFantasia, razaoSocial: fornecedores.razaoSocial })
          .from(fornecedores).where(eq(fornecedores.id, input.fornecedorId));
        fornecedorNome = f?.nomeFantasia || f?.razaoSocial || null;
      }
      const fdModalidade = input.modalidadeFd ?? (oc as any).modalidadeFd ?? "normal";
      await db.update(comprasOrdens).set({
        status: "pendente",
        numeroOc,
        obraId: obraIdFinal,
        fornecedorId: fornIdFinal,
        fornecedorNome,
        numeroNf: input.numeroNf ?? oc.numeroNf ?? null,
        formaPagamento: input.formaPagamento ?? (oc as any).formaPagamento ?? null,
        contaBancariaId: input.contaBancariaId ?? (oc as any).contaBancariaId ?? null,
        cartaoId: input.cartaoId !== undefined ? input.cartaoId : (oc as any).cartaoId ?? null,
        condicaoPagamento: condPagFinal,
        numeroParcelas: input.numeroParcelas ?? oc.numeroParcelas ?? 1,
        parcelasJson: input.parcelasJson ? (input.parcelasJson as any) : (oc as any).parcelasJson,
        dataEntregaPrevista: input.dataEntregaPrevista ?? oc.dataEntregaPrevista ?? null,
        dataVencimento: input.dataVencimento ?? (oc as any).dataVencimento ?? null,
        observacoes: input.observacoes ?? oc.observacoes ?? null,
        frete: String(frete.toFixed(2)),
        outrasDespesas: String(outrasDespesas.toFixed(2)),
        impostos: String(impostos.toFixed(2)),
        desconto: String(desconto.toFixed(2)),
        subtotal: String((input.itens !== undefined ? subtotal : n(oc.subtotal)).toFixed(2)),
        total: String(total.toFixed(2)),
        anexos: input.anexos ? (input.anexos as any) : (oc as any).anexos,
        modalidadeFd: fdModalidade,
        fdPagador: fdModalidade === "fd_cliente" ? "cliente" : fdModalidade === "fd_fc" ? "fc" : null,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasOrdens.id, input.id));
      if (input.itens !== undefined) {
        await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
        const validos = input.itens.filter(i => i.descricao?.trim());
        if (validos.length > 0) {
          await db.insert(comprasOrdensItens).values(validos.map(it => ({
            ordemId: input.id,
            descricao: normalizarTexto(it.descricao),
            unidade: it.unidade ?? "un",
            quantidade: String(it.quantidade),
            precoUnitario: String(it.precoUnitario),
            total: String((n(it.quantidade) * n(it.precoUnitario)).toFixed(2)),
            insumoCodigo: it.insumoCodigo ?? null,
          })));
        }
      }
      triggerFinancialSync(input.companyId);
      return { id: input.id, numeroOc };
    }),

  atualizarOrdem: protectedProcedure
    .input(z.object({
      id: z.number(),
      frete: z.number().optional(),
      outrasDespesas: z.number().optional(),
      impostos: z.number().optional(),
      desconto: z.number().optional(),
      dataEntregaPrevista: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND" });
      await _assertCompanyAccess(ctx.user, oc.companyId);
      const itens = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
      const subtotal = itens.reduce((s, it) => s + n(it.total), 0);
      const frete = n(input.frete ?? oc.frete);
      const outrasDespesas = n(input.outrasDespesas ?? oc.outrasDespesas);
      const impostos = n(input.impostos ?? oc.impostos);
      const desconto = n(input.desconto ?? oc.desconto);
      const total = subtotal + frete + outrasDespesas + impostos - desconto;
      await db.update(comprasOrdens).set({
        subtotal: String(subtotal.toFixed(2)),
        frete: String(frete.toFixed(2)),
        outrasDespesas: String(outrasDespesas.toFixed(2)),
        impostos: String(impostos.toFixed(2)),
        desconto: String(desconto.toFixed(2)),
        total: String(total.toFixed(2)),
        dataEntregaPrevista: input.dataEntregaPrevista ?? oc.dataEntregaPrevista ?? undefined,
        observacoes: input.observacoes ?? oc.observacoes ?? undefined,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasOrdens.id, input.id));
      return { ok: true, total };
    }),

  atualizarStatusOrdem: protectedProcedure
    .input(z.object({ id: z.number(), status: z.string(), dataEntregaReal: z.string().optional(), dataLancamento: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      const [ocCurrent] = await db.select({ status: comprasOrdens.status, aprovacaoExtraRequerida: comprasOrdens.aprovacaoExtraRequerida, companyId: comprasOrdens.companyId }).from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (ocCurrent) await _assertCompanyAccess(ctx.user, ocCurrent.companyId);
      if (ocCurrent?.status === "aguardando_aprovacao_extra" && input.status === "aprovada") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esta OC requer aprovação de administrador (compra extra-orçamento). Use o fluxo de aprovação com senha admin." });
      }

      const isAprovacao = input.status === "aprovada";
      await db.update(comprasOrdens).set({
        status: input.status,
        dataEntregaReal: input.dataEntregaReal,
        atualizadoEm: new Date().toISOString(),
        ...(isAprovacao ? {
          aprovadorId: ctx.user?.id ?? null,
          aprovadorNome: ctx.user?.name || ctx.user?.email || null,
          aprovadoEm: new Date().toISOString(),
        } : {}),
      } as any).where(eq(comprasOrdens.id, input.id));

      // Rev. 1386 — Reservas preventivas:
      // - cancelada/recusada → libera reserva (não consumiu nada)
      // - aprovada (de aguardando_aprovacao_extra) → consome reserva
      if (input.status === "cancelada" || input.status === "recusada") {
        const [ocLink] = await db.select({ cotacaoId: comprasOrdens.cotacaoId }).from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
        if (ocLink?.cotacaoId) {
          await _liberarReservasDaCotacao({
            cotacaoId: ocLink.cotacaoId, acao: "liberada",
            motivo: `OC ${input.status}`,
            executadoPorId: ctx.user?.id, executadoPorNome: ctx.user?.name ?? ctx.user?.email,
          });
        }
      } else if (isAprovacao && ocCurrent?.aprovacaoExtraRequerida) {
        const [ocLink] = await db.select({ cotacaoId: comprasOrdens.cotacaoId }).from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
        if (ocLink?.cotacaoId) {
          await _liberarReservasDaCotacao({
            cotacaoId: ocLink.cotacaoId, acao: "consumida",
            motivo: "OC com aprovação extra aprovada",
            executadoPorId: ctx.user?.id, executadoPorNome: ctx.user?.name ?? ctx.user?.email,
          });
        }
      }

      // ── Integração financeira ─────────────────────────────────────────
      if (input.status === "aprovada" || input.status === "entregue" || input.status === "entregue_parcial") {
        const [ocFin] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
        if (ocFin) {
          let obraNomeFin: string | null = ocFin.obraId
            ? (await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, ocFin.obraId)))[0]?.nome ?? null
            : null;

          const codigoConta = (ocFin as any).tipo === "servico" ? "3.2" : (ocFin as any).tipo === "locacao" ? "3.4" : "3.3";
          const contaRows = await db.select({ id: (financialAccounts as any).id })
            .from(financialAccounts as any)
            .where(and(eq((financialAccounts as any).companyId, ocFin.companyId), eq((financialAccounts as any).codigo, codigoConta)))
            .limit(1);
          let contaId = contaRows?.[0]?.id ?? null;
          if (!contaId) {
            const CONTA_NAMES: Record<string, string> = { "3.2": "Despesas com Serviços", "3.3": "Despesas com Materiais", "3.4": "Despesas com Locação" };
            const [newConta] = await db.insert(financialAccounts as any).values({
              companyId: ocFin.companyId,
              codigo: codigoConta,
              nome: CONTA_NAMES[codigoConta] || `Conta ${codigoConta}`,
              tipo: "despesa_variavel",
              natureza: "devedora",
              nivel: 2,
              ativo: 1,
            }).returning({ id: (financialAccounts as any).id });
            contaId = newConta?.id ?? null;
          }

          const novoStatus = (input.status === "aprovada") ? "previsto" : "a_pagar";

          // Rev. 4075 — FECHAMENTO POR CICLO DEVE ANCORAR NA DATA DE LANÇAMENTO NO
          // SISTEMA (data de competência), NÃO no `dataVencimento` digitado manualmente
          // na OC (campo historicamente com erros de digitação/preenchimento — ex.:
          // "30/60/90 dias" calculado a partir de uma data-base errada, gerando
          // vencimentos absurdos/anteriores à competência). `dataLancamento` permite ao
          // comprador registrar retroativamente uma OC/nota esquecida, caindo na janela
          // de ciclo correta em vez de "hoje". Quando o fornecedor tem ciclo de
          // fechamento configurado (≠ avista), o vencimento manual é ignorado e a data
          // de competência é usada como vencimento provisório — quem determina a data
          // real de pagamento é `_agruparContasPagarPorCicloForn` (financial.ts).
          const dataCompetenciaFin = input.dataLancamento || new Date().toISOString().split("T")[0];
          let vencimentoFin: string | null = (ocFin as any).dataVencimento ?? (ocFin as any).dataEntregaPrevista ?? null;
          if (ocFin.fornecedorId) {
            const [cycleCfg] = await db.select({ cicloPagamento: (empresasTerceiras as any).cicloPagamento })
              .from(empresasTerceiras as any)
              .where(and(eq((empresasTerceiras as any).fornecedorId, ocFin.fornecedorId), eq((empresasTerceiras as any).companyId, ocFin.companyId)))
              .limit(1);
            if (cycleCfg?.cicloPagamento && cycleCfg.cicloPagamento !== "avista") {
              vencimentoFin = dataCompetenciaFin;
            }
          }

          if (!ocFin.financialEntryId) {
            const [entry] = await db.insert(financialEntries as any).values({
              companyId: ocFin.companyId,
              obraId: ocFin.obraId ?? null,
              obraNome: obraNomeFin,
              contaId,
              tipo: "despesa",
              natureza: "variavel",
              valorPrevisto: String(ocFin.total ?? "0"),
              dataCompetencia: dataCompetenciaFin,
              dataVencimento: vencimentoFin,
              status: novoStatus,
              origemModulo: "compras",
              origemId: ocFin.id,
              // Rev. 4074 — fornecedorNome NUNCA era gravado no lançamento (só entrava
              // dentro do texto de `descricao`), o que quebrava o match do agrupamento
              // por ciclo de fechamento (_agruparContasPagarPorCicloForn lê r.fornecedorNome
              // cru). Sem isso, títulos de fornecedor com ciclo configurado ficavam soltos
              // em vez de consolidar (ex.: Ferragens Santa Rita).
              fornecedorNome: ocFin.fornecedorNome ?? null,
              descricao: `OC ${ocFin.numeroOc}${ocFin.fornecedorNome ? " — " + ocFin.fornecedorNome : ""}`,
            } as any).returning({ id: (financialEntries as any).id });
            if (entry?.id) {
              await db.update(comprasOrdens).set({ financialEntryId: entry.id } as any).where(eq(comprasOrdens.id, ocFin.id));
            }
          } else if (input.status !== "aprovada") {
            await db.update(financialEntries as any).set({ status: "a_pagar" } as any)
              .where(eq((financialEntries as any).id, ocFin.financialEntryId));
          }
        }
      }

      // ── Integração automática: OC entregue → Almoxarifado (somente material) ──
      if (input.status === "entregue") {
        const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
        if (!oc) return { ok: true, almoxarifado: false };

        const ocTipo = (oc as any).tipo ?? "compra";
        if (ocTipo === "servico" || ocTipo === "pacote") {
          return { ok: true, almoxarifado: false, itens: 0, motivo: `OC tipo='${ocTipo}'` };
        }

        // Rev. 2389 — Se a OC veio de uma SC marcada como SERVIÇO / EQUIPAMENTO /
        // ADMINISTRATIVO, NUNCA gera item de almoxarifado. (comprasSolicitacoes.tipo
        // default = 'material'; valores não-'material' indicam natureza não-estocável.)
        if (oc.solicitacaoId) {
          const [sc] = await db.select({ tipo: comprasSolicitacoes.tipo })
            .from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, oc.solicitacaoId));
          const scTipo = (sc?.tipo ?? "material").toLowerCase();
          if (scTipo && scTipo !== "material") {
            console.log(`[OC→Almox] OC ${oc.numeroOc} ignorada — SC tipo='${scTipo}' (não-material).`);
            return { ok: true, almoxarifado: false, itens: 0, motivo: `SC tipo='${scTipo}'` };
          }
        }

        const itensOC = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
        const itensIgnorados: { descricao: string; motivo: string }[] = [];

        // busca nome da obra
        let obraNome: string | null = null;
        if (oc.obraId) {
          const [ob] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, oc.obraId));
          obraNome = ob?.nome ?? null;
        }

        const usuarioNome = ctx.user?.name ?? ctx.user?.email ?? null;
        const usuarioId   = ctx.user?.id ?? null;

        let itensAdicionados = 0;
        for (const item of itensOC) {
          const qtd = n(item.quantidade);
          if (qtd <= 0) continue;

          // Rev. 2389 — Filtro per-item: bloqueia serviço/administrativo/tributo
          // mesmo quando vem dentro de uma OC tipo 'compra'. Atualiza só a
          // quantidadeEntregue da linha da OC (pra fechar a SC), mas NÃO cria
          // item no almoxarifado nem registra movimentação. Log fica em
          // `itensIgnorados` no response.
          const classif = classificarNaturezaItemAlmox(item.descricao, item.unidade);
          if (!classif.material) {
            itensIgnorados.push({ descricao: item.descricao, motivo: classif.motivo ?? "não-material" });
            console.log(`[OC→Almox] Item "${item.descricao}" ignorado: ${classif.motivo}`);
            await db.update(comprasOrdensItens).set({
              quantidadeEntregue: String(qtd),
            }).where(eq(comprasOrdensItens.id, item.id));
            if (item.solicitacaoItemId) {
              const [scItem] = await db.select().from(comprasSolicitacoesItens)
                .where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
              if (scItem) {
                const novaAtendida = n(scItem.quantidadeAtendida) + qtd;
                const atendido = novaAtendida >= n(scItem.quantidade);
                await db.update(comprasSolicitacoesItens).set({
                  quantidadeAtendida: String(novaAtendida),
                  statusItem: atendido ? "atendido" : "parcial",
                }).where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
              }
            }
            continue;
          }
          itensAdicionados++;

          // busca ou cria item no almoxarifado
          const existing = await db.select().from(almoxarifadoItens)
            .where(and(
              eq(almoxarifadoItens.companyId, oc.companyId),
              ilike(almoxarifadoItens.nome, item.descricao),
              oc.obraId
                ? eq(almoxarifadoItens.obraId, oc.obraId)
                : isNull(almoxarifadoItens.obraId),
            )).limit(1);

          let almoItemId: number;
          let tipoControleItem: "estoque" | "aplicacao_direta" = "estoque";
          if (existing.length > 0) {
            almoItemId = existing[0].id;
            tipoControleItem = ((existing[0] as any).tipoControle === "aplicacao_direta") ? "aplicacao_direta" : "estoque";
          } else {
            // Rev. 1607 — IA classifica o tipo de controle ao criar item via OC entrega.
            // Garante que itens como "Concreto Usinado FCK 25", "Argamassa pronta" etc. NÃO entrem
            // no estoque automaticamente — eles geram apenas movimentação de consumo direto.
            let cls: { tipoControle: "estoque" | "aplicacao_direta"; justificativa: string } | null = null;
            try {
              cls = await classificarTipoControleIA({
                nome: item.descricao,
                categoria: "Compras",
                unidade: item.unidade ?? "un",
              });
            } catch (e: any) {
              console.warn(`[OC entrega] IA classificação falhou (default 'estoque'):`, e?.message || e);
            }
            tipoControleItem = cls?.tipoControle ?? "estoque";
            const novo = await criarItemAlmoxarifadoComCodigo(db, oc.companyId, {
              companyId: oc.companyId,
              nome: item.descricao,
              unidade: item.unidade ?? "un",
              categoria: "Compras",
              ativo: true,
              obraId: oc.obraId ?? null,
              tipoControle: tipoControleItem,
              tipoControleClassificadoIa: !!cls,
              tipoControleJustificativa: cls?.justificativa ?? null,
            });
            almoItemId = novo.id;
          }

          if (tipoControleItem === "aplicacao_direta") {
            // Rev. 1607 — Item de aplicação direta na obra: NÃO entra no estoque.
            // Registra apenas movimentação de "consumo_direto" para audit trail
            // (entrada+saída no mesmo instante, saldo permanece zero).
            await db.insert(almoxarifadoMovimentacoes).values({
              companyId: oc.companyId,
              itemId: almoItemId,
              tipo: "consumo_direto",
              quantidade: String(qtd),
              obraId: oc.obraId ?? null,
              obraNome: obraNome ?? null,
              motivo: `OC ${oc.numeroOc} — aplicação direta na obra (IA)`,
              usuarioId,
              usuarioNome,
              observacoes: `Item classificado pela IA como aplicação direta — recebido e aplicado na obra na mesma operação. Não passa pelo almoxarifado.`,
            });
            await db.update(almoxarifadoItens).set({
              atualizadoEm: new Date().toISOString(),
            }).where(eq(almoxarifadoItens.id, almoItemId));
          } else {
            // Item de estoque normal — fluxo original (entrada + atualiza saldo).
            await db.insert(almoxarifadoMovimentacoes).values({
              companyId: oc.companyId,
              itemId: almoItemId,
              tipo: "entrada",
              quantidade: String(qtd),
              obraId: oc.obraId ?? null,
              obraNome: obraNome ?? null,
              motivo: `OC ${oc.numeroOc} entregue`,
              usuarioId,
              usuarioNome,
              observacoes: `Entrada automática via Ordem de Compra ${oc.numeroOc}`,
            });
            // Rev. 2392 — reativa item se estava soft-deleted (zerou via transferência).
            await db.update(almoxarifadoItens).set({
              quantidadeAtual: sql`${almoxarifadoItens.quantidadeAtual}::numeric + ${qtd}`,
              ativo: true,
              atualizadoEm: new Date().toISOString(),
            }).where(eq(almoxarifadoItens.id, almoItemId));
          }

          // atualiza quantidadeEntregue no item da OC
          await db.update(comprasOrdensItens).set({
            quantidadeEntregue: String(qtd),
          }).where(eq(comprasOrdensItens.id, item.id));

          // atualiza quantidadeAtendida no item da SC se houver vínculo
          if (item.solicitacaoItemId) {
            const [scItem] = await db.select().from(comprasSolicitacoesItens)
              .where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
            if (scItem) {
              const novaAtendida = n(scItem.quantidadeAtendida) + qtd;
              const atendido = novaAtendida >= n(scItem.quantidade);
              await db.update(comprasSolicitacoesItens).set({
                quantidadeAtendida: String(novaAtendida),
                statusItem: atendido ? "atendido" : "parcial",
              }).where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
            }
          }
        }

        // verifica se todos os itens da SC foram atendidos → marca SC como concluída
        if (oc.cotacaoId) {
          const [cot] = await db.select({ solicitacaoId: comprasCotacoes.solicitacaoId })
            .from(comprasCotacoes).where(eq(comprasCotacoes.id, oc.cotacaoId));
          if (cot?.solicitacaoId) {
            const scItens = await db.select().from(comprasSolicitacoesItens)
              .where(eq(comprasSolicitacoesItens.solicitacaoId, cot.solicitacaoId));
            const todosAtendidos = scItens.length > 0 && scItens.every(it => it.statusItem === "atendido");
            if (todosAtendidos) {
              await db.update(comprasSolicitacoes).set({
                status: "concluida",
                atualizadoEm: new Date().toISOString(),
              }).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
            }
          }
        }

        return {
          ok: true,
          almoxarifado: itensAdicionados > 0,
          itens: itensAdicionados,
          itensIgnorados,
        };
      }

      return { ok: true, almoxarifado: false };
    }),

  estornarRecebimentoOC: protectedProcedure
    .input(z.object({ id: z.number(), motivo: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem não encontrada" });
      await _assertCompanyAccess(ctx.user, oc.companyId);
      if (!["entregue", "entregue_parcial"].includes(oc.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Somente OCs com status 'Entregue' podem ser estornadas." });
      }

      const usuarioNome = ctx.user?.name ?? ctx.user?.email ?? "Sistema";
      const usuarioId = ctx.user?.id ?? null;

      // 1. Reverter status da OC para "aprovada" e limpar data de entrega real
      await db.update(comprasOrdens).set({
        status: "aprovada",
        dataEntregaReal: null,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasOrdens.id, input.id));

      // 2. Reverter entrada financeira de "a_pagar" para "previsto"
      if ((oc as any).financialEntryId) {
        try {
          await db.update(financialEntries as any)
            .set({ status: "previsto" } as any)
            .where(eq((financialEntries as any).id, (oc as any).financialEntryId));
        } catch (_) { /* coluna pode não existir */ }
      }

      // 3. Reverter movimentações de almoxarifado (somente material)
      const ocTipo = (oc as any).tipo ?? "compra";
      if (ocTipo !== "servico" && ocTipo !== "pacote") {
        const itensOC = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));

        let obraNome: string | null = null;
        if (oc.obraId) {
          const [ob] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, oc.obraId));
          obraNome = ob?.nome ?? null;
        }

        for (const item of itensOC) {
          const qtdEntregue = n(item.quantidadeEntregue ?? item.quantidade);
          if (qtdEntregue <= 0) continue;

          // busca item no almoxarifado pelo nome e obra
          const [almoItem] = await db.select().from(almoxarifadoItens)
            .where(and(
              eq(almoxarifadoItens.companyId, oc.companyId),
              ilike(almoxarifadoItens.nome, item.descricao),
              oc.obraId
                ? eq(almoxarifadoItens.obraId, oc.obraId)
                : isNull(almoxarifadoItens.obraId),
            )).limit(1);

          if (almoItem) {
            const isAplicDireta = (almoItem as any).tipoControle === "aplicacao_direta";

            // Rev. 1607 — Item de aplicação direta: apenas registra estorno do consumo,
            // NÃO mexe em saldo (item nunca esteve em estoque).
            await db.insert(almoxarifadoMovimentacoes).values({
              companyId: oc.companyId,
              itemId: almoItem.id,
              tipo: isAplicDireta ? "estorno_consumo_direto" : "saida",
              quantidade: String(qtdEntregue),
              obraId: oc.obraId ?? null,
              obraNome: obraNome ?? null,
              motivo: `Estorno OC ${oc.numeroOc} — ${input.motivo}`,
              usuarioId,
              usuarioNome,
              observacoes: isAplicDireta
                ? `Estorno do consumo direto registrado pela OC ${oc.numeroOc} (item de aplicação direta — não afeta estoque)`
                : `Estorno automático de recebimento da Ordem de Compra ${oc.numeroOc}`,
            });

            if (!isAplicDireta) {
              // decrementa quantidade no almoxarifado (não negativa) somente para estoque normal
              await db.update(almoxarifadoItens).set({
                quantidadeAtual: sql`GREATEST(0, ${almoxarifadoItens.quantidadeAtual}::numeric - ${qtdEntregue})`,
                atualizadoEm: new Date().toISOString(),
              }).where(eq(almoxarifadoItens.id, almoItem.id));
            }
          }

          // limpa quantidadeEntregue no item da OC
          await db.update(comprasOrdensItens).set({ quantidadeEntregue: "0" })
            .where(eq(comprasOrdensItens.id, item.id));

          // reverte item da SC se houver vínculo
          if (item.solicitacaoItemId) {
            const [scItem] = await db.select().from(comprasSolicitacoesItens)
              .where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
            if (scItem) {
              const novaAtendida = Math.max(0, n(scItem.quantidadeAtendida) - qtdEntregue);
              const novoStatus = novaAtendida <= 0 ? "pendente" : "parcial";
              await db.update(comprasSolicitacoesItens).set({
                quantidadeAtendida: String(novaAtendida),
                statusItem: novoStatus,
              }).where(eq(comprasSolicitacoesItens.id, item.solicitacaoItemId));
            }
          }
        }

        // 4. Se a SC estava "concluida" por causa desta OC, reverter para "aprovada"
        if (oc.cotacaoId) {
          try {
            const [cot] = await db.select({ solicitacaoId: comprasCotacoes.solicitacaoId })
              .from(comprasCotacoes).where(eq(comprasCotacoes.id, oc.cotacaoId));
            if (cot?.solicitacaoId) {
              const [sc] = await db.select({ status: comprasSolicitacoes.status })
                .from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
              if (sc?.status === "concluida") {
                await db.update(comprasSolicitacoes).set({
                  status: "aprovada",
                  atualizadoEm: new Date().toISOString(),
                }).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
              }
            }
          } catch (_) { /* SC pode não existir */ }
        }
      }

      return { ok: true };
    }),

  atualizarDadosEntregaOC: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      transportadora: z.string().optional(),
      codigoRastreamento: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [oc] = await db.select({ id: comprasOrdens.id }).from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.id), eq(comprasOrdens.companyId, input.companyId)))
        .limit(1);
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem não encontrada" });
      const updates: any = { atualizadoEm: new Date().toISOString() };
      if (input.transportadora !== undefined) updates.transportadora = input.transportadora || null;
      if (input.codigoRastreamento !== undefined) updates.codigoRastreamento = input.codigoRastreamento || null;
      await db.update(comprasOrdens).set(updates).where(eq(comprasOrdens.id, input.id));
      return { ok: true };
    }),

  excluirOrdem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // FIX: se esta OC era a última OC ativa de uma cotação que tinha débito
      // de risco/realocação de sobras, estornar — para manter o saldo da
      // Reserva de Risco e da Economia em Compras coerente.
      const [oc] = await db.select({ cotacaoId: comprasOrdens.cotacaoId, companyId: comprasOrdens.companyId })
        .from(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (oc) await _assertCompanyAccess(ctx.user, oc.companyId);
      await db.delete(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));
      await db.delete(comprasOrdens).where(eq(comprasOrdens.id, input.id));
      if (oc?.cotacaoId) {
        // FIX: considerar apenas OCs ATIVAS (ignorar canceladas/recusadas).
        // Se a única OC ativa foi excluída, estorna débito/realocação da cotação.
        const ativas = await db.select({ id: comprasOrdens.id }).from(comprasOrdens)
          .where(and(
            eq(comprasOrdens.cotacaoId, oc.cotacaoId),
            sql`COALESCE(${comprasOrdens.status}, '') NOT IN ('cancelada', 'recusada')`,
          ));
        if (ativas.length === 0) {
          await db.delete(comprasRiscoDebitos).where(eq(comprasRiscoDebitos.cotacaoId, oc.cotacaoId));
          await db.delete(budgetReallocations).where(and(
            sql`${budgetReallocations.origemEapItemNome} LIKE 'Economia OC:%'`,
            sql`${budgetReallocations.destinoEapItemNome} = ${`Cotação #${oc.cotacaoId}`}`,
          ));
          // Rev. 1386 — libera reserva da cotação que ficou sem OC ativa.
          await _liberarReservasDaCotacao({ cotacaoId: oc.cotacaoId, acao: "liberada", motivo: "Última OC excluída" });
        }
      }
      return { ok: true };
    }),

  excluirOrdensEmLote: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = allowedCompanies.map((c: any) => c.id);
      if (!allowedIds.includes(input.companyId)) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });
      const owned = await db.select({ id: comprasOrdens.id, cotacaoId: comprasOrdens.cotacaoId }).from(comprasOrdens).where(and(inArray(comprasOrdens.id, input.ids), eq(comprasOrdens.companyId, input.companyId)));
      const ownedIds = owned.map(o => o.id);
      if (ownedIds.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma OC encontrada" });
      const cotacaoIds = [...new Set(owned.map(o => o.cotacaoId).filter(Boolean) as number[])];
      await db.delete(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ownedIds));
      await db.delete(comprasOrdens).where(inArray(comprasOrdens.id, ownedIds));
      // FIX: estornar débitos/realocações para cotações que ficaram sem nenhuma OC ATIVA
      // (ignora canceladas/recusadas que continuam na tabela).
      for (const cotId of cotacaoIds) {
        const ativas = await db.select({ id: comprasOrdens.id }).from(comprasOrdens)
          .where(and(
            eq(comprasOrdens.cotacaoId, cotId),
            sql`COALESCE(${comprasOrdens.status}, '') NOT IN ('cancelada', 'recusada')`,
          ));
        if (ativas.length === 0) {
          await db.delete(comprasRiscoDebitos).where(eq(comprasRiscoDebitos.cotacaoId, cotId));
          await db.delete(budgetReallocations).where(and(
            sql`${budgetReallocations.origemEapItemNome} LIKE 'Economia OC:%'`,
            sql`${budgetReallocations.destinoEapItemNome} = ${`Cotação #${cotId}`}`,
          ));
          // Rev. 1386 — libera reserva da cotação cuja última OC foi excluída em lote.
          await _liberarReservasDaCotacao({ cotacaoId: cotId, acao: "liberada", motivo: "Última OC excluída em lote" });
        }
      }
      return { ok: true, count: ownedIds.length };
    }),

  // Resumo/contadores para dashboard (legado)
  resumoCompras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [scs, cots, ocs] = await Promise.all([
        db.select().from(comprasSolicitacoes).where(eq(comprasSolicitacoes.companyId, input.companyId)),
        db.select().from(comprasCotacoes).where(eq(comprasCotacoes.companyId, input.companyId)),
        db.select().from(comprasOrdens).where(eq(comprasOrdens.companyId, input.companyId)),
      ]);
      return {
        scPendentes: scs.filter(r => r.status === "pendente").length,
        scTotal: scs.length,
        cotPendentes: cots.filter(r => r.status === "pendente").length,
        cotTotal: cots.length,
        ocPendentes: ocs.filter(r => r.status === "pendente").length,
        ocTotal: ocs.length,
        totalOCsValor: ocs.reduce((s, r) => s + n(r.total), 0),
      };
    }),

  getDashboardCompras: protectedProcedure
    .input(z.object({ companyIds: z.array(z.number()).min(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const today = new Date().toISOString().slice(0, 10);
      const ids = input.companyIds;
      for (const _cid of ids) await _assertCompanyAccess(ctx.user, _cid);

      const [scs, cots, ocs, forn, obrasRows] = await Promise.all([
        db.select().from(comprasSolicitacoes).where(inArray(comprasSolicitacoes.companyId, ids)).orderBy(desc(comprasSolicitacoes.criadoEm)),
        db.select().from(comprasCotacoes).where(inArray(comprasCotacoes.companyId, ids)).orderBy(desc(comprasCotacoes.criadoEm)),
        db.select().from(comprasOrdens).where(inArray(comprasOrdens.companyId, ids)).orderBy(desc(comprasOrdens.criadoEm)),
        db.select().from(fornecedores).where(and(inArray(fornecedores.companyId, ids), eq(fornecedores.ativo, true))),
        db.select({ id: obras.id, nome: obras.nome, codigo: obras.codigo }).from(obras).where(inArray(obras.companyId, ids)),
      ]);

      const obraMap: Record<number, string> = {};
      obrasRows.forEach(o => { obraMap[o.id] = o.codigo ? `${o.codigo} – ${o.nome}` : o.nome; });

      // KPIs
      const kpis = {
        scPendentes:      scs.filter(r => r.status === "pendente").length,
        scAguardandoAprov:scs.filter(r => r.aprovacaoStatus === "aguardando").length,
        cotPendentes:     cots.filter(r => r.status === "pendente").length,
        ocPendentes:      ocs.filter(r => r.status === "pendente").length,
        ocAprovadas:      ocs.filter(r => r.status === "aprovada").length,
        totalValorOCs:    ocs.filter(r => !["cancelada"].includes(r.status)).reduce((s, r) => s + n(r.total), 0),
        fornecedoresAtivos: forn.length,
      };

      const CLOSED_OC = ["entregue", "cancelada", "recebido"];
      // Alertas: OCs com entrega vencida ou hoje
      const alertasOC = ocs.filter(r =>
        r.dataEntregaPrevista &&
        r.dataEntregaPrevista <= today &&
        !CLOSED_OC.includes(r.status)
      ).map(r => ({
        id: r.id, numeroOc: r.numeroOc, dataEntregaPrevista: r.dataEntregaPrevista,
        status: r.status, fornecedorId: r.fornecedorId, total: r.total,
        obraId: r.obraId,
        obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null,
        atrasado: r.dataEntregaPrevista! < today,
      }));

      // SCs aguardando aprovação
      const scsPendentesAprov = scs.filter(r => r.aprovacaoStatus === "aguardando" && r.status !== "cancelado").slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // Cotações pendentes (mais antigas primeiro)
      const cotsPendentes = cots.filter(r => r.status === "pendente").slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // OCs recentes (últimas 8)
      const ocsRecentes = ocs.slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // SCs recentes (últimas 8)
      const scsRecentes = scs.slice(0, 8)
        .map(r => ({ ...r, obraNome: r.obraId ? (obraMap[r.obraId] ?? null) : null }));

      // Gastos por mês (últimos 6 meses) — baseado na data de criação das OCs aprovadas/entregues
      const seisM: Record<string, number> = {};
      ocs.filter(r => !["cancelada"].includes(r.status)).forEach(r => {
        const mes = r.criadoEm.slice(0, 7); // YYYY-MM
        seisM[mes] = (seisM[mes] ?? 0) + n(r.total);
      });
      const gastosMensais = Object.entries(seisM).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([mes, valor]) => ({ mes, valor }));

      const hoje = today;
      const ocsAbertas = ocs.filter(r => !CLOSED_OC.includes(r.status));
      const ocAbertasIds = ocsAbertas.map(r => r.id);
      let ocEntregaRefMap: Record<number, string | null> = {};
      if (ocAbertasIds.length > 0) {
        const ocItens = await db.select({ id: comprasOrdensItens.id, ordemId: comprasOrdensItens.ordemId })
          .from(comprasOrdensItens).where(inArray(comprasOrdensItens.ordemId, ocAbertasIds));
        const allItemIds = ocItens.map(i => i.id);
        let entregasMap: Record<number, { dataEntrega: string; status: string }[]> = {};
        if (allItemIds.length > 0) {
          const entregas = await db.select({
            ordemItemId: comprasEntregasProgramadas.ordemItemId,
            dataEntrega: comprasEntregasProgramadas.dataEntrega,
            status: comprasEntregasProgramadas.status,
          }).from(comprasEntregasProgramadas)
            .where(inArray(comprasEntregasProgramadas.ordemItemId, allItemIds));
          for (const e of entregas) {
            if (!entregasMap[e.ordemItemId]) entregasMap[e.ordemItemId] = [];
            entregasMap[e.ordemItemId].push({ dataEntrega: e.dataEntrega, status: e.status });
          }
        }
        const itemsByOrdem: Record<number, number[]> = {};
        for (const item of ocItens) {
          if (!itemsByOrdem[item.ordemId]) itemsByOrdem[item.ordemId] = [];
          itemsByOrdem[item.ordemId].push(item.id);
        }
        for (const oc of ocsAbertas) {
          const itemIds = itemsByOrdem[oc.id] || [];
          let proxima: string | null = null;
          for (const itemId of itemIds) {
            const entregas = entregasMap[itemId] || [];
            const pendentes = entregas.filter(e => e.status === "pendente").sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega));
            if (pendentes.length > 0 && (!proxima || pendentes[0].dataEntrega < proxima)) {
              proxima = pendentes[0].dataEntrega;
            }
          }
          ocEntregaRefMap[oc.id] = proxima;
        }
      }

      const atrasadasPorObra: Record<number, number> = {};
      ocsAbertas.filter(r => r.obraId).forEach(r => {
        const dataRef = ocEntregaRefMap[r.id] || r.dataEntregaPrevista;
        if (dataRef && dataRef < hoje) {
          atrasadasPorObra[r.obraId!] = (atrasadasPorObra[r.obraId!] ?? 0) + 1;
        }
      });
      const ocsAtrasadasPorObra = Object.entries(atrasadasPorObra).map(([obraId, count]) => ({
        obraId: Number(obraId),
        obraNome: obraMap[Number(obraId)] ?? `Obra #${obraId}`,
        count,
      })).sort((a, b) => b.count - a.count);

      return { kpis, alertasOC, scsPendentesAprov, cotsPendentes, ocsRecentes, scsRecentes, gastosMensais, fornecedores: forn, obraMap, ocsAtrasadasPorObra };
    }),

  getComprasBadgeCounts: protectedProcedure
    .input(z.object({ companyIds: z.array(z.number()).min(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const ids = input.companyIds;
      for (const _cid of ids) await _assertCompanyAccess(ctx.user, _cid);
      const hoje = new Date().toISOString().slice(0, 10);

      const [scs, ocs] = await Promise.all([
        db.select({
          aprovacaoStatus: comprasSolicitacoes.aprovacaoStatus,
          status: comprasSolicitacoes.status,
          tipo: comprasSolicitacoes.tipo,
        }).from(comprasSolicitacoes).where(inArray(comprasSolicitacoes.companyId, ids)),
        db.select({
          status: comprasOrdens.status,
          dataEntregaPrevista: comprasOrdens.dataEntregaPrevista,
        }).from(comprasOrdens).where(inArray(comprasOrdens.companyId, ids)),
      ]);

      const aprovacoesPendentes = scs.filter(r => r.aprovacaoStatus === "aguardando" && r.status !== "cancelado").length;
      const emergenciais = scs.filter(r => r.aprovacaoStatus === "aguardando" && r.status !== "cancelado" && r.tipo === "emergencial").length;
      const ocsAtrasadas = ocs.filter(r => r.dataEntregaPrevista && r.dataEntregaPrevista < hoje && !["entregue", "cancelada", "recebido"].includes(r.status)).length;

      return { aprovacoesPendentes, emergenciais, ocsAtrasadas };
    }),

  getAlertasCompras: protectedProcedure
    .input(z.object({ companyIds: z.array(z.number()).min(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const ids = input.companyIds;
      for (const _cid of ids) await _assertCompanyAccess(ctx.user, _cid);
      const hoje = new Date().toISOString().slice(0, 10);
      const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      const [pagRows, notifRows, ocsRows, scsRows, scItensRows, obrasAlertas] = await Promise.all([
        db.select({
          id: purchaseAccountsPayable.id,
          ordemId: purchaseAccountsPayable.ordemId,
          supplierNome: purchaseAccountsPayable.supplierNome,
          valorTotal: purchaseAccountsPayable.valorTotal,
          status: purchaseAccountsPayable.status,
          dataVencimento: purchaseAccountsPayable.dataVencimento,
          parcelaNumero: purchaseAccountsPayable.parcelaNumero,
          parcelaTotal: purchaseAccountsPayable.parcelaTotal,
          obraId: purchaseAccountsPayable.obraId,
        }).from(purchaseAccountsPayable)
          .where(and(
            inArray(purchaseAccountsPayable.companyId, ids),
            or(eq(purchaseAccountsPayable.status, "liberado"), eq(purchaseAccountsPayable.status, "bloqueado")),
          )),

        db.select().from(almoxarifadoNotificacoes)
          .where(and(
            inArray(almoxarifadoNotificacoes.companyId, ids),
            eq(almoxarifadoNotificacoes.lida, false),
          ))
          .orderBy(desc(almoxarifadoNotificacoes.criadoEm))
          .limit(20),

        db.select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          status: comprasOrdens.status,
          dataEntregaPrevista: comprasOrdens.dataEntregaPrevista,
          fornecedorId: comprasOrdens.fornecedorId,
          fornecedorNome: comprasOrdens.fornecedorNome,
          obraId: comprasOrdens.obraId,
          total: comprasOrdens.total,
        }).from(comprasOrdens)
          .where(and(
            inArray(comprasOrdens.companyId, ids),
            or(
              eq(comprasOrdens.status, "pendente"),
              eq(comprasOrdens.status, "aprovada"),
              eq(comprasOrdens.status, "enviada"),
              eq(comprasOrdens.status, "parcial"),
            ),
          )),

        db.select({
          id: comprasSolicitacoes.id,
          numero: comprasSolicitacoes.numero,
          titulo: comprasSolicitacoes.titulo,
          obraId: comprasSolicitacoes.obraId,
        }).from(comprasSolicitacoes)
          .where(and(
            inArray(comprasSolicitacoes.companyId, ids),
            or(eq(comprasSolicitacoes.status, "pendente"), eq(comprasSolicitacoes.status, "em_cotacao")),
          )),

        db.select({
          id: comprasSolicitacoesItens.id,
          solicitacaoId: comprasSolicitacoesItens.solicitacaoId,
          orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
          descricao: comprasSolicitacoesItens.descricao,
        }).from(comprasSolicitacoesItens)
          .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
          .where(inArray(comprasSolicitacoes.companyId, ids)),

        db.select({ id: obras.id, nome: obras.nome })
          .from(obras)
          .where(inArray(obras.companyId, ids)),
      ]);

      const obraMapAlertas: Record<number, string> = {};
      for (const o of obrasAlertas) { if (o.id && o.nome) obraMapAlertas[o.id] = o.nome; }

      const pagVencidas = pagRows.filter(p =>
        p.status === "liberado" && p.dataVencimento && p.dataVencimento < hoje
      ).map(p => ({
        ...p, valorTotal: n(p.valorTotal), tipo: "vencida" as const,
      }));

      const pagProximas = pagRows.filter(p =>
        p.status === "liberado" && p.dataVencimento && p.dataVencimento >= hoje && p.dataVencimento <= em7dias
      ).map(p => ({
        ...p, valorTotal: n(p.valorTotal), tipo: "proxima" as const,
      }));

      const pagBloqueadas = pagRows.filter(p => p.status === "bloqueado").map(p => ({
        ...p, valorTotal: n(p.valorTotal), tipo: "bloqueada" as const,
      }));

      const CLOSED_OC = ["entregue", "cancelada", "recebido"];
      const ocsAtrasadas = ocsRows.filter(oc =>
        oc.dataEntregaPrevista && oc.dataEntregaPrevista < hoje && !CLOSED_OC.includes(oc.status ?? "")
      ).map(oc => ({
        id: oc.id,
        numeroOc: oc.numeroOc,
        status: oc.status,
        dataEntregaPrevista: oc.dataEntregaPrevista,
        fornecedorId: oc.fornecedorId ?? null,
        fornecedorNome: oc.fornecedorNome ?? null,
        obraId: oc.obraId ?? null,
        obraNome: oc.obraId ? (obraMapAlertas[oc.obraId] ?? null) : null,
        total: oc.total ? parseFloat(String(oc.total)) : 0,
        diasAtraso: Math.floor((Date.now() - new Date(oc.dataEntregaPrevista! + "T00:00:00").getTime()) / 86400000),
      }));
      const ocsProximas = ocsRows.filter(oc =>
        oc.dataEntregaPrevista && oc.dataEntregaPrevista >= hoje && oc.dataEntregaPrevista <= em7dias && !CLOSED_OC.includes(oc.status ?? "")
      ).map(oc => ({
        id: oc.id,
        numeroOc: oc.numeroOc,
        status: oc.status,
        dataEntregaPrevista: oc.dataEntregaPrevista,
        fornecedorId: oc.fornecedorId ?? null,
        fornecedorNome: oc.fornecedorNome ?? null,
        obraId: oc.obraId ?? null,
        obraNome: oc.obraId ? (obraMapAlertas[oc.obraId] ?? null) : null,
        total: oc.total ? parseFloat(String(oc.total)) : 0,
      }));

      const scsSemCobertura: { scId: number; numero: string; titulo: string; itensCount: number }[] = [];
      const scIds = scsRows.map(s => s.id);
      const itensAtivos = scItensRows.filter(i => scIds.includes(i.solicitacaoId));
      const scsSemOrcMap: Record<number, number> = {};
      for (const item of itensAtivos) {
        if (!item.orcamentoItemId) {
          scsSemOrcMap[item.solicitacaoId] = (scsSemOrcMap[item.solicitacaoId] ?? 0) + 1;
        }
      }
      for (const [scIdStr, count] of Object.entries(scsSemOrcMap)) {
        const scId = Number(scIdStr);
        const sc = scsRows.find(s => s.id === scId);
        if (sc) {
          scsSemCobertura.push({
            scId, numero: sc.numero ?? `SC-${scId}`, titulo: sc.titulo ?? "", itensCount: count,
          });
        }
      }

      const notifCompras = notifRows.filter(n => n.destinoModulo === "compras");
      const notifFinanceiro = notifRows.filter(n => n.destinoModulo === "financeiro");

      return {
        pagamentos: {
          vencidas: pagVencidas,
          proximas: pagProximas,
          bloqueadas: pagBloqueadas,
          totalVencido: pagVencidas.reduce((s, p) => s + p.valorTotal, 0),
          totalProximo: pagProximas.reduce((s, p) => s + p.valorTotal, 0),
          totalBloqueado: pagBloqueadas.reduce((s, p) => s + p.valorTotal, 0),
        },
        entregas: {
          atrasadas: ocsAtrasadas.length,
          proximas: ocsProximas.length,
          listaAtrasadas: ocsAtrasadas.slice(0, 10),
          listaProximas: ocsProximas.slice(0, 10),
        },
        cobertura: {
          scsSemCobertura: scsSemCobertura.slice(0, 10),
          totalSemCobertura: scsSemCobertura.length,
        },
        divergencias: {
          compras: notifCompras,
          financeiro: notifFinanceiro,
          total: notifRows.length,
        },
      };
    }),

  getDashboardPorObra: protectedProcedure
    .input(z.object({ companyIds: z.array(z.number()).min(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const ids = input.companyIds;
      for (const _cid of ids) await _assertCompanyAccess(ctx.user, _cid);
      const hoje = new Date().toISOString().slice(0, 10);

      const [ocsRows, scsRows, obrasRows, fornRows, pagRows] = await Promise.all([
        db.select({
          id: comprasOrdens.id,
          status: comprasOrdens.status,
          total: comprasOrdens.total,
          obraId: comprasOrdens.obraId,
          fornecedorId: comprasOrdens.fornecedorId,
          dataEntregaPrevista: comprasOrdens.dataEntregaPrevista,
          criadoEm: comprasOrdens.criadoEm,
        }).from(comprasOrdens)
          .where(inArray(comprasOrdens.companyId, ids)),

        db.select({
          id: comprasSolicitacoes.id,
          status: comprasSolicitacoes.status,
          obraId: comprasSolicitacoes.obraId,
        }).from(comprasSolicitacoes)
          .where(inArray(comprasSolicitacoes.companyId, ids)),

        db.select({ id: obras.id, nome: obras.nome, codigo: obras.codigo })
          .from(obras).where(inArray(obras.companyId, ids)),

        db.select({ id: fornecedores.id, nomeFantasia: fornecedores.nomeFantasia, razaoSocial: fornecedores.razaoSocial })
          .from(fornecedores).where(and(inArray(fornecedores.companyId, ids), eq(fornecedores.ativo, true))),

        db.select({
          obraId: purchaseAccountsPayable.obraId,
          valorTotal: purchaseAccountsPayable.valorTotal,
          valorPago: purchaseAccountsPayable.valorPago,
          status: purchaseAccountsPayable.status,
        }).from(purchaseAccountsPayable)
          .where(inArray(purchaseAccountsPayable.companyId, ids)),
      ]);

      const obraMap: Record<number, { nome: string; codigo: string | null }> = {};
      obrasRows.forEach(o => { obraMap[o.id] = { nome: o.nome, codigo: o.codigo }; });

      const fornMap: Record<number, string> = {};
      fornRows.forEach(f => { fornMap[f.id] = f.nomeFantasia || f.razaoSocial; });

      const CLOSED_OC = ["entregue", "cancelada", "recebido"];

      const obraStats: Record<number, {
        obraId: number; obraNome: string; obraCodigo: string | null;
        totalGasto: number; totalOCs: number; ocsPendentes: number; ocsAtrasadas: number;
        totalSCs: number; scsPendentes: number;
        totalPago: number; totalAPagar: number;
        fornecedoresUsados: Set<number>;
        gastosMensais: Record<string, number>;
      }> = {};

      const getObraStats = (obraId: number) => {
        if (!obraStats[obraId]) {
          const info = obraMap[obraId] || { nome: `Obra #${obraId}`, codigo: null };
          obraStats[obraId] = {
            obraId, obraNome: info.nome, obraCodigo: info.codigo,
            totalGasto: 0, totalOCs: 0, ocsPendentes: 0, ocsAtrasadas: 0,
            totalSCs: 0, scsPendentes: 0,
            totalPago: 0, totalAPagar: 0,
            fornecedoresUsados: new Set(),
            gastosMensais: {},
          };
        }
        return obraStats[obraId];
      };

      for (const oc of ocsRows) {
        if (!oc.obraId) continue;
        const stats = getObraStats(oc.obraId);
        const val = n(oc.total);
        if (oc.status !== "cancelada") {
          stats.totalGasto += val;
          stats.totalOCs++;
          const mes = oc.criadoEm.slice(0, 7);
          stats.gastosMensais[mes] = (stats.gastosMensais[mes] ?? 0) + val;
        }
        if (!CLOSED_OC.includes(oc.status)) stats.ocsPendentes++;
        if (oc.dataEntregaPrevista && oc.dataEntregaPrevista < hoje && !CLOSED_OC.includes(oc.status)) stats.ocsAtrasadas++;
        if (oc.fornecedorId) stats.fornecedoresUsados.add(oc.fornecedorId);
      }

      for (const sc of scsRows) {
        if (!sc.obraId) continue;
        const stats = getObraStats(sc.obraId);
        stats.totalSCs++;
        if (sc.status === "pendente" || sc.status === "em_cotacao") stats.scsPendentes++;
      }

      for (const pag of pagRows) {
        if (!pag.obraId) continue;
        const stats = getObraStats(pag.obraId);
        stats.totalPago += n(pag.valorPago);
        if (pag.status !== "pago" && pag.status !== "cancelado") {
          stats.totalAPagar += n(pag.valorTotal) - n(pag.valorPago);
        }
      }

      const result = Object.values(obraStats).map(s => ({
        obraId: s.obraId,
        obraNome: s.obraCodigo ? `${s.obraCodigo} – ${s.obraNome}` : s.obraNome,
        totalGasto: s.totalGasto,
        totalOCs: s.totalOCs,
        ocsPendentes: s.ocsPendentes,
        ocsAtrasadas: s.ocsAtrasadas,
        totalSCs: s.totalSCs,
        scsPendentes: s.scsPendentes,
        totalPago: s.totalPago,
        totalAPagar: s.totalAPagar,
        fornecedoresCount: s.fornecedoresUsados.size,
        topFornecedores: [...s.fornecedoresUsados].slice(0, 5).map(id => ({
          id, nome: fornMap[id] ?? `#${id}`,
        })),
        gastosMensais: Object.entries(s.gastosMensais)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-6)
          .map(([mes, valor]) => ({ mes, valor })),
      })).sort((a, b) => b.totalGasto - a.totalGasto);

      return { obras: result };
    }),

  // ══════════════════════════════════════════════════════════════
  // AVALIAÇÕES DE FORNECEDORES
  // ══════════════════════════════════════════════════════════════

  avaliarFornecedor: protectedProcedure
    .input(z.object({
      fornecedorId: z.number(),
      companyId:    z.number(),
      nota:         z.number().min(1).max(5),
      comentario:   z.string().optional(),
      criadoPor:    z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      await db.insert(avaliacoesFornecedor).values({
        fornecedorId: input.fornecedorId,
        companyId:    input.companyId,
        nota:         input.nota,
        comentario:   input.comentario ?? null,
        criadoPor:    input.criadoPor ?? null,
      });
      return { ok: true };
    }),

  listarAvaliacoesFornecedor: protectedProcedure
    .input(z.object({ fornecedorId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db
        .select()
        .from(avaliacoesFornecedor)
        .where(and(
          eq(avaliacoesFornecedor.fornecedorId, input.fornecedorId),
          eq(avaliacoesFornecedor.companyId, input.companyId),
        ))
        .orderBy(desc(avaliacoesFornecedor.criadoEm));
      return rows;
    }),

  rankingFornecedores: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT
          f.id,
          f.razao_social   AS "razaoSocial",
          f.nome_fantasia  AS "nomeFantasia",
          f.categorias,
          f.cidade,
          f.estado,
          COUNT(a.id)::int                        AS "totalAvaliacoes",
          ROUND(AVG(a.nota)::numeric, 1)::float   AS "mediaEstrelas"
        FROM fornecedores f
        LEFT JOIN avaliacoes_fornecedor a
          ON a.fornecedor_id = f.id AND a.company_id = ${input.companyId}
        WHERE f.company_id = ${input.companyId}
          AND f.ativo = true
        GROUP BY f.id, f.razao_social, f.nome_fantasia, f.categorias, f.cidade, f.estado
        HAVING COUNT(a.id) > 0
        ORDER BY "mediaEstrelas" DESC, "totalAvaliacoes" DESC
        LIMIT 50
      `);
      return rows as any[];
    }),

  // ══════════════════════════════════════════════════════════════
  // EAP PARA SC — retorna itens do orçamento + prazo do planejamento
  // SEM custos/metas (blind quotation até equalização)
  // ══════════════════════════════════════════════════════════════
  getInsumosComposicao: protectedProcedure
    .input(z.object({ companyId: z.number(), servicoCodigo: z.string(), orcamentoItemId: z.number().optional(), tipoSC: z.enum(["material", "servico", "pacote", "equipamento", "pecas_veiculo"]).optional(), incluirEquip: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const insumos = await db.select({
        insumoCodigo: composicaoInsumos.insumoCodigo,
        insumoDescricao: composicaoInsumos.insumoDescricao,
        unidade: composicaoInsumos.unidade,
        quantidade: composicaoInsumos.quantidade,
        precoUnitario: composicaoInsumos.precoUnitario,
        custoUnitTotal: composicaoInsumos.custoUnitTotal,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
        alocacaoEquip: composicaoInsumos.alocacaoEquip,
      }).from(composicaoInsumos)
        .where(and(
          eq(composicaoInsumos.companyId, input.companyId),
          eq(composicaoInsumos.composicaoCodigo, input.servicoCodigo),
        ))
        .orderBy(asc(composicaoInsumos.insumoDescricao));

      const filtered = filterInsumosByTipo(insumos as any[], input.tipoSC ?? "material", input.incluirEquip ?? false);

      const tipoSC = input.tipoSC ?? "material";
      return filtered.map(i => {
        const pu = n(i.precoUnitario);
        const mat = n(i.alocacaoMat);
        const mdo = n(i.alocacaoMdo);
        const alocTotal = mat + mdo;
        const ratioMat = alocTotal > 0 ? mat / alocTotal : 1;
        const puMat = Math.round(pu * ratioMat * 100) / 100;
        const puMdo = Math.round((pu - puMat) * 100) / 100;

        let puSegregado = pu;
        if (tipoSC === "material") {
          puSegregado = puMat;
        } else if (tipoSC === "servico") {
          puSegregado = puMdo;
        }

        return {
          insumoCodigo: i.insumoCodigo,
          descricao: i.insumoDescricao || "",
          unidade: i.unidade || "un",
          coeficiente: n(i.quantidade),
          precoUnitario: puSegregado,
          precoUnitarioOriginal: pu,
          precoUnitMat: puMat,
          precoUnitMdo: puMdo,
          custoUnitTotal: n(i.custoUnitTotal),
          alocacaoMat: mat,
          alocacaoMdo: mdo,
        };
      });
    }),

  getSaldoOrcamentario: protectedProcedure
    .input(z.object({ companyId: z.number(), orcamentoItemId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const [orcItem] = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        servicoCodigo: orcamentoItens.servicoCodigo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
        metaUnitTotal: orcamentoItens.metaUnitTotal,
        metaTotal: orcamentoItens.metaTotal,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.id, input.orcamentoItemId), eq(orcamentoItens.companyId, input.companyId)));

      if (!orcItem) return null;

      const qtdOrcada = n(orcItem.quantidade);

      const scItens = await db.select({
        quantidade: comprasSolicitacoesItens.quantidade,
        quantidadeServico: comprasSolicitacoesItens.quantidadeServico,
        statusItem: comprasSolicitacoesItens.statusItem,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
        .where(and(
          eq(comprasSolicitacoesItens.orcamentoItemId, input.orcamentoItemId),
          eq(comprasSolicitacoes.companyId, input.companyId),
          sql`${comprasSolicitacoes.status} NOT IN ('cancelado')`,
        ));

      const qtdJaSolicitada = scItens.reduce((acc, it) => acc + (it.quantidadeServico != null ? n(it.quantidadeServico) : n(it.quantidade)), 0);
      const qtdRecebidaSc = scItens.reduce((acc, it) => acc + n(it.quantidadeAtendida), 0);
      const saldoDisponivel = qtdOrcada - qtdJaSolicitada;

      const ocItens = await db.select({
        quantidade: comprasOrdensItens.quantidade,
        quantidadeEntregue: comprasOrdensItens.quantidadeEntregue,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .where(and(
          eq(comprasSolicitacoesItens.orcamentoItemId, input.orcamentoItemId),
          eq(comprasOrdens.companyId, input.companyId),
          sql`${comprasOrdens.status} NOT IN ('cancelada')`,
        ));

      const qtdComprada = ocItens.reduce((acc, it) => acc + n(it.quantidade), 0);
      const qtdEntregue = ocItens.reduce((acc, it) => acc + n(it.quantidadeEntregue), 0);

      return {
        orcamentoItemId: orcItem.id,
        eapCodigo: orcItem.eapCodigo,
        descricao: orcItem.descricao,
        unidade: orcItem.unidade,
        qtdOrcada,
        qtdJaSolicitada,
        qtdComprada,
        qtdRecebida: Math.max(qtdRecebidaSc, qtdEntregue),
        saldoDisponivel,
        metaUnitTotal: n(orcItem.metaUnitTotal),
        metaTotal: n(orcItem.metaTotal),
      };
    }),

  getSaldoItensSC: protectedProcedure
    .input(z.object({ companyId: z.number(), solicitacaoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [sc] = await db.select({ id: comprasSolicitacoes.id, obraId: comprasSolicitacoes.obraId, tipo: comprasSolicitacoes.tipo, incluirEquipamentos: comprasSolicitacoes.incluirEquipamentos }).from(comprasSolicitacoes)
        .where(and(eq(comprasSolicitacoes.id, input.solicitacaoId), eq(comprasSolicitacoes.companyId, input.companyId)));
      if (!sc) return [];
      const scTipo2 = sc.tipo ?? "material";
      const incluirEquip2 = sc.incluirEquipamentos ?? false;
      const scTipoGroup = sc.tipo === "servico" || sc.tipo === "pacote" ? "mdo" : sc.tipo === "equipamento" ? "equip" : "mat";

      const scItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, sc.id));
      if (scItens.length === 0) return [];

      const eapSemOrcId = scItens.filter(i => !i.orcamentoItemId && i.eapCodigo);
      if (eapSemOrcId.length > 0 && sc.obraId) {
        const orcRows2 = await db.select({ id: orcamentos.id }).from(orcamentos)
          .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, sc.obraId), isNull(orcamentos.deletedAt)))
          .orderBy(desc(orcamentos.createdAt)).limit(1);
        if (orcRows2.length > 0) {
          const eapCodes = eapSemOrcId.map(i => i.eapCodigo!);
          const orcLookup = await db.select({ id: orcamentoItens.id, eapCodigo: orcamentoItens.eapCodigo })
            .from(orcamentoItens)
            .where(and(eq(orcamentoItens.orcamentoId, orcRows2[0].id), inArray(orcamentoItens.eapCodigo, eapCodes)));
          const eapToOrcId: Record<string, number> = {};
          for (const r of orcLookup) if (r.eapCodigo) eapToOrcId[r.eapCodigo] = r.id;
          for (const item of scItens) {
            if (!item.orcamentoItemId && item.eapCodigo && eapToOrcId[item.eapCodigo]) {
              (item as any).orcamentoItemId = eapToOrcId[item.eapCodigo];
            }
          }
        }
      }

      const orcItemIds = scItens.map(i => i.orcamentoItemId).filter(Boolean) as number[];
      let orcItensData: Record<number, { quantidade: string; descricao: string; unidade: string | null; servicoCodigo: string | null }> = {};
      if (orcItemIds.length > 0) {
        const rows = await db.select({ id: orcamentoItens.id, quantidade: orcamentoItens.quantidade, descricao: orcamentoItens.descricao, unidade: orcamentoItens.unidade, servicoCodigo: orcamentoItens.servicoCodigo })
          .from(orcamentoItens).where(and(inArray(orcamentoItens.id, orcItemIds), eq(orcamentoItens.companyId, input.companyId)));
        for (const r of rows) orcItensData[r.id] = { quantidade: r.quantidade ?? "0", descricao: r.descricao ?? "", unidade: r.unidade, servicoCodigo: r.servicoCodigo ?? null };
      }

      let insumoOrcData: Record<string, { quantidadeTotal: number; descricao: string; unidade: string | null }> = {};
      const insumoCodigos = scItens.filter(i => i.insumoCodigo).map(i => i.insumoCodigo!);
      if (insumoCodigos.length > 0 && sc.obraId) {
        const orcRows = await db.select({ id: orcamentos.id }).from(orcamentos)
          .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, sc.obraId), isNull(orcamentos.deletedAt)))
          .orderBy(desc(orcamentos.createdAt)).limit(1);
        const orcIds = orcRows.map(o => o.id);
        if (orcIds.length > 0) {
          const orcItemsForInsumo = await db.select({
            id: orcamentoItens.id,
            servicoCodigo: orcamentoItens.servicoCodigo,
            quantidade: orcamentoItens.quantidade,
          }).from(orcamentoItens)
            .where(and(inArray(orcamentoItens.orcamentoId, orcIds), eq(orcamentoItens.companyId, input.companyId)));
          const servicosComCodigo = orcItemsForInsumo.filter(it => it.servicoCodigo);
          if (servicosComCodigo.length > 0) {
            const servicoCodigos = [...new Set(servicosComCodigo.map(it => it.servicoCodigo!))];
            const allCompInsumos = await db.select({
              composicaoCodigo: composicaoInsumos.composicaoCodigo,
              insumoCodigo: composicaoInsumos.insumoCodigo,
              insumoDescricao: composicaoInsumos.insumoDescricao,
              unidade: composicaoInsumos.unidade,
              quantidade: composicaoInsumos.quantidade,
              alocacaoMat: composicaoInsumos.alocacaoMat,
              alocacaoMdo: composicaoInsumos.alocacaoMdo,
            }).from(composicaoInsumos)
              .where(and(eq(composicaoInsumos.companyId, Number(input.companyId)), inArray(composicaoInsumos.composicaoCodigo, servicoCodigos)));
            const scTipo2 = sc.tipo || "material";
            const filteredCompInsumos = filterInsumosByTipo(allCompInsumos as any[], scTipo2, false);
            for (const ins of filteredCompInsumos) {
              const code = ins.insumoCodigo;
              if (!code || !insumoCodigos.includes(code)) continue;
              const coef = n(ins.quantidade);
              const matchingSvcs = servicosComCodigo.filter(s => s.servicoCodigo === ins.composicaoCodigo);
              for (const svc of matchingSvcs) {
                const qtdInsumo = n(svc.quantidade) * coef;
                if (!insumoOrcData[code]) {
                  insumoOrcData[code] = { quantidadeTotal: 0, descricao: ins.insumoDescricao || "", unidade: ins.unidade };
                }
                insumoOrcData[code].quantidadeTotal += qtdInsumo;
              }
            }
          }
        }
      }

      const insumoSolicitadoMap: Record<string, number> = {};
      if (insumoCodigos.length > 0 && sc.obraId) {
        const rows = await db.execute(sql`
          SELECT si.insumo_codigo, COALESCE(SUM(si.quantidade::numeric), 0) as total
          FROM compras_solicitacoes_itens si
          JOIN compras_solicitacoes s ON s.id = si.solicitacao_id
          WHERE si.insumo_codigo IN (${sql.join(insumoCodigos.map(c => sql`${c}`), sql`, `)})
            AND s.company_id = ${input.companyId} AND s.status NOT IN ('cancelado')
            AND s.obra_id = ${sc.obraId}
            AND s.id != ${sc.id}
            AND ${scTipoGroup === "mat"
              ? sql`(s.tipo IS NULL OR s.tipo = 'material')`
              : scTipoGroup === "equip"
              ? sql`s.tipo = 'equipamento'`
              : sql`s.tipo IN ('servico', 'pacote')`}
          GROUP BY si.insumo_codigo
        `);
        for (const r of (rows as any).rows ?? []) insumoSolicitadoMap[r.insumo_codigo] = n(r.total);
      }

      const insumoCompradoMap: Record<string, { qtd: number; ocs: string[] }> = {};
      if (insumoCodigos.length > 0 && sc.obraId) {
        const rows = await db.execute(sql`
          SELECT si.insumo_codigo, oi2.quantidade::numeric as qtd, o.numero_oc
          FROM compras_solicitacoes_itens si
          JOIN compras_ordens_itens oi2 ON oi2.solicitacao_item_id = si.id
          JOIN compras_ordens o ON o.id = oi2.ordem_id AND o.status NOT IN ('cancelada') AND o.company_id = ${input.companyId}
          JOIN compras_solicitacoes s ON s.id = si.solicitacao_id AND s.obra_id = ${sc.obraId}
          WHERE si.insumo_codigo IN (${sql.join(insumoCodigos.map(c => sql`${c}`), sql`, `)})
            AND ${scTipoGroup === "mat"
              ? sql`(s.tipo IS NULL OR s.tipo = 'material')`
              : scTipoGroup === "equip"
              ? sql`s.tipo = 'equipamento'`
              : sql`s.tipo IN ('servico', 'pacote')`}
        `);
        for (const r of (rows as any).rows ?? []) {
          const cod = r.insumo_codigo;
          if (!insumoCompradoMap[cod]) insumoCompradoMap[cod] = { qtd: 0, ocs: [] };
          insumoCompradoMap[cod].qtd += n(r.qtd);
          if (r.numero_oc && !insumoCompradoMap[cod].ocs.includes(r.numero_oc)) insumoCompradoMap[cod].ocs.push(r.numero_oc);
        }
      }

      const solicitadoMap: Record<string, number> = {};
      if (orcItemIds.length > 0) {
        const rows = await db.execute(sql`
          SELECT si.orcamento_item_id, si.insumo_codigo, COALESCE(SUM(si.quantidade::numeric), 0) as total
          FROM compras_solicitacoes_itens si
          JOIN compras_solicitacoes s ON s.id = si.solicitacao_id
          WHERE si.orcamento_item_id IN (${sql.join(orcItemIds.map(id => sql`${id}`), sql`, `)})
            AND s.company_id = ${input.companyId} AND s.status NOT IN ('cancelado')
            AND s.id != ${sc.id}
            AND ${scTipoGroup === "mat"
              ? sql`(s.tipo IS NULL OR s.tipo = 'material')`
              : scTipoGroup === "equip"
              ? sql`s.tipo = 'equipamento'`
              : sql`s.tipo IN ('servico', 'pacote')`}
          GROUP BY si.orcamento_item_id, si.insumo_codigo
        `);
        for (const r of (rows as any).rows ?? []) {
          const key = r.insumo_codigo ? `${r.orcamento_item_id}:${r.insumo_codigo}` : String(r.orcamento_item_id);
          solicitadoMap[key] = n(r.total);
        }
      }

      const compradoMap: Record<string, { qtd: number; ocs: string[] }> = {};
      if (orcItemIds.length > 0) {
        const rows = await db.execute(sql`
          SELECT si.orcamento_item_id, si.insumo_codigo, oi2.quantidade::numeric as qtd, o.numero_oc
          FROM compras_solicitacoes_itens si
          JOIN compras_ordens_itens oi2 ON oi2.solicitacao_item_id = si.id
          JOIN compras_ordens o ON o.id = oi2.ordem_id AND o.status NOT IN ('cancelada') AND o.company_id = ${input.companyId}
          JOIN compras_solicitacoes s ON s.id = si.solicitacao_id
          WHERE si.orcamento_item_id IN (${sql.join(orcItemIds.map(id => sql`${id}`), sql`, `)})
            AND ${scTipoGroup === "mat"
              ? sql`(s.tipo IS NULL OR s.tipo = 'material')`
              : scTipoGroup === "equip"
              ? sql`s.tipo = 'equipamento'`
              : sql`s.tipo IN ('servico', 'pacote')`}
        `);
        for (const r of (rows as any).rows ?? []) {
          const key = r.insumo_codigo ? `${r.orcamento_item_id}:${r.insumo_codigo}` : String(r.orcamento_item_id);
          if (!compradoMap[key]) compradoMap[key] = { qtd: 0, ocs: [] };
          compradoMap[key].qtd += n(r.qtd);
          if (r.numero_oc && !compradoMap[key].ocs.includes(r.numero_oc)) compradoMap[key].ocs.push(r.numero_oc);
        }
      }

      const svcCodigos = [...new Set(Object.values(orcItensData).map(o => o.servicoCodigo).filter(Boolean))] as string[];
      let composicaoInsumosMap: Record<string, { insumoCodigo: string; descricao: string; unidade: string | null; coeficiente: number; alocacaoMat: number; alocacaoMdo: number }[]> = {};
      if (svcCodigos.length > 0) {
        const compIns = await db.select({
          composicaoCodigo: composicaoInsumos.composicaoCodigo,
          insumoCodigo: composicaoInsumos.insumoCodigo,
          descricao: composicaoInsumos.insumoDescricao,
          unidade: composicaoInsumos.unidade,
          coeficiente: composicaoInsumos.quantidade,
          alocacaoMat: composicaoInsumos.alocacaoMat,
          alocacaoMdo: composicaoInsumos.alocacaoMdo,
          alocacaoEquip: composicaoInsumos.alocacaoEquip,
        }).from(composicaoInsumos)
          .where(and(eq(composicaoInsumos.companyId, Number(input.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCodigos)));
        for (const ins of compIns) {
          const key = ins.composicaoCodigo;
          if (!composicaoInsumosMap[key]) composicaoInsumosMap[key] = [];
          composicaoInsumosMap[key].push({
            insumoCodigo: ins.insumoCodigo || "",
            descricao: ins.descricao || "",
            unidade: ins.unidade,
            coeficiente: n(ins.coeficiente),
            alocacaoMat: n(ins.alocacaoMat),
            alocacaoMdo: n(ins.alocacaoMdo),
            alocacaoEquip: n(ins.alocacaoEquip),
          });
        }
      }

      return scItens.map(item => {
        const orcId = item.orcamentoItemId;
        const insCode = item.insumoCodigo;
        const orcData = orcId ? orcItensData[orcId] : null;

        let vinculado = false;
        let qtdOrcada = 0;
        let qtdSolicitada = 0;
        let qtdComprada = 0;
        let ocsVinculadas: string[] = [];
        let fonteVinculo: "item" | "insumo" | null = null;

        const coef = n(item.coeficiente);
        const isInsumoDeComposicao = !!(item.insumoCodigo && coef > 0);

        if (isInsumoDeComposicao && insCode && insumoOrcData[insCode]) {
          vinculado = true;
          fonteVinculo = "insumo";
          qtdOrcada = insumoOrcData[insCode].quantidadeTotal;
          qtdSolicitada = insumoSolicitadoMap[insCode] ?? 0;
          const comp = insumoCompradoMap[insCode];
          qtdComprada = comp?.qtd ?? 0;
          ocsVinculadas = comp?.ocs ?? [];
        } else if (orcId && orcData) {
          vinculado = true;
          fonteVinculo = "item";
          if (isInsumoDeComposicao) {
            qtdOrcada = n(orcData.quantidade) * coef;
          } else {
            qtdOrcada = n(orcData.quantidade);
          }
          const mapKey = item.insumoCodigo ? `${orcId}:${item.insumoCodigo}` : String(orcId);
          qtdSolicitada = solicitadoMap[mapKey] ?? 0;
          const comp = compradoMap[mapKey];
          qtdComprada = comp?.qtd ?? 0;
          ocsVinculadas = comp?.ocs ?? [];
        } else if (insCode && insumoOrcData[insCode]) {
          vinculado = true;
          fonteVinculo = "insumo";
          qtdOrcada = insumoOrcData[insCode].quantidadeTotal;
          qtdSolicitada = insumoSolicitadoMap[insCode] ?? 0;
          const comp = insumoCompradoMap[insCode];
          qtdComprada = comp?.qtd ?? 0;
          ocsVinculadas = comp?.ocs ?? [];
        }

        const qtdEstaSC = n(item.quantidade);
        const consumido = Math.max(qtdSolicitada, qtdComprada);
        const saldoRaw = vinculado ? qtdOrcada - consumido : -qtdEstaSC;
        const saldo = Math.round(saldoRaw * 1000) / 1000;
        const eps = 0.01;

        const semVerbaFlag = item.semVerba ?? false;
        const isTitulo = vinculado && qtdOrcada === 0 && qtdEstaSC <= 1;
        let situacao: "ok" | "sem_vinculo" | "sem_vinculo_sem_verba" | "verba_esgotada_compras" | "verba_esgotada_solicitacoes" | "saldo_insuficiente" = "ok";
        if (isTitulo) {
          situacao = "ok";
        } else if (!vinculado) {
          situacao = semVerbaFlag ? "sem_vinculo_sem_verba" : "sem_vinculo";
        } else if (saldo < -eps) {
          if (qtdComprada >= qtdOrcada - eps) {
            situacao = "verba_esgotada_compras";
          } else if (qtdSolicitada >= qtdOrcada - eps) {
            situacao = "verba_esgotada_solicitacoes";
          } else {
            situacao = "saldo_insuficiente";
          }
        } else if (saldo + eps < qtdEstaSC && saldo >= -eps) {
          situacao = "saldo_insuficiente";
        }

        const svcCode = orcData?.servicoCodigo;
        let insumos: { insumoCodigo: string; descricao: string; unidade: string | null; coeficiente: number; qtdCalculada: number }[] = [];
        if (svcCode && composicaoInsumosMap[svcCode]) {
          const allIns = composicaoInsumosMap[svcCode];
          let filtered = filterInsumosByTipo(allIns, scTipo2, incluirEquip2);
          const incAjud = item.incluirAjudante ?? true;
          if (!incAjud) {
            const ajudRe = /ajudante|servente|auxiliar/i;
            filtered = filtered.filter(i => !ajudRe.test(i.descricao || ""));
          }
          insumos = filtered.map(i => ({
            insumoCodigo: i.insumoCodigo,
            descricao: i.descricao,
            unidade: i.unidade,
            coeficiente: i.coeficiente,
            qtdCalculada: Math.round(qtdEstaSC * i.coeficiente * 1000) / 1000,
          }));
        }

        return {
          id: item.id,
          descricao: item.descricao,
          unidade: item.unidade ?? "un",
          qtdEstaSC,
          qtdOrcada,
          qtdSolicitada,
          qtdComprada,
          ocsVinculadas,
          saldo,
          situacao,
          fonteVinculo,
          semVerbaFlag: item.semVerba ?? false,
          insumos,
        };
      });
    }),

  getItensCotacaoFromSC: protectedProcedure
    .input(z.object({ companyId: z.number(), solicitacaoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [sc] = await db.select().from(comprasSolicitacoes).where(and(eq(comprasSolicitacoes.id, input.solicitacaoId), eq(comprasSolicitacoes.companyId, input.companyId)));
      if (!sc) throw new Error("SC não encontrada");

      const scItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, sc.id));
      if (scItens.length === 0) return { itens: [], alertas: [] };

      const scTipo = sc.tipo ?? "material";
      const incluirEquip = (sc as any).incluirEquipamentos ?? false;

      const orcItemIds = scItens.map(i => i.orcamentoItemId).filter(Boolean) as number[];
      let orcItensData: Record<number, { servicoCodigo: string | null; quantidade: string }> = {};
      if (orcItemIds.length > 0) {
        const rows = await db.select({ id: orcamentoItens.id, servicoCodigo: orcamentoItens.servicoCodigo, quantidade: orcamentoItens.quantidade })
          .from(orcamentoItens).where(and(inArray(orcamentoItens.id, orcItemIds), eq(orcamentoItens.companyId, input.companyId)));
        for (const r of rows) orcItensData[r.id] = { servicoCodigo: r.servicoCodigo ?? null, quantidade: r.quantidade ?? "0" };
      }

      const svcCodigos = [...new Set(Object.values(orcItensData).map(o => o.servicoCodigo).filter(Boolean))] as string[];
      let composicaoInsumosMap: Record<string, { insumoCodigo: string; descricao: string; unidade: string | null; coeficiente: number; precoUnitario: number; alocacaoMat: number; alocacaoMdo: number; alocacaoEquip: number }[]> = {};
      if (svcCodigos.length > 0) {
        const compIns = await db.select({
          composicaoCodigo: composicaoInsumos.composicaoCodigo,
          insumoCodigo: composicaoInsumos.insumoCodigo,
          descricao: composicaoInsumos.insumoDescricao,
          unidade: composicaoInsumos.unidade,
          coeficiente: composicaoInsumos.quantidade,
          precoUnitario: composicaoInsumos.precoUnitario,
          alocacaoMat: composicaoInsumos.alocacaoMat,
          alocacaoMdo: composicaoInsumos.alocacaoMdo,
          alocacaoEquip: composicaoInsumos.alocacaoEquip,
        }).from(composicaoInsumos)
          .where(and(eq(composicaoInsumos.companyId, Number(input.companyId)), inArray(composicaoInsumos.composicaoCodigo, svcCodigos)));
        for (const ins of compIns) {
          const key = ins.composicaoCodigo;
          if (!composicaoInsumosMap[key]) composicaoInsumosMap[key] = [];
          composicaoInsumosMap[key].push({
            insumoCodigo: ins.insumoCodigo || "",
            descricao: ins.descricao || "",
            unidade: ins.unidade,
            coeficiente: n(ins.coeficiente),
            precoUnitario: n(ins.precoUnitario),
            alocacaoMat: n(ins.alocacaoMat),
            alocacaoMdo: n(ins.alocacaoMdo),
            alocacaoEquip: n(ins.alocacaoEquip),
          });
        }
      }

      const agrupado: Record<string, { insumoCodigo: string; descricao: string; unidade: string; quantidade: number; precoUnitario: number; origemSCItemIds: number[] }> = {};

      for (const item of scItens) {
        const orcId = item.orcamentoItemId;
        const orcData = orcId ? orcItensData[orcId] : null;
        const svcCode = orcData?.servicoCodigo;
        const qtdSC = n(item.quantidade);

        if (svcCode && composicaoInsumosMap[svcCode]) {
          const allIns = composicaoInsumosMap[svcCode];
          let filtered = filterInsumosByTipo(allIns, scTipo, incluirEquip);
          const incAjud = item.incluirAjudante ?? true;
          if (!incAjud) {
            const ajudRe = /ajudante|servente|auxiliar/i;
            filtered = filtered.filter(i => !ajudRe.test(i.descricao || ""));
          }

          for (const ins of filtered) {
            const qtdCalculada = Math.round(qtdSC * ins.coeficiente * 1000) / 1000;
            const key = ins.insumoCodigo || `comp_${svcCode}_${ins.descricao}_${ins.unidade}`;
            if (agrupado[key]) {
              agrupado[key].quantidade = Math.round((agrupado[key].quantidade + qtdCalculada) * 1000) / 1000;
              if (!agrupado[key].origemSCItemIds.includes(item.id)) agrupado[key].origemSCItemIds.push(item.id);
            } else {
              agrupado[key] = {
                insumoCodigo: ins.insumoCodigo,
                descricao: ins.descricao,
                unidade: ins.unidade ?? "un",
                quantidade: qtdCalculada,
                precoUnitario: ins.precoUnitario,
                origemSCItemIds: [item.id],
              };
            }
          }
        } else {
          const key = `direct_${item.id}`;
          agrupado[key] = {
            insumoCodigo: item.insumoCodigo ?? "",
            descricao: item.descricao ?? "",
            unidade: item.unidade ?? "un",
            quantidade: qtdSC,
            precoUnitario: 0,
            origemSCItemIds: [item.id],
          };
        }
      }

      const agrupadoEntries = Object.entries(agrupado).sort((a, b) => a[1].descricao.localeCompare(b[1].descricao));
      const itensCotacao = agrupadoEntries.map(([, v]) => v);
      const itensCotacaoKeys = agrupadoEntries.map(([k]) => k);

      const descToKey: Record<string, string> = {};
      for (const [key, item] of Object.entries(agrupado)) {
        if (item.descricao) {
          const normalizedDesc = item.descricao.toLowerCase().trim().substring(0, 40);
          descToKey[normalizedDesc] = key;
        }
      }

      let historico: Record<string, { fornecedorNome: string; precoUnitario: number; data: string; numeroOc: string; obraId: number | null }[]> = {};
      if (Object.keys(agrupado).length > 0) {
        const histRows = await db.select({
          descricaoItem: comprasOrdensItens.descricao,
          precoUnitario: comprasOrdensItens.precoUnitario,
          fornecedorNome: comprasOrdens.fornecedorNome,
          data: comprasOrdens.criadoEm,
          numeroOc: comprasOrdens.numeroOc,
          obraId: comprasOrdens.obraId,
          status: comprasOrdens.status,
        })
        .from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          sql`${comprasOrdens.status} NOT IN ('cancelada', 'recusada')`,
        ))
        .orderBy(desc(comprasOrdens.criadoEm))
        .limit(200);

        for (const row of histRows) {
          const descLower = (row.descricaoItem ?? "").toLowerCase().trim();
          const descPrefix = descLower.substring(0, 40);

          const matchedKey = descToKey[descPrefix];
          if (matchedKey) {
            if (!historico[matchedKey]) historico[matchedKey] = [];
            if (historico[matchedKey].length < 3) {
              historico[matchedKey].push({
                fornecedorNome: row.fornecedorNome ?? "",
                precoUnitario: n(row.precoUnitario),
                data: row.data ? new Date(row.data).toISOString() : "",
                numeroOc: row.numeroOc ?? "",
                obraId: row.obraId ?? null,
              });
            }
          }
        }
      }

      const alertas: { insumoCodigo: string; descricao: string; mensagem: string }[] = [];
      for (let idx = 0; idx < itensCotacao.length; idx++) {
        const item = itensCotacao[idx];
        const key = itensCotacaoKeys[idx];
        const hist = historico[key];
        if (hist && hist.length > 0) {
          const recente = hist[0];
          const diasAtras = Math.floor((Date.now() - new Date(recente.data).getTime()) / (1000 * 60 * 60 * 24));
          if (diasAtras <= 30 && recente.obraId && recente.obraId !== sc.obraId) {
            alertas.push({
              insumoCodigo: item.insumoCodigo,
              descricao: item.descricao,
              mensagem: `Comprado há ${diasAtras} dia(s) para outra obra (${recente.numeroOc}) por R$ ${recente.precoUnitario.toFixed(2)} — fornecedor: ${recente.fornecedorNome}`,
            });
          }
        }
      }

      return {
        itens: itensCotacao.map((item, idx) => ({
          ...item,
          historico: historico[itensCotacaoKeys[idx]] ?? [],
        })),
        alertas,
      };
    }),

  getHistoricoPrecos: protectedProcedure
    .input(z.object({ companyId: z.number(), insumoCodigo: z.string().optional(), descricao: z.string().optional(), descricaoInsumo: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const conditions = [eq(comprasOrdensItens.id, comprasOrdensItens.id)];

      const rows = await db.select({
        descricao: comprasOrdensItens.descricao,
        unidade: comprasOrdensItens.unidade,
        precoUnitario: comprasOrdensItens.precoUnitario,
        quantidade: comprasOrdensItens.quantidade,
        fornecedorNome: comprasOrdens.fornecedorNome,
        dataOc: comprasOrdens.criadoEm,
        numeroOc: comprasOrdens.numeroOc,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          (input.descricaoInsumo || input.descricao) ? ilike(comprasOrdensItens.descricao, `%${input.descricaoInsumo || input.descricao}%`) : undefined,
        ))
        .orderBy(desc(comprasOrdens.criadoEm))
        .limit(20);

      return rows.map(r => ({
        descricao: r.descricao,
        unidade: r.unidade,
        precoUnitario: n(r.precoUnitario),
        quantidade: n(r.quantidade),
        fornecedor: r.fornecedorNome,
        fornecedorNome: r.fornecedorNome,
        data: r.dataOc,
        dataOc: r.dataOc,
        numeroCotacao: r.numeroOc,
        numeroOc: r.numeroOc,
      }));
    }),

  getInsumosConsolidados: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), busca: z.string().optional(), tipoSC: z.enum(["material", "servico", "pacote", "equipamento", "pecas_veiculo"]).optional(), incluirEquip: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt)).limit(1);
      if (!orc) return [];

      const orcItems = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        servicoCodigo: orcamentoItens.servicoCodigo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));

      const servicos = orcItems.filter(it => it.servicoCodigo);
      if (!servicos.length) return [];

      const servicoCodigos = [...new Set(servicos.map(it => it.servicoCodigo!))];
      const allInsumos = await db.select({
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        insumoCodigo: composicaoInsumos.insumoCodigo,
        insumoDescricao: composicaoInsumos.insumoDescricao,
        unidade: composicaoInsumos.unidade,
        quantidade: composicaoInsumos.quantidade,
        precoUnitario: composicaoInsumos.precoUnitario,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
        alocacaoEquip: composicaoInsumos.alocacaoEquip,
      }).from(composicaoInsumos)
        .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, servicoCodigos)));

      let filteredInsumos: typeof allInsumos;
      filteredInsumos = filterInsumosByTipo(allInsumos as any[], input.tipoSC ?? "material", input.incluirEquip ?? false) as typeof allInsumos;

      const consolidado: Record<string, {
        insumoCodigo: string; descricao: string; unidade: string;
        qtdTotalOrcada: number; precoMedio: number; composicoes: string[];
        eapItens: { orcamentoItemId: number; eapCodigo: string; servicoCodigo: string; servicoDescricao: string; qtdServico: number; coeficiente: number; qtdInsumo: number }[];
      }> = {};

      for (const ins of filteredInsumos) {
        const key = ins.insumoCodigo || ins.insumoDescricao || "";
        if (!consolidado[key]) {
          consolidado[key] = {
            insumoCodigo: ins.insumoCodigo || "",
            descricao: ins.insumoDescricao || "",
            unidade: ins.unidade || "un",
            qtdTotalOrcada: 0,
            precoMedio: 0,
            composicoes: [],
            eapItens: [],
          };
        }
        const entry = consolidado[key];
        if (!entry.composicoes.includes(ins.composicaoCodigo)) entry.composicoes.push(ins.composicaoCodigo);
        const coef = n(ins.quantidade);
        const pu = n(ins.precoUnitario);
        const matchingServicos = servicos.filter(s => s.servicoCodigo === ins.composicaoCodigo);
        for (const svc of matchingServicos) {
          const qtdServico = n(svc.quantidade);
          const qtdInsumo = qtdServico * coef;
          entry.qtdTotalOrcada += qtdInsumo;
          entry.eapItens.push({ orcamentoItemId: svc.id, eapCodigo: svc.eapCodigo, servicoCodigo: svc.servicoCodigo!, servicoDescricao: svc.descricao || svc.servicoCodigo!, qtdServico, coeficiente: coef, qtdInsumo });
        }
        if (pu > 0) entry.precoMedio = pu;
      }

      let result = Object.values(consolidado).filter(c => c.qtdTotalOrcada > 0);
      if (input.busca && input.busca.trim().length >= 2) {
        const term = input.busca.trim().toLowerCase();
        result = result.filter(c => c.descricao.toLowerCase().includes(term) || c.insumoCodigo.toLowerCase().includes(term));
      }

      const scRows = await db.select({
        orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        quantidade: comprasSolicitacoesItens.quantidade,
        solicitacaoId: comprasSolicitacoes.id,
        scNumero: comprasSolicitacoes.numeroSc,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
        .where(and(eq(comprasSolicitacoes.companyId, input.companyId), eq(comprasSolicitacoes.obraId, input.obraId), sql`${comprasSolicitacoes.status} NOT IN ('cancelado')`));
      const scMap: Record<string, number> = {};
      const scDocsMap: Record<string, { id: number; numero: string }[]> = {};
      const scByOrcItemMap: Record<string, { orcItemIds: number[]; docs: { orcItemId: number; scId: number; scNumero: string }[] }> = {};
      for (const sc of scRows) {
        const key = sc.insumoCodigo || "";
        scMap[key] = (scMap[key] || 0) + n(sc.quantidade);
        if (!scDocsMap[key]) scDocsMap[key] = [];
        const num = sc.scNumero || `SC-${sc.solicitacaoId}`;
        if (!scDocsMap[key].some(d => d.id === sc.solicitacaoId)) scDocsMap[key].push({ id: sc.solicitacaoId, numero: num });
        if (!scByOrcItemMap[key]) scByOrcItemMap[key] = { orcItemIds: [], docs: [] };
        if (sc.orcamentoItemId && !scByOrcItemMap[key].orcItemIds.includes(sc.orcamentoItemId)) scByOrcItemMap[key].orcItemIds.push(sc.orcamentoItemId);
        if (sc.orcamentoItemId) scByOrcItemMap[key].docs.push({ orcItemId: sc.orcamentoItemId, scId: sc.solicitacaoId, scNumero: num });
      }

      const ocRows = await db.select({
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        quantidade: comprasOrdensItens.quantidade,
        quantidadeEntregue: comprasOrdensItens.quantidadeEntregue,
        ordemId: comprasOrdens.id,
        ocNumero: comprasOrdens.numeroOc,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .where(and(eq(comprasOrdens.companyId, input.companyId), eq(comprasOrdens.obraId, input.obraId), sql`${comprasOrdens.status} NOT IN ('cancelada')`));
      const ocMapComprado: Record<string, number> = {};
      const ocMapRecebido: Record<string, number> = {};
      const ocDocsMap: Record<string, { id: number; numero: string }[]> = {};
      for (const oc of ocRows) {
        const key = oc.insumoCodigo || "";
        ocMapComprado[key] = (ocMapComprado[key] || 0) + n(oc.quantidade);
        ocMapRecebido[key] = (ocMapRecebido[key] || 0) + n(oc.quantidadeEntregue);
        if (!ocDocsMap[key]) ocDocsMap[key] = [];
        if (!ocDocsMap[key].some(d => d.id === oc.ordemId)) ocDocsMap[key].push({ id: oc.ordemId, numero: oc.ocNumero });
      }

      const cotRows = await db.select({
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        quantidade: comprasSolicitacoesItens.quantidade,
        cotacaoId: comprasCotacoes.id,
        cotNumero: comprasCotacoes.numeroCotacao,
      }).from(comprasCotacoesItens)
        .innerJoin(comprasSolicitacoesItens, eq(comprasCotacoesItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .innerJoin(comprasCotacoes, eq(comprasCotacoesItens.cotacaoId, comprasCotacoes.id))
        .where(and(eq(comprasCotacoes.companyId, input.companyId), eq(comprasCotacoes.obraId, input.obraId), sql`${comprasCotacoes.status} NOT IN ('cancelada','concluida')`));
      const cotMap: Record<string, number> = {};
      const cotDocsMap: Record<string, { id: number; numero: string }[]> = {};
      for (const ct of cotRows) {
        const key = ct.insumoCodigo || "";
        cotMap[key] = (cotMap[key] || 0) + n(ct.quantidade);
        if (!cotDocsMap[key]) cotDocsMap[key] = [];
        const num = ct.cotNumero || `COT-${ct.cotacaoId}`;
        if (!cotDocsMap[key].some(d => d.id === ct.cotacaoId)) cotDocsMap[key].push({ id: ct.cotacaoId, numero: num });
      }

      return result.map(c => {
        const qtdJaSolicitada = scMap[c.insumoCodigo] || 0;
        const qtdEmCotacao = cotMap[c.insumoCodigo] || 0;
        const qtdComprada = ocMapComprado[c.insumoCodigo] || 0;
        const qtdRecebida = ocMapRecebido[c.insumoCodigo] || 0;
        const saldoDisponivel = c.qtdTotalOrcada - qtdJaSolicitada;
        let statusInsumo: "disponivel" | "solicitado" | "em_cotacao" | "comprado" | "recebido" | "estouro" = "disponivel";
        if (qtdComprada > c.qtdTotalOrcada) statusInsumo = "estouro";
        else if (qtdRecebida >= c.qtdTotalOrcada) statusInsumo = "recebido";
        else if (qtdComprada >= c.qtdTotalOrcada) statusInsumo = "comprado";
        else if (qtdEmCotacao > 0) statusInsumo = "em_cotacao";
        else if (qtdJaSolicitada > 0) statusInsumo = "solicitado";
        return {
          ...c, qtdJaSolicitada, qtdEmCotacao, qtdComprada, qtdRecebida, saldoDisponivel, statusInsumo,
          scDocs: scDocsMap[c.insumoCodigo] || [],
          cotDocs: cotDocsMap[c.insumoCodigo] || [],
          ocDocs: ocDocsMap[c.insumoCodigo] || [],
          scPorComposicao: scByOrcItemMap[c.insumoCodigo]?.orcItemIds || [],
        };
      }).sort((a, b) => a.descricao.localeCompare(b.descricao));
    }),

  getSugestoesCompra: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt)).limit(1);
      if (!orc) return [];

      const proj = await db.select({ id: planejamentoProjetos.id })
        .from(planejamentoProjetos)
        .where(and(eq(planejamentoProjetos.companyId, input.companyId), eq(planejamentoProjetos.obraId, input.obraId)))
        .limit(1);
      if (!proj.length) return [];

      const [rev] = await db.select({ id: planejamentoRevisoes.id })
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, proj[0].id))
        .orderBy(desc(planejamentoRevisoes.id)).limit(1);
      if (!rev) return [];

      const hoje = new Date();
      const em14dias = new Date(hoje.getTime() + 14 * 24 * 60 * 60 * 1000);
      const hojeStr = hoje.toISOString().slice(0, 10);
      const em14Str = em14dias.toISOString().slice(0, 10);

      const atividades = await db.select({
        eapCodigo: planejamentoAtividades.eapCodigo,
        nome: planejamentoAtividades.nome,
        dataInicio: planejamentoAtividades.dataInicio,
        dataFim: planejamentoAtividades.dataFim,
      }).from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.revisaoId, rev.id),
          sql`${planejamentoAtividades.dataInicio} IS NOT NULL`,
          sql`${planejamentoAtividades.dataInicio} <= ${em14Str}`,
          sql`(${planejamentoAtividades.dataFim} IS NULL OR ${planejamentoAtividades.dataFim} >= ${hojeStr})`,
        ));

      if (!atividades.length) return [];

      const orcItems = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        servicoCodigo: orcamentoItens.servicoCodigo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));

      const atividadeEaps = new Set(atividades.map(a => a.eapCodigo).filter(Boolean));
      const servicosProximos = orcItems.filter(it => it.servicoCodigo && atividadeEaps.has(it.eapCodigo));
      if (!servicosProximos.length) return [];

      const servicoCodigos = [...new Set(servicosProximos.map(it => it.servicoCodigo!))];
      const insumosDb = await db.select({
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        insumoCodigo: composicaoInsumos.insumoCodigo,
        insumoDescricao: composicaoInsumos.insumoDescricao,
        unidade: composicaoInsumos.unidade,
        quantidade: composicaoInsumos.quantidade,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
      }).from(composicaoInsumos)
        .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, servicoCodigos)));

      const materiaisOnly = insumosDb.filter(i => n(i.alocacaoMat) > 0);

      const sugestoes: Record<string, { insumoCodigo: string; descricao: string; unidade: string; qtdNecessaria: number; atividades: string[] }> = {};
      for (const ins of materiaisOnly) {
        const svcs = servicosProximos.filter(s => s.servicoCodigo === ins.composicaoCodigo);
        for (const svc of svcs) {
          const key = ins.insumoCodigo || ins.insumoDescricao || "";
          if (!sugestoes[key]) {
            sugestoes[key] = { insumoCodigo: ins.insumoCodigo || "", descricao: ins.insumoDescricao || "", unidade: ins.unidade || "un", qtdNecessaria: 0, atividades: [] };
          }
          sugestoes[key].qtdNecessaria += n(svc.quantidade) * n(ins.quantidade);
          const atv = atividades.find(a => a.eapCodigo === svc.eapCodigo);
          if (atv && !sugestoes[key].atividades.includes(atv.nome || svc.descricao)) {
            sugestoes[key].atividades.push(atv.nome || svc.descricao);
          }
        }
      }

      return Object.values(sugestoes).filter(s => s.qtdNecessaria > 0).sort((a, b) => b.qtdNecessaria - a.qtdNecessaria).slice(0, 20);
    }),

  getAlertasEstoque: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const conditions = [eq(almoxarifadoItens.companyId, input.companyId), eq(almoxarifadoItens.ativo, true)];
      if (input.obraId) conditions.push(eq(almoxarifadoItens.obraId, input.obraId));

      const itens = await db.select({
        id: almoxarifadoItens.id,
        nome: almoxarifadoItens.nome,
        unidade: almoxarifadoItens.unidade,
        quantidadeAtual: almoxarifadoItens.quantidadeAtual,
        quantidadeMinima: almoxarifadoItens.quantidadeMinima,
        obraId: almoxarifadoItens.obraId,
      }).from(almoxarifadoItens)
        .where(and(...conditions));

      const alertas = itens.filter(it => {
        const minimo = n(it.quantidadeMinima);
        if (minimo <= 0) return false;
        return n(it.quantidadeAtual) <= minimo;
      });

      return alertas.map(it => ({
        id: it.id,
        nome: it.nome,
        unidade: it.unidade || "un",
        quantidadeAtual: n(it.quantidadeAtual),
        estoqueMinimo: n(it.quantidadeMinima),
        obraId: it.obraId,
        percentual: n(it.quantidadeMinima) > 0 ? Math.round((n(it.quantidadeAtual) / n(it.quantidadeMinima)) * 100) : 0,
      })).sort((a, b) => a.percentual - b.percentual);
    }),

  getSCsPendentesAgrupamento: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const conditions = [
        eq(comprasSolicitacoes.companyId, input.companyId),
        inArray(comprasSolicitacoes.status, ["pendente", "aprovado"]),
      ];
      if (input.obraId) conditions.push(eq(comprasSolicitacoes.obraId, input.obraId));

      const scItens = await db.select({
        scId: comprasSolicitacoes.id,
        scNumero: comprasSolicitacoes.numeroSc,
        scTitulo: comprasSolicitacoes.titulo,
        itemId: comprasSolicitacoesItens.id,
        descricao: comprasSolicitacoesItens.descricao,
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        unidade: comprasSolicitacoesItens.unidade,
        quantidade: comprasSolicitacoesItens.quantidade,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
        .where(and(...conditions));

      const grouped: Record<string, { descricao: string; unidade: string; insumoCodigo: string; totalQtd: number; scs: { scId: number; scNumero: string | null; scTitulo: string | null; quantidade: number }[] }> = {};
      for (const it of scItens) {
        const key = it.insumoCodigo || it.descricao?.toLowerCase().trim() || "";
        if (!key) continue;
        if (!grouped[key]) {
          grouped[key] = { descricao: it.descricao || "", unidade: it.unidade || "un", insumoCodigo: it.insumoCodigo || "", totalQtd: 0, scs: [] };
        }
        grouped[key].totalQtd += n(it.quantidade);
        const existing = grouped[key].scs.find(s => s.scId === it.scId);
        if (existing) { existing.quantidade += n(it.quantidade); }
        else { grouped[key].scs.push({ scId: it.scId, scNumero: it.scNumero, scTitulo: it.scTitulo, quantidade: n(it.quantidade) }); }
      }

      return Object.values(grouped).filter(g => g.scs.length >= 2).sort((a, b) => b.scs.length - a.scs.length);
    }),

  getEapParaObra: protectedProcedure
    .input(z.object({ obraId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // Orçamento mais recente da obra
      const [orc] = await db.select({
        id: orcamentos.id,
        codigo: orcamentos.codigo,
        descricao: orcamentos.descricao,
      }).from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
          isNull(orcamentos.deletedAt),
        ))
        .orderBy(desc(orcamentos.createdAt))
        .limit(1);

      if (!orc) return { items: [], orcamentoId: null, projetoId: null, semOrcamento: true };

      // Itens da EAP com campos de meta para exibição na SC
      const orcItems = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        nivel: orcamentoItens.nivel,
        tipo: orcamentoItens.tipo,
        servicoCodigo: orcamentoItens.servicoCodigo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
        ordem: orcamentoItens.ordem,
        metaUnitTotal: orcamentoItens.metaUnitTotal,
        metaTotal: orcamentoItens.metaTotal,
        custoUnitTotal: orcamentoItens.custoUnitTotal,
        custoUnitMdo: orcamentoItens.custoUnitMdo,
        custoUnitMat: orcamentoItens.custoUnitMat,
      }).from(orcamentoItens)
        .where(and(
          eq(orcamentoItens.orcamentoId, orc.id),
          eq(orcamentoItens.companyId, input.companyId),
        ))
        .orderBy(asc(orcamentoItens.ordem));

      // Projeto de planejamento mais recente da obra
      const [proj] = await db.select({ id: planejamentoProjetos.id })
        .from(planejamentoProjetos)
        .where(and(
          eq(planejamentoProjetos.companyId, input.companyId),
          eq(planejamentoProjetos.obraId, input.obraId),
        ))
        .orderBy(desc(planejamentoProjetos.criadoEm))
        .limit(1);

      // Revisão mais recente → atividades com prazo
      const atividadesMap: Record<string, { dataFim: string | null; duracaoDias: number | null }> = {};
      if (proj) {
        const [rev] = await db.select({ id: planejamentoRevisoes.id })
          .from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, proj.id))
          .orderBy(desc(planejamentoRevisoes.id))
          .limit(1);

        if (rev) {
          const atividades = await db.select({
            eapCodigo: planejamentoAtividades.eapCodigo,
            dataFim: planejamentoAtividades.dataFim,
            duracaoDias: planejamentoAtividades.duracaoDias,
          }).from(planejamentoAtividades)
            .where(eq(planejamentoAtividades.revisaoId, rev.id));

          atividades.forEach(a => {
            if (a.eapCodigo) atividadesMap[a.eapCodigo] = { dataFim: a.dataFim, duracaoDias: a.duracaoDias };
          });
        }
      }

      const servicoCodigosEap = [...new Set(orcItems.filter(it => it.servicoCodigo && it.servicoCodigo !== 'composto').map(it => it.servicoCodigo!))];
      const mdoMatMap: Record<string, { temMat: boolean; temMdo: boolean; temEquip: boolean }> = {};
      const mdoDecompMap: Record<string, { profissional: number; ajudante: number; temAjudante: boolean }> = {};
      if (servicoCodigosEap.length > 0) {
        const insFlags = await db.select({
          composicaoCodigo: composicaoInsumos.composicaoCodigo,
          alocacaoMat: composicaoInsumos.alocacaoMat,
          alocacaoMdo: composicaoInsumos.alocacaoMdo,
          alocacaoEquip: composicaoInsumos.alocacaoEquip,
          insumoDescricao: composicaoInsumos.insumoDescricao,
          insumoCodigo: composicaoInsumos.insumoCodigo,
        }).from(composicaoInsumos)
          .where(and(eq(composicaoInsumos.companyId, input.companyId), inArray(composicaoInsumos.composicaoCodigo, servicoCodigosEap)));

        const ajudantePattern = /ajudante|servente|auxiliar/i;
        const seenInsumosPerComp: Record<string, Set<string>> = {};

        for (const f of insFlags) {
          if (!mdoMatMap[f.composicaoCodigo]) mdoMatMap[f.composicaoCodigo] = { temMat: false, temMdo: false, temEquip: false };
          if (n(f.alocacaoMat) > 0) mdoMatMap[f.composicaoCodigo].temMat = true;
          const isEquip = n(f.alocacaoEquip) > 0 || (n(f.alocacaoMat) === 0 && n(f.alocacaoMdo) === 0);
          if (isEquip) mdoMatMap[f.composicaoCodigo].temEquip = true;
          if (n(f.alocacaoMdo) > 0) mdoMatMap[f.composicaoCodigo].temMdo = true;

          if (n(f.alocacaoMdo) > 0) {
            const dedupKey = `${f.composicaoCodigo}:${f.insumoCodigo || f.insumoDescricao}`;
            if (!seenInsumosPerComp[f.composicaoCodigo]) seenInsumosPerComp[f.composicaoCodigo] = new Set();
            if (seenInsumosPerComp[f.composicaoCodigo].has(dedupKey)) continue;
            seenInsumosPerComp[f.composicaoCodigo].add(dedupKey);

            if (!mdoDecompMap[f.composicaoCodigo]) mdoDecompMap[f.composicaoCodigo] = { profissional: 0, ajudante: 0, temAjudante: false };
            const custoMdo = n(f.alocacaoMdo);
            const isAjudante = ajudantePattern.test(f.insumoDescricao || "");
            if (isAjudante) {
              mdoDecompMap[f.composicaoCodigo].ajudante += custoMdo;
              mdoDecompMap[f.composicaoCodigo].temAjudante = true;
            } else {
              mdoDecompMap[f.composicaoCodigo].profissional += custoMdo;
            }
          }
        }
      }

      const mdoContratadoMap: Record<number, number> = {};
      const scServicoRows = await db.select({
        orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
        quantidadeServico: comprasSolicitacoesItens.quantidadeServico,
        quantidade: comprasSolicitacoesItens.quantidade,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
        .where(and(
          eq(comprasSolicitacoes.companyId, input.companyId),
          eq(comprasSolicitacoes.obraId, input.obraId),
          eq(comprasSolicitacoes.tipo, "servico"),
          sql`${comprasSolicitacoes.status} NOT IN ('cancelado')`,
        ));
      for (const row of scServicoRows) {
        if (row.orcamentoItemId) {
          const qtd = n(row.quantidadeServico) || n(row.quantidade);
          mdoContratadoMap[row.orcamentoItemId] = (mdoContratadoMap[row.orcamentoItemId] || 0) + qtd;
        }
      }

      const items = orcItems.map(it => {
        const isComposto = it.tipo === 'Composto' || it.servicoCodigo === 'composto';
        const originalServicoCodigo = it.servicoCodigo;
        const realServicoCodigo = isComposto ? null : it.servicoCodigo;
        const decomp = realServicoCodigo ? mdoDecompMap[realServicoCodigo] : undefined;
        const compostoDecomp = (isComposto && originalServicoCodigo && originalServicoCodigo !== 'composto') ? mdoDecompMap[originalServicoCodigo] : undefined;
        const compostoMdoMat = (isComposto && originalServicoCodigo && originalServicoCodigo !== 'composto') ? mdoMatMap[originalServicoCodigo] : undefined;
        return {
          ...it,
          servicoCodigo: realServicoCodigo || it.servicoCodigo,
          servicoCodigoOriginal: isComposto ? originalServicoCodigo : undefined,
          isComposto,
          prazoFim: atividadesMap[it.eapCodigo]?.dataFim ?? null,
          duracaoDias: atividadesMap[it.eapCodigo]?.duracaoDias ?? null,
          temMat: isComposto ? (compostoMdoMat?.temMat ?? true) : (realServicoCodigo ? (mdoMatMap[realServicoCodigo]?.temMat ?? false) : true),
          temMdo: isComposto ? (compostoMdoMat?.temMdo ?? true) : (realServicoCodigo ? (mdoMatMap[realServicoCodigo]?.temMdo ?? false) : false),
          temEquip: isComposto ? (compostoMdoMat?.temEquip ?? false) : (realServicoCodigo ? (mdoMatMap[realServicoCodigo]?.temEquip ?? false) : false),
          mdoContratado: mdoContratadoMap[it.id] || 0,
          mdoSaldo: n(it.quantidade) - (mdoContratadoMap[it.id] || 0),
          mdoProfissional: isComposto ? (compostoDecomp?.profissional ?? 0) : (decomp?.profissional ?? 0),
          mdoAjudante: isComposto ? (compostoDecomp?.ajudante ?? 0) : (decomp?.ajudante ?? 0),
          temAjudante: isComposto ? (compostoDecomp?.temAjudante ?? false) : (decomp?.temAjudante ?? false),
        };
      });

      return { items, orcamentoId: orc.id, projetoId: proj?.id ?? null, semOrcamento: false };
    }),

  // ══════════════════════════════════════════════════════════════
  // CONDIÇÕES DE PAGAMENTO (tabela pré-cadastrada por empresa)
  // ══════════════════════════════════════════════════════════════

  listarCondicoesPagamento: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return db.select()
        .from(comprasCondicoesPagamento)
        .where(and(eq(comprasCondicoesPagamento.companyId, input.companyId), eq(comprasCondicoesPagamento.ativo, true)))
        .orderBy(asc(comprasCondicoesPagamento.ordem), asc(comprasCondicoesPagamento.descricao));
    }),

  criarCondicaoPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), descricao: z.string().min(1).max(150) }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const existente = await db.select().from(comprasCondicoesPagamento)
        .where(and(eq(comprasCondicoesPagamento.companyId, input.companyId), eq(comprasCondicoesPagamento.descricao, input.descricao.trim())));
      if (existente.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Condição já cadastrada" });
      const [row] = await db.insert(comprasCondicoesPagamento).values({
        companyId: input.companyId,
        descricao: input.descricao.trim(),
      }).returning();
      return row;
    }),

  deletarCondicaoPagamento: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const [cpAcc] = await db.select({ companyId: comprasCondicoesPagamento.companyId }).from(comprasCondicoesPagamento).where(eq(comprasCondicoesPagamento.id, input.id));
      if (cpAcc) await _assertCompanyAccess(ctx.user, cpAcc.companyId);
      await db.delete(comprasCondicoesPagamento).where(eq(comprasCondicoesPagamento.id, input.id));
      return { ok: true };
    }),

  getEntregasProgramadas: protectedProcedure
    .input(z.object({ ordemItemId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [item] = await db.select({ id: comprasOrdensItens.id, ordemId: comprasOrdensItens.ordemId }).from(comprasOrdensItens).where(eq(comprasOrdensItens.id, input.ordemItemId));
      if (!item) return [];
      const [ordem] = await db.select({ companyId: comprasOrdens.companyId }).from(comprasOrdens).where(eq(comprasOrdens.id, item.ordemId));
      if (!ordem || ordem.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      return db.select().from(comprasEntregasProgramadas)
        .where(eq(comprasEntregasProgramadas.ordemItemId, input.ordemItemId))
        .orderBy(asc(comprasEntregasProgramadas.dataEntrega));
    }),

  salvarEntregasProgramadas: protectedProcedure
    .input(z.object({
      ordemItemId: z.number(),
      companyId: z.number(),
      entregas: z.array(z.object({
        id: z.number().optional(),
        dataEntrega: z.string(),
        quantidade: z.number(),
        observacoes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [item] = await db.select({ id: comprasOrdensItens.id, ordemId: comprasOrdensItens.ordemId }).from(comprasOrdensItens).where(eq(comprasOrdensItens.id, input.ordemItemId));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      const [ordem] = await db.select({ companyId: comprasOrdens.companyId }).from(comprasOrdens).where(eq(comprasOrdens.id, item.ordemId));
      if (!ordem || ordem.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      await db.delete(comprasEntregasProgramadas).where(eq(comprasEntregasProgramadas.ordemItemId, input.ordemItemId));
      if (input.entregas.length > 0) {
        await db.insert(comprasEntregasProgramadas).values(
          input.entregas.map(e => ({
            ordemItemId: input.ordemItemId,
            dataEntrega: e.dataEntrega,
            quantidade: String(e.quantidade),
            observacoes: e.observacoes || null,
            status: "pendente",
          }))
        );
      }
      return { ok: true };
    }),

  registrarEntregaProgramada: protectedProcedure
    .input(z.object({ id: z.number(), quantidadeEntregue: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [entrega] = await db.select().from(comprasEntregasProgramadas).where(eq(comprasEntregasProgramadas.id, input.id));
      if (!entrega) throw new TRPCError({ code: "NOT_FOUND" });
      const [item] = await db.select({ ordemId: comprasOrdensItens.ordemId }).from(comprasOrdensItens).where(eq(comprasOrdensItens.id, entrega.ordemItemId));
      if (item) {
        const [ordem] = await db.select({ companyId: comprasOrdens.companyId }).from(comprasOrdens).where(eq(comprasOrdens.id, item.ordemId));
        if (!ordem || ordem.companyId !== input.companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      const novaQtd = n(entrega.quantidadeEntregue) + input.quantidadeEntregue;
      const qtdProg = n(entrega.quantidade);
      const novoStatus = novaQtd >= qtdProg ? "entregue" : "parcial";
      await db.update(comprasEntregasProgramadas)
        .set({ quantidadeEntregue: String(novaQtd), status: novoStatus })
        .where(eq(comprasEntregasProgramadas.id, input.id));
      return { ok: true, novoStatus };
    }),

  getTimelineCompra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      cotacaoId: z.number().optional(),
      ordemId: z.number().optional(),
    }).refine(d => d.cotacaoId || d.ordemId, { message: "cotacaoId ou ordemId é obrigatório" }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const { companyId } = input;

      let sc: typeof comprasSolicitacoes.$inferSelect | null = null;
      let cot: typeof comprasCotacoes.$inferSelect | null = null;
      let oc: typeof comprasOrdens.$inferSelect | null = null;

      if (input.cotacaoId) {
        const [c] = await db.select().from(comprasCotacoes).where(
          and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, companyId))
        );
        cot = c ?? null;
        if (!cot) return { etapas: [], etapaAtual: null };
        if (cot.solicitacaoId) {
          const [s] = await db.select().from(comprasSolicitacoes).where(
            and(eq(comprasSolicitacoes.id, cot.solicitacaoId), eq(comprasSolicitacoes.companyId, companyId))
          );
          sc = s ?? null;
        }
        const ordens = await db.select().from(comprasOrdens)
          .where(and(eq(comprasOrdens.cotacaoId, input.cotacaoId), eq(comprasOrdens.companyId, companyId)))
          .orderBy(desc(comprasOrdens.criadoEm));
        const nonCancelled = ordens.filter(o => o.status !== "cancelada");
        oc = nonCancelled.length > 0 ? nonCancelled[0] : (ordens.length > 0 ? ordens[0] : null);
      } else if (input.ordemId) {
        const [o] = await db.select().from(comprasOrdens).where(
          and(eq(comprasOrdens.id, input.ordemId), eq(comprasOrdens.companyId, companyId))
        );
        oc = o ?? null;
        if (!oc) return { etapas: [], etapaAtual: null };
        if (oc.cotacaoId) {
          const [c] = await db.select().from(comprasCotacoes).where(
            and(eq(comprasCotacoes.id, oc.cotacaoId), eq(comprasCotacoes.companyId, companyId))
          );
          cot = c ?? null;
        }
        const solId = cot?.solicitacaoId ?? null;
        if (solId) {
          const [s] = await db.select().from(comprasSolicitacoes).where(
            and(eq(comprasSolicitacoes.id, solId), eq(comprasSolicitacoes.companyId, companyId))
          );
          sc = s ?? null;
        }
      }

      let financialEntry: { status: string; dataPagamento: string | null; dataVencimento: string | null } | null = null;
      if (oc?.financialEntryId) {
        const feRows = await db.select({
          status: financialEntries.status,
          dataPagamento: financialEntries.dataPagamento,
          dataVencimento: financialEntries.dataVencimento,
          feCompanyId: financialEntries.companyId,
        }).from(financialEntries)
          .where(and(
            eq(financialEntries.id, oc.financialEntryId),
            eq(financialEntries.companyId, companyId),
          ));
        if (feRows[0]) {
          financialEntry = {
            status: feRows[0].status,
            dataPagamento: feRows[0].dataPagamento ?? null,
            dataVencimento: feRows[0].dataVencimento ?? null,
          };
        }
      }

      const parseDate = (d: string): Date => {
        const clean = d.replace(" ", "T").replace(/\+00$/, "Z");
        return new Date(clean.includes("T") ? clean : clean + "T00:00:00");
      };
      const daysBetween = (d1: string | null | undefined, d2: string | null | undefined): number | null => {
        if (!d1 || !d2) return null;
        try {
          const a = parseDate(d1);
          const b = parseDate(d2);
          if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
          return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
        } catch { return null; }
      };

      interface TimelineEtapa {
        key: string;
        label: string;
        status: "concluida" | "atual" | "pendente" | "atrasada";
        data: string | null;
        tempoDesdeAnterior: number | null;
        detalhe: string | null;
      }

      const today = new Date().toISOString().split("T")[0];
      const etapas: TimelineEtapa[] = [];
      let prevDate: string | null = null;

      const idsNeeded = new Set<number>();
      if (sc?.criadoPorId) idsNeeded.add(sc.criadoPorId);
      if (sc?.solicitanteId) idsNeeded.add(sc.solicitanteId);
      if (sc?.aprovadorId) idsNeeded.add(sc.aprovadorId);
      if (cot?.criadoPorId) idsNeeded.add(cot.criadoPorId);
      if (cot?.aprovadoPorId) idsNeeded.add(cot.aprovadoPorId);
      if (oc?.criadoPorId) idsNeeded.add(oc.criadoPorId);
      if (oc?.aprovadorId) idsNeeded.add(oc.aprovadorId);
      if (oc?.aprovacaoExtraAdminId) idsNeeded.add(oc.aprovacaoExtraAdminId);
      const userMap = new Map<number, string>();
      if (idsNeeded.size > 0) {
        const ids = Array.from(idsNeeded);
        const rows = await db.select({ id: users.id, name: users.name })
          .from(users).where(inArray(users.id, ids));
        for (const r of rows) userMap.set(r.id, r.name || `#${r.id}`);
      }
      const nameOf = (id: number | null | undefined, fallback?: string | null): string | null => {
        if (fallback && fallback.trim()) return fallback;
        if (id && userMap.has(id)) return userMap.get(id)!;
        return null;
      };
      const por = (nome: string | null) => (nome ? `por ${nome}` : null);
      const merge = (...parts: (string | null | undefined)[]) =>
        parts.filter(Boolean).join(" • ") || null;

      if (sc) {
        const scCriadoPor = nameOf(sc.criadoPorId ?? sc.solicitanteId, sc.criadoPorNome);
        etapas.push({
          key: "sc_criada",
          label: "SC Criada",
          status: "concluida",
          data: sc.criadoEm,
          tempoDesdeAnterior: null,
          detalhe: merge(sc.numeroSc ? `#${sc.numeroSc}` : null, por(scCriadoPor)),
        });
        prevDate = sc.criadoEm;

        if (sc.aprovacaoStatus === "aprovada" && sc.aprovadoEm) {
          const dias = daysBetween(prevDate, sc.aprovadoEm);
          const scAprovPor = nameOf(sc.aprovadorId, sc.aprovadorNome);
          etapas.push({
            key: "sc_aprovada",
            label: "SC Aprovada",
            status: "concluida",
            data: sc.aprovadoEm,
            tempoDesdeAnterior: dias,
            detalhe: por(scAprovPor),
          });
          prevDate = sc.aprovadoEm;
        } else if (!cot) {
          etapas.push({
            key: "sc_aprovada",
            label: "SC Aprovação",
            status: sc.aprovacaoStatus === "aguardando" ? "atual" : "pendente",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: null,
          });
        }
      }

      if (cot) {
        const dias = daysBetween(prevDate, cot.criadoEm);
        const cotCriadoPor = nameOf(cot.criadoPorId, cot.criadoPorNome);
        etapas.push({
          key: "cotacao_aberta",
          label: "Cotação Aberta",
          status: "concluida",
          data: cot.criadoEm,
          tempoDesdeAnterior: dias,
          detalhe: merge(cot.numeroCotacao ? `#${cot.numeroCotacao}` : null, por(cotCriadoPor)),
        });
        prevDate = cot.criadoEm;

        const cotAprovPor = nameOf(cot.aprovadoPorId, cot.aprovadoPorNome);

        if (oc) {
          const approvalDate = cot.aprovadoEm || oc.criadoEm;
          const diasAprov = daysBetween(prevDate, approvalDate);
          etapas.push({
            key: "cotacao_aprovada",
            label: "Cotação Aprovada",
            status: "concluida",
            data: approvalDate,
            tempoDesdeAnterior: diasAprov,
            detalhe: merge(cot.fornecedorId ? "Fornecedor selecionado" : null, por(cotAprovPor)),
          });
          prevDate = approvalDate;
        } else if (cot.status === "aprovada" || cot.status === "encerrada") {
          etapas.push({
            key: "cotacao_aprovada",
            label: "Cotação Aprovada",
            status: "concluida",
            data: cot.aprovadoEm,
            tempoDesdeAnterior: cot.aprovadoEm ? daysBetween(prevDate, cot.aprovadoEm) : null,
            detalhe: merge(cot.fornecedorId ? "Fornecedor selecionado" : "Aguardando emissão de OC", por(cotAprovPor)),
          });
        } else if (cot.status === "recusada" || cot.status === "cancelada") {
          etapas.push({
            key: "cotacao_aprovada",
            label: cot.status === "recusada" ? "Cotação Recusada" : "Cotação Cancelada",
            status: "concluida",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: "Processo encerrado",
          });

          const resolvedAtual2 = etapas.find(e => e.status === "atual");
          const etapaAtual2 = resolvedAtual2?.label ?? "Processo encerrado";
          return { etapas, etapaAtual: etapaAtual2 };
        } else if (cot.status === "concluida" && (cot as any).contratoTerceiroId) {
          etapas.push({
            key: "cotacao_aprovada",
            label: "Cotação Aprovada",
            status: "concluida",
            data: cot.atualizadoEm || cot.criadoEm,
            tempoDesdeAnterior: daysBetween(prevDate, cot.atualizadoEm || cot.criadoEm),
            detalhe: "Fornecedor selecionado",
          });
          prevDate = cot.atualizadoEm || cot.criadoEm;

          etapas.push({
            key: "contrato_gerado",
            label: "Contrato Gerado",
            status: "concluida",
            data: cot.atualizadoEm || cot.criadoEm,
            tempoDesdeAnterior: 0,
            detalhe: "Gerenciado em Terceiros",
          });

          const resolvedAtual = etapas.find(e => e.status === "atual");
          const etapaAtual = resolvedAtual?.label ?? etapas[etapas.length - 1]?.label ?? null;
          return { etapas, etapaAtual };
        } else {
          etapas.push({
            key: "cotacao_aprovada",
            label: "Aguardando Aprovação",
            status: "atual",
            data: null,
            tempoDesdeAnterior: null,
            detalhe: null,
          });
        }
      }

      if (cot && (cot as any).contratoTerceiroId && !oc) {
        etapas.push({
          key: "contrato_gerado",
          label: "Contrato Gerado",
          status: "concluida",
          data: cot.atualizadoEm || cot.criadoEm,
          tempoDesdeAnterior: daysBetween(prevDate, cot.atualizadoEm || cot.criadoEm),
          detalhe: "Gerenciado em Terceiros",
        });

        const resolvedAtual = etapas.find(e => e.status === "atual");
        const etapaAtual = resolvedAtual?.label ?? etapas[etapas.length - 1]?.label ?? null;
        return { etapas, etapaAtual };
      }

      if (oc) {
        const hasTerceiroContrato = !!(oc as any).contratoTerceiroId || !!(cot as any)?.contratoTerceiroId;
        const dias = daysBetween(prevDate, oc.criadoEm);
        const ocCriadoPor = nameOf(oc.criadoPorId, oc.criadoPorNome);
        etapas.push({
          key: "oc_emitida",
          label: hasTerceiroContrato ? "OS Emitida" : "OC Emitida",
          status: "concluida",
          data: oc.criadoEm,
          tempoDesdeAnterior: dias,
          detalhe: merge(oc.numeroOc ? `#${oc.numeroOc}` : null, por(ocCriadoPor)),
        });
        prevDate = oc.criadoEm;

        if (oc.aprovacaoStatus === "aprovada" && oc.aprovadoEm) {
          const ocAprovPor = nameOf(oc.aprovadorId, oc.aprovadorNome);
          etapas.push({
            key: "oc_aprovada",
            label: "OC Aprovada",
            status: "concluida",
            data: oc.aprovadoEm,
            tempoDesdeAnterior: daysBetween(prevDate, oc.aprovadoEm),
            detalhe: por(ocAprovPor),
          });
          prevDate = oc.aprovadoEm;
        }

        if (oc.aprovacaoExtraEm && oc.aprovacaoExtraAdminId) {
          const extraPor = nameOf(oc.aprovacaoExtraAdminId, oc.aprovacaoExtraAdminNome);
          etapas.push({
            key: "oc_aprovacao_extra",
            label: "Aprovação Extra (Admin)",
            status: "concluida",
            data: oc.aprovacaoExtraEm,
            tempoDesdeAnterior: daysBetween(prevDate, oc.aprovacaoExtraEm),
            detalhe: merge(por(extraPor), oc.aprovacaoExtraJustificativa || oc.aprovacaoExtraMotivo || null),
          });
          prevDate = oc.aprovacaoExtraEm;
        }

        if (hasTerceiroContrato) {
          etapas.push({
            key: "contrato_gerado",
            label: "Contrato Terceiro Gerado",
            status: "concluida",
            data: oc.criadoEm,
            tempoDesdeAnterior: 0,
            detalhe: "Gerenciado no módulo Terceiros",
          });
        } else {
          if (oc.dataEntregaPrevista) {
            const isDelivered = ["entregue", "entregue_parcial"].includes(oc.status);
            const isOverdue = !isDelivered && oc.dataEntregaPrevista < today;
            const diasEntrega = daysBetween(prevDate, oc.dataEntregaPrevista);
            const diasAtraso = isOverdue ? daysBetween(oc.dataEntregaPrevista, today) : null;
            etapas.push({
              key: "entrega_prevista",
              label: isOverdue ? "Entrega Atrasada" : (isDelivered ? "Entrega Prevista" : "Aguardando Entrega"),
              status: isDelivered ? "concluida" : (isOverdue ? "atrasada" : "atual"),
              data: oc.dataEntregaPrevista,
              tempoDesdeAnterior: isOverdue ? diasAtraso : diasEntrega,
              detalhe: isOverdue ? "Prazo excedido" : null,
            });
          }

          if (oc.status === "entregue" || oc.status === "entregue_parcial") {
            const diasReceb = daysBetween(oc.dataEntregaPrevista || prevDate, oc.dataEntregaReal || oc.atualizadoEm);
            etapas.push({
              key: "material_recebido",
              label: oc.status === "entregue_parcial" ? "Recebimento Parcial" : "Material Recebido",
              status: "concluida",
              data: oc.dataEntregaReal || oc.atualizadoEm,
              tempoDesdeAnterior: diasReceb,
              detalhe: null,
            });
            prevDate = oc.dataEntregaReal || oc.atualizadoEm;
          } else if (!oc.dataEntregaPrevista) {
            etapas.push({
              key: "material_recebido",
              label: "Aguardando Recebimento",
              status: "atual",
              data: null,
              tempoDesdeAnterior: null,
              detalhe: null,
            });
          } else {
            etapas.push({
              key: "material_recebido",
              label: "Recebimento",
              status: "pendente",
              data: null,
              tempoDesdeAnterior: null,
              detalhe: null,
            });
          }

          if (financialEntry) {
            const isPaid = financialEntry.status === "pago" || financialEntry.status === "confirmado";
            const diasPag = isPaid && financialEntry.dataPagamento
              ? daysBetween(prevDate, financialEntry.dataPagamento) : null;
            etapas.push({
              key: "pagamento",
              label: isPaid ? "Pagamento Realizado" : "Pagamento Pendente",
              status: isPaid ? "concluida" : (oc.status === "entregue" ? "atual" : "pendente"),
              data: isPaid ? financialEntry.dataPagamento : financialEntry.dataVencimento,
              tempoDesdeAnterior: diasPag,
              detalhe: isPaid ? null : (financialEntry.dataVencimento ? `Venc. ${financialEntry.dataVencimento}` : null),
            });
          } else {
            etapas.push({
              key: "pagamento",
              label: "Pagamento",
              status: "pendente",
              data: null,
              tempoDesdeAnterior: null,
              detalhe: null,
            });
          }
        }
      } else {
        if (cot) {
          etapas.push({ key: "oc_emitida", label: "Emissão OC", status: "pendente", data: null, tempoDesdeAnterior: null, detalhe: null });
          etapas.push({ key: "material_recebido", label: "Recebimento", status: "pendente", data: null, tempoDesdeAnterior: null, detalhe: null });
          etapas.push({ key: "pagamento", label: "Pagamento", status: "pendente", data: null, tempoDesdeAnterior: null, detalhe: null });
        }
      }

      const atrasada = etapas.find(e => e.status === "atrasada");
      const atual = etapas.find(e => e.status === "atual");
      if (!atrasada && !atual) {
        const firstPending = etapas.find(e => e.status === "pendente");
        if (firstPending) {
          firstPending.status = "atual";
        }
      }
      const resolvedAtual = etapas.find(e => e.status === "atual");
      const resolvedAtrasada = etapas.find(e => e.status === "atrasada");
      const etapaAtual = resolvedAtrasada?.label ?? resolvedAtual?.label ?? (etapas.length > 0 && etapas.every(e => e.status === "concluida") ? "Concluído" : null);

      return { etapas, etapaAtual };
    }),

  getHistoricoRecompra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricao: z.string().optional(),
      insumoCodigo: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!input.descricao && !input.insumoCodigo) return null;

      const stripEapPrefix = (desc: string) => desc.replace(/^\[[\d.]+\]\s*/, "").trim();
      const descNorm = input.descricao ? stripEapPrefix(input.descricao) : null;

      if (!descNorm && !input.insumoCodigo) return null;

      const ocStatusAprovados = ["aprovada", "recebida", "parcialmente_recebida"];

      if (input.insumoCodigo) {
        const codeRows = await db.select({
          descricao: comprasOrdensItens.descricao,
          unidade: comprasOrdensItens.unidade,
          precoUnitario: comprasOrdensItens.precoUnitario,
          quantidade: comprasOrdensItens.quantidade,
          fornecedorNome: comprasOrdens.fornecedorNome,
          fornecedorId: comprasOrdens.fornecedorId,
          dataOc: comprasOrdens.criadoEm,
          numeroOc: comprasOrdens.numeroOc,
        }).from(comprasOrdensItens)
          .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
          .leftJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
          .where(and(
            eq(comprasOrdens.companyId, input.companyId),
            inArray(comprasOrdens.status, ocStatusAprovados),
            eq(comprasSolicitacoesItens.insumoCodigo, input.insumoCodigo),
          ))
          .orderBy(desc(comprasOrdens.criadoEm))
          .limit(1);

        if (codeRows.length > 0) {
          const best = codeRows[0];
          return {
            fornecedorNome: best.fornecedorNome,
            fornecedorId: best.fornecedorId,
            precoUnitario: n(best.precoUnitario),
            quantidade: n(best.quantidade),
            unidade: best.unidade,
            dataOc: best.dataOc,
            numeroOc: best.numeroOc,
            descricao: best.descricao,
          };
        }
      }

      if (descNorm) {
        const descRows = await db.select({
          descricao: comprasOrdensItens.descricao,
          unidade: comprasOrdensItens.unidade,
          precoUnitario: comprasOrdensItens.precoUnitario,
          quantidade: comprasOrdensItens.quantidade,
          fornecedorNome: comprasOrdens.fornecedorNome,
          fornecedorId: comprasOrdens.fornecedorId,
          dataOc: comprasOrdens.criadoEm,
          numeroOc: comprasOrdens.numeroOc,
        }).from(comprasOrdensItens)
          .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
          .where(and(
            eq(comprasOrdens.companyId, input.companyId),
            inArray(comprasOrdens.status, ocStatusAprovados),
            ilike(comprasOrdensItens.descricao, `%${descNorm}%`),
          ))
          .orderBy(desc(comprasOrdens.criadoEm))
          .limit(1);

        if (descRows.length > 0) {
          const best = descRows[0];
          return {
            fornecedorNome: best.fornecedorNome,
            fornecedorId: best.fornecedorId,
            precoUnitario: n(best.precoUnitario),
            quantidade: n(best.quantidade),
            unidade: best.unidade,
            dataOc: best.dataOc,
            numeroOc: best.numeroOc,
            descricao: best.descricao,
          };
        }
      }

      return null;
    }),

  getSugestoesFornecedoresRecompra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      descricoes: z.array(z.string()),
      insumoCodigos: z.array(z.string()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (input.descricoes.length === 0 && (!input.insumoCodigos || input.insumoCodigos.length === 0)) return [];

      const stripEapPrefix = (desc: string) => desc.replace(/^\[[\d.]+\]\s*/, "").trim();
      const descNormalizadas = input.descricoes.map(d => stripEapPrefix(d)).filter(d => d.length > 0);
      const insumoCodigosValidos = (input.insumoCodigos ?? []).filter(c => c.length > 0);

      if (descNormalizadas.length === 0 && insumoCodigosValidos.length === 0) return [];

      const ocStatusAprovados = ["aprovada", "recebida", "parcialmente_recebida"];
      const descConditions = descNormalizadas.map(d => ilike(comprasOrdensItens.descricao, `%${d}%`));

      const descRows = descConditions.length > 0 ? await db.select({
        fornecedorId: comprasOrdens.fornecedorId,
        fornecedorNome: comprasOrdens.fornecedorNome,
        descricao: comprasOrdensItens.descricao,
        precoUnitario: comprasOrdensItens.precoUnitario,
        dataOc: comprasOrdens.criadoEm,
        numeroOc: comprasOrdens.numeroOc,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          inArray(comprasOrdens.status, ocStatusAprovados),
          or(...descConditions),
        ))
        .orderBy(desc(comprasOrdens.criadoEm))
        .limit(50) : [];

      const codeRows = insumoCodigosValidos.length > 0 ? await db.select({
        fornecedorId: comprasOrdens.fornecedorId,
        fornecedorNome: comprasOrdens.fornecedorNome,
        descricao: comprasOrdensItens.descricao,
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        dataOc: comprasOrdens.criadoEm,
        numeroOc: comprasOrdens.numeroOc,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          inArray(comprasOrdens.status, ocStatusAprovados),
          inArray(comprasSolicitacoesItens.insumoCodigo, insumoCodigosValidos),
        ))
        .orderBy(desc(comprasOrdens.criadoEm))
        .limit(50) : [];

      const rows = [...codeRows.map(r => ({ ...r, descricao: r.descricao })), ...descRows];

      const fornMap = new Map<number, { fornecedorId: number; fornecedorNome: string | null; itensAtendidos: number; ultimaData: string | null; ultimaOc: string | null; descVistas: Set<string> }>();
      for (const r of rows) {
        if (!r.fornecedorId) continue;
        if (!fornMap.has(r.fornecedorId)) {
          fornMap.set(r.fornecedorId, {
            fornecedorId: r.fornecedorId,
            fornecedorNome: r.fornecedorNome,
            itensAtendidos: 0,
            ultimaData: r.dataOc,
            ultimaOc: r.numeroOc,
            descVistas: new Set(),
          });
        }
        const entry = fornMap.get(r.fornecedorId)!;
        if (r.dataOc && (!entry.ultimaData || r.dataOc > entry.ultimaData)) {
          entry.ultimaData = r.dataOc;
          entry.ultimaOc = r.numeroOc;
        }
        const descNorm = stripEapPrefix(r.descricao).toLowerCase();
        if (!entry.descVistas.has(descNorm)) {
          entry.descVistas.add(descNorm);
          entry.itensAtendidos++;
        }
      }

      return Array.from(fornMap.values())
        .map(({ descVistas, ...rest }) => rest)
        .sort((a, b) => b.itensAtendidos - a.itensAtendidos)
        .slice(0, 5);
    }),

  scoreFornecedor: protectedProcedure
    .input(z.object({ fornecedorId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c: any) => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      const db = await getDb();
      const scoreData = await calcScoreFornecedor(db, input.fornecedorId, input.companyId);
      return scoreData;
    }),

  scoresFornecedoresLote: protectedProcedure
    .input(z.object({ fornecedorIds: z.array(z.number()), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!allowed.some((c: any) => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
      }
      if (input.fornecedorIds.length === 0) return {};
      const db = await getDb();
      const { companyId } = input;

      const allOcs = await db.select().from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, companyId),
          inArray(comprasOrdens.fornecedorId, input.fornecedorIds),
        ));

      const companyCotIds = await db.select({ id: comprasCotacoes.id })
        .from(comprasCotacoes).where(eq(comprasCotacoes.companyId, companyId));
      const cotIdSet = new Set(companyCotIds.map(c => c.id));

      const allCotPart = cotIdSet.size > 0
        ? await db.select({
            cotacaoId: comprasCotacaoFornecedores.cotacaoId,
            fornecedorId: comprasCotacaoFornecedores.fornecedorId,
            totalOrcado: comprasCotacaoFornecedores.totalOrcado,
            selecionado: comprasCotacaoFornecedores.selecionado,
            prazoEntregaDias: comprasCotacaoFornecedores.prazoEntregaDias,
          }).from(comprasCotacaoFornecedores)
            .where(inArray(comprasCotacaoFornecedores.cotacaoId, [...cotIdSet]))
        : [];

      const minPriceByCot: Record<number, number> = {};
      const minPrazoByCot: Record<number, number> = {};
      for (const cp of allCotPart) {
        const v = n(cp.totalOrcado);
        if (v > 0 && (!(cp.cotacaoId in minPriceByCot) || v < minPriceByCot[cp.cotacaoId])) {
          minPriceByCot[cp.cotacaoId] = v;
        }
        const prazo = cp.prazoEntregaDias ?? 0;
        if (prazo > 0 && (!(cp.cotacaoId in minPrazoByCot) || prazo < minPrazoByCot[cp.cotacaoId])) {
          minPrazoByCot[cp.cotacaoId] = prazo;
        }
      }

      const allAvals = await db.select({ fornecedorId: avaliacoesFornecedor.fornecedorId, nota: avaliacoesFornecedor.nota })
        .from(avaliacoesFornecedor)
        .where(and(
          eq(avaliacoesFornecedor.companyId, companyId),
          inArray(avaliacoesFornecedor.fornecedorId, input.fornecedorIds),
        ));

      const allOcIds = allOcs.map(oc => oc.id);
      const allRecebimentos = allOcIds.length > 0
        ? await db.select({
            ordemCompraId: almoxarifadoRecebimentos.ordemCompraId,
            temDivergencia: almoxarifadoRecebimentos.temDivergencia,
          }).from(almoxarifadoRecebimentos)
            .where(and(
              eq(almoxarifadoRecebimentos.companyId, companyId),
              inArray(almoxarifadoRecebimentos.ordemCompraId, allOcIds),
            ))
        : [];

      const result: Record<number, { score: number; totalOCs: number; taxaPontualidade: number; taxaCompetitividade: number; totalAvaliacoes: number; mediaAvaliacoes: number | null }> = {};

      for (const fornecedorId of input.fornecedorIds) {
        const ocs = allOcs.filter(o => o.fornecedorId === fornecedorId);
        const totalOCs = ocs.length;
        let ocsPontuais = 0, ocsComData = 0;
        for (const oc of ocs) {
          if (oc.dataEntregaPrevista && oc.dataEntregaReal) {
            ocsComData++;
            if (new Date(oc.dataEntregaReal) <= new Date(oc.dataEntregaPrevista)) ocsPontuais++;
          } else if (oc.dataEntregaPrevista && !oc.dataEntregaReal && oc.status === "entregue") {
            ocsComData++;
            ocsPontuais++;
          }
        }
        const taxaPontualidade = ocsComData > 0 ? ocsPontuais / ocsComData : 1;

        const cotPart = allCotPart.filter(cp => cp.fornecedorId === fornecedorId);
        let cotacoesComPreco = 0, melhorPrecoCount = 0;
        let cotacoesComPrazo = 0, melhorPrazoCount = 0;
        for (const cp of cotPart) {
          const v = n(cp.totalOrcado);
          if (v > 0) {
            cotacoesComPreco++;
            if (v <= (minPriceByCot[cp.cotacaoId] ?? Infinity)) melhorPrecoCount++;
          }
          const prazo = cp.prazoEntregaDias ?? 0;
          if (prazo > 0) {
            cotacoesComPrazo++;
            if (prazo <= (minPrazoByCot[cp.cotacaoId] ?? Infinity)) melhorPrazoCount++;
          }
        }
        const taxaCompetitividade = cotacoesComPreco > 0 ? melhorPrecoCount / cotacoesComPreco : 0;
        const taxaPrazoEntrega = cotacoesComPrazo > 0 ? melhorPrazoCount / cotacoesComPrazo : 0;

        const avals = allAvals.filter(a => a.fornecedorId === fornecedorId);
        const mediaAvaliacoes = avals.length > 0 ? avals.reduce((s, r) => s + r.nota, 0) / avals.length : 0;
        const totalAvaliacoes = avals.length;

        const ocIdsForSupplier = ocs.map(oc => oc.id);
        const recebForSupplier = allRecebimentos.filter(r => ocIdsForSupplier.includes(r.ordemCompraId));
        const totalRecebimentos = recebForSupplier.length;
        const totalDivergencias = recebForSupplier.filter(r => r.temDivergencia).length;
        const taxaSemDiv = totalRecebimentos > 0 ? (totalRecebimentos - totalDivergencias) / totalRecebimentos : 1;

        let score = 0;
        score += taxaPontualidade * 5 * 0.25;
        score += taxaCompetitividade * 5 * 0.20;
        score += taxaSemDiv * 5 * 0.15;
        score += taxaPrazoEntrega * 5 * 0.15;
        score += (totalAvaliacoes > 0 ? mediaAvaliacoes : 3) * 0.15;
        score += Math.min(totalOCs / 10, 1) * 5 * 0.10;
        score = Math.round(Math.min(score, 5) * 10) / 10;

        result[fornecedorId] = {
          score,
          totalOCs,
          taxaPontualidade: Math.round(taxaPontualidade * 100),
          taxaCompetitividade: Math.round(taxaCompetitividade * 100),
          totalAvaliacoes,
          mediaAvaliacoes: totalAvaliacoes > 0 ? Math.round(mediaAvaliacoes * 10) / 10 : null,
        };
      }

      return result;
    }),

  dashboardPorObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      periodoInicio: z.string().optional(),
      periodoFim: z.string().optional(),
      statusFiltro: z.string().optional(),
      statusObra: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const obraConditions: any[] = [
        eq(obras.companyId, input.companyId),
        eq(obras.isActive, 1),
        isNull(obras.deletedAt),
      ];
      const so = (input.statusObra || "").toLowerCase();
      if (so && so !== "todas") {
        // Aceita variações ("Em_Andamento" / "Em Andamento" / minúsculas) que
        // existem no banco por entradas legadas e importações.
        const map: Record<string, string[]> = {
          ativas:        ["Em_Andamento", "Em Andamento", "em_andamento", "Ativa", "Ativo"],
          em_andamento:  ["Em_Andamento", "Em Andamento", "em_andamento"],
          planejamento:  ["Planejamento", "planejamento"],
          paralisadas:   ["Paralisada", "Paralisado", "paralisada"],
          paralisada:    ["Paralisada", "Paralisado", "paralisada"],
          concluidas:    ["Concluida", "Concluída", "concluida", "Finalizada"],
          concluida:     ["Concluida", "Concluída", "concluida", "Finalizada"],
          canceladas:    ["Cancelada", "cancelada"],
          cancelada:     ["Cancelada", "cancelada"],
        };
        const targets = map[so];
        if (targets && targets.length) obraConditions.push(inArray(obras.status, targets));
      }

      const obrasAtivas = await db.select().from(obras)
        .where(and(...obraConditions))
        .orderBy(asc(obras.nome));

      const result = await Promise.all(obrasAtivas.map(async (obra) => {
        const orcs = await db.select().from(orcamentos)
          .where(and(
            eq(orcamentos.companyId, input.companyId),
            eq(orcamentos.obraId, obra.id),
          ));
        const totalOrcado = orcs.reduce((s, o) => s + n(o.totalMeta), 0);

        const ocConditions: any[] = [
          eq(comprasOrdens.companyId, input.companyId),
          eq(comprasOrdens.obraId, obra.id),
        ];
        if (input.periodoInicio) ocConditions.push(gte(comprasOrdens.criadoEm, input.periodoInicio));
        if (input.periodoFim) ocConditions.push(lte(comprasOrdens.criadoEm, input.periodoFim));

        const ocsLegacy = await db.select().from(comprasOrdens)
          .where(and(...ocConditions));

        const poConditions: any[] = [
          eq(purchaseOrders.companyId, input.companyId),
          eq(purchaseOrders.obraId, obra.id),
        ];
        if (input.periodoInicio) poConditions.push(gte(purchaseOrders.createdAt, input.periodoInicio));
        if (input.periodoFim) poConditions.push(lte(purchaseOrders.createdAt, input.periodoFim));

        const ocsV2 = await db.select().from(purchaseOrders)
          .where(and(...poConditions));

        const allOCs = [
          ...ocsLegacy.map((o: any) => ({
            id: o.id,
            numero: o.numeroOc || `OC-${o.id}`,
            status: o.status,
            valor: n(o.total),
            fornecedor: o.fornecedorNome,
            data: o.criadoEm,
            source: "legacy" as const,
          })),
          ...ocsV2.map((o: any) => ({
            id: o.id,
            numero: o.numero || `OC-${o.id}`,
            status: o.status,
            valor: n(o.valorTotal),
            fornecedor: o.supplierNome,
            data: o.createdAt,
            source: "v2" as const,
          })),
        ];

        const statusAprovadas = ["aprovada", "emitida", "em_entrega", "recebido", "entregue", "parcial"];
        const statusCancelada = ["cancelada"];

        let totalComprado = 0;
        let totalOCsAtivas = 0;
        allOCs.forEach(oc => {
          if (statusAprovadas.includes(oc.status)) {
            totalComprado += oc.valor;
            totalOCsAtivas++;
          }
        });

        const scConditions: any[] = [
          eq(purchaseRequests.companyId, input.companyId),
          eq(purchaseRequests.obraId, obra.id),
        ];
        if (input.periodoInicio) scConditions.push(gte(purchaseRequests.createdAt, input.periodoInicio));
        if (input.periodoFim) scConditions.push(lte(purchaseRequests.createdAt, input.periodoFim));
        const scs = await db.select().from(purchaseRequests)
          .where(and(...scConditions));

        const scIds = scs.map(sc => sc.id);

        let cotacoesPendentes: any[] = [];
        let totalEmCotacao = 0;
        if (scIds.length > 0) {
          const cotConditions: any[] = [
            eq(purchaseQuotations.companyId, input.companyId),
            inArray(purchaseQuotations.solicitacaoId, scIds),
          ];
          if (input.periodoInicio) cotConditions.push(gte(purchaseQuotations.createdAt, input.periodoInicio));
          if (input.periodoFim) cotConditions.push(lte(purchaseQuotations.createdAt, input.periodoFim));
          cotacoesPendentes = await db.select().from(purchaseQuotations)
            .where(and(...cotConditions));

          const cotacoesAbertas = cotacoesPendentes.filter((c: any) => c.status === "aberta" || c.status === "pendente");
          const scIdsContados = new Set<number>();
          for (const cot of cotacoesAbertas) {
            if (cot.solicitacaoId && !scIdsContados.has(cot.solicitacaoId)) {
              const sc = scs.find(s => s.id === cot.solicitacaoId);
              if (sc) {
                totalEmCotacao += n(sc.valorEstimadoTotal);
                scIdsContados.add(cot.solicitacaoId);
              }
            }
          }
        }

        const legacyCotConditions: any[] = [
          eq(comprasCotacoes.companyId, input.companyId),
          eq(comprasCotacoes.obraId, obra.id),
        ];
        if (input.periodoInicio) legacyCotConditions.push(gte(comprasCotacoes.criadoEm, input.periodoInicio));
        if (input.periodoFim) legacyCotConditions.push(lte(comprasCotacoes.criadoEm, input.periodoFim));
        const legacyCots = await db.select().from(comprasCotacoes)
          .where(and(...legacyCotConditions));
        const legacyCotsPendentes = legacyCots.filter((c: any) =>
          c.status === "aberta" || c.status === "em_andamento" || c.status === "pendente"
        );
        for (const c of legacyCotsPendentes) {
          totalEmCotacao += n(c.total);
        }

        const saldoDisponivel = totalOrcado - totalComprado;
        const percentualExecucao = totalOrcado > 0 ? (totalComprado / totalOrcado) * 100 : 0;
        const alertaSaldo = totalOrcado > 0 && (saldoDisponivel / totalOrcado) < 0.10;

        return {
          obra: {
            id: obra.id,
            nome: obra.nome,
            codigo: obra.codigo,
            status: obra.status,
            cliente: obra.cliente,
          },
          totalOrcado,
          totalComprado,
          totalEmCotacao,
          saldoDisponivel,
          percentualExecucao: Math.min(percentualExecucao, 100),
          alertaSaldo,
          totalOCs: allOCs.length,
          totalOCsAtivas,
          totalSCs: scs.length,
          totalCotacoes: cotacoesPendentes.length + legacyCots.length,
          ocs: allOCs,
          scs: scs.map((sc: any) => ({
            id: sc.id,
            status: sc.status,
            tipo: sc.tipo,
            valorEstimado: n(sc.valorEstimadoTotal),
            solicitante: sc.solicitanteNome,
            data: sc.createdAt,
            emergencial: sc.emergencial === 1,
          })),
          cotacoes: [
            ...cotacoesPendentes.map((c: any) => ({
              id: c.id,
              status: c.status,
              comprador: c.compradorNome,
              validadeAte: c.validadeAte,
              data: c.createdAt,
              source: "v2" as const,
            })),
            ...legacyCots.map((c: any) => ({
              id: c.id,
              status: c.status,
              comprador: null,
              validadeAte: c.dataValidade || null,
              data: c.criadoEm,
              source: "legacy" as const,
            })),
          ],
        };
      }));

      const filtered = input.statusFiltro && input.statusFiltro !== "todos"
        ? result.filter(r => {
            if (input.statusFiltro === "alerta") return r.alertaSaldo;
            if (input.statusFiltro === "com_orcamento") return r.totalOrcado > 0;
            if (input.statusFiltro === "sem_orcamento") return r.totalOrcado === 0;
            return true;
          })
        : result;

      return filtered;
    }),

  getSaldoInsumoPorObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      orcamentoItemIds: z.array(z.number()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const [orc] = await db.select({ id: orcamentos.id }).from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
          isNull(orcamentos.deletedAt),
        ))
        .orderBy(desc(orcamentos.createdAt))
        .limit(1);
      if (!orc) return [];

      const rawResult = await db.execute(sql`
        WITH sc_agg AS (
          SELECT si.orcamento_item_id,
            SUM(CASE WHEN si.quantidade_servico IS NOT NULL THEN si.quantidade_servico ELSE si.quantidade END) AS qtd_solicitada,
            SUM(COALESCE(si.quantidade_atendida, 0)) AS qtd_recebida_sc
          FROM compras_solicitacoes_itens si
          JOIN compras_solicitacoes s ON si.solicitacao_id = s.id
          WHERE s.company_id = ${input.companyId} AND s.status != 'cancelado'
            AND si.orcamento_item_id IN (SELECT id FROM orcamento_itens WHERE "orcamentoId" = ${orc.id})
          GROUP BY si.orcamento_item_id
        ),
        oc_agg AS (
          SELECT si2.orcamento_item_id,
            SUM(oci.quantidade) AS qtd_comprada,
            SUM(COALESCE(oci.quantidade_entregue, 0)) AS qtd_entregue
          FROM compras_ordens_itens oci
          JOIN compras_ordens o ON oci.ordem_id = o.id
          JOIN compras_solicitacoes_itens si2 ON oci.solicitacao_item_id = si2.id
          WHERE o.company_id = ${input.companyId} AND o.status != 'cancelada'
            AND si2.orcamento_item_id IN (SELECT id FROM orcamento_itens WHERE "orcamentoId" = ${orc.id})
          GROUP BY si2.orcamento_item_id
        )
        SELECT oi.id AS "orcamentoItemId",
          oi.quantidade AS "qtdOrcada",
          COALESCE(sc.qtd_solicitada, 0) AS "qtdSolicitada",
          COALESCE(oc.qtd_comprada, 0) AS "qtdComprada",
          GREATEST(COALESCE(sc.qtd_recebida_sc, 0), COALESCE(oc.qtd_entregue, 0)) AS "qtdRecebida"
        FROM orcamento_itens oi
        LEFT JOIN sc_agg sc ON sc.orcamento_item_id = oi.id
        LEFT JOIN oc_agg oc ON oc.orcamento_item_id = oi.id
        WHERE oi."orcamentoId" = ${orc.id}
          AND oi."companyId" = ${input.companyId}
          AND (COALESCE(sc.qtd_solicitada, 0) > 0 OR COALESCE(oc.qtd_comprada, 0) > 0)
      `);

      const rows = (rawResult as any).rows || rawResult || [];
      return (rows as any[]).map((r: any) => {
        const qtdOrcada = n(r.qtdOrcada);
        const qtdSolicitada = n(r.qtdSolicitada);
        return {
          orcamentoItemId: Number(r.orcamentoItemId),
          qtdOrcada,
          qtdSolicitada,
          qtdComprada: n(r.qtdComprada),
          qtdRecebida: n(r.qtdRecebida),
          saldoDisponivel: qtdOrcada - qtdSolicitada,
        };
      });
    }),

  getCoberturaInsumosEAP: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), tipoSC: z.enum(["material", "servico", "pacote", "equipamento", "pecas_veiculo"]).optional(), incluirEquip: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt)).limit(1);
      if (!orc) return [];

      const servicos = await db.select({
        id: orcamentoItens.id,
        servicoCodigo: orcamentoItens.servicoCodigo,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId), sql`${orcamentoItens.servicoCodigo} IS NOT NULL`));

      if (!servicos.length) return [];

      const servicoCodigos = [...new Set(servicos.map(s => s.servicoCodigo!))];
      const insumos = await db.select({
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        insumoCodigo: composicaoInsumos.insumoCodigo,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
        alocacaoEquip: composicaoInsumos.alocacaoEquip,
      }).from(composicaoInsumos)
        .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, servicoCodigos)));

      let filteredCob: typeof insumos;
      filteredCob = filterInsumosByTipo(insumos as any[], input.tipoSC ?? "material", input.incluirEquip ?? false) as typeof insumos;

      const totalInsumosPorComposicao: Record<string, Set<string>> = {};
      for (const ins of filteredCob) {
        if (!totalInsumosPorComposicao[ins.composicaoCodigo]) totalInsumosPorComposicao[ins.composicaoCodigo] = new Set();
        totalInsumosPorComposicao[ins.composicaoCodigo].add(ins.insumoCodigo);
      }

      const scItens = await db.select({
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoesItens.solicitacaoId, comprasSolicitacoes.id))
        .where(and(eq(comprasSolicitacoes.companyId, input.companyId), eq(comprasSolicitacoes.obraId, input.obraId), sql`${comprasSolicitacoes.status} NOT IN ('cancelado')`));

      const insumosCobertosPorOrcItem: Record<number, Set<string>> = {};
      for (const sc of scItens) {
        if (sc.insumoCodigo && sc.orcamentoItemId) {
          if (!insumosCobertosPorOrcItem[sc.orcamentoItemId]) insumosCobertosPorOrcItem[sc.orcamentoItemId] = new Set();
          insumosCobertosPorOrcItem[sc.orcamentoItemId].add(sc.insumoCodigo);
        }
      }

      return servicos.map(svc => {
        const totalSet = totalInsumosPorComposicao[svc.servicoCodigo!] || new Set();
        const totalInsumos = totalSet.size;
        const cobertos = insumosCobertosPorOrcItem[svc.id] || new Set();
        const insumosCobertos = [...cobertos].filter(ic => totalSet.has(ic)).length;
        return {
          orcamentoItemId: svc.id,
          totalInsumos,
          insumosCobertos,
        };
      }).filter(r => r.totalInsumos > 0);
    }),

  getConversaoComercial: protectedProcedure
    .input(z.object({
      insumos: z.array(z.object({
        descricao: z.string(),
        unidade: z.string(),
        quantidade: z.number(),
      })).max(50),
    }))
    .query(async ({ input }) => {
      const conversoes = await getConversaoIA(input.insumos);
      return input.insumos.map(ins => {
        const chave = `${ins.descricao.toLowerCase().trim()}|${ins.unidade.toLowerCase().trim()}`;
        const conv = conversoes[chave];
        if (!conv || conv.fatorConversao <= 0 || conv.fatorConversao === 1) return { descricao: ins.descricao, conversao: null };
        const qtdConvertida = ins.quantidade / conv.fatorConversao;
        return {
          descricao: ins.descricao,
          conversao: {
            texto: `≈ ${qtdConvertida < 1 ? qtdConvertida.toFixed(2) : Math.ceil(qtdConvertida).toLocaleString("pt-BR")} ${conv.embalagem}`,
            embalagem: conv.embalagem,
            fator: conv.fatorConversao,
            unidadeComercial: conv.unidadeComercial,
            qtdConvertida: Math.ceil(qtdConvertida),
          },
        };
      });
    }),

  editarSolicitacao: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      titulo: z.string().optional(),
      departamento: z.string().optional(),
      prioridade: z.string().optional(),
      dataNecessidade: z.string().optional(),
      observacoes: z.string().optional(),
      obraId: z.number().nullable().optional(),
      vehicleId: z.number().nullable().optional(),
      tipo: z.string().optional(),
      // Rev. 2290 — Locação na edição de SC.
      isLocacao: z.boolean().optional(),
      locacaoDuracaoDias: z.number().int().positive().optional().nullable(),
      locacaoDataInicioPrevista: z.string().optional().nullable(),
      locacaoDataFimPrevista: z.string().optional().nullable(),
      imagemReferenciaUrl: z.string().nullable().optional(),
      anexos: z.array(z.object({ url: z.string(), nome: z.string(), tipo: z.string(), ts: z.number() })).optional(),
      itens: z.array(z.object({
        id: z.number().optional(),
        descricao: z.string(),
        unidade: z.string().optional(),
        quantidade: z.number(),
        observacoes: z.string().optional(),
        orcamentoItemId: z.number().optional(),
        eapCodigo: z.string().optional(),
        insumoCodigo: z.string().optional(),
        composicaoCodigo: z.string().optional(),
        precoMeta: z.number().optional(),
        quantidadeServico: z.number().optional(),
        coeficiente: z.number().optional(),
        origemEap: z.boolean().optional(),
        semVerba: z.boolean().optional(),
        motivoSemVerba: z.string().optional(),
        incluirAjudante: z.boolean().optional(),
        metaMdoProfissional: z.number().optional(),
        metaMdoAjudante: z.number().optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const [sc] = await db.select().from(comprasSolicitacoes)
        .where(and(eq(comprasSolicitacoes.id, input.id), eq(comprasSolicitacoes.companyId, input.companyId)));
      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "SC não encontrada." });

      if (!["pendente", "aprovado"].includes(sc.status ?? "") && sc.aprovacaoStatus !== "aguardando") {
        const activeCots = await db.select({ id: comprasCotacoes.id })
          .from(comprasCotacoes)
          .where(and(
            eq(comprasCotacoes.solicitacaoId, input.id),
            sql`${comprasCotacoes.status} NOT IN ('cancelada', 'recusada')`,
          ));
        const activeOCs = activeCots.length > 0
          ? await db.select({ id: comprasOrdens.id }).from(comprasOrdens)
              .where(and(
                inArray(comprasOrdens.cotacaoId, activeCots.map(c => c.id)),
                sql`${comprasOrdens.status} NOT IN ('cancelada', 'recebido')`,
              ))
          : [];
        if (activeOCs.length > 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não é possível editar: SC possui OC em andamento." });
        }
      }

      if (input.vehicleId) {
        const vRows = await db.execute(sql`SELECT id FROM vehicles WHERE id = ${input.vehicleId} AND "companyId" = ${input.companyId}`);
        const vr = (vRows as any).rows || vRows;
        if (!vr || vr.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Veículo não encontrado ou não pertence a esta empresa." });
      }

      await db.update(comprasSolicitacoes).set({
        titulo: input.titulo ? normalizarTexto(input.titulo) : sc.titulo,
        departamento: input.departamento ?? sc.departamento,
        prioridade: input.prioridade ?? sc.prioridade,
        dataNecessidade: input.dataNecessidade ?? sc.dataNecessidade,
        observacoes: input.observacoes !== undefined ? input.observacoes : sc.observacoes,
        obraId: input.obraId !== undefined ? input.obraId : sc.obraId,
        vehicleId: input.vehicleId !== undefined ? input.vehicleId : (sc as any).vehicleId,
        tipo: input.tipo ?? sc.tipo,
        // Rev. 2290 — Locação. Se tipo deixar de ser equipamento, zera tudo.
        ...(() => {
          const tipoFinal = input.tipo ?? sc.tipo;
          if (tipoFinal !== "equipamento") {
            return { isLocacao: false, locacaoDuracaoDias: null, locacaoDataInicioPrevista: null, locacaoDataFimPrevista: null };
          }
          if (input.isLocacao === undefined) return {};
          return {
            isLocacao: input.isLocacao,
            locacaoDuracaoDias: input.isLocacao ? (input.locacaoDuracaoDias ?? null) : null,
            locacaoDataInicioPrevista: input.isLocacao ? (input.locacaoDataInicioPrevista ?? null) : null,
            locacaoDataFimPrevista: input.isLocacao ? (input.locacaoDataFimPrevista ?? null) : null,
          };
        })(),
        imagemReferenciaUrl: input.imagemReferenciaUrl !== undefined ? input.imagemReferenciaUrl : sc.imagemReferenciaUrl,
        ...(input.anexos !== undefined ? { anexos: input.anexos } : {}),
        atualizadoEm: new Date().toISOString(),
      }).where(eq(comprasSolicitacoes.id, input.id));

      // Rev. 3028 — PROPAGAÇÃO DEFINITIVA SC → COTAÇÃO VINCULADA.
      // Antes só o TÍTULO descia (→ descricao). O `tipo` (material/servico/pacote/
      // equipamento/pecas_veiculo) ficava CONGELADO na cotação no valor de criação:
      // ao editar a SC de "material" p/ "pacote", a SC trocava a legenda mas a COT
      // seguia no tipo antigo (ex.: SC=MAT+MDO × COT=MDO). Agora toda edição
      // RECONCILIA as cotações ativas com o tipo atual da SC (idempotente), e o
      // título continua descendo pra `descricao` quando enviado. Cotações
      // canceladas/recusadas ficam intactas (histórico).
      const tipoPropagar = input.tipo ?? sc.tipo;
      await db.update(comprasCotacoes).set({
        tipo: tipoPropagar,
        ...(input.titulo ? { descricao: normalizarTexto(input.titulo) } : {}),
      }).where(and(eq(comprasCotacoes.solicitacaoId, input.id), sql`${comprasCotacoes.status} NOT IN ('cancelada', 'recusada')`));

      if (input.itens) {
        const hasLinkedCot = await db.select({ id: comprasCotacoes.id }).from(comprasCotacoes)
          .where(and(eq(comprasCotacoes.solicitacaoId, input.id), sql`${comprasCotacoes.status} NOT IN ('cancelada', 'recusada')`))
          .limit(1);

        if (hasLinkedCot.length > 0) {
          const inputItemIds = input.itens.filter(it => it.id).map(it => it.id!);
          for (const it of input.itens) {
            if (it.id) {
              await db.update(comprasSolicitacoesItens).set({
                descricao: normalizarTexto(it.descricao),
                unidade: it.unidade,
                quantidade: String(it.quantidade),
                observacoes: it.observacoes,
              }).where(and(eq(comprasSolicitacoesItens.id, it.id), eq(comprasSolicitacoesItens.solicitacaoId, input.id)));
            }
          }
          if (inputItemIds.length > 0) {
            const existingItems = await db.select({ id: comprasSolicitacoesItens.id })
              .from(comprasSolicitacoesItens)
              .where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));
            const removedIds = existingItems.map(i => i.id).filter(id => !inputItemIds.includes(id));
            if (removedIds.length > 0) {
              await db.execute(sql`UPDATE compras_cotacoes_itens SET solicitacao_item_id = NULL WHERE solicitacao_item_id = ANY(${sql.raw("ARRAY[" + removedIds.join(",") + "]::int[]")})`);
              await db.execute(sql`UPDATE compras_ordens_itens SET solicitacao_item_id = NULL WHERE solicitacao_item_id = ANY(${sql.raw("ARRAY[" + removedIds.join(",") + "]::int[]")})`);
              await db.delete(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, removedIds));
            }
          }
        } else {
          const existingItems = await db.select({ id: comprasSolicitacoesItens.id })
            .from(comprasSolicitacoesItens)
            .where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));
          if (existingItems.length > 0) {
            const existingIds = existingItems.map(i => i.id);
            await db.execute(sql`UPDATE compras_cotacoes_itens SET solicitacao_item_id = NULL WHERE solicitacao_item_id = ANY(${sql.raw("ARRAY[" + existingIds.join(",") + "]::int[]")})`);
            await db.execute(sql`UPDATE compras_ordens_itens SET solicitacao_item_id = NULL WHERE solicitacao_item_id = ANY(${sql.raw("ARRAY[" + existingIds.join(",") + "]::int[]")})`);
            await db.delete(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));
          }

          if (input.itens.length > 0) {
            await db.insert(comprasSolicitacoesItens).values(
              input.itens.map(it => ({
                solicitacaoId: input.id,
                descricao: normalizarTexto(it.descricao),
                unidade: it.unidade,
                quantidade: String(it.quantidade),
                observacoes: it.observacoes,
                statusItem: "pendente",
                orcamentoItemId: it.orcamentoItemId ?? null,
                eapCodigo: it.eapCodigo ?? null,
                insumoCodigo: it.insumoCodigo ?? null,
                composicaoCodigo: it.composicaoCodigo ?? null,
                precoMeta: it.precoMeta ? String(it.precoMeta) : null,
                quantidadeServico: it.quantidadeServico ? String(it.quantidadeServico) : null,
                coeficiente: it.coeficiente ? String(it.coeficiente) : null,
                origemEap: it.origemEap ?? false,
                semVerba: it.semVerba ?? false,
                motivoSemVerba: it.motivoSemVerba ?? null,
                incluirAjudante: it.incluirAjudante ?? true,
                metaMdoProfissional: it.metaMdoProfissional ? String(it.metaMdoProfissional) : null,
                metaMdoAjudante: it.metaMdoAjudante ? String(it.metaMdoAjudante) : null,
              }))
            );
          }
        }
      }

      return { ok: true };
    }),

  aprovarSolicitacoesEmLote: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      companyId: z.number(),
      aprovacaoStatus: z.string(),
      aprovadorId: z.number().optional(),
      aprovadorNome: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const resultados: { id: number; ok: boolean; cotacaoCriada?: any; erro?: string }[] = [];

      for (const id of input.ids) {
        try {
          const [sc] = await db.select().from(comprasSolicitacoes).where(and(eq(comprasSolicitacoes.id, id), eq(comprasSolicitacoes.companyId, input.companyId)));
          if (!sc) { resultados.push({ id, ok: false, erro: "SC não encontrada" }); continue; }
          if (sc.aprovacaoStatus !== "aguardando") { resultados.push({ id, ok: false, erro: "SC já foi processada" }); continue; }

          await db.update(comprasSolicitacoes).set({
            aprovacaoStatus: input.aprovacaoStatus,
            aprovadorId: input.aprovadorId ?? null,
            aprovadoEm: input.aprovacaoStatus !== "aguardando" ? new Date().toISOString() : null,
            atualizadoEm: new Date().toISOString(),
          }).where(eq(comprasSolicitacoes.id, id));

          let cotacaoCriada: any = null;

          if (input.aprovacaoStatus === "aprovada") {
            const existingCots = await db.select({ id: comprasCotacoes.id, status: comprasCotacoes.status })
              .from(comprasCotacoes)
              .where(eq(comprasCotacoes.solicitacaoId, id));
            const activeCots = existingCots.filter(c => !["cancelada", "recusada"].includes(c.status ?? ""));

            if (activeCots.length === 0) {
              const scItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, id));

              // Rev. 4001 — numeração + insert dentro de db.transaction com
              // pg_advisory_xact_lock(companyId, 1001). Loop de aprovação EM LOTE
              // é o cenário mais provável de disparar o bug (várias SCs de obras
              // diferentes aprovadas juntas): usava COUNT(*) sem lock/transação,
              // cada iteração lia o mesmo COUNT(*) da anterior antes do commit e
              // gerava numeroCotacao duplicado entre SCs de obras distintas.
              const cot = await db.transaction(async (tx: any) => {
                await tx.execute(sql`SELECT pg_advisory_xact_lock(${sc.companyId}::int, 1001::int)`);
                const count = await tx.select({ c: sql<number>`count(*)` }).from(comprasCotacoes).where(eq(comprasCotacoes.companyId, sc.companyId));
                const seq = (parseInt(String(count[0]?.c ?? 0)) + 1).toString().padStart(4, "0");
                const numeroCotacaoTx = `COT-${new Date().getFullYear()}-${seq}`;

                const [cotRow] = await tx.insert(comprasCotacoes).values({
                  companyId: sc.companyId,
                  numeroCotacao: numeroCotacaoTx,
                  descricao: sc.titulo || sc.departamento || "Cotação automática",
                  prioridade: sc.prioridade ?? "normal",
                  obraId: sc.obraId ?? null,
                  solicitacaoId: sc.id,
                  // Rev. 3028 — a cotação automática nasce com o MESMO tipo da SC
                  // (antes caía no default "material" → legenda divergente quando a
                  // SC era servico/pacote/equipamento). Junto com a propagação no
                  // editarSolicitacao, garante SC×COT sempre consistentes.
                  tipo: sc.tipo ?? "material",
                  total: "0",
                  status: "pendente",
                  criadoPorId: input.aprovadorId ?? null,
                  criadoPorNome: input.aprovadorNome ?? null,
                } as any).returning();

                if (scItens.length > 0) {
                  await tx.insert(comprasCotacoesItens).values(
                    scItens.map(it => ({
                      cotacaoId: cotRow.id,
                      solicitacaoItemId: it.id,
                      descricao: normalizarTexto(it.descricao),
                      unidade: it.unidade ?? "un",
                      quantidade: String(n(it.quantidade)),
                      precoUnitario: "0",
                      descontoPct: "0",
                      total: "0",
                      semVerba: it.semVerba ?? false,
                      motivoSemVerba: it.motivoSemVerba ?? null,
                    }))
                  );
                }

                await tx.update(comprasSolicitacoes).set({ status: "cotacao", atualizadoEm: new Date().toISOString() }).where(eq(comprasSolicitacoes.id, id));
                return cotRow;
              });
              cotacaoCriada = { id: cot.id, numeroCotacao: cot.numeroCotacao };
            }
          }

          resultados.push({ id, ok: true, cotacaoCriada });
        } catch (err: any) {
          resultados.push({ id, ok: false, erro: err.message });
        }
      }

      return resultados;
    }),

  duplicarSolicitacao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), userId: z.number().optional(), userName: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const [sc] = await db.select().from(comprasSolicitacoes)
        .where(and(eq(comprasSolicitacoes.id, input.id), eq(comprasSolicitacoes.companyId, input.companyId)));
      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "SC não encontrada." });

      const scItens = await db.select().from(comprasSolicitacoesItens).where(eq(comprasSolicitacoesItens.solicitacaoId, input.id));

      // Rev. 1799 — R-014 · Geração atômica via counter table. Sem retry, sem lock.
      let novaSc: any = null;
      let numeroScDup = "";
      try {
        novaSc = await db.transaction(async (tx: any) => {
          numeroScDup = await gerarProximoNumeroScAtomico(tx, input.companyId);
          const inserted = await tx.insert(comprasSolicitacoes).values({
            companyId: sc.companyId,
            numeroSc: numeroScDup,
            obraId: sc.obraId,
            projetoId: sc.projetoId,
            solicitanteId: sc.solicitanteId,
            departamento: sc.departamento,
            titulo: sc.titulo ? `${sc.titulo} (cópia)` : undefined,
            prioridade: sc.prioridade ?? "normal",
            dataNecessidade: null,
            observacoes: sc.observacoes,
            imagemReferenciaUrl: sc.imagemReferenciaUrl,
            status: "pendente",
            aprovacaoStatus: "aguardando",
            criadoPorId: input.userId ?? null,
            criadoPorNome: input.userName ?? null,
          } as any).returning();
          return inserted[0];
        });
      } catch (e: any) {
        const code = e?.code || e?.cause?.code;
        const constraint = e?.constraint || e?.cause?.constraint || "";
        console.error("[compras.duplicarSolicitacao] insert falhou (R-014)", {
          companyId: input.companyId,
          numeroScTentativa: numeroScDup,
          code,
          constraint,
          detail: e?.detail || e?.cause?.detail,
          message: e?.message,
        });
        if (code === "23505" && constraint.includes("uq_compras_solicitacoes_numero")) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Numero de SC ${numeroScDup} colidiu (counter dessincronizado). Reinicie o servidor para re-semear o contador.`,
          });
        }
        throw e;
      }
      if (!novaSc) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha desconhecida ao duplicar SC." });
      }

      if (scItens.length > 0) {
        await db.insert(comprasSolicitacoesItens).values(
          scItens.map(it => ({
            solicitacaoId: novaSc.id,
            descricao: normalizarTexto(it.descricao),
            unidade: it.unidade,
            quantidade: it.quantidade,
            observacoes: it.observacoes,
            statusItem: "pendente",
            orcamentoItemId: it.orcamentoItemId,
            eapCodigo: it.eapCodigo,
            insumoCodigo: it.insumoCodigo,
            composicaoCodigo: it.composicaoCodigo,
            precoMeta: it.precoMeta,
            quantidadeServico: it.quantidadeServico,
            coeficiente: it.coeficiente,
            origemEap: it.origemEap ?? false,
          }))
        );
      }

      return novaSc;
    }),

  // Rev. 4017 — Item 10: duplicar Ordem de Compra (padrão análogo a duplicarSolicitacao).
  // Duplica itens + fornecedor + forma de pagamento; NÃO copia datas/histórico/número/status
  // de aprovação/anexos/vínculo com cotação (nova OC nasce como rascunho independente).
  duplicarOrdem: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), userId: z.number().optional(), userName: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const [oc] = await db.select().from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.id), eq(comprasOrdens.companyId, input.companyId)));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de compra não encontrada." });

      const ocItens = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, input.id));

      const numeroOc = await gerarProximoNumeroOC(input.companyId, "compra");

      const [novaOc] = await db.insert(comprasOrdens).values({
        companyId: oc.companyId,
        numeroOc,
        obraId: oc.obraId,
        fornecedorId: oc.fornecedorId,
        fornecedorNome: oc.fornecedorNome,
        dataEntregaPrevista: null,
        dataEntregaReal: null,
        dataVencimento: null,
        formaPagamento: oc.formaPagamento,
        tipoPagamento: oc.tipoPagamento,
        contaBancariaId: oc.contaBancariaId,
        numeroParcelas: oc.numeroParcelas,
        parcelasJson: null,
        prazoEntregaDias: oc.prazoEntregaDias,
        condicaoPagamento: oc.condicaoPagamento,
        observacoes: oc.observacoes ? `${oc.observacoes} (cópia de ${oc.numeroOc})` : `Cópia de ${oc.numeroOc}`,
        numeroNf: null,
        status: "pendente",
        aprovacaoStatus: "aguardando",
        criadoPorId: input.userId ?? null,
        criadoPorNome: input.userName ?? null,
        subtotal: oc.subtotal,
        frete: "0.00",
        outrasDespesas: "0.00",
        impostos: "0.00",
        desconto: "0.00",
        total: oc.subtotal,
        modalidadeFd: oc.modalidadeFd ?? "normal",
        fdPagador: oc.fdPagador,
      } as any).returning();

      if (ocItens.length > 0) {
        await db.insert(comprasOrdensItens).values(
          ocItens.map(it => ({
            ordemId: novaOc.id,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade: it.quantidade,
            precoUnitario: it.precoUnitario,
            total: it.total,
            insumoCodigo: it.insumoCodigo,
          }))
        );
      }

      return novaOc;
    }),

  verificarSaldoOrcamentarioParaOC: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), itens: z.array(z.object({ insumoCodigo: z.string().optional(), descricao: z.string(), quantidade: z.number() })) }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      if (!input.obraId || input.itens.length === 0) return { ok: true, estouros: [] };

      const [orc] = await db.select({ id: orcamentos.id, companyId: orcamentos.companyId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), eq(orcamentos.obraId, input.obraId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt)).limit(1);
      if (!orc) return { ok: true, estouros: [] };

      const insumoCodigosFromInput = input.itens.map(it => it.insumoCodigo).filter(Boolean) as string[];
      if (insumoCodigosFromInput.length === 0) return { ok: true, estouros: [] };

      const orcItems = await db.select({
        id: orcamentoItens.id,
        servicoCodigo: orcamentoItens.servicoCodigo,
        quantidade: orcamentoItens.quantidade,
      }).from(orcamentoItens)
        .where(and(eq(orcamentoItens.orcamentoId, orc.id), eq(orcamentoItens.companyId, input.companyId)));

      const servicoCodigos = [...new Set(orcItems.filter(it => it.servicoCodigo).map(it => it.servicoCodigo!))];
      if (servicoCodigos.length === 0) return { ok: true, estouros: [] };

      const allInsumos = await db.select({
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        insumoCodigo: composicaoInsumos.insumoCodigo,
        insumoDescricao: composicaoInsumos.insumoDescricao,
        quantidade: composicaoInsumos.quantidade,
        alocacaoMat: composicaoInsumos.alocacaoMat,
        alocacaoMdo: composicaoInsumos.alocacaoMdo,
      }).from(composicaoInsumos)
        .where(and(eq(composicaoInsumos.companyId, Number(orc.companyId)), inArray(composicaoInsumos.composicaoCodigo, servicoCodigos)));

      const materiaisOnly = allInsumos.filter(i => n(i.alocacaoMat) > 0);

      const qtdOrcadaMap: Record<string, number> = {};
      for (const ins of materiaisOnly) {
        const key = ins.insumoCodigo || "";
        if (!insumoCodigosFromInput.includes(key)) continue;
        const coef = n(ins.quantidade);
        const matchingServicos = orcItems.filter(s => s.servicoCodigo === ins.composicaoCodigo);
        for (const svc of matchingServicos) {
          const qtdServico = n(svc.quantidade);
          qtdOrcadaMap[key] = (qtdOrcadaMap[key] || 0) + (qtdServico * coef);
        }
      }

      const ocRows = await db.select({
        insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
        quantidade: comprasOrdensItens.quantidade,
      }).from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .innerJoin(comprasSolicitacoesItens, eq(comprasOrdensItens.solicitacaoItemId, comprasSolicitacoesItens.id))
        .where(and(eq(comprasOrdens.companyId, input.companyId), eq(comprasOrdens.obraId, input.obraId), sql`${comprasOrdens.status} NOT IN ('cancelada')`));

      const jaCompradoMap: Record<string, number> = {};
      for (const oc of ocRows) {
        const key = oc.insumoCodigo || "";
        jaCompradoMap[key] = (jaCompradoMap[key] || 0) + n(oc.quantidade);
      }

      const estouros: { insumoCodigo: string; descricao: string; qtdOrcada: number; qtdJaComprada: number; qtdNova: number; qtdTotal: number; excesso: number; percentualExcesso: number }[] = [];
      for (const item of input.itens) {
        if (!item.insumoCodigo) continue;
        const qtdOrcada = qtdOrcadaMap[item.insumoCodigo] || 0;
        if (qtdOrcada <= 0) continue;
        const jaComprada = jaCompradoMap[item.insumoCodigo] || 0;
        const total = jaComprada + item.quantidade;
        if (total > qtdOrcada + 0.01) {
          estouros.push({
            insumoCodigo: item.insumoCodigo,
            descricao: item.descricao,
            qtdOrcada,
            qtdJaComprada: jaComprada,
            qtdNova: item.quantidade,
            qtdTotal: total,
            excesso: total - qtdOrcada,
            percentualExcesso: Math.round(((total - qtdOrcada) / qtdOrcada) * 100),
          });
        }
      }

      return { ok: estouros.length === 0, estouros };
    }),

  aprovarOcExtra: protectedProcedure
    .input(z.object({
      ocId: z.number(),
      companyId: z.number(),
      adminEmail: z.string(),
      adminSenha: z.string(),
      justificativa: z.string().min(1, "Justificativa é obrigatória"),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [admin] = await db.select({
        id: users.id,
        name: users.name,
        role: users.role,
        password: users.password,
      }).from(users).where(eq(users.email, input.adminEmail)).limit(1);

      if (!admin) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário admin não encontrado" });
      if (admin.role !== "admin" && admin.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem aprovar compras extra-orçamento" });

      const bcrypt = await import("bcryptjs");
      const senhaValida = await bcrypt.compare(input.adminSenha, admin.password);
      if (!senhaValida) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });

      const allowed = await getCompaniesForUser(admin.id, admin.role);
      if (!allowed.some((c: any) => c.id === input.companyId))
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin não tem acesso a esta empresa" });

      const [oc] = await db.select().from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.ocId), eq(comprasOrdens.companyId, input.companyId)));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "OC não encontrada" });

      await db.update(comprasOrdens).set({
        aprovacaoExtraRequerida: false,
        aprovacaoExtraAdminId: admin.id,
        aprovacaoExtraAdminNome: admin.name,
        aprovacaoExtraJustificativa: input.justificativa,
        aprovacaoExtraMotivo: input.motivo || "Compra extra-orçamento aprovada pelo admin",
        aprovacaoExtraEm: new Date().toISOString(),
        status: "aprovada",
        aprovacaoStatus: "aprovado",
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasOrdens.id, input.ocId));

      if (oc.fornecedorId && !oc.financialEntryId) {
        try {
          const forn = await db.select().from(fornecedores).where(eq(fornecedores.id, oc.fornecedorId));
          const { entryIds } = await criarParcelasFinanceiras({
            ocId: oc.id,
            companyId: input.companyId,
            obraId: oc.obraId ?? undefined,
            supplierId: oc.fornecedorId,
            supplierNome: forn?.[0]?.razaoSocial || null,
            valorTotal: n(oc.total),
            tipo: (oc as any).tipo,
            tipoPagamento: oc.tipoPagamento,
            condicaoPagamento: (oc as any).condicaoPagamento,
            formaPagamento: (oc as any).formaPagamento || null,
            numeroParcelas: oc.numeroParcelas ?? 1,
            dataBase: oc.dataEntregaPrevista || null,
            numero: oc.numeroOc,
          }, admin.id, admin.name);
          if (entryIds.length > 0) {
            await db.update(comprasOrdens).set({ financialEntryId: entryIds[0] }).where(eq(comprasOrdens.id, oc.id));
          }
        } catch (e: any) { console.warn("[aprovarOcExtra] Erro ao criar parcelas financeiras:", e?.message); }
      }

      const ocTipo = (oc as any).tipo;
      let docsPendentes: string[] = [];
      let contratoGerado: any = null;

      if ((ocTipo === "servico" || ocTipo === "pacote") && oc.fornecedorId) {
        const [forn] = await db.select().from(fornecedores)
          .where(and(eq(fornecedores.id, oc.fornecedorId), eq(fornecedores.companyId, input.companyId)));
        const cnpjForn = forn?.cnpj ?? "";

        if (cnpjForn) {
          const empPJ = await db.execute(sql`
            SELECT id FROM employees WHERE company_id = ${input.companyId} AND tipo = 'pj' AND cnpj = ${cnpjForn} AND deleted_at IS NULL LIMIT 1
          `);
          if ((empPJ as any).rows?.length > 0) {
            const empId = (empPJ as any).rows[0].id;
            const docs = await db.select({ tipo: pjDocumentos.tipo }).from(pjDocumentos)
              .where(and(eq(pjDocumentos.employeeId, empId), eq(pjDocumentos.companyId, input.companyId), sql`${pjDocumentos.deletedAt} IS NULL`));
            const tiposPresentes = new Set(docs.map(d => d.tipo));
            const obrigatorios = ["CNPJ", "contrato_social", "seguro"];
            docsPendentes = obrigatorios.filter(t => !tiposPresentes.has(t));
          } else {
            docsPendentes = ["CNPJ", "contrato_social", "seguro"];
          }
        }

        if (!(oc as any).contratoId) {
          const existingContract = await db.select({ id: pjContracts.id }).from(pjContracts)
            .where(and(
              eq(pjContracts.companyId, input.companyId),
              eq(pjContracts.status, "ativo"),
              isNull(pjContracts.deletedAt),
              sql`EXISTS (
                SELECT 1 FROM employees e WHERE e.id = ${pjContracts.employeeId} AND e.cnpj = (SELECT cnpj FROM fornecedores WHERE id = ${oc.fornecedorId} LIMIT 1)
              )`,
            )).limit(1);

          if (existingContract.length > 0 && (oc as any).isAditivo) {
            const existCt = existingContract[0];
            const ocItensForAditivo = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
            const novoValor = n(oc.total);

            const [ctAtual] = await db.select().from(pjContracts).where(eq(pjContracts.id, existCt.id));
            const valorAtual = parseFloat(String(ctAtual.valorTotalContrato || "0"));
            const novoTotal = valorAtual + novoValor;

            let eapAtual: any[] = [];
            try { eapAtual = JSON.parse(ctAtual.eapItens || "[]"); } catch {}
            const novosItens = ocItensForAditivo.map(it => ({
              descricao: it.descricao,
              unidade: it.unidade,
              quantidade: String(it.quantidade),
              precoUnitario: String(it.precoUnitario),
              total: String(it.total),
              insumoCodigo: (it as any).insumoCodigo ?? null,
              percentualExecutado: 0,
              aditivoOsId: oc.id,
            }));
            const eapMerged = [...eapAtual, ...novosItens];

            const revisaoAtual = parseInt(ctAtual.revisao || "1");
            await db.update(pjContracts).set({
              valorTotalContrato: String(novoTotal.toFixed(2)),
              eapItens: JSON.stringify(eapMerged),
              revisao: String(revisaoAtual + 1).padStart(2, "0"),
              revisaoMotivo: `Aditivo via OS #${oc.numeroOc || oc.id}`,
              updatedAt: new Date().toISOString(),
            } as any).where(eq(pjContracts.id, existCt.id));

            await db.update(comprasOrdens).set({
              contratoId: existCt.id,
              atualizadoEm: new Date().toISOString(),
            } as any).where(eq(comprasOrdens.id, oc.id));

            contratoGerado = { id: existCt.id, tipo: "aditivo" };
          } else {
            const ocItensForContract = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, oc.id));
            contratoGerado = await gerarContratoTerceiroDeOS({
              ocId: oc.id,
              companyId: input.companyId,
              obraId: oc.obraId ?? null,
              fornecedorId: oc.fornecedorId,
              fornecedorNome: oc.fornecedorNome ?? null,
              total: n(oc.total),
              itensOS: ocItensForContract.map(it => ({
                descricao: it.descricao,
                unidade: it.unidade,
                quantidade: String(it.quantidade),
                precoUnitario: String(it.precoUnitario),
                total: String(it.total),
                insumoCodigo: (it as any).insumoCodigo ?? null,
              })),
              userId: admin.id,
              userName: admin.name,
            });
          }
        }
      }

      return {
        success: true,
        adminNome: admin.name,
        docsPendentes: docsPendentes.length > 0 ? docsPendentes : undefined,
        contratoGerado: contratoGerado ? { id: contratoGerado.id, tipo: contratoGerado.tipo || "novo" } : undefined,
      };
    }),

  getSaldoFd: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // Rev. 2815 — As OCs com FD são listadas SEMPRE, independente de a obra ter
      // (ou não) um orçamento FD vinculado. Antes, o early-return abaixo (`!orcamentoId`)
      // descartava ESTA lista inteira: obras como REVTE-CIVIL, sem orçamento FD cadastrado,
      // mostravam o painel vazio mesmo tendo OCs "FAT. DIRETO" (ex.: OC-2026-339).
      // Por isso a query de OCs roda ANTES da checagem de orçamento.
      const ocsComFdRows = await db.select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          // Rev. 2816 — `comprasOrdens` NÃO tem coluna `descricao` (o campo livre é
          // `observacoes`). A Rev. 2814/2815 selecionava `comprasOrdens.descricao`
          // (=undefined no Drizzle) → o `db.select` quebrava em RUNTIME → `getSaldoFd`
          // lançava exceção → Painel FD ficava VAZIO (nem os cards apareciam). E como a
          // Rev. 2815 moveu esta query p/ ANTES do early-return, quebrou TODAS as obras.
          observacoes: comprasOrdens.observacoes,
          fdValor: comprasOrdens.fdValor,
          fdStatus: comprasOrdens.fdStatus,
          modalidadeFd: comprasOrdens.modalidadeFd,
          total: comprasOrdens.total,
          criadoEm: comprasOrdens.criadoEm,
        })
        .from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          eq(comprasOrdens.obraId, input.obraId),
          // FD pode estar gravado como 'fd_fc' (criação DIRETA da OC — enum do front
          // ["normal","fd_cliente","fd_fc"]) OU 'fd_terceiro' (caminho via cotação, que
          // mapeia fd_fc→fd_terceiro). O filtro antigo só pegava 'fd_terceiro', então as
          // OCs FD criadas direto na tela de Ordens (selo "FAT. DIRETO") sumiam do painel.
          sql`${comprasOrdens.modalidadeFd} IN ('fd_cliente', 'fd_terceiro', 'fd_fc')`,
          sql`${comprasOrdens.status} != 'cancelada'`,
        ));
      // Rev. 2818 — "Utilizado" do FD = soma do VALOR EFETIVO de TODAS as OCs FD
      // (fd_cliente/fd_terceiro/fd_fc). `fd_valor` raramente é preenchido (35 de 37
      // OCs FD desta base têm NULL); quando ausente/zero, o valor real do FD é o
      // `total` da OC. Por isso valorEfetivo = fd_valor>0 ? fd_valor : total. Antes só
      // somava fd_valor das fd_cliente → FD real (ex.: REVTE, 2 OCs fd_fc =
      // R$ 89.524,35) não aparecia no painel.
      const ocsComFd = ocsComFdRows.map(oc => {
        const valorEfetivo = n(oc.fdValor) > 0 ? n(oc.fdValor) : n((oc as any).total);
        return {
          id: oc.id,
          numeroOc: oc.numeroOc,
          // Mantém a chave `descricao` no payload (o front PainelFd lê `oc.descricao`),
          // mas a fonte real é `observacoes` da OC.
          descricao: (oc as any).observacoes,
          fdValor: oc.fdValor,
          valorEfetivo,
          total: n((oc as any).total),
          fdStatus: (oc as any).fdStatus,
          modalidadeFd: (oc as any).modalidadeFd,
          data: (oc as any).criadoEm,
        };
      });
      const totalFdComprometido = ocsComFd.reduce((s, oc) => s + oc.valorEfetivo, 0);

      // Rev. 2824 — Numeração própria do FD (FD-001, FD-002…), começando em 001.
      // É DERIVADA (read-only, sem coluna nova): a ordem cronológica das OCs FD da
      // obra (por `data`/criadoEm asc, desempate por id) define o nº sequencial. O FD
      // mais ANTIGO = FD-001. A mesma regra roda no getSaldoFdTodasObras (por obra),
      // então o mesmo lançamento recebe o MESMO nº de FD nas duas visões.
      const ocsComFdNumerado = ocsComFd
        .slice()
        .sort((a, b) => {
          const ta = (a as any).data ? new Date((a as any).data).getTime() : 0;
          const tb = (b as any).data ? new Date((b as any).data).getTime() : 0;
          if (ta !== tb) return ta - tb;
          return a.id - b.id;
        })
        .map((oc, i) => ({ ...oc, numeroFd: `FD-${String(i + 1).padStart(3, "0")}` }));

      // Rev. 2817 — A tabela `obras` NÃO tem coluna `orcamento_id` (nem `company_id`:
      // as colunas reais são camelCase `companyId`/`isActive`). O SELECT cru antigo
      // (`SELECT orcamento_id FROM obras WHERE ... company_id = ...`) lançava em RUNTIME
      // (`column "company_id" does not exist`) → `getSaldoFd` quebrava → Painel FD VAZIO,
      // mesmo após o fix da Rev. 2816 (descricao). O vínculo obra→orçamento vive na
      // tabela `orcamentos` (`companyId`/`obraId`/`deletedAt`). Lemos por lá (primeiro
      // orçamento ativo da obra), via Drizzle (nomes introspectados corretos).
      const orcRows = await db.select({ id: orcamentos.id })
        .from(orcamentos)
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
          isNull(orcamentos.deletedAt),
        ))
        .orderBy(asc(orcamentos.id))
        .limit(1);
      const orcamentoId = orcRows[0]?.id;
      if (!orcamentoId) return { totalFdOrcado: 0, totalFdComprometido, saldoFd: -totalFdComprometido, itensFd: [], ocsComFd: ocsComFdNumerado };

      const itensFd = await db.select().from(bdiFd).where(and(eq(bdiFd.orcamentoId, orcamentoId), eq(bdiFd.companyId, input.companyId)));
      const totalFdOrcado = itensFd.reduce((s, i) => s + n(i.total), 0);

      // Rev. 2846 — marca cada item do FD como comprado/faturado cruzando (de forma
      // APROXIMADA — por código de insumo ou descrição normalizada) com os ITENS das
      // OCs FD desta obra. comprado = existe item de OC FD correspondente; faturado =
      // a OC correspondente está com fd_status='aprovado'. Read-only, sem coluna nova.
      const fdOcItens = await db.select({
          insumoCodigo: comprasOrdensItens.insumoCodigo,
          descricao: comprasOrdensItens.descricao,
          fdStatus: comprasOrdens.fdStatus,
        })
        .from(comprasOrdensItens)
        .innerJoin(comprasOrdens, eq(comprasOrdensItens.ordemId, comprasOrdens.id))
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          eq(comprasOrdens.obraId, input.obraId),
          sql`${comprasOrdens.modalidadeFd} IN ('fd_cliente', 'fd_terceiro', 'fd_fc')`,
          sql`${comprasOrdens.status} != 'cancelada'`,
        ));
      // Cruzamento por DOIS eixos independentes (código OU descrição): um item casa
      // se o CÓDIGO bater OU se a DESCRIÇÃO normalizada bater — cobre o caso misto em
      // que um lado tem código e o outro só descrição (evita falso "Pendente").
      const _normCod = (cod?: string | null) => (cod ?? "").trim().toLowerCase();
      const _normDesc = (desc?: string | null) => (desc ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const compradoCod = new Set<string>();
      const compradoDesc = new Set<string>();
      const faturadoCod = new Set<string>();
      const faturadoDesc = new Set<string>();
      for (const r of fdOcItens) {
        const c = _normCod(r.insumoCodigo);
        const d = _normDesc(r.descricao);
        const aprovado = (r as any).fdStatus === "aprovado";
        if (c) { compradoCod.add(c); if (aprovado) faturadoCod.add(c); }
        if (d) { compradoDesc.add(d); if (aprovado) faturadoDesc.add(d); }
      }
      const _comprado = (cod?: string | null, desc?: string | null) => {
        const c = _normCod(cod), d = _normDesc(desc);
        return (!!c && compradoCod.has(c)) || (!!d && compradoDesc.has(d));
      };
      const _faturado = (cod?: string | null, desc?: string | null) => {
        const c = _normCod(cod), d = _normDesc(desc);
        return (!!c && faturadoCod.has(c)) || (!!d && faturadoDesc.has(d));
      };

      return {
        totalFdOrcado,
        totalFdComprometido,
        saldoFd: totalFdOrcado - totalFdComprometido,
        itensFd: itensFd.map(i => ({
          id: i.id,
          codigoInsumo: i.codigoInsumo,
          descricao: i.descricao,
          unidade: i.unidade,
          qtdOrcada: n(i.qtdOrcada),
          precoUnit: n(i.precoUnit),
          total: n(i.total),
          comprado: _comprado(i.codigoInsumo, i.descricao),
          faturado: _faturado(i.codigoInsumo, i.descricao),
        })),
        ocsComFd: ocsComFdNumerado,
      };
    }),

  // Rev. 2817 — Visão "Todas as obras" do Painel FD: agrega orçado/comprometido/saldo
  // de FD por obra da empresa + lista consolidada das OCs com FD (com o nome da obra).
  // Usa os MESMOS critérios do getSaldoFd (modalidade IN fd_cliente/fd_terceiro/fd_fc,
  // status != cancelada; comprometido/utilizado = soma do valorEfetivo (fd_valor>0 ? fd_valor :
  // total) de TODAS as OCs FD — Rev. 2818; orçado = soma bdi_fd do orçamento ativo da obra).
  getSaldoFdTodasObras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      // OCs com FD de TODA a empresa (qualquer obra)
      const ocsRows = await db.select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          obraId: comprasOrdens.obraId,
          observacoes: comprasOrdens.observacoes,
          fdValor: comprasOrdens.fdValor,
          fdStatus: comprasOrdens.fdStatus,
          modalidadeFd: comprasOrdens.modalidadeFd,
          total: comprasOrdens.total,
          criadoEm: comprasOrdens.criadoEm,
        })
        .from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          sql`${comprasOrdens.modalidadeFd} IN ('fd_cliente', 'fd_terceiro', 'fd_fc')`,
          sql`${comprasOrdens.status} != 'cancelada'`,
        ));

      // Nomes das obras ativas (colunas reais camelCase: companyId/isActive)
      const obrasRows = await db.select({ id: obras.id, nome: obras.nome })
        .from(obras)
        .where(and(eq(obras.companyId, input.companyId), eq(obras.isActive, 1)));
      const obraNomeById = new Map<number, string>();
      for (const o of obrasRows) obraNomeById.set(o.id, o.nome);

      // Orçamento ativo (primeiro) por obra
      const orcRows = await db.select({ id: orcamentos.id, obraId: orcamentos.obraId })
        .from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), isNull(orcamentos.deletedAt)))
        .orderBy(asc(orcamentos.id));
      const orcamentoIdByObra = new Map<number, number>();
      for (const r of orcRows) {
        if (r.obraId != null && !orcamentoIdByObra.has(r.obraId)) orcamentoIdByObra.set(r.obraId, r.id);
      }

      // Total FD orçado por orçamento (soma bdi_fd)
      const bdiRows = await db.select({
          orcamentoId: bdiFd.orcamentoId,
          total: sql<string>`SUM(${bdiFd.total})`,
        })
        .from(bdiFd)
        .where(eq(bdiFd.companyId, input.companyId))
        .groupBy(bdiFd.orcamentoId);
      const orcadoByOrcamento = new Map<number, number>();
      for (const r of bdiRows) orcadoByOrcamento.set(r.orcamentoId, n(r.total));

      type Row = { obraId: number; obraNome: string; totalFdOrcado: number; totalFdComprometido: number; saldoFd: number; qtdOcsFd: number };
      const byObra = new Map<number, Row>();
      const ensure = (obraId: number): Row => {
        let r = byObra.get(obraId);
        if (!r) {
          const orcId = orcamentoIdByObra.get(obraId);
          const orcado = orcId ? (orcadoByOrcamento.get(orcId) ?? 0) : 0;
          r = { obraId, obraNome: obraNomeById.get(obraId) ?? `Obra #${obraId}`, totalFdOrcado: orcado, totalFdComprometido: 0, saldoFd: orcado, qtdOcsFd: 0 };
          byObra.set(obraId, r);
        }
        return r;
      };
      // Semeia obras que têm orçamento FD (>0) mesmo sem nenhuma OC FD
      for (const [obraId, orcId] of orcamentoIdByObra) {
        if ((orcadoByOrcamento.get(orcId) ?? 0) > 0) ensure(obraId);
      }

      // Rev. 2818 — valorEfetivo = fd_valor>0 ? fd_valor : total (mesma regra do getSaldoFd).
      const ocsComFd = ocsRows.map(oc => {
        const valorEfetivo = n(oc.fdValor) > 0 ? n(oc.fdValor) : n((oc as any).total);
        return {
          id: oc.id,
          numeroOc: oc.numeroOc,
          obraId: oc.obraId,
          obraNome: oc.obraId != null ? (obraNomeById.get(oc.obraId) ?? `Obra #${oc.obraId}`) : "—",
          descricao: oc.observacoes,
          fdValor: oc.fdValor,
          valorEfetivo,
          total: n((oc as any).total),
          fdStatus: oc.fdStatus,
          modalidadeFd: oc.modalidadeFd,
          data: (oc as any).criadoEm,
        };
      });
      // Rev. 2824 — Numeração própria do FD por OBRA (FD-001…), mesma regra do
      // getSaldoFd: ordem cronológica (data/criadoEm asc, desempate por id) dentro de
      // cada obra → o mesmo lançamento recebe o MESMO nº de FD nas duas visões. Muta
      // os objetos do array `ocsComFd` (referências), preservando a ordem de retorno.
      const ocsPorObra = new Map<number | string, any[]>();
      for (const oc of ocsComFd) {
        const k = oc.obraId ?? "__sem_obra__";
        if (!ocsPorObra.has(k)) ocsPorObra.set(k, []);
        ocsPorObra.get(k)!.push(oc);
      }
      for (const lista of ocsPorObra.values()) {
        lista.sort((a, b) => {
          const ta = a.data ? new Date(a.data).getTime() : 0;
          const tb = b.data ? new Date(b.data).getTime() : 0;
          if (ta !== tb) return ta - tb;
          return a.id - b.id;
        });
        lista.forEach((oc, i) => { oc.numeroFd = `FD-${String(i + 1).padStart(3, "0")}`; });
      }

      for (const oc of ocsRows) {
        if (oc.obraId == null) continue;
        const r = ensure(oc.obraId);
        r.qtdOcsFd += 1;
        r.totalFdComprometido += n(oc.fdValor) > 0 ? n(oc.fdValor) : n((oc as any).total);
      }
      for (const r of byObra.values()) r.saldoFd = r.totalFdOrcado - r.totalFdComprometido;

      const porObra = [...byObra.values()].sort((a, b) => a.obraNome.localeCompare(b.obraNome, "pt-BR"));
      const totais = porObra.reduce((acc, r) => {
        acc.totalFdOrcado += r.totalFdOrcado;
        acc.totalFdComprometido += r.totalFdComprometido;
        return acc;
      }, { totalFdOrcado: 0, totalFdComprometido: 0, saldoFd: 0 });
      totais.saldoFd = totais.totalFdOrcado - totais.totalFdComprometido;

      return { porObra, ocsComFd, totais };
    }),

  getCotacaoSplitMatMdo: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes).where(and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId)));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND" });

      let tipoSC: string | null = null;
      if (cot.solicitacaoId) {
        const [sc] = await db.select({ tipo: comprasSolicitacoes.tipo }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
        tipoSC = sc?.tipo ?? null;
      }
      const tipoOrigem = tipoSC ?? cot.tipo ?? "material";

      const itens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));

      const allRespostas = await db.select().from(comprasCotacaoRespostas).where(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId));
      const respByItem: Record<number, any> = {};
      for (const r of allRespostas) {
        if (cot.fornecedorId && r.fornecedorId === cot.fornecedorId) {
          respByItem[r.itemId] = r;
        } else if (!respByItem[r.itemId]) {
          respByItem[r.itemId] = r;
        }
      }

      const scItemIds = itens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
      let scItens: any[] = [];
      if (scItemIds.length > 0) {
        scItens = await db.select({
          id: comprasSolicitacoesItens.id,
          orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
          insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
          composicaoCodigo: comprasSolicitacoesItens.composicaoCodigo,
        }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scItemIds));
      }
      const scToOrc: Record<number, number> = {};
      const scToInsumo: Record<number, string> = {};
      const scToComposicao: Record<number, string> = {};
      for (const s of scItens) {
        if (s.orcamentoItemId) scToOrc[s.id] = s.orcamentoItemId;
        if (s.insumoCodigo) scToInsumo[s.id] = s.insumoCodigo;
        if (s.composicaoCodigo) scToComposicao[s.id] = s.composicaoCodigo;
      }

      const orcItemIds = [...new Set(Object.values(scToOrc))];
      let orcMap: Record<number, { custoUnitMat: number; custoUnitMdo: number; custoUnitTotal: number }> = {};
      if (orcItemIds.length > 0) {
        const orcData = await db.select({
          id: orcamentoItens.id,
          custoUnitMat: orcamentoItens.custoUnitMat,
          custoUnitMdo: orcamentoItens.custoUnitMdo,
          custoUnitTotal: orcamentoItens.custoUnitTotal,
        }).from(orcamentoItens).where(inArray(orcamentoItens.id, orcItemIds));
        for (const o of orcData) orcMap[o.id] = { custoUnitMat: n(o.custoUnitMat), custoUnitMdo: n(o.custoUnitMdo), custoUnitTotal: n(o.custoUnitTotal) };
      }

      const insCodigos = [...new Set(Object.values(scToInsumo))];
      let insumoAlocMap: Record<string, { mat: number; mdo: number }> = {};
      if (insCodigos.length > 0) {
        try {
          const compCodigos = [...new Set(Object.values(scToComposicao))];
          const compInsWhere = compCodigos.length > 0
            ? and(eq(composicaoInsumos.companyId, input.companyId), inArray(composicaoInsumos.insumoCodigo, insCodigos), inArray(composicaoInsumos.composicaoCodigo, compCodigos))
            : and(eq(composicaoInsumos.companyId, input.companyId), inArray(composicaoInsumos.insumoCodigo, insCodigos));
          const compIns = await db.select({
            composicaoCodigo: composicaoInsumos.composicaoCodigo,
            insumoCodigo: composicaoInsumos.insumoCodigo,
            alocacaoMat: composicaoInsumos.alocacaoMat,
            alocacaoMdo: composicaoInsumos.alocacaoMdo,
          }).from(composicaoInsumos).where(compInsWhere);
          for (const ci of compIns) {
            const key = `${ci.composicaoCodigo}|${ci.insumoCodigo}`;
            const mat = n(ci.alocacaoMat);
            const mdo = n(ci.alocacaoMdo);
            insumoAlocMap[key] = { mat, mdo };
            if (!insumoAlocMap[ci.insumoCodigo]) {
              insumoAlocMap[ci.insumoCodigo] = { mat, mdo };
            }
          }
        } catch (e) { /* composicaoInsumos may not exist */ }
      }

      let totalMat = 0;
      let totalMdo = 0;
      const itensClassificados: { id: number; descricao: string; valor: number; valorMat: number; valorMdo: number; tipo: string }[] = [];

      for (const it of itens) {
        const resp = respByItem[it.id];
        const qtd = resp ? n(resp.quantidade) : n(it.quantidade);
        const valorItem = resp ? n(resp.total) : n(it.total);

        const orcId = it.solicitacaoItemId ? scToOrc[it.solicitacaoItemId] : undefined;
        const orc = orcId ? orcMap[orcId] : undefined;
        const insCode = it.solicitacaoItemId ? scToInsumo[it.solicitacaoItemId] : undefined;
        const compCode = it.solicitacaoItemId ? scToComposicao[it.solicitacaoItemId] : undefined;
        const alocacao = (insCode && compCode ? insumoAlocMap[`${compCode}|${insCode}`] : undefined) ?? (insCode ? insumoAlocMap[insCode] : undefined);

        let ratioMat = 1;
        let itemTipo = "material";

        if (orc && orc.custoUnitTotal > 0) {
          ratioMat = orc.custoUnitMat / orc.custoUnitTotal;
          itemTipo = ratioMat >= 0.99 ? "material" : ratioMat <= 0.01 ? "servico" : "pacote";
        } else if (alocacao) {
          const total = alocacao.mat + alocacao.mdo;
          ratioMat = total > 0 ? alocacao.mat / total : 1;
          itemTipo = ratioMat >= 0.99 ? "material" : ratioMat <= 0.01 ? "servico" : "pacote";
        } else if (tipoOrigem === "material") {
          ratioMat = 1;
          itemTipo = "material";
        } else if (tipoOrigem === "servico") {
          ratioMat = 0;
          itemTipo = "servico";
        } else if (tipoOrigem === "pacote") {
          ratioMat = 1;
          itemTipo = "material";
        }

        let valorEfetivo = valorItem;
        if (valorEfetivo <= 0 && orc) {
          valorEfetivo = orc.custoUnitTotal * qtd;
        }

        const vMat = valorEfetivo * ratioMat;
        const vMdo = valorEfetivo * (1 - ratioMat);
        totalMat += vMat;
        totalMdo += vMdo;
        itensClassificados.push({ id: it.id, descricao: it.descricao, valor: Math.round(valorEfetivo * 100) / 100, valorMat: Math.round(vMat * 100) / 100, valorMdo: Math.round(vMdo * 100) / 100, tipo: itemTipo });
      }

      return {
        tipoOrigem,
        totalGeral: Math.round((totalMat + totalMdo) * 100) / 100,
        totalMat: Math.round(totalMat * 100) / 100,
        totalMdo: Math.round(totalMdo * 100) / 100,
        temVencedor: !!cot.fornecedorId,
        temRespostas: allRespostas.length > 0,
        itens: itensClassificados,
      };
    }),

  marcarCotacaoFd: protectedProcedure
    .input(z.object({
      cotacaoId: z.number(),
      companyId: z.number(),
      modalidade: z.enum(["fd_cliente", "fd_fc"]),
      valor: z.number().positive("Valor do FD deve ser maior que zero"),
      bdiItemId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes)
        .where(and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId)));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });
      if (cot.status !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: "FD só pode ser definido em cotações pendentes" });

      {
        let tipoOrigem = cot.tipo ?? "material";
        if (cot.solicitacaoId) {
          const [sc] = await db.select({ tipo: comprasSolicitacoes.tipo }).from(comprasSolicitacoes).where(eq(comprasSolicitacoes.id, cot.solicitacaoId));
          if (sc?.tipo) tipoOrigem = sc.tipo;
        }
        if (tipoOrigem === "servico") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "FD não é permitido para cotações 100% mão de obra." });
        }

        try {
          const fdItens = await db.select().from(comprasCotacoesItens).where(eq(comprasCotacoesItens.cotacaoId, input.cotacaoId));
          const scFdIds = fdItens.map(i => i.solicitacaoItemId).filter(Boolean) as number[];
          let fdScItens: any[] = [];
          if (scFdIds.length > 0) {
            fdScItens = await db.select({
              id: comprasSolicitacoesItens.id,
              orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
              insumoCodigo: comprasSolicitacoesItens.insumoCodigo,
              composicaoCodigo: comprasSolicitacoesItens.composicaoCodigo,
            }).from(comprasSolicitacoesItens).where(inArray(comprasSolicitacoesItens.id, scFdIds));
          }
          const fdScToOrc: Record<number, number> = {};
          const fdScToInsumo: Record<number, string> = {};
          const fdScToComp: Record<number, string> = {};
          for (const s of fdScItens) {
            if (s.orcamentoItemId) fdScToOrc[s.id] = s.orcamentoItemId;
            if (s.insumoCodigo) fdScToInsumo[s.id] = s.insumoCodigo;
            if (s.composicaoCodigo) fdScToComp[s.id] = s.composicaoCodigo;
          }
          const fdOrcIds = [...new Set(Object.values(fdScToOrc))];
          let fdOrcMap: Record<number, { mat: number; mdo: number; total: number }> = {};
          if (fdOrcIds.length > 0) {
            const fdOrcData = await db.select({ id: orcamentoItens.id, custoUnitMat: orcamentoItens.custoUnitMat, custoUnitMdo: orcamentoItens.custoUnitMdo, custoUnitTotal: orcamentoItens.custoUnitTotal })
              .from(orcamentoItens).where(inArray(orcamentoItens.id, fdOrcIds));
            for (const o of fdOrcData) fdOrcMap[o.id] = { mat: n(o.custoUnitMat), mdo: n(o.custoUnitMdo), total: n(o.custoUnitTotal) };
          }

          const fdInsCodigos = [...new Set(Object.values(fdScToInsumo))];
          let fdInsumoAlocMap: Record<string, { mat: number; mdo: number }> = {};
          if (fdInsCodigos.length > 0) {
            try {
              const fdCompCodigos = [...new Set(Object.values(fdScToComp))];
              const fdCompWhere = fdCompCodigos.length > 0
                ? and(eq(composicaoInsumos.companyId, input.companyId), inArray(composicaoInsumos.insumoCodigo, fdInsCodigos), inArray(composicaoInsumos.composicaoCodigo, fdCompCodigos))
                : and(eq(composicaoInsumos.companyId, input.companyId), inArray(composicaoInsumos.insumoCodigo, fdInsCodigos));
              const compIns = await db.select({
                composicaoCodigo: composicaoInsumos.composicaoCodigo,
                insumoCodigo: composicaoInsumos.insumoCodigo,
                alocacaoMat: composicaoInsumos.alocacaoMat,
                alocacaoMdo: composicaoInsumos.alocacaoMdo,
              }).from(composicaoInsumos).where(fdCompWhere);
              for (const ci of compIns) {
                const key = `${ci.composicaoCodigo}|${ci.insumoCodigo}`;
                fdInsumoAlocMap[key] = { mat: n(ci.alocacaoMat), mdo: n(ci.alocacaoMdo) };
                if (!fdInsumoAlocMap[ci.insumoCodigo]) {
                  fdInsumoAlocMap[ci.insumoCodigo] = { mat: n(ci.alocacaoMat), mdo: n(ci.alocacaoMdo) };
                }
              }
            } catch (e) { /* composicaoInsumos may not exist */ }
          }

          const allResps = await db.select().from(comprasCotacaoRespostas).where(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId));
          const rMap: Record<number, any> = {};
          for (const r of allResps) {
            if (cot.fornecedorId && r.fornecedorId === cot.fornecedorId) {
              rMap[r.itemId] = r;
            } else if (!rMap[r.itemId]) {
              rMap[r.itemId] = r;
            }
          }

          let totalMatCalc = 0;
          for (const it of fdItens) {
            const resp = rMap[it.id];
            let valorItem = resp ? n(resp.total) : n(it.total);
            const qtd = resp ? n(resp.quantidade) : n(it.quantidade);
            const orcId = it.solicitacaoItemId ? fdScToOrc[it.solicitacaoItemId] : undefined;
            const orc = orcId ? fdOrcMap[orcId] : undefined;
            const insCode = it.solicitacaoItemId ? fdScToInsumo[it.solicitacaoItemId] : undefined;
            const compCode = it.solicitacaoItemId ? fdScToComp[it.solicitacaoItemId] : undefined;
            const alocacao = (insCode && compCode ? fdInsumoAlocMap[`${compCode}|${insCode}`] : undefined) ?? (insCode ? fdInsumoAlocMap[insCode] : undefined);

            let ratioMat = tipoOrigem === "material" || tipoOrigem === "pacote" ? 1 : 0;
            if (orc && orc.total > 0) {
              ratioMat = orc.mat / orc.total;
            } else if (alocacao) {
              const aTotal = alocacao.mat + alocacao.mdo;
              ratioMat = aTotal > 0 ? alocacao.mat / aTotal : 1;
            }

            if (valorItem <= 0 && orc) {
              valorItem = orc.total * qtd;
            }

            totalMatCalc += valorItem * ratioMat;
          }
          totalMatCalc = Math.round(totalMatCalc * 100) / 100;
          if (totalMatCalc <= 0 && fdItens.length > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "FD não é permitido: nenhum valor de material identificado nesta cotação." });
          }
          if (totalMatCalc > 0 && input.valor > totalMatCalc * 1.001) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `FD excede o valor de material da cotação. Máximo MAT: R$ ${totalMatCalc.toFixed(2)}. Valor solicitado: R$ ${input.valor.toFixed(2)}.` });
          }
        } catch (e: any) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao validar split MAT/MDO. Tente novamente." });
        }
      }

      if (input.modalidade === "fd_cliente" && cot.obraId) {
        try {
          const obraRes = await db.execute(sql`SELECT orcamento_id FROM obras WHERE id = ${cot.obraId} AND company_id = ${input.companyId} LIMIT 1`);
          const orcamentoId = (obraRes as any).rows?.[0]?.orcamento_id;
          if (orcamentoId) {
            const itensFd = await db.select().from(bdiFd).where(and(eq(bdiFd.orcamentoId, orcamentoId), eq(bdiFd.companyId, input.companyId)));
            const totalFdOrcado = itensFd.reduce((s, i) => s + n(i.total), 0);

            const ocsComFd = await db.select({ fdValor: comprasOrdens.fdValor })
              .from(comprasOrdens)
              .where(and(
                eq(comprasOrdens.companyId, input.companyId),
                eq(comprasOrdens.obraId, cot.obraId!),
                sql`${comprasOrdens.modalidadeFd} = 'fd_cliente'`,
                sql`${comprasOrdens.status} != 'cancelada'`,
              ));
            const totalFdComprometidoOcs = ocsComFd.reduce((s, o) => s + n(o.fdValor), 0);

            const cotsFd = await db.execute(sql`
              SELECT fd_valor FROM compras_cotacoes
              WHERE company_id = ${input.companyId} AND obra_id = ${cot.obraId}
                AND modalidade_fd = 'fd_cliente' AND status = 'pendente'
                AND id != ${input.cotacaoId}
            `);
            const totalFdComprometidoCots = ((cotsFd as any).rows ?? []).reduce((s: number, r: any) => s + n(r.fd_valor), 0);

            const saldoFd = totalFdOrcado - totalFdComprometidoOcs - totalFdComprometidoCots;
            if (input.valor > saldoFd) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Saldo de FD insuficiente. Disponível: R$ ${saldoFd.toFixed(2)}. Valor solicitado: R$ ${input.valor.toFixed(2)}.`,
              });
            }
          }
        } catch (e: any) {
          if (e instanceof TRPCError) throw e;
          console.warn("[FD] Erro ao verificar saldo FD (coluna pode não existir):", e.message);
        }
      }

      await db.update(comprasCotacoes).set({
        modalidadeFd: input.modalidade,
        fdValor: String(input.valor.toFixed(2)),
        fdPagador: input.modalidade === "fd_cliente" ? "cliente" : "fc",
        fdBdiItemId: input.bdiItemId ?? null,
      } as any).where(eq(comprasCotacoes.id, input.cotacaoId));

      return { success: true };
    }),

  removerCotacaoFd: protectedProcedure
    .input(z.object({ cotacaoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [cot] = await db.select().from(comprasCotacoes)
        .where(and(eq(comprasCotacoes.id, input.cotacaoId), eq(comprasCotacoes.companyId, input.companyId)));
      if (!cot) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });
      if (cot.status !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: "FD só pode ser removido de cotações pendentes" });
      await db.update(comprasCotacoes).set({
        modalidadeFd: "normal",
        fdValor: null,
        fdPagador: null,
        fdBdiItemId: null,
      } as any).where(eq(comprasCotacoes.id, input.cotacaoId));
      return { success: true };
    }),

  marcarOcComoFd: protectedProcedure
    .input(z.object({
      ocId: z.number(),
      companyId: z.number(),
      modalidade: z.enum(["fd_cliente", "fd_terceiro"]),
      valor: z.number(),
      bdiItemId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [oc] = await db.select().from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.ocId), eq(comprasOrdens.companyId, input.companyId)));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "OC não encontrada" });

      const ocTipo = (oc as any).tipo;
      if (ocTipo === "servico" || ocTipo === "pacote") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Faturamento Direto não é permitido para Ordens de Serviço (MDO). FD é exclusivo para materiais." });
      }

      if (input.modalidade === "fd_terceiro") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "FD Terceiro deve ser marcado via o contrato PJ (use marcarOcFdTerceiro)." });
      }

      if (input.modalidade === "fd_cliente") {
        const obraRes = await db.execute(sql`SELECT orcamento_id FROM obras WHERE id = ${oc.obraId} AND company_id = ${input.companyId} LIMIT 1`);
        const orcamentoId = (obraRes as any).rows?.[0]?.orcamento_id;
        if (orcamentoId) {
          const itensFd = await db.select().from(bdiFd).where(and(eq(bdiFd.orcamentoId, orcamentoId), eq(bdiFd.companyId, input.companyId)));
          const totalFdOrcado = itensFd.reduce((s, i) => s + n(i.total), 0);

          const ocsComFd = await db.select({ fdValor: comprasOrdens.fdValor })
            .from(comprasOrdens)
            .where(and(
              eq(comprasOrdens.companyId, input.companyId),
              eq(comprasOrdens.obraId, oc.obraId!),
              sql`${comprasOrdens.modalidadeFd} = 'fd_cliente'`,
              sql`${comprasOrdens.status} != 'cancelada'`,
              sql`${comprasOrdens.id} != ${input.ocId}`,
            ));
          const totalFdComprometido = ocsComFd.reduce((s, o) => s + n(o.fdValor), 0);
          const saldoFd = totalFdOrcado - totalFdComprometido;

          if (input.valor > saldoFd) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Saldo de FD insuficiente. Disponível: R$ ${saldoFd.toFixed(2)}. Valor desta OC: R$ ${input.valor.toFixed(2)}. Não é possível ultrapassar o teto de FD.`,
            });
          }
        }
      }

      await db.update(comprasOrdens).set({
        modalidadeFd: input.modalidade,
        fdValor: String(input.valor.toFixed(2)),
        fdStatus: "pendente_aprovacao",
        fdBdiItemId: input.bdiItemId ?? null,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasOrdens.id, input.ocId));

      return { success: true };
    }),

  aprovarFdCliente: protectedProcedure
    .input(z.object({ ocId: z.number(), companyId: z.number(), aprovadoPor: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const userRole = (ctx.user as any)?.role;
      if (!["admin", "admin_master"].includes(userRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem aprovar FD." });
      }

      const [oc] = await db.select().from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.ocId), eq(comprasOrdens.companyId, input.companyId)));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "OC não encontrada nesta empresa" });
      if ((oc as any).modalidadeFd !== "fd_cliente") throw new TRPCError({ code: "BAD_REQUEST", message: "OC não é FD Cliente" });
      if ((oc as any).fdStatus === "aprovado") throw new TRPCError({ code: "BAD_REQUEST", message: "FD já aprovado" });

      await db.update(comprasOrdens).set({
        fdStatus: "aprovado",
        fdAprovadoEm: new Date().toISOString(),
        fdAprovadoPor: ctx.user.name || input.aprovadoPor,
        atualizadoEm: new Date().toISOString(),
      } as any).where(and(eq(comprasOrdens.id, input.ocId), eq(comprasOrdens.companyId, input.companyId)));

      if (oc.obraId) {
        const obraRes = await db.execute(sql`SELECT orcamento_id FROM obras WHERE id = ${oc.obraId} AND company_id = ${input.companyId} LIMIT 1`);
        const orcamentoId = (obraRes as any).rows?.[0]?.orcamento_id;
        if (orcamentoId) {
          const contratos = await db.select().from(medicaoContratos)
            .where(and(eq(medicaoContratos.companyId, input.companyId), sql`${medicaoContratos.orcamentoId} = ${orcamentoId}`));
          if (contratos.length > 0) {
            const existing = await db.select({ id: medicaoFdRegistros.id }).from(medicaoFdRegistros)
              .where(and(eq(medicaoFdRegistros.companyId, input.companyId), eq(medicaoFdRegistros.compraId, oc.id)));
            if (existing.length === 0) {
              await db.insert(medicaoFdRegistros).values({
                companyId: input.companyId,
                contratoId: contratos[0].id,
                descricao: `FD Cliente — OC ${oc.numeroOc || `#${oc.id}`}: ${oc.descricao || "Material"}`,
                valor: String(n((oc as any).fdValor).toFixed(2)),
                dataRegistro: new Date().toISOString().split("T")[0],
                origem: "bdi",
                observacoes: `Auto-gerado da OC #${oc.id} aprovada como FD Cliente`,
                compraId: oc.id,
              } as any);
            }
          }
        }
      }

      return { success: true };
    }),

  ajustarFd: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      orcamentoId: z.number(),
      bdiFdId: z.number(),
      novoValor: z.number(),
      justificativa: z.string().min(5, "Justificativa obrigatória (mín. 5 caracteres)"),
      adminEmail: z.string(),
      adminSenha: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const [admin] = await db.select({ id: users.id, name: users.name, role: users.role, password: users.password })
        .from(users).where(eq(users.email, input.adminEmail)).limit(1);
      if (!admin) throw new TRPCError({ code: "NOT_FOUND", message: "Admin não encontrado" });
      if (admin.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Somente Admin Master pode ajustar o FD" });

      const adminComps = await db.select().from(userCompanies).where(and(eq(userCompanies.userId, admin.id), eq(userCompanies.companyId, input.companyId)));
      if (adminComps.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Admin não pertence a esta empresa" });

      const bcrypt = await import("bcryptjs");
      if (!(await bcrypt.compare(input.adminSenha, admin.password))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });

      const [item] = await db.select().from(bdiFd).where(and(eq(bdiFd.id, input.bdiFdId), eq(bdiFd.companyId, input.companyId)));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item FD não encontrado" });

      const valorAnterior = n(item.total);
      await db.update(bdiFd).set({ total: String(input.novoValor.toFixed(2)) } as any).where(eq(bdiFd.id, input.bdiFdId));

      await db.insert(fdAjustes).values({
        companyId: input.companyId,
        orcamentoId: input.orcamentoId,
        tipo: "ajuste_valor",
        descricao: `Item: ${item.descricao} (${item.codigoInsumo})`,
        valorAnterior: String(valorAnterior.toFixed(2)),
        valorNovo: String(input.novoValor.toFixed(2)),
        justificativa: input.justificativa,
        adminId: admin.id,
        adminNome: admin.name,
      } as any);

      return { success: true, adminNome: admin.name };
    }),

  getHistoricoFdAjustes: protectedProcedure
    .input(z.object({ companyId: z.number(), orcamentoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return db.select().from(fdAjustes)
        .where(and(eq(fdAjustes.companyId, input.companyId), eq(fdAjustes.orcamentoId, input.orcamentoId)))
        .orderBy(desc(fdAjustes.createdAt));
    }),

  adicionarItemFd: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      orcamentoId: z.number(),
      codigoInsumo: z.string().optional(),
      descricao: z.string(),
      unidade: z.string().optional(),
      qtdOrcada: z.number(),
      precoUnit: z.number(),
      fornecedor: z.string().optional(),
      adminEmail: z.string(),
      adminSenha: z.string(),
      justificativa: z.string().min(5),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const [admin] = await db.select({ id: users.id, name: users.name, role: users.role, password: users.password })
        .from(users).where(eq(users.email, input.adminEmail)).limit(1);
      if (!admin) throw new TRPCError({ code: "NOT_FOUND", message: "Admin não encontrado" });
      if (admin.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Somente Admin Master pode adicionar itens FD" });

      const adminComps = await db.select().from(userCompanies).where(and(eq(userCompanies.userId, admin.id), eq(userCompanies.companyId, input.companyId)));
      if (adminComps.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Admin não pertence a esta empresa" });

      const bcrypt = await import("bcryptjs");
      if (!(await bcrypt.compare(input.adminSenha, admin.password))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });

      const total = input.qtdOrcada * input.precoUnit;

      await db.insert(bdiFd).values({
        orcamentoId: input.orcamentoId,
        companyId: input.companyId,
        codigoInsumo: input.codigoInsumo || null,
        descricao: input.descricao,
        unidade: input.unidade || "un",
        qtdOrcada: String(input.qtdOrcada),
        precoUnit: String(input.precoUnit.toFixed(2)),
        total: String(total.toFixed(2)),
        fornecedor: input.fornecedor || null,
      } as any);

      await db.insert(fdAjustes).values({
        companyId: input.companyId,
        orcamentoId: input.orcamentoId,
        tipo: "adicao_item",
        descricao: `Adicionado: ${input.descricao} (${input.codigoInsumo || "sem código"})`,
        valorAnterior: "0",
        valorNovo: String(total.toFixed(2)),
        justificativa: input.justificativa,
        adminId: admin.id,
        adminNome: admin.name,
      } as any);

      return { success: true, adminNome: admin.name };
    }),

  removerItemFd: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      orcamentoId: z.number(),
      bdiFdId: z.number(),
      adminEmail: z.string(),
      adminSenha: z.string(),
      justificativa: z.string().min(5),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();

      const [admin] = await db.select({ id: users.id, name: users.name, role: users.role, password: users.password })
        .from(users).where(eq(users.email, input.adminEmail)).limit(1);
      if (!admin) throw new TRPCError({ code: "NOT_FOUND", message: "Admin não encontrado" });
      if (admin.role !== "admin_master") throw new TRPCError({ code: "FORBIDDEN", message: "Somente Admin Master pode remover itens FD" });

      const adminComps = await db.select().from(userCompanies).where(and(eq(userCompanies.userId, admin.id), eq(userCompanies.companyId, input.companyId)));
      if (adminComps.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Admin não pertence a esta empresa" });

      const bcrypt = await import("bcryptjs");
      if (!(await bcrypt.compare(input.adminSenha, admin.password))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });

      const [item] = await db.select().from(bdiFd).where(and(eq(bdiFd.id, input.bdiFdId), eq(bdiFd.companyId, input.companyId)));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item FD não encontrado" });

      const ocsVinculadas = await db.select({ id: comprasOrdens.id })
        .from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          sql`${comprasOrdens.fdBdiItemId} = ${input.bdiFdId}`,
          sql`${comprasOrdens.status} != 'cancelada'`,
        ));
      if (ocsVinculadas.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Este item FD possui ${ocsVinculadas.length} OC(s) vinculada(s). Cancele as OCs antes de remover.` });
      }

      await db.delete(bdiFd).where(eq(bdiFd.id, input.bdiFdId));

      await db.insert(fdAjustes).values({
        companyId: input.companyId,
        orcamentoId: input.orcamentoId,
        tipo: "remocao_item",
        descricao: `Removido: ${item.descricao} (${item.codigoInsumo || "sem código"})`,
        valorAnterior: String(n(item.total).toFixed(2)),
        valorNovo: "0",
        justificativa: input.justificativa,
        adminId: admin.id,
        adminNome: admin.name,
      } as any);

      return { success: true, adminNome: admin.name };
    }),

  getSugestoesContratacao: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      eapCodigoSelecionado: z.string(),
      tipo: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const prefix = input.eapCodigoSelecionado.split(".").slice(0, 2).join(".");

      const allItems = await db.select({
        id: orcamentoItens.id,
        eapCodigo: orcamentoItens.eapCodigo,
        descricao: orcamentoItens.descricao,
        unidade: orcamentoItens.unidade,
        quantidade: orcamentoItens.quantidade,
      }).from(orcamentoItens)
        .innerJoin(orcamentos, eq(orcamentos.id, orcamentoItens.orcamentoId))
        .where(and(
          eq(orcamentos.companyId, input.companyId),
          eq(orcamentos.obraId, input.obraId),
          sql`${orcamentoItens.eapCodigo} LIKE ${prefix + '.%'}`,
          sql`COALESCE(${orcamentoItens.quantidade}::numeric, 0) > 0`,
        ));

      const jaRequisitados = await db.select({
        orcamentoItemId: comprasSolicitacoesItens.orcamentoItemId,
      }).from(comprasSolicitacoesItens)
        .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoes.id, comprasSolicitacoesItens.solicitacaoId))
        .where(and(
          eq(comprasSolicitacoes.companyId, input.companyId),
          eq(comprasSolicitacoes.obraId, input.obraId),
          sql`${comprasSolicitacoesItens.orcamentoItemId} IS NOT NULL`,
        ));
      const jaReqSet = new Set(jaRequisitados.map(r => r.orcamentoItemId));

      const sugestoes = allItems.filter(it =>
        it.eapCodigo !== input.eapCodigoSelecionado && !jaReqSet.has(it.id)
      );

      const descBase = input.eapCodigoSelecionado.split(".").slice(0, 2).join(".");
      const termosBusca = allItems
        .filter(it => it.eapCodigo === input.eapCodigoSelecionado)
        .map(it => it.descricao?.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3))
        .flat()
        .filter(Boolean) as string[];

      let fornecedoresSugeridos: any[] = [];
      try {
        const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const selectedItem = allItems.find(it => it.eapCodigo === input.eapCodigoSelecionado);
        const selectedDesc = strip((selectedItem?.descricao ?? "").toLowerCase());
        const keywords = selectedDesc.split(/\s+/).filter(w => w.length > 3).slice(0, 4);

        const historicoRows = await db.execute(sql`
          SELECT DISTINCT ON (f.id)
            f.id as fornecedor_id, f.razao_social, f.nome_fantasia, f.cidade, f.estado,
            cr.preco_unitario, cr.total as resp_total,
            cci.descricao as item_descricao,
            cc.numero_cotacao, cc.obra_id,
            o.nome as obra_nome,
            cc.criado_em
          FROM compras_cotacao_respostas cr
          JOIN compras_cotacoes cc ON cc.id = cr.cotacao_id
          JOIN compras_cotacoes_itens cci ON cci.id = cr.item_id
          JOIN fornecedores f ON f.id = cr.fornecedor_id AND f.ativo = true
          LEFT JOIN obras o ON o.id = cc.obra_id
          WHERE cc.company_id = ${input.companyId}
            AND cc.status IN ('concluida', 'aprovada')
            AND cr.preco_unitario::numeric > 0
            AND cc.tipo = 'servico'
          ORDER BY f.id, cc.criado_em DESC
        `);

        const rows = historicoRows.rows || historicoRows;

        const matched = keywords.length > 0
          ? (rows as any[]).filter((r: any) => {
              const itemDesc = strip((r.item_descricao || "").toLowerCase());
              return keywords.some(kw => itemDesc.includes(kw));
            })
          : (rows as any[]).slice(0, 5);

        const contratosAtivos = await db.select({
          empresaTerceiraId: terceiroContratos.empresaTerceiraId,
          cnt: sql<number>`count(*)`,
        }).from(terceiroContratos)
          .where(and(
            eq(terceiroContratos.companyId, input.companyId),
            eq(terceiroContratos.status, "ativo"),
          ))
          .groupBy(terceiroContratos.empresaTerceiraId);

        const empresaFornMap: Record<number, number> = {};
        const etRows = await db.select({
          id: empresasTerceiras.id,
          fornecedorId: (empresasTerceiras as any).fornecedorId,
        }).from(empresasTerceiras)
          .where(eq(empresasTerceiras.companyId, input.companyId));
        for (const et of etRows) {
          if (et.fornecedorId) empresaFornMap[et.fornecedorId as number] = et.id;
        }

        const contratoCountMap: Record<number, number> = {};
        for (const c of contratosAtivos) {
          contratoCountMap[c.empresaTerceiraId] = Number(c.cnt);
        }

        fornecedoresSugeridos = (matched as any[]).slice(0, 5).map((r: any) => {
          const etId = empresaFornMap[r.fornecedor_id];
          const qtdContratos = etId ? (contratoCountMap[etId] || 0) : 0;
          return {
            fornecedorId: r.fornecedor_id,
            razaoSocial: r.razao_social,
            nomeFantasia: r.nome_fantasia,
            cidade: r.cidade,
            estado: r.estado,
            precoUnitario: r.preco_unitario,
            obraNome: r.obra_nome,
            numeroCotacao: r.numero_cotacao,
            data: r.criado_em,
            qtdContratosAtivos: qtdContratos,
            alertaConcentracao: qtdContratos >= 3,
          };
        });
      } catch (e) {
        console.error("[getSugestoesContratacao] erro fornecedores:", e);
      }

      return {
        atividadesRelacionadas: sugestoes.slice(0, 10),
        grupoEap: descBase,
        totalDisponiveis: sugestoes.length,
        fornecedoresSugeridos,
      };
    }),

  getDisciplinas: protectedProcedure.input(z.object({
    orcamentoId: z.number(),
    companyId: z.number(),
  })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) return { disciplinas: [], status: "no_db" as const };

    const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
    if (!(allowed || []).some((c: any) => c.id === input.companyId)) throw new TRPCError({ code: "FORBIDDEN" });

    const [orc] = await db.select({ id: orcamentos.id, obraId: orcamentos.obraId }).from(orcamentos)
      .where(and(eq(orcamentos.id, input.orcamentoId), eq(orcamentos.companyId, input.companyId), isNull(orcamentos.deletedAt)))
      .limit(1);
    if (!orc) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado." });

    const rows = await db.select().from(disciplinaClassificacoes)
      .where(and(
        eq(disciplinaClassificacoes.orcamentoId, input.orcamentoId),
        eq(disciplinaClassificacoes.companyId, input.companyId),
      )).orderBy(asc(disciplinaClassificacoes.disciplina), asc(disciplinaClassificacoes.eapCodigo));

    if (rows.length === 0) return { disciplinas: [], status: "nao_classificado" as const };

    const grouped: Record<string, { itens: typeof rows; count: number }> = {};
    rows.forEach(r => {
      if (!grouped[r.disciplina]) grouped[r.disciplina] = { itens: [], count: 0 };
      grouped[r.disciplina].itens.push(r);
      grouped[r.disciplina].count++;
    });

    const saldoRows = await db.select({
      id: orcamentoItens.id,
      eapCodigo: orcamentoItens.eapCodigo,
      descricao: orcamentoItens.descricao,
      unidade: orcamentoItens.unidade,
      quantidade: orcamentoItens.quantidade,
      custoTotal: orcamentoItens.custoTotal,
      vendaTotal: orcamentoItens.vendaTotal,
    }).from(orcamentoItens)
      .where(eq(orcamentoItens.orcamentoId, input.orcamentoId));

    const orcMap: Record<string, any> = {};
    saldoRows.forEach(r => { orcMap[r.eapCodigo || ""] = r; });

    const scItens = await db.select({
      eapCodigo: comprasSolicitacoesItens.eapCodigo,
      qtd: comprasSolicitacoesItens.quantidade,
      status: comprasSolicitacoes.status,
      scId: comprasSolicitacoes.id,
      numeroSc: comprasSolicitacoes.numeroSc,
    }).from(comprasSolicitacoesItens)
      .innerJoin(comprasSolicitacoes, eq(comprasSolicitacoes.id, comprasSolicitacoesItens.solicitacaoId))
      .where(and(
        eq(comprasSolicitacoes.companyId, input.companyId),
        eq(comprasSolicitacoes.obraId, orc.obraId!),
        inArray(comprasSolicitacoes.status, ["aprovada", "aprovado", "em_cotacao", "cotada", "comprada", "pendente"]),
      ));

    const scMap: Record<string, number> = {};
    const scDetalhe: Record<string, { scId: number; numeroSc: string; qtd: number; status: string }[]> = {};
    scItens.forEach(r => {
      if (r.eapCodigo) {
        scMap[r.eapCodigo] = (scMap[r.eapCodigo] || 0) + n(r.qtd);
        if (!scDetalhe[r.eapCodigo]) scDetalhe[r.eapCodigo] = [];
        const existing = scDetalhe[r.eapCodigo].find(s => s.scId === r.scId);
        if (existing) { existing.qtd += n(r.qtd); }
        else { scDetalhe[r.eapCodigo].push({ scId: r.scId, numeroSc: r.numeroSc, qtd: n(r.qtd), status: r.status }); }
      }
    });

    const disciplinas = Object.entries(grouped).map(([nome, g]) => {
      let totalItens = g.count;
      let contratados = 0;
      let comSaldo = 0;
      let semContrato = 0;
      const itens = g.itens.map(item => {
        const orc = orcMap[item.eapCodigo] || {};
        const qtdOrc = n(orc.quantidade);
        const qtdSol = scMap[item.eapCodigo] || 0;
        const saldo = qtdOrc - qtdSol;
        const status = qtdSol >= qtdOrc && qtdOrc > 0 ? "contratado" : qtdSol > 0 ? "parcial" : "sem_contrato";
        if (status === "contratado") contratados++;
        else if (status === "parcial") comSaldo++;
        else semContrato++;
        return {
          id: item.id,
          eapCodigo: item.eapCodigo,
          descricao: item.descricaoItem || orc.descricao || "",
          unidade: orc.unidade || "",
          qtdOrcada: qtdOrc,
          qtdSolicitada: qtdSol,
          saldo,
          custoTotal: n(orc.custoTotal),
          status,
          classificadoPor: item.classificadoPor,
          scs: scDetalhe[item.eapCodigo] || [],
          orcamentoItemId: orc.id ?? null,
        };
      });
      const pctContratado = totalItens > 0 ? Math.round(((contratados + comSaldo * 0.5) / totalItens) * 100) : 0;
      return { nome, totalItens, contratados, comSaldo, semContrato, pctContratado, itens };
    });

    disciplinas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return { disciplinas, status: "ok" as const };
  }),

  // Rev. 2909 — CANCELAMENTO da OC/OS pelo admin master (senha + motivo). Soft-cancel
  // que preserva histórico: a OC vira "cancelada" (+ quem/quando/motivo) e os
  // financeiros NÃO pagos dela (status != pago|recebido|cancelado) viram "cancelado".
  // Se a OC tiver contrato vinculado, CASCATEIA pro contrato (status "cancelado" +
  // medições não pagas + demais OCs do contrato + financeiros não pagos). Pagos ficam
  // intactos. NÃO toca a cotação de origem (upstream/compartilhada). Só admin_master.
  cancelarOrdemMaster: protectedProcedure
    .input(z.object({
      ordemId: z.number(),
      companyId: z.number(),
      password: z.string().optional(),
      motivo: z.string().min(5, "Informe o motivo (mín. 5 caracteres)."),
    }))
    .mutation(async ({ input, ctx }) => {
      if ((ctx.user as any).role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o admin master pode cancelar OC/OS." });
      }
      await verificarSenhaSeLocal(ctx, input.password, true);
      const db = await getDb();
      await _assertCompanyAccess(ctx.user, input.companyId);
      const [oc] = await db.select().from(comprasOrdens)
        .where(and(eq(comprasOrdens.id, input.ordemId), eq(comprasOrdens.companyId, input.companyId)));
      if (!oc) throw new TRPCError({ code: "NOT_FOUND", message: "OC/OS não encontrada." });
      if ((oc as any).status === "cancelada") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta OC/OS já está cancelada." });
      }
      const motivo = input.motivo.trim();
      const usuarioNome = (ctx.user as any).name || "Admin Master";
      const agora = new Date().toISOString();

      let resumo = { contratoCancelado: false, medicoesCanceladas: 0, ocsCanceladas: 0, financeirosCancelados: 0 };

      if ((oc as any).contratoId) {
        // Cascata pelo contrato (cancela ESTA OC + demais OCs + medições + financeiros).
        const { cancelarContratoCascade } = await import("./terceiroContratos");
        resumo = await cancelarContratoCascade(db, {
          contratoId: (oc as any).contratoId,
          companyId: input.companyId,
          motivo,
          usuarioNome,
          usuarioId: ctx.user.id,
        });
      } else {
        // Sem contrato: cancela só a OC + seus financeiros não pagos (transação única).
        await db.transaction(async (tx: any) => {
          await tx.update(comprasOrdens).set({
            status: "cancelada",
            canceladoPor: usuarioNome,
            canceladoEm: agora,
            motivoCancelamento: motivo,
            atualizadoEm: agora,
          } as any).where(and(eq(comprasOrdens.id, input.ordemId), eq(comprasOrdens.companyId, input.companyId)));
          resumo.ocsCanceladas = 1;
          const feRes = await tx.update(financialEntries).set({
            status: "cancelado",
            motivoCancelamento: motivo,
            updatedAt: agora,
          } as any).where(and(
            eq(financialEntries.companyId, input.companyId),
            eq(financialEntries.origemModulo, "compras"),
            eq(financialEntries.origemId, input.ordemId),
            sql`${financialEntries.status} NOT IN ('pago','recebido','cancelado')`,
          )).returning({ id: financialEntries.id });
          resumo.financeirosCancelados = feRes.length;
        });
      }

      await createAuditLog({
        userId: ctx.user.id,
        userName: usuarioNome,
        companyId: input.companyId,
        action: "cancelar",
        module: "compras",
        entityType: "ordem",
        entityId: input.ordemId,
        details: `Cancelamento da OC/OS "${(oc as any).numeroOc || input.ordemId}" — motivo: ${motivo} — contrato cancelado: ${resumo.contratoCancelado ? "sim" : "não"}, medições: ${resumo.medicoesCanceladas}, OCs: ${resumo.ocsCanceladas}, financeiros: ${resumo.financeirosCancelados}`,
        ipAddress: getClientIp(ctx),
      });

      return { ok: true, ...resumo };
    }),

  classificarDisciplinas: protectedProcedure.input(z.object({
    orcamentoId: z.number(),
    companyId: z.number(),
    force: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
    if (!(allowed || []).some((c: any) => c.id === input.companyId)) throw new TRPCError({ code: "FORBIDDEN" });
    await assertAiModuleEnabled(input.companyId, "compras");

    const [orc] = await db.select({ id: orcamentos.id }).from(orcamentos)
      .where(and(eq(orcamentos.id, input.orcamentoId), eq(orcamentos.companyId, input.companyId), isNull(orcamentos.deletedAt)))
      .limit(1);
    if (!orc) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado nesta empresa." });

    const isReclassify = !!input.force;
    if (!input.force) {
      const existing = await db.select({ id: disciplinaClassificacoes.id })
        .from(disciplinaClassificacoes)
        .where(and(eq(disciplinaClassificacoes.orcamentoId, input.orcamentoId), eq(disciplinaClassificacoes.companyId, input.companyId)))
        .limit(1);
      if (existing.length > 0) return { status: "ja_classificado" as const, msg: "Já classificado. Use force=true para reclassificar." };
    }

    const itens = await db.select({
      eapCodigo: orcamentoItens.eapCodigo,
      descricao: orcamentoItens.descricao,
      unidade: orcamentoItens.unidade,
      nivel: orcamentoItens.nivel,
      tipo: orcamentoItens.tipo,
    }).from(orcamentoItens)
      .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
      .orderBy(asc(orcamentoItens.eapCodigo));

    const servicos = itens.filter(i => {
      const t = (i.tipo || "").toLowerCase().trim();
      if (t === "etapa/subetapa" || t === "etapa" || t === "subetapa" || t === "grupo") return false;
      return true;
    });

    if (servicos.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum serviço/composição encontrado neste orçamento." });

    const correcoes = await db.select().from(disciplinaCorrecoes)
      .where(eq(disciplinaCorrecoes.companyId, input.companyId))
      .orderBy(desc(disciplinaCorrecoes.criadoEm))
      .limit(200);

    let correcoesCtx = "";
    if (correcoes.length > 0) {
      correcoesCtx = "\n\nHISTÓRICO DE CORREÇÕES DO USUÁRIO (use como referência para melhorar a classificação):\n";
      const uniq = new Map<string, string>();
      correcoes.forEach(c => { uniq.set(c.eapDescricao.toLowerCase(), c.disciplinaCorrigida); });
      uniq.forEach((disc, desc) => { correcoesCtx += `- "${desc}" → ${disc}\n`; });
    }

    const systemPrompt = `Você é um engenheiro civil sênior especialista em orçamentos de construção civil no Brasil. Sua tarefa é classificar serviços/composições de um orçamento de obra em DISCIPLINAS construtivas.

DISCIPLINAS TÍPICAS (use estas preferencialmente, pode criar outras se necessário):
- Serviços Preliminares (canteiro, mobilização, placa, tapume, barracão)
- Demolição (demolir, remover, arrancar)
- Movimento de Terra (escavação, aterro, terraplanagem, bota-fora)
- Fundações (estaca, tubulão, sapata, bloco de fundação, baldrame)
- Estrutural (concreto, armação, formas, laje, viga, pilar, protensão)
- Alvenaria (bloco, tijolo, verga, contraverga, encunhamento)
- Cobertura (telha, cumeeira, rufo, calha, estrutura metálica cobertura)
- Impermeabilização (manta, membrana, impermeabilizante, cristalização)
- Revestimento (chapisco, reboco, emboço, contrapiso, massa)
- Piso / Pavimentação (cerâmica, porcelanato, granito, asfalto, intertravado, paver)
- Forro (gesso, PVC, mineral, drywall forro)
- Drywall / Divisórias (parede drywall, divisória, painel)
- Pintura (tinta, massa corrida, selador, textura, verniz)
- Esquadrias (porta, janela, vidro, batente, fechadura, ferragem)
- Elétrica (eletroduto, fio, cabo elétrico, disjuntor, quadro elétrico, tomada, interruptor, luminária, iluminação)
- Hidráulica (tubo água, registro, válvula, torneira, louça sanitária, metais, caixa d'água)
- Esgoto / Drenagem (tubo esgoto, caixa de gordura, caixa de inspeção, fossa, sumidouro, drenagem pluvial)
- PCI Elétrica (detector de fumaça, alarme de incêndio, central de alarme, acionador manual, sirene, sinalização emergência, iluminação emergência, luz emergência, botoeira, painel de incêndio)
- PCI Hidráulica (sprinkler, hidrante, mangueira incêndio, bomba de incêndio, reservatório incêndio, tubo incêndio, registro recalque, caixa de hidrante, chuveiro automático, válvula governo, extintor, porta corta-fogo)
- CFTV (câmera, DVR, NVR, monitoramento, vigilância eletrônica)
- Cabeamento Estruturado / Dados (cabo de rede, patch panel, rack, fibra óptica, switch, ponto de rede, dados, telecom)
- Automação (controle de acesso, portaria, interfone, automação predial, BMS)
- Ar Condicionado / HVAC (split, VRF, VRV, fan coil, duto ar, condensadora, evaporadora, climatização)
- Elevador / Transporte Vertical (elevador, plataforma, monta-carga, escada rolante)
- Gás (tubulação de gás, central de gás, medidor gás, GLP)
- Limpeza / Acabamento Final (limpeza, acabamento final, arremate, rejunte)
- Paisagismo / Área Externa (jardim, grama, plantio, muro, calçada, meio-fio, piso externo, pergolado)
- Serviços Complementares (outros itens que não se encaixam nas anteriores)

REGRAS IMPORTANTES:
1. Cada item recebe EXATAMENTE uma disciplina
2. Use nomes curtos e padronizados — PREFERENCIALMENTE os nomes da lista acima
3. NÃO USE "Instalações Especiais" como categoria genérica. Separe em: PCI Elétrica, PCI Hidráulica, CFTV, Cabeamento Estruturado / Dados, Automação, Ar Condicionado / HVAC, Elevador, Gás, etc.
4. Analise a DESCRIÇÃO do item com cuidado: eletroduto/cabo/fio dentro de um contexto de dados/CFTV é Cabeamento Estruturado, não Elétrica
5. PCI deve ser SEMPRE separado em duas disciplinas: "PCI Elétrica" (detectores, alarmes, central, sirene, iluminação emergência) e "PCI Hidráulica" (sprinkler, hidrante, bomba, mangueira, tubulação incêndio). NUNCA use apenas "PCI" genérico
6. Priorize as correções do usuário quando houver${correcoesCtx}

Responda APENAS com JSON válido, sem markdown, no formato:
[{"eap":"XX.XX.XX.XX","disc":"Nome da Disciplina"},...]`;

    const CHUNK_SIZE = 150;
    const chunks: typeof servicos[] = [];
    for (let i = 0; i < servicos.length; i += CHUNK_SIZE) {
      chunks.push(servicos.slice(i, i + CHUNK_SIZE));
    }
    console.log(`[ClassificarDisciplinas] ${servicos.length} itens em ${chunks.length} lote(s) de até ${CHUNK_SIZE}`);

    function parseChunkJson(raw: string): Array<{ eap: string; disc: string }> {
      if (!raw || raw.trim().length === 0) return [];
      let jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const bracketStart = jsonStr.indexOf("[");
      if (bracketStart < 0) return [];
      jsonStr = jsonStr.substring(bracketStart);
      const bracketEnd = jsonStr.lastIndexOf("]");
      if (bracketEnd > 0) {
        jsonStr = jsonStr.substring(0, bracketEnd + 1);
      } else {
        const lastComplete = jsonStr.lastIndexOf("}");
        if (lastComplete > 0) {
          jsonStr = jsonStr.substring(0, lastComplete + 1) + "]";
        }
      }
      jsonStr = jsonStr.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
      return JSON.parse(jsonStr);
    }

    const pKey = classifKey(input.orcamentoId, input.companyId);
    classificacaoProgress.set(pKey, { etapa: "Iniciando classificação...", loteAtual: 0, totalLotes: chunks.length, itensProcessados: 0, totalItens: servicos.length, startedAt: Date.now() });

    let classificacoes: Array<{ eap: string; disc: string }> = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const listaSvc = chunk.map(s => `${s.eapCodigo}: ${s.descricao}`).join("\n");
      console.log(`[ClassificarDisciplinas] Processando lote ${ci + 1}/${chunks.length} (${chunk.length} itens)...`);
      classificacaoProgress.set(pKey, { etapa: `Classificando lote ${ci + 1} de ${chunks.length}...`, loteAtual: ci + 1, totalLotes: chunks.length, itensProcessados: ci * CHUNK_SIZE, totalItens: servicos.length, startedAt: classificacaoProgress.get(pKey)?.startedAt || Date.now() });

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Classifique estes ${chunk.length} serviços por disciplina:\n\n${listaSvc}` },
        ],
        maxTokens: 16000,
      });

      const raw = typeof result.choices?.[0]?.message?.content === "string"
        ? result.choices[0].message.content
        : "";

      if (!raw || raw.trim().length === 0) {
        console.error(`[ClassificarDisciplinas] Lote ${ci + 1}: IA retornou resposta vazia`);
        continue;
      }

      try {
        const parsed = parseChunkJson(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          classificacoes.push(...parsed);
          console.log(`[ClassificarDisciplinas] Lote ${ci + 1}: ${parsed.length} classificações obtidas`);
        } else {
          console.error(`[ClassificarDisciplinas] Lote ${ci + 1}: parse retornou vazio`);
        }
      } catch (parseErr: any) {
        console.error(`[ClassificarDisciplinas] Lote ${ci + 1} parse error:`, parseErr?.message, "Raw (first 500):", raw.substring(0, 500));
      }
    }

    classificacaoProgress.set(pKey, { etapa: "Salvando classificações...", loteAtual: chunks.length, totalLotes: chunks.length, itensProcessados: servicos.length, totalItens: servicos.length, startedAt: classificacaoProgress.get(pKey)?.startedAt || Date.now() });

    if (classificacoes.length === 0) {
      classificacaoProgress.delete(pKey);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou classificações. Tente novamente." });
    }

    const svcMap = new Map(servicos.map(s => [s.eapCodigo, s]));
    const seen = new Set<string>();
    const values = classificacoes
      .filter(c => {
        if (!c.eap || !c.disc || !svcMap.has(c.eap)) return false;
        if (seen.has(c.eap)) return false;
        seen.add(c.eap);
        return true;
      })
      .map(c => ({
        companyId: input.companyId,
        orcamentoId: input.orcamentoId,
        disciplina: c.disc.trim(),
        eapCodigo: c.eap,
        descricaoItem: svcMap.get(c.eap)?.descricao || null,
        classificadoPor: "ia" as const,
      }));

    if (values.length === 0)
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Nenhuma classificação válida gerada." });

    await db.transaction(async (tx) => {
      if (isReclassify) {
        await tx.delete(disciplinaClassificacoes)
          .where(and(eq(disciplinaClassificacoes.orcamentoId, input.orcamentoId), eq(disciplinaClassificacoes.companyId, input.companyId)));
      }
      const BATCH = 200;
      for (let i = 0; i < values.length; i += BATCH) {
        await tx.insert(disciplinaClassificacoes).values(values.slice(i, i + BATCH));
      }
    });

    classificacaoProgress.delete(pKey);
    return { status: "ok" as const, total: values.length, disciplinas: [...new Set(values.map(v => v.disciplina))].length };
  }),

  classificacaoProgresso: protectedProcedure.input(z.object({
    orcamentoId: z.number(),
    companyId: z.number(),
  })).query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
    const p = classificacaoProgress.get(classifKey(input.orcamentoId, input.companyId));
    if (!p) return null;
    const pct = p.totalLotes > 0 ? Math.round((p.loteAtual / p.totalLotes) * 100) : 0;
    return { ...p, percentual: Math.min(pct, 99) };
  }),

  corrigirDisciplina: protectedProcedure.input(z.object({
    companyId: z.number(),
    orcamentoId: z.number(),
    itens: z.array(z.object({
      id: z.number(),
      eapCodigo: z.string(),
      descricao: z.string(),
      disciplinaOriginal: z.string(),
      disciplinaNova: z.string(),
    })),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
    if (!(allowed || []).some((c: any) => c.id === input.companyId)) throw new TRPCError({ code: "FORBIDDEN" });

    const userName = ctx.user?.name || "sistema";
    for (const item of input.itens) {
      await db.update(disciplinaClassificacoes)
        .set({ disciplina: item.disciplinaNova, classificadoPor: "usuario" })
        .where(and(
          eq(disciplinaClassificacoes.id, item.id),
          eq(disciplinaClassificacoes.companyId, input.companyId),
          eq(disciplinaClassificacoes.orcamentoId, input.orcamentoId),
        ));

      await db.insert(disciplinaCorrecoes).values({
        companyId: input.companyId,
        eapDescricao: item.descricao,
        disciplinaOriginal: item.disciplinaOriginal,
        disciplinaCorrigida: item.disciplinaNova,
        userId: ctx.user?.id,
        userName,
      });
    }

    return { ok: true, corrigidos: input.itens.length };
  }),

  renomearDisciplina: protectedProcedure.input(z.object({
    companyId: z.number(),
    orcamentoId: z.number(),
    nomeAtual: z.string(),
    nomeNovo: z.string().trim().min(1, "Nome da disciplina não pode ser vazio"),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

    const allowed = await getCompaniesForUser(ctx.user.id, ctx.user.role);
    if (!(allowed || []).some((c: any) => c.id === input.companyId)) throw new TRPCError({ code: "FORBIDDEN" });

    await db.update(disciplinaClassificacoes)
      .set({ disciplina: input.nomeNovo.trim(), classificadoPor: "usuario" })
      .where(and(
        eq(disciplinaClassificacoes.orcamentoId, input.orcamentoId),
        eq(disciplinaClassificacoes.companyId, input.companyId),
        eq(disciplinaClassificacoes.disciplina, input.nomeAtual),
      ));

    const itens = await db.select({ descricaoItem: disciplinaClassificacoes.descricaoItem })
      .from(disciplinaClassificacoes)
      .where(and(
        eq(disciplinaClassificacoes.orcamentoId, input.orcamentoId),
        eq(disciplinaClassificacoes.companyId, input.companyId),
        eq(disciplinaClassificacoes.disciplina, input.nomeNovo.trim()),
      ));

    for (const item of itens) {
      if (item.descricaoItem) {
        await db.insert(disciplinaCorrecoes).values({
          companyId: input.companyId,
          eapDescricao: item.descricaoItem,
          disciplinaOriginal: input.nomeAtual,
          disciplinaCorrigida: input.nomeNovo.trim(),
          userId: ctx.user?.id,
          userName: ctx.user?.name || "sistema",
        });
      }
    }

    return { ok: true };
  }),

  // ══════════════════════════════════════════════════════════════
  // RESERVAS PREVENTIVAS DE SALDO (Rev. 1386)
  // ══════════════════════════════════════════════════════════════

  listarReservasAtivas: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      await _autoSanearReservas(input.companyId);
      const conds: any[] = [
        eq(comprasReservasSaldo.companyId, input.companyId),
        eq(comprasReservasSaldo.status, "ativa"),
      ];
      if (input.obraId) conds.push(eq(comprasReservasSaldo.obraId, input.obraId));
      const rows = await db.select().from(comprasReservasSaldo)
        .where(and(...conds))
        .orderBy(asc(comprasReservasSaldo.prazoLimite));
      // Rev. 2821: resolve o Nº VISÍVEL da cotação (COT-AAAA-NNNN) em LOTE, pra
      // exibir/clicar o número correto em vez do id interno.
      const cotIds = [...new Set(rows.map(r => r.cotacaoId).filter((x): x is number => x != null))];
      const numeroPorCotacao = new Map<number, string>();
      if (cotIds.length > 0) {
        const cots = await db.select({ id: comprasCotacoes.id, numeroCotacao: comprasCotacoes.numeroCotacao })
          .from(comprasCotacoes)
          .where(and(eq(comprasCotacoes.companyId, input.companyId), inArray(comprasCotacoes.id, cotIds)));
        for (const c of cots) if (c.numeroCotacao) numeroPorCotacao.set(c.id, c.numeroCotacao);
      }
      const agora = new Date();
      return rows.map(r => {
        const prazo = new Date(r.prazoLimite);
        const diasRestantes = Math.ceil((prazo.getTime() - agora.getTime()) / 86400000);
        const diasDecorridos = Math.max(0, RESERVA_PRAZO_DIAS - diasRestantes);
        return {
          id: r.id,
          companyId: r.companyId,
          obraId: r.obraId,
          cotacaoId: r.cotacaoId,
          numeroCotacao: r.cotacaoId != null ? (numeroPorCotacao.get(r.cotacaoId) ?? null) : null,
          ordemId: r.ordemId,
          responsavelId: r.responsavelOriginalId,
          responsavelNome: r.responsavelOriginalNome,
          valorDi08: n(r.valorDi08Reservado),
          valorEconomia: n(r.valorEconomiaReservada),
          valorTotal: n(r.valorDi08Reservado) + n(r.valorEconomiaReservada),
          prazoLimite: r.prazoLimite,
          diasRestantes,
          diasDecorridos,
          vencida: diasRestantes <= 0,
          motivo: r.motivo,
          criadoEm: r.criadoEm,
          atualizadoEm: r.atualizadoEm,
        };
      });
    }),

  verificarTravamentoCompras: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      return _statusTravamentoCompras(input.companyId);
    }),

  estenderPrazoReserva: protectedProcedure
    .input(z.object({
      reservaId: z.number(),
      diasAdicionais: z.number().min(1).max(60),
      motivo: z.string().min(3, "Justificativa obrigatória"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const role: string | undefined = (ctx?.user as any)?.role;
      const limites: Record<string, number> = {
        admin_master: 60,
        diretor: 7,
        gerente_compras: 3,
      };
      const limite = limites[role ?? ""];
      if (!limite) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin_master, diretor ou gerente_compras podem estender prazos." });
      }
      if (input.diasAdicionais > limite) {
        throw new TRPCError({ code: "FORBIDDEN", message: `Seu perfil pode estender no máximo ${limite} dia(s).` });
      }
      const [r] = await db.select().from(comprasReservasSaldo).where(eq(comprasReservasSaldo.id, input.reservaId));
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Reserva não encontrada." });
      await _assertCompanyAccess(ctx.user, r.companyId);
      if (r.status !== "ativa") throw new TRPCError({ code: "BAD_REQUEST", message: "Reserva não está ativa." });
      const novoPrazo = new Date(r.prazoLimite);
      novoPrazo.setDate(novoPrazo.getDate() + input.diasAdicionais);
      await db.update(comprasReservasSaldo).set({
        prazoLimite: novoPrazo.toISOString(),
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasReservasSaldo.id, input.reservaId));
      await _registrarLogReserva({
        reservaId: input.reservaId, acao: "estendida", companyId: r.companyId,
        executadoPorId: ctx.user?.id, executadoPorNome: ctx.user?.name ?? ctx.user?.email,
        prazoAdicionalDias: input.diasAdicionais, motivo: input.motivo,
        detalhes: `Novo prazo: ${novoPrazo.toISOString().slice(0,10).split("-").reverse().join("/")}`,
      });
      return { ok: true, novoPrazo: novoPrazo.toISOString() };
    }),

  /**
   * Rev. 2825 — Estender prazo de VÁRIAS reservas de uma vez (seleção múltipla na tela
   * de Reservas Preventivas). Mesmos limites por perfil do `estenderPrazoReserva`
   * (admin_master 60 / diretor 7 / gerente_compras 3). Cada reserva é validada
   * individualmente (existe? company? status 'ativa'?); as que não passam são IGNORADAS
   * (não derrubam o lote) e contabilizadas. Só UPDATE de prazo/log — ZERO ALTER/DROP/DELETE.
   */
  estenderPrazoReservasEmLote: protectedProcedure
    .input(z.object({
      reservaIds: z.array(z.number()).min(1, "Selecione ao menos uma reserva"),
      diasAdicionais: z.number().min(1).max(60),
      motivo: z.string().min(3, "Justificativa obrigatória"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const role: string | undefined = (ctx?.user as any)?.role;
      const limites: Record<string, number> = {
        admin_master: 60,
        diretor: 7,
        gerente_compras: 3,
      };
      const limite = limites[role ?? ""];
      if (!limite) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin_master, diretor ou gerente_compras podem estender prazos." });
      }
      if (input.diasAdicionais > limite) {
        throw new TRPCError({ code: "FORBIDDEN", message: `Seu perfil pode estender no máximo ${limite} dia(s).` });
      }
      const ids = [...new Set(input.reservaIds)];
      const reservas = await db.select().from(comprasReservasSaldo).where(inArray(comprasReservasSaldo.id, ids));
      let estendidas = 0;
      let ignoradas = 0;
      for (const r of reservas) {
        // Tenancy: só estende reservas de empresas que o chamador acessa; senão ignora.
        try { await _assertCompanyAccess(ctx.user, r.companyId); } catch { ignoradas++; continue; }
        if (r.status !== "ativa") { ignoradas++; continue; }
        const novoPrazo = new Date(r.prazoLimite);
        novoPrazo.setDate(novoPrazo.getDate() + input.diasAdicionais);
        await db.update(comprasReservasSaldo).set({
          prazoLimite: novoPrazo.toISOString(),
          atualizadoEm: new Date().toISOString(),
        } as any).where(eq(comprasReservasSaldo.id, r.id));
        await _registrarLogReserva({
          reservaId: r.id, acao: "estendida", companyId: r.companyId,
          executadoPorId: ctx.user?.id, executadoPorNome: ctx.user?.name ?? ctx.user?.email,
          prazoAdicionalDias: input.diasAdicionais, motivo: input.motivo,
          detalhes: `Extensão em lote — novo prazo: ${novoPrazo.toISOString().slice(0,10).split("-").reverse().join("/")}`,
        });
        estendidas++;
      }
      // IDs pedidos que nem existem mais (já liberados/consumidos) também contam como ignorados.
      ignoradas += ids.length - reservas.length;
      return { ok: true, estendidas, ignoradas };
    }),

  /** Override em lote — admin_master libera todas reservas pendentes de um usuário. */
  estenderPrazoUsuario: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      responsavelId: z.number(),
      diasAdicionais: z.number().min(1).max(60),
      motivo: z.string().min(3),
    }))
    .mutation(async ({ input, ctx }) => {
      if ((ctx?.user as any)?.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin_master pode usar override em lote." });
      }
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const reservas = await db.select().from(comprasReservasSaldo).where(and(
        eq(comprasReservasSaldo.companyId, input.companyId),
        eq(comprasReservasSaldo.responsavelOriginalId, input.responsavelId),
        eq(comprasReservasSaldo.status, "ativa"),
      ));
      let total = 0;
      for (const r of reservas) {
        const novoPrazo = new Date(r.prazoLimite);
        novoPrazo.setDate(novoPrazo.getDate() + input.diasAdicionais);
        await db.update(comprasReservasSaldo).set({
          prazoLimite: novoPrazo.toISOString(),
          atualizadoEm: new Date().toISOString(),
        } as any).where(eq(comprasReservasSaldo.id, r.id));
        await _registrarLogReserva({
          reservaId: r.id, acao: "override_master", companyId: input.companyId,
          executadoPorId: ctx.user?.id, executadoPorNome: ctx.user?.name ?? ctx.user?.email,
          prazoAdicionalDias: input.diasAdicionais, motivo: input.motivo,
          detalhes: `Override em lote para usuário #${input.responsavelId}`,
        });
        total++;
      }
      return { ok: true, reservasEstendidas: total };
    }),

  transferirResponsavelReserva: protectedProcedure
    .input(z.object({
      reservaId: z.number(),
      novoResponsavelId: z.number(),
      novoResponsavelNome: z.string().min(1),
      motivo: z.string().min(3),
    }))
    .mutation(async ({ input, ctx }) => {
      const role: string | undefined = (ctx?.user as any)?.role;
      if (!["admin_master", "diretor", "gerente_compras"].includes(role ?? "")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para transferir reservas." });
      }
      const db = await getDb();
      const [r] = await db.select().from(comprasReservasSaldo).where(eq(comprasReservasSaldo.id, input.reservaId));
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Reserva não encontrada." });
      await _assertCompanyAccess(ctx.user, r.companyId);
      const antigo = r.responsavelOriginalNome ?? `#${r.responsavelOriginalId}`;
      await db.update(comprasReservasSaldo).set({
        responsavelOriginalId: input.novoResponsavelId,
        responsavelOriginalNome: input.novoResponsavelNome,
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasReservasSaldo.id, input.reservaId));
      await _registrarLogReserva({
        reservaId: input.reservaId, acao: "transferida", companyId: r.companyId,
        executadoPorId: ctx.user?.id, executadoPorNome: ctx.user?.name ?? ctx.user?.email,
        motivo: input.motivo,
        detalhes: `De: ${antigo} → Para: ${input.novoResponsavelNome}`,
      });
      return { ok: true };
    }),

  /** Marca uma SC como Emergência — sempre liberada mesmo com travamento. Requer dupla aprovação posterior. */
  criarSCEmergencia: protectedProcedure
    .input(z.object({
      solicitacaoId: z.number(),
      companyId: z.number(),
      justificativa: z.string().min(10, "Justificativa de emergência obrigatória (mín. 10 caracteres)"),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [sc] = await db.select().from(comprasSolicitacoes).where(and(
        eq(comprasSolicitacoes.id, input.solicitacaoId),
        eq(comprasSolicitacoes.companyId, input.companyId),
      ));
      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "SC não encontrada." });
      await db.update(comprasSolicitacoes).set({
        prioridade: "urgente",
        observacoes: `[EMERGÊNCIA — Rev.1386] ${input.justificativa}\n\n${sc.observacoes ?? ""}`.trim(),
        atualizadoEm: new Date().toISOString(),
      } as any).where(eq(comprasSolicitacoes.id, input.solicitacaoId));
      // Log auditável (reservaId=0 para rastreabilidade global, companyId preservado).
      await _registrarLogReserva({
        reservaId: 0, acao: "sc_emergencia", companyId: input.companyId,
        executadoPorId: ctx.user?.id, executadoPorNome: ctx.user?.name ?? ctx.user?.email,
        motivo: input.justificativa,
        detalhes: `SC #${input.solicitacaoId} marcada como Emergência (dupla aprovação posterior)`,
      });
      return { ok: true };
    }),

  listarLogsReserva: protectedProcedure
    .input(z.object({ reservaId: z.number().optional(), companyId: z.number(), limite: z.number().min(1).max(200).default(50) }))
    .query(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // Filtro multi-tenant rigoroso por companyId; opcionalmente por reservaId.
      const conds: any[] = [eq(comprasReservasLog.companyId, input.companyId)];
      if (input.reservaId) conds.push(eq(comprasReservasLog.reservaId, input.reservaId));
      const rows = await db.select().from(comprasReservasLog)
        .where(and(...conds))
        .orderBy(desc(comprasReservasLog.criadoEm))
        .limit(input.limite);
      return rows;
    }),

  // ══════════════════════════════════════════════════════════════
  // Rev. 2388 — AUDITORIA DO ALMOXARIFADO (controle rígido)
  // Rev. 2429 — Aprovadores delegados por obra (engenheiro responsável
  //   + delegados que ele indicar). admin_master sempre OK; admin
  //   continua OK (compat). Auditoria SEM obraId (excluir_unidade)
  //   segue só admin. Helper: `_obraIdsQuePossoValidar`.
  // ══════════════════════════════════════════════════════════════

  // Rev. 2429.1 — Helper interno: carrega a obra, valida que o user tem acesso
  // (companyId via _assertCompanyAccess + obras permitidas), retorna a obra.
  // Usado pra amarrar obraId↔companyId em todos os endpoints de responsáveis
  // (fecha IDOR onde caller podia passar companyId A com obraId de B).
  // Não exporta — só usado dentro deste router.

  // Retorna a lista de aprovadores de uma obra (principal + delegados).
  // Qualquer user com acesso à obra pode ver — não é dado sensível, e a tela
  // de Obras mostra esse atalho dentro do form de edição.
  responsaveisAuditoriaListar: protectedProcedure
    .input(z.object({ obraId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 2429.1 — Carrega a obra pra extrair companyId e validar acesso à empresa.
      const { obras } = await import("../../drizzle/schema");
      const [obra] = await db.select({ id: obras.id, companyId: obras.companyId })
        .from(obras).where(eq(obras.id, input.obraId));
      if (!obra) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada." });
      await _assertCompanyAccess(ctx.user, obra.companyId);
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null && !allowed.includes(input.obraId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta obra." });
      }
      return await db.select().from(obraResponsaveisEstoque)
        .where(eq(obraResponsaveisEstoque.obraId, input.obraId))
        .orderBy(asc(obraResponsaveisEstoque.tipo), asc(obraResponsaveisEstoque.userNome));
    }),

  responsaveisAuditoriaAdicionar: protectedProcedure
    .input(z.object({
      obraId: z.number().int().positive(),
      userId: z.number().int().positive(),
      tipo: z.enum(["principal", "delegado"]).default("delegado"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 2429.1 — companyId DERIVADO da obra (não vem do client). Fecha IDOR
      // onde caller podia gravar vínculo cross-company (companyId A, obraId B).
      const { obras, users, userCompanies: uc } = await import("../../drizzle/schema");
      const [obra] = await db.select({ id: obras.id, companyId: obras.companyId })
        .from(obras).where(eq(obras.id, input.obraId));
      if (!obra) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada." });
      await _assertCompanyAccess(ctx.user, obra.companyId);

      const isAdmin = ["admin", "admin_master"].includes(ctx.user.role);
      if (!isAdmin) {
        const [principal] = await db.select({ id: obraResponsaveisEstoque.id })
          .from(obraResponsaveisEstoque)
          .where(and(
            eq(obraResponsaveisEstoque.obraId, input.obraId),
            eq(obraResponsaveisEstoque.userId, ctx.user.id),
            eq(obraResponsaveisEstoque.tipo, "principal"),
          ));
        if (!principal) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin ou o aprovador principal da obra pode gerenciar delegados." });
        }
      }

      // Rev. 2429.1 — Valida que o user candidato pertence à mesma empresa da obra
      // (evita adicionar user de outra empresa como aprovador).
      const [u] = await db.select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(uc, eq(uc.userId, users.id))
        .where(and(eq(users.id, input.userId), eq(uc.companyId, obra.companyId)));
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado ou não pertence à empresa desta obra." });

      // Bloqueia duplicata (idempotente).
      const [existe] = await db.select({ id: obraResponsaveisEstoque.id })
        .from(obraResponsaveisEstoque)
        .where(and(
          eq(obraResponsaveisEstoque.obraId, input.obraId),
          eq(obraResponsaveisEstoque.userId, input.userId),
        ));
      if (existe) return { success: true, id: existe.id, duplicado: true };

      // Rev. 2429.1 — Promoção a principal em TRANSAÇÃO + retry em race condition.
      // O unique index parcial `uniq_resp_estoque_principal` garante 1 só
      // principal por obra; transação garante rebaixar+inserir atômico.
      const novoId = await db.transaction(async (tx) => {
        if (input.tipo === "principal") {
          await tx.update(obraResponsaveisEstoque)
            .set({ tipo: "delegado" })
            .where(and(
              eq(obraResponsaveisEstoque.obraId, input.obraId),
              eq(obraResponsaveisEstoque.tipo, "principal"),
            ));
        }
        const [novo] = await tx.insert(obraResponsaveisEstoque).values({
          companyId: obra.companyId,
          obraId: input.obraId,
          userId: input.userId,
          userNome: u.name || u.email || `User#${input.userId}`,
          tipo: input.tipo,
          criadoPorId: ctx.user.id,
          criadoPorNome: ctx.user.name || null,
        }).returning({ id: obraResponsaveisEstoque.id });
        return novo.id;
      });
      return { success: true, id: novoId, duplicado: false };
    }),

  responsaveisAuditoriaRemover: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [reg] = await db.select().from(obraResponsaveisEstoque)
        .where(eq(obraResponsaveisEstoque.id, input.id));
      if (!reg) throw new TRPCError({ code: "NOT_FOUND" });
      await _assertCompanyAccess(ctx.user, reg.companyId);
      const isAdmin = ["admin", "admin_master"].includes(ctx.user.role);
      if (!isAdmin) {
        // Só o principal da obra OU o próprio user (auto-remoção) pode tirar.
        const [souPrincipal] = await db.select({ id: obraResponsaveisEstoque.id })
          .from(obraResponsaveisEstoque)
          .where(and(
            eq(obraResponsaveisEstoque.obraId, reg.obraId),
            eq(obraResponsaveisEstoque.userId, ctx.user.id),
            eq(obraResponsaveisEstoque.tipo, "principal"),
          ));
        const souEu = reg.userId === ctx.user.id;
        if (!souPrincipal && !souEu) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin, o aprovador principal ou você mesmo pode remover este vínculo." });
        }
      }
      await db.delete(obraResponsaveisEstoque).where(eq(obraResponsaveisEstoque.id, input.id));
      return { success: true };
    }),

  // Pra UI listar candidatos: users da empresa que ainda não são aprovadores
  // daquela obra. Usado no autocomplete da tela "Gerenciar aprovadores".
  // Rev. 2429.1 — companyId DERIVADO da obra (não vem do client).
  responsaveisAuditoriaCandidatos: protectedProcedure
    .input(z.object({ obraId: z.number().int().positive(), busca: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { obras, users, userCompanies } = await import("../../drizzle/schema");
      const [obra] = await db.select({ id: obras.id, companyId: obras.companyId })
        .from(obras).where(eq(obras.id, input.obraId));
      if (!obra) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada." });
      await _assertCompanyAccess(ctx.user, obra.companyId);
      const jaSao = await db.select({ userId: obraResponsaveisEstoque.userId })
        .from(obraResponsaveisEstoque)
        .where(eq(obraResponsaveisEstoque.obraId, input.obraId));
      const jaSaoIds = jaSao.map(r => r.userId);
      const conds: any[] = [
        eq(userCompanies.companyId, obra.companyId),
        isNull(users.deletedAt),
      ];
      if (input.busca && input.busca.trim()) {
        const q = `%${input.busca.trim()}%`;
        conds.push(or(ilike(users.name, q), ilike(users.email, q), ilike(users.username, q)));
      }
      if (jaSaoIds.length > 0) {
        conds.push(sql`${users.id} NOT IN (${sql.join(jaSaoIds.map(i => sql`${i}`), sql`, `)})`);
      }
      const rows = await db.select({
        id: users.id, name: users.name, email: users.email, role: users.role,
      })
        .from(users)
        .innerJoin(userCompanies, eq(userCompanies.userId, users.id))
        .where(and(...conds))
        .orderBy(asc(users.name))
        .limit(50);
      return rows;
    }),

  auditoriaListar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: z.enum(["pendente", "validado", "rejeitado", "todos"]).optional(),
      limite: z.number().int().min(1).max(500).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      const conds: any[] = [eq(almoxarifadoAuditoria.companyId, input.companyId)];
      if (input.status && input.status !== "todos") conds.push(eq(almoxarifadoAuditoria.statusValidacao, input.status));
      if (allowed !== null) {
        // Restringe pra obras permitidas + entradas sem obra (excluir_unidade).
        conds.push(or(isNull(almoxarifadoAuditoria.obraId), inArray(almoxarifadoAuditoria.obraId, allowed)));
      }
      return await db.select().from(almoxarifadoAuditoria)
        .where(and(...conds))
        .orderBy(desc(almoxarifadoAuditoria.createdAt))
        .limit(input.limite ?? 200);
    }),

  auditoriaPendenciasCount: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { count: 0 };
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) return { count: 0 };
      // Rev. 2429 — Validador = admin/admin_master OU aprovador delegado de alguma obra.
      const isAdmin = ["admin", "admin_master"].includes(ctx.user.role);
      const minhasObrasComoAprovador = await db.select({ obraId: obraResponsaveisEstoque.obraId })
        .from(obraResponsaveisEstoque)
        .where(and(
          eq(obraResponsaveisEstoque.companyId, input.companyId),
          eq(obraResponsaveisEstoque.userId, ctx.user.id),
        ));
      const obrasAprovador = minhasObrasComoAprovador.map(r => r.obraId);
      if (!isAdmin && obrasAprovador.length === 0) return { count: 0 };

      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      const conds: any[] = [
        eq(almoxarifadoAuditoria.companyId, input.companyId),
        eq(almoxarifadoAuditoria.statusValidacao, "pendente"),
      ];
      if (isAdmin) {
        // Admin: pendências de obras permitidas + sem obra.
        if (allowed !== null) {
          conds.push(or(isNull(almoxarifadoAuditoria.obraId), inArray(almoxarifadoAuditoria.obraId, allowed)));
        }
      } else {
        // Não-admin: SÓ obras onde é aprovador delegado (auditoria sem obra é só admin).
        conds.push(inArray(almoxarifadoAuditoria.obraId, obrasAprovador));
      }
      const rows = await db.select({ id: almoxarifadoAuditoria.id }).from(almoxarifadoAuditoria).where(and(...conds));
      return { count: rows.length };
    }),

  // Rev. 2400 — Toggle global do controle de auditoria do Almoxarifado.
  // GET é público dentro da empresa (necessário pro frontend exibir/omitir
  // campos do modal). SET exige admin/admin_master.
  getAuditoriaConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await getAlmoxAuditoriaConfig(input.companyId);
    }),

  setAuditoriaConfig: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      exigeSenha: z.boolean(),
      exigeJustificativa: z.boolean(),
      // Rev. 2462 — toggle independente: dispensa aprovação do gestor.
      exigeAprovacao: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!["admin", "admin_master"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem alterar este controle." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { companies } = await import("../../drizzle/schema");
      const patch: Record<string, any> = {
        almoxarifadoExigeSenha: input.exigeSenha ? 1 : 0,
        almoxarifadoExigeJustificativa: input.exigeJustificativa ? 1 : 0,
        updatedAt: new Date().toISOString(),
      };
      if (typeof input.exigeAprovacao === "boolean") {
        patch.almoxarifadoExigeAprovacao = input.exigeAprovacao ? 1 : 0;
      }
      await db.update(companies).set(patch).where(eq(companies.id, input.companyId));
      return { success: true };
    }),

  auditoriaValidar: protectedProcedure
    .input(z.object({
      id: z.number(),
      aprovar: z.boolean(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [reg] = await db.select().from(almoxarifadoAuditoria).where(eq(almoxarifadoAuditoria.id, input.id));
      if (!reg) throw new TRPCError({ code: "NOT_FOUND" });
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!(allowedCompanies as any[]).map(c => c.id).includes(reg.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Rev. 2429 — Validador = admin/admin_master OU aprovador delegado da obra
      // da auditoria. Auditoria SEM obraId (excluir_unidade/global) segue só admin.
      const isAdmin = ["admin", "admin_master"].includes(ctx.user.role);
      if (!isAdmin) {
        if (reg.obraId == null) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Esta auditoria não está vinculada a nenhuma obra — apenas administradores podem validar." });
        }
        const [souAprovador] = await db.select({ id: obraResponsaveisEstoque.id })
          .from(obraResponsaveisEstoque)
          .where(and(
            eq(obraResponsaveisEstoque.obraId, reg.obraId),
            eq(obraResponsaveisEstoque.userId, ctx.user.id),
          ));
        if (!souAprovador) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não é aprovador desta obra. Solicite ao engenheiro responsável que adicione você como delegado." });
        }
      }
      if (reg.statusValidacao !== "pendente") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este registro já foi validado." });
      }
      await db.update(almoxarifadoAuditoria).set({
        statusValidacao: input.aprovar ? "validado" : "rejeitado",
        validadoPorId: ctx.user.id,
        validadoPorNome: ctx.user.name || null,
        validadoEm: new Date().toISOString(),
        observacaoValidacao: input.observacao || null,
      }).where(eq(almoxarifadoAuditoria.id, input.id));
      return { success: true };
    }),

  // ════════════════════════════════════════════════════════════════════
  // Rev. 2485 — REPARAR DUPLICATAS DE NUMERAÇÃO DE OC
  // ════════════════════════════════════════════════════════════════════
  // Follow-up da Rev. 2483: o fix daquela rev impede a CRIAÇÃO de novas
  // duplicatas (gerador único + bootstrap por MAX(seq)), mas as OCs antigas
  // que já existiam com o bug (ex: OC-2026-218 coexistindo com OC-2026-0218)
  // continuam no banco. Este endpoint detecta e renumera UMA das duplicatas
  // de cada par/grupo (mantém a MAIS ANTIGA — id menor — e renumera as
  // demais pra próxima sequência disponível).
  //
  // Estratégia:
  //  - Lock advisory (mesmo escopo 1001 do gerador) evita corrida com
  //    criação concorrente de OC.
  //  - Agrupa por (year, seq_int) parseado do `numero_oc`. Mantém o
  //    `id` mínimo (criada primeiro = paperwork mais antigo) e gera novo
  //    número pra cada duplicata adicional, sempre 4 dígitos.
  //  - `dryRun=true` (default): só retorna o preview do que SERIA feito.
  //  - `dryRun=false`: executa UPDATEs + sincroniza `ocNumberConfig.proximoNumero`
  //    pro MAX+1 do ano corrente.
  //  - Tudo em uma transação — falha total ou success total.
  repararDuplicatasNumeroOC: adminProcedure
    .input(z.object({
      companyId: z.number(),
      dryRun:    z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      await _assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.companyId}::int, 1001::int)`);

        // 1) Detecta duplicatas (escape \\d obrigatório — vide Rev. 2483).
        const dupRowsRaw = await tx.execute(sql`
          WITH parsed AS (
            SELECT id, numero_oc, status, fornecedor_id, obra_id,
                   SUBSTRING(numero_oc FROM '^OC-(\\d{4})-') AS yr,
                   CAST(SUBSTRING(numero_oc FROM '^OC-\\d{4}-(\\d+)$') AS INTEGER) AS seq_int
            FROM compras_ordens
            WHERE company_id = ${input.companyId}
              AND numero_oc ~ '^OC-\\d{4}-\\d+$'
          )
          SELECT yr, seq_int,
                 array_agg(id ORDER BY id) AS ids,
                 array_agg(numero_oc ORDER BY id) AS nums,
                 array_agg(status ORDER BY id) AS sts
          FROM parsed
          GROUP BY yr, seq_int
          HAVING COUNT(*) > 1
          ORDER BY yr, seq_int
        `);
        const dups = ((dupRowsRaw as any).rows || dupRowsRaw || []) as Array<{
          yr: string; seq_int: number; ids: number[]; nums: string[]; sts: string[];
        }>;

        if (dups.length === 0) {
          return { encontradas: 0, renumeradas: [], novoProximo: null, dryRun: input.dryRun };
        }

        // 2) MAX(seq) por ano — usado pra alocar próximas vagas.
        const maxRowsRaw = await tx.execute(sql`
          SELECT SUBSTRING(numero_oc FROM '^OC-(\\d{4})-') AS yr,
                 MAX(CAST(SUBSTRING(numero_oc FROM '^OC-\\d{4}-(\\d+)$') AS INTEGER)) AS m
          FROM compras_ordens
          WHERE company_id = ${input.companyId}
            AND numero_oc ~ '^OC-\\d{4}-\\d+$'
          GROUP BY SUBSTRING(numero_oc FROM '^OC-(\\d{4})-')
        `);
        const maxRows = ((maxRowsRaw as any).rows || maxRowsRaw || []) as Array<{ yr: string; m: number }>;
        const maxByYear = new Map<string, number>();
        maxRows.forEach(r => maxByYear.set(String(r.yr), parseInt(String(r.m)) || 0));

        const DIGITOS = 4;
        const renumeradas: Array<{ id: number; deNumero: string; paraNumero: string; status: string }> = [];

        for (const grp of dups) {
          const yr = String(grp.yr);
          for (let i = 1; i < grp.ids.length; i++) {
            const novoSeq = (maxByYear.get(yr) || 0) + 1;
            maxByYear.set(yr, novoSeq);
            const novoNum = `OC-${yr}-${String(novoSeq).padStart(DIGITOS, "0")}`;
            renumeradas.push({
              id: grp.ids[i],
              deNumero: grp.nums[i],
              paraNumero: novoNum,
              status: grp.sts[i],
            });
            if (!input.dryRun) {
              await tx.execute(sql`UPDATE compras_ordens SET numero_oc = ${novoNum} WHERE id = ${grp.ids[i]}`);
            }
          }
        }

        // 3) Sincroniza contador do ano corrente (defensivo — gerador já
        //    faz bootstrap por MAX, mas alinha imediatamente o ocNumberConfig).
        const currentYear = String(new Date().getFullYear());
        const novoProximo = (maxByYear.get(currentYear) || 0) + 1;
        if (!input.dryRun) {
          const [config] = await tx.select().from(ocNumberConfig).where(eq(ocNumberConfig.companyId, input.companyId)).limit(1);
          if (config) {
            const alvo = Math.max(novoProximo, config.proximoNumero || 1);
            await tx.update(ocNumberConfig)
              .set({ proximoNumero: alvo, updatedAt: new Date().toISOString() } as any)
              .where(eq(ocNumberConfig.companyId, input.companyId));
          } else {
            await tx.insert(ocNumberConfig).values({ companyId: input.companyId, proximoNumero: novoProximo, prefixo: "OC" } as any);
          }
        }

        return {
          encontradas: dups.length,
          renumeradas,
          novoProximo,
          dryRun: input.dryRun,
        };
      });
    }),
});
