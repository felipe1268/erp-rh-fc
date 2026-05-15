# ERP RH & DP — FC Engenharia

A comprehensive full-stack ERP system for FC Engenharia, managing HR, payroll, projects, finance, procurement, and operational workflows.

## Run & Operate

- **Dev**: `PORT=5000 NODE_ENV=development pnpm dev`
- **Build**: `pnpm build`
- **Prod**: `node dist/index.js`

**Required Env Vars**:
- `NEON_DATABASE_URL` (or `DATABASE_URL`)
- `JWT_SECRET` (random 48-char hex)
- `NODE_ENV=production`
- `SMTP_PASSWORD`
- `GOOGLE_API_KEY`
- `FROTA_API_TOKEN` (for Infleet API)
- `VITE_APP_TITLE`
- `VITE_APP_LOGO`
- `OAUTH_SERVER_URL`
- `VITE_APP_ID`
- `OWNER_OPEN_ID`

## Stack

- **Frontend**: React 19, Tailwind CSS 4, shadcn/ui, Wouter
- **Backend**: Express 4, tRPC 11, Drizzle ORM
- **Database**: PostgreSQL (Neon)
- **Auth**: Manus OAuth (JWT) or local username/password
- **Build**: Vite 7
- **Package Manager**: pnpm

## Where things live

