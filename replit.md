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

- **Rev. 3995** — **VERIFICAÇÃO CRUZADA (FOLHA): CORRIGIDA COLUNA "LÍQUIDO ERP" QUE MOSTRAVA VALOR ~100x MAIOR DO QUE O REAL.** Usuário reportou alerta de "Líquido divergente" em praticamente todos os colaboradores (ex.: Folha R$1.613,00 ≠ ERP R$139.400,00). Causa: `verificacaoCruzada` (`folhaPagamento.ts`) lê `payroll_payments.salarioLiquido`, gravado pelo motor de folha via `formatMoney()` = `val.toFixed(2)` (formato US "1394.00", sem separador de milhar); a função local `parseBRL()` do arquivo assume sempre formato BR ("1.394,00") e remove o ponto como se fosse milhar, transformando "1394.00" em 139400. Fix: no ponto de leitura desse campo específico, detecta o formato pela presença de vírgula antes de escolher o parser (sem vírgula → `parseFloat` direto; com vírgula → `parseBRL()` normal); os demais ~20 usos de `parseBRL()` no arquivo (todos sobre campos de `folhaItens`, sempre em formato BR) não foram alterados. ZERO DELETE · ZERO ALTER.

- **Rev. 3994** — **BENEFÍCIOS DE ALIMENTAÇÃO: CORRIGIDA A EDIÇÃO QUE REABRIA CONFIGURAÇÕES JÁ ENCERRADAS + TELA GANHA VISIBILIDADE/CONTROLE DE VIGÊNCIA.** Usuário temia que 2 configs no mesmo escopo (obra/"todas as obras") calculassem VR/VA errado. O motor de resolução (Rev. 3985) e a criação de config já fechavam vigências corretamente — o bug real estava na EDIÇÃO: `saveMealBenefitConfig` sempre gravava `vigencia_fim = null` quando o campo não vinha no payload, e a tela (`BeneficiosAlimentacaoTab.tsx`) NUNCA tinha campos de vigência, então toda edição reabria silenciosamente a config (confirmado em produção: "Padrão" e "TESTE" ambas com `vigencia_fim NULL` no mesmo escopo). Fix: UPDATE agora só altera `vigencia_fim` quando enviado explicitamente (ou via nova flag `limparVigenciaFim`), preservando o valor atual por padrão; `listMealBenefitConfigs` retorna `vigenteAgora`; tela ganha coluna "Vigência" (badges Vigente/Encerrada/Agendada), inputs de Início/Fim no dialog e aviso de conflito quando já existe config vigente no mesmo escopo. ZERO DELETE · ZERO ALTER.

### 5 one-liners

- **Rev. 3993** — **DISSÍDIO: HABILITADA EDIÇÃO MANUAL LINHA A LINHA DA DIFERENÇA SALARIAL RETROATIVA (BRUTO/INSS/IRRF).** Nova coluna `diferenca_override_json` em `dissidio_funcionarios` guarda override opcional que PREVALECE sobre o cálculo automático; mutations `sindical.editarDiferencaManual`/`removerEdicaoManualDiferenca` (admin_master only). ZERO DELETE · ZERO ALTER.

- **Rev. 3992** — **DISSÍDIO: HORAS EXTRAS REMOVIDAS DA BASE DA DIFERENÇA SALARIAL RETROATIVA — TODA HE É COMPENSADA VIA BANCO DE HORAS, NUNCA PAGA EM DINHEIRO.** Fórmula/INSS/IRRF marginal estavam corretos DADO que a base incluía HE, mas HE nunca é paga em dinheiro (vira banco de horas). Removida a soma de HE de `baseVerbas` + correção pontual das 58 linhas já persistidas. ZERO DELETE · ZERO ALTER.

- **Rev. 3991** — **DISSÍDIO: BOTÃO "CALCULAR/RECALCULAR DIFERENÇAS RETROATIVAS" FICAVA PERMANENTEMENTE SEM EFEITO — GUARD BLOQUEAVA O DISSÍDIO INTEIRO EM VEZ DE SÓ QUEM JÁ ESTAVA OK.** Guard passou a ser POR FUNCIONÁRIO — recalcula só quem está com valor zerado e não é `rescisao_complementar`. ZERO DELETE · ZERO ALTER.

- **Rev. 3990** — **DISSÍDIO: CORRIGE INSS/IRRF DA DIFERENÇA SALARIAL RETROATIVA — DE "PROGRESSIVO DO ZERO SOBRE O VALOR ISOLADO" PARA "ALÍQUOTA MARGINAL".** `calcularEncargosDiferenca` rodava INSS/IRRF progressivo sobre o valor ISOLADO da diferença em vez da alíquota MARGINAL; agora computa `encargo(baseAntes+diferença) - encargo(baseAntes)`. ZERO DELETE · ZERO ALTER.

- **Rev. 3989** — **FOLHA: TOGGLE "SOMAR DIFERENÇA DO DISSÍDIO" — INCLUI O RETROATIVO DO DISSÍDIO NO LÍQUIDO DA FOLHA DO MÊS DE PAGAMENTO (PERSISTIDO POR PERÍODO).** Nova coluna `somarDiferencaDissidio` em `payrollPeriods`; `simularPagamento` soma o líquido retroativo do dissídio quando o toggle está ON (persistido por período); frontend ganha switch dedicado + selo "+ R$ X dissídio" nas colunas de líquido. ZERO DELETE · ZERO ALTER (só ADD COLUMN).

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3987 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
