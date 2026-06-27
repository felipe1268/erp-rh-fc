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

- **Rev. 3764** — **FINANCEIRO · DASHBOARD · CONTROLE DE CHEQUES · GANHOU O FILTRO "MÊS A MÊS": SELETOR WHITE-CARD "PERÍODO" (CHIP "TUDO" + JAN…DEZ, DOT VERDE = COM DADOS / CINZA = SEM DADOS), IGUAL AO DA CONCILIAÇÃO BANCÁRIA (Rev. 3755). SELECIONAR UM MÊS REESCOPA KPIs, CONFERÊNCIA CONTRA O EXTRATO, DEVOLVIDOS E TODOS OS RANKINGS/CARDS DE STATUS; OS GRÁFICOS MENSAIS (VALOR POR MÊS, EVOLUÇÃO DE STATUS, COMPARATIVO ANUAL) SEGUEM YEAR-WIDE POR DESIGN. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido do usuário (tela "Dashboard · Controle de Cheques"): replicar o seletor mês-a-mês que já existe na Conciliação Bancária. Frontend (`client/src/pages/financeiro/dashboards/DashCheques.tsx`), espelhando `DashConciliacao.tsx`: novo estado `mes` (0=ano) + `pad2`/`dataInicio`/`dataFim`/`periodoLabel`; `cheques.resumo` e `cheques.verificarExtratoResumo` (que já aceitavam `mes`) passam `mes||undefined` → KPIs/conferência EXATOS via backend (sem depender do limite de 2000 da lista); `getConciliacaoReportGeral` (devolvidos) usa a janela `dataInicio/dataFim`. A lista `cheques.listar` segue puxando o ANO INTEIRO (`chequesAno`) p/ os gráficos mensais + a régua "com dados"; `const cheques` (useMemo) filtra `chequesAno` pelo mês p/ status/rankings/recorrentes. Gráficos year-wide (`serieAtual`/`statusKeys`/`evolStatus`) e seus drill-downs leem `chequesAno`. UI white-card "PERÍODO" (`grid-cols-7 sm:grid-cols-13`, chip violet) logo após o `<DashHeader/>`; subtítulos/empty-states e os KPIs "no ano→no mês" usam `periodoLabel`. `tsc` limpo (filtrado); HTTP 200. Detalhe: `shared/changelog.ts`.

- **Rev. 3763** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · CHEQUES DEVOLVIDOS QUE JÁ TIVERAM AS 2 LINHAS (COMPENSAÇÃO + DEVOLUÇÃO) CONCILIADAS VOLTAM A APARECER NO CARD "CHEQUES DEVOLVIDOS NO BANCO" — MARCADOS COMO "CONCILIADO NO EXTRATO" (RESOLVIDO). ANTES SUMIAM POR COMPLETO, FAZENDO O USUÁRIO PERDER O HISTÓRICO DE QUE O CHEQUE FOI DEVOLVIDO. BACKEND READ-ONLY · NÃO ALTERA O CÁLCULO DO % · ZERO SCHEMA/ALTER/DROP/DELETE.** Pedido do usuário (tela "Conciliação Bancária"): o cheque Doc 939 (R$ 4.227,50, devolvido 26/01, substituído pelo PIX da Vânia) não aparecia na lista porque a detecção do par "compensou + devolveu" só olhava linhas PENDENTES; conciliadas as 2 linhas, o par some. Aprovado o "meio-termo": continuar mostrando, mas com selo de RESOLVIDO. Backend (`server/routers/financial.ts`): novo passo 2e roda `detectarParesEstorno` TAMBÉM sobre as linhas conciliadas (`concRes`); cada par vira entrada de `chequesDevolvidos` com `resolucao.tipo="conciliado"` + `jaConciliado=true` (`grupoId="devc-N"`), motivo/fornecedor/obra/NF resolvidos como nas pendentes, `desconsiderado=false`; NÃO mexe no %. Front (`FinanceiroConciliacao.tsx`): `isDevolvidoResolvido` trata "conciliado"/`jaConciliado` como resolvido (botão "Ocultar resolvidos" os esconde + contagem correta); novo selo "Já tratado: ... conciliadas no extrato"; bloco de Desconsiderar/% trocado por badge "Conciliado no extrato". `tsc` limpo; HTTP 200; verificação no Neon REAL (60002, jan-fev/26) achou 4 pares conciliados, incl. o Doc 939. Detalhe: `shared/changelog.ts`.

