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

- **Rev. 4032** — **MEDIÇÃO DE CONTRATOS: ESPAÇAMENTO E ALINHAMENTO VERTICAL DOS CAMPOS "DATA INÍCIO"/"DATA FIM".** Seguindo a Rev. 4031, usuário mandou mais prints reclamando que as datas "ainda estão sobrepondo" e o layout não tinha sido corrigido — colunas coladas sem espaço visível + texto colado à borda superior do campo (mal centralizado). `MedicaoDetalhe.tsx`: grid `gap-3`→`gap-6` + `min-w-0`/`w-full` nas colunas (largura igual, sem overflow); nos 4 `<input type="date">` (modalBoletim e modalEditBoletim) adicionado `flex items-center h-10 leading-normal` para forçar centralização vertical do texto (inputs nativos de data podem não centralizar bem com padding padrão, especialmente em Safari). Mesma mutation/campos de antes. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4031** — **MEDIÇÃO DE CONTRATOS: ÍCONE DECORATIVO NOS CAMPOS DE DATA SOBREPUNHA O ÍCONE NATIVO DO NAVEGADOR — REMOVIDO.** Usuário mandou print (IMG_3308) do diálogo "Novo Boletim de Medição" (redesenhado na Rev. 4030) com as datas "se sobrepondo"/"ficou péssimo". Causa: o ícone `CalendarRange` decorativo em `absolute` + `pl-8` (copiado do padrão do "Editar Boletim") colide com o affordance nativo do `<input type="date">`, já que o shadow-DOM interno do campo nem sempre respeita o padding customizado em todos navegadores/dispositivos. `MedicaoDetalhe.tsx`: removido o wrapper/ícone/padding dos 4 campos de data (`modalBoletim` E `modalEditBoletim`), voltando a inputs simples sem ícone sobreposto. Mesma mutation/validação/campos de antes. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4030** — **MEDIÇÃO DE CONTRATOS: REDESIGN DA TABELA "ITENS DO BOLETIM" + PADRONIZAÇÃO DO DIÁLOGO "NOVO BOLETIM DE MEDIÇÃO".** Tabela `table-fixed` + `<colgroup>` proporcional (elimina vão Item↔Descrição), badge azul "% Período", barra de progresso "% Acumulado"; diálogo `modalBoletim` reconstruído no padrão do "Editar Boletim" (3 blocos). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4029** — **MEDIÇÃO DE CONTRATOS: REDESIGN COMPLETO DO DIÁLOGO "EDITAR BOLETIM" (PERÍODO DA MEDIÇÃO).** Reestruturado em 3 blocos visuais (cabeçalho + card branco + rodapé fixo), inputs de data c/ ícone interno, badge "N dias de medição", validação data fim < início. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4028** — **MEDIÇÃO DE CONTRATOS: OLHINHO NA LISTA DE BOLETINS + REDESIGN MOBILE DO CABEÇALHO DO DIÁLOGO "ITENS DO BOLETIM" + ENCAMINHAR VIA WHATSAPP.** Ícone de olho na lista de boletins + cabeçalho reestruturado em 2 linhas (título isolado, botões numa linha própria com `flex-wrap`) + `compartilharBoletimMedicaoWhatsApp` (Web Share API nível 2 / fallback wa.me). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4027** — **MEDIÇÃO DE CONTRATOS: RASTREABILIDADE DO "ORIGEM: CRONOGRAMA" + BOTÕES DE FLUXO/IMPRESSÃO/PDF NO DIÁLOGO "ITENS DO BOLETIM".** Novo `getHistoricoAvancoAtividade` (anti-IDOR) mostra de qual semana do Avanço Semanal veio o % da medição via Popover; diálogo ganhou botões Aprovar/Enviar, Imprimir e Gerar PDF (`boletimMedicaoPdf.ts`, jsPDF). ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4026 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
