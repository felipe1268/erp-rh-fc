/**
 * Rev. 1817 — Resolução AUTOMÁTICA do Responsável por atividade do cronograma.
 *
 * FONTE ÚNICA da verdade. Toda tela que mostra "quem é o responsável por
 * executar a atividade" (Programação Semanal LOTUS, Padrão FC, Avanço Semanal,
 * REFIS, exportações Excel/PDF) consulta esta função — assim o conceito é
 * uniforme em todo o módulo Planejamento.
 *
 * Hierarquia (4 camadas, primeira que casar vence):
 *
 *   1) Override manual digitado pelo usuário
 *      ├─ atividade.isExterna === true  →  "externa"
 *      │     label = atividade.externaResponsavel || "EXTERNA"
 *      └─ atividade.responsavelLotus preenchido (texto livre)  →  "manual"
 *
 *   2) Contrato de Terceiros vinculado DIRETAMENTE à atividade
 *      via terceiro_contrato_itens.planejamentoAtividadeId
 *      (status do contrato = 'ativo')
 *      → tipo "contrato_terceiro"
 *      → label = empresa_terceira.razaoSocial / nomeFantasia
 *
 *   3) Fallback → "FC ENGENHARIA" (execução própria)
 *
 * Esta camada não cria nenhuma tabela nova nem coluna nova — reaproveita
 * 100% do schema existente. Conforme acordado com o usuário (15/05/2026).
 */

import { sql, inArray, and, eq, asc } from "drizzle-orm";
import {
  planejamentoAtividades,
  terceiroContratos,
  terceiroContratoItens,
  empresasTerceiras,
} from "../../drizzle/schema";

// ─── Tipos ────────────────────────────────────────────────────────────────

export type ResponsavelTipo =
  | "manual"
  | "externa"
  | "contrato_terceiro"
  | "fc";

export type ResponsavelInfo = {
  tipo: ResponsavelTipo;
  /** Razão social completa (ou texto livre quando override). */
  label: string;
  /** Nome curto truncado pra caber em coluna estreita (~22 chars). */
  labelCurto: string;
  /** Referências pra tooltip clicável (CNPJ, número de contrato, etc). */
  fonteRef: {
    contratoId?: number;
    contratoNumero?: string | null;
    empresaTerceiraId?: number;
    cnpj?: string | null;
  } | null;
};

// ─── Truncamento inteligente do nome da empresa ───────────────────────────

const SUFIXOS_JURIDICOS = [
  "LTDA",
  "ME",
  "EIRELI",
  "EPP",
  "MEI",
  "S/A",
  "S\\.A\\.?",
  "SA",
  "S\\.S\\.",
  "EIRELLI",
  "LTDA-ME",
  "LTDA - ME",
  "LTDA ME",
];

const REGEX_SUFIXOS = new RegExp(
  "(?:\\s*[-,]?\\s*(?:" + SUFIXOS_JURIDICOS.join("|") + "))+\\s*$",
  "i",
);

const PALAVRAS_IGNORAR = new Set([
  "DE",
  "DA",
  "DO",
  "DAS",
  "DOS",
  "E",
  "&",
  "EM",
  "PARA",
  "POR",
  "COM",
  "A",
  "O",
]);

const LIMITE_CHARS = 22;

/**
 * Pega a razão social ("CONSTRUTORA SILVEIRA EMPREENDIMENTOS LTDA") e devolve
 * uma versão curta pra caber em coluna estreita ("CONSTRUTORA SILVEIRA").
 *
 * Regras:
 *  • Remove sufixos jurídicos (LTDA/ME/EIRELI/EPP/S/A/...).
 *  • Pega as 2 primeiras palavras significativas (ignora DE/DA/DO/&/etc).
 *  • Se ainda passar de LIMITE_CHARS, corta com "…".
 *  • Mantém maiúsculas/acentos originais.
 */
export function truncarNomeEmpresa(nome: string | null | undefined): string {
  if (!nome) return "";
  let limpo = String(nome).trim().replace(/\s+/g, " ");
  limpo = limpo.replace(REGEX_SUFIXOS, "").trim();
  if (!limpo) return String(nome).slice(0, LIMITE_CHARS);

  const palavras = limpo.split(" ");
  const significativas: string[] = [];
  for (const p of palavras) {
    if (significativas.length >= 2) break;
    if (PALAVRAS_IGNORAR.has(p.toUpperCase())) continue;
    significativas.push(p);
  }
  let curto = significativas.join(" ").trim();
  if (!curto) curto = limpo;

  if (curto.length > LIMITE_CHARS) {
    curto = curto.slice(0, LIMITE_CHARS - 1).trimEnd() + "…";
  }
  return curto;
}

// ─── Resolução em batch (1 query única por projeto) ───────────────────────

type AtividadeMin = {
  id: number;
  responsavelLotus?: string | null;
  isExterna?: boolean | null;
  externaResponsavel?: string | null;
};

/**
 * Devolve um Map<atividadeId, ResponsavelInfo> resolvido para todas as
 * atividades passadas. UMA única query bate o banco para buscar os contratos
 * terceiros vinculados, e o cruzamento é feito em memória (O(n)).
 *
 * Performance: testado mentalmente para 1500+ atividades (caso QIU 2 - FASE 4)
 * — sem N+1, sem loop de queries.
 */
