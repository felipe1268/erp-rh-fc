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

- **Rev. 4544** — **FIX: AUTORIZAÇÃO ADMIN (COMPRAS) — E-MAIL EM MAIÚSCULAS NÃO ENCONTRAVA O USUÁRIO.** Admin Master não conseguia autorizar "Compra sem Verba": iPad capitaliza o campo e-mail e o lookup `eq(users.email, adminEmail)` era case-sensitive. Fix: os 5 pontos de autorização por e-mail+senha em `compras.ts` (autorizarCompraSemVerba, aprovação extra-orçamento, ajustar/adicionar/remover item FD) agora comparam `lower(email) = input.trim().toLowerCase()`. ZERO schema change.
- **Rev. 4543** — **FIX: IMPORT DIXI — CÓDIGOS "jfcNNN" COLIDIAM E FUNDIAM BATIDAS DE 2 FUNCIONÁRIOS.** Relógio configurado com código interno no campo Nome ("jfc063"/"jfc066"): a chave de agrupamento de `processRecords` usava `normalizeNameForMatch` (remove dígitos) → ambos viravam "JFC", batidas dos dois funcionários fundidas num grupo só atribuído ao primeiro (Antonio Wagner JFC063 ficou zerado; Marco JFC066 herdou tudo com horários quebrados). Fix: nova `normalizeGroupKey` (preserva dígitos) no agrupamento, no lookup de não-identificados e na comparação de memoryMappings. Correção de dados = reimportar o mesmo .xls (replace_all regrava fonte='dixi'; manuais/travados preservados). Arquivo: `fechamentoPonto.ts`. ZERO schema change.
### 5 one-liners

- **Rev. 4542** — **FEAT: COMUNICADOS INTERNOS — PDF P/ WHATSAPP + LINK PÚBLICO DE CIÊNCIA.** PDF via Puppeteer (`/api/comunicado-pdf/:id`) + link público `/ciencia/:token` (CPF+nascimento → registra visualização → "Li e estou ciente" = assinatura eletrônica simples Lei 14.063 com IP/UA). Schema: leitura_token, tipo/user_agent, tabela comunicado_leituras. Arquivos: `comunicadosCiencia.ts`, `comunicadoPdf.ts`, `ComunicadoCiencia.tsx`, `ComunicadosInternos.tsx`, `main.tsx`.
- **Rev. 4541** — **FIX: ALMOXARIFADO — EMPRÉSTIMO/DEVOLUÇÃO SÓ NAS OBRAS HABILITADAS.** Correção de escopo da Rev. 4539: visibilidade global vale só pro ESTOQUE; empréstimo/devolução opera SOMENTE obras habilitadas; guards em `listOpenLoans`/`registerLoan`/`returnLoanById` (`warehouse.ts`). ZERO schema change.
- **Rev. 4540** — **UX: COMUNICADOS INTERNOS — SEM "PREZADO(A) COLABORADOR(A)" AUTOMÁTICO.** Template vigente (FC-RH-003) prefixava saudação/sufixo automáticos; agora exibe só o que foi digitado + declaração de ciência. Seed em `shared/documentTemplates.ts` + UPDATE cirúrgico no Neon (personalizados intactos). ZERO schema change.
- **Rev. 4539** — **FEAT: ALMOXARIFADO — VISIBILIDADE GLOBAL ("ver tudo, mexer só no seu").** Leitura global de itens/giro/equipamentos em todas as obras da empresa; operação segue restrita (guards `_assertCompanyAccess` + `_assertObraWriteAlmox`); `listForAlmoxarifado` com flag `podeEditar`; UI "👁 Somente leitura". Escopo de empréstimo/devolução corrigido na Rev. 4541. ZERO schema change.
- **Rev. 4538** — **UX: NOTAS FISCAIS (RECEBIDAS) — BANNER LIMPO NO MODO DIÁRIO.** Quando `sync_modo='diario'`, o banner de countdown ("Próxima sync em 1h46…" + anel + Prorrogar +2h/+4h/+8h/+24h) é substituído por card indigo: ícone-relógio HH:MM, "Sincronização automática diária — consulta a SEFAZ 1x por dia às HH:MM, próxima: hoje/amanhã", última sync e APENAS Pausar/Retomar. Rodapé da tabela mostra o horário dinâmico. Modo 'intervalo' intacto. Arquivo: `FinanceiroNotasFiscais.tsx`. ZERO schema change.
### Histórico completo

Ver `replit-history.md` para revisões Rev. 4537 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
