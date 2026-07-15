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

- **Rev. 4289** — **FIX: MAPA DE COTAÇÃO — INPUTS MAT/MO COM FORMATO BR (R$ + SEPARADOR DE MILHAR).** Campos Material e Mão de Obra em modo edição exibiam "114580,07" sem R$ e sem separador de milhar. Fix: `type="number"` → `type="text" inputMode="decimal"`; valor exibido formatado BR (`114.580,07`) ao abrir edição + `onFocus` seleciona tudo; prefixo "R$" visível antes do campo; todos os leitores `parseFloat(editMatMdo...)` substituídos por `parseBRNumber(...)` para aceitar "114.580,07" → 114580.07. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4288** — **FEATURE: LEITOR IA (extrairCotacaoIA) EXTRAI MAT/MO EM COTAÇÕES TIPO PACOTE.** O leitor IA era cego ao split Material × Mão de Obra para cotações `tipo=pacote` (ex: PROMATEL). Fix backend: detecta `isPacoteCot`, enriquece `itensRef` com `somenteMo`, adiciona marcadores `[MAT]`/`[MDO]` na lista de itens do prompt, bloco PACOTE no `systemPrompt`, campos `totalMat`/`totalMdo` no JSON schema e instrução nº 9; no loop de resultado, extrai/propaga MAT/MO (distribui proporcionalmente em multi-match; deriva MDO=precoTotal p/ item somenteMo). Fix frontend: `iaLinhas` copia `totalMat`/`totalMdo`; overlay detecta `iaPacote` e exibe colunas MAT (azul) + MO (laranja) com inputs editáveis; `respostasValidas` aceita itens com MAT/MO mesmo sem `precoUnitario`; save passa `{totalMat, totalMdo}` para `salvarRespostasLote`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4287** — **FIX: MAPA DE COTAÇÃO (PACOTE) — COLUNAS MATERIAL/MO NÃO EDITÁVEIS E MO SEMPRE ZERADA.** Dois bugs no Mapa de Cotação tipo "pacote": (1) colunas MAT/MO do fornecedor nunca renderizavam inputs em modo edição — sempre mostravam `<span>` calculado, impossibilitando edição; (2) classificação MAT vs MDO era binária (`cMdo > 0 && cMat === 0`), jogando 100% p/ MAT todos os itens com ambas as rubricas no orçamento, resultando em MO = "—" para PROMATEL. Fix: (a) split agora é proporcional ao ratio `metaUnitarioMat / metaUnitarioMdo` da meta de cada filho; (b) se `totalMat`/`totalMdo` já foram salvos, usa-os diretamente; (c) modo edição renderiza inputs `<Input>` para MAT e MDO nas colunas do fornecedor, atualizando `editMatMdo[key]` e recalculando `editPrecos[key] = mat + mdo`; (d) save path do pacote agora passa `totalMat`/`totalMdo` para o `salvarRespostasLote`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4286** — **FIX: SOLICITAÇÕES — ReferenceError "Can't find variable: selecionados".** Causa raiz: bloco "Somente MO" inserido na EAP item list de `Solicitacoes` (linhas 1107-6101) referenciava `selecionados` (Set<string> do `DisciplinasModal`, linhas 277-781) e `selKey(disc.nome, ...)` — variáveis fora de escopo. Fix: substituir pela condição correta do contexto: `(selectedEapIds.has(it.id) || qtdVal > 0)`. Botão "Somente MO" exibe corretamente para itens marcados. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4285** — **FIX: COTAÇÕES — DIALOG "CONDIÇÕES DE PAGAMENTO" EXIBIA DRIFT DE CENTAVOS (+R$ 0,05).** Fix em 4 pontos. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4284** — **COTAÇÕES/COMPRAS: ADIANTAMENTO (SINAL) E RETENÇÃO DE GARANTIA NO DIALOG "CONDIÇÕES DE PAGAMENTO".** Nova seção "Adiantamento & Retenção". 10 colunas novas em `compras_cotacao_fornecedores`, 10 em `compras_ordens`, 3 em `terceiro_medicoes`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4283** — **FIX: COTAÇÕES — DRIFT DE CENTAVOS NO DIALOG "CONDIÇÕES DE PAGAMENTO".** Fix backend acumula em centavos inteiros. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4282** — **CONTROLE DE CHEQUES: "VER PAGAMENTO" EXIBE VALOR TOTAL DO PIX QUANDO ALOCAÇÃO É PARCIAL.** PIX R$ 5.800,00 → 2 cheques: popover mostra alocado + âmbar "Valor total do PIX". ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4281** — **FIX: CONTROLE DE CHEQUES — autoMarcarChequesDevolvidos SOBRESCREVIA STATUS COMPENSADO.** Fix: `AND data_compensacao IS NULL` no SELECT e UPDATE. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4280** — **CONCILIAÇÃO: ALERTAS DE COBERTURA NO PAINEL "QUITAR CHEQUES DEVOLVIDOS".** Verde/âmbar/vermelho por totalSel vs pixVal. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4279** — **CONCILIAÇÃO: STATUS DO CHEQUE DEVOLVIDO SINCRONIZA COM CONTROLE DE CHEQUES (bidirecional).** 3 bugs em camadas: `chequeNumero` nunca passado, INSERT NULL, desconciliar não estornava vínculos. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4278** — **FIX: CONCILIAÇÃO — 1 PIX → N CHEQUES DEVOLVIDOS SÓ MOSTRAVA O PRIMEIRO.** `vincByPix` Map sobrescrevia; alterado para array com push. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4277** — **CONCILIAÇÃO BANCÁRIA: RESUMO DOS CHEQUES JÁ VINCULADOS NO HEADER DO PAINEL.** Backend: `listVinculosByPixLine`; frontend: count + lista com ✓. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4267 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
