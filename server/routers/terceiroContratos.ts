import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserCompanyLinks } from "../db";
import { upperCaseEmpresa } from "../../shared/normalizeNomeEmpresa";
import { triggerFinancialSync, triggerFinancialSyncAwaited } from "../services/financialEventTrigger";
import { eq, and, or, desc, inArray, sql, asc, isNull } from "drizzle-orm";
import {
  terceiroContratos,
  terceiroContratoItens,
  terceiroMedicoes,
  terceiroMedicaoItens,
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
} from "../../drizzle/schema";

const n = (v: any) => parseFloat(String(v ?? 0)) || 0;

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

// ══════════════════════════════════════════════════════════════
// CONTRATOS
// ══════════════════════════════════════════════════════════════

export const terceiroContratosRouter = router({

  listarContratos: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      empresaTerceiraId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
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

      return rows.map(r => ({
        ...r,
        empresaNome: empMap[r.empresaTerceiraId] || "—",
        saldoDisponivel: n(r.valorTotal) - n(r.valorPago),
        percentualPago: n(r.valorTotal) > 0 ? (n(r.valorPago) / n(r.valorTotal)) * 100 : 0,
      }));
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
        const [envelope] = await db.select({ status: integrasignEnvelopes.status })
          .from(integrasignEnvelopes)
          .where(and(
            eq(integrasignEnvelopes.contratoTerceiroId, input.id),
            eq(integrasignEnvelopes.companyId, contrato.companyId),
          ))
          .orderBy(desc(integrasignEnvelopes.criadoEm))
          .limit(1);
        assinaturaStatus = envelope?.status ?? null;
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
    .mutation(async ({ input }) => {
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

      const [c] = await db.insert(terceiroContratos).values({
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
      documentacaoNecessaria: z.string().max(2000).optional(),
      fluxogramaEtapas: z.string().max(5000).optional(),
      prazoEmissaoNf: z.number().min(1).max(60).optional(),
      prazoLiberacaoOp: z.number().min(1).max(60).optional(),
      textoContrato: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, companyId, ...rest } = input;
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
      if (rest.documentacaoNecessaria !== undefined) upd.documentacaoNecessaria = rest.documentacaoNecessaria;
      if (rest.fluxogramaEtapas !== undefined) upd.fluxogramaEtapas = rest.fluxogramaEtapas;
      if (rest.prazoEmissaoNf !== undefined) upd.prazoEmissaoNf = rest.prazoEmissaoNf;
      if (rest.prazoLiberacaoOp !== undefined) upd.prazoLiberacaoOp = rest.prazoLiberacaoOp;
      if (rest.textoContrato !== undefined) upd.textoContrato = rest.textoContrato;
      const [c] = await db.update(terceiroContratos).set(upd).where(and(eq(terceiroContratos.id, id), eq(terceiroContratos.companyId, companyId))).returning();
      if (!c) throw new Error("Contrato não encontrado");
      return c;
    }),

  excluirContrato: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [contrato] = await db.select().from(terceiroContratos).where(
        and(eq(terceiroContratos.id, input.id), eq(terceiroContratos.companyId, input.companyId))
      );
      if (!contrato) throw new Error("Contrato não encontrado");
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
    .query(async ({ input }) => {
      const db = await getDb();
      const items = await db.select().from(terceiroContratoItens)
        .where(eq(terceiroContratoItens.contratoId, input.contratoId))
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
    .query(async ({ input }) => {
      const db = await getDb();
      let rows = await db.select().from(terceiroMedicoes)
        .where(eq(terceiroMedicoes.companyId, input.companyId))
        .orderBy(desc(terceiroMedicoes.numero));
      if (input.contratoId) rows = rows.filter(r => r.contratoId === input.contratoId);
      return rows;
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
      const numero = medicoesAnteriores.length + 1;
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
        const itemWithOrc = itensContrato.find((ic: any) => ic.orcamentoItemId);
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
        const percentualPeriodo = Math.max(0, percentualFisico - percentualAnterior);
        const valorPeriodo = (percentualPeriodo / 100) * n(item.valorTotal);
        const valorAcumuladoItem = (percentualFisico / 100) * n(item.valorTotal);

        valorMedidoPeriodo += valorPeriodo;

        itensMedicao.push({
          contratoItemId: item.id,
          companyId: input.companyId,
          descricao: item.descricao,
          percentualAvancoFisico: String(percentualFisico),
          percentualAcumuladoAnterior: String(percentualAnterior),
          percentualMedidoPeriodo: String(percentualPeriodo),
          valorMedidoPeriodo: String(valorPeriodo),
          valorAcumulado: String(valorAcumuladoItem),
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
      return { medicao, itens: itensMedicao.length, itensNaoVinculados };
    }),

  getMedicao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.id));
      if (!medicao) return null;
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Rev. 1987 — BUGFIX A1 · Toda a aprovação agora roda em TRANSAÇÃO ATÔMICA.
      // Bug anterior: update medicao → loop update itens. Se o loop falhasse no
      // meio, a medição ficava "aprovada" mas itens do contrato meio-atualizados
      // → percentuais acumulados inconsistentes (passivo de re-aprovação manual).
      // Agora: tudo dentro de db.transaction → falha em qualquer item → rollback total.
      const medicao = await db.transaction(async (tx: any) => {
        const [existing] = await tx.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
        if (!existing) throw new Error("Medição não encontrada");
        if (existing.status !== "aguardando_aprovacao") throw new Error(`Medição não pode ser aprovada (status: ${existing.status})`);
        const [med] = await tx.update(terceiroMedicoes)
          .set({ status: "aprovada", aprovadoPor: input.aprovadoPor, aprovadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() })
          .where(eq(terceiroMedicoes.id, input.id))
          .returning();

        // Atualiza percentual acumulado nos itens do contrato (dentro do tx → atomicidade)
        const itensMedicao = await tx.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
        for (const im of itensMedicao) {
          await tx.update(terceiroContratoItens)
            .set({
              percentualMedidoAcumulado: im.percentualAvancoFisico,
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
      try {
        await triggerFinancialSyncAwaited(input.companyId);
      } catch (syncErr: any) {
        console.error(`[aprovarMedicao] FALHA no sync financeiro pós-aprovação da medição #${input.id} (companyId=${input.companyId}):`, syncErr?.message || syncErr);
      }
      return medicao;
    }),

  cancelarAprovacao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [existing] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!existing) throw new Error("Medição não encontrada");
      if (existing.status !== "aprovada") throw new Error(`Apenas medições aprovadas podem ter a aprovação cancelada (status: ${existing.status})`);

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

  gerarPdfMedicao: protectedProcedure
    .input(z.object({ medicaoId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!medicao) throw new Error("Medição não encontrada");
      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, medicao.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");
      const [empresa] = await db.select().from(empresasTerceiras).where(eq(empresasTerceiras.id, contrato.empresaTerceiraId));
      const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
      let obraNome = "";
      if (contrato.obraId) {
        const [obra] = await db.select().from(obras).where(eq(obras.id, contrato.obraId));
        if (obra) obraNome = obra.nome;
      }
      const itensMedicao = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.medicaoId));
      const itensContrato = await db.select().from(terceiroContratoItens).where(eq(terceiroContratoItens.contratoId, contrato.id)).orderBy(asc(terceiroContratoItens.ordem));

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
          percAcumulado: n(im.percentualAvancoFisico),
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
      const valorLiquido = totalValorPeriodo - totalRetencoes - descontos;

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
        return null;
      }

      return new Promise<{ base64: string; filename: string }>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
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

        const headerH = 75;
        doc.rect(0, 0, doc.page.width, headerH).fill(primary);

        const logoSrc = resolveLogoSource((company as any)?.logoUrl);
        let logoRendered = false;
        const logoSize = 55;
        if (logoSrc) {
          try { doc.image(logoSrc, mL, 10, { fit: [logoSize, logoSize] }); logoRendered = true; } catch { logoRendered = false; }
        }

        const nameX = logoRendered ? mL + logoSize + 12 : mL + 10;
        doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff")
          .text(company?.name || "FC Engenharia", nameX, 16);
        doc.font("Helvetica").fontSize(8).fillColor("#ccd6e0")
          .text(company?.cnpj ? `CNPJ: ${company.cnpj}` : "", nameX, 34);
        doc.font("Helvetica").fontSize(7).fillColor("#ccd6e0")
          .text(`BOLETIM DE MEDIÇÃO`, nameX, 47);

        const numBox = `Nº ${String(medicao.numero || 1).padStart(2, "0")}`;
        doc.roundedRect(doc.page.width - mR - 80, 15, 80, 45, 4).fill("#ffffff");
        doc.font("Helvetica").fontSize(7).fillColor(primary).text("MEDIÇÃO", doc.page.width - mR - 75, 22, { width: 70, align: "center" });
        doc.font("Helvetica-Bold").fontSize(16).fillColor(primary).text(numBox, doc.page.width - mR - 75, 35, { width: 70, align: "center" });

        let y = headerH + 15;

        doc.fontSize(8).font("Helvetica").fillColor("#333");
        const col1 = mL, col2 = 310;
        const infoLine = (label: string, value: string, x: number, yy: number) => {
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#666").text(label, x, yy);
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#1a1a2e").text(value, x, yy + 10, { width: 240 });
        };

        infoLine("CONTRATO", contrato.descricao || `#${contrato.id}`, col1, y);
        infoLine("PERÍODO", medicao.periodo || "-", col2, y);
        y += 28;
        infoLine("TERCEIRO", empresa?.razaoSocial || empresa?.nomeFantasia || "-", col1, y);
        infoLine("CNPJ TERCEIRO", empresa?.cnpj || "-", col2, y);
        y += 28;
        infoLine("OBRA", obraNome || "-", col1, y);
        const statusLabels: Record<string, string> = { rascunho: "Rascunho", aguardando_aprovacao: "Aguard. Aprovação", aprovada: "Aprovada", paga: "Paga", rejeitada: "Rejeitada" };
        infoLine("STATUS", statusLabels[medicao.status || "rascunho"] || medicao.status || "-", col2, y);
        y += 28;
        if ((medicao as any).dataInicio || (medicao as any).dataFim) {
          infoLine("DATA INÍCIO", (medicao as any).dataInicio || "-", col1, y);
          infoLine("DATA FIM", (medicao as any).dataFim || "-", col2, y);
          y += 28;
        }
        infoLine("VALOR DO CONTRATO", BRL(n(contrato.valorTotal)), col1, y);
        y += 28;

        doc.strokeColor("#dde3ea").lineWidth(0.5).moveTo(mL, y).lineTo(mL + pageW, y).stroke();
        y += 10;

        const cols = [
          { label: "EAP", width: 45, align: "left" as const },
          { label: "Atividade", width: 130, align: "left" as const },
          { label: "Unid.", width: 30, align: "center" as const },
          { label: "Qtd.", width: 45, align: "right" as const },
          { label: "V.Unit.", width: 55, align: "right" as const },
          { label: "V.Total", width: 55, align: "right" as const },
          { label: "Ant.%", width: 35, align: "right" as const },
          { label: "Per.%", width: 35, align: "right" as const },
          { label: "Acum.%", width: 35, align: "right" as const },
          { label: "V.Período", width: 55, align: "right" as const },
        ];

        const drawTableHeader = (yPos: number) => {
          let xOff = mL;
          doc.rect(mL, yPos, pageW, 16).fill(primary);
          doc.fillColor("#fff").fontSize(6.5).font("Helvetica-Bold");
          for (const c of cols) {
            const tx = c.align === "right" ? xOff + c.width - 3 : c.align === "center" ? xOff + c.width / 2 : xOff + 3;
            doc.text(c.label, tx, yPos + 4, { width: c.width, align: c.align });
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
                if (y > 750) { doc.addPage(); y = 40; y = drawTableHeader(y); }
                const isTop = depth === 1;
                const bgColor = isTop ? "#e8edf4" : "#f3f5f8";
                doc.rect(mL, y, pageW, 14).fill(bgColor);
                if (isTop) doc.rect(mL, y, 3, 14).fill("#d4a017");
                doc.fillColor(primary).font("Helvetica-Bold").fontSize(7);
                doc.text(parentEap, mL + 5, y + 3);
                const indent = 5 + (depth - 1) * 10;
                const nome = hierMap.get(parentEap) || `Nível ${parentEap}`;
                doc.text(`▸ ${nome}`, mL + 45 + indent, y + 3, { width: pageW - 50 - indent });
                y += 14;
                rowIdx = 0;
              }
            }
          }

          if (y > 750) { doc.addPage(); y = 40; y = drawTableHeader(y); }
          if (rowIdx % 2 === 0) doc.rect(mL, y, pageW, 13).fill("#fafbfc");
          doc.fillColor("#333").font("Helvetica").fontSize(6.5);
          let xOff = mL;
          const indent = eap ? Math.max(0, (eap.split(".").length - 1) * 6) : 0;
          const vals = [
            { v: eap || "-", a: "left" as const },
            { v: item.descricao.substring(0, 28), a: "left" as const },
            { v: item.unidade, a: "center" as const },
            { v: item.quantidade.toFixed(2), a: "right" as const },
            { v: BRL(item.valorUnitario), a: "right" as const },
            { v: BRL(item.valorTotal), a: "right" as const },
            { v: PCT(item.percAnterior), a: "right" as const },
            { v: PCT(item.percPeriodo), a: "right" as const },
            { v: PCT(item.percAcumulado), a: "right" as const },
            { v: BRL(item.valorPeriodo), a: "right" as const },
          ];
          for (let ci = 0; ci < cols.length; ci++) {
            const c = cols[ci];
            const cellX = ci === 1 ? xOff + indent : xOff;
            const cellW = ci === 1 ? c.width - indent : c.width;
            const tx = c.align === "right" ? cellX + cellW - 3 : c.align === "center" ? cellX + cellW / 2 : cellX + 3;
            doc.text(vals[ci].v, tx, y + 3, { width: cellW, align: vals[ci].a });
            xOff += c.width;
          }
          doc.strokeColor("#e5e7eb").lineWidth(0.3).moveTo(mL, y + 13).lineTo(mL + pageW, y + 13).stroke();
          y += 13;
          rowIdx++;
        }

        if (y > 750) { doc.addPage(); y = 40; }
        doc.rect(mL, y, pageW, 16).fill("#e2e8f0");
        doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(7);
        doc.text("TOTAL", mL + 5, y + 4);
        let totX = mL;
        for (let i = 0; i < 5; i++) totX += cols[i].width;
        doc.text(BRL(totalValorContrato), totX - 3, y + 4, { width: cols[5].width, align: "right" });
        let vPerX = totX + cols[5].width + cols[6].width + cols[7].width + cols[8].width;
        doc.text(BRL(totalValorPeriodo), vPerX - 3, y + 4, { width: cols[9].width, align: "right" });
        y += 24;

        if (totalRetencoes > 0 || descontos > 0) {
          if (y > 700) { doc.addPage(); y = 40; }
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
          doc.font("Helvetica-Bold").text(`Total Retenções: ${BRL(totalRetencoes)}`, mL, y); y += 13;
          if (retTecnica > 0) { doc.font("Helvetica").fontSize(7).fillColor("#666").text(`* Retenção Técnica: valor retido e liberado somente após a última medição do contrato. Acumulado: ${BRL(retTecnicaAcumulada)}`, mL, y); y += 13; }
          if ((medicao as any).observacoesRetencao) { doc.font("Helvetica").fontSize(7).text(`Obs.: ${(medicao as any).observacoesRetencao}`, mL, y); y += 13; }
          y += 8;
        }

        if (y > 700) { doc.addPage(); y = 40; }
        doc.roundedRect(mL, y, pageW, 55, 4).lineWidth(1.2).stroke(primary);
        doc.font("Helvetica-Bold").fontSize(9).fillColor(primary).text("RESUMO FINANCEIRO", mL + 12, y + 8);
        doc.fontSize(8).font("Helvetica").fillColor("#333");
        const summCol = (pageW - 24) / 3;
        doc.text(`Valor Bruto Período:`, mL + 12, y + 22);
        doc.font("Helvetica-Bold").text(BRL(totalValorPeriodo), mL + 12, y + 32);
        doc.font("Helvetica").text(`Retenções:`, mL + 12 + summCol, y + 22);
        doc.font("Helvetica-Bold").text(BRL(totalRetencoes), mL + 12 + summCol, y + 32);
        doc.font("Helvetica").text(`Descontos:`, mL + 12 + summCol * 2, y + 22);
        doc.font("Helvetica-Bold").text(BRL(descontos), mL + 12 + summCol * 2, y + 32);
        doc.font("Helvetica-Bold").fontSize(11).fillColor(primary);
        doc.text(`Valor Líquido: ${BRL(valorLiquido)}`, mL + 12, y + 45);
        y += 65;

        if (y > 690) { doc.addPage(); y = 40; }
        y += 35;
        const sigW = 180;
        doc.strokeColor("#888").lineWidth(0.5);
        doc.moveTo(mL + 30, y).lineTo(mL + 30 + sigW, y).stroke();
        doc.moveTo(mL + pageW - 30 - sigW, y).lineTo(mL + pageW - 30, y).stroke();
        doc.fontSize(7).font("Helvetica").fillColor("#666");
        doc.text("Contratante", mL + 30, y + 5, { width: sigW, align: "center" });
        doc.text("Contratada", mL + pageW - 30 - sigW, y + 5, { width: sigW, align: "center" });

        doc.end();
      });
    }),

  excluirMedicao: protectedProcedure
    .input(z.object({ id: z.number(), contratoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(
        and(eq(terceiroMedicoes.id, input.id), eq(terceiroMedicoes.companyId, input.companyId))
      );
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "paga") throw new Error("Não é possível excluir uma medição já paga");

      if (medicao.status === "aprovada") {
        const itensMedicao = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
        for (const im of itensMedicao) {
          const prevAcum = n(im.percentualAvancoFisico);
          const prevValAcum = n(im.valorAcumulado);
          const [contratoItem] = await db.select().from(terceiroContratoItens).where(eq(terceiroContratoItens.id, im.contratoItemId));
          if (contratoItem) {
            const novoPerc = Math.max(0, n(contratoItem.percentualMedidoAcumulado) - prevAcum);
            const novoVal = Math.max(0, n(contratoItem.valorMedidoAcumulado) - prevValAcum);
            await db.update(terceiroContratoItens).set({
              percentualMedidoAcumulado: String(novoPerc),
              valorMedidoAcumulado: String(novoVal),
            }).where(eq(terceiroContratoItens.id, im.contratoItemId));
          }
        }
      }

      await db.delete(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, input.id));
      await db.delete(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.id));
      return { ok: true };
    }),

  recalcularMedicao: protectedProcedure
    .input(z.object({ medicaoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(
        and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId))
      );
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "aprovada" || medicao.status === "paga") throw new Error("Não é possível recalcular uma medição já aprovada/paga");

      const [contrato] = await db.select().from(terceiroContratos).where(eq(terceiroContratos.id, medicao.contratoId));
      if (!contrato) throw new Error("Contrato não encontrado");

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

      let valorMedidoPeriodo = 0;
      const itensResultado: { descricao: string; eapCodigo: string | null; vinculado: boolean; percentual: number }[] = [];
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
        const percentualPeriodo = Math.max(0, percentualFisico - percentualAnterior);
        const valorPeriodo = (percentualPeriodo / 100) * n(itemContrato.valorTotal);
        const valorAcumuladoItem = (percentualFisico / 100) * n(itemContrato.valorTotal);
        valorMedidoPeriodo += valorPeriodo;
        itensResultado.push({
          descricao: itemContrato.descricao,
          eapCodigo: (itemContrato as any).eapCodigo || null,
          vinculado: !!atividadeId,
          percentual: percentualFisico,
        });

        await db.update(terceiroMedicaoItens).set({
          percentualAvancoFisico: String(percentualFisico),
          percentualAcumuladoAnterior: String(percentualAnterior),
          percentualMedidoPeriodo: String(percentualPeriodo),
          percentualFisicoReal: String(percentualFisico),
          editadoManualmente: false,
          valorMedidoPeriodo: String(valorPeriodo),
          valorAcumulado: String(valorAcumuladoItem),
        } as any).where(eq(terceiroMedicaoItens.id, itemMed.id));
      }

      for (const itemMed of itensMedicao) {
        const itemContrato = itensContrato.find(ic => ic.id === itemMed.contratoItemId);
        if (!itemContrato) continue;
        const anterior = percAcumAnteriorPorItem[itemContrato.id] || 0;
        const [recalcItem] = await db.select({ percentualMedidoPeriodo: terceiroMedicaoItens.percentualMedidoPeriodo })
          .from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.id, itemMed.id));
        const novoAcum = anterior + n(recalcItem?.percentualMedidoPeriodo);
        const valorAcumItem = (novoAcum / 100) * n(itemContrato.valorTotal);
        await db.update(terceiroContratoItens).set({
          percentualMedidoAcumulado: String(novoAcum),
          valorMedidoAcumulado: String(valorAcumItem),
        } as any).where(eq(terceiroContratoItens.id, itemContrato.id));
      }

      const valorAcumuladoAnterior = outrasMedicoes
        .filter(m => m.status === "aprovada" || m.status === "paga")
        .reduce((s, m) => s + n(m.valorMedido), 0);
      const valorAcumulado = valorAcumuladoAnterior + valorMedidoPeriodo;
      const percentualGlobal = n(contrato.valorTotal) > 0 ? (valorAcumulado / n(contrato.valorTotal)) * 100 : 0;

      await db.update(terceiroMedicoes).set({
        valorMedido: String(valorMedidoPeriodo),
        valorAcumulado: String(valorAcumulado),
        percentualGlobal: String(percentualGlobal),
        alertaDivergencia: null,
      } as any).where(eq(terceiroMedicoes.id, input.medicaoId));

      const vinculados = itensResultado.filter(i => i.vinculado).length;
      const naoVinculados = itensResultado.filter(i => !i.vinculado).length;
      return { ok: true, valorMedido: valorMedidoPeriodo, percentualGlobal, itens: itensResultado, vinculados, naoVinculados, totalEaps: Object.keys(eapToAtividadeId).length, totalAvancos: Object.keys(avancoMap).length };
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
      percentualMedidoPeriodo: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(and(eq(terceiroMedicoes.id, input.medicaoId), eq(terceiroMedicoes.companyId, input.companyId)));
      if (!medicao) throw new Error("Medição não encontrada");
      if (medicao.status === "paga") throw new Error("Não é possível editar itens de uma medição já paga");

      const [item] = await db.select().from(terceiroMedicaoItens).where(and(eq(terceiroMedicaoItens.id, input.medicaoItemId), eq(terceiroMedicaoItens.medicaoId, input.medicaoId)));
      if (!item) throw new Error("Item da medição não encontrado");

      const [contratoItem] = await db.select().from(terceiroContratoItens).where(and(eq(terceiroContratoItens.id, item.contratoItemId), eq(terceiroContratoItens.companyId, input.companyId)));
      if (!contratoItem) throw new Error("Item do contrato não encontrado");

      const percentualAnterior = n(item.percentualAcumuladoAnterior);
      const novoPercentualPeriodo = Math.max(0, Math.min(100 - percentualAnterior, input.percentualMedidoPeriodo));
      const novoPercentualFisico = percentualAnterior + novoPercentualPeriodo;
      const novoValorPeriodo = (novoPercentualPeriodo / 100) * n(contratoItem.valorTotal);
      const novoValorAcumulado = (novoPercentualFisico / 100) * n(contratoItem.valorTotal);

      const percentualFisicoRealAntes = n(item.percentualFisicoReal ?? item.percentualAvancoFisico);
      const fisicoRealPeriodo = Math.max(0, percentualFisicoRealAntes - percentualAnterior);
      const editadoManualmente = Math.abs(novoPercentualPeriodo - fisicoRealPeriodo) > 0.01;

      await db.update(terceiroMedicaoItens).set({
        percentualMedidoPeriodo: String(novoPercentualPeriodo),
        percentualAvancoFisico: String(novoPercentualFisico),
        valorMedidoPeriodo: String(novoValorPeriodo),
        valorAcumulado: String(novoValorAcumulado),
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
    .input(z.object({ medicaoItemId: z.number(), medicaoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [medicao] = await db.select().from(terceiroMedicoes).where(eq(terceiroMedicoes.id, input.medicaoId));
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
            percentualAcumulado: n(item.percentualAvancoFisico),
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
      const [contrato] = await db.insert(terceiroContratos).values({
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
        }).from(comprasCotacaoRespostas).where(
          and(eq(comprasCotacaoRespostas.cotacaoId, input.cotacaoId), eq(comprasCotacaoRespostas.fornecedorId, cot.fornecedorId!))
        );
        const respostaMap: Record<number, { precoUnitario: number; total: number; quantidade: number | null }> = {};
        for (const r of respostas) {
          respostaMap[r.itemId] = {
            precoUnitario: parseFloat(String(r.precoUnitario || "0")),
            total: parseFloat(String(r.total || "0")),
            quantidade: r.quantidade ? parseFloat(String(r.quantidade)) : null,
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
