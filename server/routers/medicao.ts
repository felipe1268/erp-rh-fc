import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import {
  medicaoContratos,
  medicaoBoletins,
  medicaoBoletimItens,
  medicaoFdRegistros,
  medicaoCampo,
  medicaoCampoPdfs,
  medicaoCampoContornos,
  medicaoLevantamentoServicos,
  medicaoServicosCatalogo,
  medicaoCampoFotos,
  terceiroContratos,
  terceiroContratoItens,
  terceiroMedicoes,
  planejamentoProjetos,
  planejamentoAtividades,
  planejamentoAvancos,
  planejamentoMedicaoConfig,
  orcamentoItens,
  orcamentos,
  obras,
  obraPavimentos,
  comprasOrdens,
  users,
  integrasignEnvelopes,
  integrasignSignatarios,
} from "../../drizzle/schema";
import { eq, and, isNull, desc, sql, inArray } from "drizzle-orm";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";
import { consolidarContornos } from "../../shared/levantamentoConsolidado";
import { unidadesCompativeis } from "../../shared/unidadeCompat";
import { aplicarLevantamentoNaMedicaoTerceiro } from "../terceiroLevantamentoSync";

// Rev. 4792 — guard de UNIDADE no vínculo contorno → item da planilha.
// Retorna mensagem de erro se as unidades divergem; null se ok/sem info.
async function checarUnidadeVinculo(db: any, campoId: number, orcamentoItemId: number | null | undefined, unidadeContorno: string | null | undefined): Promise<string | null> {
  if (!orcamentoItemId || !unidadeContorno) return null;
  const [campo] = await db.select({ origem: medicaoCampo.origem }).from(medicaoCampo).where(eq(medicaoCampo.id, campoId)).limit(1);
  let unidadeItem: string | null = null;
  if ((campo as any)?.origem === "terceiro") {
    const [it] = await db.select({ unidade: terceiroContratoItens.unidade }).from(terceiroContratoItens).where(eq(terceiroContratoItens.id, orcamentoItemId)).limit(1);
    unidadeItem = (it as any)?.unidade ?? null;
  } else {
    const [it] = await db.select({ unidade: orcamentoItens.unidade }).from(orcamentoItens).where(eq(orcamentoItens.id, orcamentoItemId)).limit(1);
    unidadeItem = (it as any)?.unidade ?? null;
  }
  if (!unidadesCompativeis(unidadeContorno, unidadeItem)) {
    return `Unidade errada: o trecho está em "${unidadeContorno}" e o item da planilha em "${unidadeItem}". Verifique antes de vincular.`;
  }
  return null;
}

// Guard PERMISSIVO de empresa (mesmo padrão de medicaoConfig/aiConfig/compras):
// admin libera; usuário SEM vínculo libera; só bloqueia usuário vinculado a
// empresas tentando uma empresa fora dos seus vínculos (anti-IDOR de leitura).
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

// Rev. 3093 — Biblioteca de plantas POR CONTRATO. As plantas (PDFs) + calibração
// deixam de pender de cada medição (medicao_campo) e passam a viver num campo
// dedicado status="biblioteca" por (contrato, origem). Assim o upload é feito 1x e
// TODAS as medições do contrato enxergam a mesma planta (sem reupload). Os contornos
// e fotos seguem por medição (referenciando o pdf.id compartilhado). IDs de contrato
// COLIDEM entre módulos → escopo sempre por origem ('terceiro' vs cliente/legado-NULL).
const origemCampoCond = (origem: "cliente" | "terceiro") =>
  origem === "terceiro"
    ? eq(medicaoCampo.origem, "terceiro")
    : sql`(${medicaoCampo.origem} IS DISTINCT FROM 'terceiro')`;

