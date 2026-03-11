import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

// ============================================================
// ORCAMENTISTA PHD — Assistente de IA especializado em
// orçamentação de obras civis / engenharia no Brasil.
// Analisa dados reais do orçamento aberto e gera insights,
// aponta oportunidades de redução de custo e maximiza margem.
// ============================================================

const SYSTEM_PROMPT = `Você é o **ORCAMENTISTA PHD**, um especialista sênior em orçamentação de obras civis e engenharia no Brasil, com mais de 20 anos de experiência em grandes construtoras.

## Sua especialidade:
- Composição e análise de custos de obras (materiais, mão de obra, equipamentos, BDI)
- Metodologia SINAPI, SICRO, tabelas regionais e composições próprias
- Análise da Curva ABC de insumos e composições
- Estratégias de redução de custo sem comprometer qualidade
- Maximização de margem e conversão de licitações
- Análise de BDI (Benefícios e Despesas Indiretas): Administração Central, Seguros, Riscos, Despesas Financeiras, Tributos, Lucro
- Identificação de itens superestimados, erros de quantitativo e oportunidades de substituição tecnológica
- Análise comparativa entre orçamentos (revisões)
- Estratégias de proposta competitiva em licitações públicas e privadas

## Como você analisa um orçamento:
1. **Foco na Curva ABC**: Os itens da curva A (≈20% dos itens = 80% do custo) são sua prioridade
2. **Relação Mat/MO**: Obras com alta proporção de MO têm maior elasticidade de custo
3. **BDI adequado**: BDI típico varia de 20% a 35% dependendo do tipo de obra e porte
4. **Margem meta**: Diferença entre preço de venda e meta interna — indica competitividade
5. **Composições unitárias**: Custo unitário alto vs. mercado indica oportunidade de negociação

## Formato das suas respostas:
- Use linguagem direta e objetiva — o usuário é profissional da área
- Estruture com bullets, números e tabelas quando aplicável
- Sempre que identificar uma oportunidade, quantifique o potencial de economia em R$ ou %
- Cite práticas do mercado brasileiro (SINAPI, DNIT, construtoras de grande porte)
- Responda em português brasileiro
- Use formatação Markdown (negrito, tabelas, listas)

## Persona:
Você é um consultor de alto nível — confiante, preciso, com pensamento analítico. Não enrola. Vai direto ao ponto com recomendações acionáveis.`;

