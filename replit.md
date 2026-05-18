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

- **Rev. 2101** — **Frota · `parseTollPdf` — fix "require is not defined" ao analisar PDF com IA.** Pedido do user (screenshot do modal IA com `2664869326.pdf` 317KB carregado + toast preto "require is not defined"): "ESTA COM ERRO..". **Causa-raiz:** `package.json` declara `"type": "module"` (ESM), mas a Rev. 2099 introduziu `const pdfParse = require("pdf-parse")` dentro de `parseTollPdf` (`server/routers/frotas.ts:5458`). Em ESM puro `require` não é global — erro lançado no runtime da mutation tRPC e propagado pro frontend como toast. **Fix em `server/routers/frotas.ts` (~L5460-5464):** trocado por `const pdfParseMod = await import("pdf-parse"); const pdfParse = pdfParseMod.default || pdfParseMod` — dynamic import ESM-nativo + interop CJS via `.default`. **Não-mudanças:** chunking, prompt, frontend, modal, botão Rev. 2100. **Nota:** `folhaPagamento.ts:49` tem o mesmo padrão `require('pdf-parse')` — fora do escopo do bug, mas candidato a fix futuro. **R-001/R-007:** N/A.
- **Rev. 2100** — **Frota · Pedágios / botão DEDICADO "Importar PDF" (rose) na barra superior.** Pedido do user (screenshot pós-Rev. 2099): "cade o botão de importar PDF..". A Rev. 2099 fez o backend aceitar PDFs grandes via "Importar (IA)" violet, mas o user esperava um botão explícito. **Mudanças em `client/src/pages/frotas/Pedagios.tsx`:** (1) novo `pdfFileRef` ao lado de `iaFileRef` (~L62); (2) novo `<input accept="application/pdf">` + Button rose "Importar PDF" com ícone `FileText` (~L412-416) — reusa `handleIaFileSelect` e abre o mesmo modal Rev. 2096; (3) input do botão IA mantém accept misto (`image/* + application/pdf`) pra retrocompat. **Não-mudanças:** backend `parseTollPdf` Rev. 2099, modal, lógica de chunking. **R-001/R-007:** N/A — só JSX.
- **Rev. 2098** — **RH · alerta "Início de Férias" virou GLOBAL no módulo RH/DP (não só em `/ferias`) + redesenho nas regras de ouro.** Pedido do user (screenshot do modal antigo `max-w-md` Palmtree azul plano + caixa cinza `bg-muted/40` na tela de Férias do colaborador ALEXANDRO GONCALVES DO NASCIMENTO): "preciso que faça dois ajustes.. primeiro que ajuste o layout conforme as nossas regras de ouro, e quero que este alerta apareça assim que eu abrir o modulo RH, hoje o alerta aparece somente se eu acessar o menu FERIAS, porem o alerta precisa ser instantaneo". **Problemas:** (1) auto-prompt vivia DENTRO de `Ferias.tsx` (~L662-704 + ~L3100-3193), só disparava se entrasse no menu Férias — risco de multa em dobro Art. 137 CLT se RH esquecesse; (2) visual antigo destoava do padrão Rev. 2094+. **Mudanças:** (a) novo `client/src/components/FeriasGozoPrompt.tsx` standalone — query `trpc.avisoPrevio.ferias.list`, sessionStorage skip por `<id>:<dataInicio>`, 2 estágios redesenhados (`confirm` header gradient `from-blue-600 via-sky-600 to-cyan-600` com Palmtree em pill, subtítulo dinâmico "hoje" vs "atrasadas X dias", badge "N aguardando" se múltiplos, card colaborador border-2 com Briefcase pro cargo, **KPI bar de 2 cards** Período/Duração, footer pill gradient emerald→teal CTA `Sim, iniciar gozo`; `naoOptions` header slate AlertTriangle, **3 botões-card** rose/blue/slate ao invés de footer); (b) mount global em `DashboardLayout.tsx` ~L913-925 — `<FeriasGozoPromptGlobal />` wrapper lê `useModule().activeModule`, só renderiza se `=== "rh-dp"`. Como `ModuleContext` já mapeia `/colaboradores`, `/folha-pagamento`, `/painel/rh`, `/ferias` → "rh-dp", o modal aparece instantaneamente em qualquer tela RH; (c) limpeza em `Ferias.tsx`: removidos state `gozoPromptItem`/`gozoPromptStage`, useEffect, helpers `getSkipped`/`addSkipped`/`fecharGozoPrompt` e o `<Dialog>` inteiro, substituídos por comentários. **Trade-off:** "Reagendar data" no global navega pra `/ferias` (em vez de abrir inline `handleDefinirData` que depende de state local). **Não-mudanças:** backend, schema, mutation `ferias.update`. **R-001/R-007:** N/A — só frontend.
- **Rev. 2097** — **Frota · `parseTollPdf` — fix "Erro ao interpretar resposta da IA" + parser robusto + mensagens úteis.** Pedido do user (screenshot do modal Rev. 2096 com toast "Erro ao interpretar resposta da IA" após clicar Analisar com IA no `2664869326.pdf` 317KB — fatura Sem Parar): "esta dando erro .. arrume isso". **Causa-raiz:** `server/routers/frotas.ts → parseTollPdf` chamava `invokeAnthropicVision` sem passar `maxTokens`, caía no default de **1024 tokens** (`server/_core/llm.ts:449`). Fatura Sem Parar mensal tem 15-40 passagens, cada item ~150-200 tokens — JSON facilmente passa de 3000 tokens. Claude cortava no meio (ex: `"praca": "MOREI`), `JSON.parse` falhava, e o catch genérico mostrava mensagem inútil. **Fixes em `server/routers/frotas.ts → parseTollPdf` (~L5429-5471):** (1) **`maxTokens: 8192`** — folga pra ~50-60 passagens; (2) **parser em 3 etapas via `tryParse` helper**: (a) JSON.parse direto sem markdown; (b) fallback extraindo trecho entre 1º `{` e último `}` (Claude às vezes prepende texto apesar do system prompt); (c) log dos primeiros 500 chars da resposta bruta no console pra diagnóstico futuro; (3) **mensagens úteis**: catch detecta `>= 8000 chars` (provável truncamento mesmo com 8192) e sugere "tente um PDF menor ou divida em partes"; erro "sem items" ganha "Verifique se é uma fatura/comprovante legível". **Não-mudanças:** prompt, modelo claude-sonnet-4-6, estrutura de retorno, frontend Rev. 2096, schema. **R-001/R-007:** N/A — só backend.

