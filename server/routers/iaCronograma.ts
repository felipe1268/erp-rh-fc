import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import {
  iaCronogramaConhecimento,
  iaCronogramaChat,
  iaCronogramaAlertas,
  iaCronogramaCenarios,
  iaCronogramaMonitoramento,
  planejamentoAtividades,
  planejamentoRevisoes,
  planejamentoProjetos,
  planejamentoAvancos,
  lobConfig,
} from "../../drizzle/schema";
import { eq, and, or, ilike, desc, sql, isNull } from "drizzle-orm";

// ── WMO weather codes severity ────────────────────────────────────────────
function wmoSeverity(code: number, chuva: number, probChuva: number, vento: number): { tipo: string; sev: string; msg: string } | null {
  if (code >= 95) return { tipo: "tempestade", sev: "critica", msg: `Tempestade prevista (cód ${code}) — paralisar içamentos, andaimes e trabalhos em altura` };
  if (chuva > 20 || code >= 80) return { tipo: "chuva_forte", sev: "alta", msg: `Chuva forte prevista (${chuva.toFixed(0)}mm) — impacto em concretagem, armação, escavação e atividades externas` };
  if (chuva > 8 || probChuva > 75) return { tipo: "chuva", sev: "media", msg: `Chuva moderada/probabilidade alta (${chuva.toFixed(0)}mm, ${probChuva}%) — planejar alternativas internas` };
  if (vento > 50) return { tipo: "vento_forte", sev: "alta", msg: `Ventos muito fortes (${vento.toFixed(0)} km/h) — suspender içamentos, guindaste e andaimes` };
  if (vento > 30) return { tipo: "vento", sev: "media", msg: `Ventos fortes (${vento.toFixed(0)} km/h) — atenção com guindaste e estruturas temporárias` };
  if (probChuva > 55) return { tipo: "chuva_provavel", sev: "baixa", msg: `Probabilidade de chuva (${probChuva}%) — ter plano B com atividades internas` };
  return null;
}

// ── Detect if activity is weather-sensitive ───────────────────────────────
const ATIVIDADES_EXTERNAS = [
  "concreto", "concretagem", "concret", "escav", "fundaç", "fundacao",
  "estaca", "armação", "armacao", "aço", "estrutura", "iça", "içamento",
  "anda", "andaime", "cobert", "telhad", "paviment", "demoli",
  "terraplan", "drenag", "esgoto", "agua", "saneam", "viaduto",
  "pontes", "ponte", "alvenari", "reboc", "chapisco", "emboco",
  "impermeabil", "pintura extern", "moviment", "aterro",
];

function isAtividadeExterna(nome: string): boolean {
  const n = nome.toLowerCase();
  return ATIVIDADES_EXTERNAS.some(k => n.includes(k));
}

// ── Build AI system prompt ────────────────────────────────────────────────
function buildSystemPrompt(conhecimentos: any[]): string {
  const baseKnowledge = conhecimentos.length > 0
    ? `\n\n## Base de Conhecimento Acumulada (${conhecimentos.length} registros confirmados):\n` +
      conhecimentos.slice(0, 15).map(k =>
        `- **${k.palavrasChave}**: Equip: ${JSON.stringify(k.recursosEquipamentos)} | Efetivo: ${JSON.stringify(k.recursosEfetivo)}`
      ).join("\n")
    : "";

  return `Você é o **JULINHO — Assistente IA de Gestão de Obras** da FC Engenharia.

Você é um especialista sênior em gestão de projetos de construção civil brasileira, com profundo conhecimento em:
- Planejamento e controle de obras (PMBOK, Last Planner System)
- Método do Caminho Crítico (CPM) e análise de impactos em prazos
- Análise de avanço físico e financeiro
- Gestão de recursos (equipamentos, efetivo, materiais)
- Impacto climático em atividades de construção
- Normas brasileiras (NBR, NRs) aplicáveis à construção
- Estratégias de recuperação de prazo e planos de ataque
- Estimativa de recursos por tipo de atividade

## Sua Missão:
1. **Análise contínua**: Identificar riscos, desvios e oportunidades no cronograma
2. **Planos de ataque**: Sugerir estratégias concretas e executáveis para recuperar prazo
3. **Gestão de recursos**: Estimar equipamentos e efetivo necessário por atividade
4. **Impacto climático**: Vincular previsão do tempo às atividades da semana e gerar alertas
5. **Simulação de cenários**: Analisar impacto de diferentes decisões no prazo final
6. **Aprendizado**: Registrar boas práticas para aplicar em futuros projetos

## Regras de Comportamento:
- Responda SEMPRE em português brasileiro
- Seja direto, técnico e objetivo — você está falando com engenheiros e gestores
- Quando sugerir recursos, seja específico (ex: "1 caminhão betoneira 8m³", "6 armadores + 2 serventes")
- Cite % de impacto quando possível (ex: "pode atrasar 3 dias na atividade crítica X")
- Use emojis de forma profissional para facilitar leitura (⚠️ alerta, ✅ ok, 🔴 crítico, 🟡 atenção)
- Estruture respostas com headers quando forem longas
- Para planos de ataque, apresente sempre em formato: Ação → Impacto → Prazo para executar${baseKnowledge}`;
}

