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

- **Rev. 4071** — **CONTAS A PAGAR CONSOLIDADO: JANELA DE FECHAMENTO ERA CALCULADA PELO VENCIMENTO INDIVIDUAL DA OC, NÃO PELA DATA DA COMPRA — FRAGMENTAVA O AGRUPAMENTO.** Usuário reportou (com prints) Ferragens Santa Rita agrupando só 2 de dezenas de OCs pendentes, e Madeireira Andorra nunca agrupando. Causa raiz dupla: (1) `_agruparContasPagarPorCicloForn` calculava a janela via `dataVencimento`, que varia OC a OC (prazo próprio de cada compra), em vez de `dataCompetencia` (data estável de quando a OC foi lançada no financeiro) — jogava compras do MESMO ciclo em janelas diferentes; (2) Madeireira Andorra não tem ciclo configurado em nenhum lugar do banco (`empresas_terceiras` só tem 1 linha com ciclo preenchido — Ferragens Santa Rita), não é bug de leitura, falta salvar o cadastro dela. Fix: `_agruparContasPagarPorCicloForn` (`server/routers/financial.ts`) passou a usar `dataCompetencia ?? dataVencimento` pra bucketizar a janela. ZERO DELETE · ZERO ALTER destrutivo (3 linhas na leitura).

- **Rev. 4070** — **CONTAS A PAGAR: CONSOLIDAÇÃO DE TÍTULOS POR CICLO DE FECHAMENTO DO FORNECEDOR (CADASTRO) + PAGAMENTO ÚNICO QUE AUTO-DIVIDE EM N CHEQUES E LANÇA NO CONTROLE DE CHEQUES.** Fornecedores com ciclo configurado no cadastro (ex.: Ferragens Santa Rita — cheque em até 5x/30d, fechamento quinzenal) geravam dezenas de títulos separados (1 por OC/obra). Fix: novo `_agruparContasPagarPorCicloForn` (`server/routers/financial.ts`) consolida títulos não pagos do mesmo fornecedor dentro da mesma janela de fechamento numa linha expansível; `getContasAPagarByYear` carrega o mapa de ciclo (`empresas_terceiras.ciclo_*`) e aplica o agrupamento — match exato ou por substring do nome cadastrado (o `fornecedor_nome` de OC vem como descrição completa, não só o nome do fornecedor). Nova mutation `pagarConsolidadoFornecedor` dá baixa em todos os títulos do grupo e, se a forma for cheque, já lança N cheques em `financial_cheques` pra Conciliação Bancária. Novo `PagarConsolidadoDialog.tsx` pré-preenche as parcelas a partir do cadastro; `FinanceiroContasAPagar.tsx` ganhou linha "fechamento" (roxa) com botão "Pagar consolidado". ZERO DELETE · ZERO ALTER destrutivo (100% aditivo).

### 5 one-liners

- **Rev. 4069** — **CONTAS A PAGAR: FILTRO DE MÊS ERA IGNORADO DURANTE A BUSCA + FALTAVA OPÇÃO "ANO TODO".** Usuário selecionou Julho e pesquisou um fornecedor — a lista trouxe títulos de todos os meses. Causa: Rev. 3999 fazia a busca por texto ignorar deliberadamente o mês selecionado (`list = search ? allContas : mesData`). Fix: novo toggle "Ano todo (AAAA)" explícito ao lado dos meses (desliga ao clicar num mês); novo `escopoData` (mês OU ano todo) do qual TUDO deriva (busca, KPIs, contagens, origens, seleção em lote) — o mês agora sempre restringe a lista, inclusive com busca ativa. ZERO DELETE · ZERO ALTER destrutivo (100% client-side).

- **Rev. 4068** — **CONCILIAÇÃO BANCÁRIA NÃO BAIXAVA O CHEQUE NO CONTROLE DE CHEQUES + MOTIVO/CONTA TENTATIVA DE DEVOLUÇÃO AGORA FICAM REGISTRADOS.** `conciliarLancamento` nunca tocava `financial_cheques`; novas colunas de motivo/conta tentativa + baixa automática do cheque ao conciliar (match por Nº normalizado + valor). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4067** — **RH: FUNCIONÁRIOS DUPLICADOS ENTRE EMPRESAS DO MESMO GRUPO (Efetivo por Obra).** 12 funcionários reais da FC Engenharia recadastrados do zero em empresa do mesmo grupo em vez de reaproveitar cadastro compartilhado; soft-deletados + nova `checkDuplicateCpfCrossCompanyGroup` bloqueia recorrência. ZERO DELETE definitivo · ZERO ALTER destrutivo.

- **Rev. 4066** — **CONCILIAÇÃO BANCÁRIA: CAMPO CATEGORIA NÃO MOSTRAVA CONTAS DO PLANO DE CONTAS.** Usuário cadastrou "Licenças e Assinaturas de Software" (código 4.6) no Plano de Contas, mas ao pesquisar na tela de Conciliação Bancária (dialog "Lançar no Contas a Pagar") ela não aparecia. Causa: `FinanceiroConciliacao.tsx` buscava `financial.getAccounts` com `escopo: "categoria"`, que no backend filtra só contas `AUTO-*` (Categorias operacionais), excluindo o Plano de Contas — diferente de Contas a Pagar/Lançamentos, que já buscam sem escopo (Plano + Categorias). Fix: removido o filtro de escopo da query de listagem; mantido só na criação inline de categoria rápida ("+ Nova categoria"). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4065** — **NOTIFICAÇÕES DE CONTABILIDADE: BOTÕES E PERMISSÕES PADRONIZADOS COMO NO MÓDULO DE RH.** Cards de resumo, badges por categoria, botões ToggleRight/ToggleLeft + Settings + Trash2; permissão evoluiu de 1 flag pra 3 (`ativo`/`recebeFiscal`/`recebeContabil`); migração de dados legados sem perda. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4063 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
