import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql, eq, and, desc, isNull } from "drizzle-orm";
import { databookFichas, databookTerceiroEntregas, comprasOrdens, comprasOrdensItens, fornecedores, obras, terceiroContratos, empresasTerceiras, companies } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { createHash } from "crypto";
import { gerarDatabookFichaPdf, gerarIndicePdf, gerarDatabookCompletoPdf } from "../services/databookPdf";
import { codigoFicha } from "@shared/databookDisciplinas";

const DISCIPLINAS = [
  "Estrutura", "Hidráulica", "Elétrica", "Acabamento", "Impermeabilização",
  "Esquadrias / Vidros", "Pintura", "Cobertura / Telhado", "Climatização / HVAC",
  "Incêndio / SPDA", "Paisagismo", "Equipamentos", "Outros",
];

async function buscarImagemDuckDuckGo(query: string): Promise<string[]> {
  try {
    const tokenRes = await fetch("https://duckduckgo.com/?q=" + encodeURIComponent(query), {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    });
    const html = await tokenRes.text();
    const vqdMatch = html.match(/vqd=['"]([^'"]+)/);
    if (!vqdMatch) return [];

    const imgRes = await fetch(
      "https://duckduckgo.com/i.js?l=br-pt&o=json&q=" + encodeURIComponent(query) + "&vqd=" + vqdMatch[1] + "&f=,,,,,&p=1",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://duckduckgo.com/",
        },
      }
    );
    const data = await imgRes.json();
    return (data.results || [])
      .filter((r: any) => r.image && r.width >= 200 && r.height >= 200)
      .map((r: any) => r.image as string);
  } catch {
    return [];
  }
}

async function downloadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null;
    const mime = contentType.split(";")[0].trim();
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function buscarFotoParaFicha(fichaId: number, companyId: number): Promise<string | null> {
  const db = await getDb();
  const [ficha] = await db.select().from(databookFichas).where(
    and(eq(databookFichas.id, fichaId), eq(databookFichas.companyId, companyId))
  );
  if (!ficha) return null;

  if (ficha.fotoUrl && (ficha.fotoUrl as string).length > 20) {
    return ficha.fotoUrl as string;
  }

  const urls = await buscarImagemDuckDuckGo(ficha.descricao + " produto construção civil");
  if (urls.length === 0) {
    console.log(`[FotoIA] Nenhuma imagem encontrada para ficha ${fichaId}`);
    return null;
  }

  for (const imgUrl of urls.slice(0, 10)) {
    const dataUrl = await downloadImageAsBase64(imgUrl);
    if (dataUrl) {
      await db.update(databookFichas).set({
        fotoUrl: dataUrl,
        updatedAt: new Date().toISOString(),
      } as any).where(eq(databookFichas.id, fichaId));
      console.log(`[FotoIA] Foto real encontrada para ficha ${fichaId} (${(dataUrl.length / 1024).toFixed(0)}KB) — ${imgUrl.substring(0, 80)}`);
      return dataUrl;
    }
  }

  console.log(`[FotoIA] Nenhuma imagem baixada com sucesso para ficha ${fichaId}`);
  return null;
}

async function buscarFotosEmBackground(fichaIds: number[], companyId: number) {
  for (const fichaId of fichaIds) {
    try {
      await buscarFotoParaFicha(fichaId, companyId);
      await new Promise(r => setTimeout(r, 500));
    } catch {}
  }
}

function stripEapPrefix(desc: string): string {
  return desc.replace(/^\[\d+[\d.]*\]\s*/, "").trim();
}

function hashDescricao(desc: string): string {
  const clean = stripEapPrefix(desc).toLowerCase().trim().replace(/\s+/g, " ");
  return createHash("md5").update(clean).digest("hex");
}

// Rev. 2857 — eap_codigo é varchar(100): ao consolidar produtos repetidos a lista
// de códigos era unida com ", " e estourava 100 chars → INSERT falhava inteiro.
// Junta o MÁXIMO de códigos inteiros que cabem em 100 chars (sufixo " +N" p/ o resto).
const EAP_CODIGO_MAXLEN = 100;
function joinEapCodigos(list: string[]): string | null {
  const codes = Array.from(new Set((list || []).filter(Boolean).map((c) => String(c).trim()))).filter(Boolean);
  if (codes.length === 0) return null;
  let out = "";
  let i = 0;
  for (; i < codes.length; i++) {
    const candidate = out ? `${out}, ${codes[i]}` : codes[i];
    if (candidate.length > EAP_CODIGO_MAXLEN) break;
    out = candidate;
  }
  if (i >= codes.length) return out; // todos couberam
  // sobraram códigos: reservar espaço p/ sufixo " +N", recalculando N a cada corte
  const incluidos = () => (out ? out.split(", ").filter(Boolean).length : 0);
  let sufixo = ` +${codes.length - incluidos()}`;
  while (out && (out.length + sufixo.length) > EAP_CODIGO_MAXLEN) {
    const idx = out.lastIndexOf(", ");
    out = idx >= 0 ? out.slice(0, idx) : "";
    sufixo = ` +${codes.length - incluidos()}`;
  }
  return out ? `${out}${sufixo}` : codes[0].slice(0, EAP_CODIGO_MAXLEN);
}