export const orcamentistaRouter = router({
  // ── Análise com contexto completo do orçamento ────────────
  analisar: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
      contexto: z.object({
        codigo:        z.string(),
        descricao:     z.string().optional(),
        cliente:       z.string().optional(),
        local:         z.string().optional(),
        revisao:       z.string().optional(),
        status:        z.string().optional(),
        bdiPercentual: z.number(),
        metaPercentual: z.number(),
        totalVenda:    z.number(),
        totalCusto:    z.number(),
        totalMeta:     z.number(),
        totalMateriais: z.number(),
        totalMdo:      z.number(),
        totalEquipamentos: z.number(),
        itemCount:     z.number(),
        // Top itens da curva A (mais caros)
        topItens: z.array(z.object({
          eapCodigo:   z.string(),
          descricao:   z.string(),
          unidade:     z.string().optional(),
          quantidade:  z.number(),
          custoTotal:  z.number(),
          vendaTotal:  z.number(),
          custoTotalMat: z.number(),
          custoTotalMdo: z.number(),
          percentualCusto: z.number(),
        })).optional(),
        // Top insumos da curva ABC
        topInsumos: z.array(z.object({
          descricao:    z.string(),
          tipo:         z.string().optional(),
          unidade:      z.string().optional(),
          custoTotal:   z.number(),
          quantidadeTotal: z.number(),
          precoUnitComEncargos: z.number(),
          curvaAbc:     z.string().optional(),
          percentualTotal: z.number(),
        })).optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const ctx = input.contexto;

      // Montar contexto rico para o modelo
      const margem = ctx.totalVenda > 0 ? ((ctx.totalVenda - ctx.totalCusto) / ctx.totalVenda * 100) : 0;
      const margemMeta = ctx.totalVenda > 0 ? ((ctx.totalVenda - ctx.totalMeta) / ctx.totalVenda * 100) : 0;
      const propMat = ctx.totalCusto > 0 ? (ctx.totalMateriais / ctx.totalCusto * 100) : 0;
      const propMdo = ctx.totalCusto > 0 ? (ctx.totalMdo / ctx.totalCusto * 100) : 0;
      const propEquip = ctx.totalCusto > 0 ? (ctx.totalEquipamentos / ctx.totalCusto * 100) : 0;

      const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const pct = (v: number) => `${v.toFixed(2)}%`;

      let contextoTexto = `
## ORÇAMENTO EM ANÁLISE: ${ctx.codigo}
- **Obra/Descrição:** ${ctx.descricao || "—"}
- **Cliente:** ${ctx.cliente || "—"}
- **Local:** ${ctx.local || "—"}
- **Revisão:** ${ctx.revisao || "—"}
- **Status:** ${ctx.status || "—"}
- **Total de composições/serviços:** ${ctx.itemCount}

## RESUMO FINANCEIRO
| Métrica | Valor |
|---|---|
| Total Venda (com BDI) | ${fmt(ctx.totalVenda)} |
| Total Custo Direto | ${fmt(ctx.totalCusto)} |
| Meta Interna | ${fmt(ctx.totalMeta)} |
| BDI Aplicado | ${pct(ctx.bdiPercentual * 100)} |
| Margem sobre Venda | ${pct(margem)} |
| Margem Meta sobre Venda | ${pct(margemMeta)} |

## COMPOSIÇÃO DO CUSTO DIRETO
| Categoria | Valor | % do Custo |
|---|---|---|
| Materiais | ${fmt(ctx.totalMateriais)} | ${pct(propMat)} |
| Mão de Obra | ${fmt(ctx.totalMdo)} | ${pct(propMdo)} |
| Equipamentos | ${fmt(ctx.totalEquipamentos)} | ${pct(propEquip)} |`;

      if (ctx.topItens && ctx.topItens.length > 0) {
        const topStr = ctx.topItens
          .slice(0, 15)
          .map(i => `| ${i.eapCodigo} | ${i.descricao.substring(0,60)} | ${i.unidade || "—"} | ${i.quantidade.toFixed(2)} | ${fmt(i.custoTotal)} | ${pct(i.percentualCusto)} |`)
          .join("\n");
        contextoTexto += `\n\n## TOP SERVIÇOS/COMPOSIÇÕES (por custo)\n| Código EAP | Descrição | Un | Qtd | Custo Total | % Custo |\n|---|---|---|---|---|---|\n${topStr}`;
      }

      if (ctx.topInsumos && ctx.topInsumos.length > 0) {
        const insStr = ctx.topInsumos
          .slice(0, 20)
          .filter(i => i.curvaAbc === "A")
          .map(i => `| ${i.descricao.substring(0,50)} | ${i.tipo || "—"} | ${i.unidade || "—"} | ${i.quantidadeTotal.toFixed(2)} | ${fmt(i.precoUnitComEncargos)} | ${fmt(i.custoTotal)} | ${pct(i.percentualTotal * 100)} |`)
          .join("\n");
        if (insStr) {
          contextoTexto += `\n\n## INSUMOS CURVA A (80% do custo)\n| Insumo | Tipo | Un | Qtd Total | Preço Un. | Custo Total | % Custo |\n|---|---|---|---|---|---|---|\n${insStr}`;
        }
      }

      const systemWithContext = `${SYSTEM_PROMPT}\n\n---\n${contextoTexto}\n---\nUse os dados acima como base para todas as suas análises e respostas.`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemWithContext },
          ...input.messages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ],
        maxTokens: 2048,
      });

      const content = result.choices[0]?.message?.content;
      const text = typeof content === "string" ? content : JSON.stringify(content);
      return { resposta: text };
    }),

  // ── Análise rápida de um orçamento (sem histórico de chat) ─
  insightRapido: protectedProcedure
    .input(z.object({
      tipo: z.enum([
        "resumo_executivo",
        "reduzir_custo",
        "maximizar_margem",
        "analise_bdi",
        "curva_abc",
        "riscos",
      ]),
      contexto: z.object({
        codigo:        z.string(),
        bdiPercentual: z.number(),
        metaPercentual: z.number(),
        totalVenda:    z.number(),
        totalCusto:    z.number(),
        totalMeta:     z.number(),
        totalMateriais: z.number(),
        totalMdo:      z.number(),
        totalEquipamentos: z.number(),
        itemCount:     z.number(),
        topItens: z.array(z.object({
          eapCodigo:   z.string(),
          descricao:   z.string(),
          unidade:     z.string().optional(),
          quantidade:  z.number(),
          custoTotal:  z.number(),
          vendaTotal:  z.number(),
          custoTotalMat: z.number(),
          custoTotalMdo: z.number(),
          percentualCusto: z.number(),
        })).optional(),
        topInsumos: z.array(z.object({
          descricao:    z.string(),
          tipo:         z.string().optional(),
          unidade:      z.string().optional(),
          custoTotal:   z.number(),
          quantidadeTotal: z.number(),
          precoUnitComEncargos: z.number(),
          curvaAbc:     z.string().optional(),
          percentualTotal: z.number(),
        })).optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const prompts: Record<string, string> = {
        resumo_executivo: "Faça um resumo executivo deste orçamento em 5 bullet points. Destaque os pontos mais importantes para apresentação ao cliente/diretoria.",
        reduzir_custo: "Analise este orçamento e identifique as 3 principais oportunidades de redução de custo. Para cada uma, estime o potencial de economia em R$ e % e sugira ação concreta.",
        maximizar_margem: "Como posso maximizar a margem neste orçamento? Analise o BDI, a composição de custos e os itens da curva A. Dê recomendações específicas e quantificadas.",
        analise_bdi: `O BDI aplicado é ${(input.contexto.bdiPercentual * 100).toFixed(2)}%. Analise se está adequado para este tipo de obra. Compare com benchmarks do mercado brasileiro e sugira ajustes se necessário.`,
        curva_abc: "Analise a curva ABC dos insumos e composições. Identifique os itens mais críticos, quais têm maior potencial de negociação e onde focar esforços para redução de custo.",
        riscos: "Identifique os principais riscos financeiros neste orçamento. Considere itens com custo muito elevado, proporção Mat/MO atípica, BDI e margem. Sugira contingências.",
      };

      const pergunta = prompts[input.tipo] || prompts.resumo_executivo;

      const ctx = input.contexto;
      const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const pct = (v: number) => `${v.toFixed(2)}%`;
      const margem = ctx.totalVenda > 0 ? ((ctx.totalVenda - ctx.totalCusto) / ctx.totalVenda * 100) : 0;

      let contextoTexto = `Orçamento: ${ctx.codigo} | Venda: ${fmt(ctx.totalVenda)} | Custo: ${fmt(ctx.totalCusto)} | BDI: ${pct(ctx.bdiPercentual * 100)} | Margem: ${pct(margem)} | Mat: ${pct(ctx.totalMateriais / Math.max(ctx.totalCusto, 1) * 100)} | MO: ${pct(ctx.totalMdo / Math.max(ctx.totalCusto, 1) * 100)}`;

      if (ctx.topItens?.length) {
        contextoTexto += "\nTop serviços: " + ctx.topItens.slice(0, 8).map(i => `${i.descricao.substring(0,40)} (${fmt(i.custoTotal)}, ${pct(i.percentualCusto)})`).join("; ");
      }
      if (ctx.topInsumos?.filter(i => i.curvaAbc === "A").length) {
        contextoTexto += "\nInsumos curva A: " + ctx.topInsumos.filter(i => i.curvaAbc === "A").slice(0, 8).map(i => `${i.descricao.substring(0,35)} (${fmt(i.custoTotal)})`).join("; ");
      }

      const result = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\nContexto: " + contextoTexto },
          { role: "user", content: pergunta },
        ],
        maxTokens: 1200,
      });

      const content = result.choices[0]?.message?.content;
      const text = typeof content === "string" ? content : JSON.stringify(content);
      return { resposta: text };
    }),
});