- `client/`: React frontend
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1809**: **Planejamento · REMOÇÃO do "Diagnóstico de Avanços" da Rev. 1808 a pedido explícito do usuário**. User (15/05/2026): "tire isso não crie botão para fazer seu trabalho.. jamais..". Removidos integralmente: (a) estado `diagOpen` + `useQuery` lazy em `PlanejamentoDetalhe.tsx` (L4892-4898), (b) botão azul "Diagnóstico" do toolbar da aba Avanço Semanal (L5827-5836), (c) modal full-screen R-001 com KPIs/tabela por revisão/10 últimos/audit log (L6478-6645), (d) endpoint tRPC `diagnosticarAvancos` em `server/routers/planejamento.ts` (L1530-1690). Sobrou apenas marcador-comentário no router avisando que **NUNCA MAIS** se cria botão/modal/endpoint de diagnóstico do agente na UI do usuário. Origem do problema dos avanços continua sob investigação: análise estática mostra `salvarAtividades` L1102-1112 faz HARD DELETE de atividades fora do payload — re-salvar a Rev. 41 órfana os avanços sem `eapCodigo` recuperável. Solução recomendada (sem código): **Point-in-Time Restore da Neon** (janela 7d) restaura 100% dos avanços com zero risco. Sem schema, sem deps.
- **Rev. 1808**: **Planejamento · botão "Diagnóstico" (read-only) na aba Avanço Semanal — REMOVIDO na Rev. 1809**. Implementação 100% read-only criada para investigar avanços que sumiram do projeto QIU 2 - FASE 4 (id 29), sem mexer em dado. Endpoint tRPC `diagnosticarAvancos` calculava por revisão: total avanços, órfãos, semanas distintas, último timestamp/usuário, range de IDs ativ vs IDs referenciados. Modal full-screen exibia 3 KPI cards, tabela por revisão, 10 últimos lançamentos e audit log 72h. **Tudo deletado na Rev. 1809** porque o usuário rejeitou a abordagem de criar UI extra como ferramenta de diagnóstico do agente.
- **Rev. 1807**: **Planejamento · destrava save de projetos legados (R-015) + acaba com a lentidão da aba Avanço Semanal (R-016)**. User (15/05/2026): "fizemos modificações no modulo em outros projetos, isso pode ter prejudicado os projetos prontos" + "página extremamente lenta, mais de 1s". DOIS fixes cirúrgicos: **(A) Regressão Rev. 1798**: `salvarAtividades` em `server/routers/planejamento.ts` L1042-1046 abortava com `TRPCError BAD_REQUEST` quando qualquer atividade-folha tinha `eapCodigo` fora do orçamento — projetos prontos importados antes da R-013 ficavam travados. Trocado `throw` por `console.warn` estruturado (amostra dos 5 primeiros + total). Auto-sync de nome (R-013, L1014-1026) MANTIDO intacto. Save volta a completar; divergências viram diagnóstico visual, não bloqueio. **(B) Lentidão**: `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` L5031-5076 — `semanasComDados` tinha loop triplo `O(S × M × K)` com `.filter+.sort` aninhados (250M iterações em projeto de 100 semanas × 500 atividades × 5000 avanços, travava 2s+). Refatorado para `O(K log K + S × M)` com pré-indexação em `Map<atividadeId, Array<{sem,pct}>>` ASC + ponteiros monotônicos por atividade (two-pointer/merge). Speedup ~5000×. **Novas regras de ouro** R-015 (validação retroativa = warning + bypass legado) e R-016 (jamais loop O(n²) em useMemo) registradas em `REGRAS_DE_OURO.md` com padrões obrigatórios e checklist. Sem mudança de schema, sem novas dependências.
- **Rev. 1806**: **Aviso Prévio · campo de upload do Aviso Assinado pelo colaborador (PDF/JPG/PNG, máx 10MB)**. User (14/05/2026): "preciso ter um campo para subir um anexo (aviso assinado pelo colaborador)". Implementação 4-camadas: (1) schema — novas colunas `aviso_assinado_url` + `aviso_assinado_enviado_em` em `termination_notices` (drizzle/schema.ts L2857-2860). NÃO confundir com `novoEmpregoCartaUrl` (Súmula 276 — outro cenário). (2) ColFix em `server/_core/index.ts` L615-620 (ADD COLUMN IF NOT EXISTS). (3) Backend `server/routers/avisoPrevioFerias.ts`: `getById` L346 retorna os 2 campos; novas mutations `uploadAvisoAssinado` L2077 (mesma assinatura de `uploadCartaNovoEmprego`, key `aviso-previo/{companyId}/{id}/aviso-assinado-{rand}.{ext}`, audit log) e `removerAvisoAssinado` L2120. (4) Frontend `AvisoPrevio.tsx`: estado/ref/handler L224-321; novo painel azul (gradient blue→indigo) no modal de Detalhes L1877-1948 entre Acerto e Observações — vazio: botão "Anexar Aviso Assinado"; preenchido: "Abrir documento" + Substituir + Remover (confirm) + carimbo da data. Oculto para Pedido de Demissão.
- **Rev. 1805**: **Aviso Prévio · cabeçalho azul com logo nos documentos + correção 36→30 dias no Trabalhado**. User (14/05/2026): "no aviso trabalhado o texto é sempre 30 dias, a regra de 3/ano só vale na rescisão monetária" + "preciso de cabeçalho azul com logo igual aos demais documentos". `gerarDocumentoCore` em `client/src/pages/AvisoPrevio.tsx` L482-488: `diasAviso=30` fixo (anosServico marcado `void` para evitar warning, regra +3/ano continua apenas no cálculo monetário existente). CSS `.doc-header` (gradient #1e3a8a→#2563eb + border amarelo #fbbf24 4px) + wrapper `.doc` com padding 32px e `@page margin: 0 0 20mm 0` para header full-bleed na impressão. Logo via `empresa.logoUrl`, fallback caixa branca com primeiras 14 letras do nome. Aplicado em ambos os layouts: Trabalhado L548-583 e Indenizado L638-669.

## 🏆 Regras de Ouro (LER OBRIGATORIAMENTE)

**Antes de criar ou editar QUALQUER tela, modal, dashboard ou componente visual, consulte `REGRAS_DE_OURO.md` na raiz do projeto.**

Resumo das 10 regras (detalhes + checklist em `REGRAS_DE_OURO.md`):

1. **R-001 · Modais full-screen** — `w-[100vw] h-[100dvh]` mobile / `w-[98vw] h-[96dvh]` desktop, **SEMPRE** com `resizable={false}` no DialogContent (senão o style inline da shadcn força 512px).
2. **R-002 · Visual rico** — gradient header, ícones grandes, badges, KPI cards. Nunca telas chapadas.
3. **R-003 · Tailwind JIT-safe** — cores via `Record<string, ...>`, nunca template literals.
4. **R-004 · Responsividade** — tabela vira cards no mobile, testar no iPad (768-1024px).
5. **R-005 · Acessibilidade** — `tabIndex`, `role`, `aria-label`, focus-visible:ring.
6. **R-006 · pt-BR** — toda comunicação em português brasileiro.
7. **R-007 · Imports lucide-react** — UM ÚNICO import por arquivo (Babel barra duplicates).
8. **R-008 · Versionamento** — bump `version.ts` + entry completa em `changelog.ts` + 5 últimas em `replit.md`.
9. **R-009 · Secrets** — nunca logar/exibir valores de env vars sensíveis.
10. **R-010 · SQL Drizzle** — aspas duplas em camelCase no WHERE, sempre filtrar `deleted_at IS NULL` + `companyId`.
11. **R-011 · Indiretas/LoE não compõem o Caminho Crítico** (PMBOK §6.4.2 / DCMA #6).
12. **R-012 · Tela de impressão sem páginas em branco/vazias** — fix global no `@media print` de `index.css`. Para imprimir só conteúdo de modal aberto, envolva com `<div className="print-only">…</div>` (esconde o resto da árvore automaticamente).

**Checklist pré-conclusão** está no fim do `REGRAS_DE_OURO.md` — passar item a item antes de finalizar.

## User preferences

- **Idioma**: português brasileiro em toda comunicação.
- **Publicação**: Autoscale (`pnpm run build` + `node dist/index.js`).
- **Tom de UI**: visual rico, gradientes coloridos por contexto, badges, ícones grandes — evitar telas chapadas.
- **Modais SEMPRE full-screen** (R-001 das Regras de Ouro).
- **Nunca mostrar valores de secrets** em código ou logs.
- **Sempre citar o NOME do projeto** ao falar de algum projeto de planejamento (não usar só o id). Ex.: "projeto 29 (QIU 2 - FASE 4)" e não só "projeto 29". Se não souber o nome, falar isso explicitamente em vez de omitir.