const SERVICO_KEYWORDS = [
  "ajudante", "pedreiro", "gesseiro", "eletricista", "encanador", "pintor",
  "carpinteiro", "servente", "mestre de obra", "encarregado", "almoxarife",
  "vigia", "operador", "montador", "serralheiro", "soldador", "bombeiro",
  "técnico", "supervisor", "coordenador", "engenheiro", "arquiteto",
  "mão de obra", "mao de obra", "m.o.", "mo ", "diária", "diaria",
  "hora técnica", "hora tecnica", "h/h", "homem hora", "homem-hora",
];

function isServico(descricao: string): boolean {
  const lower = descricao.toLowerCase().trim();
  return SERVICO_KEYWORDS.some(kw => lower === kw || lower.startsWith(kw + " ") || lower.includes(" " + kw + " ") || lower.endsWith(" " + kw));
}

export const databookRouter = router({
  listarDisciplinas: protectedProcedure
    .input(z.object({}))
    .query(() => DISCIPLINAS),

  listarItensObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const result = await db.execute(sql`
        SELECT
          oi.id AS item_id,
          oi.ordem_id,
          oi.descricao,
          oi.unidade,
          oi.quantidade,
          oi.preco_unitario,
          oi.total,
          oi.solicitacao_item_id,
          o.numero_oc,
          o.fornecedor_id,
          o.fornecedor_nome,
          o.contrato_id,
          COALESCE(si.eap_codigo, si.insumo_codigo) AS eap_codigo,
          si.insumo_codigo
        FROM compras_ordens_itens oi
        JOIN compras_ordens o ON o.id = oi.ordem_id
        LEFT JOIN compras_solicitacoes_itens si ON si.id = oi.solicitacao_item_id
        WHERE o.company_id = ${input.companyId}
          AND o.obra_id = ${input.obraId}
          AND o.status IN ('entregue', 'concluida', 'aprovada', 'parcial')
        ORDER BY oi.descricao
      `);
      const rows = (result as any).rows ?? result ?? [];
      return rows;
    }),

  listarFichas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      disciplina: z.string().optional(),
      status: z.string().optional(),
      origem: z.string().optional(),
      busca: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [
        sql`company_id = ${input.companyId}`,
        sql`obra_id = ${input.obraId}`,
      ];
      if (input.disciplina) conditions.push(sql`disciplina = ${input.disciplina}`);
      if (input.status) conditions.push(sql`status = ${input.status}`);
      if (input.origem) conditions.push(sql`origem = ${input.origem}`);
      if (input.busca) conditions.push(sql`LOWER(descricao) LIKE ${"%" + input.busca.toLowerCase() + "%"}`);
      const where = sql.join(conditions, sql` AND `);
      const result = await db.execute(sql`SELECT * FROM databook_fichas WHERE ${where} ORDER BY numero_sequencial ASC`);
      const rows = (result as any).rows ?? result ?? [];
      return rows;
    }),

  dashboardObra: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const result = await db.execute(sql`
        SELECT
          disciplina,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pendente_ia') AS pendente_ia,
          COUNT(*) FILTER (WHERE status = 'gerado') AS gerado,
          COUNT(*) FILTER (WHERE status = 'revisado') AS revisado,
          COUNT(*) FILTER (WHERE status = 'enviado') AS enviado,
          COUNT(*) FILTER (WHERE status = 'aprovado') AS aprovado,
          COUNT(*) FILTER (WHERE status = 'reprovado') AS reprovado,
          COUNT(*) FILTER (WHERE origem = 'oc') AS origem_oc,
          COUNT(*) FILTER (WHERE origem = 'terceiro') AS origem_terceiro
        FROM databook_fichas
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
        GROUP BY disciplina
        ORDER BY disciplina
      `);
      const rows = (result as any).rows ?? result ?? [];
      const totais = {
        total: 0, pendente_ia: 0, gerado: 0, revisado: 0, enviado: 0, aprovado: 0, reprovado: 0,
      };
      for (const r of rows) {
        totais.total += parseInt(r.total || "0");
        totais.pendente_ia += parseInt(r.pendente_ia || "0");
        totais.gerado += parseInt(r.gerado || "0");
        totais.revisado += parseInt(r.revisado || "0");
        totais.enviado += parseInt(r.enviado || "0");
        totais.aprovado += parseInt(r.aprovado || "0");
        totais.reprovado += parseInt(r.reprovado || "0");
      }
      return { disciplinas: rows, totais };
    }),

  gerarFichasOC: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      userName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const itensResult = await db.execute(sql`
        SELECT
          oi.id AS item_id,
          oi.ordem_id,
          oi.descricao,
          oi.unidade,
          oi.quantidade,
          oi.preco_unitario,
          oi.total,
          oi.solicitacao_item_id,
          o.numero_oc,
          o.fornecedor_id,
          o.fornecedor_nome,
          o.contrato_id,
          COALESCE(si.eap_codigo, si.insumo_codigo, '') AS eap_codigo,
          COALESCE(si.insumo_codigo, '') AS insumo_codigo
        FROM compras_ordens_itens oi
        JOIN compras_ordens o ON o.id = oi.ordem_id
        LEFT JOIN compras_solicitacoes_itens si ON si.id = oi.solicitacao_item_id
        LEFT JOIN compras_solicitacoes s ON s.id = o.solicitacao_id
        WHERE o.company_id = ${input.companyId}
          AND o.obra_id = ${input.obraId}
          AND o.status IN ('entregue', 'concluida', 'aprovada', 'parcial')
          AND COALESCE(s.tipo, o.tipo, 'material') IN ('material', 'compra', 'pacote')
          AND COALESCE(s.tipo, 'material') != 'servico'
        ORDER BY oi.descricao
      `);
      const itens = (itensResult as any).rows ?? itensResult ?? [];
      if (itens.length === 0) return { criadas: 0, duplicadas: 0 };

      const existingResult = await db.execute(sql`
        SELECT hash_produto FROM databook_fichas
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
      `);
      const existingHashes = new Set(
        ((existingResult as any).rows ?? existingResult ?? []).map((r: any) => r.hash_produto)
      );

      const maxSeqResult = await db.execute(sql`
        SELECT COALESCE(MAX(numero_sequencial), 0) AS max_seq
        FROM databook_fichas
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
      `);
      let nextSeq = parseInt(((maxSeqResult as any).rows?.[0] ?? (maxSeqResult as any)?.[0])?.max_seq || "0") + 1;

      let criadas = 0;
      let duplicadas = 0;
      const dedup = new Map<string, any>();

      let ignorados = 0;
      for (const item of itens) {
        const descLimpa = stripEapPrefix(item.descricao);
        if (isServico(descLimpa)) {
          ignorados++;
          continue;
        }
        const hash = hashDescricao(item.descricao);
        if (existingHashes.has(hash)) {
          duplicadas++;
          continue;
        }
        if (dedup.has(hash)) {
          const existing = dedup.get(hash)!;
          const fornConsolidados = JSON.parse(existing.fornecedores_consolidados || "[]");
          if (!fornConsolidados.find((f: any) => f.id === item.fornecedor_id)) {
            fornConsolidados.push({ id: item.fornecedor_id, nome: item.fornecedor_nome, oc: item.numero_oc });
            existing.fornecedores_consolidados = JSON.stringify(fornConsolidados);
          }
          const eapList = existing.eap_codigos_list || [];
          if (item.eap_codigo && !eapList.includes(item.eap_codigo)) {
            eapList.push(item.eap_codigo);
            existing.eap_codigos_list = eapList;
            existing.eap_codigo = joinEapCodigos(eapList);
          }
          duplicadas++;
          continue;
        }
        dedup.set(hash, {
          company_id: input.companyId,
          obra_id: input.obraId,
          numero_sequencial: nextSeq++,
          origem: "oc",
          ordem_id: item.ordem_id,
          ordem_item_id: item.item_id,
          fornecedor_id: item.fornecedor_id,
          fornecedor_nome: item.fornecedor_nome,
          contrato_numero: item.numero_oc,
          descricao: descLimpa,
          disciplina: "Outros",
          eap_codigo: item.eap_codigo || null,
          eap_codigos_list: item.eap_codigo ? [item.eap_codigo] : [],
          insumo_codigo: item.insumo_codigo || null,
          hash_produto: hash,
          fornecedores_consolidados: JSON.stringify([{ id: item.fornecedor_id, nome: item.fornecedor_nome, oc: item.numero_oc }]),
          status: "pendente_ia",
          gerado_por: input.userName,
          gerado_em: new Date().toISOString(),
        });
      }

      for (const ficha of dedup.values()) {
        // Rev. 2857 — salvaguarda final: eap_codigo/insumo_codigo são varchar(100).
        const eapSafe = joinEapCodigos(ficha.eap_codigos_list?.length ? ficha.eap_codigos_list : (ficha.eap_codigo ? [ficha.eap_codigo] : []));
        const insumoSafe = ficha.insumo_codigo ? String(ficha.insumo_codigo).slice(0, EAP_CODIGO_MAXLEN) : null;
        await db.execute(sql`
          INSERT INTO databook_fichas (company_id, obra_id, numero_sequencial, origem, ordem_id, ordem_item_id,
            fornecedor_id, fornecedor_nome, contrato_numero, descricao, disciplina, eap_codigo, insumo_codigo,
            hash_produto, fornecedores_consolidados, status, gerado_por, gerado_em)
          VALUES (${ficha.company_id}, ${ficha.obra_id}, ${ficha.numero_sequencial}, ${ficha.origem},
            ${ficha.ordem_id}, ${ficha.ordem_item_id}, ${ficha.fornecedor_id}, ${ficha.fornecedor_nome},
            ${ficha.contrato_numero}, ${ficha.descricao}, ${ficha.disciplina}, ${eapSafe},
            ${insumoSafe}, ${ficha.hash_produto}, ${ficha.fornecedores_consolidados},
            ${ficha.status}, ${ficha.gerado_por}, ${ficha.gerado_em})
        `);
        criadas++;
      }

      return { criadas, duplicadas, ignorados };
    }),

  gerarEspecificacoesIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fichaId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [ficha] = await db.select().from(databookFichas).where(
        and(eq(databookFichas.id, input.fichaId), eq(databookFichas.companyId, input.companyId))
      );
      if (!ficha) throw new Error("Ficha não encontrada");

      // Rev. 2861 — "AS APROVADAS NÃO PODEM SER PERDIDAS QUANDO GERAR NOVAMENTE":
      // fichas em status avançado (já revisadas/enviadas/aprovadas/reprovadas
      // pelo RH/cliente) JAMAIS são reescritas pela IA. Blindagem à prova de
      // bala mesmo se o filtro do front falhar.
      const STATUS_PROTEGIDOS = ["revisado", "enviado", "aprovado", "reprovado"];
      if (STATUS_PROTEGIDOS.includes(ficha.status as string)) {
        return { disciplina: ficha.disciplina, especificacoes: ficha.especificacoes, protegida: true };
      }

      if (ficha.especificacoes && (ficha.especificacoes as string).trim().length > 10) {
        return { disciplina: ficha.disciplina, especificacoes: ficha.especificacoes, jaExistia: true };
      }

      const prompt = `Você é um engenheiro civil especialista em especificações técnicas de materiais de construção.

Dado o seguinte material/insumo de uma obra:
"${ficha.descricao}"

Gere as especificações técnicas detalhadas deste produto no seguinte formato JSON:
{
  "disciplina": "uma das seguintes: ${DISCIPLINAS.join(", ")}",
  "especificacoes": "lista de especificações técnicas em bullet points (cada item em uma linha com •), incluindo: material, dimensões, norma técnica aplicável, acabamento, capacidade, modelo/fabricante quando identificável",
  "descricao_completa": "descrição técnica completa do produto em uma frase"
}

Responda APENAS o JSON, sem markdown.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um assistente técnico especializado em materiais de construção civil brasileira. Responda sempre em português do Brasil. Retorne apenas JSON válido." },
          { role: "user", content: prompt },
        ],
        maxTokens: 2048,
      });

      const text = result.choices[0]?.message?.content;
      const content = typeof text === "string" ? text : Array.isArray(text) ? text.map((t: any) => t.text || "").join("") : "";
      let parsed: any = {};
      try {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { disciplina: "Outros", especificacoes: content, descricao_completa: ficha.descricao };
      }

      await db.update(databookFichas).set({
        disciplina: parsed.disciplina || "Outros",
        especificacoes: parsed.especificacoes || "",
        iaValidado: true,
        iaScore: 80,
        status: "gerado",
        updatedAt: new Date().toISOString(),
      } as any).where(eq(databookFichas.id, input.fichaId));

      return { disciplina: parsed.disciplina, especificacoes: parsed.especificacoes };
    }),

  gerarEspecificacoesLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const fichas = await db.select().from(databookFichas).where(
        and(
          eq(databookFichas.companyId, input.companyId),
          eq(databookFichas.obraId, input.obraId),
          eq(databookFichas.status, "pendente_ia"),
        )
      );
      if (fichas.length === 0) return { processadas: 0 };

      const descricoes = fichas.map((f, i) => `${i + 1}. "${f.descricao}"`).join("\n");
      const prompt = `Você é um engenheiro civil especialista em especificações técnicas de materiais de construção.

