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

- **Rev. 4155** — **FROTA: NOVA VIAGEM — FIXES: fleet_trips COLUNAS FALTANDO + DIRECTIONS API DO BROWSER.** `[SyncSchema+] Rev. 4155` em `index.ts`: loop `ALTER TABLE fleet_trips ADD COLUMN IF NOT EXISTS` para as 17 colunas (vehicle_id, motorista_nome, etc.) — resolve INSERT "column does not exist". `RoutePreview` reescrito com `useEffect`+`fetch` direto para `maps.googleapis.com` do browser (GOOGLE_API_KEY tem restrição de referrer — REQUEST_DENIED no servidor). `getGoogleMapsKey` procedure entrega a key via tRPC autenticado. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4154** — **FROTA: NOVA VIAGEM — FIXES: DROPDOWN FIXED, SUBMIT, ERRO VISÍVEL + API GOOGLE DIRETA.** `makeGoogleDirect` + `makeMapsRequest` em `map.ts` para usar `GOOGLE_API_KEY` quando proxy Replit ausente; autocomplete e GPS passam a funcionar. Dropdown: `position:fixed` + `getBoundingClientRect`. Botão "Criar": `formRef.current?.requestSubmit()`. Erro de submit inline no footer. `|| null → || undefined` nos opcionais do Zod. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4152** — **FROTA: NOVA VIAGEM — SELETOR VISUAL DE VEÍCULOS + MAPA GOOGLE + AUTO-PREENCHIMENTO.** `VehiclePickerSheet`; `NovaViagemDialog` single-column; auto-fill motorista+km; `RoutePreview` iframe + 4 cards; backend `getRouteInfo`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4151** — **FROTA: CONTROLE DE VIAGENS — MÓDULO COMPLETO.** 2 tabelas novas (`fleet_trips`, `fleet_trip_expenses`); 10 procedures tRPC; fluxo pendente→autorizada→em_andamento→concluída; km inicial/final com foto; despesas + reembolso PIX/TED. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4150** — **FROTA: PEDÁGIOS — CATEGORIA sem_parar CORRIGIDA EM LOTE + IMPORTADOR FIXADO.** 2558 registros `pedagio` → `sem_parar`; tipoUsoToCategoria corrigida; 317 praças duplicadas unificadas. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4149** — **FROTA: FILTRO MENSAL NOS 3 DASHBOARDS (Combustível, Manutenção, Pedágios).** Backend aceita `mes` opcional; white-card com "Ano todo" + Jan–Dez com badges de contagem; cores temáticas por tela; trocar ano reseta o mês. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4148** — **NFS-e: #30 VALOR LÍQUIDO CORRIGIDO (120.694,65 → 119.469,32).** Fórmula subtraía só IRRF, não retencao_csll; correção direta por id=929 alinhando ao DANFSe. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4146** — **NFS-e: BATCH DANFSes #38, #41, #42 — ISS RETIDO + VALOR LÍQUIDO CORRIGIDOS.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4145** — **NFS-e: BATCH DANFSes #29–#40 — ISS RETIDO + VALOR LÍQUIDO CORRIGIDOS, 10 NOTAS.** ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4143 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
