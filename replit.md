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

- **Rev. 4613** — **FIX: CONTROLE DE DOCUMENTOS/DOSSIÊ — STATUS FIDEDIGNO + FILTRO "FALTA DOCUMENTO" + ZIP SÓ COM DOCS ATUAIS.** Revisões antigas de treinamento (já substituídas) pintavam funcionário em dia de ❌; agora painelDossie deduplica por tipo canônico (NR-18 == NR 18) e só a versão vigente conta no status/chip/lista. Servidor devolve `pendencias`/`emDia` e o painel ganhou pills "Todos / ❌ Falta documento / ✓ Em dia" + tags de pendência sob o nome. ZIP do dossiê inclui SÓ a versão atual de cada ASO (por tipo) e treinamento (por norma) — revisões antigas não vão pro cliente. Arquivos: `server/routers/controleDocumentos.ts`, `server/routers/downloadDossie.ts`, `client/src/pages/ControleDocumentos.tsx`. ZERO schema change.
- **Rev. 4612** — **UI: EMISSÃO DE CRACHÁS — FRENTE COM MODO COMPACTO (TUDO CABE NOS 540px, NADA CORTADO).** Com selos NR + faixa de restrição + 4-5 linhas de dados, a frente estourava o cartão (SETOR/ADMISSÃO cortados). Agora há 3 níveis proporcionais (normal/compact/denso — foto, logo, nome e selos encolhem juntos) e o bloco de linhas virou `flex-1 + justify-evenly`: impossível estourar em qualquer combinação. Fix vale também p/ o PNG baixado (mesmo DOM). Arquivo: `client/src/pages/terceiros/Crachas.tsx`. ZERO schema/server change.
### 5 one-liners

- **Rev. 4611** — **FIX: EMISSÃO DE CRACHÁS — CONTAGEM BATE COM COLABORADORES.** Crachá p/ todo NÃO-desligado via `EMPLOYEE_STATUS_DESLIGADOS` (some ao desligar); `badgeStatus` backend alinhado. Validado no Neon (CLT 107, PJ 14, terceiros 65). Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4610** — **UI: EMISSÃO DE CRACHÁS — LAYOUT "OPÇÃO 5" (NOVA ARTE ENVIADA PELO USUÁRIO).** `BadgePreview` refeito conforme a arte: frente branca com canto navy + faixa laranja, foto com borda navy, função laranja entre traços; verso com QR em cartão com sombra e rodapé navy em chevron. Detalhe em `shared/changelog.ts`. ZERO schema/server change.
- **Rev. 4609** — **FEAT: EMISSÃO DE CRACHÁS — TAG DE DOCUMENTAÇÃO + SELOS NR-35/NR-10 + FAIXA DE RESTRIÇÃO (LGPD-SAFE).** `badgeStatus` batch (regras do recalcAll + guarda anti-IDOR) alimenta tags/pills/selos NR e faixa de restrição genérica; rota pública devolve só booleano. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4608** — **UI: CONTROLE DE DOCUMENTOS — FOTO DOS FUNCIONÁRIOS NA LISTA DO DOSSIÊ.** Backend `painelDossie` passa a devolver `fotoUrl`; célula "Funcionário" do `DossiePanel` renderiza `<PersonPhoto size="sm">` (componente padrão do módulo, fallback de iniciais) ao lado do nome/CPF. Arquivos: `server/routers/controleDocumentos.ts`, `client/src/pages/ControleDocumentos.tsx`. ZERO schema change.
- **Rev. 4607** — **FIX: QR DO CRACHÁ — "VERIFICAR APTIDÃO" CALCULA AO VIVO + LISTA DE DOCUMENTOS (LGPD-SAFE).** `portalExterno.verificar.funcionario` deixa de ler snapshot defasada e calcula ao vivo de `asos`/`trainings`; página pública exibe cards ASO/Treinamentos sem dados sensíveis. Detalhe em `shared/changelog.ts`. ZERO schema change.
### Histórico completo

Ver `replit-history.md` para revisões Rev. 4606 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — POKA-YOKE EM TODA REVISÃO (25/07/2026):** Toda nova revisão/feature deve aplicar o princípio Poka-Yoke (à prova de erros): preferir SEMPRE o nível mais forte viável — (3) prevenção pelo design (máscara/select/campo que só aceita valor válido) > (2) bloqueio (validação que impede salvar dado inconsistente, ex.: data no passado, valor zero, duplicidade) > (1) aviso (alerta visual). Ao revisar um fluxo existente, identificar e propor Poka-Yokes faltantes na área tocada.

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
