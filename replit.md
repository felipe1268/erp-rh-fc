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

- **Rev. 3889** — **EPI — OBSERVAÇÃO OBRIGATÓRIA QUANDO EPI FORA DO KIT + FLAG `fora_do_kit` + BADGE NA TABELA.** Nova coluna `fora_do_kit` em `epi_deliveries` (self-heal Rev. 3889). `createDelivery` valida server-side: `foraDoKit=true` sem `observacoes` → BAD_REQUEST. Formulário de nova entrega ganha Textarea `Observação` (borda vermelha + asterisco quando EPI fora do kit, obrigatória). `addEntregaItem` persiste flag por item para entregas multi-EPI. `handleSubmitEntrega` bloqueia submit se qualquer item fora do kit sem observação. Tabela de entregas exibe badge ⚠ "Fora do Kit" em âmbar. Rastreabilidade completa: gestor sempre justifica. ZERO DELETE.

- **Rev. 3888** — **EPI — CATÁLOGO GERENCIADO DE MOTIVOS (ADMIN-ONLY WRITE) + EDIT DIALOG VIRA SELECT.** Nova tabela `epi_motivos` (global, sem companyId); self-heal Rev. 3888 cria + semeia os 7 canônicos. tRPC `listMotivos`/`createMotivo`/`updateMotivo` — escrita bloqueada p/ usuário comum (FORBIDDEN). Nova entrega e edição de entrega populam Select do banco (fallback hardcoded). `EpiMotivosConfig.tsx`: painel na aba Config (abaixo de Kits); ADM vê Novo/Renomear/Desativar + AlertDialog de confirmação; usuário vê somente a lista com cadeado. Normalização adicional: "Primeira"→Kit Admissão; "Só tinha um uniforme."→Entrega Regular; 5 one-offs→Entrega Regular. ZERO DELETE.

### 5 one-liners

- **Rev. 3887** — **EPI — FOTO DO FUNCIONÁRIO NAS ENTREGAS + ALERTA DE KIT POR FUNÇÃO + MOTIVO PADRONIZADO.** Avatar circular + "Entregue por"; banner amber/verde por kit; Select 7 motivos canônicos; `[NormalizaMotivosEPI]`. ZERO DELETE.

- **Rev. 3886** — **TEMPLATES DE EXTRATO — PREVIEW FULLSCREEN + COLAPSO DE GRUPOS + DEDUP FRONTEND + GATE DE TEMPLATE NA CONCILIAÇÃO.** Dialog fullscreen; grupos colapsáveis; dedup por nome normalizado; gate na Conciliação (PDF sem template → Dialog vermelho 4 etapas). ZERO DELETE.

- **Rev. 3885** — **TEMPLATES DE EXTRATO — AUDITORIA (QUEM/QUANDO) + ACESSO RESTRITO A ADMIN.** Colunas `atualizado_por_id/nome`; `assertAdminRole` em create/update/delete/analisarPdf; botões ocultos p/ não-admin. ZERO DELETE.

- **Rev. 3884** — **TEMPLATES DE EXTRATO — REDESIGN: AGRUPADO POR BANCO + CARDS EM GRADE.** Templates agrupados por banco; cards 2-colunas com faixa de cor; pills de stats. ZERO DELETE.

- **Rev. 3883** — **TEMPLATES DE EXTRATO — EYE PREVIEW + DEDUP GUARD + PROMPT RIGOROSO.** Preview colorido 3 seções; dedup no create (overlap ≥50%); prompt IA reescrito. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3872 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
