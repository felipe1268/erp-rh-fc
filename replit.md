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
- `server/`: Express backend + tRPC routers (`_core/`, `routers/`, `db.ts`)
- `drizzle/`: Schema (`schema.ts`) + migrations
- `shared/`: Tipos e constantes (`version.ts`, `changelog.ts`, `paymentConditions.ts`, `modules.ts`)
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui`

## Recent changes

> **Convenção (atualizada Rev. 2062 — mais enxuta)** — `replit.md` guarda apenas as **2 últimas revisões** em formato detalhado e as **5 seguintes** em one-liner. Detalhe completo (causa-raiz, arquivos tocados, racional, follow-ups) vive SEMPRE em `shared/changelog.ts`. Demais one-liners vão para `replit-history.md`.
>
> **Ao criar uma nova revisão**:
> 1. Adicionar bloco detalhado da NOVA revisão no TOPO (1-2 parágrafos: o quê + por quê + arquivos principais — sem racional longo, isso vai pro `changelog.ts`).
> 2. Demover a Rev. mais antiga das 2 detalhadas pra one-liner.
> 3. Demover a Rev. mais antiga dos 5 one-liners pra `replit-history.md`.
> 4. Bumpar `shared/version.ts` + prepender entrada COMPLETA (com todo o racional) no topo de `shared/changelog.ts`.

### Top 2 detalhadas

- **Rev. 2099** — **Frota · `parseTollPdf` aceita PDFs grandes (faturas Sem Parar/Caixa mensais com 100+ passagens) via extração de texto no servidor + chunking por placa.** Pedido do user (anexou 2 PDFs Caixa Pré-Pagos da FC: `2664869326.pdf` 4 págs Mar/2026 e `2688160736.pdf` 6 págs Abr/2026, 11 placas e ~150 passagens cada): "preciso poder ter a opção de subir o PDF tbm.. faça este ajustes para que eu posa fazer o upload". **Diagnóstico:** Botão "Importar (IA)" Rev. 2096 já aceitava `application/pdf` mas backend mandava como imagem pro Vision — cada página ~2-3K tokens de input + resposta JSON ~22500 tokens, estourava mesmo com `maxTokens: 8192` da Rev. 2097. **Mudanças em `server/routers/frotas.ts → parseTollPdf` (~L5369-5520, reescrita):** (1) **fork por mimeType**: `application/pdf` → nova rota com pdf-parse + texto; imagens → mantém Vision; (2) **extração via `require("pdf-parse")`** (já instalado, usado em folhaPagamento.ts); se texto < 50 chars (PDF scaneado), cai pra Vision com `maxTokens: 16384`; (3) **chunking por placa**: detecta `Descritivo:\s*([A-Z0-9]{6,8})\s*-` (padrão Caixa/Sem Parar); se ≥2 placas E texto > 60K chars, monta chunks `header + bloco placa-por-placa`, processa em paralelo `CONCURRENCY=3` via `invokeLLM` (text); (4) **prompt refinado**: "1 item por passagem (não agrupar)", "IGNORAR Resumo da Fatura/Plano Contratado/Encargos/totais", "usar placa do Descritivo" — evita items spurious de plano mensal R$ 21,90; (5) **match por placa fallback**: se IA não bateu vehicleId, normaliza `[^A-Z0-9]/gi` e procura no DB — alto hit-rate pós-chunking; (6) **helper `parseJsonResponse`** reusa parser robusto Rev. 2097; (7) **frontend** `Pedagios.tsx` ~L131: limite 10MB → 15MB. **Não-mudanças:** schema tRPC, `parseTollExcel`, modal Rev. 2096. **R-001/R-007:** N/A.
- **Rev. 2098** — **RH · alerta "Início de Férias" virou GLOBAL no módulo RH/DP (não só em `/ferias`) + redesenho nas regras de ouro.** Pedido do user (screenshot do modal antigo `max-w-md` Palmtree azul plano + caixa cinza `bg-muted/40` na tela de Férias do colaborador ALEXANDRO GONCALVES DO NASCIMENTO): "preciso que faça dois ajustes.. primeiro que ajuste o layout conforme as nossas regras de ouro, e quero que este alerta apareça assim que eu abrir o modulo RH, hoje o alerta aparece somente se eu acessar o menu FERIAS, porem o alerta precisa ser instantaneo". **Problemas:** (1) auto-prompt vivia DENTRO de `Ferias.tsx` (~L662-704 + ~L3100-3193), só disparava se entrasse no menu Férias — risco de multa em dobro Art. 137 CLT se RH esquecesse; (2) visual antigo destoava do padrão Rev. 2094+. **Mudanças:** (a) novo `client/src/components/FeriasGozoPrompt.tsx` standalone — query `trpc.avisoPrevio.ferias.list`, sessionStorage skip por `<id>:<dataInicio>`, 2 estágios redesenhados (`confirm` header gradient `from-blue-600 via-sky-600 to-cyan-600` com Palmtree em pill, subtítulo dinâmico "hoje" vs "atrasadas X dias", badge "N aguardando" se múltiplos, card colaborador border-2 com Briefcase pro cargo, **KPI bar de 2 cards** Período/Duração, footer pill gradient emerald→teal CTA `Sim, iniciar gozo`; `naoOptions` header slate AlertTriangle, **3 botões-card** rose/blue/slate ao invés de footer); (b) mount global em `DashboardLayout.tsx` ~L913-925 — `<FeriasGozoPromptGlobal />` wrapper lê `useModule().activeModule`, só renderiza se `=== "rh-dp"`. Como `ModuleContext` já mapeia `/colaboradores`, `/folha-pagamento`, `/painel/rh`, `/ferias` → "rh-dp", o modal aparece instantaneamente em qualquer tela RH; (c) limpeza em `Ferias.tsx`: removidos state `gozoPromptItem`/`gozoPromptStage`, useEffect, helpers `getSkipped`/`addSkipped`/`fecharGozoPrompt` e o `<Dialog>` inteiro, substituídos por comentários. **Trade-off:** "Reagendar data" no global navega pra `/ferias` (em vez de abrir inline `handleDefinirData` que depende de state local). **Não-mudanças:** backend, schema, mutation `ferias.update`. **R-001/R-007:** N/A — só frontend.
- **Rev. 2097** — **Frota · `parseTollPdf` — fix "Erro ao interpretar resposta da IA" + parser robusto + mensagens úteis.** Pedido do user (screenshot do modal Rev. 2096 com toast "Erro ao interpretar resposta da IA" após clicar Analisar com IA no `2664869326.pdf` 317KB — fatura Sem Parar): "esta dando erro .. arrume isso". **Causa-raiz:** `server/routers/frotas.ts → parseTollPdf` chamava `invokeAnthropicVision` sem passar `maxTokens`, caía no default de **1024 tokens** (`server/_core/llm.ts:449`). Fatura Sem Parar mensal tem 15-40 passagens, cada item ~150-200 tokens — JSON facilmente passa de 3000 tokens. Claude cortava no meio (ex: `"praca": "MOREI`), `JSON.parse` falhava, e o catch genérico mostrava mensagem inútil. **Fixes em `server/routers/frotas.ts → parseTollPdf` (~L5429-5471):** (1) **`maxTokens: 8192`** — folga pra ~50-60 passagens; (2) **parser em 3 etapas via `tryParse` helper**: (a) JSON.parse direto sem markdown; (b) fallback extraindo trecho entre 1º `{` e último `}` (Claude às vezes prepende texto apesar do system prompt); (c) log dos primeiros 500 chars da resposta bruta no console pra diagnóstico futuro; (3) **mensagens úteis**: catch detecta `>= 8000 chars` (provável truncamento mesmo com 8192) e sugere "tente um PDF menor ou divida em partes"; erro "sem items" ganha "Verifique se é uma fatura/comprovante legível". **Não-mudanças:** prompt, modelo claude-sonnet-4-6, estrutura de retorno, frontend Rev. 2096, schema. **R-001/R-007:** N/A — só backend.

