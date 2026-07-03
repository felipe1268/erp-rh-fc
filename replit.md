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

- **Rev. 3997** — **FOLHA DE PAGAMENTO: CAMPO "LÍQUIDO" GANHA EDIÇÃO INLINE (LÁPIS → INPUT → SALVAR/CANCELAR), IGUAL À FOLHA DE VALE.** Usuário pediu, "assim como na folha do vale, deixei o campo editável", que a coluna "Líquido" da tela PRINCIPAL de Folha de Pagamento ganhasse o mesmo padrão de edição manual (Master only) já usado na aba Vale. Nova mutation `payrollEngine.editarLiquidoFolha` (espelha `editarLiquidoVale`): força o líquido final do funcionário, zera o ajuste de arredondamento e limpa a linha 'folha' do ledger (senão o carry-forward do próximo evento corrompe); persiste em `payroll_payments` + `pagamentoResultJson` de `payroll_periods`, com guard de pagamento consolidado e badge "Editado" via `observacoes`. Frontend (`FolhaPagamento.tsx`) ganha estado `pgLiqEditId`/`pgLiqEditValor` + patch otimista local. ZERO DELETE · ZERO ALTER.

- **Rev. 3996** — **BANCO DE HORAS: ADICIONADO NAVEGADOR MENSAL (ESTILO FOLHA DE PAGAMENTO) NA ABA "SALDOS".** Usuário pediu para ver o Banco de Horas "por mês". `banco_horas_lancamentos` já espelha todo crédito/débito de `banco_horas_saldo`, então o histórico mensal é reconstruído somando lançamentos (sem snapshot novo). Dois endpoints novos em `horasExtras.ts`: `getSaldoBancoMensal` (saldo acumulado até o fim do mês + "Movimento no Mês" por funcionário) e `getResumoMensalBanco` (contagem por mês, colore os pills). Frontend (`BancoHoras.tsx`) ganha Card de navegação (ano + Jan–Dez, azul="com lançamento"/cinza="sem dados"), coluna "Movimento no Mês" na tabela, KPIs "Total em Banco"/"Funcionários com Saldo" refletindo o mês navegado; seleção em lote e "Debitar" desabilitados fora do mês corrente (débito só se aplica ao saldo vivo). ZERO DELETE · ZERO ALTER.

### 5 one-liners

- **Rev. 3995** — **VERIFICAÇÃO CRUZADA (FOLHA): CORRIGIDA COLUNA "LÍQUIDO ERP" QUE MOSTRAVA VALOR ~100x MAIOR DO QUE O REAL.** Causa: `verificacaoCruzada` lia `payroll_payments.salarioLiquido` (formato US "1394.00") com `parseBRL()` (assume BR), virando 139400; fix detecta formato pela vírgula antes de escolher o parser. ZERO DELETE · ZERO ALTER.

- **Rev. 3994** — **BENEFÍCIOS DE ALIMENTAÇÃO: CORRIGIDA A EDIÇÃO QUE REABRIA CONFIGURAÇÕES JÁ ENCERRADAS + TELA GANHA VISIBILIDADE/CONTROLE DE VIGÊNCIA.** UPDATE só altera `vigencia_fim` quando enviado explicitamente; tela ganha coluna "Vigência" (badges) e inputs de Início/Fim. ZERO DELETE · ZERO ALTER.

- **Rev. 3993** — **DISSÍDIO: HABILITADA EDIÇÃO MANUAL LINHA A LINHA DA DIFERENÇA SALARIAL RETROATIVA (BRUTO/INSS/IRRF).** Nova coluna `diferenca_override_json` em `dissidio_funcionarios` guarda override opcional que PREVALECE sobre o cálculo automático; mutations `sindical.editarDiferencaManual`/`removerEdicaoManualDiferenca` (admin_master only). ZERO DELETE · ZERO ALTER.

- **Rev. 3992** — **DISSÍDIO: HORAS EXTRAS REMOVIDAS DA BASE DA DIFERENÇA SALARIAL RETROATIVA — TODA HE É COMPENSADA VIA BANCO DE HORAS, NUNCA PAGA EM DINHEIRO.** Fórmula/INSS/IRRF marginal estavam corretos DADO que a base incluía HE, mas HE nunca é paga em dinheiro (vira banco de horas). Removida a soma de HE de `baseVerbas` + correção pontual das 58 linhas já persistidas. ZERO DELETE · ZERO ALTER.

- **Rev. 3991** — **DISSÍDIO: BOTÃO "CALCULAR/RECALCULAR DIFERENÇAS RETROATIVAS" FICAVA PERMANENTEMENTE SEM EFEITO — GUARD BLOQUEAVA O DISSÍDIO INTEIRO EM VEZ DE SÓ QUEM JÁ ESTAVA OK.** Guard passou a ser POR FUNCIONÁRIO — recalcula só quem está com valor zerado e não é `rescisao_complementar`. ZERO DELETE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3990 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
