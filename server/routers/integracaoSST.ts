import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getUserCompanyLinks } from "../db";
import { assertRaioXAccess } from "../raioXGuard";
import {
  sstIntegracaoConfig, sstIntegracaoModulos, sstIntegracaoPerguntas,
  sstIntegracaoAlternativas, sstIntegracaoRegistros, sstIntegracaoRespostas,
  sstIntegracaoSessoes, employees, warnings, funcionariosTerceiros, obras,
} from "../../drizzle/schema";
import { eq, and, sql, desc, asc, isNull, inArray, lte, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

// Rev. 2921 — Guard canônico de acesso por empresa (espelha
// `assertCompanyAccess` de ferramentasTerceiros/terceiros). O check ANTERIOR
// lia `ctx.user.companyIds`, campo que NÃO existe no objeto user (linha da
// tabela `users`) → `ids` sempre `[]` → TODO usuário não-`admin_master` (ex.:
// grupo SST) era BLOQUEADO em TODA tela do módulo Integração ("Acesso negado a
// esta empresa"). Regra correta: admin/admin_master → libera; usuário COM
// vínculos em `user_companies` → exige pertencer; usuário SEM vínculos → libera
// (acesso é governado por grupo/módulo, não pela empresa-casa).
async function assertCompanyAccess(ctx: any, companyId: number) {
  if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctx.user.role === "admin" || ctx.user.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctx.user.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return; // sem vínculos = acesso global por grupo/módulo
  if (!new Set<number>(allowedIds).has(companyId))
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado a esta empresa" });
}

function gerarToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Rev. 2047 — Perguntas-padrão "10 Regras de Ouro" da FC ENGENHARIA
// REESCRITAS pra serem FIÉIS ao vídeo "INTEGRAÇÃO FC ENGENHARIA" (cultura
// corporativa + conduta), substituindo as NRs genéricas da Rev. 2046.
// Linguagem simples (público alvo: servente/ajudante, baixa escolaridade).
// Cobre: pontualidade, ausência, celular, uniforme, materiais, insubordinação,
// assédio sexual/moral, intolerância, agressão, álcool/drogas, furto, EPI.
export const PERGUNTAS_REGRAS_OURO: { texto: string; alternativas: { texto: string; correta: boolean }[] }[] = [
  {
    texto: "Cheguei atrasado no trabalho. O que pode acontecer?",
    alternativas: [
      { texto: "Nada, atraso é normal", correta: false },
      { texto: "Posso receber advertência e até perder o pagamento do dia", correta: true },
      { texto: "Só perco o café da manhã", correta: false },
    ],
  },
  {
    texto: "Não vou poder ir trabalhar amanhã. O que devo fazer?",
    alternativas: [
      { texto: "Faltar e não avisar ninguém", correta: false },
      { texto: "Avisar meu gestor o quanto antes e levar atestado se for médico", correta: true },
      { texto: "Mandar recado por outro colega no dia seguinte", correta: false },
    ],
  },
  {
    texto: "Posso usar meu celular pessoal durante o horário de trabalho?",
    alternativas: [
      { texto: "Sim, o tempo todo", correta: false },
      { texto: "Só com autorização prévia do gestor; uso indevido pode gerar advertência, suspensão ou demissão", correta: true },
      { texto: "Sim, desde que ninguém me veja", correta: false },
    ],
  },
  {
    texto: "Posso usar o uniforme da FC fora do horário de trabalho (na rua, em festa, no bar)?",
    alternativas: [
      { texto: "Sim, é meu uniforme, faço o que quiser", correta: false },
      { texto: "Não. O uso do uniforme fora do trabalho é proibido e pode gerar advertência", correta: true },
      { texto: "Sim, se for fim de semana", correta: false },
    ],
  },
  {
    texto: "Posso levar ferramenta, material ou equipamento da obra pra usar em casa ou pra vender?",
    alternativas: [
      { texto: "Sim, se for material que estava sobrando", correta: false },
      { texto: "Não. É proibido — caracteriza furto e leva à demissão imediata", correta: true },
      { texto: "Sim, se eu devolver depois", correta: false },
    ],
  },
  {
    texto: "Meu encarregado ou mestre de obras me deu uma ordem direta. O que faço?",
    alternativas: [
      { texto: "Discuto na frente da equipe e me recuso a obedecer", correta: false },
      { texto: "Cumpro a ordem. Insubordinação é causa de desligamento imediato", correta: true },
      { texto: "Faço só se eu concordar com a ordem", correta: false },
    ],
  },
  {
    texto: "Um colega faz comentários ou toques de cunho sexual que me incomodam. Isso é:",
    alternativas: [
      { texto: "Brincadeira normal entre adultos", correta: false },
      { texto: "Assédio sexual — é proibido e leva à demissão imediata; devo procurar o gestor ou o RH", correta: true },
      { texto: "Coisa que devo deixar passar pra evitar confusão", correta: false },
    ],
  },
  {
    texto: "Um colega humilha, grita ou expõe outro repetidamente. Isso é:",
    alternativas: [
      { texto: "Forma normal de cobrar resultado", correta: false },
      { texto: "Assédio moral / bullying — é proibido e pode gerar advertência, suspensão ou demissão", correta: true },
      { texto: "Problema só de quem está sofrendo", correta: false },
    ],
  },
  {
    texto: "Piadas ou ofensas sobre cor da pele, religião ou orientação sexual de um colega são:",
    alternativas: [
      { texto: "Permitidas se for entre amigos", correta: false },
      { texto: "Atos de intolerância — NÃO TOLERAMOS na FC e levam à demissão imediata", correta: true },
      { texto: "Liberadas fora do horário do almoço", correta: false },
    ],
  },
  {
    texto: "Posso beber cerveja no almoço ou usar drogas durante o horário de trabalho?",
    alternativas: [
      { texto: "Sim, se for só uma latinha", correta: false },
      { texto: "Não. Álcool e drogas no horário de trabalho são proibidos e levam à demissão", correta: true },
      { texto: "Sim, se ninguém perceber", correta: false },
    ],
  },
  {
    texto: "Posso brigar (empurrão, soco, xingamento) com colega ou superior dentro da obra?",
    alternativas: [
      { texto: "Sim, se o outro começou", correta: false },
      { texto: "Não. Agressão física ou verbal leva à demissão imediata", correta: true },
      { texto: "Sim, se for fora do horário oficial", correta: false },
    ],
  },
  {
    texto: "Vou trabalhar em altura ou em área de risco. Posso ir sem capacete, cinto ou outro EPI?",
    alternativas: [
      { texto: "Sim, se for serviço rápido", correta: false },
      { texto: "Não. Não usar EPI é uma das Regras de Ouro — leva à demissão imediata", correta: true },
      { texto: "Sim, se ninguém da segurança estiver olhando", correta: false },
    ],
  },
  {
    texto: "Recebi um EPI novo (capacete, luva, botina). De quem é a responsabilidade de cuidar dele?",
    alternativas: [
      { texto: "Da empresa — se quebrar, é só pedir outro a qualquer momento", correta: false },
      { texto: "Minha. Devo usar, conservar, guardar e devolver quando trocar. A empresa fornece e treina, eu cuido (NR-6)", correta: true },
      { texto: "Do almoxarife", correta: false },
    ],
  },
  {
    texto: "Vou subir num andaime ou trabalhar acima de 2 metros do chão. O que é OBRIGATÓRIO?",
    alternativas: [
      { texto: "Só capacete e bota basta", correta: false },
      { texto: "Cinto de segurança tipo paraquedista ANCORADO em ponto firme + treinamento de NR-35 válido + Análise de Risco do serviço", correta: true },
      { texto: "Cinto preso em qualquer cano ou parafuso da estrutura", correta: false },
    ],
  },
  {
    texto: "Vou entrar num espaço confinado (caixa d'água, poço, silo, galeria). O que NÃO posso fazer?",
    alternativas: [
      { texto: "Entrar sem Permissão de Entrada e Trabalho (PET), sem vigia do lado de fora e sem medição da atmosfera", correta: true },
      { texto: "Avisar o vigia antes de entrar", correta: false },
      { texto: "Usar cinto e linha de vida pra resgate", correta: false },
    ],
  },
  {
    texto: "Vi um fio elétrico desencapado ou um quadro de energia aberto na obra. O que faço?",
    alternativas: [
      { texto: "Tento consertar eu mesmo pra adiantar o serviço", correta: false },
      { texto: "Isolo a área, NÃO toco e aviso imediatamente o encarregado ou o eletricista habilitado (NR-10)", correta: true },
      { texto: "Ignoro — não é meu serviço", correta: false },
    ],
  },
  {
    texto: "Vou operar betoneira, serra circular, esmerilhadeira ou qualquer máquina da obra. O que preciso?",
    alternativas: [
      { texto: "Nada, é só ligar e usar", correta: false },
      { texto: "Treinamento específico, autorização do encarregado e a máquina precisa ter proteção (capa, botão de emergência) — NR-12", correta: true },
      { texto: "Só usar se outro colega já ensinou rapidinho", correta: false },
    ],
  },
  {
    texto: "Preciso erguer ou carregar carga pesada manualmente. Qual é a forma correta?",
    alternativas: [
      { texto: "Curvar a coluna pra pegar do chão — é mais rápido", correta: false },
      { texto: "Dobrar os joelhos, manter a coluna reta, pedir ajuda se for muito pesado ou usar carrinho/empilhadeira (NR-17/NR-11)", correta: true },
      { texto: "Pegar sozinho de qualquer jeito pra mostrar serviço", correta: false },
    ],
  },
  {
    texto: "Eu me machuquei na obra, mesmo um corte pequeno. O que fazer?",
    alternativas: [
      { texto: "Esconder pra não dar trabalho e seguir trabalhando", correta: false },
      { texto: "Avisar IMEDIATAMENTE o encarregado, ir ao ambulatório/posto e abrir a CAT — todo acidente, por menor que seja, precisa ser registrado", correta: true },
      { texto: "Resolver em casa com remédio meu", correta: false },
    ],
  },
  {
    texto: "Tenho uma dúvida ou sugestão sobre segurança no meu setor. Pra quem levo?",
    alternativas: [
      { texto: "Pra ninguém — não é problema meu", correta: false },
      { texto: "Pra meu encarregado, pro TST/Engenheiro de Segurança ou pro meu representante da CIPA — todo trabalhador pode (e deve) participar da segurança (NR-5)", correta: true },
      { texto: "Só pra um colega de confiança", correta: false },
    ],
  },
  {
    texto: "O DDS (Diálogo Diário de Segurança) começou. O que faço?",
    alternativas: [
      { texto: "Saio escondido pra adiantar o serviço — DDS é perda de tempo", correta: false },
      { texto: "Participo, presto atenção e assino a lista. O DDS é OBRIGATÓRIO e serve pra prevenir acidente no dia", correta: true },
      { texto: "Fico mexendo no celular durante a conversa", correta: false },
    ],
  },
  // Rev. 2059 — +13 perguntas sobre SEGURANÇA NA OBRA (pedido do usuário:
  // "mantenha estas no questionário e faça mais 13 perguntas sobre segurança
  // na obra"). Append ao fim — não mexe nas 22 anteriores. Total agora: 35.
  // Cobre: sinalização, ASO, andaime, escada portátil, trabalho a quente,
  // empilhamento, trânsito interno, químicos/FISPQ, higiene/NR-24, sanitário,
  // saída de emergência, calçado de segurança, incêndio.
  {
    texto: "Vi placas, fitas zebradas (preto e amarelo) ou cones isolando uma área da obra. O que faço?",
    alternativas: [
      { texto: "Passo por cima — é só pra enfeitar", correta: false },
      { texto: "Respeito a sinalização: aquela área está interditada por causa de risco. Faço o desvio mesmo que demore mais", correta: true },
      { texto: "Tiro a fita pra atravessar e ponho de volta depois", correta: false },
    ],
  },
  {
    texto: "Pra começar a trabalhar na obra, preciso ter:",
    alternativas: [
      { texto: "Só vontade de trabalhar e EPI", correta: false },
      { texto: "ASO (Atestado de Saúde Ocupacional) válido feito pelo médico do trabalho — sem ASO, ninguém entra na obra (PCMSO/NR-7)", correta: true },
      { texto: "Só carteira de trabalho assinada", correta: false },
    ],
  },
  {
    texto: "Vou subir num andaime. O que devo verificar ANTES?",
    alternativas: [
      { texto: "Subo direto, se aguentou ontem aguenta hoje", correta: false },
      { texto: "Confiro a tag/cartão de liberação (verde = liberado), guarda-corpo, rodapé, piso completo e estabilidade — andaime sem tag verde NÃO PODE SER USADO", correta: true },
      { texto: "Só olho se está tremendo muito", correta: false },
    ],
  },
  {
    texto: "Preciso usar uma escada portátil pra alcançar um ponto alto. Como uso com segurança?",
    alternativas: [
      { texto: "Encosto de qualquer jeito e subo correndo", correta: false },
      { texto: "Apoio firme nos dois pés, amarro no topo, fico abaixo dos 2 últimos degraus e NUNCA subo carregando material pesado nas mãos (uso bolsa/içamento)", correta: true },
      { texto: "Subo de costas pra olhar a obra", correta: false },
    ],
  },
  {
    texto: "Vou fazer solda, oxicorte ou esmerilhar (serviço a quente). O que é OBRIGATÓRIO?",
    alternativas: [
      { texto: "Só acender e começar", correta: false },
      { texto: "Permissão de Trabalho a Quente (PT) emitida, extintor de incêndio do lado, área isolada de material inflamável e EPI específico (máscara de solda, avental, perneira)", correta: true },
      { texto: "Avisar um colega e começar", correta: false },
    ],
  },
  {
    texto: "Vou empilhar sacos de cimento, tijolos ou tábuas. Como faço com segurança?",
    alternativas: [
      { texto: "Empilho o mais alto possível pra ocupar menos espaço", correta: false },
      { texto: "Respeito a altura máxima recomendada, uso calços/paletes pra base ficar firme e nunca empilho em local de passagem ou perto de fiação elétrica", correta: true },
      { texto: "Encosto na parede e vou subindo sem parar", correta: false },
    ],
  },
  {
    texto: "Vou andar a pé dentro da obra onde passam caminhão, retroescavadeira ou empilhadeira. O que faço?",
    alternativas: [
      { texto: "Ando no meio da pista pra ir mais rápido", correta: false },
      { texto: "Uso o caminho de pedestre demarcado, mantenho contato visual com o operador, NÃO passo por baixo de carga suspensa e respeito a velocidade reduzida da obra", correta: true },
      { texto: "Atravesso correndo na frente do veículo", correta: false },
    ],
  },
  {
    texto: "Vou manusear produto químico (tinta, solvente, ácido, óleo). O que devo fazer?",
    alternativas: [
      { texto: "Misturar com outro produto pra render mais", correta: false },
      { texto: "Consultar a FISPQ (Ficha de Segurança), usar o EPI específico indicado (luva, óculos, máscara), nunca misturar produtos diferentes e armazenar em local ventilado e identificado", correta: true },
      { texto: "Cheirar pra ver o que é antes de usar", correta: false },
    ],
  },
  {
    texto: "Antes de ir pro refeitório ou comer qualquer coisa na obra, devo:",
    alternativas: [
      { texto: "Comer direto, mão suja é mais saudável", correta: false },
      { texto: "Lavar bem as mãos com água e sabão — obra tem poeira de cimento, tinta, óleo e produtos químicos que NÃO podem ir pra dentro do corpo (NR-24)", correta: true },
      { texto: "Só passar a mão no uniforme", correta: false },
    ],
  },
  {
    texto: "Sobre o sanitário/banheiro químico da obra:",
    alternativas: [
      { texto: "Posso fazer minhas necessidades em qualquer canto da obra", correta: false },
      { texto: "Sempre uso o sanitário/banheiro químico da obra, mantenho limpo e descarrego — fazer necessidade fora é falta grave e risco de doença pra todos (NR-24)", correta: true },
      { texto: "Uso só se estiver perto", correta: false },
    ],
  },
  {
    texto: "As saídas de emergência e os corredores da obra devem estar:",
    alternativas: [
      { texto: "Cheios de material empilhado pra aproveitar o espaço", correta: false },
      { texto: "SEMPRE LIVRES, desobstruídas e sinalizadas — em caso de incêndio ou desabamento, é por ali que todo mundo sai. Bloquear é crime", correta: true },
      { texto: "Podem ficar trancadas pra ninguém fugir do serviço", correta: false },
    ],
  },
  {
    texto: "Sobre o calçado de segurança (botina) na obra:",
    alternativas: [
      { texto: "Posso trabalhar de chinelo ou tênis se a botina apertar", correta: false },
      { texto: "Uso SEMPRE a botina de segurança fechada, com biqueira e solado antiderrapante, mesmo no calor — protege de prego, queda de material, choque e escorregão", correta: true },
      { texto: "Tiro a botina no almoço e volto descalço pra obra", correta: false },
    ],
  },
  {
    texto: "Começou um incêndio na obra. O que NÃO devo fazer?",
    alternativas: [
      { texto: "Acionar a brigada de incêndio, usar o extintor mais próximo se souber operar, evacuar pela saída de emergência e ir pro ponto de encontro", correta: false },
      { texto: "Pegar o elevador pra descer mais rápido, voltar pra buscar pertences ou tentar apagar fogo grande sozinho", correta: true },
      { texto: "Avisar os colegas e o encarregado", correta: false },
    ],
  },
];

export const integracaoSSTRouter = router({

  // Rev. 2058 — Badge do menu lateral (DashboardLayout). Conta colaboradores
  // SEM integração válida + registros pendente/em_andamento parados. Multi-
  // company (badge agrega todas as empresas que o usuário enxerga). Read-only,
  // leve, refetch a cada 60s.
  getBadgeCounts: protectedProcedure
    .input(z.object({ companyIds: z.array(z.number().int().positive()).min(1) }))
    .query(async ({ input, ctx }) => {
      for (const cid of input.companyIds) await assertCompanyAccess(ctx, cid);
      const db = (await getDb())!;
      // Rev. 2064 — Bug crítico Rev. 2058: `ANY(${ids})` no template Drizzle
      // não serializa array JS como PG array literal — query falhava com
      // "malformed array literal" e badge NUNCA renderizou desde Rev. 2058
      // (erro silenciado pelo useQuery). Fix: inline da lista validada
      // (Zod já garante int positivo) via sql.raw — sem risco de injection.
      const idsList = input.companyIds.map(n => Number(n)).filter(Number.isFinite).join(",");
      const idsAny = sql.raw(`ANY(ARRAY[${idsList}]::int[])`);

      // (A) Colaboradores SEM integração válida (CLT/PJ ativos, não fantasma,
      // sem aprovação vigente). Lógica espelha listarPendentesAuto (Rev. 2034+
      // Rev. 2036 filtro fantasma) condensada num COUNT.
      const semIntegracaoRaw = await db.execute<{ total: number }>(sql`
        WITH last_ok AS (
          SELECT DISTINCT ON (employee_id)
            employee_id,
            COALESCE(data_validade,
                     COALESCE(data_realizacao, created_at) + INTERVAL '730 days') AS dv
          FROM sst_integracao_registros
          WHERE company_id = ${idsAny}
            AND status = 'aprovado'
            AND deleted_at IS NULL
          ORDER BY employee_id, COALESCE(data_realizacao, created_at) DESC
        ),
        em_processo AS (
          SELECT DISTINCT employee_id
          FROM sst_integracao_registros
          WHERE company_id = ${idsAny}
            AND status IN ('pendente', 'em_andamento')
            AND deleted_at IS NULL
        )
        SELECT COUNT(*)::int AS total
        FROM employees e
        LEFT JOIN last_ok lo ON lo.employee_id = e.id
        WHERE e."companyId" = ${idsAny}
          AND e.status = 'Ativo'
          AND e."deletedAt" IS NULL
          AND COALESCE(e."listaNegra", 0) = 0
          AND e."dataDemissao" IS NULL
          AND e.id NOT IN (SELECT employee_id FROM em_processo)
          AND (lo.dv IS NULL OR lo.dv <= NOW() + INTERVAL '60 days')
      `);
      const semIntegracaoRows = (semIntegracaoRaw as any).rows ?? semIntegracaoRaw;
      const pendentesEmployees = Number(semIntegracaoRows?.[0]?.total ?? 0);

      // Rev. 2063 — Bug Rev. 2058: contava só CLT/PJ. listarPendentesAuto
      // L1084 também inclui terceiros SEM `integracaoDocUrl`. Se o tenant
      // só tem terceiros pendentes, badge ficava zerado.
      const terceirosRaw = await db.execute<{ total: number }>(sql`
        SELECT COUNT(*)::int AS total
        FROM funcionarios_terceiros t
        WHERE t."companyId" = ${idsAny}
          AND t.status = 'ativo'
          AND t.deleted_at IS NULL
          AND t.integracao_doc_url IS NULL
      `);
      const terceirosRows = (terceirosRaw as any).rows ?? terceirosRaw;
      const pendentesTerceiros = Number(terceirosRows?.[0]?.total ?? 0);

      const pendentesAuto = pendentesEmployees + pendentesTerceiros;

      return { pendentesAuto, pendentesEmployees, pendentesTerceiros };
    }),

  listarConfigs: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      return db.select().from(sstIntegracaoConfig)
        .where(and(eq(sstIntegracaoConfig.companyId, input.companyId), isNull(sstIntegracaoConfig.deletedAt)))
        .orderBy(desc(sstIntegracaoConfig.createdAt));
    }),

  criarConfig: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().max(255).optional(),
      titulo: z.string().min(1).max(255),
      descricao: z.string().optional(),
      notaMinima: z.number().int().min(1).max(100).default(70),
      validadeMeses: z.number().int().min(1).max(60).default(12),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.insert(sstIntegracaoConfig).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome?.trim() || null,
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        notaMinima: input.notaMinima,
        validadeMeses: input.validadeMeses,
        criadoPor: ctx.user.name ?? "Sistema",
        criadoPorUserId: ctx.user.id,
      }).returning();
      return row;
    }),

  atualizarConfig: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255).optional(),
      descricao: z.string().optional(),
      notaMinima: z.number().int().min(1).max(100).optional(),
      validadeMeses: z.number().int().min(1).max(60).optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const updates: any = { updatedAt: sql`NOW()` };
      if (input.titulo !== undefined) updates.titulo = input.titulo.trim();
      if (input.descricao !== undefined) updates.descricao = input.descricao.trim() || null;
      if (input.notaMinima !== undefined) updates.notaMinima = input.notaMinima;
      if (input.validadeMeses !== undefined) updates.validadeMeses = input.validadeMeses;
      if (input.ativo !== undefined) updates.ativo = input.ativo;
      await db.update(sstIntegracaoConfig).set(updates)
        .where(and(eq(sstIntegracaoConfig.id, input.id), eq(sstIntegracaoConfig.companyId, input.companyId)));
      return { success: true };
    }),

  excluirConfig: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(sstIntegracaoConfig).set({ deletedAt: sql`NOW()` })
        .where(and(eq(sstIntegracaoConfig.id, input.id), eq(sstIntegracaoConfig.companyId, input.companyId)));
      return { success: true };
    }),

  listarTodosModulos: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const modulos = await db.select({
        id: sstIntegracaoModulos.id,
        configId: sstIntegracaoModulos.configId,
        companyId: sstIntegracaoModulos.companyId,
        titulo: sstIntegracaoModulos.titulo,
        descricao: sstIntegracaoModulos.descricao,
        videoUrl: sstIntegracaoModulos.videoUrl,
        videoTipo: sstIntegracaoModulos.videoTipo,
        ordem: sstIntegracaoModulos.ordem,
        obrigatorio: sstIntegracaoModulos.obrigatorio,
        duracaoMinutos: sstIntegracaoModulos.duracaoMinutos,
        funcoesJson: sstIntegracaoModulos.funcoesJson,
        createdAt: sstIntegracaoModulos.createdAt,
        configTitulo: sstIntegracaoConfig.titulo,
      }).from(sstIntegracaoModulos)
        .leftJoin(sstIntegracaoConfig, eq(sstIntegracaoModulos.configId, sstIntegracaoConfig.id))
        .where(and(eq(sstIntegracaoModulos.companyId, input.companyId), isNull(sstIntegracaoModulos.deletedAt)))
        .orderBy(asc(sstIntegracaoModulos.configId), asc(sstIntegracaoModulos.ordem));

      const moduloIds = modulos.map(m => m.id);
      let perguntaCounts: { moduloId: number; count: number }[] = [];
      if (moduloIds.length > 0) {
        perguntaCounts = await db.select({
          moduloId: sstIntegracaoPerguntas.moduloId,
          count: sql<number>`count(*)::int`,
        }).from(sstIntegracaoPerguntas)
          .where(inArray(sstIntegracaoPerguntas.moduloId, moduloIds))
          .groupBy(sstIntegracaoPerguntas.moduloId);
      }
      const countMap = new Map(perguntaCounts.map(c => [c.moduloId, c.count]));
      return modulos.map(m => ({ ...m, totalPerguntas: countMap.get(m.id) || 0 }));
    }),

  listarModulos: protectedProcedure
    .input(z.object({ configId: z.number().int().positive(), companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const modulos = await db.select().from(sstIntegracaoModulos)
        .where(and(eq(sstIntegracaoModulos.configId, input.configId), eq(sstIntegracaoModulos.companyId, input.companyId), isNull(sstIntegracaoModulos.deletedAt)))
        .orderBy(asc(sstIntegracaoModulos.ordem));

      const moduloIds = modulos.map(m => m.id);
      if (moduloIds.length === 0) return modulos.map(m => ({ ...m, perguntas: [] }));

      const perguntas = await db.select().from(sstIntegracaoPerguntas)
        .where(and(inArray(sstIntegracaoPerguntas.moduloId, moduloIds), eq(sstIntegracaoPerguntas.companyId, input.companyId)))
        .orderBy(asc(sstIntegracaoPerguntas.ordem));

      const perguntaIds = perguntas.map(p => p.id);
      let alternativas: any[] = [];
      if (perguntaIds.length > 0) {
        alternativas = await db.select().from(sstIntegracaoAlternativas)
          .where(inArray(sstIntegracaoAlternativas.perguntaId, perguntaIds))
          .orderBy(asc(sstIntegracaoAlternativas.ordem));
      }

      const altMap = new Map<number, any[]>();
      for (const a of alternativas) {
        if (!altMap.has(a.perguntaId)) altMap.set(a.perguntaId, []);
        altMap.get(a.perguntaId)!.push(a);
      }

      const pergMap = new Map<number, any[]>();
      for (const p of perguntas) {
        if (!pergMap.has(p.moduloId)) pergMap.set(p.moduloId, []);
        pergMap.get(p.moduloId)!.push({ ...p, alternativas: altMap.get(p.id) || [] });
      }

      return modulos.map(m => ({ ...m, perguntas: pergMap.get(m.id) || [] }));
    }),

  criarModulo: protectedProcedure
    .input(z.object({
      configId: z.number().int().positive(),
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255),
      descricao: z.string().optional(),
      videoUrl: z.string().optional(),
      videoTipo: z.enum(["youtube", "upload", "vimeo", "url"]).default("youtube"),
      ordem: z.number().int().min(1).default(1),
      obrigatorio: z.boolean().default(true),
      funcoesJson: z.string().optional(),
      duracaoMinutos: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.insert(sstIntegracaoModulos).values({
        configId: input.configId,
        companyId: input.companyId,
        titulo: input.titulo.trim(),
        descricao: input.descricao?.trim() || null,
        videoUrl: input.videoUrl?.trim() || null,
        videoTipo: input.videoTipo,
        ordem: input.ordem,
        obrigatorio: input.obrigatorio,
        funcoesJson: input.funcoesJson || null,
        duracaoMinutos: input.duracaoMinutos ?? null,
      }).returning();
      return row;
    }),

  atualizarModulo: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      companyId: z.number().int().positive(),
      titulo: z.string().min(1).max(255).optional(),
      descricao: z.string().optional(),
      videoUrl: z.string().optional(),
      videoTipo: z.enum(["youtube", "upload", "vimeo", "url"]).optional(),
      ordem: z.number().int().min(1).optional(),
      obrigatorio: z.boolean().optional(),
      funcoesJson: z.string().optional(),
      duracaoMinutos: z.number().int().positive().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const updates: any = { updatedAt: sql`NOW()` };
      if (input.titulo !== undefined) updates.titulo = input.titulo.trim();
      if (input.descricao !== undefined) updates.descricao = input.descricao?.trim() || null;
      if (input.videoUrl !== undefined) updates.videoUrl = input.videoUrl?.trim() || null;
      if (input.videoTipo !== undefined) updates.videoTipo = input.videoTipo;
      if (input.ordem !== undefined) updates.ordem = input.ordem;
      if (input.obrigatorio !== undefined) updates.obrigatorio = input.obrigatorio;
      if (input.funcoesJson !== undefined) updates.funcoesJson = input.funcoesJson || null;
      if (input.duracaoMinutos !== undefined) updates.duracaoMinutos = input.duracaoMinutos;
      await db.update(sstIntegracaoModulos).set(updates)
        .where(and(eq(sstIntegracaoModulos.id, input.id), eq(sstIntegracaoModulos.companyId, input.companyId)));
      return { success: true };
    }),

  excluirModulo: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      await db.update(sstIntegracaoModulos).set({ deletedAt: sql`NOW()` })
        .where(and(eq(sstIntegracaoModulos.id, input.id), eq(sstIntegracaoModulos.companyId, input.companyId)));
      return { success: true };
    }),

  salvarPerguntas: protectedProcedure
    .input(z.object({
      moduloId: z.number().int().positive(),
      companyId: z.number().int().positive(),
      perguntas: z.array(z.object({
        id: z.number().int().optional(),
        texto: z.string().min(1),
        ordem: z.number().int().min(1),
        alternativas: z.array(z.object({
          id: z.number().int().optional(),
          texto: z.string().min(1),
          correta: z.boolean(),
          ordem: z.number().int().min(1),
        })),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      const existingPerguntas = await db.select({ id: sstIntegracaoPerguntas.id })
        .from(sstIntegracaoPerguntas)
        .where(and(eq(sstIntegracaoPerguntas.moduloId, input.moduloId), eq(sstIntegracaoPerguntas.companyId, input.companyId)));
      const existingIds = new Set(existingPerguntas.map(p => p.id));
      const inputIds = new Set(input.perguntas.filter(p => p.id).map(p => p.id!));

      const toDelete = [...existingIds].filter(id => !inputIds.has(id));
      if (toDelete.length > 0) {
        const altToDelete = await db.select({ id: sstIntegracaoAlternativas.id })
          .from(sstIntegracaoAlternativas)
          .where(inArray(sstIntegracaoAlternativas.perguntaId, toDelete));
        if (altToDelete.length > 0) {
          await db.delete(sstIntegracaoAlternativas).where(inArray(sstIntegracaoAlternativas.id, altToDelete.map(a => a.id)));
        }
        await db.delete(sstIntegracaoPerguntas).where(inArray(sstIntegracaoPerguntas.id, toDelete));
      }

      for (const p of input.perguntas) {
        let perguntaId: number;
        if (p.id && existingIds.has(p.id)) {
          await db.update(sstIntegracaoPerguntas).set({ texto: p.texto, ordem: p.ordem })
            .where(eq(sstIntegracaoPerguntas.id, p.id));
          perguntaId = p.id;
        } else {
          const [row] = await db.insert(sstIntegracaoPerguntas).values({
            moduloId: input.moduloId, companyId: input.companyId,
            texto: p.texto, ordem: p.ordem,
          }).returning();
          perguntaId = row.id;
        }

        await db.delete(sstIntegracaoAlternativas).where(eq(sstIntegracaoAlternativas.perguntaId, perguntaId));
        if (p.alternativas.length > 0) {
          await db.insert(sstIntegracaoAlternativas).values(
            p.alternativas.map(a => ({ perguntaId, texto: a.texto, correta: a.correta, ordem: a.ordem }))
          );
        }
      }

      return { success: true };
    }),

  // Rev. 2047 — Perguntas-padrão "10 Regras de Ouro" da FC (cultura/conduta).
  // Aceita `substituir`: quando true, apaga TODAS as perguntas/alternativas
  // existentes do módulo antes de semear o padrão (operação destrutiva
  // só sobre dados de seed deste módulo — exige confirmação na UI).
  semearPerguntasPadrao: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      moduloId: z.number().int().positive(),
      substituir: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      try {
        // Confirma que o módulo pertence à company (defesa cross-tenant)
        const [mod] = await db.select({ id: sstIntegracaoModulos.id })
          .from(sstIntegracaoModulos)
          .where(and(
            eq(sstIntegracaoModulos.id, input.moduloId),
            eq(sstIntegracaoModulos.companyId, input.companyId),
          )).limit(1);
        if (!mod) throw new TRPCError({ code: "NOT_FOUND", message: "Módulo não encontrado nesta empresa." });

        const existentes = await db.select({ id: sstIntegracaoPerguntas.id })
          .from(sstIntegracaoPerguntas)
          .where(and(
            eq(sstIntegracaoPerguntas.moduloId, input.moduloId),
            eq(sstIntegracaoPerguntas.companyId, input.companyId),
          ));

        if (existentes.length > 0 && !input.substituir) {
          throw new TRPCError({ code: "CONFLICT", message: `Este módulo já tem ${existentes.length} pergunta(s). Use "Substituir" para sobrescrever.` });
        }

        // Rev. 2047 follow-up architect: delete + insert em transação atômica
        // pra nunca deixar o módulo vazio se um INSERT falhar depois do DELETE.
        const PADRAO = PERGUNTAS_REGRAS_OURO;
        await db.transaction(async (tx: any) => {
          if (existentes.length > 0) {
            // Apaga perguntas e alternativas atuais (seed-only — não afeta
            // respostas dos colaboradores, que ficam em sst_integracao_respostas
            // sem FK rígida)
            const ids = existentes.map(e => e.id);
            await tx.delete(sstIntegracaoAlternativas).where(inArray(sstIntegracaoAlternativas.perguntaId, ids));
            await tx.delete(sstIntegracaoPerguntas).where(inArray(sstIntegracaoPerguntas.id, ids));
          }
          for (let i = 0; i < PADRAO.length; i++) {
            const p = PADRAO[i];
            const [row] = await tx.insert(sstIntegracaoPerguntas).values({
              moduloId: input.moduloId,
              companyId: input.companyId,
              texto: p.texto,
              ordem: i + 1,
            }).returning();
            await tx.insert(sstIntegracaoAlternativas).values(
              p.alternativas.map((a, j) => ({
                perguntaId: row.id,
                texto: a.texto,
                correta: a.correta,
                ordem: j + 1,
              }))
            );
          }
        });
        return { success: true, total: PADRAO.length, substituido: existentes.length };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("[semearPerguntasPadrao] FAIL", { input, err, stack: err?.stack });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao carregar perguntas-padrão." });
      }
    }),

  listarRegistros: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      status: z.enum(["pendente", "em_andamento", "aprovado", "reprovado", "vencido", "todos"]).optional(),
      obraId: z.number().int().positive().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const conds: any[] = [eq(sstIntegracaoRegistros.companyId, input.companyId), isNull(sstIntegracaoRegistros.deletedAt)];
      if (input.status && input.status !== "todos") {
        conds.push(eq(sstIntegracaoRegistros.status, input.status));
      }
      if (input.obraId) conds.push(eq(sstIntegracaoRegistros.obraId, input.obraId));
      // Rev. 2049 — leftJoin com config pra trazer `notaMinima` real
      // (usado pelo certificado em AprovadosTab; antes era hardcoded 70).
      const rows = await db
        .select({
          r: sstIntegracaoRegistros,
          configNotaMinima: sstIntegracaoConfig.notaMinima,
          configTitulo: sstIntegracaoConfig.titulo,
        })
        .from(sstIntegracaoRegistros)
        .leftJoin(sstIntegracaoConfig, and(
          eq(sstIntegracaoConfig.id, sstIntegracaoRegistros.configId),
          // Rev. 2049 hardening: amarra o join por companyId pra evitar
          // qualquer acoplamento cruzado entre tenants em caso de dados
          // inconsistentes (defesa em profundidade — `assertCompanyAccess`
          // acima já valida acesso à empresa do registro).
          eq(sstIntegracaoConfig.companyId, sstIntegracaoRegistros.companyId),
        ))
        .where(and(...conds))
        .orderBy(desc(sstIntegracaoRegistros.createdAt));
      // Achata pra manter compatibilidade com chamadores existentes
      // (HistoricoTab/AprovadosTab acessam r.id, r.employeeNome, etc.).
      return rows.map((row) => ({
        ...row.r,
        configNotaMinima: row.configNotaMinima ?? null,
        configTitulo: row.configTitulo ?? null,
      }));
    }),

  // Rev. 2044 — Excluir registros do Histórico (soft-delete via deletedAt).
  // Como `listarPendentesAuto` filtra colaboradores SEM registro válido,
  // após o soft-delete o colaborador volta a aparecer em "Pendentes" pra
  // refazer a integração — exatamente o pedido do usuário (IMG_0891).
  excluirRegistros: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      ids: z.array(z.number().int().positive()).min(1).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      try {
        const result = await db.update(sstIntegracaoRegistros)
          .set({ deletedAt: sql`NOW()`, updatedAt: sql`NOW()` })
          .where(and(
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            inArray(sstIntegracaoRegistros.id, input.ids),
            isNull(sstIntegracaoRegistros.deletedAt),
          ))
          .returning({ id: sstIntegracaoRegistros.id });
        return { count: result.length };
      } catch (err: any) {
        console.error("[excluirRegistros] FAIL", { input, userId: ctx.user?.id, err: err?.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao excluir registros" });
      }
    }),

  // Rev. 2052 — Assinatura digital do TST (FCSign canvas) no certificado de aprovação.
  // Só permite assinar registros aprovados desta empresa (cross-tenant).
  // Valida base64 PNG (prefixo data:image/png) e tamanho (<=2MB compactado).
  assinarComoTst: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      registroId: z.number().int().positive(),
      assinaturaBase64: z.string().min(100).max(3_000_000), // ~2.2MB base64 (1.6MB binário)
      nomeTst: z.string().trim().min(2).max(255),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      if (!input.assinaturaBase64.startsWith("data:image/png;base64,")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Assinatura inválida (deve ser PNG base64)" });
      }
      const db = (await getDb())!;
      try {
        const [reg] = await db
          .select({ id: sstIntegracaoRegistros.id, status: sstIntegracaoRegistros.status })
          .from(sstIntegracaoRegistros)
          .where(and(
            eq(sstIntegracaoRegistros.id, input.registroId),
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            isNull(sstIntegracaoRegistros.deletedAt),
          ));
        if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado nesta empresa" });
        if (reg.status !== "aprovado") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas integrações aprovadas podem ser assinadas pelo TST" });
        }
        // Rev. 2052 follow-up architect: repete `isNull(deletedAt)` no UPDATE
        // pra blindar contra race condition (registro deletado entre SELECT e
        // UPDATE não deve ser tocado).
        await db.update(sstIntegracaoRegistros)
          .set({
            assinaturaTstBase64: input.assinaturaBase64,
            assinaturaTstNome: input.nomeTst,
            assinaturaTstAssinadaEm: sql`NOW()`,
            updatedAt: sql`NOW()`,
          })
          .where(and(
            eq(sstIntegracaoRegistros.id, input.registroId),
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            isNull(sstIntegracaoRegistros.deletedAt),
          ));
        return { success: true };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("[assinarComoTst] FAIL", { input: { ...input, assinaturaBase64: `<${input.assinaturaBase64.length} chars>` }, userId: ctx.user?.id, err: err?.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao salvar assinatura" });
      }
    }),

  // Rev. 2922 — Assinatura do TST EM LOTE: aplica a MESMA assinatura/nome a
  // vários registros aprovados de uma vez (pedido do usuário: "selecionar
  // todos e assinar de uma vez pra ganhar tempo"). Só toca registros desta
  // empresa, APROVADOS, não deletados e AINDA SEM assinatura (não sobrescreve
  // quem já estava assinado). Um único UPDATE com inArray + guardas.
  assinarComoTstEmLote: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      registroIds: z.array(z.number().int().positive()).min(1).max(500),
      assinaturaBase64: z.string().min(100).max(3_000_000),
      nomeTst: z.string().trim().min(2).max(255),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      if (!input.assinaturaBase64.startsWith("data:image/png;base64,")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Assinatura inválida (deve ser PNG base64)" });
      }
      const db = (await getDb())!;
      try {
        const result = await db.update(sstIntegracaoRegistros)
          .set({
            assinaturaTstBase64: input.assinaturaBase64,
            assinaturaTstNome: input.nomeTst,
            assinaturaTstAssinadaEm: sql`NOW()`,
            updatedAt: sql`NOW()`,
          })
          .where(and(
            inArray(sstIntegracaoRegistros.id, input.registroIds),
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            eq(sstIntegracaoRegistros.status, "aprovado"),
            isNull(sstIntegracaoRegistros.deletedAt),
            isNull(sstIntegracaoRegistros.assinaturaTstBase64),
          ))
          .returning({ id: sstIntegracaoRegistros.id });
        return { success: true, count: result.length };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("[assinarComoTstEmLote] FAIL", { companyId: input.companyId, qtd: input.registroIds.length, nomeTst: input.nomeTst, userId: ctx.user?.id, err: err?.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao salvar assinaturas em lote" });
      }
    }),

  // Rev. 2052 — Remove a assinatura do TST (caso TST errou, queira reassinar).
  removerAssinaturaTst: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      registroId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      try {
        const result = await db.update(sstIntegracaoRegistros)
          .set({
            assinaturaTstBase64: null,
            assinaturaTstNome: null,
            assinaturaTstAssinadaEm: null,
            updatedAt: sql`NOW()`,
          })
          .where(and(
            eq(sstIntegracaoRegistros.id, input.registroId),
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            isNull(sstIntegracaoRegistros.deletedAt),
          ))
          .returning({ id: sstIntegracaoRegistros.id });
        if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado" });
        return { success: true };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("[removerAssinaturaTst] FAIL", { input, userId: ctx.user?.id, err: err?.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao remover assinatura" });
      }
    }),

  // Rev. 2044 — Editar registro (somente metadados que fazem sentido pós-criação:
  // obra associada). Status/nota/respostas seguem imutáveis pelo cliente —
  // pra "refazer" o usuário exclui e o colaborador volta pra pendentes.
  atualizarRegistro: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      id: z.number().int().positive(),
      obraId: z.number().int().positive().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      try {
        let obraNome: string | null = null;
        if (input.obraId) {
          const [o] = await db.select({ nome: obras.nome })
            .from(obras)
            .where(and(eq(obras.id, input.obraId), eq(obras.companyId, input.companyId)));
          if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada nesta empresa" });
          obraNome = o.nome || null;
        }
        const result = await db.update(sstIntegracaoRegistros)
          .set({ obraId: input.obraId, obraNome, updatedAt: sql`NOW()` })
          .where(and(
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            eq(sstIntegracaoRegistros.id, input.id),
            isNull(sstIntegracaoRegistros.deletedAt),
          ))
          .returning({ id: sstIntegracaoRegistros.id });
        if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado" });
        return { success: true };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("[atualizarRegistro] FAIL", { input, userId: ctx.user?.id, err: err?.message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao atualizar registro" });
      }
    }),

  // Rev. 2034 — Lista TODOS os colaboradores ativos (CLT/PJ via `employees`,
  // terceiros via `funcionariosTerceiros`) que precisam de Integração de
  // Segurança: nunca fizeram OU integração vencida OU vence em ≤60 dias.
  // Regra: integração vale 24 meses (registro grava `dataValidade` explícita;
  // fallback +730d sobre `dataRealizacao` se faltar). Excluímos quem já tem
  // registro em andamento (eles aparecem na seção "Em processo" existente).
  listarPendentesAuto: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      // 1) Última integração aprovada por employeeId.
      // Code-review/architect (Rev. 2034): usar DISTINCT ON pra pegar
      // dataValidade + dataRealizacao do MESMO registro (mais recente).
      // O MAX separado misturaria datas de registros diferentes quando
      // o funcionário tem múltiplos aprovados → validade incorreta.
      const lastApprovedRaw = await db.execute<{
        employee_id: number;
        data_validade: string | null;
        data_realizacao: string | null;
      }>(sql`
        SELECT DISTINCT ON (employee_id)
          employee_id, data_validade, data_realizacao
        FROM sst_integracao_registros
        WHERE company_id = ${input.companyId}
          AND status = 'aprovado'
          AND deleted_at IS NULL
        ORDER BY employee_id,
          COALESCE(data_realizacao, created_at) DESC
      `);
      const lastApproved = (lastApprovedRaw as any).rows ?? lastApprovedRaw;
      const lastMap = new Map<number, { dv: string | null; dr: string | null }>();
      for (const r of lastApproved as any[]) {
        lastMap.set(r.employee_id, { dv: r.data_validade, dr: r.data_realizacao });
      }

      // 1.5) Rev. 2057 — Tentativas anteriores: conta reprovações POSTERIORES
      // à última aprovação (ou todas, quando nunca houve aprovação). Se houver
      // 1 reprovado, o próximo passo é a 2ª tentativa; 2 reprovados → 3ª; etc.
      const reprovadosRaw = await db.execute<{
        employee_id: number;
        tentativas: number;
      }>(sql`
        SELECT
          r.employee_id,
          COUNT(*)::int AS tentativas
        FROM sst_integracao_registros r
        LEFT JOIN LATERAL (
          SELECT COALESCE(data_realizacao, created_at) AS ts, id
          FROM sst_integracao_registros
          WHERE company_id = ${input.companyId}
            AND employee_id = r.employee_id
            AND status = 'aprovado'
            AND deleted_at IS NULL
          ORDER BY COALESCE(data_realizacao, created_at) DESC, id DESC
          LIMIT 1
        ) ap ON TRUE
        WHERE r.company_id = ${input.companyId}
          AND r.status = 'reprovado'
          AND r.deleted_at IS NULL
          AND (
            ap.ts IS NULL
            OR (COALESCE(r.data_realizacao, r.created_at), r.id) > (ap.ts, ap.id)
          )
        GROUP BY r.employee_id
      `);
      const reprovadosRows = (reprovadosRaw as any).rows ?? reprovadosRaw;
      const tentativasMap = new Map<number, number>();
      for (const r of reprovadosRows as any[]) {
        tentativasMap.set(Number(r.employee_id), Number(r.tentativas) || 0);
      }

      // 2) Registros em processo (pendente/em_andamento) — excluir
      const inProgress = await db.select({ employeeId: sstIntegracaoRegistros.employeeId })
        .from(sstIntegracaoRegistros)
        .where(and(
          eq(sstIntegracaoRegistros.companyId, input.companyId),
          inArray(sstIntegracaoRegistros.status, ["pendente", "em_andamento"]),
          isNull(sstIntegracaoRegistros.deletedAt),
        ));
      const inProgressSet = new Set(inProgress.map(r => r.employeeId));

      // 3) Employees ativos (CLT/PJ)
      // Rev. 2036: filtro robusto contra "fantasmas" — exclui soft-delete
      // (deletedAt), lista negra e qualquer registro com dataDemissao gravada
      // (mesmo se status ainda estiver "Ativo" por inconsistência).
      const emps = await db.select({
        id: employees.id,
        nome: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        tipoContrato: employees.tipoContrato,
        dataAdmissao: employees.dataAdmissao,
        fotoUrl: employees.fotoUrl,
      })
        .from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          eq(employees.status, "Ativo"),
          sql`${employees.deletedAt} IS NULL`,
          sql`COALESCE(${employees.listaNegra}, 0) = 0`,
          sql`${employees.dataDemissao} IS NULL`,
        ));

      // 4) Terceiros ativos
      const ters = await db.select({
        id: funcionariosTerceiros.id,
        nome: funcionariosTerceiros.nome,
        cpf: funcionariosTerceiros.cpf,
        funcao: funcionariosTerceiros.funcao,
        obraNome: funcionariosTerceiros.obraNome,
        integracaoDocUrl: funcionariosTerceiros.integracaoDocUrl,
        fotoUrl: funcionariosTerceiros.fotoUrl,
      })
        .from(funcionariosTerceiros)
        .where(and(
          eq(funcionariosTerceiros.companyId, input.companyId),
          eq(funcionariosTerceiros.status, "ativo"),
          isNull(funcionariosTerceiros.deletedAt),
        ));

      const now = Date.now();
      const D60 = 60 * 24 * 3600 * 1000;
      const D730 = 730 * 24 * 3600 * 1000; // 24 meses

      type Estado = "nunca_fez" | "vencido" | "vencendo";
      type Item = {
        kind: "employee" | "terceiro";
        id: number;
        nome: string;
        cpf: string | null;
        funcao: string | null;
        tipoContrato: string | null;
        obraNome: string | null;
        fotoUrl: string | null;
        estado: Estado;
        ultimaRealizacao: string | null;
        dataValidade: string | null;
        diasParaVencer: number | null;
        dataAdmissao: string | null;
        tentativasAnteriores: number;
      };
      const out: Item[] = [];

      for (const e of emps) {
        if (inProgressSet.has(e.id)) continue;
        const last = lastMap.get(e.id);
        let estado: Estado = "nunca_fez";
        let dv: string | null = null;
        let dr: string | null = null;
        let diasParaVencer: number | null = null;
        if (last) {
          dr = last.dr;
          dv = last.dv
            ?? (last.dr ? new Date(new Date(last.dr).getTime() + D730).toISOString() : null);
          if (dv) {
            const t = new Date(dv).getTime();
            diasParaVencer = Math.ceil((t - now) / (24 * 3600 * 1000));
            if (t < now) estado = "vencido";
            else if (t - now <= D60) estado = "vencendo";
            else continue; // válido por > 60d, fora da lista
          }
        }
        out.push({
          kind: "employee",
          id: e.id, nome: e.nome, cpf: e.cpf, funcao: e.funcao,
          tipoContrato: e.tipoContrato, obraNome: null, fotoUrl: e.fotoUrl,
          estado, ultimaRealizacao: dr, dataValidade: dv, diasParaVencer,
          dataAdmissao: e.dataAdmissao,
          tentativasAnteriores: tentativasMap.get(e.id) ?? 0,
        });
      }

      // Terceiros: critério simplificado — sem `integracaoDocUrl` = pendente.
      // (Schema não guarda timestamp do upload pra calcular 24m; renovação
      // visual fica no cadastro do terceiro.)
      for (const t of ters) {
        if (t.integracaoDocUrl) continue;
        out.push({
          kind: "terceiro",
          id: t.id, nome: t.nome, cpf: t.cpf, funcao: t.funcao,
          tipoContrato: "terceiro", obraNome: t.obraNome, fotoUrl: t.fotoUrl,
          estado: "nunca_fez", ultimaRealizacao: null, dataValidade: null, diasParaVencer: null,
          dataAdmissao: null,
          tentativasAnteriores: 0,
        });
      }

      // Ordenar: vencido → nunca_fez → vencendo; depois por dias e nome.
      const order: Record<Estado, number> = { vencido: 0, nunca_fez: 1, vencendo: 2 };
      out.sort((a, b) => {
        const d = order[a.estado] - order[b.estado];
        if (d) return d;
        if (a.diasParaVencer !== null && b.diasParaVencer !== null) return a.diasParaVencer - b.diasParaVencer;
        return (a.nome || "").localeCompare(b.nome || "");
      });

      return out;
    }),

  criarRegistro: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
      configId: z.number().int().positive().optional(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().optional(),
      origem: z.enum(["manual", "smo", "reciclagem", "advertencia", "transferencia"]).default("manual"),
      smoId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        await assertCompanyAccess(ctx, input.companyId);
        const db = (await getDb())!;

        const [emp] = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          cpf: employees.cpf,
          funcao: employees.funcao,
        }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.companyId, input.companyId)));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado nesta empresa" });

        const token = gerarToken();
        // Rev. 2042 — coerção explícita pra evitar undefined no insert
        // (causa de "Cannot convert undefined or null to object" no driver).
        const values = {
          companyId: Number(input.companyId),
          employeeId: Number(input.employeeId),
          employeeNome: emp.nome ?? null,
          employeeCpf: emp.cpf ?? null,
          employeeFuncao: emp.funcao ?? null,
          configId: input.configId != null ? Number(input.configId) : null,
          obraId: input.obraId != null ? Number(input.obraId) : null,
          obraNome: input.obraNome?.trim() || null,
          origem: input.origem || "manual",
          smoId: input.smoId != null ? Number(input.smoId) : null,
          token,
          responsavel: (ctx.user?.name ? String(ctx.user.name) : "Sistema"),
          responsavelId: ctx.user?.id != null ? Number(ctx.user.id) : null,
        };
        const [row] = await db.insert(sstIntegracaoRegistros).values(values).returning();
        return row;
      } catch (e: any) {
        console.error("[criarRegistro] FAIL", {
          input,
          userId: ctx.user?.id,
          err: e?.message || String(e),
          stack: e?.stack,
        });
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao criar integração: ${e?.message || String(e)}`,
        });
      }
    }),

  criarRegistrosEmLote: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      employeeIds: z.array(z.number().int().positive()),
      configId: z.number().int().positive().optional(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().optional(),
      sessaoId: z.number().int().positive().optional(),
      origem: z.enum(["manual", "smo", "reciclagem", "advertencia", "transferencia"]).default("manual"),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      const emps = await db.select({
        id: employees.id, nome: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao,
      }).from(employees).where(and(inArray(employees.id, input.employeeIds), eq(employees.companyId, input.companyId)));

      const registros = emps.map(emp => ({
        companyId: input.companyId,
        employeeId: emp.id,
        employeeNome: emp.nome,
        employeeCpf: emp.cpf,
        employeeFuncao: emp.funcao,
        configId: input.configId ?? null,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome?.trim() || null,
        origem: input.origem,
        sessaoId: input.sessaoId ?? null,
        token: gerarToken(),
        responsavel: ctx.user.name ?? "Sistema",
        responsavelId: ctx.user.id,
      }));

      if (registros.length > 0) {
        await db.insert(sstIntegracaoRegistros).values(registros);
      }
      return { success: true, count: registros.length };
    }),

  criarSessao: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().optional(),
      titulo: z.string().max(255).optional(),
      dataSessao: z.string().optional(),
      tipo: z.enum(["individual", "grupo"]).default("grupo"),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const [row] = await db.insert(sstIntegracaoSessoes).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome?.trim() || null,
        titulo: input.titulo?.trim() || null,
        dataSessao: input.dataSessao || null,
        responsavel: ctx.user.name ?? "Sistema",
        responsavelId: ctx.user.id,
        tipo: input.tipo,
        observacoes: input.observacoes?.trim() || null,
      }).returning();
      return row;
    }),

  listarSessoes: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const sessoes = await db.select().from(sstIntegracaoSessoes)
        .where(eq(sstIntegracaoSessoes.companyId, input.companyId))
        .orderBy(desc(sstIntegracaoSessoes.createdAt));

      const sessaoIds = sessoes.map(s => s.id);
      if (sessaoIds.length === 0) return sessoes.map(s => ({ ...s, participantes: 0, aprovados: 0 }));

      const counts = await db.select({
        sessaoId: sstIntegracaoRegistros.sessaoId,
        total: sql<number>`count(*)::int`,
        aprovados: sql<number>`count(*) filter (where ${sstIntegracaoRegistros.status} = 'aprovado')::int`,
      }).from(sstIntegracaoRegistros)
        .where(and(inArray(sstIntegracaoRegistros.sessaoId, sessaoIds), isNull(sstIntegracaoRegistros.deletedAt)))
        .groupBy(sstIntegracaoRegistros.sessaoId);

      const countMap = new Map(counts.map(c => [c.sessaoId, c]));
      return sessoes.map(s => ({
        ...s,
        participantes: countMap.get(s.id)?.total || 0,
        aprovados: countMap.get(s.id)?.aprovados || 0,
      }));
    }),

  dashboardKpis: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), obraId: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const conds: any[] = [eq(sstIntegracaoRegistros.companyId, input.companyId), isNull(sstIntegracaoRegistros.deletedAt)];
      if (input.obraId) conds.push(eq(sstIntegracaoRegistros.obraId, input.obraId));

      const rows = await db.select({
        status: sstIntegracaoRegistros.status,
        count: sql<number>`count(*)::int`,
      }).from(sstIntegracaoRegistros)
        .where(and(...conds))
        .groupBy(sstIntegracaoRegistros.status);

      const statusMap: Record<string, number> = {};
      let totalRegistros = 0;
      for (const r of rows) { statusMap[r.status] = r.count; totalRegistros += r.count; }

      const mediaRows = await db.select({
        media: sql<number>`avg(${sstIntegracaoRegistros.nota}::numeric)`,
      }).from(sstIntegracaoRegistros)
        .where(and(...conds, sql`${sstIntegracaoRegistros.nota} IS NOT NULL`));

      const agora = new Date().toISOString();
      const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const [vencendo] = await db.select({
        count: sql<number>`count(*)::int`,
      }).from(sstIntegracaoRegistros)
        .where(and(
          ...conds,
          eq(sstIntegracaoRegistros.status, "aprovado"),
          lte(sstIntegracaoRegistros.dataValidade, em30dias),
          gte(sstIntegracaoRegistros.dataValidade, agora),
        ));

      // Rev. 2070 — Pedido do usuário (IMG_0970): "Arrume os cards, está
      // dizendo que tem 0 pendências e não verdade tem várias". Bug raiz:
      // `pendentes` contava só rows em `sst_integracao_registros` com
      // `status='pendente'` (campo legado, raramente populado). A aba
      // Pendentes e o badge do menu (Rev. 2063/2064) já usam lógica
      // correta: colaboradores ATIVOS sem aprovação válida (CLT/PJ +
      // terceiros sem integracao_doc_url). Espelho a mesma query do
      // `getBadgeCounts` (L332-377) aqui pra alinhar o KPI com o que o
      // usuário vê na aba.
      //
      // NOTA (architect): `obraId` não filtra aqui pois (a) employees não
      // têm FK direta pra obra (vínculo é via tabelas auxiliares) e (b) o
      // `DashboardTab` (client L146) nunca passa `obraId` — sempre chama
      // `{ companyId }`. Se algum dia a UI passar obraId, os contadores
      // de pendentes ficam company-wide enquanto aprovados/reprovados
      // ficam por obra; nesse caso reabrir esta query. Hoje, não-bug.
      const semIntegracaoRaw = await db.execute<{ total: number }>(sql`
        WITH last_ok AS (
          SELECT DISTINCT ON (employee_id)
            employee_id,
            COALESCE(data_validade,
                     COALESCE(data_realizacao, created_at) + INTERVAL '730 days') AS dv
          FROM sst_integracao_registros
          WHERE company_id = ${input.companyId}
            AND status = 'aprovado'
            AND deleted_at IS NULL
          ORDER BY employee_id, COALESCE(data_realizacao, created_at) DESC
        ),
        em_processo AS (
          SELECT DISTINCT employee_id
          FROM sst_integracao_registros
          WHERE company_id = ${input.companyId}
            AND status IN ('pendente', 'em_andamento')
            AND deleted_at IS NULL
        )
        SELECT COUNT(*)::int AS total
        FROM employees e
        LEFT JOIN last_ok lo ON lo.employee_id = e.id
        WHERE e."companyId" = ${input.companyId}
          AND e.status = 'Ativo'
          AND e."deletedAt" IS NULL
          AND COALESCE(e."listaNegra", 0) = 0
          AND e."dataDemissao" IS NULL
          AND e.id NOT IN (SELECT employee_id FROM em_processo)
          AND (lo.dv IS NULL OR lo.dv <= NOW() + INTERVAL '60 days')
      `);
      const semIntegracaoRows = (semIntegracaoRaw as any).rows ?? semIntegracaoRaw;
      const pendentesEmployees = Number(semIntegracaoRows?.[0]?.total ?? 0);

      const terceirosRaw = await db.execute<{ total: number }>(sql`
        SELECT COUNT(*)::int AS total
        FROM funcionarios_terceiros t
        WHERE t."companyId" = ${input.companyId}
          AND t.status = 'ativo'
          AND t.deleted_at IS NULL
          AND t.integracao_doc_url IS NULL
      `);
      const terceirosRows = (terceirosRaw as any).rows ?? terceirosRaw;
      const pendentesTerceiros = Number(terceirosRows?.[0]?.total ?? 0);

      const emProcessoCount = (statusMap["pendente"] || 0) + (statusMap["em_andamento"] || 0);
      const pendentesAuto = pendentesEmployees + pendentesTerceiros + emProcessoCount;

      return {
        // Rev. 2070 — `total` agora soma o universo real (aprovados ativos +
        // pendentes-auto), não apenas registros gravados. Antes o "Total: 1"
        // contradizia o usuário que via vários pendentes.
        total: (statusMap["aprovado"] || 0) + pendentesAuto + (statusMap["reprovado"] || 0),
        pendentes: pendentesAuto,
        emAndamento: statusMap["em_andamento"] || 0,
        aprovados: statusMap["aprovado"] || 0,
        reprovados: statusMap["reprovado"] || 0,
        vencidos: statusMap["vencido"] || 0,
        vencendoEm30Dias: vencendo?.count || 0,
        mediaNota: mediaRows[0]?.media ? Number(Number(mediaRows[0].media).toFixed(1)) : null,
        // Rev. 2070 — Taxa baseada em todos os colaboradores que precisam
        // de integração (aprovados + pendentes + reprovados). Reprovados
        // pesam contra a taxa.
        taxaAprovacao: (() => {
          const denom = (statusMap["aprovado"] || 0) + pendentesAuto + (statusMap["reprovado"] || 0);
          return denom > 0 ? Math.round(((statusMap["aprovado"] || 0) / denom) * 100) : 0;
        })(),
      };
    }),

  alertas: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;
      const alertas: { tipo: string; mensagem: string; registroId?: number; employeeNome?: string; obraNome?: string; count?: number }[] = [];

      const [pendentes] = await db.select({ count: sql<number>`count(*)::int` })
        .from(sstIntegracaoRegistros)
        .where(and(eq(sstIntegracaoRegistros.companyId, input.companyId), eq(sstIntegracaoRegistros.status, "pendente"), isNull(sstIntegracaoRegistros.deletedAt)));
      if (pendentes.count > 0) {
        alertas.push({ tipo: "pendente", mensagem: `${pendentes.count} colaborador(es) aguardando integração`, count: pendentes.count });
      }

      const agora = new Date().toISOString();
      const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const vencendo = await db.select({
        id: sstIntegracaoRegistros.id,
        employeeNome: sstIntegracaoRegistros.employeeNome,
        obraNome: sstIntegracaoRegistros.obraNome,
        dataValidade: sstIntegracaoRegistros.dataValidade,
      }).from(sstIntegracaoRegistros)
        .where(and(
          eq(sstIntegracaoRegistros.companyId, input.companyId),
          eq(sstIntegracaoRegistros.status, "aprovado"),
          lte(sstIntegracaoRegistros.dataValidade, em30dias),
          gte(sstIntegracaoRegistros.dataValidade, agora),
          isNull(sstIntegracaoRegistros.deletedAt),
        ))
        .orderBy(asc(sstIntegracaoRegistros.dataValidade))
        .limit(20);

      for (const v of vencendo) {
        alertas.push({ tipo: "vencendo", mensagem: `Integração de ${v.employeeNome} vence em breve`, registroId: v.id, employeeNome: v.employeeNome ?? undefined, obraNome: v.obraNome ?? undefined });
      }

      const reprovados = await db.select({
        id: sstIntegracaoRegistros.id,
        employeeNome: sstIntegracaoRegistros.employeeNome,
        tentativas: sstIntegracaoRegistros.tentativas,
      }).from(sstIntegracaoRegistros)
        .where(and(
          eq(sstIntegracaoRegistros.companyId, input.companyId),
          eq(sstIntegracaoRegistros.status, "reprovado"),
          isNull(sstIntegracaoRegistros.deletedAt),
        ))
        .limit(20);

      for (const r of reprovados) {
        alertas.push({ tipo: "reprovado", mensagem: `${r.employeeNome} reprovado (${r.tentativas} tentativa(s))`, registroId: r.id, employeeNome: r.employeeNome ?? undefined });
      }

      // Rev. 2064 — Fix: colunas reais são camelCase quoted ("employeeId",
      // "companyId", "deletedAt"); employees usa "nomeCompleto".
      const advertenciasRows = await db.execute(sql`
        SELECT e.id as employee_id, e."nomeCompleto" as employee_nome, count(w.id)::int as total_advertencias
        FROM employees e
        JOIN warnings w ON w."employeeId" = e.id AND w."companyId" = e."companyId" AND w."deletedAt" IS NULL
        WHERE e."companyId" = ${input.companyId} AND e.status = 'Ativo' AND e."deletedAt" IS NULL
        GROUP BY e.id, e."nomeCompleto"
        HAVING count(w.id) >= 2
      `);
      const advRows = Array.isArray(advertenciasRows) ? advertenciasRows : advertenciasRows?.rows ?? [];
      for (const a of advRows as any[]) {
        const jaTemReciclagem = await db.select({ id: sstIntegracaoRegistros.id })
          .from(sstIntegracaoRegistros)
          .where(and(
            eq(sstIntegracaoRegistros.companyId, input.companyId),
            eq(sstIntegracaoRegistros.employeeId, a.employee_id),
            eq(sstIntegracaoRegistros.origem, "advertencia"),
            sql`${sstIntegracaoRegistros.status} IN ('pendente', 'em_andamento')`,
            isNull(sstIntegracaoRegistros.deletedAt),
          ))
          .limit(1);
        if (jaTemReciclagem.length === 0) {
          alertas.push({
            tipo: "advertencia",
            mensagem: `${a.employee_nome} tem ${a.total_advertencias} advertência(s) — recomenda-se reciclagem`,
            employeeNome: a.employee_nome,
          });
        }
      }

      return alertas;
    }),

  gerarReciclagem: protectedProcedure
    .input(z.object({
      companyId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
      origem: z.enum(["reciclagem", "advertencia", "transferencia"]).default("reciclagem"),
      configId: z.number().int().positive().optional(),
      obraId: z.number().int().positive().optional(),
      obraNome: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      const db = (await getDb())!;

      const [emp] = await db.select({
        id: employees.id, nome: employees.nomeCompleto, cpf: employees.cpf, funcao: employees.funcao,
      }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.companyId, input.companyId)));
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado nesta empresa" });

      const [row] = await db.insert(sstIntegracaoRegistros).values({
        companyId: input.companyId,
        employeeId: input.employeeId,
        employeeNome: emp.nome,
        employeeCpf: emp.cpf,
        employeeFuncao: emp.funcao,
        configId: input.configId ?? null,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome?.trim() || null,
        origem: input.origem,
        token: gerarToken(),
        responsavel: ctx.user.name ?? "Sistema",
        responsavelId: ctx.user.id,
      }).returning();
      return row;
    }),

  buscarPorCpf: publicProcedure
    .input(z.object({ token: z.string(), cpf: z.string().min(11).max(14) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cpfLimpo = input.cpf.replace(/\D/g, "");

      const [registro] = await db.select().from(sstIntegracaoRegistros)
        .where(and(eq(sstIntegracaoRegistros.token, input.token), isNull(sstIntegracaoRegistros.deletedAt)));
      if (!registro) throw new TRPCError({ code: "NOT_FOUND", message: "Integração não encontrada" });

      const empCpf = (registro.employeeCpf || "").replace(/\D/g, "");
      if (empCpf !== cpfLimpo) throw new TRPCError({ code: "FORBIDDEN", message: "CPF não corresponde ao colaborador desta integração" });

      const registroSafe = {
        id: registro.id,
        status: registro.status,
        nota: registro.nota,
        tentativas: registro.tentativas,
        employeeNome: registro.employeeNome,
        employeeFuncao: registro.employeeFuncao,
        obraNome: registro.obraNome,
        dataRealizacao: registro.dataRealizacao,
        dataValidade: registro.dataValidade,
        origem: registro.origem,
        createdAt: registro.createdAt,
        configId: registro.configId,
      };

      if (registro.status === "aprovado") {
        return { status: "ja_aprovado", registro: registroSafe, modulos: [], config: null };
      }

      let config = null;
      if (registro.configId) {
        const [cfg] = await db.select().from(sstIntegracaoConfig).where(eq(sstIntegracaoConfig.id, registro.configId));
        config = cfg || null;
      }
      if (!config) {
        const conds: any[] = [eq(sstIntegracaoConfig.companyId, registro.companyId), eq(sstIntegracaoConfig.ativo, true), isNull(sstIntegracaoConfig.deletedAt)];
        if (registro.obraId) conds.push(eq(sstIntegracaoConfig.obraId, registro.obraId));
        const [cfg] = await db.select().from(sstIntegracaoConfig).where(and(...conds)).limit(1);
        config = cfg || null;
      }

      if (!config) {
        return { status: "sem_config", registro: registroSafe, modulos: [], config: null };
      }

      if (registro.status === "pendente") {
        await db.update(sstIntegracaoRegistros).set({
          status: "em_andamento", configId: config.id, updatedAt: sql`NOW()`,
        }).where(eq(sstIntegracaoRegistros.id, registro.id));
      }

      const modulos = await db.select().from(sstIntegracaoModulos)
        .where(and(eq(sstIntegracaoModulos.configId, config.id), isNull(sstIntegracaoModulos.deletedAt)))
        .orderBy(asc(sstIntegracaoModulos.ordem));

      const moduloIds = modulos.map(m => m.id);
      let perguntas: any[] = [];
      let alternativas: any[] = [];
      if (moduloIds.length > 0) {
        perguntas = await db.select().from(sstIntegracaoPerguntas)
          .where(inArray(sstIntegracaoPerguntas.moduloId, moduloIds))
          .orderBy(asc(sstIntegracaoPerguntas.ordem));
        const pIds = perguntas.map(p => p.id);
        if (pIds.length > 0) {
          alternativas = await db.select({
            id: sstIntegracaoAlternativas.id,
            perguntaId: sstIntegracaoAlternativas.perguntaId,
            texto: sstIntegracaoAlternativas.texto,
            ordem: sstIntegracaoAlternativas.ordem,
          }).from(sstIntegracaoAlternativas)
            .where(inArray(sstIntegracaoAlternativas.perguntaId, pIds))
            .orderBy(asc(sstIntegracaoAlternativas.ordem));
        }
      }

      const altMap = new Map<number, any[]>();
      for (const a of alternativas) {
        if (!altMap.has(a.perguntaId)) altMap.set(a.perguntaId, []);
        altMap.get(a.perguntaId)!.push(a);
      }
      const pergMap = new Map<number, any[]>();
      for (const p of perguntas) {
        if (!pergMap.has(p.moduloId)) pergMap.set(p.moduloId, []);
        pergMap.get(p.moduloId)!.push({ ...p, alternativas: altMap.get(p.id) || [] });
      }

      return {
        status: "pronto",
        registro: { ...registroSafe, status: "em_andamento" },
        modulos: modulos.map(m => ({ ...m, perguntas: pergMap.get(m.id) || [] })),
        config: { id: config.id, titulo: config.titulo, notaMinima: config.notaMinima, validadeMeses: config.validadeMeses },
      };
    }),

  submeterQuestionario: publicProcedure
    .input(z.object({
      token: z.string(),
      cpf: z.string().min(11).max(14),
      respostas: z.array(z.object({
        perguntaId: z.number().int().positive(),
        alternativaId: z.number().int().positive(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const cpfLimpo = input.cpf.replace(/\D/g, "");

      const [registro] = await db.select().from(sstIntegracaoRegistros)
        .where(and(eq(sstIntegracaoRegistros.token, input.token), isNull(sstIntegracaoRegistros.deletedAt)));
      if (!registro) throw new TRPCError({ code: "NOT_FOUND", message: "Integração não encontrada" });

      const empCpf = (registro.employeeCpf || "").replace(/\D/g, "");
      if (empCpf !== cpfLimpo) throw new TRPCError({ code: "FORBIDDEN", message: "CPF não corresponde" });
      if (registro.status === "aprovado") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta integração já foi aprovada" });

      if (!registro.configId) throw new TRPCError({ code: "BAD_REQUEST", message: "Configuração não vinculada" });

      const modulos = await db.select({ id: sstIntegracaoModulos.id }).from(sstIntegracaoModulos)
        .where(and(eq(sstIntegracaoModulos.configId, registro.configId), isNull(sstIntegracaoModulos.deletedAt)));
      const moduloIds = modulos.map(m => m.id);

      let expectedPerguntas: { id: number; moduloId: number }[] = [];
      if (moduloIds.length > 0) {
        expectedPerguntas = await db.select({ id: sstIntegracaoPerguntas.id, moduloId: sstIntegracaoPerguntas.moduloId })
          .from(sstIntegracaoPerguntas)
          .where(inArray(sstIntegracaoPerguntas.moduloId, moduloIds));
      }
      const expectedPerguntaIds = new Set(expectedPerguntas.map(p => p.id));
      const totalPerguntas = expectedPerguntaIds.size;

      if (totalPerguntas === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma pergunta configurada" });

      const submittedPerguntaIds = new Set(input.respostas.map(r => r.perguntaId));
      for (const pid of submittedPerguntaIds) {
        if (!expectedPerguntaIds.has(pid)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pergunta inválida enviada" });
        }
      }
      if (submittedPerguntaIds.size !== totalPerguntas) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Todas as ${totalPerguntas} perguntas devem ser respondidas` });
      }
      if (input.respostas.length !== submittedPerguntaIds.size) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Respostas duplicadas não são permitidas" });
      }

      const alternativaIds = input.respostas.map(r => r.alternativaId);
      const altsDb = await db.select({
        id: sstIntegracaoAlternativas.id,
        perguntaId: sstIntegracaoAlternativas.perguntaId,
        correta: sstIntegracaoAlternativas.correta,
      }).from(sstIntegracaoAlternativas)
        .where(inArray(sstIntegracaoAlternativas.id, alternativaIds));
      const altMap = new Map(altsDb.map(a => [a.id, a]));

      for (const r of input.respostas) {
        const alt = altMap.get(r.alternativaId);
        if (!alt || alt.perguntaId !== r.perguntaId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Alternativa não pertence à pergunta informada" });
        }
      }

      const tentativa = (registro.tentativas || 0) + 1;
      let acertos = 0;
      const respostasInsert = input.respostas.map(r => {
        const alt = altMap.get(r.alternativaId);
        const correta = alt?.correta || false;
        if (correta) acertos++;
        return {
          registroId: registro.id,
          perguntaId: r.perguntaId,
          alternativaId: r.alternativaId,
          correta,
          tentativa,
        };
      });

      if (respostasInsert.length > 0) {
        await db.insert(sstIntegracaoRespostas).values(respostasInsert);
      }

      const nota = totalPerguntas > 0 ? Math.round((acertos / totalPerguntas) * 100) : 0;

      const [cfg] = await db.select({ notaMinima: sstIntegracaoConfig.notaMinima, validadeMeses: sstIntegracaoConfig.validadeMeses })
        .from(sstIntegracaoConfig).where(eq(sstIntegracaoConfig.id, registro.configId));
      const notaMinima = cfg?.notaMinima ?? 70;
      const validadeMeses = cfg?.validadeMeses ?? 12;

      const aprovado = nota >= notaMinima;
      const agora = new Date();
      const updates: any = {
        nota: String(nota),
        tentativas: tentativa,
        updatedAt: sql`NOW()`,
      };

      if (aprovado) {
        updates.status = "aprovado";
        updates.dataRealizacao = agora.toISOString();
        const validade = new Date(agora);
        validade.setMonth(validade.getMonth() + validadeMeses);
        updates.dataValidade = validade.toISOString();
      } else {
        updates.status = "reprovado";
      }

      await db.update(sstIntegracaoRegistros).set(updates)
        .where(eq(sstIntegracaoRegistros.id, registro.id));

      // Rev. 2035: retornar campos do registro pós-update pra
      // geração do certificado client-side (jspdf) sem nova query.
      return {
        aprovado,
        nota,
        acertos,
        totalPerguntas,
        tentativa,
        notaMinima,
        registroId: registro.id,
        dataRealizacao: aprovado ? (updates.dataRealizacao as string) : null,
        dataValidade: aprovado ? (updates.dataValidade as string) : null,
        validadeMeses,
        employeeNome: registro.employeeNome,
        employeeCpf: registro.employeeCpf,
        employeeFuncao: registro.employeeFuncao,
        obraNome: registro.obraNome,
      };
    }),

  obterResultado: publicProcedure
    .input(z.object({ token: z.string(), cpf: z.string().min(11).max(14) }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cpfLimpo = input.cpf.replace(/\D/g, "");
      const [registro] = await db.select({
        id: sstIntegracaoRegistros.id,
        status: sstIntegracaoRegistros.status,
        nota: sstIntegracaoRegistros.nota,
        tentativas: sstIntegracaoRegistros.tentativas,
        employeeNome: sstIntegracaoRegistros.employeeNome,
        obraNome: sstIntegracaoRegistros.obraNome,
        dataRealizacao: sstIntegracaoRegistros.dataRealizacao,
        dataValidade: sstIntegracaoRegistros.dataValidade,
        origem: sstIntegracaoRegistros.origem,
        createdAt: sstIntegracaoRegistros.createdAt,
      }).from(sstIntegracaoRegistros)
        .where(and(eq(sstIntegracaoRegistros.token, input.token), isNull(sstIntegracaoRegistros.deletedAt)));
      if (!registro) throw new TRPCError({ code: "NOT_FOUND", message: "Integração não encontrada" });

      const [full] = await db.select({ cpf: sstIntegracaoRegistros.employeeCpf }).from(sstIntegracaoRegistros)
        .where(eq(sstIntegracaoRegistros.id, registro.id));
      const empCpf = (full?.cpf || "").replace(/\D/g, "");
      if (empCpf !== cpfLimpo) throw new TRPCError({ code: "FORBIDDEN", message: "CPF não corresponde" });

      return registro;
    }),

  historicoColaborador: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive(), employeeId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx, input.companyId);
      // Rev. 5192 — Raio-X guard.
      await assertRaioXAccess(ctx as any, input.employeeId);
      const db = (await getDb())!;
      // Rev. 2035: enriquece com nome da configuração pro card SST do Raio-X.
      const rows = await db.select({
        registro: sstIntegracaoRegistros,
        configNome: sstIntegracaoConfig.titulo,
        configNotaMinima: sstIntegracaoConfig.notaMinima,
        configValidadeMeses: sstIntegracaoConfig.validadeMeses,
      })
        .from(sstIntegracaoRegistros)
        .leftJoin(sstIntegracaoConfig, eq(sstIntegracaoConfig.id, sstIntegracaoRegistros.configId))
        .where(and(
          eq(sstIntegracaoRegistros.companyId, input.companyId),
          eq(sstIntegracaoRegistros.employeeId, input.employeeId),
          isNull(sstIntegracaoRegistros.deletedAt),
        ))
        .orderBy(desc(sstIntegracaoRegistros.createdAt));
      return rows.map(r => ({
        ...r.registro,
        configNome: r.configNome,
        configNotaMinima: r.configNotaMinima,
        configValidadeMeses: r.configValidadeMeses,
      }));
    }),
});