### Revisões recentes (one-liners)

- ~~Rev. 2097~~ — Frota · `parseTollPdf` fix "Erro ao interpretar resposta da IA" — `maxTokens` 1024→8192 (default truncava em ~30 itens), parser em 3 etapas (`tryParse` → strip markdown → trecho `{...}`), mensagens úteis ("tente PDF menor" se ≥8K chars). Ver `shared/changelog.ts`.
- ~~Rev. 2096~~ — Frota · modal "Importar Pedágio/Sem Parar com IA" redesenhado nas regras de ouro (`client/src/pages/frotas/Pedagios.tsx` ~L676-940): DialogContent p-0 overflow-hidden, header gradient violet→fuchsia com Sparkles em pill, card de arquivo violet, banner Lightbulb didático, CTA Wand2, KPI bar 3 cards pós-análise, toolbar Marcar todos/Limpar, cards de item border-2 selecionado violet, footer pill com contador. Ver `shared/changelog.ts`.
- ~~Rev. 2095~~ — UX global · scrollbars sempre visíveis (12px) em todo o ERP. `scrollbar-gutter: stable` no html, `*::-webkit-scrollbar` slate-400/slate-100, `.scrollbar-thin`/`.scrollbar-none` re-declarados com `!important`. Único arquivo: `client/src/index.css`. Ver `shared/changelog.ts`.
- ~~Rev. 2094~~ — Financeiro · Configurações / página inteira redesenhada (header gradient blue→indigo + Settings pill; 4 cards de regime com auto-fill `REGIME_DEFAULTS` Presumido/Real/Simples/MEI tocando só campos vazios; 3 cards didáticos Federais/Municipais/Trabalhistas com help inline; KPI bar de sócios com alerta de % ≠ 100). Ver `shared/changelog.ts`.
- ~~Rev. 2093~~ — Financeiro · Configurações / modal "Novo Sócio" agora puxa sócios já cadastrados em Colaboradores. Backend `listSociosFromEmployees` com dedup por CPF normalizado (regexp_replace, R-007 sem ALTER). Frontend com `<optgroup>` disabled "✓ já cadastrado". Ver `shared/changelog.ts`.

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