export const iaCronogramaRouter = router({

  // ── Chat com contexto completo do cronograma ──────────────────────────
  chat: protectedProcedure
    .input(z.object({
      projetoId:  z.number(),
      sessaoId:   z.string(),
      mensagem:   z.string(),
      tipo:       z.enum(["chat", "cenario", "recursos"]).default("chat"),
      contexto:   z.object({
        atividadesSemana: z.array(z.any()).optional(),
        clima:            z.any().optional(),
        alertasAtivos:    z.number().optional(),
        atividadesAtrasadas: z.array(z.any()).optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const companyId = (ctx.user as any).companyId;

      const [projeto, revisoes, conhecimentos] = await Promise.all([
        db.select().from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1),
        db.select().from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
          .orderBy(desc(planejamentoRevisoes.numero))
          .limit(1),
        db.select().from(iaCronogramaConhecimento)
          .where(or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, companyId)))
          .orderBy(desc(iaCronogramaConhecimento.confirmacoes))
          .limit(30),
      ]);

      const proj = projeto[0];
      const rev = revisoes[0];

      let atividades: any[] = [];
      if (rev) {
        atividades = await db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, rev.id))
          .orderBy(planejamentoAtividades.ordem)
          .limit(200);
      }

      const hoje = new Date();
      const semanaIni = new Date(hoje); semanaIni.setDate(hoje.getDate() - hoje.getDay() + 1);
      const semanaFim = new Date(semanaIni); semanaFim.setDate(semanaIni.getDate() + 6);
      const toDate = (d: Date) => d.toISOString().split("T")[0];

      const atividadesSemana = atividades.filter(a => a.dataInicio && a.dataFim &&
        a.dataFim >= toDate(semanaIni) && a.dataInicio <= toDate(semanaFim) && !a.isGrupo
      );
      const atrasadas = atividades.filter(a => a.dataFim && a.dataFim < toDate(hoje) && !a.isGrupo);

      const historicoDb = await db.select().from(iaCronogramaChat)
        .where(and(eq(iaCronogramaChat.projetoId, input.projetoId), eq(iaCronogramaChat.sessaoId, input.sessaoId)))
        .orderBy(iaCronogramaChat.criadoEm)
        .limit(20);

      const clima = input.contexto?.clima;
      const climaTexto = clima ? `
Previsão do tempo (próximos 7 dias):
${(clima.diasUteis ?? []).map((d: any) => `  - ${d.dt}: chuva ${d.chuva}mm, prob ${d.probChuva}%, vento ${d.vento}km/h`).join("\n")}` : "Clima não disponível.";

      const contextoProjeto = `
# Contexto do Projeto
**Projeto**: ${proj?.nome ?? "Desconhecido"} | **Local**: ${proj?.local ?? "N/A"}
**Período**: ${proj?.dataInicio ?? "?"} → ${proj?.dataTerminoContratual ?? "?"}
**Revisão ativa**: Rev. ${rev?.numero ?? "?"} | Total de atividades: ${atividades.length}
**Atividades na semana atual** (${toDate(semanaIni)} a ${toDate(semanaFim)}): ${atividadesSemana.length} atividades
**Atividades potencialmente atrasadas**: ${atrasadas.length}
${atividadesSemana.length > 0 ? `
Atividades desta semana:
${atividadesSemana.slice(0, 20).map(a => `  - [${a.eapCodigo ?? ""}] ${a.nome} | ${a.dataInicio}→${a.dataFim} | ${a.recursoPrincipal ?? "sem recurso"}`).join("\n")}` : ""}
${atrasadas.length > 0 ? `
Atividades atrasadas (amostra):
${atrasadas.slice(0, 10).map(a => `  - [${a.eapCodigo ?? ""}] ${a.nome} | prazo: ${a.dataFim}`).join("\n")}` : ""}

${climaTexto}`;

      const systemPrompt = buildSystemPrompt(conhecimentos);
      const mensagemComContexto = `${contextoProjeto}

---
**Pergunta do gestor:** ${input.mensagem}`;
      const messagesForLLM = [
        { role: "system" as const, content: systemPrompt },
        ...historicoDb.map(m => ({ role: m.role as "user" | "assistant", content: m.conteudo })),
        { role: "user" as const, content: mensagemComContexto },
      ];

      let resposta: string;
      try {
        const result = await invokeLLM({ messages: messagesForLLM, maxTokens: 2500 });
        const rawContent = result.choices?.[0]?.message?.content;
        resposta = typeof rawContent === "string" ? rawContent : "Não foi possível processar. Tente novamente.";
      } catch (err: any) {
        const isNoKey = err?.message?.includes("not configured");
        resposta = isNoKey
          ? "⚠️ **JULINHO offline** — Chave de API de IA não configurada. Acesse as configurações do projeto e defina a variável `OPENAI_API_KEY` para ativar o assistente."
          : `⚠️ **Erro ao contatar IA** — ${err?.message ?? "Erro desconhecido"}. Tente novamente em instantes.`;
        // Save to chat but return friendly message
        await db.insert(iaCronogramaChat).values([
          { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "user",      conteudo: input.mensagem, tipo: input.tipo },
          { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "assistant", conteudo: resposta,       tipo: input.tipo },
        ]);
        return { resposta, sessaoId: input.sessaoId, erro: true };
      }

      await db.insert(iaCronogramaChat).values([
        { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "user",      conteudo: input.mensagem, tipo: input.tipo },
        { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "assistant", conteudo: resposta,       tipo: input.tipo },
      ]);

      return { resposta, sessaoId: input.sessaoId };
    }),

  // ── Recuperar histórico do chat ────────────────────────────────────────
  historico: protectedProcedure
    .input(z.object({ projetoId: z.number(), sessaoId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(iaCronogramaChat)
        .where(and(eq(iaCronogramaChat.projetoId, input.projetoId), eq(iaCronogramaChat.sessaoId, input.sessaoId)))
        .orderBy(iaCronogramaChat.criadoEm);
    }),

  // ── Limpar histórico da sessão ─────────────────────────────────────────
  limparHistorico: protectedProcedure
    .input(z.object({ projetoId: z.number(), sessaoId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(iaCronogramaChat)
        .where(and(eq(iaCronogramaChat.projetoId, input.projetoId), eq(iaCronogramaChat.sessaoId, input.sessaoId)));
      return { ok: true };
    }),

  // ── Gerar alertas clima × atividades ─────────────────────────────────
  gerarAlertasClima: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      clima: z.object({
        diasUteis: z.array(z.object({
          dt: z.string(),
          code: z.number(),
          chuva: z.number(),
          probChuva: z.number(),
          vento: z.number(),
        })),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const rev = await db.select().from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRevisoes.numero))
        .limit(1);
      if (!rev[0]) return { alertas: [], gerados: 0 };

      const atividades = await db.select().from(planejamentoAtividades)
        .where(eq(planejamentoAtividades.revisaoId, rev[0].id));

      const novosAlertas: any[] = [];

      for (const dia of input.clima.diasUteis) {
        const sev = wmoSeverity(dia.code, dia.chuva, dia.probChuva, dia.vento);
        if (!sev) continue;

        const atvsNoDia = atividades.filter(a =>
          !a.isGrupo && a.dataInicio && a.dataFim &&
          a.dataFim >= dia.dt && a.dataInicio <= dia.dt &&
          isAtividadeExterna(a.nome)
        );

        if (atvsNoDia.length > 0) {
          for (const atv of atvsNoDia.slice(0, 5)) {
            const jaExiste = await db.select({ id: iaCronogramaAlertas.id }).from(iaCronogramaAlertas)
              .where(and(
                eq(iaCronogramaAlertas.projetoId, input.projetoId),
                eq(iaCronogramaAlertas.atividadeId, atv.id),
                eq(iaCronogramaAlertas.dataAlerta, dia.dt),
                eq(iaCronogramaAlertas.tipoAlerta, sev.tipo),
              )).limit(1);
            if (jaExiste.length > 0) continue;

            novosAlertas.push({
              projetoId:     input.projetoId,
              atividadeId:   atv.id,
              nomeAtividade: atv.nome,
              dataAlerta:    dia.dt,
              tipoAlerta:    sev.tipo,
              severidade:    sev.sev,
              descricao:     `${sev.msg} — Atividade "${atv.nome}" está programada para ${dia.dt}.`,
            });
          }
        } else if (sev.sev === "critica" || sev.sev === "alta") {
          const jaExiste = await db.select({ id: iaCronogramaAlertas.id }).from(iaCronogramaAlertas)
            .where(and(
              eq(iaCronogramaAlertas.projetoId, input.projetoId),
              eq(iaCronogramaAlertas.dataAlerta, dia.dt),
              eq(iaCronogramaAlertas.tipoAlerta, sev.tipo),
              isNull(iaCronogramaAlertas.atividadeId),
            )).limit(1);
          if (jaExiste.length === 0) {
            novosAlertas.push({
              projetoId:  input.projetoId,
              dataAlerta: dia.dt,
              tipoAlerta: sev.tipo,
              severidade: sev.sev,
              descricao:  `${sev.msg} — Verifique as atividades externas do dia.`,
            });
          }
        }
      }

      if (novosAlertas.length > 0) {
        await db.insert(iaCronogramaAlertas).values(novosAlertas);
      }

      return { alertas: novosAlertas, gerados: novosAlertas.length };
    }),

  // ── Listar alertas ────────────────────────────────────────────────────
  listarAlertas: protectedProcedure
    .input(z.object({ projetoId: z.number(), somenteAtivos: z.boolean().default(true) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conds = [eq(iaCronogramaAlertas.projetoId, input.projetoId)];
      if (input.somenteAtivos) conds.push(eq(iaCronogramaAlertas.reconhecido, false));
      return db.select().from(iaCronogramaAlertas)
        .where(and(...conds))
        .orderBy(desc(iaCronogramaAlertas.geradoEm))
        .limit(50);
    }),

  // ── Reconhecer alerta ─────────────────────────────────────────────────
  reconhecerAlerta: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(iaCronogramaAlertas)
        .set({ reconhecido: true })
        .where(eq(iaCronogramaAlertas.id, input.id));
      return { ok: true };
    }),

  reconhecerTodosAlertas: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(iaCronogramaAlertas)
        .set({ reconhecido: true })
        .where(and(eq(iaCronogramaAlertas.projetoId, input.projetoId), eq(iaCronogramaAlertas.reconhecido, false)));
      return { ok: true };
    }),

  // ── Simular cenário ───────────────────────────────────────────────────
  simularCenario: protectedProcedure
    .input(z.object({
      projetoId:   z.number(),
      titulo:      z.string(),
      descricao:   z.string(),
      tipoCenario: z.string().optional(),
      parametros:  z.record(z.string(), z.any()).optional(),
      mensagem:    z.string(),
      sessaoId:    z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const companyId = (ctx.user as any).companyId;

      const [projeto, revisoes, conhecimentos] = await Promise.all([
        db.select().from(planejamentoProjetos).where(eq(planejamentoProjetos.id, input.projetoId)).limit(1),
        db.select().from(planejamentoRevisoes)
          .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
          .orderBy(desc(planejamentoRevisoes.numero))
          .limit(1),
        db.select().from(iaCronogramaConhecimento)
          .where(or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, companyId)))
          .orderBy(desc(iaCronogramaConhecimento.confirmacoes)).limit(20),
      ]);

      const proj = projeto[0];
      const rev = revisoes[0];

      let atividades: any[] = [];
      if (rev) {
        atividades = await db.select().from(planejamentoAtividades)
          .where(eq(planejamentoAtividades.revisaoId, rev.id)).limit(200);
      }

      const hoje = new Date().toISOString().split("T")[0];
      const atrasadas = atividades.filter(a => a.dataFim && a.dataFim < hoje && !a.isGrupo);

      const historicoCenario = await db.select().from(iaCronogramaChat)
        .where(and(eq(iaCronogramaChat.projetoId, input.projetoId), eq(iaCronogramaChat.sessaoId, input.sessaoId)))
        .orderBy(iaCronogramaChat.criadoEm).limit(15);

      // Extrair dados financeiros dos parâmetros, se enviados
      const p = input.parametros ?? {} as Record<string, any>;
      const valorContrato     = p["valorContrato"]      ? Number(p["valorContrato"])      : 0;
      const custoTotal        = p["custoTotal"]         ? Number(p["custoTotal"])         : 0;
      const margemPerc        = valorContrato > 0 && custoTotal > 0
        ? +((valorContrato - custoTotal) / valorContrato * 100).toFixed(1)
        : p["margemPercAtual"] ? Number(p["margemPercAtual"]) : null;
      const faturamentoMes    = p["faturamentoMesPrev"] ? Number(p["faturamentoMesPrev"]) : 0;
      const custoExtraEstimado = p["custoExtraEstimado"] ? Number(p["custoExtraEstimado"]) : 0;
      const diasAtrasoAtual   = p["diasAtrasoAtual"]    ? Number(p["diasAtrasoAtual"])    : 0;
      const spiAtual          = p["spiAtual"]           ? Number(p["spiAtual"])           : null;
      const avancoDesvio      = p["avancoDesvio"]       ? Number(p["avancoDesvio"])       : 0;

      const contextFinanceiro = valorContrato > 0 ? `
## Contexto Financeiro da Obra:
- Valor do Contrato (Venda): R$ ${valorContrato.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Custo Orçado Total: R$ ${custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Margem Bruta Prevista: ${margemPerc !== null ? margemPerc + "%" : "não informada"}
- Faturamento Previsto do Mês: R$ ${faturamentoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Custo Extra Estimado do Cenário: R$ ${custoExtraEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Desvio Físico Acumulado: ${avancoDesvio.toFixed(1)}pp
- SPI Atual: ${spiAtual !== null ? spiAtual.toFixed(2) : "não informado"}
- Dias de atraso acumulado: ${diasAtrasoAtual} dias` : "";

      const hoje2 = new Date().toLocaleDateString("pt-BR");
      const systemPrompt = `Você é o JULINHO — Motor de Decisão Estratégica de Obras da FC Engenharia.
Analise a solicitação do gestor e retorne EXCLUSIVAMENTE um objeto JSON válido. NENHUM texto fora do JSON.

Estrutura obrigatória:
{
  "diagnostico": {
    "criticidade": "baixo|medio|alto|critico",
    "resumo": "2-3 frases descrevendo a situação atual com os dados reais",
    "causaRaiz": "causa principal do desvio ou problema identificado",
    "alertaPrincipal": "o que acontece concretamente se nenhuma ação for tomada"
  },
  "cenarios": [
    {
      "id": "A",
      "nome": "nome curto do cenário A",
      "abordagem": "descrição técnica em 1-2 frases de como funciona esta abordagem",
      "diasImpacto": 0,
      "custoAdicional": 0,
      "novaMargemPerc": 0.0,
      "prazoResultante": "Nova data estimada de término: DD/MM/AAAA",
      "impactoCaixa": "texto curto sobre efeito no fluxo de caixa das próximas medições",
      "riscos": "principal risco desta abordagem em 1 frase",
      "viabilidade": "alta|media|baixa",
      "pro": "maior vantagem desta opção em 1 frase",
      "contra": "maior desvantagem em 1 frase"
    },
    { "id": "B", "nome": "...", "abordagem": "...", "diasImpacto": 0, "custoAdicional": 0, "novaMargemPerc": 0.0, "prazoResultante": "...", "impactoCaixa": "...", "riscos": "...", "viabilidade": "alta|media|baixa", "pro": "...", "contra": "..." },
    { "id": "C", "nome": "...", "abordagem": "...", "diasImpacto": 0, "custoAdicional": 0, "novaMargemPerc": 0.0, "prazoResultante": "...", "impactoCaixa": "...", "riscos": "...", "viabilidade": "alta|media|baixa", "pro": "...", "contra": "..." }
  ],
  "recomendado": "A|B|C",
  "justificativa": "por que o cenário recomendado é o melhor para esta situação específica em 2-3 frases técnicas",
  "acoesImediatas": [
    "Ação concreta 1 — executar ESTA SEMANA com responsável e prazo",
    "Ação concreta 2",
    "Ação concreta 3",
    "Ação concreta 4"
  ],
  "indicadores": [
    "KPI 1: métrica a monitorar semanalmente e meta esperada",
    "KPI 2",
    "KPI 3"
  ]
}

Base de conhecimento disponível: ${conhecimentos.slice(0, 10).map(k => k.palavrasChave).join(", ") || "não configurada"}
Data de análise: ${hoje2}
Seja técnico, preciso com os números e realista. Não use valores fictícios — baseie-se nos dados fornecidos.`;

      const contextoProjeto = `DADOS DO PROJETO:
Projeto: ${proj?.nome ?? "não informado"}
Local: ${proj?.local ?? "não informado"}
Término contratual: ${proj?.dataTerminoContratual ?? "não informado"}
Atividades: total=${atividades.length} | atrasadas=${atrasadas.length}
${contextFinanceiro}

SOLICITAÇÃO:
Tipo: ${input.titulo}
Descrição: ${input.mensagem}`;

      const messagesForLLM = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: contextoProjeto },
      ];

      let resposta: string;
      try {
        const result = await invokeLLM({ messages: messagesForLLM, maxTokens: 4000, response_format: { type: "json_object" } });
        const rawContent = result.choices?.[0]?.message?.content;
        resposta = typeof rawContent === "string" ? rawContent : JSON.stringify({ diagnostico: { criticidade: "medio", resumo: "Não foi possível gerar análise.", causaRaiz: "—", alertaPrincipal: "—" }, cenarios: [], recomendado: null, justificativa: "—", acoesImediatas: [], indicadores: [] });
      } catch (err: any) {
        const isNoKey = err?.message?.includes("not configured");
        resposta = isNoKey
          ? "⚠️ **JULINHO offline** — Chave de API de IA não configurada. Defina `OPENAI_API_KEY` nas secrets do projeto para ativar o simulador."
          : `⚠️ **Erro ao contatar IA** — ${err?.message ?? "Erro desconhecido"}. Tente novamente.`;
      }

      const [cenario] = await db.insert(iaCronogramaCenarios).values({
        projetoId:   input.projetoId,
        companyId,
        titulo:      input.titulo,
        descricao:   input.descricao || input.mensagem.slice(0, 200),
        tipoCenario: input.tipoCenario ?? "outro",
        parametros:  input.parametros ?? {},
        resultadoIA: resposta,
        criadoPor:   (ctx.user as any).name ?? "Usuário",
      }).returning();

      await db.insert(iaCronogramaChat).values([
        { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "user",      conteudo: `📊 **Cenário: ${input.titulo}**\n\n${input.mensagem}`, tipo: "cenario" },
        { projetoId: input.projetoId, companyId, sessaoId: input.sessaoId, role: "assistant", conteudo: resposta, tipo: "cenario" },
      ]);

      return { resposta, cenarioId: cenario.id };
    }),

  // ── Listar cenários salvos ────────────────────────────────────────────
  listarCenarios: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(iaCronogramaCenarios)
        .where(eq(iaCronogramaCenarios.projetoId, input.projetoId))
        .orderBy(desc(iaCronogramaCenarios.criadoEm))
        .limit(20);
    }),

  // ── Aprovar cenário ────────────────────────────────────────────────────
  aprovarCenario: protectedProcedure
    .input(z.object({
      cenarioId:           z.number(),
      planoAcao:           z.string().optional(),
      atividadesAfetadas:  z.array(z.object({ id: z.number(), nome: z.string(), aceleracao: z.string().optional() })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db.update(iaCronogramaCenarios)
        .set({
          status:             "aprovado",
          aprovadoEm:         new Date(),
          aprovadoPor:        (ctx.user as any).name ?? "Usuário",
          planoAcao:          input.planoAcao ?? null,
          atividadesAfetadas: input.atividadesAfetadas ?? [],
        })
        .where(eq(iaCronogramaCenarios.id, input.cenarioId));
      return { ok: true };
    }),

  // ── Registrar monitoramento semanal do plano ───────────────────────────
  registrarMonitoramento: protectedProcedure
    .input(z.object({
      cenarioId:       z.number(),
      projetoId:       z.number(),
      semana:          z.string(),
      avancoReal:      z.number().optional(),
      spiFim:          z.number().optional(),
      custoRealizado:  z.number().optional(),
      observacao:      z.string().optional(),
      status:          z.enum(["no_prazo", "atrasado", "adiantado", "critico"]).default("no_prazo"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const companyId = (ctx.user as any).companyId;
      await db.insert(iaCronogramaMonitoramento).values({
        cenarioId:      input.cenarioId,
        projetoId:      input.projetoId,
        companyId,
        semana:         input.semana,
        avancoReal:     input.avancoReal?.toString(),
        spiFim:         input.spiFim?.toString(),
        custoRealizado: input.custoRealizado?.toString(),
        observacao:     input.observacao,
        status:         input.status,
        registradoPor:  (ctx.user as any).name ?? "Usuário",
      });
      return { ok: true };
    }),

  // ── Listar monitoramento de um cenário ────────────────────────────────
  listarMonitoramento: protectedProcedure
    .input(z.object({ cenarioId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(iaCronogramaMonitoramento)
        .where(eq(iaCronogramaMonitoramento.cenarioId, input.cenarioId))
        .orderBy(desc(iaCronogramaMonitoramento.semana))
        .limit(20);
    }),

  // ── Sugerir recursos para atividades da semana ───────────────────────
  sugerirRecursos: protectedProcedure
    .input(z.object({
      projetoId:       z.number(),
      atividades:      z.array(z.object({ id: z.number(), nome: z.string(), dataInicio: z.string().optional(), dataFim: z.string().optional() })),
      tipoObra:        z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const companyId = (ctx.user as any).companyId;

      const conhecimentos = await db.select().from(iaCronogramaConhecimento)
        .where(or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, companyId)))
        .orderBy(desc(iaCronogramaConhecimento.confirmacoes))
        .limit(50);

      const nomesAtividades = input.atividades.map(a => `- ${a.nome}`).join("\n");
      const baseTexto = conhecimentos.length > 0
        ? `\n\nBase de conhecimento disponível:\n${conhecimentos.slice(0, 15).map(k => `  ${k.palavrasChave}: ${JSON.stringify(k.recursosEquipamentos)}`).join("\n")}`
        : "";

      const prompt = `Você é um especialista em gestão de obras. Para cada atividade abaixo, sugira os recursos necessários (equipamentos e efetivo).
Tipo de obra: ${input.tipoObra ?? "construção civil"}${baseTexto}

Atividades da semana:
${nomesAtividades}

Responda com um JSON no formato:
{
  "sugestoes": [
    {
      "atividade": "nome da atividade",
      "equipamentos": ["equipamento 1", "equipamento 2"],
      "efetivo": ["cargo/qtd", "cargo/qtd"],
      "observacao": "observação breve"
    }
  ]
}`;

      let sugestoes: any[] = [];
      try {
        const result = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
          maxTokens: 1200,
          responseFormat: { type: "json_object" },
        });
        const rawContent = result.choices?.[0]?.message?.content;
        try {
          const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : "{}");
          sugestoes = parsed.sugestoes ?? [];
        } catch { sugestoes = []; }
      } catch { sugestoes = []; }

      for (const sug of sugestoes) {
        const jaExiste = await db.select({ id: iaCronogramaConhecimento.id }).from(iaCronogramaConhecimento)
          .where(and(
            ilike(iaCronogramaConhecimento.palavrasChave, `%${sug.atividade.slice(0, 30)}%`),
            or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, companyId)),
          )).limit(1);

        if (jaExiste.length === 0) {
          await db.insert(iaCronogramaConhecimento).values({
            companyId,
            palavrasChave:        sug.atividade,
            tipoAtividade:        input.tipoObra ?? "geral",
            recursosEquipamentos: sug.equipamentos ?? [],
            recursosEfetivo:      sug.efetivo ?? [],
            fonte:                "ia",
          });
        }
      }

      return { sugestoes };
    }),

  // ── Base de conhecimento ──────────────────────────────────────────────
  listarConhecimento: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), global: z.boolean().default(false) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const cId = input.companyId ?? (ctx.user as any).companyId;
      return db.select().from(iaCronogramaConhecimento)
        .where(input.global
          ? undefined
          : or(isNull(iaCronogramaConhecimento.companyId), eq(iaCronogramaConhecimento.companyId, cId))
        )
        .orderBy(desc(iaCronogramaConhecimento.confirmacoes))
        .limit(100);
    }),

  confirmarConhecimento: protectedProcedure
    .input(z.object({ id: z.number(), aceitar: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (input.aceitar) {
        await db.update(iaCronogramaConhecimento)
          .set({ confirmacoes: sql`${iaCronogramaConhecimento.confirmacoes} + 1`, atualizadoEm: new Date() })
          .where(eq(iaCronogramaConhecimento.id, input.id));
      } else {
        await db.update(iaCronogramaConhecimento)
          .set({ rejeicoes: sql`${iaCronogramaConhecimento.rejeicoes} + 1`, atualizadoEm: new Date() })
          .where(eq(iaCronogramaConhecimento.id, input.id));
      }
      return { ok: true };
    }),

  atualizarConhecimento: protectedProcedure
    .input(z.object({
      id:                   z.number(),
      palavrasChave:        z.string().optional(),
      recursosEquipamentos: z.array(z.string()).optional(),
      recursosEfetivo:      z.array(z.string()).optional(),
      contextoObra:         z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...upd } = input;
      await db.update(iaCronogramaConhecimento)
        .set({ ...upd, atualizadoEm: new Date() })
        .where(eq(iaCronogramaConhecimento.id, id));
      return { ok: true };
    }),

  excluirConhecimento: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(iaCronogramaConhecimento).where(eq(iaCronogramaConhecimento.id, input.id));
      return { ok: true };
    }),

  // ── Análise de Desvio de Prazo ────────────────────────────────────────────
  analisarDesvio: protectedProcedure
    .input(z.object({
      projetoId:       z.number(),
      nomeObra:        z.string(),
      semana:          z.string(),
      desvioFisico:    z.number(),     // pp (negativo = atrasado)
      avancoPrevisto:  z.number(),     // %
      avancoRealizado: z.number(),     // %
      spi:             z.number(),
      dataTermino:     z.string().nullable().optional(),
      atividadesAtrasadas: z.array(z.object({
        nome:       z.string(),
        eapCodigo:  z.string().optional(),
        desvio:     z.number(),
        previsto:   z.number(),
        realizado:  z.number(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Carregar base de conhecimento para enriquecer o contexto
      const conhecimentos = await db.select()
        .from(iaCronogramaConhecimento)
        .where(
          or(
            eq(iaCronogramaConhecimento.companyId, 0),
            isNull(iaCronogramaConhecimento.companyId)
          )
        )
        .limit(10);

      const systemPrompt = buildSystemPrompt(conhecimentos);

      // Calcular impacto em dias
      const diasAtraso = input.dataTermino
        ? (() => {
            const termino = new Date(input.dataTermino + "T12:00:00");
            const hoje = new Date(input.semana + "T12:00:00");
            const diasRestantes = Math.max(0, Math.round((termino.getTime() - hoje.getTime()) / 86400000));
            // Proporção do desvio em dias
            return Math.round(Math.abs(input.desvioFisico) / 100 * diasRestantes);
          })()
        : null;

      const atrasadasTxt = (input.atividadesAtrasadas ?? [])
        .slice(0, 8)
        .map(a => `  - ${a.eapCodigo ? `[${a.eapCodigo}] ` : ""}${a.nome}: Prev=${a.previsto.toFixed(1)}%, Real=${a.realizado.toFixed(1)}%, Desvio=${a.desvio.toFixed(1)}pp`)
        .join("\n") || "  (não informadas)";

      const userPrompt = `## ALERTA DE DESVIO DE PRAZO — OBRA: ${input.nomeObra}

**Data de referência:** ${new Date(input.semana + "T12:00:00").toLocaleDateString("pt-BR")}

**Indicadores da semana:**
- Avanço Previsto Acumulado: **${input.avancoPrevisto.toFixed(1)}%**
- Avanço Realizado Acumulado: **${input.avancoRealizado.toFixed(1)}%**
- Desvio Físico: **${input.desvioFisico.toFixed(1)} pp** (ATRASADO)
- SPI: **${input.spi.toFixed(2)}** ${input.spi < 0.85 ? "🔴 CRÍTICO" : input.spi < 0.95 ? "🟡 ATENÇÃO" : "🟠 MONITORAR"}
${diasAtraso !== null ? `- Impacto estimado: **~${diasAtraso} dias de atraso** no prazo contratual` : ""}

**Atividades com maior desvio negativo:**
${atrasadasTxt}

---

Faça uma análise técnica detalhada deste desvio de prazo e responda EXATAMENTE neste formato:

## ⚠️ Diagnóstico do Desvio
(2-3 parágrafos explicando as causas prováveis do desvio com base nos dados, o que isso pode acarretar se não for corrigido agora, incluindo impacto no prazo final, nas medições e no faturamento)

## 📋 Plano de Ação 1 — [Nome do plano: ex. "Aceleração com Horas Extras"]
**Ações:** (liste 3-4 ações concretas e específicas)
**Impacto esperado:** (ex: recuperar X% em Y semanas)
**Recursos adicionais:** (equipamentos e efetivo específicos necessários)
**Custo adicional estimado:** (estimativa percentual sobre o custo da semana)

## 📋 Plano de Ação 2 — [Nome do plano: ex. "Reprogramação com Reforço de Equipe"]
**Ações:** (liste 3-4 ações concretas e específicas)
**Impacto esperado:** (ex: recuperar X% em Y semanas)
**Recursos adicionais:** (equipamentos e efetivo específicos necessários)
**Custo adicional estimado:** (estimativa percentual sobre o custo da semana)

## 📋 Plano de Ação 3 — [Nome do plano: ex. "Revisão de Sequência Construtiva"]
**Ações:** (liste 3-4 ações concretas e específicas)
**Impacto esperado:** (ex: recuperar X% em Y semanas)
**Recursos adicionais:** (equipamentos e efetivo específicos necessários)
**Custo adicional estimado:** (estimativa percentual sobre o custo da semana)

## 🎯 Recomendação do JULINHO
(1 parágrafo com qual plano você recomenda e por quê, considerando custo-benefício)`;

      let analise: string;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 2000,
        });
        const raw = result.choices?.[0]?.message?.content;
        analise = typeof raw === "string" ? raw : "Não foi possível gerar análise no momento.";
      } catch (err: any) {
        const isNoKey = err?.message?.includes("not configured");
        analise = isNoKey
          ? "⚠️ **JULINHO offline** — API de IA não configurada. Configure `OPENAI_API_KEY` nas secrets para ativar a análise de desvio."
          : `⚠️ **Erro ao contatar IA** — ${err?.message ?? "Erro desconhecido"}.`;
      }

      return { analise };
    }),

  // ══════════════════════════════════════════════════════════════════════
  // LINHA DE BALANÇOS — endpoints
  // ══════════════════════════════════════════════════════════════════════

  getLobData: protectedProcedure
    .input(z.object({ projetoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [revisao] = await db
        .select()
        .from(planejamentoRevisoes)
        .where(eq(planejamentoRevisoes.projetoId, input.projetoId))
        .orderBy(desc(planejamentoRevisoes.id))
        .limit(1);

      if (!revisao) return { revisaoId: null, pavimentos: [], disciplinas: [], linhas: [], config: null };

      const revisaoId = revisao.id;

      const PAVIMENTO_KEYWORDS = ["PAVIMENTO", "ANDAR", "TÉRREO", "TERREO", "COBERTURA", "SUBSOLO", "PAVTO"];
      const pavimentos = await db
        .select()
        .from(planejamentoAtividades)
        .where(
          and(
            eq(planejamentoAtividades.projetoId, input.projetoId),
            eq(planejamentoAtividades.revisaoId, revisaoId),
            eq(planejamentoAtividades.nivel, 1),
            eq(planejamentoAtividades.isGrupo, true),
            or(...PAVIMENTO_KEYWORDS.map(k => ilike(planejamentoAtividades.nome, `%${k}%`)))
          )
        )
        .orderBy(planejamentoAtividades.ordem);

      if (pavimentos.length === 0) return { revisaoId, pavimentos: [], disciplinas: [], linhas: [], config: null };

      const allN2: {
        pavimentoId: number; pavimentoNome: string; pavimentoOrdem: number;
        disciplinaId: number; disciplinaNome: string; disciplinaOrdem: number;
        eapCodigo: string | null; dataInicio: string | null; dataFim: string | null;
        percentualRealizado: number;
      }[] = [];

      for (const pav of pavimentos) {
        const n2s = await db
          .select()
          .from(planejamentoAtividades)
          .where(
            and(
              eq(planejamentoAtividades.revisaoId, revisaoId),
              eq(planejamentoAtividades.nivel, 2),
              sql`${planejamentoAtividades.eapCodigo} LIKE ${pav.eapCodigo + ".%"}`
            )
          )
          .orderBy(planejamentoAtividades.ordem);

        for (const n2 of n2s) {
          const [avancoRow] = await db
            .select({ pct: sql<number>`COALESCE(MAX(CAST(percentual_acumulado AS FLOAT)), 0)` })
            .from(planejamentoAvancos)
            .where(
              and(
                eq(planejamentoAvancos.revisaoId, revisaoId),
                sql`atividade_id IN (
                  SELECT id FROM planejamento_atividades
                  WHERE revisao_id = ${revisaoId}
                  AND eap_codigo LIKE ${n2.eapCodigo + "%"}
                )`
              )
            );

          allN2.push({
            pavimentoId: pav.id,
            pavimentoNome: pav.nome.replace(/:$/, "").trim(),
            pavimentoOrdem: pav.ordem ?? 0,
            disciplinaId: n2.id,
            disciplinaNome: n2.nome.replace(/:$/, "").trim(),
            disciplinaOrdem: n2.ordem ?? 0,
            eapCodigo: n2.eapCodigo,
            dataInicio: n2.dataInicio,
            dataFim: n2.dataFim,
            percentualRealizado: avancoRow?.pct ?? 0,
          });
        }
      }

      const disciplinas = [...new Set(allN2.map(r => r.disciplinaNome))];

      const [config] = await db
        .select()
        .from(lobConfig)
        .where(eq(lobConfig.projetoId, input.projetoId))
        .limit(1);

      return {
        revisaoId,
        pavimentos: pavimentos.map(p => ({
          id: p.id,
          nome: p.nome.replace(/:$/, "").trim(),
          ordem: p.ordem ?? 0,
          dataInicio: p.dataInicio,
          dataFim: p.dataFim,
        })),
        disciplinas,
        linhas: allN2,
        config: config ?? null,
      };
    }),

  saveLobConfig: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      bufferMinimoDias: z.number().default(5),
      ritmoAlvoPavsSemana: z.number().default(1.0),
      pavimentosExcluidos: z.array(z.string()).default([]),
      disciplinasConfig: z.array(z.object({
        nome: z.string(),
        cor: z.string(),
        visivel: z.boolean(),
        ordem: z.number(),
      })).default([]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const existing = await db
        .select({ id: lobConfig.id })
        .from(lobConfig)
        .where(eq(lobConfig.projetoId, input.projetoId))
        .limit(1);

      if (existing.length > 0) {
        await db.update(lobConfig).set({
          bufferMinimoDias: input.bufferMinimoDias,
          ritmoAlvoPavsSemana: String(input.ritmoAlvoPavsSemana),
          pavimentosExcluidos: input.pavimentosExcluidos as any,
          disciplinasConfig: input.disciplinasConfig as any,
          atualizadoEm: new Date(),
        }).where(eq(lobConfig.projetoId, input.projetoId));
      } else {
        await db.insert(lobConfig).values({
          projetoId: input.projetoId,
          bufferMinimoDias: input.bufferMinimoDias,
          ritmoAlvoPavsSemana: String(input.ritmoAlvoPavsSemana),
          pavimentosExcluidos: input.pavimentosExcluidos as any,
          disciplinasConfig: input.disciplinasConfig as any,
        });
      }
      return { ok: true };
    }),

  analisarLOB: protectedProcedure
    .input(z.object({
      projetoId: z.number(),
      nomeProjeto: z.string(),
      numPavimentos: z.number(),
      numDisciplinas: z.number(),
      bufferMinimoDias: z.number(),
      colisoes: z.array(z.object({
        disciplina1: z.string(),
        disciplina2: z.string(),
        pavimento: z.string(),
        diasGap: z.number(),
      })),
      ritmoPorDisciplina: z.array(z.object({
        disciplina: z.string(),
        ritmoPlaneadoPavsSemana: z.number(),
        ritmoRealizadoPavsSemana: z.number(),
        desvioPercent: z.number(),
      })),
      disciplinaMaisAtrasada: z.string().optional(),
      disciplinaMaisAdiantada: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const systemPrompt = `Você é JULINHO, IA especialista em gestão de obras verticais e Linha de Balanços (LOB).
Analise os dados LOB desta obra e forneça diagnóstico técnico preciso sobre colisões entre frentes, desvios de ritmo e risco ao prazo.
Seja específico, técnico e prático. Use linguagem direta de engenharia de obras.`;

      // Mostrar apenas top 5 colisões mais críticas (menor gap = maior risco)
      const colisoesSorted = [...input.colisoes].sort((a, b) => a.diasGap - b.diasGap);
      const colisoesPrincipais = colisoesSorted.slice(0, 5);
      const colisoesText = input.colisoes.length === 0
        ? "Nenhuma colisão detectada — todas as frentes dentro do buffer mínimo."
        : [
            ...colisoesPrincipais.map(c =>
              `- ${c.disciplina1} → ${c.disciplina2} no ${c.pavimento} (gap: ${c.diasGap}d | mínimo: ${input.bufferMinimoDias}d)`
            ),
            input.colisoes.length > 5 ? `... e mais ${input.colisoes.length - 5} colisões adicionais` : ""
          ].filter(Boolean).join("\n");

      // Top 3 disciplinas com maior desvio negativo
      const ritmoSorted = [...input.ritmoPorDisciplina].sort((a, b) => a.desvioPercent - b.desvioPercent);
      const ritmoTop = ritmoSorted.slice(0, 4);
      const ritmoText = ritmoTop.map(r =>
        `- ${r.disciplina}: plan ${r.ritmoPlaneadoPavsSemana.toFixed(2)} pavs/sem | real ${r.ritmoRealizadoPavsSemana.toFixed(2)} pavs/sem | desvio ${r.desvioPercent > 0 ? "+" : ""}${r.desvioPercent.toFixed(0)}%`
      ).join("\n");

      const userPrompt = `# Análise LOB — ${input.nomeProjeto}

**Configuração:** ${input.numPavimentos} pavimentos | ${input.numDisciplinas} disciplinas | buffer mínimo ${input.bufferMinimoDias} dias
**Total de colisões detectadas:** ${input.colisoes.length}
${input.disciplinaMaisAtrasada ? `**Disciplina mais atrasada:** ${input.disciplinaMaisAtrasada}` : ""}
${input.disciplinaMaisAdiantada ? `**Disciplina mais adiantada:** ${input.disciplinaMaisAdiantada}` : ""}

**Top ${colisoesPrincipais.length} colisões críticas (menor gap):**
${colisoesText}

**Ritmo das principais disciplinas (maior desvio):**
${ritmoText}

---
Responda EXATAMENTE neste formato (seja conciso e direto):

## 🏗️ Diagnóstico LOB
(1 parágrafo: situação geral — crítico/controlado, principais riscos ao prazo)

## 🎯 3 Ações Prioritárias para Resolver
1. **[DISCIPLINA]** — (ação específica: o quê, quem, quando, resultado esperado)
2. **[DISCIPLINA]** — (ação específica: o quê, quem, quando, resultado esperado)
3. **[DISCIPLINA]** — (ação específica: o quê, quem, quando, resultado esperado)

## ⚡ Colisões Críticas
(as 3 mais graves com impacto no prazo — seja específico)

## 📈 Desvios de Ritmo
(as 2 disciplinas com maior atraso: causa provável e consequência)

## ✅ Recomendação Final do JULINHO
(1 frase: o que precisa acontecer ESTA SEMANA para estabilizar a Linha de Balanços)`;

      let analise: string;
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 3000,
        });
        const raw = result.choices?.[0]?.message?.content;
        analise = typeof raw === "string" ? raw : "Não foi possível gerar análise LOB no momento.";
      } catch (err: any) {
        const isNoKey = err?.message?.includes("not configured");
        analise = isNoKey
          ? "⚠️ **JULINHO offline** — API de IA não configurada. Configure `OPENAI_API_KEY` nas secrets para ativar a análise LOB."
          : `⚠️ **Erro ao contatar IA** — ${err?.message ?? "Erro desconhecido"}.`;
      }

      return { analise };
    }),
});