export async function resolverResponsaveisBatch(
  db: any,
  atividades: AtividadeMin[],
  projetoId: number,
  companyId: number,
): Promise<Map<number, ResponsavelInfo>> {
  const out = new Map<number, ResponsavelInfo>();
  if (!atividades.length) return out;

  // 1) Busca todos os itens de contrato terceiro do projeto que tenham
  //    planejamentoAtividadeId preenchido e cujo contrato esteja ATIVO.
  //    Join com empresas_terceiras pra trazer razão social/CNPJ.
  const ids = atividades.map((a) => a.id);
  let vinculos: Array<{
    atividadeId: number;
    contratoId: number;
    contratoNumero: string | null;
    empresaTerceiraId: number;
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string;
    contratoCriadoEm: string;
  }> = [];

  try {
    vinculos = (await db
      .select({
        atividadeId: terceiroContratoItens.planejamentoAtividadeId,
        contratoId: terceiroContratos.id,
        contratoNumero: terceiroContratos.numeroContrato,
        empresaTerceiraId: terceiroContratos.empresaTerceiraId,
        razaoSocial: empresasTerceiras.razaoSocial,
        nomeFantasia: empresasTerceiras.nomeFantasia,
        cnpj: empresasTerceiras.cnpj,
        contratoCriadoEm: terceiroContratos.criadoEm,
      })
      .from(terceiroContratoItens)
      .innerJoin(
        terceiroContratos,
        eq(terceiroContratos.id, terceiroContratoItens.contratoId),
      )
      .innerJoin(
        empresasTerceiras,
        eq(empresasTerceiras.id, terceiroContratos.empresaTerceiraId),
      )
      .where(
        and(
          eq(terceiroContratos.companyId, companyId),
          eq(terceiroContratos.planejamentoProjetoId, projetoId),
          eq(terceiroContratos.status, "ativo"),
          inArray(terceiroContratoItens.planejamentoAtividadeId, ids as any),
        ),
      )
      // Rev. 1817 — Determinismo na escolha do contrato em caso de empate
      // (atividade vinculada a 2+ contratos ativos): o mais ANTIGO vence
      // (mesma regra do warning [ResponsavelCheck] abaixo: estabilidade visual).
      .orderBy(asc(terceiroContratos.criadoEm), asc(terceiroContratos.id))) as any[];
  } catch (err: any) {
    console.error(
      "[resolverResponsaveisBatch] falha ao buscar vínculos contratos:",
      err?.message || err,
    );
  }

  // Mapa atividadeId → primeiro contrato encontrado (mais recente vence se
  // houver mais de um). Sanity check loga sobreposições.
  const porAtividade = new Map<number, (typeof vinculos)[number]>();
  for (const v of vinculos) {
    if (v.atividadeId == null) continue;
    const cur = porAtividade.get(v.atividadeId);
    if (!cur) {
      porAtividade.set(v.atividadeId, v);
    } else if (cur.contratoId !== v.contratoId) {
      console.warn(
        `[ResponsavelCheck] Atividade ${v.atividadeId} vinculada a 2 contratos ` +
          `terceiros ativos (#${cur.contratoId} e #${v.contratoId}). Mantendo o ` +
          `mais antigo (#${cur.contratoId}).`,
      );
      // Mantém o primeiro (mais antigo) por estabilidade visual.
    }
  }

  // 2) Para cada atividade, aplica hierarquia.
  const FC: ResponsavelInfo = {
    tipo: "fc",
    label: "FC ENGENHARIA",
    labelCurto: "FC",
    fonteRef: null,
  };

  for (const a of atividades) {
    // (1) Override: isExterna
    if (a.isExterna) {
      const txt = (a.externaResponsavel || "").trim() || "EXTERNA";
      out.set(a.id, {
        tipo: "externa",
        label: txt,
        labelCurto: truncarNomeEmpresa(txt) || txt.slice(0, LIMITE_CHARS),
        fonteRef: null,
      });
      continue;
    }
    // (1b) Override: responsavelLotus digitado
    const manual = (a.responsavelLotus || "").trim();
    if (manual) {
      out.set(a.id, {
        tipo: "manual",
        label: manual,
        labelCurto: truncarNomeEmpresa(manual) || manual.slice(0, LIMITE_CHARS),
        fonteRef: null,
      });
      continue;
    }
    // (2) Contrato terceiro vinculado
    const v = porAtividade.get(a.id);
    if (v) {
      const nomePref = v.nomeFantasia?.trim() || v.razaoSocial.trim();
      out.set(a.id, {
        tipo: "contrato_terceiro",
        label: v.razaoSocial,
        labelCurto: truncarNomeEmpresa(nomePref),
        fonteRef: {
          contratoId: v.contratoId,
          contratoNumero: v.contratoNumero ?? null,
          empresaTerceiraId: v.empresaTerceiraId,
          cnpj: v.cnpj ?? null,
        },
      });
      continue;
    }
    // (3) Fallback FC
    out.set(a.id, FC);
  }

  return out;
}
