# ERP Gestão Integrada — FC Engenharia

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

- **Rev. 4514** — **FEAT: RAIO-X DE EQUIPAMENTO LOCADO.** Nova procedure tRPC `locadoRaioX` + modal `EquipamentoLocadoRaioXModal.tsx` integrado ao painel de Detalhes (modalEventos) via botão "Raio-X" no header. 3 abas: Visão Geral (4 KPIs: dias pagos, custo total, qtd eventos, qtd pessoas + galeria "Quem movimentou" com foto circular + matrícula + badge Responsável + gráfico de barras mensal + pills de tipos de evento), Timeline (vertical com ícone por tipo, foto+matrícula do funcionário, obra, observação, assinaturas de devolução) e Dados da Locação (fornecedor, datas, valores, responsável com Avatar). Backend: JOIN employees para foto+"fotoUrl"+matrícula; agregação de responsáveis com isResp=true para o responsável do locado; cálculo mensal por interseção de período. ZERO schema change.
- **Rev. 4513** — **MIGRAÇÃO DE DADOS: EQUIPAMENTOS DA FC ENGENHARIA DE LOCADOS → PRÓPRIOS.** 47 registros de `equipamentos_locados` com fornecedor "FC ENGENHARIA E CONSTRUÇÃO LTDA" migrados atomicamente para `equipamentos_proprios`: em_uso→em_obra (obra preservada), devolvido→disponivel. Patrimônios únicos mantidos como-estão; múltiplas unidades do mesmo código recebem sufixo -01/-02… (ex: 1051-01 a 1051-12 para os 12 andaimes). Locados marcados como devolvido com data_fim_real=hoje + nota de migração. ZERO schema change. Também: campo "Valor de aquisição" sempre visível no modal de Editar Equip. Próprio (saiu do acordeão "Mais detalhes"). Rev. 4512b.

### 5 one-liners

- **Rev. 4512** — **FEAT: DASH UTILIZAÇÃO DE EQUIPAMENTOS LOCADOS.** Nova página `/equipamentos/locados-utilizacao`: KPIs, seção "Pagando parado no almox", gráfico barras mensais, rankings, histórico de ciclos. ZERO schema change.
- **Rev. 4511** — **FEAT: DASH RETIRADAS DO ALMOXARIFADO (corrigido).** Nova página `/equipamentos/entregas`: KPIs, gráfico mensal, ranking quem/obras, seção "Ferramentas não devolvidas" com badge dias em aberto. ZERO schema change.
- **Rev. 4510** — **FEAT: RAIO-X DO EQUIPAMENTO PRÓPRIO + FOTOS NA PRESENÇA DDS.** Modal redesenhado com 3 abas, donut, area chart, bar chart dias da semana, "quem mais usa". Fotos de colaborador na lista de presença das sessões DDS. ZERO schema change.
- **Rev. 4509** — **FEAT: RAIO-X DO EQUIPAMENTO PRÓPRIO.** Modal Raio-X com KPIs, gráfico de ocupação mensal, timeline. `proprioRaioX` tRPC. ZERO schema change.
- **Rev. 4508** — **FEAT: CP — APAGAR EM LOTE (cancelEntryBulk).** Botão "Apagar selecionados" + Dialog confirmação + motivo. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4506 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
