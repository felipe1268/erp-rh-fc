import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql, eq, and, desc } from "drizzle-orm";
import { databookFichas, databookTerceiroEntregas, comprasOrdens, comprasOrdensItens, fornecedores, obras, terceiroContratos, empresasTerceiras, companies } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { createHash } from "crypto";
import { gerarDatabookFichaPdf, gerarIndicePdf, gerarDatabookCompletoPdf } from "../services/databookPdf";

const DISCIPLINAS = [
  "Estrutura", "Hidráulica", "Elétrica", "Acabamento", "Impermeabilização",
  "Esquadrias / Vidros", "Pintura", "Cobertura / Telhado", "Climatização / HVAC",
  "Incêndio / SPDA", "Paisagismo", "Equipamentos", "Outros",
];

function hashDescricao(desc: string): string {
  return createHash("md5").update(desc.toLowerCase().trim().replace(/\s+/g, " ")).digest("hex");
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
        WHERE o.company_id = ${input.companyId}
          AND o.obra_id = ${input.obraId}
          AND o.status IN ('entregue', 'concluida', 'aprovada', 'parcial')
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

      for (const item of itens) {
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
          descricao: item.descricao,
          disciplina: "Outros",
          eap_codigo: item.eap_codigo || null,
          insumo_codigo: item.insumo_codigo || null,
          hash_produto: hash,
          fornecedores_consolidados: JSON.stringify([{ id: item.fornecedor_id, nome: item.fornecedor_nome, oc: item.numero_oc }]),
          status: "pendente_ia",
          gerado_por: input.userName,
          gerado_em: new Date().toISOString(),
        });
      }

      for (const ficha of dedup.values()) {
        await db.execute(sql`
          INSERT INTO databook_fichas (company_id, obra_id, numero_sequencial, origem, ordem_id, ordem_item_id,
            fornecedor_id, fornecedor_nome, contrato_numero, descricao, disciplina, eap_codigo, insumo_codigo,
            hash_produto, fornecedores_consolidados, status, gerado_por, gerado_em)
          VALUES (${ficha.company_id}, ${ficha.obra_id}, ${ficha.numero_sequencial}, ${ficha.origem},
            ${ficha.ordem_id}, ${ficha.ordem_item_id}, ${ficha.fornecedor_id}, ${ficha.fornecedor_nome},
            ${ficha.contrato_numero}, ${ficha.descricao}, ${ficha.disciplina}, ${ficha.eap_codigo},
            ${ficha.insumo_codigo}, ${ficha.hash_produto}, ${ficha.fornecedores_consolidados},
            ${ficha.status}, ${ficha.gerado_por}, ${ficha.gerado_em})
        `);
        criadas++;
      }

      return { criadas, duplicadas };
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
      }

      return { processadas };
    }),

  buscarFotoIA: protectedProcedure
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

      const googleKey = process.env.GOOGLE_API_KEY;
      if (!googleKey) throw new Error("GOOGLE_API_KEY não configurada");

      const prompt = `Busque uma imagem real de produto de construção civil: "${ficha.descricao}".
Retorne APENAS a URL direta de uma imagem do produto (JPG ou PNG) que seja de um catálogo de fabricante ou loja online confiável.
Responda apenas a URL, nada mais.`;

      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${googleKey}`,
          },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            messages: [
              { role: "system", content: "Você busca imagens reais de produtos de construção civil. Retorne apenas a URL direta da imagem." },
              { role: "user", content: prompt },
            ],
            max_tokens: 500,
          }),
        }
      );

      if (!res.ok) throw new Error(`Gemini falhou: ${res.status}`);
      const data = await res.json();
      const url = data.choices?.[0]?.message?.content?.trim() || "";

      if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
        await db.update(databookFichas).set({
          fotoUrl: url,
          updatedAt: new Date().toISOString(),
        } as any).where(eq(databookFichas.id, input.fichaId));
        return { fotoUrl: url };
      }

      return { fotoUrl: null, aviso: "Não foi possível encontrar uma foto para este produto" };
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
      );

      return { pdf: pdfBuffer.toString("base64"), filename: `DATABOOK-${String(ficha.numero_sequencial).padStart(3, "0")}_${ficha.descricao.substring(0, 30).replace(/[^a-zA-Z0-9]/g, "_")}.pdf` };
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