async function resolverBibliotecaPlantas(
  db: any,
  companyId: number,
  contratoId: number,
  origem: "cliente" | "terceiro",
): Promise<{ id: number }> {
  // Find-or-create da biblioteca. Sem UNIQUE no schema (regra de ouro: nenhum
  // ALTER), a corrida "duas abas criam a biblioteca ao mesmo tempo" geraria 2
  // bibliotecas — e `getCampo` lê só a de menor id, "sumindo" com PDFs gravados
  // na outra. Serializa via pg_advisory_xact_lock por (company, contrato, origem)
  // dentro de uma transação: o 2º chamador espera, depois encontra a já criada.
  const lockKey2 = contratoId * 2 + (origem === "terceiro" ? 1 : 0);
  return await db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${companyId}::int, ${lockKey2}::int)`);
    const [lib] = await tx
      .select({ id: medicaoCampo.id })
      .from(medicaoCampo)
      .where(and(
        eq(medicaoCampo.companyId, companyId),
        eq(medicaoCampo.contratoId, contratoId),
        eq(medicaoCampo.status, "biblioteca"),
        origemCampoCond(origem),
        isNull(medicaoCampo.deletedAt),
      ))
      .orderBy(medicaoCampo.id)
      .limit(1);
    if (lib) return lib;
    const [novo] = await tx.insert(medicaoCampo).values({
      companyId,
      contratoId,
      numero: 0,
      titulo: "Plantas do contrato",
      status: "biblioteca",
      origem,
      medicaoId: null,
    }).returning({ id: medicaoCampo.id });
    return novo;
  });
}

// Move plantas soltas (que ainda pendem de campos-medição) para a biblioteca do
// contrato. Idempotente: preserva o pdf.id (contornos seguem referenciando-o) e,
// após a 1ª execução, o WHERE não casa mais nada (no-op). Suporta a auto-cura de
// contratos antigos cujas plantas foram enviadas antes da Rev. 3093.
async function migrarPlantasParaBiblioteca(
  db: any,
  companyId: number,
  contratoId: number,
  origem: "cliente" | "terceiro",
  bibliotecaId: number,
): Promise<void> {
  const camposNaoBiblioteca = db
    .select({ id: medicaoCampo.id })
    .from(medicaoCampo)
    .where(and(
      eq(medicaoCampo.companyId, companyId),
      eq(medicaoCampo.contratoId, contratoId),
      origemCampoCond(origem),
      sql`${medicaoCampo.status} IS DISTINCT FROM 'biblioteca'`,
    ));
  await db.update(medicaoCampoPdfs)
    .set({ medicaoCampoId: bibliotecaId, atualizadoEm: new Date() })
    .where(and(
      eq(medicaoCampoPdfs.companyId, companyId),
      isNull(medicaoCampoPdfs.deletedAt),
      sql`${medicaoCampoPdfs.medicaoCampoId} <> ${bibliotecaId}`,
      inArray(medicaoCampoPdfs.medicaoCampoId, camposNaoBiblioteca),
    ));
}

// Rev. 4823 — extensão do arquivo de mídia do levantamento (foto OU vídeo).
function extMidiaLevantamento(contentType?: string | null): string {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("heic") || ct.includes("heif")) return "heic";
  if (ct.includes("quicktime")) return "mov";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("webm")) return "webm";
  if (ct.startsWith("video/")) return "mp4";
  return "jpg";
}

// Rev. 4797 — Poka-Yoke: levantamento CONSOLIDADO é só-leitura. Nenhum write
// de contorno/foto/serviço passa; para editar é preciso desconsolidar (e a
// medição vinculada não pode estar aprovada/paga).
async function assertCampoNaoConsolidado(db: any, campoId: number, companyId: number) {
  const [campo] = await db
    .select({ consolidadoEm: medicaoCampo.consolidadoEm })
    .from(medicaoCampo)
    .where(and(eq(medicaoCampo.id, campoId), eq(medicaoCampo.companyId, companyId)))
    .limit(1);
  if (campo?.consolidadoEm) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Levantamento consolidado — desconsolide para editar." });
  }
}

// Rev. 4819 — Catálogo GLOBAL de serviços (por EMPRESA): fonte única de
// categorias/subcategorias do levantamento. Seed padrão na 1ª leitura +
// migração dos serviços custom já criados por levantamento (viram globais).
const SEED_SERVICOS = [
  { chave: "alvenaria",  nome: "Alvenaria",  cor: "#dc2626", tipoMedida: "parede",   derivaDe: null,        fator: "1", parentChave: null, ordem: 1 },
  { chave: "chapisco",   nome: "Chapisco",   cor: "#ea580c", tipoMedida: "area",     derivaDe: "alvenaria", fator: "2", parentChave: null, ordem: 2 },
  { chave: "emboco",     nome: "Emboço",     cor: "#ca8a04", tipoMedida: "area",     derivaDe: "alvenaria", fator: "2", parentChave: null, ordem: 3 },
  { chave: "reboco",     nome: "Reboco",     cor: "#059669", tipoMedida: "area",     derivaDe: "alvenaria", fator: "2", parentChave: null, ordem: 4 },
  { chave: "contrapiso", nome: "Contrapiso", cor: "#2563eb", tipoMedida: "area",     derivaDe: null,        fator: "1", parentChave: null, ordem: 5 },
  { chave: "forro",      nome: "Forro",      cor: "#7c3aed", tipoMedida: "area",     derivaDe: null,        fator: "1", parentChave: null, ordem: 6 },
  { chave: "pintura",        nome: "Pintura",        cor: "#db2777", tipoMedida: "area",   derivaDe: null, fator: "1", parentChave: null,      ordem: 7 },
  { chave: "pintura_teto",   nome: "Pintura Teto",   cor: "#db2777", tipoMedida: "area",   derivaDe: null, fator: "1", parentChave: "pintura", ordem: 7 },
  { chave: "pintura_parede", nome: "Pintura Parede", cor: "#be185d", tipoMedida: "parede", derivaDe: null, fator: "1", parentChave: "pintura", ordem: 8 },
  { chave: "pintura_piso",   nome: "Pintura Piso",   cor: "#9d174d", tipoMedida: "area",   derivaDe: null, fator: "1", parentChave: "pintura", ordem: 9 },
  { chave: "pontos",     nome: "Contagem",   cor: "#0891b2", tipoMedida: "contagem", derivaDe: null,        fator: "1", parentChave: null, ordem: 10 },
];

// Deriva a chave da mãe pela CONVENÇÃO antiga (prefixo de chave ou de nome) —
// usada só na migração de serviços pré-catálogo.
function inferirParentChave(s: any, todos: any[]): string | null {
  if (s.parentChave) return s.parentChave;
  for (const pai of todos) {
    if (pai.chave === s.chave || pai.derivaDe) continue;
    if (String(s.chave).startsWith(`${pai.chave}_`) || String(s.nome).startsWith(`${pai.nome} `)) return pai.chave;
  }
  return null;
}

async function ensureCatalogoServicos(db: any, companyId: number) {
  let rows = await db.select().from(medicaoServicosCatalogo)
    .where(eq(medicaoServicosCatalogo.companyId, companyId));
  if (rows.length === 0) {
    await db.transaction(async (tx: any) => {
      // lock por EMPRESA (478007): duas aberturas simultâneas não duplicam o seed
      await tx.execute(sql`SELECT pg_advisory_xact_lock(478007, ${companyId})`);
      const [ja] = await tx.select({ id: medicaoServicosCatalogo.id }).from(medicaoServicosCatalogo)
        .where(eq(medicaoServicosCatalogo.companyId, companyId)).limit(1);
      if (ja) return;
      // 1) padrão de fábrica
      const valores: any[] = SEED_SERVICOS.map((s) => ({ companyId, ...s, ativo: 1 }));
      // 2) migração: serviços custom já criados em QUALQUER levantamento viram globais
      const existentes = await tx.execute(sql`
        SELECT DISTINCT ON (chave) chave, nome, cor, tipo_medida, deriva_de, fator, ordem
        FROM medicao_levantamento_servicos
        WHERE company_id = ${companyId}
        ORDER BY chave, id DESC
      `);
      const jaTem = new Set(valores.map((v) => v.chave));
      const customs = ((existentes as any).rows ?? existentes ?? []).filter((r: any) => !jaTem.has(r.chave));
      for (const r of customs) {
        valores.push({
          companyId, chave: r.chave, nome: r.nome, cor: r.cor,
          tipoMedida: r.tipo_medida ?? "area", derivaDe: r.deriva_de ?? null,
          fator: r.fator != null ? String(r.fator) : "1", parentChave: null,
          ordem: r.ordem ?? 99, ativo: 1,
        });
      }
      // parent das customs pela convenção antiga (prefixo)
      for (const v of valores) if (!v.parentChave) v.parentChave = inferirParentChave(v, valores);
      await tx.insert(medicaoServicosCatalogo).values(valores);
    });
    rows = await db.select().from(medicaoServicosCatalogo)
      .where(eq(medicaoServicosCatalogo.companyId, companyId));
  }
  return rows;
}

// Rev. 4797 — planta (PDF) com contornos de um levantamento CONSOLIDADO também
// é intocável: excluir a planta apaga contornos; recalibrar muda quantitativos.
// Rev. 4808 — "medição anterior" de verdade = levantamento cuja medição
// vinculada (via terceiro_medicoes.levantamento_campo_id OU campo.medicao_id)
// está APROVADA ou PAGA. Rascunho/abandonado/consolidado-sem-medição não conta.
async function filtrarCamposComMedicaoFechada(db: any, ids: number[], companyId: number): Promise<number[]> {
  if (ids.length === 0) return ids;
  const campos = await db
    .select({ id: medicaoCampo.id, medicaoId: medicaoCampo.medicaoId })
    .from(medicaoCampo)
    .where(and(inArray(medicaoCampo.id, ids), eq(medicaoCampo.companyId, companyId)));
  const medIds = campos.map((c: any) => c.medicaoId).filter((x: any) => x != null);
  const meds = await db
    .select({ id: terceiroMedicoes.id, levCampoId: terceiroMedicoes.levantamentoCampoId, status: terceiroMedicoes.status })
    .from(terceiroMedicoes)
    .where(and(
      eq(terceiroMedicoes.companyId, companyId),
      medIds.length > 0
        ? sql`(${inArray(terceiroMedicoes.levantamentoCampoId, ids)} OR ${inArray(terceiroMedicoes.id, medIds)})`
        : inArray(terceiroMedicoes.levantamentoCampoId, ids),
    ));
  const fechadas = meds.filter((m: any) => ["aprovada", "paga"].includes(m.status || ""));
  const okIds = new Set<number>();
  for (const m of fechadas) {
    if (m.levCampoId != null) okIds.add(m.levCampoId);
    for (const c of campos) if ((c as any).medicaoId === m.id) okIds.add((c as any).id);
  }
  return ids.filter((id) => okIds.has(id));
}

async function assertPdfSemCampoConsolidado(db: any, pdfId: number, companyId: number) {
  const rows = await db
    .select({ campoId: medicaoCampoContornos.medicaoCampoId })
    .from(medicaoCampoContornos)
    .innerJoin(medicaoCampo, eq(medicaoCampo.id, medicaoCampoContornos.medicaoCampoId))
    .where(and(
      eq(medicaoCampoContornos.pdfId, pdfId),
      eq(medicaoCampoContornos.companyId, companyId),
      isNull(medicaoCampoContornos.deletedAt),
      sql`${medicaoCampo.consolidadoEm} IS NOT NULL`,
    ))
    .limit(1);
  if (rows.length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Esta planta tem levantamento CONSOLIDADO — desconsolide antes de alterar ou excluir a planta." });
  }
}

export const medicaoRouter = router({

  listarContratos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const contratos = await db
        .select({
          id: medicaoContratos.id,
          projetoId: medicaoContratos.projetoId,
          criterio: medicaoContratos.criterio,
          valorTotalContrato: medicaoContratos.valorTotalContrato,
          percentualSinal: medicaoContratos.percentualSinal,
          valorSinalRecebido: medicaoContratos.valorSinalRecebido,
          percentualRetencao: medicaoContratos.percentualRetencao,
          valorMinimoFd: medicaoContratos.valorMinimoFd,
          status: medicaoContratos.status,
          observacoes: medicaoContratos.observacoes,
          criadoEm: medicaoContratos.criadoEm,
          nomeProjeto: planejamentoProjetos.nome,
          cliente: planejamentoProjetos.cliente,
          local: planejamentoProjetos.local,
          obraId: planejamentoProjetos.obraId,
          obraNome: obras.nome,
          orcamentoId: planejamentoProjetos.orcamentoId,
          orcamentoCodigo: orcamentos.codigo,
        })
        .from(medicaoContratos)
        .leftJoin(planejamentoProjetos, eq(medicaoContratos.projetoId, planejamentoProjetos.id))
        .leftJoin(obras, eq(planejamentoProjetos.obraId, obras.id))
        .leftJoin(orcamentos, eq(planejamentoProjetos.orcamentoId, orcamentos.id))
        .where(and(
          eq(medicaoContratos.companyId, input.companyId),
          isNull(medicaoContratos.deletedAt),
        ))
        .orderBy(desc(medicaoContratos.criadoEm));
      return contratos;
    }),

  getContrato: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db
        .select({
          id: medicaoContratos.id,
          companyId: medicaoContratos.companyId,
          projetoId: medicaoContratos.projetoId,
          criterio: medicaoContratos.criterio,
          valorTotalContrato: medicaoContratos.valorTotalContrato,
          percentualSinal: medicaoContratos.percentualSinal,
          valorSinalRecebido: medicaoContratos.valorSinalRecebido,
          percentualRetencao: medicaoContratos.percentualRetencao,
          valorMinimoFd: medicaoContratos.valorMinimoFd,
          status: medicaoContratos.status,
          observacoes: medicaoContratos.observacoes,
          nomeProjeto: planejamentoProjetos.nome,
          cliente: planejamentoProjetos.cliente,
          local: planejamentoProjetos.local,
          orcamentoId: planejamentoProjetos.orcamentoId,
          obraId: planejamentoProjetos.obraId,
        })
        .from(medicaoContratos)
        .leftJoin(planejamentoProjetos, eq(medicaoContratos.projetoId, planejamentoProjetos.id))
        .where(eq(medicaoContratos.id, input.id));
      if (!contrato) return null;
      let tipoContrato = 'global';
      let percentualGerenciamentoMaterial = '0';
      if (contrato.obraId) {
        const obraRows = await db.execute(sql`SELECT tipo_contrato, percentual_gerenciamento_material FROM obras WHERE id = ${contrato.obraId} LIMIT 1`);
        const rows: any[] = (obraRows as any).rows ?? obraRows ?? [];
        if (rows[0]?.tipo_contrato) tipoContrato = rows[0].tipo_contrato;
        if (rows[0]?.percentual_gerenciamento_material) percentualGerenciamentoMaterial = String(rows[0].percentual_gerenciamento_material);
      }
      return { ...contrato, tipoContrato, percentualGerenciamentoMaterial };
    }),

  criarContrato: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      projetoId: z.number(),
      criterio: z.enum(["avanco_fisico", "parcela_fixa"]).default("avanco_fisico"),
      valorTotalContrato: z.string().optional(),
      percentualSinal: z.string().optional(),
      valorSinalRecebido: z.string().optional(),
      percentualRetencao: z.string().nullable().optional(),
      valorMinimoFd: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.insert(medicaoContratos).values({
        companyId: input.companyId,
        projetoId: input.projetoId,
        criterio: input.criterio,
        valorTotalContrato: input.valorTotalContrato,
        percentualSinal: input.percentualSinal,
        valorSinalRecebido: input.valorSinalRecebido,
        percentualRetencao: input.percentualRetencao,
        valorMinimoFd: input.valorMinimoFd,
        observacoes: input.observacoes,
      }).returning();
      return row;
    }),

  atualizarContrato: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      criterio: z.enum(["avanco_fisico", "parcela_fixa"]).optional(),
      valorTotalContrato: z.string().optional(),
      percentualSinal: z.string().optional(),
      valorSinalRecebido: z.string().optional(),
      percentualRetencao: z.string().nullable().optional(),
      valorMinimoFd: z.string().nullable().optional(),
      status: z.enum(["ativo", "encerrado"]).optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(medicaoContratos)
        .set({ ...data, atualizadoEm: new Date() })
        .where(and(
          eq(medicaoContratos.id, id),
          eq(medicaoContratos.companyId, companyId),
        ));
      return { success: true };
    }),

  getProjetoMedicaoConfig: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({
        tipoMedicao: planejamentoMedicaoConfig.tipoMedicao,
        sinalPct: planejamentoMedicaoConfig.sinalPct,
        sinalValor: planejamentoMedicaoConfig.sinalValor,
        retencaoPct: planejamentoMedicaoConfig.retencaoPct,
        entrada: planejamentoMedicaoConfig.entrada,
        diaCorte: planejamentoMedicaoConfig.diaCorte,
        // Rev. 2891 — também expõe o Valor p/ FD configurado no Planejamento (Medição),
        // p/ auto-preencher "Valor Mínimo para FD" no Novo Contrato de Medição.
        fdValor: planejamentoMedicaoConfig.fdValor,
      })
      .from(planejamentoMedicaoConfig)
      .where(eq(planejamentoMedicaoConfig.projetoId, input.projetoId))
      .limit(1);
      return rows[0] || null;
    }),

  excluirContrato: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(medicaoContratos)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(medicaoContratos.id, input.id),
          eq(medicaoContratos.companyId, input.companyId),
        ));
      return { success: true };
    }),

  listarBoletins: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(medicaoBoletins)
        .where(eq(medicaoBoletins.contratoId, input.contratoId))
        .orderBy(desc(medicaoBoletins.numero));
    }),

  getBoletim: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [boletim] = await db
        .select()
        .from(medicaoBoletins)
        .where(eq(medicaoBoletins.id, input.id));
      if (!boletim) return null;
      const itens = await db
        .select()
        .from(medicaoBoletimItens)
        .where(eq(medicaoBoletimItens.boletimId, input.id))
        .orderBy(medicaoBoletimItens.eapCodigo);
      return { ...boletim, itens };
    }),

  criarBoletim: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      periodoReferencia: z.string(),
      dataInicio: z.string().nullable().optional(),
      dataFim: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [ultimo] = await db
        .select({ numero: medicaoBoletins.numero })
        .from(medicaoBoletins)
        .where(eq(medicaoBoletins.contratoId, input.contratoId))
        .orderBy(desc(medicaoBoletins.numero))
        .limit(1);
      const numero = (ultimo?.numero ?? 0) + 1;

      const [row] = await db.insert(medicaoBoletins).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        numero,
        periodoReferencia: input.periodoReferencia,
        dataInicio: input.dataInicio ?? null,
        dataFim: input.dataFim ?? null,
        observacoes: input.observacoes,
      }).returning();
      return row;
    }),

  atualizarBoletim: protectedProcedure
    .input(z.object({
      id: z.number(),
      valorBruto: z.string().optional(),
      descontoSinal: z.string().optional(),
      descontoRetencao: z.string().optional(),
      glosa: z.string().optional(),
      deducaoFd: z.string().optional(),
      valorLiquido: z.string().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db.update(medicaoBoletins)
        .set({ ...data, atualizadoEm: new Date() })
        .where(eq(medicaoBoletins.id, id));
      return { success: true };
    }),

  excluirBoletim: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(medicaoBoletimItens).where(eq(medicaoBoletimItens.boletimId, input.id));
      await db.delete(medicaoBoletins).where(and(eq(medicaoBoletins.id, input.id), eq(medicaoBoletins.companyId, input.companyId)));
      return { success: true };
    }),

  editarBoletim: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      periodoReferencia: z.string().optional(),
      dataInicio: z.string().nullable().optional(),
      dataFim: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(medicaoBoletins)
        .set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(medicaoBoletins.id, id), eq(medicaoBoletins.companyId, companyId)));
      return { success: true };
    }),

  avancarStatusBoletim: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["rascunho", "enviado", "aprovado", "finalizado"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const updates: Record<string, unknown> = {
        status: input.status,
        atualizadoEm: new Date(),
      };
      if (input.status === "enviado") updates.dataEnvio = new Date().toISOString().substring(0, 10);
      if (input.status === "aprovado") updates.dataAprovacao = new Date().toISOString().substring(0, 10);
      await db.update(medicaoBoletins).set(updates).where(eq(medicaoBoletins.id, input.id));
      return { success: true };
    }),

  salvarItensBoletim: protectedProcedure
    .input(z.object({
      boletimId: z.number(),
      itens: z.array(z.object({
        id: z.number().optional(),
        atividadeId: z.number().nullable().optional(),
        eapCodigo: z.string().nullable().optional(),
        descricao: z.string(),
        valorContratual: z.string(),
        percentualAcumuladoAnterior: z.string(),
        percentualPeriodo: z.string(),
        percentualAcumuladoAtual: z.string(),
        valorPeriodo: z.string(),
        tipoAvanco: z.enum(["fisico", "financeiro_material"]).default("fisico"),
        isFd: z.boolean().default(false),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(medicaoBoletimItens).where(eq(medicaoBoletimItens.boletimId, input.boletimId));
      if (input.itens.length > 0) {
        await db.insert(medicaoBoletimItens).values(
          input.itens.map(item => ({
            boletimId: input.boletimId,
            atividadeId: item.atividadeId,
            eapCodigo: item.eapCodigo,
            descricao: item.descricao,
            valorContratual: item.valorContratual,
            percentualAcumuladoAnterior: item.percentualAcumuladoAnterior,
            percentualPeriodo: item.percentualPeriodo,
            percentualAcumuladoAtual: item.percentualAcumuladoAtual,
            valorPeriodo: item.valorPeriodo,
            tipoAvanco: item.tipoAvanco,
            isFd: item.isFd,
          }))
        );
      }
      const totais = await db
        .select({
          valorBruto: sql<string>`COALESCE(SUM(CASE WHEN NOT is_fd THEN valor_periodo ELSE 0 END), 0)`,
          deducaoFd: sql<string>`COALESCE(SUM(CASE WHEN is_fd THEN valor_periodo ELSE 0 END), 0)`,
        })
        .from(medicaoBoletimItens)
        .where(eq(medicaoBoletimItens.boletimId, input.boletimId));

      const [boletim] = await db.select().from(medicaoBoletins).where(eq(medicaoBoletins.id, input.boletimId));
      if (boletim) {
        const valorBruto = parseFloat(totais[0]?.valorBruto ?? "0");
        const deducaoFd = parseFloat(totais[0]?.deducaoFd ?? "0");
        const descontoSinal = parseFloat(boletim.descontoSinal ?? "0");
        const descontoRetencao = parseFloat(boletim.descontoRetencao ?? "0");
        const glosa = parseFloat(boletim.glosa ?? "0");
        const valorLiquido = valorBruto - descontoSinal - descontoRetencao - glosa - deducaoFd;
        await db.update(medicaoBoletins).set({
          valorBruto: valorBruto.toFixed(2),
          deducaoFd: deducaoFd.toFixed(2),
          valorLiquido: valorLiquido.toFixed(2),
          atualizadoEm: new Date(),
        }).where(eq(medicaoBoletins.id, input.boletimId));
      }
      return { success: true };
    }),

  recalcularDeducoes: protectedProcedure
    .input(z.object({
      boletimId: z.number(),
      glosa: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [boletim] = await db.select().from(medicaoBoletins).where(eq(medicaoBoletins.id, input.boletimId));
      if (!boletim) return { success: false };

      const [contrato] = await db.select().from(medicaoContratos).where(eq(medicaoContratos.id, boletim.contratoId));
      if (!contrato) return { success: false };

      const pctSinal = parseFloat(contrato.percentualSinal ?? "0") / 100;
      const pctRetencao = parseFloat(contrato.percentualRetencao ?? "0") / 100;
      const valorBruto = parseFloat(boletim.valorBruto ?? "0");
      const glosa = parseFloat(input.glosa ?? boletim.glosa ?? "0");

      const fdRows = await db.select({ valor: medicaoBoletimItens.valorPeriodo })
        .from(medicaoBoletimItens)
        .where(and(eq(medicaoBoletimItens.boletimId, input.boletimId), eq(medicaoBoletimItens.isFd, true)));
      const deducaoFd = fdRows.reduce((acc, r) => acc + parseFloat(r.valor ?? "0"), 0);

      const descontoSinal = valorBruto * pctSinal;
      const descontoRetencao = valorBruto * pctRetencao;
      const valorLiquido = valorBruto - descontoSinal - descontoRetencao - glosa - deducaoFd;

      await db.update(medicaoBoletins).set({
        descontoSinal: descontoSinal.toFixed(2),
        descontoRetencao: descontoRetencao.toFixed(2),
        glosa: glosa.toFixed(2),
        deducaoFd: deducaoFd.toFixed(2),
        valorLiquido: valorLiquido.toFixed(2),
        atualizadoEm: new Date(),
      }).where(eq(medicaoBoletins.id, input.boletimId));

      return { success: true };
    }),

  listarFdRegistros: protectedProcedure
    .input(z.object({ contratoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(medicaoFdRegistros)
        .where(eq(medicaoFdRegistros.contratoId, input.contratoId))
        .orderBy(desc(medicaoFdRegistros.dataRegistro));
    }),

  criarFdRegistro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      descricao: z.string(),
      valor: z.string(),
      dataRegistro: z.string(),
      origem: z.enum(["bdi", "manual", "compra"]).default("manual"),
      compraId: z.number().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [row] = await db.insert(medicaoFdRegistros).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        descricao: input.descricao,
        valor: input.valor,
        dataRegistro: input.dataRegistro,
        origem: input.origem,
        compraId: input.compraId ?? null,
        observacoes: input.observacoes,
      }).returning();
      return row;
    }),

  // Rev. 4026 — OCs de Faturamento Direto (FD) do Painel de Compras disponíveis para
  // importar direto na Medição (mesmo critério de `compras.getSaldoFdTodasObras`:
  // modalidadeFd IN fd_cliente/fd_terceiro/fd_fc, status != cancelada). Só considera
  // OCs da OBRA vinculada ao projeto do contrato de medição. `jaVinculada` sinaliza
  // OCs que já viraram um `medicao_fd_registros.compraId` (evita duplicar valor).
  listarOcsFdDisponiveis: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ocs = await db.select({
          id: comprasOrdens.id,
          numeroOc: comprasOrdens.numeroOc,
          fornecedorNome: comprasOrdens.fornecedorNome,
          observacoes: comprasOrdens.observacoes,
          fdValor: comprasOrdens.fdValor,
          modalidadeFd: comprasOrdens.modalidadeFd,
          total: comprasOrdens.total,
          criadoEm: comprasOrdens.criadoEm,
        })
        .from(comprasOrdens)
        .where(and(
          eq(comprasOrdens.companyId, input.companyId),
          eq(comprasOrdens.obraId, input.obraId),
          sql`${comprasOrdens.modalidadeFd} IN ('fd_cliente', 'fd_terceiro', 'fd_fc')`,
          sql`${comprasOrdens.status} != 'cancelada'`,
        ))
        .orderBy(desc(comprasOrdens.criadoEm));

      const vinculadas = await db.select({ compraId: medicaoFdRegistros.compraId })
        .from(medicaoFdRegistros)
        .where(sql`${medicaoFdRegistros.compraId} IS NOT NULL`);
      const vinculadasSet = new Set(vinculadas.map(v => v.compraId));

      const n = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
      return ocs.map(oc => {
        const valorEfetivo = n(oc.fdValor) > 0 ? n(oc.fdValor) : n((oc as any).total);
        return {
          id: oc.id,
          numeroOc: oc.numeroOc,
          fornecedorNome: oc.fornecedorNome,
          descricao: oc.observacoes,
          modalidadeFd: oc.modalidadeFd,
          valorEfetivo,
          criadoEm: oc.criadoEm,
          jaVinculada: vinculadasSet.has(oc.id),
        };
      });
    }),

  atualizarFdRegistro: protectedProcedure
    .input(z.object({
      id: z.number(),
      descricao: z.string().optional(),
      valor: z.string().optional(),
      observacoes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...data } = input;
      await db.update(medicaoFdRegistros)
        .set({ ...data, atualizadoEm: new Date() })
        .where(eq(medicaoFdRegistros.id, id));
      return { success: true };
    }),

  excluirFdRegistro: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(medicaoFdRegistros).where(eq(medicaoFdRegistros.id, input.id));
      return { success: true };
    }),

  getAtividadesProjeto: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const atividades = await db
        .select({
          id: planejamentoAtividades.id,
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
          nivel: planejamentoAtividades.nivel,
          isGrupo: planejamentoAtividades.isGrupo,
          pesoFinanceiro: planejamentoAtividades.pesoFinanceiro,
          revisaoId: planejamentoAtividades.revisaoId,
        })
        .from(planejamentoAtividades)
        .where(and(
          eq(planejamentoAtividades.projetoId, input.projetoId),
          ...(input.revisaoId ? [eq(planejamentoAtividades.revisaoId, input.revisaoId)] : []),
        ))
        .orderBy(planejamentoAtividades.ordem);
      return atividades;
    }),

  getAvancoAtividades: protectedProcedure
    .input(z.object({ projetoId: z.number(), revisaoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const result = await db.execute(sql`
        SELECT DISTINCT ON (atividade_id)
          atividade_id,
          percentual_acumulado,
          semana
        FROM planejamento_avancos
        WHERE projeto_id = ${input.projetoId}
          AND revisao_id = ${input.revisaoId}
        ORDER BY atividade_id, semana DESC
      `);
      return result.rows as { atividade_id: number; percentual_acumulado: string; semana: string }[];
    }),

  // Rev. 4027 — rastreabilidade do "Origem: Cronograma" no boletim: mostra o
  // histórico semanal de avanço físico (Planejamento → Avanço Semanal) de UMA
  // atividade, para o usuário saber exatamente de qual semana veio o % usado
  // na medição. companyId é validado via o contrato (evita IDOR).
  getHistoricoAvancoAtividade: protectedProcedure
    .input(z.object({
      atividadeId: z.number(),
      contratoId: z.number(),
      companyId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db
        .select({ id: medicaoContratos.id, projetoId: medicaoContratos.projetoId })
        .from(medicaoContratos)
        .where(and(eq(medicaoContratos.id, input.contratoId), eq(medicaoContratos.companyId, input.companyId)))
        .limit(1);
      if (!contrato) throw new Error("Contrato não encontrado ou sem permissão");

      const [atividade] = await db
        .select({
          id: planejamentoAtividades.id,
          eapCodigo: planejamentoAtividades.eapCodigo,
          nome: planejamentoAtividades.nome,
          projetoId: planejamentoAtividades.projetoId,
          revisaoId: planejamentoAtividades.revisaoId,
        })
        .from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.id, input.atividadeId))
        .limit(1);
      if (!atividade || atividade.projetoId !== contrato.projetoId) {
        throw new Error("Atividade não pertence a este contrato");
      }

      const result = await db.execute(sql`
        SELECT semana, percentual_semanal, percentual_acumulado, observacao
        FROM planejamento_avancos
        WHERE atividade_id = ${input.atividadeId}
          AND revisao_id = ${atividade.revisaoId}
        ORDER BY semana ASC
      `);
      return {
        atividade: { id: atividade.id, eapCodigo: atividade.eapCodigo, nome: atividade.nome },
        semanas: result.rows as { semana: string; percentual_semanal: string; percentual_acumulado: string; observacao: string | null }[],
      };
    }),

  getItensOrcamento: protectedProcedure
    .input(z.object({ orcamentoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select({
          id: orcamentoItens.id,
          eapCodigo: orcamentoItens.eapCodigo,
          descricao: orcamentoItens.descricao,
          nivel: orcamentoItens.nivel,
          tipo: orcamentoItens.tipo,
          unidade: orcamentoItens.unidade,
          quantidade: orcamentoItens.quantidade,
          vendaUnitTotal: orcamentoItens.vendaUnitTotal,
          vendaTotal: orcamentoItens.vendaTotal,
        })
        .from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        .orderBy(orcamentoItens.eapCodigo);
    }),

  getPlanilhaMedicao: protectedProcedure
    .input(z.object({
      contratoId: z.number(),
      orcamentoId: z.number(),
      companyId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [contrato] = await db
        .select({ id: medicaoContratos.id, companyId: medicaoContratos.companyId, valorTotalContrato: medicaoContratos.valorTotalContrato })
        .from(medicaoContratos)
        .where(and(eq(medicaoContratos.id, input.contratoId), eq(medicaoContratos.companyId, input.companyId)))
        .limit(1);

      if (!contrato) throw new Error("Contrato não encontrado ou sem permissão");

      const [orc] = await db
        .select({ totalVenda: orcamentos.totalVenda })
        .from(orcamentos)
        .where(eq(orcamentos.id, input.orcamentoId))
        .limit(1);

      const valorContrato = parseFloat(String(contrato.valorTotalContrato || "0")) || 0;
      const totalVendaOrc = parseFloat(String(orc?.totalVenda || "0")) || 0;

      const itens = await db
        .select({
          id: orcamentoItens.id,
          eapCodigo: orcamentoItens.eapCodigo,
          descricao: orcamentoItens.descricao,
          nivel: orcamentoItens.nivel,
          tipo: orcamentoItens.tipo,
          unidade: orcamentoItens.unidade,
          quantidade: orcamentoItens.quantidade,
          vendaUnitTotal: orcamentoItens.vendaUnitTotal,
          vendaTotal: orcamentoItens.vendaTotal,
          custoTotalMat: orcamentoItens.custoTotalMat,
          custoTotalMdo: orcamentoItens.custoTotalMdo,
          custoTotal: orcamentoItens.custoTotal,
        })
        .from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        .orderBy(orcamentoItens.eapCodigo);

      const medidoResult = await db.execute(sql`
        SELECT
          i.eap_codigo,
          MAX(CAST(i.percentual_acumulado_atual AS NUMERIC)) AS pct_acumulado,
          SUM(CAST(i.valor_periodo AS NUMERIC)) AS total_medido
        FROM medicao_boletim_itens i
        JOIN medicao_boletins b ON b.id = i.boletim_id
        WHERE b.contrato_id = ${input.contratoId}
          AND b.status IN ('enviado', 'aprovado', 'finalizado')
          AND i.eap_codigo IS NOT NULL
        GROUP BY i.eap_codigo
      `);

      const normalizeEap = (eap: string) =>
        eap.split(".").map(s => String(parseInt(s, 10))).join(".");

      const medidoMap: Record<string, { pctAcumulado: number; totalMedido: number }> = {};
      for (const row of medidoResult.rows as any[]) {
        const val = {
          pctAcumulado: parseFloat(row.pct_acumulado || "0"),
          totalMedido: parseFloat(row.total_medido || "0"),
        };
        medidoMap[row.eap_codigo] = val;
        const norm = normalizeEap(row.eap_codigo);
        if (norm !== row.eap_codigo) medidoMap[norm] = val;
      }

      return { itens, medidoMap, valorContrato, totalVendaOrc };
    }),

  getAvancosParaMedicao: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      contratoId: z.number(),
      boletimId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      // Rev. 4024 — Mesma regra de "revisão ativa" usada em todo o resto do
      // módulo Planejamento (PlanejamentoDetalhe.tsx `revisaoAtiva`: última
      // revisão APROVADA; só cai para a mais recente qualquer se não houver
      // nenhuma aprovada). Antes esta query pegava a última revisão por
      // NÚMERO sem olhar o status — se existisse uma revisão "rascunho" mais
      // nova (ex.: próximo ciclo de replanejamento em edição), a Medição
      // buscava avanços dessa revisão rascunho, que ainda não tem nenhum
      // `planejamento_avancos` lançado (o avanço real continua sendo
      // reportado contra a revisão aprovada) — resultado: "Importar do
      // Orçamento (com avanço físico)" não trazia NENHUM item (avanço 0%
      // pra tudo), aparentando que a medição "não vem do avanço".
      const revisaoResult = await db.execute(sql`
        SELECT id FROM planejamento_revisoes
        WHERE projeto_id = ${input.projetoId} AND status = 'aprovada'
        ORDER BY numero DESC LIMIT 1
      `);
      let revisaoId = revisaoResult.rows[0]?.id as number | undefined;
      if (!revisaoId) {
        const fallback = await db.execute(sql`
          SELECT id FROM planejamento_revisoes
          WHERE projeto_id = ${input.projetoId}
          ORDER BY numero DESC LIMIT 1
        `);
        revisaoId = fallback.rows[0]?.id as number | undefined;
      }
      if (!revisaoId) return { avancosCronograma: {}, acumuladoMedido: {}, revisaoId: null };

      // Rev. 4025 — CHAVE POR `atividade_id`, NÃO MAIS POR `eap_codigo`.
      // Causa-raiz do "avanço não chega na Medição" em projetos reais (ex.:
      // VITRA/projeto 44): `eap_codigo` em `planejamento_atividades` está
      // preenchido só numa fração das atividades-folha (ex.: 11 de ~230 no
      // caso real) — o resto vem com eap_codigo = '' (string vazia, não
      // NULL, então passava pelo filtro `IS NOT NULL` e todas colidiam na
      // MESMA chave ''). Isso fazia o `DISTINCT ON (a.eap_codigo)` colapsar
      // dezenas de atividades diferentes num único registro por semana, e
      // fazia a Medição "achar" avanço só para a pequena fatia com EAP
      // preenchido. `atividade_id` é a chave primária real e sempre existe
      // — every atividade tem exatamente 1 id, então o casamento é 1:1
      // garantido, independente de o EAP estar preenchido/coerente ou não.
      const avancosResult = await db.execute(sql`
        SELECT DISTINCT ON (av.atividade_id)
          av.atividade_id,
          av.percentual_acumulado
        FROM planejamento_avancos av
        WHERE av.projeto_id = ${input.projetoId}
          AND av.revisao_id = ${revisaoId}
        ORDER BY av.atividade_id, av.semana DESC
      `);

      const avancosCronograma: Record<number, number> = {};
      for (const row of avancosResult.rows as any[]) {
        avancosCronograma[row.atividade_id] = parseFloat(row.percentual_acumulado || "0");
      }

      const excludeClause = input.boletimId
        ? sql` AND b.id != ${input.boletimId}`
        : sql``;

      const medidoResult = await db.execute(sql`
        SELECT
          i.atividade_id,
          MAX(i.percentual_acumulado_atual) AS pct_acumulado_medido
        FROM medicao_boletim_itens i
        JOIN medicao_boletins b ON b.id = i.boletim_id
        WHERE b.contrato_id = ${input.contratoId}
          AND i.atividade_id IS NOT NULL
          AND b.status IN ('enviado', 'aprovado', 'finalizado')
          ${excludeClause}
        GROUP BY i.atividade_id
      `);

      const acumuladoMedido: Record<number, number> = {};
      for (const row of medidoResult.rows as any[]) {
        acumuladoMedido[row.atividade_id] = parseFloat(row.pct_acumulado_medido || "0");
      }

      return { avancosCronograma, acumuladoMedido, revisaoId };
    }),

  // ============================================================
  // Rev. 2893 — MEDIÇÃO COM LEVANTAMENTO EM PDF (levantamento de campo)
  // ============================================================

  // --- Medições de campo (numeradas por contrato) ---
  listarCampos: protectedProcedure
    // `origem` é OPCIONAL p/ retrocompat. Como os IDs de contrato COLIDEM entre módulos
    // (medicao_contratos × terceiro_contratos), o fluxo de terceiros DEVE passar
    // origem:"terceiro" p/ não misturar levantamentos de um contrato-cliente homônimo.
    .input(z.object({ companyId: z.number(), contratoId: z.number(), origem: z.enum(["cliente", "terceiro"]).optional() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const campos = await db
        .select()
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
          isNull(medicaoCampo.deletedAt),
          // Rev. 3093 — a biblioteca de plantas é um campo interno (status="biblioteca");
          // NÃO é um levantamento de medição e não aparece na listagem.
          sql`${medicaoCampo.status} IS DISTINCT FROM 'biblioteca'`,
          // Sem `origem` explícito = escopo CLIENTE (legado: origem NULL/'cliente').
          // O fluxo de terceiros SEMPRE passa origem:"terceiro". JAMAIS cair em filtro
          // aberto (`true`): contratos homônimos de módulos distintos se misturariam.
          input.origem === "terceiro"
            ? eq(medicaoCampo.origem, "terceiro")
            : sql`(${medicaoCampo.origem} IS DISTINCT FROM 'terceiro')`,
        ))
        .orderBy(desc(medicaoCampo.numero));
      if (campos.length === 0) return [];
      const ids = campos.map((c) => c.id);
      const pdfCounts = await db
        .select({ medicaoCampoId: medicaoCampoPdfs.medicaoCampoId, n: sql<number>`count(*)::int` })
        .from(medicaoCampoPdfs)
        .where(and(inArray(medicaoCampoPdfs.medicaoCampoId, ids), isNull(medicaoCampoPdfs.deletedAt)))
        .groupBy(medicaoCampoPdfs.medicaoCampoId);
      const contCounts = await db
        .select({ medicaoCampoId: medicaoCampoContornos.medicaoCampoId, n: sql<number>`count(*)::int` })
        .from(medicaoCampoContornos)
        .where(and(inArray(medicaoCampoContornos.medicaoCampoId, ids), isNull(medicaoCampoContornos.deletedAt)))
        .groupBy(medicaoCampoContornos.medicaoCampoId);
      const pmap = new Map(pdfCounts.map((r) => [r.medicaoCampoId, r.n]));
      const cmap = new Map(contCounts.map((r) => [r.medicaoCampoId, r.n]));
      return campos.map((c) => ({ ...c, qtdPdfs: pmap.get(c.id) ?? 0, qtdContornos: cmap.get(c.id) ?? 0 }));
    }),

  getCampo: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Rev. 3093 — read-path passou a ESCREVER (migração p/ biblioteca), então
      // reforça o guard de empresa (antes confiava só no eq(companyId) do input).
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [campo] = await db
        .select()
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.id), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) return null;
      // Rev. 3093 — as plantas (PDFs) vêm da BIBLIOTECA do contrato (compartilhadas
      // por todas as medições), não do campo-medição. Resolve/cria a biblioteca,
      // migra plantas legadas soltas e lê os PDFs de lá. Se o próprio campo já é a
      // biblioteca, lê dele mesmo.
      const origemNorm: "cliente" | "terceiro" = campo.origem === "terceiro" ? "terceiro" : "cliente";
      let pdfCampoId = campo.id;
      if (campo.status !== "biblioteca") {
        const lib = await resolverBibliotecaPlantas(db, input.companyId, campo.contratoId, origemNorm);
        await migrarPlantasParaBiblioteca(db, input.companyId, campo.contratoId, origemNorm, lib.id);
        pdfCampoId = lib.id;
      }
      const pdfs = await db
        .select()
        .from(medicaoCampoPdfs)
        .where(and(eq(medicaoCampoPdfs.medicaoCampoId, pdfCampoId), eq(medicaoCampoPdfs.companyId, input.companyId), isNull(medicaoCampoPdfs.deletedAt)))
        .orderBy(medicaoCampoPdfs.ordem, medicaoCampoPdfs.id);
      // Rev. 4807 — plantas ARQUIVADAS (excluídas da biblioteca) que têm
      // contornos ativos DESTE campo continuam visíveis nele (histórico
      // consolidado não perde a planta; só as medições novas deixam de vê-la).
      const arquivadas = await db
        .select({ pdf: medicaoCampoPdfs })
        .from(medicaoCampoPdfs)
        .innerJoin(medicaoCampoContornos, eq(medicaoCampoContornos.pdfId, medicaoCampoPdfs.id))
        .where(and(
          eq(medicaoCampoContornos.medicaoCampoId, campo.id),
          eq(medicaoCampoPdfs.companyId, input.companyId),
          isNull(medicaoCampoContornos.deletedAt),
          sql`${medicaoCampoPdfs.deletedAt} IS NOT NULL`,
        ))
        .groupBy(medicaoCampoPdfs.id);
      for (const a of arquivadas) {
        if (!pdfs.some((p: any) => p.id === (a as any).pdf.id)) {
          (pdfs as any[]).push({ ...(a as any).pdf, arquivada: true });
        }
      }
      const contornos = await db
        .select()
        .from(medicaoCampoContornos)
        .where(and(eq(medicaoCampoContornos.medicaoCampoId, campo.id), eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)))
        .orderBy(medicaoCampoContornos.id);
      const fotos = await db
        .select()
        .from(medicaoCampoFotos)
        .where(and(eq(medicaoCampoFotos.medicaoCampoId, campo.id), eq(medicaoCampoFotos.companyId, input.companyId), isNull(medicaoCampoFotos.deletedAt)))
        .orderBy(medicaoCampoFotos.id);
      // Rev. 4805 — anexa o pé-direito do pavimento (projeto da obra) em cada
      // planta importada: vira a altura default nas medições de parede.
      const pavIds = Array.from(new Set(pdfs.map((p: any) => p.pavimentoId).filter(Boolean)));
      if (pavIds.length > 0) {
        const pavs = await db.select({ id: obraPavimentos.id, peDireito: obraPavimentos.peDireito })
          .from(obraPavimentos)
          .where(and(eq(obraPavimentos.companyId, input.companyId), inArray(obraPavimentos.id, pavIds as number[])));
        const mapPe: Record<number, string | null> = {};
        for (const pv of pavs) mapPe[pv.id] = pv.peDireito as any;
        for (const p of pdfs as any[]) if (p.pavimentoId && mapPe[p.pavimentoId] != null) p.peDireito = mapPe[p.pavimentoId];
      }
      return { ...campo, pdfs, contornos, fotos };
    }),

  // ══════════ Rev. 4805 — PROJETOS PARA MEDIÇÃO (pavimentos da obra) ══════════
  // Cadastro vive na OBRA (existe antes de qualquer contrato) e vale para os
  // dois lados (cliente e terceiros). Arquivo deve ser DXF em escala 1:100
  // (verificação automática de escala continua valendo no levantamento).
  listarPavimentosObra: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      return db.select().from(obraPavimentos)
        .where(and(eq(obraPavimentos.companyId, input.companyId), eq(obraPavimentos.obraId, input.obraId), isNull(obraPavimentos.deletedAt)))
        .orderBy(obraPavimentos.ordem, obraPavimentos.id);
    }),

  salvarPavimentoObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      id: z.number().optional(),
      nome: z.string().min(1),
      peDireito: z.number().min(0.5).max(30).optional(),
      ordem: z.number().optional(),
      arquivoKey: z.string().optional(),
      arquivoNome: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // obra pertence à empresa? (anti-IDOR do FK explícito)
      // Rev. 4805 fix — obras é camelCase ("companyId"); usar Drizzle, não SQL cru.
      const [obraRow] = await db.select({ id: obras.id }).from(obras)
        .where(and(eq(obras.id, input.obraId), eq(obras.companyId, input.companyId))).limit(1);
      if (!obraRow) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada nesta empresa." });
      let url: string | undefined;
      if (input.arquivoKey) {
        if (!input.arquivoKey.startsWith(`medicao-campo/${input.companyId}/`)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Arquivo não pertence a esta empresa." });
        }
        const existsRes = await db.execute(sql`SELECT 1 AS ok FROM uploaded_files WHERE file_key = ${input.arquivoKey} LIMIT 1`);
        const existsRows: any[] = (existsRes as any).rows ?? (existsRes as any) ?? [];
        if (!existsRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo não encontrado no servidor. Envie novamente." });
        const { storageGet } = await import("../storage");
        ({ url } = await storageGet(input.arquivoKey));
      }
      if (input.id) {
        const upd: any = { nome: input.nome, atualizadoEm: new Date() };
        if (input.peDireito != null) upd.peDireito = String(input.peDireito);
        if (input.ordem != null) upd.ordem = input.ordem;
        if (input.observacoes !== undefined) upd.observacoes = input.observacoes;
        if (input.arquivoKey) {
          upd.arquivoKey = input.arquivoKey; upd.arquivoUrl = url; upd.arquivoNome = input.arquivoNome ?? null;
          // Rev. 4806 — controle de revisão: substituir o DXF (chave diferente da
          // atual) sobe a REV. Medições antigas ficam presas à planta antiga
          // (cópia na biblioteca); levantamentos passam a oferecer a nova REV.
          const [atual] = await db.select({ arquivoKey: obraPavimentos.arquivoKey, revisao: obraPavimentos.revisao })
            .from(obraPavimentos)
            .where(and(eq(obraPavimentos.id, input.id), eq(obraPavimentos.companyId, input.companyId)));
          if (atual?.arquivoKey && atual.arquivoKey !== input.arquivoKey) {
            upd.revisao = (atual.revisao ?? 1) + 1;
          }
        }
        const [row] = await db.update(obraPavimentos).set(upd)
          .where(and(eq(obraPavimentos.id, input.id), eq(obraPavimentos.companyId, input.companyId), eq(obraPavimentos.obraId, input.obraId)))
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Pavimento não encontrado." });
        return row;
      }
      const [ordemRow] = await db.select({ max: sql<number>`COALESCE(MAX(ordem),0)::int` })
        .from(obraPavimentos)
        .where(and(eq(obraPavimentos.obraId, input.obraId), eq(obraPavimentos.companyId, input.companyId), isNull(obraPavimentos.deletedAt)));
      const [row] = await db.insert(obraPavimentos).values({
        companyId: input.companyId,
        obraId: input.obraId,
        nome: input.nome,
        peDireito: String(input.peDireito ?? 3),
        ordem: input.ordem ?? (ordemRow?.max ?? 0) + 1,
        arquivoKey: input.arquivoKey ?? null,
        arquivoUrl: url ?? null,
        arquivoNome: input.arquivoNome ?? null,
        observacoes: input.observacoes ?? null,
      }).returning();
      return row;
    }),

  excluirPavimentoObra: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [row] = await db.update(obraPavimentos).set({ deletedAt: new Date(), atualizadoEm: new Date() })
        .where(and(eq(obraPavimentos.id, input.id), eq(obraPavimentos.companyId, input.companyId), isNull(obraPavimentos.deletedAt)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Pavimento não encontrado." });
      return { ok: true };
    }),

  // Projetos da obra disponíveis para ESTE levantamento (resolve a obra do
  // contrato pelo lado certo: terceiro → terceiro_contratos.obra_id; cliente →
  // medicao_contratos.projeto_id → planejamento_projetos.obra_id).
  listarPavimentosDoLevantamento: protectedProcedure
    .input(z.object({ companyId: z.number(), medicaoCampoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [campo] = await db.select({ id: medicaoCampo.id, contratoId: medicaoCampo.contratoId, origem: medicaoCampo.origem })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Levantamento não encontrado." });
      let obraId: number | null = null;
      if (campo.origem === "terceiro") {
        const [tc] = await db.select({ obraId: terceiroContratos.obraId }).from(terceiroContratos)
          .where(and(eq(terceiroContratos.id, campo.contratoId), eq(terceiroContratos.companyId, input.companyId)));
        obraId = tc?.obraId ?? null;
      } else {
        const [mc] = await db.select({ obraId: planejamentoProjetos.obraId }).from(medicaoContratos)
          .leftJoin(planejamentoProjetos, eq(medicaoContratos.projetoId, planejamentoProjetos.id))
          .where(and(eq(medicaoContratos.id, campo.contratoId), eq(medicaoContratos.companyId, input.companyId)));
        obraId = mc?.obraId ?? null;
      }
      if (!obraId) return { obraId: null, pavimentos: [] };
      const pavimentos = await db.select().from(obraPavimentos)
        .where(and(eq(obraPavimentos.companyId, input.companyId), eq(obraPavimentos.obraId, obraId), isNull(obraPavimentos.deletedAt)))
        .orderBy(obraPavimentos.ordem, obraPavimentos.id);
      return { obraId, pavimentos };
    }),

  // Importa (1 toque) o projeto do pavimento para a BIBLIOTECA do contrato —
  // sem reupload. Idempotente: se a planta deste pavimento já está na
  // biblioteca, devolve a existente.
  importarPavimentoNoLevantamento: protectedProcedure
    .input(z.object({ companyId: z.number(), medicaoCampoId: z.number(), pavimentoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [campo] = await db.select({ id: medicaoCampo.id, contratoId: medicaoCampo.contratoId, origem: medicaoCampo.origem, status: medicaoCampo.status })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Levantamento não encontrado." });
      const [pav] = await db.select().from(obraPavimentos)
        .where(and(eq(obraPavimentos.id, input.pavimentoId), eq(obraPavimentos.companyId, input.companyId), isNull(obraPavimentos.deletedAt)));
      if (!pav) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto/pavimento não encontrado." });
      if (!pav.arquivoKey || !pav.arquivoUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Este pavimento ainda não tem arquivo DXF. Envie o projeto no cadastro da obra." });
      // Rev. 4805 (review) — o pavimento deve ser DA OBRA deste contrato
      // (anti-IDOR de escopo: bloqueia importar projeto de outra obra do tenant).
      let obraDoContrato: number | null = null;
      if (campo.origem === "terceiro") {
        const [tc] = await db.select({ obraId: terceiroContratos.obraId }).from(terceiroContratos)
          .where(and(eq(terceiroContratos.id, campo.contratoId), eq(terceiroContratos.companyId, input.companyId)));
        obraDoContrato = tc?.obraId ?? null;
      } else {
        const [mc] = await db.select({ obraId: planejamentoProjetos.obraId }).from(medicaoContratos)
          .leftJoin(planejamentoProjetos, eq(medicaoContratos.projetoId, planejamentoProjetos.id))
          .where(and(eq(medicaoContratos.id, campo.contratoId), eq(medicaoContratos.companyId, input.companyId)));
        obraDoContrato = mc?.obraId ?? null;
      }
      if (!obraDoContrato || Number(pav.obraId) !== Number(obraDoContrato)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Este projeto pertence a outra obra." });
      }
      const origemNorm: "cliente" | "terceiro" = campo.origem === "terceiro" ? "terceiro" : "cliente";
      const destinoCampoId = campo.status === "biblioteca"
        ? campo.id
        : (await resolverBibliotecaPlantas(db, input.companyId, campo.contratoId, origemNorm)).id;
      // Rev. 4806 — idempotência POR REVISÃO: se a REV. vigente já está na
      // biblioteca, devolve; se só há REV. antiga, importa a nova como planta
      // ADICIONAL (as medições antigas continuam na antiga).
      const revAtual = pav.revisao ?? 1;
      const [ja] = await db.select().from(medicaoCampoPdfs)
        .where(and(
          eq(medicaoCampoPdfs.medicaoCampoId, destinoCampoId),
          eq(medicaoCampoPdfs.companyId, input.companyId),
          eq(medicaoCampoPdfs.pavimentoId, input.pavimentoId),
          sql`COALESCE(${medicaoCampoPdfs.pavimentoRevisao}, 1) = ${revAtual}`,
          isNull(medicaoCampoPdfs.deletedAt),
        )).limit(1);
      if (ja) return ja;
      const [ordemRow] = await db.select({ max: sql<number>`COALESCE(MAX(ordem),0)::int` })
        .from(medicaoCampoPdfs)
        .where(eq(medicaoCampoPdfs.medicaoCampoId, destinoCampoId));
      const [row] = await db.insert(medicaoCampoPdfs).values({
        companyId: input.companyId,
        medicaoCampoId: destinoCampoId,
        nome: revAtual > 1 ? `${pav.nome} (REV. ${revAtual})` : pav.nome,
        tipo: "pavimento",
        arquivoUrl: pav.arquivoUrl,
        arquivoKey: pav.arquivoKey,
        arquivoNome: pav.arquivoNome ?? pav.nome,
        numPaginas: 1,
        ordem: (ordemRow?.max ?? 0) + 1,
        pavimentoId: pav.id,
        pavimentoRevisao: revAtual,
      }).returning();
      return row;
    }),

  // Rev. 3082 (T003) — Histórico "já medido" acumulado POR CONTRATO.
  // Soma a quantidade de contornos vinculados a item do orçamento em TODOS os
  // OUTROS campos (levantamentos) do mesmo contrato/empresa, p/ o engenheiro
  // ver o que já foi medido antes e não remedir. Read-only, tenant-guard por companyId.
  getHistoricoQuantidades: protectedProcedure
    .input(z.object({ contratoId: z.number(), companyId: z.number(), excluirCampoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // ATENÇÃO: contratoId COLIDE entre módulos (medicao_contratos × terceiro_contratos),
      // e a engine de levantamento (medicao_campo) é compartilhada com `origem` distinguindo
      // 'terceiro' de cliente/legado (NULL). Para o histórico "já medido" não misturar dois
      // contratos homônimos de módulos diferentes, escopamos pela origem do campo ATUAL.
      // O campo de referência é OBRIGATÓRIO e precisa pertencer à (empresa, contrato) — se
      // não resolver, abortamos (em vez de cair em consulta SEM filtro de origem = mistura).
      const [atual] = await db
        .select({ origem: medicaoCampo.origem })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.id, input.excluirCampoId),
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
        ))
        .limit(1);
      if (!atual) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Levantamento de campo inválido para este contrato/empresa." });
      }
      const escopoTerceiro = atual.origem === "terceiro";
      const campos = await db
        .select({ id: medicaoCampo.id })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
          isNull(medicaoCampo.deletedAt),
          escopoTerceiro
            ? eq(medicaoCampo.origem, "terceiro")
            : sql`(${medicaoCampo.origem} IS DISTINCT FROM 'terceiro')`,
        ));
      let ids = campos.map((c) => c.id).filter((id) => id !== input.excluirCampoId);
      // Rev. 4808 — "já medido" = só levantamentos cuja medição vinculada foi
      // APROVADA/PAGA. Rascunhos, levantamentos abandonados e consolidações sem
      // medição fechada NÃO contam como "medição anterior" (o user via 94 m²
      // "já medidos" vindos de um levantamento duplicado/abandonado).
      if (escopoTerceiro && ids.length > 0) {
        ids = await filtrarCamposComMedicaoFechada(db, ids, input.companyId);
      }
      if (ids.length === 0) return [] as { orcamentoItemId: number; quantidade: number }[];
      const rows = await db
        .select({
          orcamentoItemId: medicaoCampoContornos.orcamentoItemId,
          quantidade: sql<string>`COALESCE(SUM(${medicaoCampoContornos.quantidade}), 0)`,
        })
        .from(medicaoCampoContornos)
        .where(and(
          inArray(medicaoCampoContornos.medicaoCampoId, ids),
          eq(medicaoCampoContornos.companyId, input.companyId),
          isNull(medicaoCampoContornos.deletedAt),
          sql`${medicaoCampoContornos.orcamentoItemId} IS NOT NULL`,
        ))
        .groupBy(medicaoCampoContornos.orcamentoItemId);
      return rows
        .filter((r) => r.orcamentoItemId != null)
        .map((r) => ({ orcamentoItemId: r.orcamentoItemId as number, quantidade: Number(r.quantidade) || 0 }));
    }),

  // Rev. 3093 — Contornos de OUTRAS medições do contrato, p/ exibir como REFERÊNCIA
  // (camada clara) o que já foi medido antes sobre a MESMA planta. Read-only,
  // tenant-guard por companyId + escopo por origem do campo atual (igual
  // getHistoricoQuantidades). Exclui o campo atual e a biblioteca (sem contornos).
  getContornosReferencia: protectedProcedure
    .input(z.object({ contratoId: z.number(), companyId: z.number(), excluirCampoId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [atual] = await db
        .select({ origem: medicaoCampo.origem })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.id, input.excluirCampoId),
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
        ))
        .limit(1);
      if (!atual) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Levantamento de campo inválido para este contrato/empresa." });
      }
      const origemNorm: "cliente" | "terceiro" = atual.origem === "terceiro" ? "terceiro" : "cliente";
      const campos = await db
        .select({ id: medicaoCampo.id, numero: medicaoCampo.numero, titulo: medicaoCampo.titulo, medicaoId: medicaoCampo.medicaoId })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.companyId, input.companyId),
          eq(medicaoCampo.contratoId, input.contratoId),
          isNull(medicaoCampo.deletedAt),
          sql`${medicaoCampo.status} IS DISTINCT FROM 'biblioteca'`,
          origemCampoCond(origemNorm),
        ));
      const tituloMap = new Map<number, { numero: number; titulo: string | null }>(
        campos.map((c) => [c.id, { numero: c.numero, titulo: c.titulo }]),
      );
      let ids = campos.map((c) => c.id).filter((id) => id !== input.excluirCampoId);
      // Rev. 4808 — referência "já medido" só de medições fechadas (aprovada/paga).
      if (origemNorm === "terceiro" && ids.length > 0) {
        ids = await filtrarCamposComMedicaoFechada(db, ids, input.companyId);
      }
      if (ids.length === 0) return [] as any[];
      // Rev. 4859 — nº da MEDIÇÃO (terceiro_medicoes.numero), não do levantamento:
      // o selo "MED nn" na planta deve refletir a medição, que é o que o user vê.
      const medNumeroPorCampo = new Map<number, number>();
      if (origemNorm === "terceiro") {
        const medIdsRef = campos.map((c) => (c as any).medicaoId).filter((x: any) => x != null) as number[];
        const meds = await db
          .select({ id: terceiroMedicoes.id, numero: terceiroMedicoes.numero, levCampoId: terceiroMedicoes.levantamentoCampoId })
          .from(terceiroMedicoes)
          .where(and(
            eq(terceiroMedicoes.companyId, input.companyId),
            eq(terceiroMedicoes.contratoId, input.contratoId),
            medIdsRef.length > 0
              ? sql`(${inArray(terceiroMedicoes.levantamentoCampoId, ids)} OR ${inArray(terceiroMedicoes.id, medIdsRef)})`
              : inArray(terceiroMedicoes.levantamentoCampoId, ids),
          ));
        for (const m of meds as any[]) {
          if (m.levCampoId != null && ids.includes(m.levCampoId)) medNumeroPorCampo.set(m.levCampoId, m.numero ?? 1);
          for (const c of campos as any[]) if (c.medicaoId === m.id && !medNumeroPorCampo.has(c.id)) medNumeroPorCampo.set(c.id, m.numero ?? 1);
        }
      }
      const rows = await db
        .select({
          id: medicaoCampoContornos.id,
          medicaoCampoId: medicaoCampoContornos.medicaoCampoId,
          pdfId: medicaoCampoContornos.pdfId,
          pagina: medicaoCampoContornos.pagina,
          tipo: medicaoCampoContornos.tipo,
          cor: medicaoCampoContornos.cor,
          geometriaJson: medicaoCampoContornos.geometriaJson,
          numero: medicaoCampoContornos.numero,
          rotulo: medicaoCampoContornos.rotulo,
          quantidade: medicaoCampoContornos.quantidade,
          unidade: medicaoCampoContornos.unidade,
        })
        .from(medicaoCampoContornos)
        .where(and(
          inArray(medicaoCampoContornos.medicaoCampoId, ids),
          eq(medicaoCampoContornos.companyId, input.companyId),
          isNull(medicaoCampoContornos.deletedAt),
        ))
        .orderBy(medicaoCampoContornos.id);
      return rows.map((r) => ({
        ...r,
        quantidade: r.quantidade != null ? Number(r.quantidade) : null,
        campoNumero: tituloMap.get(r.medicaoCampoId)?.numero ?? null,
        campoTitulo: tituloMap.get(r.medicaoCampoId)?.titulo ?? null,
        medicaoNumero: medNumeroPorCampo.get(r.medicaoCampoId) ?? null,
      }));
    }),

  criarCampo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      titulo: z.string().nullable().optional(),
      descricao: z.string().nullable().optional(),
      uuid: z.string().optional(),
      // Rev. 3078+ — origem distingue contrato-cliente (medicao_contratos) de
      // contrato-terceiro (terceiro_contratos); os IDs colidem entre as tabelas.
      origem: z.enum(["cliente", "terceiro"]).default("cliente"),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // Guard de tenant: o contrato precisa pertencer à empresa, na tabela CORRETA p/ a origem.
      if (input.origem === "terceiro") {
        const [contrato] = await db
          .select({ id: terceiroContratos.id })
          .from(terceiroContratos)
          .where(and(eq(terceiroContratos.id, input.contratoId), eq(terceiroContratos.companyId, input.companyId)))
          .limit(1);
        if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato de terceiro não encontrado ou sem permissão." });
      } else {
        const [contrato] = await db
          .select({ id: medicaoContratos.id })
          .from(medicaoContratos)
          .where(and(eq(medicaoContratos.id, input.contratoId), eq(medicaoContratos.companyId, input.companyId)))
          .limit(1);
        if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado ou sem permissão." });
      }
      // Numeração escopada por (contrato, origem) — IDs de contrato colidem entre módulos.
      const [ultimo] = await db
        .select({ numero: medicaoCampo.numero })
        .from(medicaoCampo)
        .where(and(
          eq(medicaoCampo.contratoId, input.contratoId),
          input.origem === "terceiro"
            ? eq(medicaoCampo.origem, "terceiro")
            : sql`(${medicaoCampo.origem} IS DISTINCT FROM 'terceiro')`,
        ))
        .orderBy(desc(medicaoCampo.numero))
        .limit(1);
      const numero = (ultimo?.numero ?? 0) + 1;
      const [row] = await db.insert(medicaoCampo).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        uuid: input.uuid,
        numero,
        titulo: input.titulo ?? `Levantamento ${numero}`,
        descricao: input.descricao,
        origem: input.origem,
        criadoPorId: ctx.user.id,
        criadoPorNome: ctx.user.name || "",
      }).returning();
      return row;
    }),

  atualizarCampo: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      titulo: z.string().nullable().optional(),
      descricao: z.string().nullable().optional(),
      status: z.enum(["rascunho", "finalizado"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      await db.update(medicaoCampo)
        .set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(medicaoCampo.id, id), eq(medicaoCampo.companyId, companyId)));
      return { success: true };
    }),

  excluirCampo: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(medicaoCampo)
        .set({ deletedAt: new Date() })
        .where(and(eq(medicaoCampo.id, input.id), eq(medicaoCampo.companyId, input.companyId)));
      return { success: true };
    }),

  // --- PDFs (plantas) por medição ---
  uploadPdf: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      medicaoCampoId: z.number(),
      nome: z.string(),
      tipo: z.enum(["pavimento", "setor", "outro"]).default("pavimento"),
      // Rev. 4787 — base64 opcional: arquivo grande sobe antes via
      // /api/upload/levantamento-planta (multipart, progresso real) e chega
      // aqui só com arquivoKey/arquivoUrl.
      base64: z.string().max(40_000_000).optional(),
      arquivoKey: z.string().optional(),
      arquivoUrl: z.string().optional(),
      contentType: z.string().default("application/pdf"),
      arquivoNome: z.string().optional(),
      numPaginas: z.number().optional(),
      uuid: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Rev. 3093 — reforça o guard de empresa (escrita de planta na biblioteca).
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      const [campo] = await db
        .select({ id: medicaoCampo.id, contratoId: medicaoCampo.contratoId, origem: medicaoCampo.origem, status: medicaoCampo.status })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      // Rev. 3093 — a planta é enviada à BIBLIOTECA do contrato (1x, compartilhada por
      // todas as medições), não ao campo-medição que disparou o upload.
      const origemNorm: "cliente" | "terceiro" = campo.origem === "terceiro" ? "terceiro" : "cliente";
      const destinoCampoId = campo.status === "biblioteca"
        ? campo.id
        : (await resolverBibliotecaPlantas(db, input.companyId, campo.contratoId, origemNorm)).id;
      let key: string;
      let url: string;
      if (input.arquivoKey) {
        // Rev. 4787 — arquivo já subiu via rota multipart; valida que a chave é
        // desta empresa (anti-IDOR) e deriva a URL no SERVER (ignora a do client).
        if (!input.arquivoKey.startsWith(`medicao-campo/${input.companyId}/`)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Arquivo não pertence a esta empresa." });
        }
        key = input.arquivoKey;
        // Existência real: a chave deve estar persistida (rota multipart grava
        // no DB) — bloqueia registrar referência quebrada/forjada.
        const existsRes = await db.execute(sql`SELECT 1 AS ok FROM uploaded_files WHERE file_key = ${key} LIMIT 1`);
        const existsRows: any[] = (existsRes as any).rows ?? (existsRes as any) ?? [];
        if (!existsRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo da planta não encontrado no servidor. Envie novamente." });
        const { storageGet } = await import("../storage");
        ({ url } = await storageGet(key));
      } else {
        if (!input.base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo ausente." });
        const buf = Buffer.from(input.base64, "base64");
        // Rev. — extensão da chave derivada do nome/contentType (DXF além de PDF).
        const extNome = (input.arquivoNome || input.nome || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
        const ext = extNome === "dxf" || (input.contentType || "").includes("dxf") ? "dxf" : "pdf";
        key = `medicao-campo/${input.companyId}/${destinoCampoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        ({ url } = await storagePut(key, buf, input.contentType || "application/pdf"));
      }
      const [ordemRow] = await db
        .select({ max: sql<number>`COALESCE(MAX(ordem),0)::int` })
        .from(medicaoCampoPdfs)
        .where(eq(medicaoCampoPdfs.medicaoCampoId, destinoCampoId));
      const [row] = await db.insert(medicaoCampoPdfs).values({
        companyId: input.companyId,
        medicaoCampoId: destinoCampoId,
        uuid: input.uuid,
        nome: input.nome,
        tipo: input.tipo,
        arquivoUrl: url,
        arquivoKey: key,
        arquivoNome: input.arquivoNome ?? input.nome,
        numPaginas: input.numPaginas ?? 1,
        ordem: (ordemRow?.max ?? 0) + 1,
      }).returning();
      return row;
    }),

  atualizarPdf: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      nome: z.string().optional(),
      tipo: z.enum(["pavimento", "setor", "outro"]).optional(),
      calibracaoJson: z.string().nullable().optional(),
      numPaginas: z.number().optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...data } = input;
      // Rev. 4797 — recalibrar muda TODOS os quantitativos da planta: bloqueado
      // se algum levantamento consolidado tem contornos nela.
      if (data.calibracaoJson !== undefined) await assertPdfSemCampoConsolidado(db, id, companyId);
      await db.update(medicaoCampoPdfs)
        .set({ ...data, atualizadoEm: new Date() })
        .where(and(eq(medicaoCampoPdfs.id, id), eq(medicaoCampoPdfs.companyId, companyId)));
      return { success: true };
    }),

  excluirPdf: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), senhaMaster: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = await getDb();
      // Rev. 4807 — excluir planta = ARQUIVAR: ela some das medições novas, mas
      // os levantamentos CONSOLIDADOS que têm contornos nela continuam
      // enxergando-a (getCampo re-inclui plantas arquivadas com contornos do
      // próprio campo). Por isso NÃO bloqueia mais por consolidação; só os
      // contornos de campos NÃO consolidados são apagados junto.
      // Rev. 4784 — poka-yoke: planta com levantamento EM ABERTO (contornos
      // ativos de campo não consolidado, que serão apagados) só sai com a senha
      // do Administrador Master. Planta vazia/só-histórico sai direto.
      const [{ qtd } = { qtd: 0 }] = await db
        .select({ qtd: sql<number>`COUNT(*)::int` })
        .from(medicaoCampoContornos)
        .innerJoin(medicaoCampo, eq(medicaoCampo.id, medicaoCampoContornos.medicaoCampoId))
        .where(and(
          eq(medicaoCampoContornos.pdfId, input.id),
          eq(medicaoCampoContornos.companyId, input.companyId),
          isNull(medicaoCampoContornos.deletedAt),
          sql`${medicaoCampo.consolidadoEm} IS NULL`,
        ));
      if (Number(qtd) > 0) {
        if (!input.senhaMaster) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `PLANTA_COM_LEVANTAMENTO:${qtd}` });
        }
        const masters = await db.select({ password: users.password }).from(users)
          .where(and(eq(users.role, "admin_master"), isNull(users.deletedAt)));
        const bcrypt = await import("bcryptjs");
        const ok = masters.some((m) => m.password && bcrypt.compareSync(input.senhaMaster!, m.password));
        if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Senha do Administrador Master incorreta. Exclusão negada." });
      }
      await db.update(medicaoCampoPdfs)
        .set({ deletedAt: new Date() })
        .where(and(eq(medicaoCampoPdfs.id, input.id), eq(medicaoCampoPdfs.companyId, input.companyId)));
      // Rev. 4807 — apaga só contornos de campos NÃO consolidados; o histórico
      // consolidado permanece intacto (a planta fica "arquivada" para ele).
      await db.execute(sql`
        UPDATE medicao_campo_contornos ct SET deleted_at = NOW()
        FROM medicao_campo mc
        WHERE mc.id = ct.medicao_campo_id
          AND ct.pdf_id = ${input.id} AND ct.company_id = ${input.companyId}
          AND ct.deleted_at IS NULL AND mc.consolidado_em IS NULL
      `);
      return { success: true };
    }),

  // --- Contornos (área/volume/perímetro/contagem). Cálculos vêm do client. ---
  salvarContorno: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      companyId: z.number(),
      medicaoCampoId: z.number(),
      pdfId: z.number(),
      uuid: z.string().optional(),
      pagina: z.number().default(1),
      tipo: z.enum(["area", "volume", "perimetro", "contagem", "parede"]),
      rotulo: z.string().nullable().optional(),
      cor: z.string().nullable().optional(),
      geometriaJson: z.string(),
      espessura: z.string().nullable().optional(),
      metrosPorUnidade: z.string().nullable().optional(),
      area: z.string().nullable().optional(),
      perimetro: z.string().nullable().optional(),
      volume: z.string().nullable().optional(),
      contagem: z.number().nullable().optional(),
      quantidade: z.string().nullable().optional(),
      unidade: z.string().nullable().optional(),
      servico: z.string().max(50).nullable().optional(),
      numero: z.number().nullable().optional(),
      orcamentoItemId: z.number().nullable().optional(),
      itemEapCodigo: z.string().nullable().optional(),
      itemDescricao: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      // Rev. 4840 — posição customizada da etiqueta numerada ({x,y} 0..1)
      etiquetaJson: z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [campo] = await db
        .select({ id: medicaoCampo.id })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      await assertCampoNaoConsolidado(db, input.medicaoCampoId, input.companyId);
      const { id, companyId, numero: numeroInput, ...rest } = input;
      // Rev. 4792 — Poka-Yoke: unidade do trecho ≠ unidade do item = NÃO salva.
      const erroUnidade = await checarUnidadeVinculo(db, input.medicaoCampoId, input.orcamentoItemId, input.unidade);
      if (erroUnidade) throw new TRPCError({ code: "BAD_REQUEST", message: erroUnidade });
      if (id) {
        await db.update(medicaoCampoContornos)
          // Rev. 4792 — numero agora persiste (patch parcial: só se veio no input)
          .set({ ...rest, ...(typeof numeroInput === "number" ? { numero: numeroInput } : {}), atualizadoEm: new Date() })
          .where(and(eq(medicaoCampoContornos.id, id), eq(medicaoCampoContornos.companyId, companyId)));
        await aplicarLevantamentoNaMedicaoTerceiro(db, input.medicaoCampoId).catch((e: any) => console.error("[Medicao] aplicarLevantamento:", e));
        return { id };
      }
      // Rev. 4836 — numeração GLOBAL do levantamento (era por categoria): a
      // sequência 1,2,3… atravessa todas as categorias, p/ rastreio na planta.
      const usados = await db
        .select({ numero: medicaoCampoContornos.numero })
        .from(medicaoCampoContornos)
        .where(and(
          eq(medicaoCampoContornos.medicaoCampoId, input.medicaoCampoId),
          sql`deleted_at IS NULL`,
        ));
      const setUsados = new Set(usados.map((u: any) => u.numero ?? 0));
      const maxUsado = usados.reduce((m: number, u: any) => Math.max(m, u.numero ?? 0), 0);
      // Rev. 4822 — numeração SEQUENCIAL entre medições: continua do maior nº já
      // usado na categoria em TODAS as medições do contrato (Medição 01 terminou
      // no Forro nº 8 → Medição 02 começa no nº 9). Falha aqui não trava o save.
      let baseContrato = 0;
      try {
        const [campoRow] = await db.select({ contratoId: medicaoCampo.contratoId, origem: medicaoCampo.origem })
          .from(medicaoCampo).where(eq(medicaoCampo.id, input.medicaoCampoId)).limit(1);
        if (campoRow?.contratoId) {
          const [r] = await db.select({ mx: sql<number>`COALESCE(MAX(${medicaoCampoContornos.numero}), 0)` })
            .from(medicaoCampoContornos)
            .innerJoin(medicaoCampo, eq(medicaoCampo.id, medicaoCampoContornos.medicaoCampoId))
            .where(and(
              eq(medicaoCampo.contratoId, campoRow.contratoId),
              eq(medicaoCampo.companyId, companyId),
              isNull(medicaoCampo.deletedAt),
              sql`${medicaoCampo.status} IS DISTINCT FROM 'biblioteca'`,
              origemCampoCond(campoRow.origem === "terceiro" ? "terceiro" : "cliente"),
              sql`${medicaoCampoContornos.medicaoCampoId} <> ${input.medicaoCampoId}`,
              sql`${medicaoCampoContornos.deletedAt} IS NULL`,
            ));
          baseContrato = Number((r as any)?.mx ?? 0);
        }
      } catch (e: any) { console.error("[Medicao] baseContrato numeração:", e?.message); }
      const [row] = await db.insert(medicaoCampoContornos).values({
        companyId,
        ...rest,
        // REGRA DE OURO: número repetido é impossível. Rev. 4836 (pós-review):
        // o otimista do aparelho só vale se CONTINUA a sequência global do
        // contrato (> max usado e > base) — client velho/fila antiga não
        // consegue gravar número regressivo por categoria.
        numero: (typeof numeroInput === "number" && numeroInput > Math.max(maxUsado, baseContrato) && !setUsados.has(numeroInput)) ? numeroInput : Math.max(maxUsado, baseContrato) + 1,
      }).returning();
      await dedupNumerosContornos(db, input.medicaoCampoId).catch((e: any) => console.error("[Medicao] dedupNumeros:", e));
      await aplicarLevantamentoNaMedicaoTerceiro(db, input.medicaoCampoId).catch((e: any) => console.error("[Medicao] aplicarLevantamento:", e));
      return row;
    }),

  excluirContorno: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [alvo] = await db.select({ medicaoCampoId: medicaoCampoContornos.medicaoCampoId })
        .from(medicaoCampoContornos)
        .where(and(eq(medicaoCampoContornos.id, input.id), eq(medicaoCampoContornos.companyId, input.companyId))).limit(1);
      if (alvo) await assertCampoNaoConsolidado(db, alvo.medicaoCampoId, input.companyId);
      await db.update(medicaoCampoContornos)
        .set({ deletedAt: new Date() })
        .where(and(eq(medicaoCampoContornos.id, input.id), eq(medicaoCampoContornos.companyId, input.companyId)));
      if (alvo) await aplicarLevantamentoNaMedicaoTerceiro(db, alvo.medicaoCampoId).catch((e: any) => console.error("[Medicao] aplicarLevantamento:", e));
      return { success: true };
    }),

  // --- Fotos (ilimitadas, opcionalmente fixadas a um contorno/pin) ---
  uploadFoto: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      medicaoCampoId: z.number(),
      pdfId: z.number().nullable().optional(),
      contornoId: z.number().nullable().optional(),
      // Rev. 4823 — aceita VÍDEO também (base64 ~1,33×: ~90MB de arquivo)
      base64: z.string().max(120_000_000),
      contentType: z.string().default("image/jpeg"),
      legenda: z.string().nullable().optional(),
      pagina: z.number().nullable().optional(),
      pinX: z.string().nullable().optional(),
      pinY: z.string().nullable().optional(),
      uuid: z.string().optional(),
      // Rev. 4825 — rastreio da captura (GPS + relógio do aparelho)
      gpsLat: z.number().nullable().optional(),
      gpsLng: z.number().nullable().optional(),
      gpsPrecisao: z.number().nullable().optional(),
      capturadoEm: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [campo] = await db
        .select({ id: medicaoCampo.id })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      await assertCampoNaoConsolidado(db, input.medicaoCampoId, input.companyId);
      const buf = Buffer.from(input.base64, "base64");
      const ext = extMidiaLevantamento(input.contentType);
      const key = `medicao-campo/${input.companyId}/${input.medicaoCampoId}/fotos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url } = await storagePut(key, buf, input.contentType || "image/jpeg");
      const [row] = await db.insert(medicaoCampoFotos).values({
        companyId: input.companyId,
        medicaoCampoId: input.medicaoCampoId,
        pdfId: input.pdfId ?? null,
        contornoId: input.contornoId ?? null,
        uuid: input.uuid,
        arquivoUrl: url,
        arquivoKey: key,
        legenda: input.legenda,
        pagina: input.pagina ?? null,
        pinX: input.pinX ?? null,
        pinY: input.pinY ?? null,
        gpsLat: input.gpsLat != null ? String(input.gpsLat) : null,
        gpsLng: input.gpsLng != null ? String(input.gpsLng) : null,
        gpsPrecisao: input.gpsPrecisao != null ? String(input.gpsPrecisao) : null,
        capturadoEm: input.capturadoEm ? new Date(input.capturadoEm) : null,
      }).returning();
      return row;
    }),

  excluirFoto: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [foto] = await db.select({ medicaoCampoId: medicaoCampoFotos.medicaoCampoId })
        .from(medicaoCampoFotos)
        .where(and(eq(medicaoCampoFotos.id, input.id), eq(medicaoCampoFotos.companyId, input.companyId))).limit(1);
      if (foto) await assertCampoNaoConsolidado(db, foto.medicaoCampoId, input.companyId);
      await db.update(medicaoCampoFotos)
        .set({ deletedAt: new Date() })
        .where(and(eq(medicaoCampoFotos.id, input.id), eq(medicaoCampoFotos.companyId, input.companyId)));
      return { success: true };
    }),

  // Rev. 4797 — Consolidar / Desconsolidar levantamento (Poka-Yoke)
  consolidarLevantamento: protectedProcedure
    .input(z.object({ companyId: z.number(), medicaoCampoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      const [campo] = await db.select().from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId))).limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Levantamento não encontrado ou sem permissão." });
      if ((campo as any).consolidadoEm) return { success: true, jaConsolidado: true };
      // Rev. 4835 — POKA-YOKE (pedido do usuário): a consolidação do levantamento
      // de TERCEIROS só libera depois que a Memória de Cálculo foi ASSINADA por
      // elaborador + responsável pelo contrato (envelope FCSign concluído).
      if ((campo as any).origem === "terceiro") {
        const [envAss] = await db.select({ id: integrasignEnvelopes.id, status: integrasignEnvelopes.status })
          .from(integrasignEnvelopes)
          .where(and(
            eq(integrasignEnvelopes.companyId, input.companyId),
            eq((integrasignEnvelopes as any).medicaoCampoId, input.medicaoCampoId),
            isNull(integrasignEnvelopes.excluidoEm),
            eq(integrasignEnvelopes.status, "concluido"),
          )).orderBy(desc(integrasignEnvelopes.id)).limit(1);
        // Review Rev. 4835 — não basta status concluído: as DUAS partes
        // obrigatórias (elaborador + responsável) precisam constar assinadas.
        const assinados = envAss ? await db.select({ papel: integrasignSignatarios.papel })
          .from(integrasignSignatarios)
          .where(and(
            eq(integrasignSignatarios.envelopeId, envAss.id),
            eq(integrasignSignatarios.status, "assinado"),
            sql`${integrasignSignatarios.papel} <> 'testemunha'`,
          )) : [];
        if (!envAss || assinados.length < 2) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A Memória de Cálculo ainda não foi assinada pelas duas partes. Envie o levantamento para assinatura (elaborador + responsável pelo contrato) e aguarde a conclusão antes de consolidar." });
        }
      }
      // Rev. 4823 — POKA-YOKE: consolidar encerra o ciclo. Só passa se TODO
      // contorno tiver (a) pelo menos 1 foto/vídeo e (b) apropriação (vínculo
      // com item da planilha — no contorno OU herdado do serviço/categoria).
      const vivos = await db.select({ id: medicaoCampoContornos.id, numero: medicaoCampoContornos.numero, rotulo: medicaoCampoContornos.rotulo, servico: medicaoCampoContornos.servico, tipo: medicaoCampoContornos.tipo, orcamentoItemId: medicaoCampoContornos.orcamentoItemId })
        .from(medicaoCampoContornos)
        .where(and(eq(medicaoCampoContornos.medicaoCampoId, input.medicaoCampoId), eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)));
      if (vivos.length > 0) {
        const fotosVivas = await db.select({ contornoId: medicaoCampoFotos.contornoId })
          .from(medicaoCampoFotos)
          .where(and(eq(medicaoCampoFotos.medicaoCampoId, input.medicaoCampoId), eq(medicaoCampoFotos.companyId, input.companyId), isNull(medicaoCampoFotos.deletedAt)));
        const comFoto = new Set(fotosVivas.map((f) => f.contornoId).filter((x) => x != null));
        const svcRows = await db.select({ chave: medicaoLevantamentoServicos.chave, orcamentoItemId: medicaoLevantamentoServicos.orcamentoItemId })
          .from(medicaoLevantamentoServicos)
          .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
        const svcVinculo = new Map(svcRows.map((s) => [s.chave, s.orcamentoItemId]));
        const nome = (c: any) => `${c.rotulo || c.servico || c.tipo} nº ${c.numero ?? "?"}`;
        const semFoto = vivos.filter((c) => !comFoto.has(c.id));
        const semItem = vivos.filter((c) => !c.orcamentoItemId && !svcVinculo.get(String(c.servico ?? "")));
        if (semFoto.length || semItem.length) {
          const partes: string[] = [];
          if (semFoto.length) partes.push(`${semFoto.length} sem foto/vídeo (${semFoto.slice(0, 3).map(nome).join(", ")}${semFoto.length > 3 ? "…" : ""})`);
          if (semItem.length) partes.push(`${semItem.length} sem apropriação/vínculo com a planilha (${semItem.slice(0, 3).map(nome).join(", ")}${semItem.length > 3 ? "…" : ""})`);
          throw new TRPCError({ code: "BAD_REQUEST", message: `Não dá para consolidar ainda: ${partes.join("; ")}. Complete tudo antes de encerrar o ciclo.` });
        }
      }
      await db.update(medicaoCampo)
        .set({ consolidadoEm: new Date(), consolidadoPorNome: (ctx.user as any)?.name || (ctx.session as any)?.name || null, atualizadoEm: new Date() })
        .where(eq(medicaoCampo.id, input.medicaoCampoId));
      return { success: true };
    }),

  desconsolidarLevantamento: protectedProcedure
    .input(z.object({ companyId: z.number(), medicaoCampoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      const role = (ctx.user as any)?.role || "";
      if (role === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para desconsolidar." });
      const [campo] = await db.select().from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId))).limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Levantamento não encontrado ou sem permissão." });
      // Trava dupla: medição vinculada aprovada/paga → precisa desaprovar antes.
      // Consulta REVERSA (terceiro_medicoes.levantamento_campo_id) — o vínculo
      // principal vive na medição, não em campo.medicaoId (nem sempre populado).
      const medsVinculadas = await db.select({ id: terceiroMedicoes.id, status: terceiroMedicoes.status }).from(terceiroMedicoes)
        .where(and(eq(terceiroMedicoes.levantamentoCampoId, input.medicaoCampoId), eq(terceiroMedicoes.companyId, input.companyId)));
      if ((campo as any).medicaoId) {
        const [medDireta] = await db.select({ id: terceiroMedicoes.id, status: terceiroMedicoes.status }).from(terceiroMedicoes)
          .where(and(eq(terceiroMedicoes.id, (campo as any).medicaoId), eq(terceiroMedicoes.companyId, input.companyId))).limit(1);
        if (medDireta && !medsVinculadas.some((m: any) => m.id === medDireta.id)) medsVinculadas.push(medDireta);
      }
      const travada = medsVinculadas.find((m: any) => ["aprovada", "paga"].includes(m.status || ""));
      if (travada) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `A medição vinculada está ${travada.status}. Desaprove a medição antes de desconsolidar o levantamento.` });
      }
      await db.update(medicaoCampo)
        .set({ consolidadoEm: null, consolidadoPorNome: null, atualizadoEm: new Date() })
        .where(eq(medicaoCampo.id, input.medicaoCampoId));
      return { success: true };
    }),

  // --- Consolidação por item do orçamento/contrato → R$ ---
  getConsolidadoCampo: protectedProcedure
    .input(z.object({ medicaoCampoId: z.number(), companyId: z.number(), orcamentoId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [campo] = await db
        .select({ id: medicaoCampo.id })
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      const contornos = await db
        .select()
        .from(medicaoCampoContornos)
        .where(and(eq(medicaoCampoContornos.medicaoCampoId, input.medicaoCampoId), eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)));

      // Itens do orçamento (preço unitário de venda) p/ converter quantidade → R$.
      const itensOrc = input.orcamentoId
        ? await db
            .select({
              id: orcamentoItens.id,
              eapCodigo: orcamentoItens.eapCodigo,
              descricao: orcamentoItens.descricao,
              unidade: orcamentoItens.unidade,
              quantidade: orcamentoItens.quantidade,
              vendaUnitTotal: orcamentoItens.vendaUnitTotal,
            })
            .from(orcamentoItens)
            .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        : [];
      // Rev. 4780 — serviços do levantamento entram na consolidação (vínculo EAP
      // por serviço + linhas derivadas chapisco/emboço/reboco).
      const servicos = await db
        .select()
        .from(medicaoLevantamentoServicos)
        .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
      // Consolidação via função PURA compartilhada (mesma usada no MODO OFFLINE do cliente).
      return consolidarContornos(contornos as any, itensOrc as any, servicos as any);
    }),

  // ═══════════ Rev. 4780 — Catálogo de SERVIÇOS do levantamento ═══════════
  // Híbrido: seed padrão na 1ª leitura + editável + vínculo EAP por serviço.
  listServicosLevantamento: protectedProcedure
    .input(z.object({ companyId: z.number(), medicaoCampoId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      const [campo] = await db.select({ id: medicaoCampo.id }).from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId))).limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      // Rev. 4819 — fonte única = catálogo GLOBAL da empresa; o levantamento
      // materializa as linhas dele a partir do catálogo (o vínculo EAP e o
      // desativar continuam POR levantamento). Campo consolidado é só-leitura:
      // não sofre sync (snapshot preservado).
      const catalogo = await ensureCatalogoServicos(db, input.companyId);
      let rows = await db.select().from(medicaoLevantamentoServicos)
        .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
      const [campoCons] = await db.select({ consolidadoEm: medicaoCampo.consolidadoEm }).from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId))).limit(1);
      if (!campoCons?.consolidadoEm) {
        const porChave = new Map(rows.map((r: any) => [r.chave, r]));
        const faltam = catalogo.filter((c: any) => c.ativo !== 0 && !porChave.has(c.chave));
        // drift de nome/cor/parent (renomeou no catálogo → propaga)
        const drift = rows.filter((r: any) => {
          const c = catalogo.find((x: any) => x.chave === r.chave);
          return c && (c.nome !== r.nome || (c.cor ?? null) !== (r.cor ?? null) || (c.parentChave ?? null) !== (r.parentChave ?? null));
        });
        // Rev. 4819 (review) — órfãos: linha do campo cuja chave NÃO está mais no
        // catálogo. Sem contorno aqui → recolhe (evita "ressuscitar" categoria
        // excluída numa corrida). Com contorno → re-registra no catálogo (fonte
        // única não pode perder categoria que tem medição desenhada).
        const orfaos = rows.filter((r: any) => !catalogo.some((c: any) => c.chave === r.chave));
        if (faltam.length || drift.length || orfaos.length) {
          await db.transaction(async (tx: any) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(478002, ${input.medicaoCampoId})`);
            const atuais = await tx.select({ chave: medicaoLevantamentoServicos.chave }).from(medicaoLevantamentoServicos)
              .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
            const setChaves = new Set(atuais.map((r: any) => r.chave));
            const inserir = faltam.filter((c: any) => !setChaves.has(c.chave));
            if (inserir.length) await tx.insert(medicaoLevantamentoServicos).values(inserir.map((c: any) => ({
              companyId: input.companyId, medicaoCampoId: input.medicaoCampoId,
              chave: c.chave, nome: c.nome, cor: c.cor, tipoMedida: c.tipoMedida,
              derivaDe: c.derivaDe, fator: c.fator != null ? String(c.fator) : "1",
              parentChave: c.parentChave, ordem: c.ordem ?? 0, ativo: 1,
            })));
            for (const r of drift) {
              const c = catalogo.find((x: any) => x.chave === r.chave)!;
              await tx.update(medicaoLevantamentoServicos)
                .set({ nome: c.nome, cor: c.cor, parentChave: c.parentChave, atualizadoEm: new Date() })
                .where(eq(medicaoLevantamentoServicos.id, r.id));
            }
            for (const r of orfaos) {
              const uso = await tx.execute(sql`
                SELECT COUNT(*)::int AS n FROM medicao_campo_contornos
                WHERE company_id = ${input.companyId} AND medicao_campo_id = ${input.medicaoCampoId} AND servico = ${r.chave}
              `);
              const n = Number(((uso as any).rows ?? uso ?? [])[0]?.n ?? 0);
              if (n === 0) {
                // categoria excluída do catálogo e sem medição aqui → recolhe
                await tx.delete(medicaoLevantamentoServicos).where(eq(medicaoLevantamentoServicos.id, r.id));
              } else {
                // tem medição desenhada → volta pro catálogo (fonte única íntegra)
                await tx.insert(medicaoServicosCatalogo).values({
                  companyId: input.companyId, chave: r.chave, nome: r.nome, cor: r.cor,
                  tipoMedida: r.tipoMedida ?? "area", derivaDe: r.derivaDe ?? null,
                  fator: r.fator != null ? String(r.fator) : "1", parentChave: r.parentChave ?? null,
                  ordem: r.ordem ?? 99, ativo: 1,
                }).onConflictDoNothing();
              }
            }
          });
          rows = await db.select().from(medicaoLevantamentoServicos)
            .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, input.medicaoCampoId), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
        }
      }
      return rows.sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    }),

  // ═══════════ Rev. 4819 — Catálogo GLOBAL (categorias padrão da empresa) ═══════════
  listCatalogoServicos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      const rows = await ensureCatalogoServicos(db, input.companyId);
      return rows.sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    }),

  // Cria (sem chave) ou atualiza (com chave) uma categoria GLOBAL. Renomear/
  // recolorir propaga para os levantamentos NÃO consolidados de todos os contratos.
  salvarCatalogoServico: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      chave: z.string().max(50).optional(),
      nome: z.string().min(1).max(100),
      cor: z.string().max(20).nullable().optional(),
      tipoMedida: z.enum(["area", "parede", "perimetro", "volume", "contagem"]).optional(),
      parentChave: z.string().max(50).nullable().optional(),
      fator: z.string().nullable().optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      await ensureCatalogoServicos(db, input.companyId);
      const nome = input.nome.trim();
      if (input.chave) {
        const [atual] = await db.select().from(medicaoServicosCatalogo)
          .where(and(eq(medicaoServicosCatalogo.companyId, input.companyId), eq(medicaoServicosCatalogo.chave, input.chave))).limit(1);
        if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada no catálogo." });
        await db.update(medicaoServicosCatalogo)
          .set({
            nome,
            ...(input.cor !== undefined ? { cor: input.cor } : {}),
            ...(input.tipoMedida ? { tipoMedida: input.tipoMedida } : {}),
            ...(input.parentChave !== undefined ? { parentChave: input.parentChave } : {}),
            ...(input.fator !== undefined && input.fator !== null ? { fator: input.fator } : {}),
            ...(input.ordem !== undefined ? { ordem: input.ordem } : {}),
            atualizadoEm: new Date(),
          })
          .where(eq(medicaoServicosCatalogo.id, (atual as any).id));
        // propaga p/ levantamentos não consolidados (nome/cor); snapshot consolidado fica intacto
        await db.execute(sql`
          UPDATE medicao_levantamento_servicos s
          SET nome = ${nome},
              cor = COALESCE(${input.cor !== undefined ? input.cor : null}, s.cor),
              atualizado_em = NOW()
          FROM medicao_campo c
          WHERE s.medicao_campo_id = c.id
            AND s.company_id = ${input.companyId}
            AND s.chave = ${input.chave}
            AND c.consolidado_em IS NULL
        `);
        return { chave: input.chave };
      }
      // criação: chave = slug único do nome (colisão vira sufixo — poka-yoke)
      const chaveBase = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "categoria";
      const existentes = await db.select({ chave: medicaoServicosCatalogo.chave }).from(medicaoServicosCatalogo)
        .where(eq(medicaoServicosCatalogo.companyId, input.companyId));
      const setCh = new Set(existentes.map((r: any) => r.chave));
      let chave = chaveBase; let i = 2;
      while (setCh.has(chave)) chave = `${chaveBase}_${i++}`;
      const ordem = input.ordem ?? 99;
      const [row] = await db.insert(medicaoServicosCatalogo).values({
        companyId: input.companyId, chave, nome, cor: input.cor ?? null,
        tipoMedida: input.tipoMedida ?? "area", derivaDe: null,
        fator: input.fator ?? "1", parentChave: input.parentChave ?? null, ordem, ativo: 1,
      }).returning();
      return row;
    }),

  // Exclui uma categoria GLOBAL. Poka-yoke: bloqueia se tiver subcategorias,
  // derivados ou contornos já desenhados com ela (em qualquer contrato).
  excluirCatalogoServico: protectedProcedure
    .input(z.object({ companyId: z.number(), chave: z.string().min(1).max(50) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      // Rev. 4819 (review) — TUDO numa transação sob o lock do catálogo da
      // empresa (478007): checagens e deletes atômicos; nenhuma corrida com o
      // sync do list (que também recolhe órfãos) ressuscita a categoria.
      await db.transaction(async (tx: any) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(478007, ${input.companyId})`);
        const [filho] = await tx.select({ nome: medicaoServicosCatalogo.nome }).from(medicaoServicosCatalogo)
          .where(and(eq(medicaoServicosCatalogo.companyId, input.companyId), eq(medicaoServicosCatalogo.parentChave, input.chave))).limit(1);
        if (filho) throw new TRPCError({ code: "BAD_REQUEST", message: `Esta categoria tem subcategorias (ex.: ${(filho as any).nome}). Exclua as subcategorias primeiro.` });
        const [derivado] = await tx.select({ nome: medicaoServicosCatalogo.nome }).from(medicaoServicosCatalogo)
          .where(and(eq(medicaoServicosCatalogo.companyId, input.companyId), eq(medicaoServicosCatalogo.derivaDe, input.chave))).limit(1);
        if (derivado) throw new TRPCError({ code: "BAD_REQUEST", message: `O serviço derivado "${(derivado as any).nome}" depende desta categoria. Exclua-o primeiro.` });
        const uso = await tx.execute(sql`
          SELECT COUNT(*)::int AS n FROM medicao_campo_contornos
          WHERE company_id = ${input.companyId} AND servico = ${input.chave}
        `);
        const n = Number(((uso as any).rows ?? uso ?? [])[0]?.n ?? 0);
        if (n > 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Há ${n} medição(ões) desenhada(s) com esta categoria — ela não pode ser excluída. Use "Desativar" para escondê-la.` });
        // sem contornos em lugar nenhum: remove das listas dos levantamentos abertos + do catálogo
        await tx.execute(sql`
          DELETE FROM medicao_levantamento_servicos s
          USING medicao_campo c
          WHERE s.medicao_campo_id = c.id
            AND s.company_id = ${input.companyId}
            AND s.chave = ${input.chave}
            AND c.consolidado_em IS NULL
        `);
        await tx.delete(medicaoServicosCatalogo)
          .where(and(eq(medicaoServicosCatalogo.companyId, input.companyId), eq(medicaoServicosCatalogo.chave, input.chave)));
      });
      return { success: true };
    }),

  salvarServicoLevantamento: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      companyId: z.number(),
      medicaoCampoId: z.number(),
      chave: z.string().min(1).max(50),
      nome: z.string().min(1).max(100),
      cor: z.string().max(20).nullable().optional(),
      tipoMedida: z.enum(["area", "parede", "perimetro", "volume", "contagem"]).optional(),
      derivaDe: z.string().max(50).nullable().optional(),
      fator: z.string().nullable().optional(),
      orcamentoItemId: z.number().nullable().optional(),
      itemEapCodigo: z.string().nullable().optional(),
      itemDescricao: z.string().nullable().optional(),
      ordem: z.number().optional(),
      ativo: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      const [campo] = await db.select({ id: medicaoCampo.id }).from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId))).limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });
      await assertCampoNaoConsolidado(db, input.medicaoCampoId, input.companyId);
      // Rev. 4792 — Poka-Yoke de UNIDADE também no vínculo por serviço (server:
      // o client já bloqueia, mas chamada direta à API não pode furar a regra).
      if (input.orcamentoItemId) {
        let tipoMedida = input.tipoMedida as string | undefined;
        if (!tipoMedida && input.id) {
          const [srv] = await db.select({ tipoMedida: medicaoLevantamentoServicos.tipoMedida }).from(medicaoLevantamentoServicos)
            .where(eq(medicaoLevantamentoServicos.id, input.id)).limit(1);
          tipoMedida = (srv as any)?.tipoMedida ?? undefined;
        }
        const unidadeServico = ({ area: "m²", parede: "m²", perimetro: "m", volume: "m³", contagem: "un" } as Record<string, string>)[tipoMedida ?? "area"];
        const erroUn = await checarUnidadeVinculo(db, input.medicaoCampoId, input.orcamentoItemId, unidadeServico);
        if (erroUn) throw new TRPCError({ code: "BAD_REQUEST", message: erroUn });
      }
      const { id, companyId, medicaoCampoId, ...rest } = input;
      if (id) {
        await db.update(medicaoLevantamentoServicos)
          .set({ ...rest, atualizadoEm: new Date() })
          .where(and(eq(medicaoLevantamentoServicos.id, id), eq(medicaoLevantamentoServicos.companyId, companyId), eq(medicaoLevantamentoServicos.medicaoCampoId, medicaoCampoId)));
        // vínculo por serviço muda o consolidado → repropaga p/ medição vinculada
        await aplicarLevantamentoNaMedicaoTerceiro(db, medicaoCampoId).catch((e: any) => console.error("[Medicao] aplicarLevantamento:", e));
        return { id };
      }
      const [row] = await db.insert(medicaoLevantamentoServicos)
        .values({ companyId, medicaoCampoId, ...rest }).returning();
      return row;
    }),

  excluirServicoLevantamento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await assertCompanyAccess(ctx.user, input.companyId);
      const [srvRow] = await db.select({ medicaoCampoId: medicaoLevantamentoServicos.medicaoCampoId })
        .from(medicaoLevantamentoServicos)
        .where(and(eq(medicaoLevantamentoServicos.id, input.id), eq(medicaoLevantamentoServicos.companyId, input.companyId))).limit(1);
      if (srvRow) await assertCampoNaoConsolidado(db, srvRow.medicaoCampoId, input.companyId);
      await db.delete(medicaoLevantamentoServicos)
        .where(and(eq(medicaoLevantamentoServicos.id, input.id), eq(medicaoLevantamentoServicos.companyId, input.companyId)));
      return { success: true };
    }),

  // --- Gera um boletim de medição a partir do levantamento consolidado ---
  gerarBoletimDoCampo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      medicaoCampoId: z.number(),
      contratoId: z.number(),
      orcamentoId: z.number().optional(),
      periodoReferencia: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [campo] = await db
        .select()
        .from(medicaoCampo)
        .where(and(eq(medicaoCampo.id, input.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)))
        .limit(1);
      if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Medição não encontrada ou sem permissão." });

      // Guard relacional: o contrato precisa pertencer à empresa E ser o MESMO contrato do campo (anti-IDOR).
      const [contrato] = await db
        .select({ id: medicaoContratos.id })
        .from(medicaoContratos)
        .where(and(eq(medicaoContratos.id, input.contratoId), eq(medicaoContratos.companyId, input.companyId)))
        .limit(1);
      if (!contrato) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado ou sem permissão." });
      if (campo.contratoId !== input.contratoId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A medição não pertence a este contrato." });
      }

      const contornos = await db
        .select()
        .from(medicaoCampoContornos)
        .where(and(eq(medicaoCampoContornos.medicaoCampoId, input.medicaoCampoId), eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)));

      const itensOrc = input.orcamentoId
        ? await db
            .select({
              id: orcamentoItens.id,
              eapCodigo: orcamentoItens.eapCodigo,
              descricao: orcamentoItens.descricao,
              vendaUnitTotal: orcamentoItens.vendaUnitTotal,
              vendaTotal: orcamentoItens.vendaTotal,
            })
            .from(orcamentoItens)
            .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        : [];
      const orcMap = new Map(itensOrc.map((i) => [i.id, i]));

      type Agg = { eapCodigo: string | null; descricao: string; valorContratual: number; valorPeriodo: number };
      const grupos = new Map<string, Agg>();
      for (const c of contornos) {
        const chave = c.orcamentoItemId != null ? `oi:${c.orcamentoItemId}` : `na:${c.id}`;
        const orc = c.orcamentoItemId != null ? orcMap.get(c.orcamentoItemId) : undefined;
        const preco = orc ? parseFloat(String(orc.vendaUnitTotal ?? "0")) || 0 : 0;
        const qtd = parseFloat(String(c.quantidade ?? "0")) || 0;
        let g = grupos.get(chave);
        if (!g) {
          g = {
            eapCodigo: c.itemEapCodigo ?? orc?.eapCodigo ?? null,
            descricao: c.itemDescricao ?? orc?.descricao ?? (c.rotulo || "Levantamento de campo"),
            valorContratual: orc ? parseFloat(String(orc.vendaTotal ?? "0")) || 0 : 0,
            valorPeriodo: 0,
          };
          grupos.set(chave, g);
        }
        g.valorPeriodo += qtd * preco;
      }
      const linhas = Array.from(grupos.values()).filter((l) => l.valorPeriodo > 0);
      if (linhas.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contorno com valor para gerar boletim. Vincule contornos a itens do orçamento." });

      const [ultimo] = await db
        .select({ numero: medicaoBoletins.numero })
        .from(medicaoBoletins)
        .where(eq(medicaoBoletins.contratoId, input.contratoId))
        .orderBy(desc(medicaoBoletins.numero))
        .limit(1);
      const numero = (ultimo?.numero ?? 0) + 1;
      const [boletim] = await db.insert(medicaoBoletins).values({
        companyId: input.companyId,
        contratoId: input.contratoId,
        numero,
        periodoReferencia: input.periodoReferencia,
        observacoes: `Gerado do Levantamento de Campo nº ${campo.numero}${campo.titulo ? ` — ${campo.titulo}` : ""}`,
      }).returning();

      await db.insert(medicaoBoletimItens).values(
        linhas.map((l) => {
          const pct = l.valorContratual > 0 ? (l.valorPeriodo / l.valorContratual) * 100 : 0;
          return {
            boletimId: boletim.id,
            eapCodigo: l.eapCodigo,
            descricao: l.descricao,
            valorContratual: l.valorContratual.toFixed(2),
            percentualAcumuladoAnterior: "0",
            percentualPeriodo: pct.toFixed(4),
            percentualAcumuladoAtual: pct.toFixed(4),
            valorPeriodo: l.valorPeriodo.toFixed(2),
            tipoAvanco: "fisico" as const,
            isFd: false,
          };
        })
      );

      const valorBruto = linhas.reduce((s, l) => s + l.valorPeriodo, 0);
      await db.update(medicaoBoletins)
        .set({ valorBruto: valorBruto.toFixed(2), valorLiquido: valorBruto.toFixed(2), atualizadoEm: new Date() })
        .where(eq(medicaoBoletins.id, boletim.id));

      await db.update(medicaoCampo)
        .set({ boletimId: boletim.id, status: "finalizado", atualizadoEm: new Date() })
        .where(eq(medicaoCampo.id, input.medicaoCampoId));

      return { boletimId: boletim.id, numero, itens: linhas.length, valorBruto };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // Rev. 2895 — SYNC EM LOTE (offline-first / PWA do Levantamento de Campo).
  // Recebe uma fila de operações geradas OFFLINE no tablet e aplica de forma
  // IDEMPOTENTE (upsert por uuid client-stable OU por id quando conhecido) com
  // guard de tenant em CADA operação. Conflito = last-write-wins por
  // `atualizadoEm` (o servidor NUNCA sobrescreve silenciosamente uma versão mais
  // nova; devolve status "conflito" para o cliente registrar/avisar).
  // ───────────────────────────────────────────────────────────────────────────
  sincronizarLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      contratoId: z.number(),
      operations: z.array(z.object({
        clientOpId: z.string(),
        entity: z.enum(["contorno", "foto", "pdf"]),
        action: z.enum(["upsert", "delete", "calibrar"]),
        uuid: z.string().optional(),
        id: z.number().optional(),
        medicaoCampoId: z.number().optional(),
        atualizadoEm: z.string().optional(),
        data: z.any().optional(),
        base64: z.string().max(120_000_000).optional(),
        contentType: z.string().optional(),
      })).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { companyId, contratoId } = input;
      // Rev. 4812 — guard de acesso do USUÁRIO à empresa (antes só se validava
      // que o contrato existia na empresa — IDOR para usuário de outra empresa).
      await assertCompanyAccess(ctx.user, companyId);
      // Rev. 4824 — guarda de TAMANHO agregado do lote (vídeos): cada base64
      // pode ter até ~120M chars, mas o lote inteiro não pode acumular — o
      // decode em memória derrubaria o servidor. O cliente fatia por tamanho.
      const totalBase64 = input.operations.reduce((s, o) => s + (o.base64?.length ?? 0), 0);
      if (totalBase64 > 150_000_000) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Lote de mídia grande demais — envie menos fotos/vídeos por vez (o app fatia automaticamente; tente sincronizar de novo)." });
      }

      // Guard de tenant raiz: o contrato precisa ser desta empresa.
      // Rev. 4792 — BUG CRÍTICO corrigido: o levantamento roda em DOIS módulos
      // (Medição de Cliente = medicao_contratos; Medição de Terceiros =
      // terceiro_contratos) e os IDs colidem entre as tabelas. A validação só
      // olhava medicao_contratos → TODA sync de levantamento de TERCEIROS
      // falhava com "Contrato não encontrado" e nada chegava ao servidor.
      const [contratoCli] = await db
        .select({ id: medicaoContratos.id })
        .from(medicaoContratos)
        .where(and(eq(medicaoContratos.id, contratoId), eq(medicaoContratos.companyId, companyId)))
        .limit(1);
      const [contratoTer] = await db
        .select({ id: terceiroContratos.id })
        .from(terceiroContratos)
        .where(and(eq(terceiroContratos.id, contratoId), eq(terceiroContratos.companyId, companyId)))
        .limit(1);
      if (!contratoCli && !contratoTer) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado ou sem permissão." });

      // cache de campos validados (medicaoCampoId → pertence à empresa+contrato)
      // Anti-colisão de IDs entre módulos: se o contratoId só existe num dos
      // módulos, o campo precisa ter a origem correspondente.
      const camposOk = new Map<number, boolean>();
      const camposConsolidados = new Set<number>(); // Rev. 4797 — consolidado = só-leitura
      const camposComContorno = new Set<number>(); // p/ dedup de numeração pós-lote
      // Rev. 4812 — mapa uuid→id dos contornos resolvidos NESTE lote: fotos tiradas
      // num contorno recém-desenhado offline chegam com contornoId temporário
      // NEGATIVO; sem o remap a foto era gravada órfã (sumia do card do contorno).
      const contornoUuidMap = new Map<string, number>();
      async function campoValido(campoId: number): Promise<boolean> {
        if (camposOk.has(campoId)) return camposOk.get(campoId)!;
        const [c] = await db
          .select({ id: medicaoCampo.id, origem: medicaoCampo.origem, consolidadoEm: medicaoCampo.consolidadoEm })
          .from(medicaoCampo)
          .where(and(
            eq(medicaoCampo.id, campoId),
            eq(medicaoCampo.companyId, companyId),
            eq(medicaoCampo.contratoId, contratoId),
          ))
          .limit(1);
        let ok = !!c;
        if (ok && c) {
          const ehTerceiro = c.origem === "terceiro";
          if (ehTerceiro && !contratoTer) ok = false;
          if (!ehTerceiro && !contratoCli) ok = false;
          if ((c as any).consolidadoEm) camposConsolidados.add(campoId);
        }
        camposOk.set(campoId, ok);
        return ok;
      }
      // Rev. 4797 — ops offline sobre campo consolidado NÃO falham (falha
      // não-transitória = fila em loop no aparelho): são DESCARTADAS com "ok"
      // e mensagem, preservando o que está consolidado no servidor.
      const consolidadoSkip = (campoId: number | undefined | null): boolean =>
        !!campoId && camposConsolidados.has(campoId);

      const tsIn = (s?: string): Date => {
        const d = s ? new Date(s) : new Date();
        return isNaN(d.getTime()) ? new Date() : d;
      };
      const isNewer = (existing: Date | null, incoming: Date): boolean =>
        !!existing && existing.getTime() > incoming.getTime();

      type OpResult = {
        clientOpId: string;
        uuid?: string;
        status: "ok" | "conflito" | "erro";
        serverId?: number;
        mensagem?: string;
      };
      const resultados: OpResult[] = [];

      for (const op of input.operations) {
        const incoming = tsIn(op.atualizadoEm);
        try {
          // ───────── CONTORNO ─────────
          if (op.entity === "contorno") {
            if (op.action === "delete") {
              let alvo: any = null;
              if (op.id && op.id > 0) {
                [alvo] = await db.select({ id: medicaoCampoContornos.id, medicaoCampoId: medicaoCampoContornos.medicaoCampoId })
                  .from(medicaoCampoContornos)
                  .where(and(eq(medicaoCampoContornos.id, op.id), eq(medicaoCampoContornos.companyId, companyId))).limit(1);
              } else if (op.uuid) {
                [alvo] = await db.select({ id: medicaoCampoContornos.id, medicaoCampoId: medicaoCampoContornos.medicaoCampoId })
                  .from(medicaoCampoContornos)
                  .where(and(eq(medicaoCampoContornos.uuid, op.uuid), eq(medicaoCampoContornos.companyId, companyId))).limit(1);
              }
              // Só apaga se a linha pertence a um campo deste contrato (guard cross-contrato).
              // Não-encontrada = idempotente (já apagada / nunca existiu aqui) → "ok".
              if (alvo && (await campoValido(alvo.medicaoCampoId))) {
                if (consolidadoSkip(alvo.medicaoCampoId)) {
                  resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "ok", mensagem: "Ignorado: levantamento consolidado." });
                  continue;
                }
                await db.update(medicaoCampoContornos).set({ deletedAt: new Date() }).where(eq(medicaoCampoContornos.id, alvo.id));
              }
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "ok" });
              continue;
            }
            // upsert
            const d = op.data || {};
            const campoId = op.medicaoCampoId ?? d.medicaoCampoId;
            if (!campoId || !(await campoValido(campoId))) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Medição não encontrada ou sem permissão." });
              continue;
            }
            if (consolidadoSkip(campoId)) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "ok", mensagem: "Ignorado: levantamento consolidado." });
              continue;
            }
            camposComContorno.add(campoId); // dedup de numeração pós-lote
            // Rev. 4792 — Poka-Yoke: unidade do trecho ≠ unidade do item. No sync
            // offline NÃO rejeitamos a op (rejeição não-transitória = fila em
            // loop eterno no aparelho): salvamos a MEDIDA e descartamos só o
            // vínculo errado — o contorno volta como "Sem item" p/ revincular.
            const erroUnidade = await checarUnidadeVinculo(db, campoId, d.orcamentoItemId, d.unidade);
            if (erroUnidade) {
              d.orcamentoItemId = null; d.itemEapCodigo = null; d.itemDescricao = null;
              console.warn(`[Medicao] sincronizarLote: vínculo descartado por unidade (campo ${campoId}): ${erroUnidade}`);
            }
            const fields = {
              pdfId: d.pdfId,
              pagina: d.pagina ?? 1,
              tipo: d.tipo,
              rotulo: d.rotulo ?? null,
              cor: d.cor ?? null,
              geometriaJson: d.geometriaJson ?? "[]",
              espessura: d.espessura ?? null,
              metrosPorUnidade: d.metrosPorUnidade ?? null,
              area: d.area ?? null,
              perimetro: d.perimetro ?? null,
              volume: d.volume ?? null,
              contagem: d.contagem ?? null,
              quantidade: d.quantidade ?? null,
              unidade: d.unidade ?? null,
              servico: d.servico ?? null,
              orcamentoItemId: d.orcamentoItemId ?? null,
              itemEapCodigo: d.itemEapCodigo ?? null,
              itemDescricao: d.itemDescricao ?? null,
              observacoes: d.observacoes ?? null,
              // Rev. 4840 — undefined = preserva no update (drizzle ignora), null = limpa
              etiquetaJson: d.etiquetaJson,
            };
            // localizar existente por id (conhecido) OU por uuid
            let existing: any = null;
            if (op.id && op.id > 0) {
              [existing] = await db.select().from(medicaoCampoContornos)
                .where(and(eq(medicaoCampoContornos.id, op.id), eq(medicaoCampoContornos.companyId, companyId))).limit(1);
            } else if (op.uuid) {
              [existing] = await db.select().from(medicaoCampoContornos)
                .where(and(eq(medicaoCampoContornos.uuid, op.uuid), eq(medicaoCampoContornos.companyId, companyId))).limit(1);
            }
            if (existing) {
              // Guard cross-contrato: a linha existente precisa pertencer a um campo deste contrato.
              if (!(await campoValido(existing.medicaoCampoId))) {
                resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Contorno pertence a outro contrato." });
                continue;
              }
              if (isNewer(existing.atualizadoEm, incoming)) {
                resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "conflito", mensagem: "Versão no servidor é mais recente." });
                continue;
              }
              await db.update(medicaoCampoContornos)
                // Rev. 4780 — patch parcial de `servico`: se o client (versão antiga
                // offline) não mandar o campo, PRESERVA a classificação existente
                // em vez de zerar com null cego.
                .set({
                  ...fields,
                  servico: d.servico !== undefined ? (d.servico ?? null) : (existing as any).servico,
                  // Rev. 4792 — numero também sincroniza (patch parcial): sem isso o
                  // Renumerar só valia no aparelho e os duplicados voltavam do servidor.
                  numero: typeof d.numero === "number" ? d.numero : (existing as any).numero,
                  atualizadoEm: incoming,
                })
                .where(and(eq(medicaoCampoContornos.id, existing.id), eq(medicaoCampoContornos.companyId, companyId)));
              if (op.uuid) contornoUuidMap.set(op.uuid, existing.id);
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "ok" });
              continue;
            }
            // Rev. 4836 — numeração GLOBAL do levantamento (era por categoria).
            // REGRA DE OURO: número repetido é IMPOSSÍVEL — o otimista do aparelho
            // só vale se estiver livre (dois aparelhos offline geravam duplicado).
            const usados = await db
              .select({ numero: medicaoCampoContornos.numero })
              .from(medicaoCampoContornos)
              .where(and(
                eq(medicaoCampoContornos.medicaoCampoId, campoId),
                sql`deleted_at IS NULL`,
              ));
            const setUsados = new Set(usados.map((u) => u.numero ?? 0));
            const maxUsado = usados.reduce((m, u) => Math.max(m, u.numero ?? 0), 0);
            // Rev. 4824 — MESMA regra do salvarContorno online: a sequência da
            // categoria continua pelo CONTRATO (medições anteriores incluídas),
            // senão o caminho offline regenerava números "para trás".
            let baseContratoSync = 0;
            try {
              const [campoRowS] = await db.select({ contratoId: medicaoCampo.contratoId, origem: medicaoCampo.origem })
                .from(medicaoCampo).where(eq(medicaoCampo.id, campoId)).limit(1);
              if (campoRowS?.contratoId) {
                const [rS] = await db.select({ mx: sql<number>`COALESCE(MAX(${medicaoCampoContornos.numero}), 0)` })
                  .from(medicaoCampoContornos)
                  .innerJoin(medicaoCampo, eq(medicaoCampo.id, medicaoCampoContornos.medicaoCampoId))
                  .where(and(
                    eq(medicaoCampo.contratoId, campoRowS.contratoId),
                    eq(medicaoCampo.companyId, companyId),
                    isNull(medicaoCampo.deletedAt),
                    sql`${medicaoCampo.status} IS DISTINCT FROM 'biblioteca'`,
                    origemCampoCond(campoRowS.origem === "terceiro" ? "terceiro" : "cliente"),
                    sql`${medicaoCampoContornos.medicaoCampoId} <> ${campoId}`,
                    sql`${medicaoCampoContornos.deletedAt} IS NULL`,
                  ));
                baseContratoSync = Number((rS as any)?.mx ?? 0);
              }
            } catch (e: any) { console.error("[Medicao] baseContrato sync:", e?.message); }
            // Rev. 4836 (pós-review): número do aparelho só vale se continua a
            // sequência GLOBAL (> max do campo e > base do contrato) — fila
            // offline antiga (numeração por categoria) não regride a sequência.
            const numeroFinal = (typeof d.numero === "number" && d.numero > Math.max(maxUsado, baseContratoSync) && !setUsados.has(d.numero))
              ? d.numero
              : Math.max(maxUsado, baseContratoSync) + 1;
            const [row] = await db.insert(medicaoCampoContornos).values({
              companyId,
              medicaoCampoId: campoId,
              uuid: op.uuid,
              atualizadoEm: incoming,
              ...fields,
              numero: numeroFinal,
            }).returning();
            if (op.uuid) contornoUuidMap.set(op.uuid, row.id);
            resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: row.id, status: "ok" });
            continue;
          }

          // ───────── FOTO ─────────
          if (op.entity === "foto") {
            if (op.action === "delete") {
              let alvo: any = null;
              if (op.id && op.id > 0) {
                [alvo] = await db.select({ id: medicaoCampoFotos.id, medicaoCampoId: medicaoCampoFotos.medicaoCampoId })
                  .from(medicaoCampoFotos)
                  .where(and(eq(medicaoCampoFotos.id, op.id), eq(medicaoCampoFotos.companyId, companyId))).limit(1);
              } else if (op.uuid) {
                [alvo] = await db.select({ id: medicaoCampoFotos.id, medicaoCampoId: medicaoCampoFotos.medicaoCampoId })
                  .from(medicaoCampoFotos)
                  .where(and(eq(medicaoCampoFotos.uuid, op.uuid), eq(medicaoCampoFotos.companyId, companyId))).limit(1);
              }
              // Guard cross-contrato; não-encontrada = idempotente → "ok".
              if (alvo && (await campoValido(alvo.medicaoCampoId))) {
                if (consolidadoSkip(alvo.medicaoCampoId)) {
                  resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "ok", mensagem: "Ignorado: levantamento consolidado." });
                  continue;
                }
                await db.update(medicaoCampoFotos).set({ deletedAt: new Date() }).where(eq(medicaoCampoFotos.id, alvo.id));
              }
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "ok" });
              continue;
            }
            // upsert (create) — idempotente por uuid
            const d = op.data || {};
            const campoId = op.medicaoCampoId ?? d.medicaoCampoId;
            if (!campoId || !(await campoValido(campoId))) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Medição não encontrada ou sem permissão." });
              continue;
            }
            if (consolidadoSkip(campoId)) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "ok", mensagem: "Ignorado: levantamento consolidado." });
              continue;
            }
            if (op.uuid) {
              // Dedup escopado ao campo já validado (evita casar uuid de outro contrato).
              const [existing] = await db.select({ id: medicaoCampoFotos.id }).from(medicaoCampoFotos)
                .where(and(
                  eq(medicaoCampoFotos.uuid, op.uuid),
                  eq(medicaoCampoFotos.companyId, companyId),
                  eq(medicaoCampoFotos.medicaoCampoId, campoId),
                )).limit(1);
              if (existing) {
                resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "ok" });
                continue;
              }
            }
            if (!op.base64) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Foto sem conteúdo." });
              continue;
            }
            // Rev. 4812 — resolve o contorno da foto: id positivo direto; id
            // temporário (negativo, gerado offline) resolve pelo UUID do contorno
            // (mesmo lote OU já sincronizado antes). Sem isso a foto virava órfã.
            let fotoContornoId: number | null = null;
            if (typeof d.contornoId === "number" && d.contornoId > 0) {
              // valida ownership: o contorno precisa ser DESTE campo/empresa.
              const [own] = await db.select({ id: medicaoCampoContornos.id }).from(medicaoCampoContornos)
                .where(and(
                  eq(medicaoCampoContornos.id, d.contornoId),
                  eq(medicaoCampoContornos.companyId, companyId),
                  eq(medicaoCampoContornos.medicaoCampoId, campoId),
                )).limit(1);
              fotoContornoId = own?.id ?? null;
            }
            if (!fotoContornoId && d.contornoUuid) {
              fotoContornoId = contornoUuidMap.get(d.contornoUuid) ?? null;
              if (!fotoContornoId) {
                const [cRow] = await db.select({ id: medicaoCampoContornos.id }).from(medicaoCampoContornos)
                  .where(and(
                    eq(medicaoCampoContornos.uuid, d.contornoUuid),
                    eq(medicaoCampoContornos.companyId, companyId),
                    eq(medicaoCampoContornos.medicaoCampoId, campoId),
                  )).limit(1);
                fotoContornoId = cRow?.id ?? null;
              }
            }
            // Fallback p/ ops ANTIGAS na fila (sem contornoUuid): o id temporário
            // negativo é um hash determinístico do uuid do contorno — recalcula
            // o hash p/ os contornos do campo e religa por igualdade.
            if (!fotoContornoId && typeof d.contornoId === "number" && d.contornoId < 0) {
              const tempIdFromUuid = (u: string) => { let h = 0; for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) | 0; return -Math.abs(h) - 1; };
              const cands = await db.select({ id: medicaoCampoContornos.id, uuid: medicaoCampoContornos.uuid }).from(medicaoCampoContornos)
                .where(and(eq(medicaoCampoContornos.companyId, companyId), eq(medicaoCampoContornos.medicaoCampoId, campoId), sql`deleted_at IS NULL`));
              fotoContornoId = cands.find((x) => x.uuid && tempIdFromUuid(x.uuid) === d.contornoId)?.id ?? null;
            }
            const buf = Buffer.from(op.base64, "base64");
            const ext = extMidiaLevantamento(op.contentType);
            const key = `medicao-campo/${companyId}/${campoId}/fotos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { url } = await storagePut(key, buf, op.contentType || "image/jpeg");
            const [row] = await db.insert(medicaoCampoFotos).values({
              companyId,
              medicaoCampoId: campoId,
              pdfId: d.pdfId ?? null,
              contornoId: fotoContornoId,
              uuid: op.uuid,
              arquivoUrl: url,
              arquivoKey: key,
              legenda: d.legenda ?? null,
              pagina: d.pagina ?? null,
              pinX: d.pinX ?? null,
              pinY: d.pinY ?? null,
              // Rev. 4825 — rastreio da captura vem junto da op offline
              gpsLat: d.gpsLat != null ? String(d.gpsLat) : null,
              gpsLng: d.gpsLng != null ? String(d.gpsLng) : null,
              gpsPrecisao: d.gpsPrecisao != null ? String(d.gpsPrecisao) : null,
              capturadoEm: d.capturadoEm ? new Date(d.capturadoEm) : null,
            }).returning();
            resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: row.id, status: "ok" });
            continue;
          }

          // ───────── PDF (apenas calibração offline) ─────────
          if (op.entity === "pdf") {
            const d = op.data || {};
            if (!op.id || op.id <= 0) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "PDF sem id (calibração exige planta já existente)." });
              continue;
            }
            const [existing] = await db.select().from(medicaoCampoPdfs)
              .where(and(eq(medicaoCampoPdfs.id, op.id), eq(medicaoCampoPdfs.companyId, companyId))).limit(1);
            if (!existing) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Planta não encontrada ou sem permissão." });
              continue;
            }
            // Guard cross-contrato: a planta precisa pertencer a um campo deste contrato.
            if (!(await campoValido(existing.medicaoCampoId))) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: "Planta pertence a outro contrato." });
              continue;
            }
            if (isNewer(existing.atualizadoEm, incoming)) {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "conflito", mensagem: "Calibração no servidor é mais recente." });
              continue;
            }
            // Rev. 4797 — recalibração offline sobre planta com levantamento
            // consolidado: descarta com "ok" (fila não pode loopar).
            try {
              await assertPdfSemCampoConsolidado(db, op.id, companyId);
            } catch {
              resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "ok", mensagem: "Ignorado: levantamento consolidado." });
              continue;
            }
            await db.update(medicaoCampoPdfs)
              .set({ calibracaoJson: d.calibracaoJson ?? null, atualizadoEm: incoming })
              .where(and(eq(medicaoCampoPdfs.id, op.id), eq(medicaoCampoPdfs.companyId, companyId)));
            resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, serverId: existing.id, status: "ok" });
            continue;
          }
        } catch (e: any) {
          resultados.push({ clientOpId: op.clientOpId, uuid: op.uuid, status: "erro", mensagem: e?.message || "Falha ao sincronizar." });
        }
      }

      const okCount = resultados.filter((r) => r.status === "ok").length;
      const conflitos = resultados.filter((r) => r.status === "conflito").length;
      const erros = resultados.filter((r) => r.status === "erro").length;

      // Rev. 4792 — REGRA DE OURO (pós-lote): garante numeração única por
      // categoria mesmo com lotes concorrentes (o check no INSERT não é
      // atômico). Só mexe nos DUPLICADOS (o 1º de cada número fica; os demais
      // vão para o próximo número livre) — nunca compacta buracos, para não
      // trocar números que o usuário já conhece.
      for (const campoId of camposComContorno) {
        try { await dedupNumerosContornos(db, campoId); } catch (e) { console.error("[Medicao] dedupNumeros falhou:", e); }
        // Rev. 4792 — levantamento vinculado a medição de terceiros em rascunho:
        // os quantitativos fluem automaticamente para a planilha da medição.
        try { await aplicarLevantamentoNaMedicaoTerceiro(db, campoId); } catch (e) { console.error("[Medicao] aplicarLevantamento falhou:", e); }
      }
      return { resultados, okCount, conflitos, erros };
    }),
});

// Rev. 4792 — renumera SOMENTE duplicados de uma medição: por categoria
// (COALESCE(servico,tipo)), mantém o menor id em cada número repetido e move
// os demais para max+1, max+2… Determinístico e idempotente.
async function dedupNumerosContornos(db: any, campoId: number) {
  await db.execute(sql`
    -- Rev. 4836: dedup GLOBAL do levantamento (era por categoria) — a sequência
    -- 1,2,3… atravessa todas as categorias, então nº repetido é sempre conflito.
    WITH vivos AS (
      SELECT id, numero,
             ROW_NUMBER() OVER (PARTITION BY numero ORDER BY id) AS dup_rn
      FROM medicao_campo_contornos
      WHERE medicao_campo_id = ${campoId} AND deleted_at IS NULL
    ), mx AS (
      SELECT MAX(numero) AS mx FROM vivos
    ), dups AS (
      SELECT v.id, ROW_NUMBER() OVER (ORDER BY v.numero, v.id) AS k
      FROM vivos v WHERE v.dup_rn > 1
    )
    UPDATE medicao_campo_contornos m
    SET numero = mx.mx + dups.k
    FROM dups, mx
    WHERE m.id = dups.id
  `);
}
