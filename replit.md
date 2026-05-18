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

- **Rev. 2073** — **Cotações · "Prazo de Entrega" obrigatório em MDO puro (cotação tipo='servico') mesmo o campo não existir no fluxo.** Pedido IMG_0979: "mão de obra não tem prazo de entrega, arrume a lógica, somente material tem isso". A Rev. 2071 só dispensou MDO+Medição, mas MDO+Parcelado (PIX, à vista, boleto, etc.) continuava travado exigindo um campo que o próprio modal esconde (`showEntregaFrete = modoModal !== "mdo"` L1536). Regra correta: `tipo='servico'` (MDO puro) NUNCA exige Prazo; `tipo='pacote'` (material+MDO) exige (exceto em medição → mobilização); `tipo='material'` sempre exige. Fix em 3 espelhos: (1) `validarCondicoesVencedor` (client L2293+) com novas const `isServicoPuro` + `dispensaPrazo`; (2) banner amber `condicoesIncompletas` (client L2354+) + texto dinâmico no banner (L2998+) listando só o que realmente falta; (3) validação server `gerarOC` (`server/routers/compras.ts` L5885+) — gate final. ZERO migration, ZERO schema change.
- **Rev. 2072** — **Fechamento de Ponto · sub-modal "Menos Dias Trabalhados" (calendário do colaborador) repaginado pelas regras de ouro.** Pedido IMG_0978: "Melhore o layout conforme as regras de ouro". Era o único dos modais de memória de cálculo do FechamentoPonto que ainda usava dialog estreito (700px) com resumo apertado em linha única e grid 2 cols `text-xs`. Agora segue 100% o padrão Atraso/HE/Faltas: fullscreen (`w-screen h-screen max-w-none rounded-none`), header gradient `from-indigo-600 via-slate-600 to-slate-500` + ícone `CalendarDays` em badge 14×14 + título "Memória de cálculo · Menos Dias Trabalhados" + subtítulo com nome+período, botão `Voltar ao ranking` no topo do header. Corpo `max-w-7xl` em `bg-slate-50/40` com 3 blocos: (1) grid de 6 KPI cards (Trabalhados/Faltas/FDS/Feriados/Férias/Presença) cada um com border colorido + número `text-3xl tabular-nums` + label contextual; (2) card `Info` "Como ler esta tela"; (3) card "Dia a dia · N dias" com grid responsivo 1/2/3/4 cols (antes 2 fixo), pílulas `rounded-lg ring-1` em `text-sm`. ZERO lógica alterada — todos cálculos preservados; única extração foi `pctPresenca` como const. ZERO backend, ZERO migration. Arquivo: `client/src/pages/FechamentoPonto.tsx` L2597-2768.

### Revisões recentes (one-liners)

- ~~Rev. 2071~~ — Cotações · `handleSalvar` força `tipoPagamento="medicao"` quando MDO+modoEfetivo=medicao + parser `ValidacaoErro` parava bullet inline (`\n` antes do primeiro). Ver `shared/changelog.ts`.
- ~~Rev. 2070~~ — SST Integração · `dashboardKpis` agora espelha `getBadgeCounts` (CTEs last_ok+em_processo, terceiros sem doc, anti-fantasma) — card "Pendentes" não mostra mais 0 quando há pendências. Ver `shared/changelog.ts`.
- ~~Rev. 2069~~ — SST Integração · multiseleção + select-all + bulk delete nas abas Aprovados e Reprovados (espelha padrão da Pendentes, reusa endpoint `excluirRegistros`). Ver `shared/changelog.ts`.
- ~~Rev. 2068~~ — Fechamento de Ponto · fix "Voltar ao ranking" fechava a tela toda no iPad · `onInteractOutside={e.preventDefault()}` no Dialog externo. Ver `shared/changelog.ts`.
- ~~Rev. 2067~~ — Raio-X · fix `100vh`→`100dvh` no overlay (cards SST/Integração cortados no iPad Safari). Ver `shared/changelog.ts`.

> Revisões 2066 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
