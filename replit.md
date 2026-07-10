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

- **Rev. 4134** — **BANCO DE HORAS: BOTÃO ATIVAR/DESATIVAR SEPARADO DO ZERAMENTO DE HISTÓRICO.** No card "Vigência do Banco de Horas" (`BancoHoras.tsx` → aba "Regras & Orientação"), agora são 2 botões INDEPENDENTES: (1) "Ativar/Desativar Banco de Horas" — troca o regime da empresa (banco de horas × pagamento de hora extra) via `setHeDestinoPadrao`, sem tocar em saldo, com AlertDialog próprio; (2) "Zerar Histórico de Saldos Anteriores" (`horasExtras.zerarSaldosAnteriores`, novo endpoint que substitui o antigo `definirVigencia`) — só zera saldo anterior à data escolhida, sem alterar o regime. Toda troca de regime E todo zeramento entram na timeline de `banco_horas_vigencias`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4133** — **BANCO DE HORAS: VIGÊNCIA COM ZERAMENTO DE SALDO ANTERIOR + TIMELINE DE REGIME.** Nova tabela `banco_horas_vigencias` (timeline de quando a empresa mudou entre banco de horas e pagamento de hora extra). Todo saldo (positivo ou negativo) anterior a uma data é neutralizado por lançamento de AJUSTE em `banco_horas_lancamentos` (nunca apaga histórico) + timeline de vigências exibida na aba "Regras & Orientação". ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4132** — **RESCISÃO EM CONTRATO DE EXPERIÊNCIA: TÍTULO CORRETO DO "COMUNICADO DE DISPENSA".** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4131** — **SPED ECD/ECF + EFD CONTRIBUIÇÕES/ICMS-IPI: LEGENDA CLARA DO PERÍODO A ENCAMINHAR.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4130** — **FOTO DO FUNCIONÁRIO: FALLBACK POR CPF PARA CADASTRO DUPLICADO ENTRE EMPRESAS DO GRUPO.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4129** — **REPAGINAÇÃO DO GRID DE HABILIDADES: CATEGORIA + FOTOS DOS COLABORADORES NO CARD.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4128** — **DIÁLOGO "ATRIBUIR HABILIDADE" MOSTRA FOTO + OBRA ATUAL DO FUNCIONÁRIO.** ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4126 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