Para cada material abaixo, classifique a disciplina e gere especificações técnicas.

Materiais:
${descricoes}

Disciplinas válidas: ${DISCIPLINAS.join(", ")}

Responda em JSON como array:
[
  {
    "index": 1,
    "disciplina": "...",
    "especificacoes": "• spec1\\n• spec2\\n• spec3"
  },
  ...
]

Responda APENAS o JSON array, sem markdown.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um assistente técnico especializado em materiais de construção civil brasileira. Responda apenas JSON válido." },
          { role: "user", content: prompt },
        ],
        maxTokens: 8192,
      });

      const text = result.choices[0]?.message?.content;
      const content = typeof text === "string" ? text : Array.isArray(text) ? text.map((t: any) => t.text || "").join("") : "";
      let items: any[] = [];
      try {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        items = JSON.parse(cleaned);
      } catch {
        return { processadas: 0, erro: "Falha ao interpretar resposta da IA" };
      }

      let processadas = 0;
      const fichasParaFoto: number[] = [];
      for (const item of items) {
        const fichaIndex = (item.index ?? item.idx ?? 0) - 1;
        if (fichaIndex < 0 || fichaIndex >= fichas.length) continue;
        const ficha = fichas[fichaIndex];
        await db.update(databookFichas).set({
          disciplina: item.disciplina || "Outros",
          especificacoes: item.especificacoes || "",
          iaValidado: true,
          iaScore: 80,
          status: "gerado",
          updatedAt: new Date().toISOString(),
        } as any).where(eq(databookFichas.id, ficha.id));
        processadas++;
        if (!ficha.fotoUrl) fichasParaFoto.push(ficha.id);
      }

      if (fichasParaFoto.length > 0) {
        buscarFotosEmBackground(fichasParaFoto, input.companyId).catch(() => {});
      }

      return { processadas };
    }),

  buscarFotoIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fichaId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const url = await buscarFotoParaFicha(input.fichaId, input.companyId);
      if (url) return { fotoUrl: url };
      return { fotoUrl: null, aviso: "Não foi possível encontrar uma foto para este produto" };
    }),

  buscarFotoLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const result = await db.execute(sql`
        SELECT id FROM databook_fichas
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
          AND (foto_url IS NULL OR foto_url = '')
        ORDER BY numero_sequencial ASC
      `);
      const fichaIds = ((result as any).rows ?? result ?? []).map((r: any) => r.id);
      if (fichaIds.length === 0) return { total: 0, msg: "Todas as fichas já possuem foto" };

      buscarFotosEmBackground(fichaIds, input.companyId).catch(() => {});

      return { total: fichaIds.length, msg: `Buscando fotos para ${fichaIds.length} fichas em background...` };
    }),

  uploadFotoFicha: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fichaId: z.number(),
      fotoBase64: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(databookFichas).set({
        fotoUrl: input.fotoBase64,
        updatedAt: new Date().toISOString(),
      } as any).where(
        and(eq(databookFichas.id, input.fichaId), eq(databookFichas.companyId, input.companyId))
      );
      return { success: true };
    }),

  atualizarFicha: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fichaId: z.number(),
      especificacoes: z.string().optional(),
      fotoUrl: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      disciplina: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const updates: any = { updatedAt: new Date().toISOString() };
      if (input.especificacoes !== undefined) updates.especificacoes = input.especificacoes;
      if (input.fotoUrl !== undefined) updates.fotoUrl = input.fotoUrl;
      if (input.observacoes !== undefined) updates.observacoes = input.observacoes;
      if (input.disciplina !== undefined) updates.disciplina = input.disciplina;
      await db.update(databookFichas).set(updates).where(
        and(eq(databookFichas.id, input.fichaId), eq(databookFichas.companyId, input.companyId))
      );
      return { success: true };
    }),

  alterarStatus: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fichaId: z.number(),
      novoStatus: z.enum(["pendente_ia", "gerado", "revisado", "enviado", "aprovado", "reprovado"]),
      userName: z.string(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const VALID_TRANSITIONS: Record<string, string[]> = {
        pendente_ia: ["gerado"],
        gerado: ["revisado", "pendente_ia"],
        revisado: ["enviado", "gerado"],
        enviado: ["aprovado", "reprovado", "revisado"],
        reprovado: ["revisado", "pendente_ia"],
        aprovado: [],
      };
      const [current] = await db.select().from(databookFichas).where(
        and(eq(databookFichas.id, input.fichaId), eq(databookFichas.companyId, input.companyId))
      );
      if (!current) throw new Error("Ficha não encontrada");
      const allowed = VALID_TRANSITIONS[current.status] || [];
      if (!allowed.includes(input.novoStatus)) {
        throw new Error(`Transição inválida: ${current.status} → ${input.novoStatus}`);
      }
      const updates: any = {
        status: input.novoStatus,
        updatedAt: new Date().toISOString(),
      };
      if (input.novoStatus === "revisado") {
        updates.revisadoPor = input.userName;
        updates.revisadoEm = new Date().toISOString();
      } else if (input.novoStatus === "enviado") {
        updates.enviadoPor = input.userName;
        updates.enviadoEm = new Date().toISOString();
      } else if (input.novoStatus === "aprovado") {
        updates.aprovadoCliente = true;
        updates.aprovadoClientePor = input.userName;
        updates.aprovadoClienteEm = new Date().toISOString();
      } else if (input.novoStatus === "reprovado") {
        updates.aprovadoCliente = false;
        updates.reprovadoMotivo = input.motivo || "";
      }
      await db.update(databookFichas).set(updates).where(
        and(eq(databookFichas.id, input.fichaId), eq(databookFichas.companyId, input.companyId))
      );
      return { success: true };
    }),

  alterarStatusLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fichaIds: z.array(z.number()),
      novoStatus: z.enum(["revisado", "enviado", "aprovado", "reprovado"]),
      userName: z.string(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      let atualizadas = 0;
      for (const fichaId of input.fichaIds) {
        const updates: any = { status: input.novoStatus, updatedAt: new Date().toISOString() };
        if (input.novoStatus === "revisado") {
          updates.revisadoPor = input.userName;
          updates.revisadoEm = new Date().toISOString();
        } else if (input.novoStatus === "enviado") {
          updates.enviadoPor = input.userName;
          updates.enviadoEm = new Date().toISOString();
        } else if (input.novoStatus === "aprovado") {
          updates.aprovadoCliente = true;
          updates.aprovadoClientePor = input.userName;
          updates.aprovadoClienteEm = new Date().toISOString();
        } else if (input.novoStatus === "reprovado") {
          updates.aprovadoCliente = false;
          updates.reprovadoMotivo = input.motivo || "";
        }
        await db.update(databookFichas).set(updates).where(
          and(eq(databookFichas.id, fichaId), eq(databookFichas.companyId, input.companyId))
        );
        atualizadas++;
      }
      return { atualizadas };
    }),

  validarEntregaTerceiro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      entregaId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [entrega] = await db.select().from(databookTerceiroEntregas).where(
        and(eq(databookTerceiroEntregas.id, input.entregaId), eq(databookTerceiroEntregas.companyId, input.companyId))
      );
      if (!entrega) throw new Error("Entrega não encontrada");

      const prompt = `Você é um auditor técnico de materiais de construção civil.

Analise a seguinte ficha de Databook enviada por um terceiro e verifique:
1. Se as informações estão completas (descrição, especificações, foto)
2. Se há erros de português
3. Se as especificações técnicas são coerentes com o produto descrito
4. Se o conteúdo segue padrão profissional

Ficha:
- Descrição: ${entrega.descricao}
- Fabricante: ${entrega.fabricante || "Não informado"}
- Modelo: ${entrega.modelo || "Não informado"}
- Especificações: ${entrega.especificacoes || "Não informado"}
- Observações: ${entrega.observacoes || "Nenhuma"}
- Foto: ${entrega.fotoUrl ? "Sim" : "Não fornecida"}

Responda em JSON:
{
  "aprovado": true/false,
  "score": 0-100,
  "alertas": ["alerta 1", "alerta 2"],
  "correcoes": "texto com correções sugeridas (se houver erros de português ou técnicos)"
}

Responda APENAS o JSON.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um auditor técnico rigoroso de materiais de construção. Retorne apenas JSON válido." },
          { role: "user", content: prompt },
        ],
        maxTokens: 2048,
      });

      const text = result.choices[0]?.message?.content;
      const content = typeof text === "string" ? text : Array.isArray(text) ? text.map((t: any) => t.text || "").join("") : "";
      let parsed: any = {};
      try {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { aprovado: false, score: 0, alertas: ["Falha ao processar validação"], correcoes: "" };
      }

      await db.update(databookTerceiroEntregas).set({
        iaValidado: parsed.aprovado ?? false,
        iaScore: parsed.score ?? 0,
        iaAlertas: JSON.stringify(parsed.alertas || []),
        iaCorrecoes: parsed.correcoes || null,
        status: parsed.aprovado ? "validado_ia" : "pendente",
        updatedAt: new Date().toISOString(),
      } as any).where(eq(databookTerceiroEntregas.id, input.entregaId));

      return parsed;
    }),

  cadastrarEntregaTerceiro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      terceiroContratoId: z.number(),
      descricao: z.string().min(3),
      fabricante: z.string().optional(),
      modelo: z.string().optional(),
      especificacoes: z.string().optional(),
      fotoUrl: z.string().nullable().optional(),
      observacoes: z.string().optional(),
      notaFiscalUrl: z.string().nullable().optional(),
      userName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [tc] = await db.select().from(terceiroContratos).where(
        and(eq(terceiroContratos.id, input.terceiroContratoId), eq(terceiroContratos.companyId, input.companyId))
      );
      if (!tc) throw new Error("Contrato de terceiro não encontrado");

      const [inserted] = await db.insert(databookTerceiroEntregas).values({
        companyId: input.companyId,
        obraId: input.obraId,
        terceiroContratoId: input.terceiroContratoId,
        empresaTerceiraId: tc.empresaTerceiraId,
        descricao: input.descricao,
        fabricante: input.fabricante || null,
        modelo: input.modelo || null,
        especificacoes: input.especificacoes || null,
        fotoUrl: input.fotoUrl || null,
        observacoes: input.observacoes || null,
        notaFiscalUrl: input.notaFiscalUrl || null,
        cadastradoPor: input.userName,
        status: "pendente",
      } as any).returning();

      return { id: inserted.id };
    }),

  aprovarEntregaTerceiro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      entregaId: z.number(),
      aprovado: z.boolean(),
      userName: z.string(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [entrega] = await db.select().from(databookTerceiroEntregas).where(
        and(eq(databookTerceiroEntregas.id, input.entregaId), eq(databookTerceiroEntregas.companyId, input.companyId))
      );
      if (!entrega) throw new Error("Entrega não encontrada");
      if (entrega.status === "aprovado" || entrega.status === "reprovado") {
        throw new Error("Entrega já processada");
      }

      if (input.aprovado) {
        await db.update(databookTerceiroEntregas).set({
          status: "aprovado",
          aprovadoPor: input.userName,
          aprovadoEm: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any).where(
          and(eq(databookTerceiroEntregas.id, input.entregaId), eq(databookTerceiroEntregas.companyId, input.companyId))
        );

        const existingFicha = await db.select().from(databookFichas).where(
          and(eq(databookFichas.terceiroEntregaId, entrega.id), eq(databookFichas.companyId, input.companyId))
        );
        if (existingFicha.length === 0) {
          const maxSeqResult = await db.execute(sql`
            SELECT COALESCE(MAX(numero_sequencial), 0) AS max_seq
            FROM databook_fichas WHERE company_id = ${input.companyId} AND obra_id = ${entrega.obraId}
          `);
          const nextSeq = parseInt(((maxSeqResult as any).rows?.[0] ?? (maxSeqResult as any)?.[0])?.max_seq || "0") + 1;

          await db.insert(databookFichas).values({
            companyId: input.companyId,
            obraId: entrega.obraId,
            numeroSequencial: nextSeq,
            origem: "terceiro",
            terceiroContratoId: entrega.terceiroContratoId,
            terceiroEntregaId: entrega.id,
            fornecedorNome: entrega.fabricante || null,
            descricao: entrega.descricao,
            especificacoes: entrega.especificacoes || null,
            fotoUrl: entrega.fotoUrl || null,
            observacoes: entrega.observacoes || null,
            hashProduto: hashDescricao(entrega.descricao),
            status: "revisado",
            iaValidado: true,
            revisadoPor: input.userName,
            revisadoEm: new Date().toISOString(),
            geradoPor: entrega.cadastradoPor || "Terceiro",
            geradoEm: entrega.cadastradoEm || new Date().toISOString(),
          } as any);
        }
      } else {
        await db.update(databookTerceiroEntregas).set({
          status: "reprovado",
          reprovadoMotivo: input.motivo || "",
          updatedAt: new Date().toISOString(),
        } as any).where(
          and(eq(databookTerceiroEntregas.id, input.entregaId), eq(databookTerceiroEntregas.companyId, input.companyId))
        );
      }
      return { success: true };
    }),

  listarEntregasTerceiro: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      terceiroContratoId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [sql`dte.company_id = ${input.companyId}`];
      if (input.obraId) conditions.push(sql`dte.obra_id = ${input.obraId}`);
      if (input.terceiroContratoId) conditions.push(sql`dte.terceiro_contrato_id = ${input.terceiroContratoId}`);
      const where = sql.join(conditions, sql` AND `);
      const result = await db.execute(sql`
        SELECT dte.*, et.razao_social AS terceiro_nome
        FROM databook_terceiro_entregas dte
        LEFT JOIN empresas_terceiras et ON et.id = dte.empresa_terceira_id
        WHERE ${where}
        ORDER BY dte.created_at DESC
      `);
      return (result as any).rows ?? result ?? [];
    }),

  compararEAP: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const result = await db.execute(sql`
        SELECT df.id, df.descricao, df.insumo_codigo, df.eap_codigo,
          oi.descricao AS descricao_orcamento
        FROM databook_fichas df
        LEFT JOIN orcamento_itens oi ON oi.insumo_codigo = df.insumo_codigo
          AND oi.orcamento_id = (SELECT orcamento_id FROM obras WHERE id = ${input.obraId} AND company_id = ${input.companyId} LIMIT 1)
        WHERE df.company_id = ${input.companyId} AND df.obra_id = ${input.obraId}
          AND df.insumo_codigo IS NOT NULL AND df.insumo_codigo != ''
        ORDER BY df.numero_sequencial
      `);
      const rows = (result as any).rows ?? result ?? [];
      const divergencias = rows.filter((r: any) => r.descricao_orcamento && r.descricao_orcamento.toLowerCase() !== r.descricao.toLowerCase());
      return { total: rows.length, divergencias };
    }),

  getFicha: protectedProcedure
    .input(z.object({ companyId: z.number(), fichaId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [ficha] = await db.select().from(databookFichas).where(
        and(eq(databookFichas.id, input.fichaId), eq(databookFichas.companyId, input.companyId))
      );
      if (!ficha) return null;

      let fornecedorDetalhes: any = null;
      if (ficha.fornecedorId) {
        const [forn] = await db.select().from(fornecedores).where(eq(fornecedores.id, ficha.fornecedorId));
        if (forn) fornecedorDetalhes = forn;
      }

      return { ...ficha, fornecedorDetalhes };
    }),

  excluirFicha: protectedProcedure
    .input(z.object({ companyId: z.number(), fichaId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.execute(sql`
        DELETE FROM databook_fichas
        WHERE id = ${input.fichaId} AND company_id = ${input.companyId}
      `);
      return { success: true };
    }),

  gerarPdfFicha: protectedProcedure
    .input(z.object({ companyId: z.number(), fichaId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const fichaResult = await db.execute(sql`
        SELECT * FROM databook_fichas
        WHERE id = ${input.fichaId} AND company_id = ${input.companyId}
      `);
      const ficha = ((fichaResult as any).rows ?? fichaResult ?? [])[0];
      if (!ficha) throw new Error("Ficha não encontrada");

      const [obraRow] = await db.select().from(obras).where(and(eq(obras.id, ficha.obra_id), eq((obras as any).companyId, input.companyId)));
      const [companyRow] = await db.select().from(companies).where(eq(companies.id, input.companyId));

      let fornecedorData = null;
      if (ficha.fornecedor_id) {
        // Rev. 2876 — `ficha.fornecedor_id` referencia `fornecedores.id` (mestre de
        // Compras, vindo da OC). A empresa terceira — onde ficam os dados ricos de
        // endereço/contato — liga ao mestre via coluna `fornecedor_id` (NÃO por `id`).
        // O código antigo casava `empresas_terceiras.id = ficha.fornecedor_id`, então
        // quase nunca achava nada e o PDF saía parcial. Carrega AMBAS as fontes e
        // mescla campo-a-campo (1ª não-vazia) p/ preencher automático e por completo.
        const [et, fn] = await Promise.all([
          db.select().from(empresasTerceiras).where(and(
            eq(empresasTerceiras.fornecedorId, ficha.fornecedor_id),
            eq(empresasTerceiras.companyId, input.companyId),
            isNull(empresasTerceiras.deletedAt),
          )).orderBy(desc(empresasTerceiras.id)).limit(1).then((r) => r[0] ?? null),
          db.select().from(fornecedores).where(and(
            eq(fornecedores.id, ficha.fornecedor_id),
            eq(fornecedores.companyId, input.companyId),
          )).limit(1).then((r) => r[0] ?? null),
        ]);
        if (et || fn) {
          const pick = (...vals: any[]) => {
            for (const v of vals) { if (v != null && String(v).trim() !== "") return v; }
            return null;
          };
          const enderecoEt = [et?.logradouro, et?.numero].filter(Boolean).join(", ");
          const enderecoFn = [fn?.endereco, fn?.numero].filter(Boolean).join(", ");
          fornecedorData = {
            razaoSocial: pick(et?.razaoSocial, et?.nomeFantasia, fn?.razaoSocial, fn?.nomeFantasia, ficha.fornecedor_nome),
            endereco: pick(enderecoEt, enderecoFn),
            bairro: pick(et?.bairro, fn?.bairro),
            cidade: pick(et?.cidade, fn?.cidade),
            estado: pick(et?.estado, fn?.estado),
            cep: pick(et?.cep, fn?.cep),
            contato: pick(et?.responsavelNome, fn?.contatoNome),
            telefone: pick(et?.telefone, fn?.telefone),
            celular: pick(et?.celular, fn?.contatoCelular),
            email: pick(et?.email, fn?.email, fn?.contatoEmail),
          };
        }
      }

      const pdfBuffer = await gerarDatabookFichaPdf(
        ficha,
        {
          nome: obraRow?.nome || "Obra",
          endereco: obraRow?.endereco,
          gerenciadoraNome: (obraRow as any)?.gerenciadoraNome,
          gerenciadoraLogoUrl: (obraRow as any)?.gerenciadoraLogoUrl,
          clienteLogoUrl: (obraRow as any)?.clienteLogoUrl,
        },
        {
          razaoSocial: companyRow?.razaoSocial || "Empresa",
          logoUrl: companyRow?.logoUrl,
        },
        fornecedorData,
      );

      return { pdf: pdfBuffer.toString("base64"), filename: `${codigoFicha(ficha.disciplina, ficha.numero_sequencial)}_${ficha.descricao.substring(0, 30).replace(/[^a-zA-Z0-9]/g, "_")}.pdf` };
    }),

  gerarPdfIndice: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), disciplina: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const conditions = [
        sql`company_id = ${input.companyId}`,
        sql`obra_id = ${input.obraId}`,
      ];
      if (input.disciplina) conditions.push(sql`disciplina = ${input.disciplina}`);
      const where = sql.join(conditions, sql` AND `);
      const result = await db.execute(sql`SELECT * FROM databook_fichas WHERE ${where} ORDER BY numero_sequencial ASC`);
      const fichas = (result as any).rows ?? result ?? [];

      const [obraRow] = await db.select().from(obras).where(and(eq(obras.id, input.obraId), eq((obras as any).companyId, input.companyId)));
      const [companyRow] = await db.select().from(companies).where(eq(companies.id, input.companyId));

      const pdfBuffer = await gerarIndicePdf(
        fichas,
        {
          nome: obraRow?.nome || "Obra",
          endereco: obraRow?.endereco,
          gerenciadoraNome: (obraRow as any)?.gerenciadoraNome,
          gerenciadoraLogoUrl: (obraRow as any)?.gerenciadoraLogoUrl,
          clienteLogoUrl: (obraRow as any)?.clienteLogoUrl,
        },
        {
          razaoSocial: companyRow?.razaoSocial || "Empresa",
          logoUrl: companyRow?.logoUrl,
        },
      );

      return { pdf: pdfBuffer.toString("base64"), filename: `DATABOOK_INDICE_${obraRow?.nome || "Obra"}.pdf` };
    }),

  exportarExcel: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const result = await db.execute(sql`
        SELECT numero_sequencial, disciplina, descricao, fornecedor_nome,
          contrato_numero, eap_codigo, especificacoes, status, origem
        FROM databook_fichas
        WHERE company_id = ${input.companyId} AND obra_id = ${input.obraId}
        ORDER BY numero_sequencial ASC
      `);
      return (result as any).rows ?? result ?? [];
    }),
});
