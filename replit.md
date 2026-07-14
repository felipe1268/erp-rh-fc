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

- **Rev. 4256** — **CONTROLE DE CHEQUES: FILTRO POR DATA DE VENCIMENTO + FORNECEDOR + SOMATÓRIO.** Novos filtros client-side em `FinanceiroCheques.tsx`: (1) campo De/Até por `dataVencimento`; (2) dropdown de fornecedor derivado dos cheques carregados. Banner azul aparece quando filtro de data está ativo mostrando Total Geral + Pendentes (quantidade e valor) com link "limpar". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4255** — **TOGGLE PAUSAR/REATIVAR ITEM NO MAPA DE COTAÇÃO.** Item pausado fica visível no mapa com opacidade reduzida (cinza) sem ser apagado. Botão Pause/Play no hover da linha (âmbar quando pausado). Schema: `+pausado BOOLEAN DEFAULT false` em `compras_cotacoes_itens` via SyncSchema+. Backend: `togglePausarItemCotacao` mutation com guards. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4237** — **RESULTADO FINANCEIRO: WATERFALL CORRETO (BRUTO → LÍQUIDO).** Fórmula: Receita − Custo Direto = Lucro Bruto → (−) Impostos → (−) Overhead → = Lucro Líquido. Linha 1 sempre visível (Lucro Bruto); Linha 2 condicional quando deduções configuradas. Sem deduções: Lucro Bruto em verde com CTA. PainelOrcamento: "Lucro Médio Mensal" renomeado para "Result. Bruto Mensal". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4235** — **SCORECARD SST: CUSTO PROPORCIONAL PARA ATESTADOS EM HORAS.** Atestados com `horas_afastamento>0` e `diasAfastamento=0` agora calculam custo: `(salário×1,33 + benef) ÷ dias_mês ÷ 8h × horas`. Backend: `custo_horas` adicionado ao Q12. Frontend: badge teal "Xh" + label "proporcional" na coluna Dias; custo em teal com "Xh × valor/h" na coluna Total. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4234** — **SCORECARD SST: LIGHTBOX DE FOTO + TOOLTIP "—" SEM DIAS.** Clicar na foto/avatar na tabela de atestados abre Dialog lightbox com foto ampliada (ou iniciais 7xl em fundo âmbar se sem foto). Coluna "Dias" com "—" ganha tooltip "Atestado em horas — dias não informados no registro". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4233** — **SCORECARD SST: REGRA INSS 15 DIAS — CUSTO ATESTADOS PELA LEI 8.213/91.** Art. 59 da Lei 8.213/91: dias 1-15 = empresa; do 16º dia = INSS (auxílio-doença). Carlos Alberto (90d, CID K40) exibia R$ 8.452,36 → custo correto empresa = apenas 15 dias. Backend Q12: `dias_empresa = LEAST(dias,15)`, `dias_inss = GREATEST(dias-15,0)`, todas as 4 fórmulas de custo (custo_salario/encargos/vr/total) usam `LEAST`. Q13: `custo_ates` idem; `dias_ates` permanece total real (para gráficos). Frontend: badge "INSS" azul, split "Xd emp. / Yd INSS" na coluna Dias, fundo azul suave, label "só empresa" no custo, nota da Lei 8.213/91 na legenda. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4232** — **NORMALIZAÇÃO 100% DO BANCO — COLUNAS MONETÁRIAS VARCHAR EN→BR.** Auditoria completa: 8 tabelas, 17 colunas com valores em formato EN (`"2301.73"`) convertidas para BR (`"2.301,73"`). Corrigidos: `employees` (salarioBase 102, valorHora 97, valorComplemento 2), `employee_contracts` (1), `dissidio_funcionarios` (salarioAnterior/Novo/valorRetroativo — 97 cada, 100% EN), `termination_notices` (salarioBase 85, valorEstimadoTotal 84), `vacation_periods` (valorFerias/valorTotal/valorTercoConstitucional 96 cada, valorAbono 12), `payroll_payments` (salarioBrutoMes/totalProventos/totalDescontos/salarioLiquido 512 cada + 11 colunas desconto). Fórmula: `translate(to_char(val::numeric,'FM999G999G990.00'),'.,',',.') ` validada no Neon C.UTF-8. Parsers Q12/Q13 revertidos para smart CASE (robusto pós-normalização). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4231** — **SCORECARD SST: FIX CUSTO ATESTADOS — PARSER MISTO salarioBase + salarioBrutoMes.** `payroll_payments.salarioBrutoMes` usa decimal inglês (`"2650.32"`); double REPLACE removia o ponto decimal → R$ 265.032 em vez de R$ 2.650 (100× errado). `employees.salarioBase` tem formato misto (279 BR / 102 EN); EN sem vírgula quebrava igual. Fix: payroll → `REPLACE(NULLIF(TRIM(val),''),',','.')::numeric`; salarioBase → CASE WHEN LIKE '%,%'. Custo corrigido: R$ 667.266 → ~R$ 31.254. 6 ocorrências em Q12+Q13. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4230** — **SMO: FIX SALÁRIO DE REFERÊNCIA — MEDIANA COM FILTRO DE OUTLIERS.** `salarioRef` era MÉDIA (vulnerável a 1 funcionário com salário errado no cadastro → R$ 270.786 p/ pedreiro). Fix: `calcSalarioMediana()` — mediana + filtra valores >5× mediana bruta. 4 ocorrências corrigidas em smo.ts. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4229** — **SCORECARD SST: NOVA FÓRMULA CUSTO ATESTADOS — CUSTO REAL MENSAL.** `(salário_bruto×1,33 + VA/VR_mensal) ÷ dias_do_mês × dias_afastados`. Q12: 2 LATERAL JOINs em payroll_payments + vr_benefits. Q13 ates CTE: subconsultas correlacionadas. Frontend: labels atualizados. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4228** — **SCORECARD SST: FOTO DE CADASTRO EM ACIDENTES, ADVERTÊNCIAS E TOP 5 EPI.** Backend: Q4/Q5/Q6/Q8 passam a retornar `foto_url` (CLT via `fotoUrl`, terceiros via `ft.foto_url`). Frontend: avatar circular com foto real (ou iniciais coloridas como fallback) adicionado aos cards de Acidentes e rows de Advertências. Top 5 EPI já tinha código mas dependia do Q6 retornar a foto. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4227** — **SCORECARD SST: FIX BOLINHAS + GRÁFICOS HISTÓRICO — salarioBase com ponto de milhar.** Causa raiz real: `"2.774,20"` após REPLACE(',','.') vira `"2.774.20"` (dois pontos) → crash silencioso. Fix: REPLACE duplo — remover ponto de milhar ANTES de converter vírgula decimal. Q12 (4 ocorrências) + Q13 ates CTE (1 ocorrência). Validado direto no Neon: Q13 retorna 12 linhas com dds/atestados/epi por mês. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4254** — **MAPA COTAÇÃO PACOTE: COLUNAS SEPARADAS MAT | MDO | TOTAL GERAL.** Header linha 2 (pacote): QTD | Material | Mão de Obra | Total Geral (4 th). Sub-header fornecedor: `colSpan=5`, 5 flex divs. Linhas fornecedor: QTD, MAT (azul), MDO (laranja), Total Geral, Saldo. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4253** — **MAT/MDO EXATO NA PIPELINE COTAÇÃO → CONTRATO → MEDIÇÃO.** Schema: +`total_mat`/`total_mdo` em `compras_cotacao_respostas`; +`vlr_mat`/`vlr_mdo` em `terceiro_contrato_itens`; +4 colunas MAT/MDO em `terceiro_medicao_itens`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4252** — **FIX: VALOR NEGOCIADO EXATO — SEM QUEBRADOS POR ARREDONDAMENTO.** `editTotaisOverride` preserva `novoTotal` exato; backend usa `totalOverride` quando presente. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4251** — **ESPELHAMENTO AUTOMÁTICO DE ITENS DA COTAÇÃO NA SC VINCULADA.** SC vinculada à cotação recebe item espelhado automaticamente ao adicionar avulso/EAP; rastreabilidade bidirecional via `solicitacaoItemId`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4249** — **FIX: EXCLUSÃO EM LOTE NÃO APAGAVA GRUPOS PACOTE.** Ao deletar linha de grupo pacote, só o `first.id` era enviado; demais irmãos (mesmo `composicaoCodigo`) sobreviviam. Fix: expandir IDs via `mapa.itens` brutos antes de chamar a mutation. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4205 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
