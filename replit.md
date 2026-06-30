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

- **Rev. 3917** — **SST — PT WIZARD + EDIT DIALOG: CNPJ AUTO-FILL DA RAZÃO SOCIAL VIA BRASILAPI.** Ao selecionar "Empresa contratada" e digitar o CNPJ (14 dígitos), a razão social é buscada automaticamente via `compras.buscarCNPJ` (BrasilAPI → ReceitaWS fallback). Helper `formatCNPJ` formata incrementalmente. Spinner durante a busca, ✓ verde + badge "Preenchido automaticamente" quando Ok, mensagem de erro quando CNPJ não encontrado. Mudar o CNPJ limpa o nome auto-preenchido. Funciona no wizard e no dialog de edição. ZERO DELETE.

- **Rev. 3916** — **SST — PT PDF REDESIGN: 3 LOGOS + SOLICITANTE AUTO + CHECKLIST COM REFS NR.** Cabeçalho triplo: logo FC (esq) + badge NR-35 / Portaria MTE 313/2012 (centro) + logos do CLIENTE e GERENCIADORA da obra (dir, condicionais). Solicitante passou a usar `criadoPorNome` (ctx.user.name gravado na criação) com fallback no employee — o nome do login sempre aparece. Checklist ganhou coluna "Referência NR" (NR-35/35.X, NR-7, NR-10, NR-6, NR-26) em layout tabular zebrado. Status como pill colorido, seções com badge de norma, envolvidos com badge "Terceiro" âmbar. ZERO DELETE.

### 5 one-liners

- **Rev. 3915** — **CONCILIAÇÃO BANCÁRIA CEF JAN/2026: PARES ZERO-LÍQUIDO DESCONSIDERADOS + FIX REAPRESENTADOS NA LISTA.** 12 linhas de 6 pares zero-líquido desconsideradas diretamente no banco. Filtro `repExt` corrigido. Resultado: 97% (115/119). ZERO DELETE.

- **Rev. 3914** — **CONCILIAÇÃO BANCÁRIA: FIX BARRA DE PROGRESSO (100% FALSO) + SUGESTÕES COM LINHAS DESCONSIDERADAS.** `totLinhas` passou a usar `accConciliadasMap[contaBancariaId]`; `sugerirConciliacao` ganhou `desconsiderado_em IS NULL`. ZERO DELETE.

- **Rev. 3913** — **SST — APR EXPANDIDA: 10 TIPOS DE ATIVIDADE COM CHECKLIST POR NR.** Wizard 3→5 steps: Tipo (10 cards) → Dados → Checklist (Sim/Não/NA) → Riscos (pré-populados) → EPIs+Aprovação. Schema +tipo_atividade+checklist_json (ColFix v3913). Detail dialog exibe checklist respondido. ZERO DELETE.

- **Rev. 3912** — **SST — PT WIZARD: BLOQUEIO NR-35 NO STEP DE ENVOLVIDOS.** Funcionários sem NR-35 ou com NR-35 vencida ficam bloqueados (card vermelho + ícone Ban + mensagem + line-through no nome). Click retorna sem ação. Terceiros não bloqueados. ZERO DELETE.

- **Rev. 3907** — **SST — PT DIALOG: FIX CONFIRM EM BRANCO + REMOVER FCSIGN.** `confirm()` chamado com 2 strings mas hook espera objeto `{title,description,tone}` → AlertDialog sem texto. Corrigido. Botão "Enviar FCSign" + dialog removidos da UI (backend preservado). Invalidações `remover` corrigidas. ZERO DELETE.

- **Rev. 3906** — **SST — PT: FIX ASSINATURA + STATUS QUEM ASSINOU + CORES AZUL + LOGO NO PDF.** Bug root cause: `posicao: max(6)` rejeitava envolvidos nas posições 7-30 (zod BAD_REQUEST silencioso) + invalidate com chave errada (`ptId` vs `id`). Fixes: `max(30)`, chave correta. Banner de progresso. PDF: cores azul FC + logo. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3904 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