### Revisões recentes (one-liners)

- ~~Rev. 2099~~ — Frota · `parseTollPdf` aceita PDFs grandes (faturas Sem Parar/Caixa 100+ passagens) via pdf-parse + chunking por placa (regex `Descritivo: PLACA -`), CONCURRENCY=3 via `invokeLLM` text, prompt anti-spurious, fallback match por placa normalizada, limite frontend 10→15MB. Ver `shared/changelog.ts`.
- ~~Rev. 2098~~ — RH · alerta "Início de Férias" virou GLOBAL no módulo RH (não só `/ferias`) via novo `FeriasGozoPrompt` montado em `DashboardLayout` (lê `useModule().activeModule === "rh-dp"`). Modal redesenhado nas regras de ouro: header gradient blue→cyan com Palmtree pill, KPI bar 2 cards Período/Duração, estágio "Não" com 3 botões-card. Limpeza em `Ferias.tsx` (removido state/useEffect/Dialog duplicado). Ver `shared/changelog.ts`.
- ~~Rev. 2097~~ — Frota · `parseTollPdf` fix "Erro ao interpretar resposta da IA" — `maxTokens` 1024→8192, parser em 3 etapas (`tryParse` → strip markdown → trecho `{...}`), mensagens úteis. Ver `shared/changelog.ts`.
- ~~Rev. 2096~~ — Frota · modal "Importar Pedágio/Sem Parar com IA" redesenhado nas regras de ouro: DialogContent p-0, header gradient violet→fuchsia com Sparkles em pill, card de arquivo violet, banner Lightbulb, CTA Wand2, KPI bar 3 cards pós-análise, toolbar Marcar todos/Limpar, footer pill com contador. Ver `shared/changelog.ts`.
- ~~Rev. 2095~~ — UX global · scrollbars sempre visíveis (12px) em todo o ERP. `scrollbar-gutter: stable` no html, `*::-webkit-scrollbar` slate-400/slate-100, `.scrollbar-thin`/`.scrollbar-none` re-declarados com `!important`. Único arquivo: `client/src/index.css`. Ver `shared/changelog.ts`.

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
