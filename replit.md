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

- **Rev. 2096** — **Frota · modal "Importar Pedágio/Sem Parar com IA" redesenhado nas regras de ouro.** Pedido do user (screenshot do modal antigo sobre o calendário mensal Abr/2026 de `/frotas/pedagios` — `DialogContent max-w-3xl` chapado, header com `<Sparkles>` plano sem gradient, card de arquivo em `bg-muted/30` cinzão, botão CTA retangular sem dica): "melhore este layout seguindo as regras de ouro". **Problema:** era a última peça do fluxo de Pedágios que ainda usava padrão antigo — destoava de FinanceiroConfiguracoes (Rev. 2094), Centros de Custo (Rev. 2092), Sócios (Rev. 2093). **Mudanças em `client/src/pages/frotas/Pedagios.tsx` ~L676-940:** (1) DialogContent `p-0 overflow-hidden flex flex-col` com largura adaptativa (`max-w-lg` antes de analisar, `max-w-3xl max-h-[90vh]` depois); (2) header gradient `from-violet-600 via-purple-600 to-fuchsia-600` com `<Sparkles>` em pill `bg-white/15 ring-4 ring-white/20` + subtítulo contextual (muda conforme pré/pós-análise); (3) card de arquivo `rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50/40` com `<FileText>` em pill branco, nome truncate violet-900 bold, badge KB violet, label PDF/Imagem inferido do mime, botão `<X>` pra remover, preview de imagem com moldura; (4) **pré-análise didática**: banner amber `<Lightbulb>` "Como funciona: a IA lê o comprovante, identifica placa, data, valor, praça e rodovia, e tenta vincular ao veículo cadastrado" + CTA gradient violet→fuchsia h-11 com `<Wand2>` (substituiu `<Eye>`), disabled sem arquivo; (5) **pós-análise KPI bar de 3 cards**: Detectados (violet), Sem veículo (emerald/rose dinâmico com sub-label), Total geral (slate + bolinha de confiança alta/media/baixa); (6) toolbar "Marcar todos / Limpar" (antes só clique-a-clique); (7) cards de item border-2, selecionado violet com gradient + shadow, não-selecionado slate opacity-60 hover:opacity-90, checkbox custom violet, valor `ml-auto` font-bold tabular-nums, praça+rodovia agrupados com `<MapPin>` e ` · ` (1 linha em vez de 2); (8) **footer pill** `bg-gradient-to-r from-slate-50 to-violet-50/40` com contador `{N}/{Total}` em pill violet bold tabular-nums, total R$ em slate-900 bold, botão importar gradient com shadow-md mostrando count ("Importar 5 Selecionado(s)"), Cancelar reseta `iaSelectedItems`. **Lógica preservada:** zero refator de `parseMut`/`saveIAItems`/`processIA`/backend. Apenas JSX+Tailwind. Novos ícones: Lightbulb, MapPin, FileText, Wand2. **R-001/R-007:** N/A — só frontend.
- **Rev. 2095** — **UX global · scrollbars sempre visíveis e mais grossas (12px) em todo o ERP para facilitar navegação.** Pedido do user (screenshot do FullScreenDialog "Mais Horas Extras" em `/fechamento-de-ponto` com scrollbar fininha quase invisível à direita): "coloque a barra de rolagem. geral. para que eu possa ter uma navegabilidade". **Problema:** Chrome/Safari renderizam scrollbar como overlay fininho que só aparece ao scrollar — em dialogs full-screen e tabelas longas (almoxarifado, financeiro) o user perdia a referência visual e não conseguia agarrar facilmente o thumb. **Solução (CSS global em `client/src/index.css` ~L644-712):** (1) `scrollbar-gutter: stable` no `html` reserva o espaço da barra mesmo quando inativa (acaba com o "pulo" ao abrir/fechar dialogs); (2) `html, body, *` ganham `scrollbar-width: auto` (não thin) + `scrollbar-color: #94a3b8 #f1f5f9` (slate-400 thumb / slate-100 track) — funciona no Firefox; (3) **WebKit/Blink** (Chrome/Edge/Safari): `*::-webkit-scrollbar` com `width: 12px; height: 12px`, track slate-100 arredondado (radius 8px), thumb slate-400 com `border: 2px solid #f1f5f9` (efeito inset com respiro visual), hover slate-500, `scrollbar-corner` slate-100. **Preservação:** `.scrollbar-thin` e `.scrollbar-none` (usados em tab bars / smart entry) re-declarados DEPOIS do bloco global com `!important` em todas as props (width/height/scrollbar-width/color/background/border) pra continuarem funcionando. **Arquivo único:** `client/src/index.css`. Zero JS / zero refator de componente. Não afeta mobile (touch devices não renderizam scrollbar nativa). **R-001/R-007:** N/A — mudança puramente cosmética.

### Revisões recentes (one-liners)

- ~~Rev. 2094~~ — Financeiro · Configurações / página inteira redesenhada (header gradient blue→indigo + Settings pill; 4 cards de regime com auto-fill `REGIME_DEFAULTS` Presumido/Real/Simples/MEI tocando só campos vazios; 3 cards didáticos Federais/Municipais/Trabalhistas com help inline; KPI bar de sócios com alerta de % ≠ 100). Ver `shared/changelog.ts`.
- ~~Rev. 2093~~ — Financeiro · Configurações / modal "Novo Sócio" agora puxa sócios já cadastrados em Colaboradores. Backend `listSociosFromEmployees` com dedup por CPF normalizado (regexp_replace, R-007 sem ALTER). Frontend com `<optgroup>` disabled "✓ já cadastrado". Ver `shared/changelog.ts`.
- ~~Rev. 2092~~ — Financeiro · Centros de Custo / modal Novo/Editar redesenhado no padrão Categorias (DialogContent `p-0 overflow-hidden`, header gradient + ícone Building2, labels uppercase, Input h-9, `<select>` nativo mata overflow lateral). Ver `shared/changelog.ts`.
- ~~Rev. 2091~~ — Compras · "Atender pelo Estoque" agora pergunta a OBRA DE ORIGEM. Modal `TransferenciaEstoqueDialog` com saldo na origem + badges; `criarOrdemDeCotacao` ganha `obraOrigemId` opcional (validado contra `getEffectiveAllowedObraIds`). Ver `shared/changelog.ts`.
- ~~Rev. 2090~~ — Compras · Ordens (OC/OS) ganha filtro por Obra. Novo `<Select>` Building2 com "Todas/Sem obra/lista ordenada", reusa `obrasQ`. Botão X limpa, pill de resultados conta o novo filtro. Ver `shared/changelog.ts`.

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
