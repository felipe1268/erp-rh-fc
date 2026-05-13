import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import {
  ddsTemas, ddsSessoes, ddsSessaoFuncionarios,
  employees, obras, accidents, obraFuncionarios,
} from "../../drizzle/schema";
import { eq, and, sql, desc, isNull, inArray, notInArray, gte, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function assertCompanyAccess(ctx: any, companyId: number) {
  if (ctx.user?.companyId && String(ctx.user.companyId) !== String(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a esta empresa" });
  }
}

// Rev. 1735 — Expande obraIds para incluir TODAS as obras da empresa que compartilham
// o mesmo nome canônico (trim+UPPER). Mesma regra do `getEfetivoPorObra` (server/db.ts L2336)
// e do cadastro > aba "Efetivo por Obra". Resolve o caso de obras duplicadas com IDs diferentes
// (ex.: REVTE-CIVIL aparece em listActive com 1 ID, mas o efetivo está vinculado a outro ID).
async function expandObraIdsByCanonicalName(
  db: any, companyId: number, obraIdsInput: number[]
): Promise<number[]> {
  if (obraIdsInput.length === 0) return [];
  // 1. Pega os nomes canônicos das obras informadas (validando ownership)
  const seedRows = await db.select({ id: obras.id, nome: obras.nome }).from(obras)
    .where(and(inArray(obras.id, obraIdsInput), eq(obras.companyId, companyId)));
  if (seedRows.length !== obraIdsInput.length) {
    console.error("[DDS expand] Ownership mismatch", { companyId, obraIdsInput, seedFound: seedRows.map((r:any)=>r.id) });
    throw new TRPCError({ code: "FORBIDDEN", message: `Obra(s) não pertence(m) à empresa ${companyId}. Inputs=${JSON.stringify(obraIdsInput)} encontrados=${JSON.stringify(seedRows.map((r:any)=>r.id))}` });
  }
  const canonicalNames = Array.from(new Set(
    seedRows.map((r: any) => (r.nome || "").trim().toUpperCase()).filter(Boolean)
  ));
  if (canonicalNames.length === 0) return obraIdsInput;
  // 2. Busca TODAS as obras da empresa (não-deletadas) e filtra por nome canônico
  const allCompanyObras = await db.select({ id: obras.id, nome: obras.nome }).from(obras)
    .where(and(eq(obras.companyId, companyId), isNull(obras.deletedAt)));
  const expanded = new Set<number>(obraIdsInput);
  for (const o of allCompanyObras) {
    const k = (o.nome || "").trim().toUpperCase();
    if (canonicalNames.includes(k)) expanded.add(o.id);
  }
  return Array.from(expanded);
}

// Rev. 1726 — Calendário oficial de campanhas governamentais brasileiras
// (gov.br + portal Saúde). Usado pra semear ddsTemas categoria=CAMPANHA.
const CAMPANHAS_GOV: Array<{
  mes: number; codigo: string; titulo: string; cor: string;
  descricao: string; norma: string;
}> = [
  { mes: 1, codigo: "JANEIRO-BRANCO", titulo: "Janeiro Branco — Saúde Mental", cor: "branco",
    descricao: "Conscientização sobre saúde mental, prevenção de transtornos psicológicos e cuidado emocional no trabalho.",
    norma: "Lei 14.556/2023 — Política Nacional de Saúde Mental" },
  { mes: 2, codigo: "FEVEREIRO-LARANJA", titulo: "Fevereiro Laranja — Combate à Leucemia", cor: "laranja",
    descricao: "Conscientização sobre leucemia, doação de medula óssea e diagnóstico precoce.",
    norma: "Lei 11.584/2007 — Cadastro Nacional de Doadores" },
  { mes: 3, codigo: "MARCO-LILAS", titulo: "Março Lilás — Câncer de Colo do Útero", cor: "lilas",
    descricao: "Prevenção do câncer de colo do útero, importância do exame papanicolau e vacinação contra HPV.",
    norma: "Portaria MS 874/2013 — Política Nacional para Prevenção e Controle do Câncer" },
  { mes: 4, codigo: "ABRIL-VERDE", titulo: "Abril Verde — Saúde e Segurança no Trabalho", cor: "verde",
    descricao: "Mês mundial da SST. Foco em prevenção de acidentes, doenças ocupacionais e cultura de segurança. 28/04 — Dia Mundial em Memória às Vítimas de Acidentes de Trabalho.",
    norma: "OIT C155 + NR-1 (Disposições Gerais) + Lei 11.121/2005" },
  { mes: 5, codigo: "MAIO-AMARELO", titulo: "Maio Amarelo — Trânsito Seguro", cor: "amarelo",
    descricao: "Movimento mundial pela segurança no trânsito. Direção defensiva, uso de cinto de segurança, álcool zero ao volante.",
    norma: "Lei 9.503/97 — Código de Trânsito Brasileiro + Resolução CONTRAN 277/2008" },
  { mes: 6, codigo: "JUNHO-VERMELHO", titulo: "Junho Vermelho — Doação de Sangue", cor: "vermelho",
    descricao: "Estímulo à doação de sangue. 14/06 — Dia Mundial do Doador. Campanha 'Junho Verde' (meio ambiente, 05/06) também é tradicional no setor de construção.",
    norma: "Lei 13.297/2016 + Lei 6.938/81 (Política Nacional do Meio Ambiente)" },
  { mes: 7, codigo: "JULHO-AMARELO", titulo: "Julho Amarelo — Hepatites Virais", cor: "amarelo",
    descricao: "Conscientização sobre hepatites A, B e C. Importância da vacinação e testes rápidos.",
    norma: "Lei 13.802/2019 — Mês Nacional de Prevenção e Combate às Hepatites Virais" },
  { mes: 8, codigo: "AGOSTO-LILAS", titulo: "Agosto Lilás — Combate à Violência contra a Mulher", cor: "lilas",
    descricao: "Campanha contra violência doméstica e familiar. Lei Maria da Penha. Canais de denúncia (Disque 180).",
    norma: "Lei 11.340/2006 (Maria da Penha) + Lei 13.772/2018" },
  { mes: 9, codigo: "SETEMBRO-AMARELO", titulo: "Setembro Amarelo — Prevenção ao Suicídio", cor: "amarelo",
    descricao: "Conscientização e prevenção do suicídio. CVV (Centro de Valorização da Vida) — 188. Apoio emocional no trabalho.",
    norma: "Lei 13.819/2019 — Política Nacional de Prevenção da Automutilação e do Suicídio" },
  { mes: 10, codigo: "OUTUBRO-ROSA", titulo: "Outubro Rosa — Câncer de Mama", cor: "rosa",
    descricao: "Prevenção do câncer de mama. Importância do autoexame e mamografia anual após os 40 anos.",
    norma: "Lei 11.664/2008 — SUS para diagnóstico/tratamento de câncer de mama e colo do útero" },
  { mes: 11, codigo: "NOVEMBRO-AZUL", titulo: "Novembro Azul — Câncer de Próstata", cor: "azul",
    descricao: "Prevenção do câncer de próstata. Exames preventivos a partir dos 50 anos (45 com histórico familiar).",
    norma: "Lei 13.045/2014 — Política Nacional para Prevenção e Controle do Câncer" },
  { mes: 12, codigo: "DEZEMBRO-VERMELHO", titulo: "Dezembro Vermelho — Combate ao HIV/AIDS", cor: "vermelho",
    descricao: "Prevenção, testagem e tratamento de HIV/AIDS e outras IST. 01/12 — Dia Mundial de Luta contra a AIDS.",
    norma: "Lei 13.504/2017 + Lei 12.984/2014 (criminalização da discriminação)" },
];

// Rev. 1729 — Calendário oficial PNI/MS 2026 (Programa Nacional de Imunizações).
// Fontes: gov.br/saude/pt-br/assuntos/saude-de-a-a-z/c/calendario-nacional-de-vacinacao
//          + portarias do Ministério da Saúde para Influenza/Multivacinação 2026.
// Atende Lei 15.377/2026 (CLT art. 169-A): empregador deve divulgar campanhas
// oficiais de vacinação aos trabalhadores. Categoria='VACINACAO', mesCampanha
// = mês de PICO da campanha (descrição traz janela completa quando multi-mês).
const VACINACAO_PNI: Array<{
  mes: number; codigo: string; titulo: string; cor: string;
  descricao: string; norma: string;
}> = [
  { mes: 3, codigo: "VAC-COVID-19-REFORCO", titulo: "💉 Reforço COVID-19 — Dose Anual", cor: "azul",
    descricao: "Dose de reforço anual contra COVID-19 (vacina bivalente/atualizada). Recomendada a TODOS os trabalhadores conforme protocolo MS — especialmente >60 anos, gestantes, imunossuprimidos e trabalhadores de obra com aglomeração. Janela: rotina anual a partir de março.",
    norma: "PNI/MS — Nota Técnica COVID-19 + Lei 15.377/2026 (CLT art. 169-A)" },
  { mes: 3, codigo: "VAC-HPV-9-14", titulo: "💉 Vacinação HPV — Filhos(as) 9-14 anos", cor: "lilas",
    descricao: "Vacina HPV gratuita no SUS para meninas e meninos de 9 a 14 anos. Esquema: 2 doses (0 e 6 meses). Previne câncer de colo do útero, vulva, ânus, pênis e orofaringe. Comunicar aos colaboradores que tenham filhos nessa faixa.",
    norma: "PNI/MS — Calendário Nacional + Lei 15.377/2026 (CLT art. 169-A — orientação obrigatória sobre HPV)" },
  { mes: 4, codigo: "VAC-INFLUENZA-2026", titulo: "💉 Campanha Nacional Influenza (Gripe) 2026", cor: "amarelo",
    descricao: "Campanha Nacional de Vacinação contra a Influenza 2026 — janela tradicional ABRIL a JUNHO. Grupos prioritários: >60 anos, gestantes, puérperas, crianças 6m-6a, profissionais de saúde, comorbidades, trabalhadores da construção civil expostos. Vacina trivalente disponível em UBS.",
    norma: "Portaria MS — Campanha Nacional Influenza 2026 + Lei 15.377/2026" },
  { mes: 4, codigo: "VAC-TRABALHADOR-NR7", titulo: "💉 Vacinação do Trabalhador (NR-7/PCMSO)", cor: "verde",
    descricao: "Vacinas obrigatórias por exposição ocupacional conforme PCMSO: Hepatite B (3 doses), Tétano/dT (reforço 10 anos), Febre Amarela (áreas endêmicas), Tríplice Viral. Empresa custeia se não disponível no SUS. Documentar no ASO.",
    norma: "NR-07 (PCMSO) item 7.5 + Anexo I + Lei 15.377/2026" },
  { mes: 6, codigo: "VAC-TETANO-DT", titulo: "💉 Tétano/dT — Reforço a cada 10 anos (obras)", cor: "vermelho",
    descricao: "Reforço da vacina dT (dupla adulto — difteria/tétano) a cada 10 anos. CRÍTICO para trabalhadores de construção civil pelo risco constante de ferimentos com pregos, ferragens, terra e materiais cortantes (porta de entrada do tétano).",
    norma: "PNI/MS — Calendário Adulto + NR-18 (Construção) + Lei 15.377/2026" },
  { mes: 7, codigo: "VAC-HEPATITE-B", titulo: "💉 Hepatite B — 3 doses (risco biológico)", cor: "amarelo",
    descricao: "Vacina Hepatite B (esquema 0-1-6 meses) gratuita no SUS para todas as idades. Trabalhadores expostos a sangue/fluidos corporais (acidentes em obra, primeiros socorros) devem completar esquema. Verificar comprovante de imunização anti-HBs.",
    norma: "PNI/MS — Calendário + NR-32 (analogia risco biológico) + Lei 15.377/2026" },
  { mes: 8, codigo: "VAC-MULTIVACINACAO-2026", titulo: "💉 Campanha Multivacinação Crianças/Adolescentes 2026", cor: "laranja",
    descricao: "Campanha Nacional de Multivacinação — janela tradicional AGOSTO a SETEMBRO. Atualização da caderneta de vacinação de crianças <15 anos. Comunicar aos colaboradores que levem filhos à UBS para colocar em dia: BCG, Pólio, Tríplice Viral, HPV, Meningo, etc.",
    norma: "Portaria MS — Multivacinação 2026 + Lei 15.377/2026" },
  { mes: 4, codigo: "VAC-FEBRE-AMARELA", titulo: "💉 Febre Amarela — Áreas de risco e viajantes", cor: "amarelo",
    descricao: "Vacina dose única (após 9 meses de idade). OBRIGATÓRIA para trabalhadores em obras de áreas com recomendação de vacinação (ACRV) e para qualquer pessoa que viaje para essas regiões. Validade: vitalícia (1 dose). Verificar antes de mobilizar equipe para nova obra.",
    norma: "PNI/MS — Mapa ACRV atualizado + RSI/OMS + Lei 15.377/2026" },
];

// NRs mais aplicadas em construção civil (sugestões pro DDS).
const NRS_CONSTRUCAO: Array<{ codigo: string; titulo: string; descricao: string; norma: string; }> = [
  { codigo: "NR-01", titulo: "NR-01 — Disposições Gerais e GRO/PGR", descricao: "Direitos e deveres em SST. Apresentação do PGR. Direito de recusa ao trabalho em risco grave e iminente.", norma: "NR-01 (Portaria MTP 6.730/2020)" },
  { codigo: "NR-06", titulo: "NR-06 — Equipamentos de Proteção Individual (EPI)", descricao: "Tipos de EPI, obrigatoriedade de uso, conservação e CA. Penalidades pelo não uso.", norma: "NR-06 (Portaria SSST 25/2001)" },
  { codigo: "NR-10", titulo: "NR-10 — Segurança em Instalações Elétricas", descricao: "Riscos elétricos, choque, arco voltaico. Bloqueio e etiquetagem (LOTO). Distâncias seguras.", norma: "NR-10 (Portaria MTE 598/2004)" },
  { codigo: "NR-11", titulo: "NR-11 — Movimentação de Materiais", descricao: "Operação segura de empilhadeiras, guindastes, içamento de cargas. Sinalização.", norma: "NR-11 (Portaria 3.214/78)" },
  { codigo: "NR-12", titulo: "NR-12 — Máquinas e Equipamentos", descricao: "Proteções fixas e móveis, dispositivos de segurança, capacitação para operação.", norma: "NR-12 (Portaria MTE 1.893/2013)" },
  { codigo: "NR-17", titulo: "NR-17 — Ergonomia", descricao: "Postura, levantamento de carga, mobiliário, pausas. Prevenção de LER/DORT.", norma: "NR-17 (Portaria 3.751/90)" },
  { codigo: "NR-18", titulo: "NR-18 — Construção Civil", descricao: "Áreas de vivência, escadas, andaimes, plataformas, escavações, demolição.", norma: "NR-18 (Portaria MTP 3.733/2020)" },
  { codigo: "NR-20", titulo: "NR-20 — Inflamáveis e Combustíveis", descricao: "Armazenamento, manuseio e transporte de líquidos e gases inflamáveis. Plano de emergência.", norma: "NR-20 (Portaria MTE 308/2012)" },
  { codigo: "NR-23", titulo: "NR-23 — Proteção Contra Incêndios", descricao: "Saídas de emergência, sinalização, extintores, brigada de incêndio.", norma: "NR-23 (Portaria SIT 221/2011)" },
  { codigo: "NR-24", titulo: "NR-24 — Condições Sanitárias e de Conforto", descricao: "Instalações sanitárias, vestiários, refeitório, água potável.", norma: "NR-24 (Portaria SEPRT 1.066/2019)" },
  { codigo: "NR-26", titulo: "NR-26 — Sinalização de Segurança", descricao: "Cores e símbolos de segurança. Rotulagem de produtos químicos (GHS).", norma: "NR-26 (Portaria MTE 229/2011)" },
  { codigo: "NR-33", titulo: "NR-33 — Espaços Confinados", descricao: "Identificação, permissão de entrada e trabalho (PET), monitoramento atmosférico, resgate.", norma: "NR-33 (Portaria MTE 202/2006)" },
  { codigo: "NR-35", titulo: "NR-35 — Trabalho em Altura", descricao: "Acima de 2m. Análise de risco, sistema de ancoragem, EPI, capacitação 8h + reciclagem 2 anos.", norma: "NR-35 (Portaria MTE 313/2012)" },
];

export const ddsRouter = router({

  // ================= TEMAS / BIBLIOTECA =================

  listTemas: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), categoria: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const conds: any[] = [eq(ddsTemas.companyId, input.companyId), isNull(ddsTemas.deletedAt)];
      if (input.categoria) conds.push(eq(ddsTemas.categoria, input.categoria));
      return db.select().from(ddsTemas).where(and(...conds)).orderBy(ddsTemas.categoria, ddsTemas.titulo);
    }),

  getTema: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.select().from(ddsTemas)
        .where(and(eq(ddsTemas.id, input.id), eq(ddsTemas.companyId, input.companyId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tema não encontrado" });
      return row;
    }),

  criarTema: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      codigo: z.string().max(30).optional(),
      titulo: z.string().min(3).max(255),
      descricao: z.string().optional(),
      conteudoMd: z.string().optional(),
      normaReferencia: z.string().max(120).optional(),
      categoria: z.enum(["NR", "CAMPANHA", "VACINACAO", "LIVRE"]).default("LIVRE"),
      mesCampanha: z.number().int().min(1).max(12).optional(),
      corCampanha: z.string().max(30).optional(),
      duracaoMin: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.insert(ddsTemas).values({
        companyId: input.companyId,
        codigo: input.codigo ?? null,
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        conteudoMd: input.conteudoMd ?? null,
        normaReferencia: input.normaReferencia ?? null,
        categoria: input.categoria,
        mesCampanha: input.mesCampanha ?? null,
        corCampanha: input.corCampanha ?? null,
        duracaoMin: input.duracaoMin ?? 15,
        createdBy: (ctx.user as any)?.id ?? null,
      } as any).returning();
      return row;
    }),

  atualizarTema: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      id: z.number().int().positive(),
      titulo: z.string().min(3).max(255).optional(),
      descricao: z.string().optional(),
      conteudoMd: z.string().optional(),
      normaReferencia: z.string().max(120).optional(),
      categoria: z.enum(["NR", "CAMPANHA", "VACINACAO", "LIVRE"]).optional(),
      mesCampanha: z.number().int().min(1).max(12).nullable().optional(),
      corCampanha: z.string().max(30).optional(),
      duracaoMin: z.number().int().positive().optional(),
      ativo: z.number().int().min(0).max(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const { id, companyId, ...patch } = input;
      const [row] = await db.update(ddsTemas).set({ ...patch, updatedAt: sql`NOW()` } as any)
        .where(and(eq(ddsTemas.id, id), eq(ddsTemas.companyId, companyId)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tema não encontrado" });
      return row;
    }),

  excluirTema: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(ddsTemas).set({ deletedAt: sql`NOW()` } as any)
        .where(and(eq(ddsTemas.id, input.id), eq(ddsTemas.companyId, input.companyId)));
      return { ok: true };
    }),

  // Semeia campanhas governamentais + NRs principais. Idempotente — pula
  // o que já existir (compara por codigo).
  seedTemasPadrao: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const existentes = await db.select({ codigo: ddsTemas.codigo })
        .from(ddsTemas)
        .where(and(eq(ddsTemas.companyId, input.companyId), isNull(ddsTemas.deletedAt)));
      const codigosExistentes = new Set(existentes.map((r: any) => r.codigo).filter(Boolean));
      let inseridos = 0;
      for (const c of CAMPANHAS_GOV) {
        if (codigosExistentes.has(c.codigo)) continue;
        await db.insert(ddsTemas).values({
          companyId: input.companyId,
          codigo: c.codigo,
          titulo: c.titulo,
          descricao: c.descricao,
          normaReferencia: c.norma,
          categoria: "CAMPANHA",
          mesCampanha: c.mes,
          corCampanha: c.cor,
          duracaoMin: 15,
          createdBy: (ctx.user as any)?.id ?? null,
        } as any);
        inseridos++;
      }
      for (const n of NRS_CONSTRUCAO) {
        if (codigosExistentes.has(n.codigo)) continue;
        await db.insert(ddsTemas).values({
          companyId: input.companyId,
          codigo: n.codigo,
          titulo: n.titulo,
          descricao: n.descricao,
          normaReferencia: n.norma,
          categoria: "NR",
          duracaoMin: 15,
          createdBy: (ctx.user as any)?.id ?? null,
        } as any);
        inseridos++;
      }
      return { inseridos };
    }),

  // Rev. 1729 — Semeia campanhas oficiais de vacinação PNI/MS 2026.
  // Atende Lei 15.377/2026 (CLT art. 169-A). Idempotente — pula códigos
  // já existentes. Atualiza CALENDÁRIO ANUAL automaticamente (categoria=VACINACAO).
  seedVacinacaoPNI: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const existentes = await db.select({ codigo: ddsTemas.codigo })
        .from(ddsTemas)
        .where(and(eq(ddsTemas.companyId, input.companyId), isNull(ddsTemas.deletedAt)));
      const codigosExistentes = new Set(existentes.map((r: any) => r.codigo).filter(Boolean));
      let inseridos = 0;
      for (const v of VACINACAO_PNI) {
        if (codigosExistentes.has(v.codigo)) continue;
        await db.insert(ddsTemas).values({
          companyId: input.companyId,
          codigo: v.codigo,
          titulo: v.titulo,
          descricao: v.descricao,
          normaReferencia: v.norma,
          categoria: "VACINACAO",
          mesCampanha: v.mes,
          corCampanha: v.cor,
          duracaoMin: 15,
          createdBy: (ctx.user as any)?.id ?? null,
        } as any);
        inseridos++;
      }
      return { inseridos };
    }),

  // ================= CALENDÁRIO ANUAL =================
  // Retorna estrutura pronta para a aba "Calendário": 12 meses com a
  // campanha governamental do mês + temas (NR/livres) sugeridos.
  calendarioAnual: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const todos = await db.select().from(ddsTemas)
        .where(and(eq(ddsTemas.companyId, input.companyId), isNull(ddsTemas.deletedAt)));
      const meses = [];
      for (let m = 1; m <= 12; m++) {
        const campanhas = todos.filter((t: any) => t.categoria === "CAMPANHA" && t.mesCampanha === m);
        // Rev. 1729 — vacinação PNI/MS (Lei 15.377/2026)
        const vacinacao = todos.filter((t: any) => t.categoria === "VACINACAO" && t.mesCampanha === m);
        const sessoesQtd = await db.select({ c: sql<number>`COUNT(*)` }).from(ddsSessoes)
          .where(and(
            eq(ddsSessoes.companyId, input.companyId),
            isNull(ddsSessoes.deletedAt),
            sql`EXTRACT(MONTH FROM ${ddsSessoes.data}) = ${m}`,
            sql`EXTRACT(YEAR FROM ${ddsSessoes.data}) = EXTRACT(YEAR FROM CURRENT_DATE)`,
          ));
        meses.push({
          mes: m,
          campanhas,
          vacinacao,
          sessoesNoMes: Number(sessoesQtd?.[0]?.c ?? 0),
        });
      }
      const nrs = todos.filter((t: any) => t.categoria === "NR");
      return { meses, nrsTotal: nrs.length };
    }),

  // ================= SESSÕES =================

  listSessoes: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().int().positive().max(500).default(100),
    }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const conds: any[] = [eq(ddsSessoes.companyId, input.companyId), isNull(ddsSessoes.deletedAt)];
      if (input.obraId) conds.push(eq(ddsSessoes.obraId, input.obraId));
      if (input.status) conds.push(eq(ddsSessoes.status, input.status));
      const sessoes = await db.select().from(ddsSessoes)
        .where(and(...conds))
        .orderBy(desc(ddsSessoes.data), desc(ddsSessoes.id))
        .limit(input.limit);
      // contagem de presentes por sessão
      if (sessoes.length === 0) return [];
      const ids = sessoes.map((s: any) => s.id);
      const counts = await db.select({
        sessaoId: ddsSessaoFuncionarios.sessaoId,
        total: sql<number>`COUNT(*)`,
        presentes: sql<number>`SUM(CASE WHEN ${ddsSessaoFuncionarios.presente}=1 THEN 1 ELSE 0 END)`,
        assinados: sql<number>`SUM(CASE WHEN ${ddsSessaoFuncionarios.assinadoEm} IS NOT NULL THEN 1 ELSE 0 END)`,
      }).from(ddsSessaoFuncionarios)
        .where(inArray(ddsSessaoFuncionarios.sessaoId, ids))
        .groupBy(ddsSessaoFuncionarios.sessaoId);
      const byId = new Map(counts.map((c: any) => [c.sessaoId, c]));
      return sessoes.map((s: any) => ({
        ...s,
        totalParticipantes: Number(byId.get(s.id)?.total ?? 0),
        presentes: Number(byId.get(s.id)?.presentes ?? 0),
        assinados: Number(byId.get(s.id)?.assinados ?? 0),
      }));
    }),

  // Rev. 1733 — Lista colaboradores ATIVOS vinculados às obras informadas.
  // Aceita obraId (legado) OU obraIds[] (novo — consolida duplicatas com mesmo nome,
  // alinhado com getEfetivoPorObra/cadastro > aba Efetivo).
  funcionariosDaObra: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraIds: z.array(z.number().int().positive()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        assertCompanyAccess(ctx, input.companyId);
        const db = (await getDb())!;
        const inputIds = (input.obraIds && input.obraIds.length > 0)
          ? input.obraIds
          : (input.obraId ? [input.obraId] : []);
        if (inputIds.length === 0) return [];
        const ids = await expandObraIdsByCanonicalName(db, input.companyId, inputIds);
        const rows = await db.select({
          employeeId: employees.id,
          nome: employees.nomeCompleto,
          cpf: employees.cpf,
          funcao: employees.funcao,
          funcaoNaObra: obraFuncionarios.funcaoNaObra,
          status: employees.status,
        }).from(obraFuncionarios)
          .innerJoin(employees, eq(employees.id, obraFuncionarios.employeeId))
          .where(and(
            eq(obraFuncionarios.companyId, input.companyId),
            inArray(obraFuncionarios.obraId, ids),
            eq(obraFuncionarios.isActive, 1),
            isNull(employees.deletedAt),
          ))
          .orderBy(employees.nomeCompleto);
        console.log("[DDS funcionariosDaObra] rows.length=", rows.length);
        const seen = new Set<number>();
        const dedup = rows.filter((r: any) => {
          if (seen.has(r.employeeId)) return false;
          seen.add(r.employeeId);
          return true;
        });
        return dedup.filter((r: any) => !["Desligado", "Lista_Negra", "ListaNegra"].includes(r.status));
      } catch (e: any) {
        console.error("[DDS funcionariosDaObra] FAIL", { input, msg: e?.message, stack: e?.stack });
        throw e;
      }
    }),

  // Rev. 1731/1733 — Lista colaboradores ativos da empresa que NÃO estão em nenhuma das obras informadas.
  colaboradoresParaTransferir: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraIds: z.array(z.number().int().positive()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const inputIds = (input.obraIds && input.obraIds.length > 0)
        ? input.obraIds
        : (input.obraId ? [input.obraId] : []);
      if (inputIds.length === 0) return [];
      // Rev. 1735 — expande pra TODAS as obras com mesmo nome canônico
      const ids = await expandObraIdsByCanonicalName(db, input.companyId, inputIds);
      // Subquery: ids já vinculados ATIVOS em QUALQUER das obras consolidadas
      const jaNaObra = db.select({ id: obraFuncionarios.employeeId })
        .from(obraFuncionarios)
        .where(and(
          eq(obraFuncionarios.companyId, input.companyId),
          inArray(obraFuncionarios.obraId, ids),
          eq(obraFuncionarios.isActive, 1),
        ));
      const rows = await db.select({
        id: employees.id, nome: employees.nomeCompleto, cpf: employees.cpf,
        funcao: employees.funcao, status: employees.status,
      }).from(employees).where(and(
        eq(employees.companyId, input.companyId),
        isNull(employees.deletedAt),
        notInArray(employees.id, jaNaObra),
        notInArray(employees.status, ["Desligado", "Lista_Negra", "ListaNegra"] as any),
      )).orderBy(employees.nomeCompleto);
      return rows;
    }),

  // Rev. 1731 — Vincula colaborador à obra (cria/reativa registro em obra_funcionarios).
  transferirParaObra: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      // Rev. 1731 fix (architect): valida ownership da obra (id + companyId) antes de qualquer escrita
      const [obraOk] = await db.select({ id: obras.id }).from(obras)
        .where(and(eq(obras.id, input.obraId), eq(obras.companyId, input.companyId))).limit(1);
      if (!obraOk) throw new TRPCError({ code: "FORBIDDEN", message: "Obra não pertence a esta empresa." });
      // Confere se o colaborador é da MESMA empresa
      const [emp] = await db.select({ id: employees.id, status: employees.status })
        .from(employees).where(and(
          eq(employees.id, input.employeeId),
          eq(employees.companyId, input.companyId),
          isNull(employees.deletedAt),
        ));
      if (!emp) throw new TRPCError({ code: "FORBIDDEN", message: "Colaborador não pertence a esta empresa." });
      if (["Desligado", "Lista_Negra", "ListaNegra"].includes(emp.status as any)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Colaborador desligado não pode ser vinculado." });
      }
      // Já existe vínculo (ativo ou inativo)?
      const [exist] = await db.select({ id: obraFuncionarios.id, isActive: obraFuncionarios.isActive })
        .from(obraFuncionarios).where(and(
          eq(obraFuncionarios.companyId, input.companyId),
          eq(obraFuncionarios.obraId, input.obraId),
          eq(obraFuncionarios.employeeId, input.employeeId),
        )).limit(1);
      if (exist) {
        if (exist.isActive === 1) return { ok: true, reativado: false };
        await db.update(obraFuncionarios)
          .set({ isActive: 1, dataFim: null as any })
          .where(eq(obraFuncionarios.id, exist.id));
        return { ok: true, reativado: true };
      }
      const hoje = new Date().toISOString().slice(0, 10);
      await db.insert(obraFuncionarios).values({
        obraId: input.obraId,
        employeeId: input.employeeId,
        companyId: input.companyId,
        dataInicio: hoje,
        isActive: 1,
      } as any);
      return { ok: true, reativado: false };
    }),

  // Rev. 1731 — Acidentes recentes (default últimos 7 dias) que potencialmente exigem DDS de análise (Lei art. 157 CLT, NR-1).
  // Quando obraId é informado, prioriza acidentes daquela obra. D-1 (ontem) recebe flag obrigatorio=true.
  acidentesRecentes: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraIds: z.array(z.number().int().positive()).optional(),
      diasJanela: z.number().int().positive().default(7),
    }))
    .query(async ({ input, ctx }) => {
      try {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      // Rev. 1733/1735 — aceita obraIds[] e expande pra todas as duplicatas com mesmo nome canônico
      const inputObraIds = (input.obraIds && input.obraIds.length > 0)
        ? input.obraIds
        : (input.obraId ? [input.obraId] : []);
      const obraIdsConsolidados = inputObraIds.length > 0
        ? await expandObraIdsByCanonicalName(db, input.companyId, inputObraIds)
        : [];
      // Rev. 1731 fix (architect): D-1 calculado em America/Sao_Paulo (regra legal brasileira) — robusto a TZ do servidor.
      const fmtSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      const agora = new Date();
      const hojeIso = fmtSP(agora);
      const ontemIso = fmtSP(new Date(agora.getTime() - 24 * 60 * 60 * 1000));
      const inicioIso = fmtSP(new Date(agora.getTime() - input.diasJanela * 24 * 60 * 60 * 1000));
      const conds: any[] = [
        eq(accidents.companyId, input.companyId),
        isNull(accidents.deletedAt),
        gte(accidents.dataAcidente, inicioIso),
        lte(accidents.dataAcidente, hojeIso), // sem acidentes no futuro
      ];
      if (obraIdsConsolidados.length > 0) {
        conds.push(or(inArray(accidents.obraId, obraIdsConsolidados), isNull(accidents.obraId)));
      }
      const rows = await db.select({
        id: accidents.id,
        dataAcidente: accidents.dataAcidente,
        horaAcidente: accidents.horaAcidente,
        tipoAcidente: accidents.tipoAcidente,
        gravidade: accidents.gravidade,
        localAcidente: accidents.localAcidente,
        parteCorpoAtingida: accidents.parteCorpoAtingida,
        agenteCausador: accidents.agenteCausador,
        descricao: accidents.descricao,
        acaoCorretiva: accidents.acaoCorretiva,
        diasAfastamento: accidents.diasAfastamento,
        employeeId: accidents.employeeId,
        empNome: employees.nomeCompleto,
        obraId: accidents.obraId,
        obraNome: obras.nome,
      }).from(accidents)
        .leftJoin(employees, eq(employees.id, accidents.employeeId))
        .leftJoin(obras, eq(obras.id, accidents.obraId))
        .where(and(...conds))
        .orderBy(desc(accidents.dataAcidente), desc(accidents.id));
      return rows.map((r: any) => ({
        ...r,
        obrigatorio: r.dataAcidente === ontemIso, // D-1 → DDS obrigatório no dia seguinte
      }));
      } catch (e: any) {
        console.error("[DDS acidentesRecentes] FAIL", { input, msg: e?.message, stack: e?.stack });
        throw e;
      }
    }),

  getSessao: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [s] = await db.select().from(ddsSessoes)
        .where(and(eq(ddsSessoes.id, input.id), eq(ddsSessoes.companyId, input.companyId)));
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });
      const funcs = await db.select().from(ddsSessaoFuncionarios)
        .where(eq(ddsSessaoFuncionarios.sessaoId, input.id))
        .orderBy(ddsSessaoFuncionarios.nome);
      return { ...s, funcionarios: funcs };
    }),

  criarSessao: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      data: z.string().min(10),
      hora: z.string().optional(),
      temaId: z.number().int().positive().optional(),
      tituloTema: z.string().min(3).max(255),
      conteudoMd: z.string().optional(),
      instrutor: z.string().max(255).optional(),
      instrutorCpf: z.string().max(14).optional(),
      local: z.string().max(255).optional(),
      observacoes: z.string().optional(),
      funcionarioIds: z.array(z.number().int().positive()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      let obraNome: string | null = null;
      if (input.obraId) {
        const [o] = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, input.obraId));
        obraNome = o?.nome ?? null;
      }
      const [sessao] = await db.insert(ddsSessoes).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        obraNome,
        data: input.data,
        hora: input.hora ?? null,
        temaId: input.temaId ?? null,
        tituloTema: input.tituloTema,
        conteudoMd: input.conteudoMd ?? null,
        instrutor: input.instrutor ?? null,
        instrutorCpf: input.instrutorCpf ?? null,
        local: input.local ?? null,
        observacoes: input.observacoes ?? null,
        status: "aberta",
        createdBy: (ctx.user as any)?.id ?? null,
      } as any).returning();
      // pré-carrega funcionários se vieram ids
      // Rev. 1730 — hardening de authz: força mesma companyId, exclui soft-deleted
      // e bloqueia status terminais (Desligado/Lista_Negra). Dedupe via Set.
      if (input.funcionarioIds && input.funcionarioIds.length > 0) {
        const idsUnicos = Array.from(new Set(input.funcionarioIds));
        const emps = await db.select({
          id: employees.id, nome: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao,
        }).from(employees).where(and(
          inArray(employees.id, idsUnicos),
          eq(employees.companyId, input.companyId),
          isNull(employees.deletedAt),
          notInArray(employees.status, ["Desligado", "Lista_Negra", "ListaNegra"] as any),
        ));
        if (emps.length > 0) {
          await db.insert(ddsSessaoFuncionarios).values(
            emps.map((e: any) => ({
              sessaoId: sessao.id,
              employeeId: e.id,
              nome: e.nome,
              cpf: e.cpf ?? null,
              funcao: e.funcao ?? null,
              presente: 1,
            } as any))
          );
        }
      }
      return sessao;
    }),

  atualizarSessao: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      id: z.number().int().positive(),
      data: z.string().optional(),
      hora: z.string().optional(),
      tituloTema: z.string().optional(),
      conteudoMd: z.string().optional(),
      instrutor: z.string().optional(),
      instrutorCpf: z.string().optional(),
      local: z.string().optional(),
      observacoes: z.string().optional(),
      status: z.enum(["aberta", "finalizada", "cancelada"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const { id, companyId, ...patch } = input;
      const [row] = await db.update(ddsSessoes)
        .set({ ...patch, updatedAt: sql`NOW()`, ...(patch.status === "finalizada" ? { finalizadaEm: sql`NOW()` } : {}) } as any)
        .where(and(eq(ddsSessoes.id, id), eq(ddsSessoes.companyId, companyId)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });
      return row;
    }),

  excluirSessao: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(ddsSessoes).set({ deletedAt: sql`NOW()` } as any)
        .where(and(eq(ddsSessoes.id, input.id), eq(ddsSessoes.companyId, input.companyId)));
      return { ok: true };
    }),

  // Adiciona / atualiza lista de presença em lote.
  marcarPresenca: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      sessaoId: z.number().int().positive(),
      adicionar: z.array(z.object({
        employeeId: z.number().int().positive().optional(),
        nome: z.string().min(2),
        cpf: z.string().optional(),
        funcao: z.string().optional(),
        presente: z.number().int().min(0).max(1).default(1),
      })).optional(),
      atualizar: z.array(z.object({
        id: z.number().int().positive(),
        presente: z.number().int().min(0).max(1).optional(),
        observacao: z.string().optional(),
      })).optional(),
      remover: z.array(z.number().int().positive()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      // valida sessão
      const [s] = await db.select({ id: ddsSessoes.id }).from(ddsSessoes)
        .where(and(eq(ddsSessoes.id, input.sessaoId), eq(ddsSessoes.companyId, input.companyId)));
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada" });
      if (input.adicionar?.length) {
        await db.insert(ddsSessaoFuncionarios).values(
          input.adicionar.map(a => ({
            sessaoId: input.sessaoId,
            employeeId: a.employeeId ?? null,
            nome: a.nome,
            cpf: a.cpf ?? null,
            funcao: a.funcao ?? null,
            presente: a.presente,
          } as any))
        );
      }
      if (input.atualizar?.length) {
        for (const u of input.atualizar) {
          await db.update(ddsSessaoFuncionarios).set({
            ...(u.presente !== undefined ? { presente: u.presente } : {}),
            ...(u.observacao !== undefined ? { observacao: u.observacao } : {}),
          } as any).where(eq(ddsSessaoFuncionarios.id, u.id));
        }
      }
      if (input.remover?.length) {
        await db.delete(ddsSessaoFuncionarios)
          .where(inArray(ddsSessaoFuncionarios.id, input.remover));
      }
      return { ok: true };
    }),
});
