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

- **Rev. 4563** — **FEAT: EQUIPAMENTOS — REGIME DE USO (ROTATIVO × FIXO/INSTALADO EM OBRA).** Equipamentos de uso contínuo (guincho, andaime fachadeiro, painel…) não contam mais como ociosos. Coluna `regime_uso` (default 'rotativo') em equipamentos_proprios/locados + ColFix 4563; mutations aceitam regimeUso + nova `regimeUsoAtualizarLote` (triagem em lote, tenant guard); locadosUtilizacao/propriosUtilizacao excluem fixos da ociosidade, retornam lista `instalados` (seção indigo com "voltar p/ rotativo") e contam fixos como EM USO na utilização média; botão "Marcar fixos" abre modal de triagem com sugestões por keyword (sugereFixo) pré-marcadas — nada salva sem confirmação; seletor "Regime de uso" no cadastro/edição de Próprios e Locados. Arquivos: `drizzle/schema.ts`, `server/_core/index.ts`, `equipamentos.ts`, `LocadosUtilizacao.tsx`, `PropriosUtilizacao.tsx`, `Proprios.tsx`, `Locados.tsx`.
- **Rev. 4562** — **QUALIDADE: POKA-YOKE EM 10 PONTOS DO ERP.** Primeira aplicação em lote da nova Regra de Ouro: (1-2) `financial.ts` registrarBaixa valor>0 + bloqueio de data futura, createRevenue valorMedicao>0/retenções≥0; (3/9) `FinanceiroReceitas.tsx` máscara R$ pt-BR em todos os campos + checkbox de confirmação p/ cancelar receita; (4) coerência de datas em `AvisoPrevio.tsx` (aviso ≥ admissão) e `portal/PortalDashboard.tsx` (admissão não-futura, validades ASO/NRs ≥ admissão); (6) `almoxarifado/index.tsx` entrada/saída exigem qtd>0; (7) `equipamentos.ts` proprioCriar bloqueia dataAquisicao futura + valor negativo; (8) `Solicitacoes.tsx` confirmação em Cancelar SC/Excluir; (10) `fiscalNotes.ts` guard de NF duplicada (empresa+número+série, ignora canceladas). Item 5 (duplo clique) já estava coberto por isPending. ZERO schema change.
### 5 one-liners

- **Rev. 4561** — **UX: CONTAS A PAGAR — REDESIGN LÚDICO DO MODAL "DETALHE DO TÍTULO".** Só apresentação: hero gradiente por status, tabs em pills, cartões temáticos (DetSection), histórico em timeline. Arquivo: `FinanceiroContasAPagar.tsx`. ZERO schema/server change.
- **Rev. 4560** — **FIX: RENOVAÇÃO DE LOCAÇÃO — PARCELA VENCIA NA DATA ERRADA (SUMIA DO CONTAS A PAGAR) + MÁSCARA R$.** `locadoRenovar` usava `inicioISO` como vencimento → entry no passado sumia da tela; fix `dataBase = novaDataFim` + reparo OC-919/920 no Neon + máscara pt-BR no valor. Arquivos: `equipamentos.ts`, `almoxarifado/index.tsx`. ZERO schema change.
- **Rev. 4559** — **FIX/UX: ALMOXARIFADO — RENOVAÇÃO USA O FLUXO REAL (COMPRAS → FINANCEIRO) + HEADER 2 LINHAS + NÚMEROS pt-BR + PLURAL.** Substituído o modal legado (só mudava data via `compras.atualizarItem`) pelos 2 pontos de entrada chamando `equipamentos.locadoRenovar` com passo-a-passo explicativo; header 2 linhas, plural e milhar pt-BR. Arquivo: `almoxarifado/index.tsx`. ZERO schema change.
- **Rev. 4558** — **FEAT: EQUIPAMENTOS LOCADOS — RENOVAÇÃO REAL (NOVA OC NO COMPRAS) + BADGE DE CICLO + REDESIGN DO ALERTA.** `equipamentos.locadoRenovar` gera OC de locação auto-aprovada encadeada (Compras → Contas a Pagar), atualiza vencimento/valor, grava evento RENOVACAO e sincroniza o almoxarifado; badges de ciclo/urgência + "Renovar" em Locados e no alerta global. Arquivos: `equipamentos.ts`, `compras.ts`, `Locados.tsx`, `AlertaLocacoesVencendo.tsx`. ZERO schema change.
- **Rev. 4557** — **FEAT: AVISO PRÉVIO — FLUXO RH → FINANCEIRO (ENVIAR AO CONTAS A PAGAR + BAIXA AUTOMÁTICA).** `enviarParaFinanceiro` lança rescisão no Contas a Pagar (venc. dataFim+10d, art. 477 CLT); quitar a baixa conclui o aviso e desliga o funcionário automaticamente. Arquivos: `avisoPrevioFerias.ts`, `financial.ts`, `AvisoPrevio.tsx`, `drizzle/schema.ts`.
### Histórico completo

Ver `replit-history.md` para revisões Rev. 4551 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — POKA-YOKE EM TODA REVISÃO (25/07/2026):** Toda nova revisão/feature deve aplicar o princípio Poka-Yoke (à prova de erros): preferir SEMPRE o nível mais forte viável — (3) prevenção pelo design (máscara/select/campo que só aceita valor válido) > (2) bloqueio (validação que impede salvar dado inconsistente, ex.: data no passado, valor zero, duplicidade) > (1) aviso (alerta visual). Ao revisar um fluxo existente, identificar e propor Poka-Yokes faltantes na área tocada.

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
