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

- **Rev. 4293** — **CONTRATO PJ: NOME DO SÓCIO/ADMINISTRADOR COMO REPRESENTANTE + DADOS BANCÁRIOS DO PRESTADOR.** O campo `[CONTRATANTE_REPRESENTANTE]` ficava em branco porque `companies` não tem `responsavelLegal`; fonte correta é `company_partners`. Fix: subquery em `company_partners` no `getById` retorna `companyRepresentante` (1º sócio ativo). Dados bancários: 4 novas colunas em `pj_contracts` (`banco_prestador`, `agencia_prestador`, `conta_prestador`, `pix_prestador`), SyncSchema+ Rev. 4293, seção "Dados Bancários da Contratada" no form de `ModuloPJ` e bloco de exibição no `ContratoPJView`. Placeholder `[DADOS_BANCARIOS_CONTRATADA]` também suportado no modelo e no FCSign. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4292** — **FIX: CONCILIAÇÃO — CHEQUE DEVOLVIDO NÃO APARECIA NO PAINEL QUANDO DÉBITO JÁ CONCILIADO + CRÉDITO VAZAVA PARA "SEM LANÇAMENTO".** Motor de conciliação rodava `detectarParesEstorno` em 2 passagens separadas (pendRes e concRes). Par com débito em concRes + crédito em pendRes (cavalo) não era detectado. Fix (A): 3ª passagem híbrida combina `concMin + linhasMin` e dedup por `debitoId:creditoId`. Fix (B): perna em pendRes recebe `.reversal` para sair de "No extrato, sem lançamento". Caso real: cheque 393 Santander FC Aparecida R$ 15.000, motivo 48. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4291** — **FIX: HABILIDADES — FUNCIONÁRIO DUPLICADO QUANDO MESMO CPF ESTÁ EM DUAS EMPRESAS.** Dedup por `${cpfLimpo}:${skillId}` + COUNT DISTINCT por CPF limpo. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4290** — **FIX: CONCILIAÇÃO — parseChequeNumero SUPORTA "Nº NNN" SOLTO.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4289** — **FIX: MAPA DE COTAÇÃO — INPUTS MAT/MO COM FORMATO BR.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4288** — **FEATURE: LEITOR IA EXTRAI MAT/MO EM COTAÇÕES TIPO PACOTE.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4287** — **FIX: MAPA DE COTAÇÃO (PACOTE) — COLUNAS MAT/MO NÃO EDITÁVEIS E MO ZERADA.** ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4286 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
