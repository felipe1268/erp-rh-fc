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

- **Rev. 3991** — **DISSÍDIO: BOTÃO "CALCULAR/RECALCULAR DIFERENÇAS RETROATIVAS" FICAVA PERMANENTEMENTE SEM EFEITO — GUARD BLOQUEAVA O DISSÍDIO INTEIRO EM VEZ DE SÓ QUEM JÁ ESTAVA OK.** Usuário reportou que o botão não recalculava os valores. Causa-raiz: `sindical.recalcularDiferencas` tinha um guard que abortava para TODOS os funcionários do dissídio se QUALQUER UM já tivesse `valorRetroativo > 0` — como isso é o caso normal (maioria já vem calculada certa na aplicação), o botão ficava inútil na prática (sempre retornava erro "já foram calculadas", mesmo quando havia funcionário zerado precisando de recálculo). Fix: guard passou a ser POR FUNCIONÁRIO — recalcula só quem está com valor zerado e não é `rescisao_complementar` (tipo com lógica própria, preservado intacto); se ninguém precisa de recálculo, retorna sucesso informativo em vez de erro. ZERO DELETE · ZERO ALTER.

- **Rev. 3990** — **DISSÍDIO: CORRIGE INSS/IRRF DA DIFERENÇA SALARIAL RETROATIVA — DE "PROGRESSIVO DO ZERO SOBRE O VALOR ISOLADO" PARA "ALÍQUOTA MARGINAL".** Usuário conferiu manualmente o relatório "Diferenças Salariais Retroativas (Dissídio)" e achou o líquido errado (ANA BEATRIZ: bruto R$129,77 mostrando líquido R$120,04 com INSS na faixa de 7,5%, quando o salário dela realmente está na faixa de 9%). Causa-raiz: `calcularEncargosDiferenca` (`sindical.ts`) rodava `calcularINSSProgressivo`/`calcularIRRFProgressivo` diretamente sobre o valor ISOLADO da diferença, reiniciando as faixas do zero e aplicando sempre a alíquota mais baixa, em vez da MARGINAL (a que incide de fato sobre quem já ganha naquela faixa). Fix: agora computa `encargo(baseAntes+diferença) - encargo(baseAntes)`, usando `diferencaBreakdownJson.baseVerbas` (tipo 'folha', já gravado desde a Rev. 3278) ou a nova `baseReferencia` gravada na aplicação (tipo 'rescisao_complementar', com fallback pro cálculo antigo em linhas já aplicadas sem essa base) como referência de faixa. Correção é só de leitura/cálculo — sem migração de dados, já que o relatório calcula on-the-fly. Validado batendo exatamente com a conferência manual do usuário. ZERO DELETE · ZERO ALTER.

### 5 one-liners

- **Rev. 3989** — **FOLHA: TOGGLE "SOMAR DIFERENÇA DO DISSÍDIO" — INCLUI O RETROATIVO DO DISSÍDIO NO LÍQUIDO DA FOLHA DO MÊS DE PAGAMENTO (PERSISTIDO POR PERÍODO).** Nova coluna `somarDiferencaDissidio` em `payrollPeriods`; `simularPagamento` soma o líquido retroativo do dissídio quando o toggle está ON (persistido por período); frontend ganha switch dedicado + selo "+ R$ X dissídio" nas colunas de líquido. ZERO DELETE · ZERO ALTER (só ADD COLUMN).

- **Rev. 3988** — **FOLHA: "GERAR REMESSA CNAB" GANHA SELEÇÃO MÚLTIPLA — 1 ARQUIVO POR BANCO MARCADO.** Usuário pediu que, ao gerar remessa CNAB, o sistema gere 1 remessa PARA CADA BANCO selecionado. Frontend puro (`FolhaPagamento.tsx`, subview "Por Banco"): novo estado `contasRemessaSelecionadas`, checkbox em cada card (resumo + detalhe), barra de ação com "Selecionar todos" + "Gerar Remessas Selecionadas (N)". Nova função `gerarRemessasSelecionadas` chama `gerarRemessaCnab` sequencialmente (1 chamada por conta marcada, delay de 250ms entre downloads), reusando o endpoint existente sem tocar o backend — cada banco continua gerando seu próprio arquivo .rem (nunca combinado). Botão individual por card mantido. ZERO DELETE · ZERO ALTER.

- **Rev. 3987** — **FOLHA: COLUNA "FALTAS" NÃO MISTURA MAIS VR/VT — VR SAI DA FOLHA (SÓ NO VALE ALIMENTAÇÃO), VT DE FALTA VAI PRA COLUNA VT.** Regra confirmada: empresa TEM direito de descontar VR/VT em falta, mas só VT entra na Folha — VR/VA fica só no módulo Vale Alimentação. Backend (`payrollEngine.ts`) e frontend (`FolhaPagamento.tsx`) ajustados espelhando a mesma fórmula. ZERO DELETE · ZERO ALTER.

- **Rev. 3986** — **FOLHA: "VERIFICAÇÃO CRUZADA" PASSA A COMPARAR SÓ COLABORADOR + LÍQUIDO — RESTO FICA NO "COMPARATIVO FOLHA × ERP".** Removidos alertas sobrepostos de Salário/Função/status; mantido só "não vinculado ao cadastro" + novo alerta "Líquido divergente" (tolerância R$1). ZERO DELETE · ZERO ALTER.

- **Rev. 3985** — **BENEFÍCIOS DE ALIMENTAÇÃO: VIGÊNCIA EXPLÍCITA (INÍCIO/FIM) — REAJUSTE DE DISSÍDIO NUNCA MAIS SOBRESCREVE O HISTÓRICO.** `meal_benefit_configs` ganhou vigência com fallback em 3 níveis; reajuste de dissídio agora ENCERRA a config vigente e INSERE nova versão, preservando histórico retroativo. ZERO DELETE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3984 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