- **Rev. 3762** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · O CARD "CHEQUES DEVOLVIDOS NO BANCO" GANHOU O BOTÃO "OCULTAR RESOLVIDOS": ESCONDE DA TELA OS CHEQUES JÁ TRATADOS (QUITADO REAPRESENTADO / QUITADO POR OUTRO MEIO PIX-TED / QUITADO POR SUBSTITUIÇÃO / DESCONSIDERADO DO %), MOSTRANDO SÓ OS PENDENTES. NÃO APAGA NADA, NÃO MUDA O CONTADOR DO CARD NEM O CÁLCULO DO %. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido do usuário (tela "Conciliação Bancária"): o card de cheques devolvidos é uma lista de conferência — resolver um cheque troca o selo mas não o remove (design "nada some sem confirmação"), e o usuário pediu "uma lista mais limpa, só os que faltam resolver". Implementado 100% client-side: estado `ocultarDevolResolvidos`; helper `isDevolvidoResolvido(d)` que ESPELHA os selos da linha (`resolucao.tipo`∈{reapresentado,pix}, `d.desconsiderado`, ou cobertura por `vincMap` quita o valor); `repDevolView` filtra a lista e o `.map` passou a usá-la. Header mantém o contador TOTAL + subtítulo "N pendentes · M resolvidos"; botão "Ocultar resolvidos"/"Mostrar todos" (Eye/EyeOff, só aparece com ≥1 resolvido, tooltip explicando que não apaga nem muda cálculo) + empty-state com atalho "Mostrar todos". PDF segue listando tudo. `tsc` limpo (filtrado); HTTP 200. Arquivos: `client/src/pages/financeiro/FinanceiroConciliacao.tsx`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3761** — **FINANCEIRO · DRE — DEMONSTRATIVO DE RESULTADO · CADA LINHA DO DRE FICOU CLICÁVEL (DRILL-DOWN): AO CLICAR ABRE UM DIÁLOGO COM OS VALORES QUE COMPÕEM A LINHA (LINHAS-FOLHA = LANÇAMENTOS REAIS POR CATEGORIA + LISTA; LINHAS-TOTAL = FÓRMULA; MARGENS = DIVISÃO). BACKEND READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3760** — **DASHBOARD · CONCILIAÇÃO BANCÁRIA · OS VALORES EM DINHEIRO QUE O USUÁRIO LÊ (RANKINGS, KPIs "TICKET MÉDIO/MAIOR ENTRADA/MAIOR SAÍDA" E O DETALHE D/R DO RANKING DE OBRAS) PASSAM A APARECER POR EXTENSO COM PONTO DE MILHAR E VÍRGULA DECIMAL (`formatBRL` → "R$ 928.000,00") EM VEZ DE ABREVIADO ("R$ 928 mil"/"R$ 2,4 mi"); E OS GRÁFICOS FICAM RESPONSIVOS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3759** — **FINANCEIRO · FLUXO DE CAIXA · A LINHA "ENTRADAS (RECEITAS)" PASSA A REFLETIR O DINHEIRO REAL DE CONTAS A RECEBER (`financial_entries` tipo='receita'), EXATAMENTE COMO AS DESPESAS REFLETEM CONTAS A PAGAR, P/ O CAIXA FECHAR COM O EXTRATO. ANTES VINHA DA MATRIZ DE PREVISÃO DE FATURAMENTO (~R$ 200 MIL DE FORECAST) EM VEZ DOS ~R$ 2,59 MI EFETIVAMENTE A RECEBER. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3758** — **DASHBOARD · CONCILIAÇÃO BANCÁRIA · BUGFIX: A CONTA "CAIXA INTERNO - ADM" (LANÇAMENTOS MANUAIS, SEM EXTRATO) APARECIA NO GRÁFICO "POR CONTA BANCÁRIA — CONCILIADO × PENDENTE" COM BARRA VAZIA (R$ 0,00) MESMO TENDO 31 LANÇAMENTOS CONFIRMADOS. CAUSA: A QUERY `resCi` SÓ COMPUTAVA COUNT E HARDCODAVA R$ EM 0; AGORA CALCULA OS VALORES NO SQL ESPELHANDO `getEntradasCaixaInterno`. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3757** — **DASHBOARD · CONCILIAÇÃO BANCÁRIA · BUGFIX CRÍTICO: TODOS OS CARDS DE ANÁLISE ESTAVAM VAZIOS ("NENHUMA RECEITA/DESPESA CATEGORIZADA", "NENHUM FORNECEDOR IDENTIFICADO", "NENHUM LANÇAMENTO COM OBRA IDENTIFICADA") MESMO COM DADOS REAIS (R$ 2,24 MI EM RECEITAS, 12.894 DESPESAS, 123 CATEGORIAS). CAUSA: A QUERY #4 (TOP OBRAS) DO `getConciliacaoDashExtra` USAVA `ORDER BY (despesas+receitas)` COM ALIASES DE SAÍDA DENTRO DE EXPRESSÃO (POSTGRES SÓ ACEITA ALIAS SOZINHO) → `column "despesas" does not exist`; SEM try/catch POR QUERY, O THROW ABORTAVA O ENDPOINT INTEIRO → `extra` UNDEFINED → CARDS VAZIOS. FIX: SUBQUERY `(...) t` + ORDER BY NA QUERY EXTERNA. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3745 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
