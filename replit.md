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

- **Rev. 4491** — **FIX: AUDITORIA COMPLETA DE FILTROS P2P — SCs "APROVADO"+OC NÃO SÃO "CONCLUÍDO".** `scEntregueTotal()` tratava `status="aprovado"` como terminal incondicional → SCs com OC emitida e 0/N recebidos apareciam em "Concluído". Nova prioridade estrita: `_ocsEntregues` → Concluído; `_itens.atendidos>=total>0` → Concluído; `aprovado+!_hasOC+itens=0` → legacy OK; senão → NÃO concluído. `statusEfetivoSC`, `kpis`, `statusBreakdown`, `breakdownPredicates` corrigidos. ZERO schema change.
- **Rev. 4490** — **FIX: RÓTULOS P2P — "AG. RECEBIMENTO" → "AG. ENTREGA".** Badge clareza operacional: OC emitida → fornecedor ainda não entregou → "Ag. Entrega". ZERO schema change.

### 5 one-liners

- **Rev. 4487** — **SEGREGAÇÃO DE FUNÇÕES: REMOVER "AGUARDANDO PAGAMENTO" DO MÓDULO COMPRAS (COSO/LGPD).** Ciclo do comprador termina no recebimento. `statusEfetivoSC()` agora retorna `"aprovado"` (badge "Concluído") em vez de `"aguardando_pagamento"` para SCs com `_ocsEntregues=true`. Grid volta a `lg:grid-cols-9`. ZERO schema change.
- **Rev. 4485** — **FIX: PLACEHOLDERS DE PRAZO DE NF NO TEMPLATE ISO DE CONTRATO PJ.** Novos placeholders `[TEXTO_DIA_FECHAMENTO]`, `[PRAZO_NOTA_ADIANTAMENTO]`, `[PRAZO_NOTA_FECHAMENTO]` adicionados aos 4 paths. `[DIA_FECHAMENTO]=31` exibe "último dia do mês". ZERO schema change.
- **Rev. 4484** — **FEAT: DIA 2ª MEDIÇÃO PJ — OPÇÃO "ÚLTIMO DIA DO MÊS".** Campo "Dia 2ª Medição" no formulário de Contrato PJ substituído por toggle "Dia fixo | Último dia" + input numérico condicional. Convenção `diaFechamento = 31`. ZERO schema change.
- **Rev. 4483** — **FEAT: FCSIGN — AUTENTICAÇÃO OBRIGATÓRIA PARA SIGNATÁRIOS INTERNOS.** Testemunhas, contratante, empregador e empregado DEVEM estar logados no sistema para assinar via link. `getByToken` devolve `requiresLogin/loggedIn/cpfMatches`; `sign` rejeita UNAUTHORIZED/FORBIDDEN se CPF não bater. Frontend: `LoginGate` + `CpfMismatchBox`. ZERO schema change.
- **Rev. 4482** — **FEAT: NOVO USUÁRIO OBRIGATORIAMENTE VINCULADO A COLABORADOR (CLT/PJ).** Formulário "Novo Usuário" ganha "Passo 0: Colaborador" obrigatório no topo: busca por nome, filtra apenas CLT/PJ ativos sem userId, auto-preenche nome/e-mail/empresa ao selecionar. ZERO schema change.
- **Rev. 4480** — **FEAT: GESTORES — VÍNCULO EXPLÍCITO COM USUÁRIO DO SISTEMA.** Badge "Conta no sistema" dos gestores de contratos passava a usar match por e-mail. Solução: 2 novas colunas `gestor_financeiro_user_id` / `gestor_rh_user_id` em companies; endpoint `listUsuariosSistema`; `getGestoresContrato` busca por userId explícito com fallback por e-mail.
- **Rev. 4478** — **FIX: "SEM ACESSO A ESTA EMPRESA" AO MARCAR/DESMARCAR EQUIPAMENTO NO ALMOXARIFADO.** `vincularItemAlmoxarifado` / `desvincularItemAlmoxarifado` usavam `getUserCompanyLinks` (legado). Fix: `getCompaniesForUser`. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4474 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
