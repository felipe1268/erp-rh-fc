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

- **Rev. 2097** — **Frota · `parseTollPdf` — fix "Erro ao interpretar resposta da IA" + parser robusto + mensagens úteis.** Pedido do user (screenshot do modal Rev. 2096 com toast "Erro ao interpretar resposta da IA" após clicar Analisar com IA no `2664869326.pdf` 317KB — fatura Sem Parar): "esta dando erro .. arrume isso". **Causa-raiz:** `server/routers/frotas.ts → parseTollPdf` chamava `invokeAnthropicVision` sem passar `maxTokens`, caía no default de **1024 tokens** (`server/_core/llm.ts:449`). Fatura Sem Parar mensal tem 15-40 passagens, cada item ~150-200 tokens — JSON facilmente passa de 3000 tokens. Claude cortava no meio (ex: `"praca": "MOREI`), `JSON.parse` falhava, e o catch genérico mostrava mensagem inútil. **Fixes em `server/routers/frotas.ts → parseTollPdf` (~L5429-5471):** (1) **`maxTokens: 8192`** — folga pra ~50-60 passagens; (2) **parser em 3 etapas via `tryParse` helper**: (a) JSON.parse direto sem markdown; (b) fallback extraindo trecho entre 1º `{` e último `}` (Claude às vezes prepende texto apesar do system prompt); (c) log dos primeiros 500 chars da resposta bruta no console pra diagnóstico futuro; (3) **mensagens úteis**: catch detecta `>= 8000 chars` (provável truncamento mesmo com 8192) e sugere "tente um PDF menor ou divida em partes"; erro "sem items" ganha "Verifique se é uma fatura/comprovante legível". **Não-mudanças:** prompt, modelo claude-sonnet-4-6, estrutura de retorno, frontend Rev. 2096, schema. **R-001/R-007:** N/A — só backend.
- **Rev. 2096** — **Frota · modal "Importar Pedágio/Sem Parar com IA" redesenhado nas regras de ouro.** Pedido do user (screenshot do modal antigo sobre o calendário mensal Abr/2026 de `/frotas/pedagios` — `DialogContent max-w-3xl` chapado, header com `<Sparkles>` plano sem gradient, card de arquivo em `bg-muted/30` cinzão, botão CTA retangular sem dica): "melhore este layout seguindo as regras de ouro". **Problema:** era a última peça do fluxo de Pedágios que ainda usava padrão antigo — destoava de FinanceiroConfiguracoes (Rev. 2094), Centros de Custo (Rev. 2092), Sócios (Rev. 2093). **Mudanças em `client/src/pages/frotas/Pedagios.tsx` ~L676-940:** (1) DialogContent `p-0 overflow-hidden flex flex-col` com largura adaptativa (`max-w-lg` antes de analisar, `max-w-3xl max-h-[90vh]` depois); (2) header gradient `from-violet-600 via-purple-600 to-fuchsia-600` com `<Sparkles>` em pill `bg-white/15 ring-4 ring-white/20` + subtítulo contextual (muda conforme pré/pós-análise); (3) card de arquivo `rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50/40` com `<FileText>` em pill branco, nome truncate violet-900 bold, badge KB violet, label PDF/Imagem inferido do mime, botão `<X>` pra remover, preview de imagem com moldura; (4) **pré-análise didática**: banner amber `<Lightbulb>` "Como funciona: a IA lê o comprovante, identifica placa, data, valor, praça e rodovia, e tenta vincular ao veículo cadastrado" + CTA gradient violet→fuchsia h-11 com `<Wand2>` (substituiu `<Eye>`), disabled sem arquivo; (5) **pós-análise KPI bar de 3 cards**: Detectados (violet), Sem veículo (emerald/rose dinâmico com sub-label), Total geral (slate + bolinha de confiança alta/media/baixa); (6) toolbar "Marcar todos / Limpar" (antes só clique-a-clique); (7) cards de item border-2, selecionado violet com gradient + shadow, não-selecionado slate opacity-60 hover:opacity-90, checkbox custom violet, valor `ml-auto` font-bold tabular-nums, praça+rodovia agrupados com `<MapPin>` e ` · ` (1 linha em vez de 2); (8) **footer pill** `bg-gradient-to-r from-slate-50 to-violet-50/40` com contador `{N}/{Total}` em pill violet bold tabular-nums, total R$ em slate-900 bold, botão importar gradient com shadow-md mostrando count ("Importar 5 Selecionado(s)"), Cancelar reseta `iaSelectedItems`. **Lógica preservada:** zero refator de `parseMut`/`saveIAItems`/`processIA`/backend. Apenas JSX+Tailwind. Novos ícones: Lightbulb, MapPin, FileText, Wand2. **R-001/R-007:** N/A — só frontend.

### Revisões recentes (one-liners)

- ~~Rev. 2095~~ — UX global · scrollbars sempre visíveis (12px) em todo o ERP. `scrollbar-gutter: stable` no html, `*::-webkit-scrollbar` slate-400/slate-100, `.scrollbar-thin`/`.scrollbar-none` re-declarados com `!important`. Único arquivo: `client/src/index.css`. Ver `shared/changelog.ts`.
- ~~Rev. 2094~~ — Financeiro · Configurações / página inteira redesenhada (header gradient blue→indigo + Settings pill; 4 cards de regime com auto-fill `REGIME_DEFAULTS` Presumido/Real/Simples/MEI tocando só campos vazios; 3 cards didáticos Federais/Municipais/Trabalhistas com help inline; KPI bar de sócios com alerta de % ≠ 100). Ver `shared/changelog.ts`.
- ~~Rev. 2093~~ — Financeiro · Configurações / modal "Novo Sócio" agora puxa sócios já cadastrados em Colaboradores. Backend `listSociosFromEmployees` com dedup por CPF normalizado (regexp_replace, R-007 sem ALTER). Frontend com `<optgroup>` disabled "✓ já cadastrado". Ver `shared/changelog.ts`.
- ~~Rev. 2092~~ — Financeiro · Centros de Custo / modal Novo/Editar redesenhado no padrão Categorias (DialogContent `p-0 overflow-hidden`, header gradient + ícone Building2, labels uppercase, Input h-9, `<select>` nativo mata overflow lateral). Ver `shared/changelog.ts`.
- ~~Rev. 2091~~ — Compras · "Atender pelo Estoque" agora pergunta a OBRA DE ORIGEM. Modal `TransferenciaEstoqueDialog` com saldo na origem + badges; `criarOrdemDeCotacao` ganha `obraOrigemId` opcional (validado contra `getEffectiveAllowedObraIds`). Ver `shared/changelog.ts`.

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
