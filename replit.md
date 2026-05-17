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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção OBRIGATÓRIA (não negociável)** — este arquivo guarda APENAS as últimas **5 revisões** em formato detalhado (o quê + por quê + arquivos tocados). Todas as outras revisões DEVEM aparecer como uma única linha: `- ~~Rev. NNNN~~ — ver \`shared/changelog.ts\`.`
>
> **Ao criar uma nova revisão**:
> 1. Adicionar o bloco detalhado da NOVA revisão no TOPO.
> 2. Pegar o bloco mais ANTIGO dos 5 expandidos e SUBSTITUIR ele inteiro por `- ~~Rev. NNNN~~ — ver \`shared/changelog.ts\`.`
> 3. NUNCA deletar parcialmente um bloco (deixando texto órfão sem o marcador `- **Rev. NNNN**:`). Se sobrar parágrafo solto sem prefixo `- `, é bug.
> 4. NUNCA usar marcadores HTML do tipo `<!-- DETALHES REVS ANTIGAS -->` — eles foram banidos na Rev. 1958 (faxina) por causarem confusão.
>
> O histórico completo (causa-raiz, stack traces, nomes de arquivos, comentários longos) vive em `shared/changelog.ts`. Esta convenção é validada visualmente: cada linha do bloco "Recent changes" deve começar com `- ` (hífen+espaço).

- **Rev. 1998**: **Terceiros · Funcionários · Foto de identificação + Número Interno auto-gerado**. Pedido direto do usuário (image_1779026783535) na tela "Novo Funcionário Terceiro" (`/terceiros/funcionarios`): (a) cadastrar foto pra facilitar identificação visual e (b) ERP gerar automaticamente um número interno `[INICIAIS_EMPRESA]-[SEQ_GLOBAL]` (sequencial único pra TODOS terceiros do tenant, só a sigla muda por empresa). **Mudança** em 4 arquivos: (1) `drizzle/schema.ts` (L3566-3569) — `funcionariosTerceiros` ganhou `numeroInterno varchar(30)` (nullable, retrocompat). (2) `server/_core/index.ts` (+5L, bloco logo após `curriculos.historico_status_json`) — bootstrap idempotente `ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS numero_interno VARCHAR(30)` + `CREATE INDEX IF NOT EXISTS idx_func_terc_numero_interno (company_id, numero_interno)`. (3) `server/routers/terceiros.ts` (`funcionarios.create` ~60L reescritas L480-540) — input ganhou `fotoBase64`/`fotoFileName`/`fotoContentType` opcionais; fluxo: busca empresa → gera sigla (NFD remove acentos + uppercase + `/[^A-Z]/` strip + slice(0,3) + padEnd(3,'X'), ex: "Construtora XPTO Ltda"→"CON") → próximo seq GLOBAL via `MAX(NULLIF(regexp_replace(numero_interno,'^.*-',''),'')::INTEGER) + 1` filtrado por `company_id` → monta `${sigla}-${String(seq).padStart(5,'0')}` (ex: `CON-00001`) → se foto enviada, `storagePut` em `terceiros/funcionarios/_novos/{ts}-{name}` → INSERT com `.returning({id})` (corrigido de pattern MySQL `[result] = ...` pra postgres) → retorna `{id, numeroInterno}`. (4) `client/src/pages/terceiros/FuncionariosTerceiros.tsx`: 2 states novos (`fotoPreview` data URL + `fotoPayload` base64), 2 handlers (`handlePickFotoNovo` via FileReader; `handlePickFotoEdit` faz upload imediato via `uploadDoc`); `openNew`/`openEdit`/`handleSave` adaptados; aba Dados Pessoais ganhou **hero card no topo** (gradient blue→indigo, border dashed) com avatar circular h-24 w-24 ring-4 + Camera placeholder/preview + botão X vermelho pra remover + título + badge `numeroInterno` (em edit) OU "Nº interno será gerado ao salvar" (em new) + botão "Selecionar/Trocar foto"; item da lista ganhou avatar circular h-12 w-12 à esquerda + badge azul mono `BadgeCheck numeroInterno` ao lado do nome. + `shared/version.ts` → 1998. **Preservado**: `update` mutation INTACTA, `uploadDoc` INTACTO, filtros/stats/aba Documentos INTACTOS, outras leituras de `funcionariosTerceiros` (warnings/obrigacoes/portal externo) — coluna nullable, queries SELECT * seguem OK. Rev. 1997 INTACTA. Race em geração de seq aceitável pra cadastro manual low-throughput (migra pra advisory lock se virar problema). R-001/R-007/R-010 OK (só ADD COLUMN/INDEX IF NOT EXISTS). Reversível em 4 arquivos.
- ~~Rev. 1997~~ — ver `shared/changelog.ts`. **DP · Fechamento de Ponto · Cards de Ranking + Modal Drill-Down redesenhados em regras de ouro**. Pedido direto do usuário (image_1779026555326/633610/653802): os 4 cards (Mais Pontuais/Mais Atrasados/Mais Horas Extras/Menos Dias Trabalhados) e modal drill-down precisavam virar experiência intuitiva pra reuniões mensais — com indicadores importantes, legenda fácil e responsividade. Antes: cards `<Card>` chapados com border-t colorido + lista; modal full-screen com header bg-white plano, legenda em parágrafo de texto corrido, sem KPIs no topo. **Mudança** em 1 arquivo de aplicação (`client/src/pages/FechamentoPonto.tsx`): (a) **4 cards do topo (L1965-2046)** viraram divs com gradient `from-{cor}-50 to-white`, border-2 hover, shadow-sm→md, ícone em chip h-7 w-7 ring-2, título bold + hint contextual ("Top sem atrasos"/"Atenção crítica"/"Volume de HE no mês"/"Possíveis faltas/escala"), contador grande à direita, footer "Ver todos (N) →" clicável. Loop sobre array `cards` tipado (anti-DRY). (b) **Modal header gradient (L2138-2173)** bg-gradient-to-r por tipo (emerald/red-rose-pink/amber-orange-yellow/slate-zinc), text-white, overlay radial sutil, ícone em chip h-12 w-12 ring-4, badge "N colaboradores" backdrop-blur, subtítulo descritivo, botões Imprimir/CSV com bg-white/95. (c) **NOVO bloco KPIs (L2185-2199)** — grid 2/4 com 4 indicadores que mudam por tipo (Pontuais: Colab/Sem atraso/Atraso acum/Média dias · Atrasados: Colab/Atraso acum/H Total/Média dias · Extras: Colab/Total HE/Sem solicitação/H Total · Faltosos: Colab/Justificadas/Não justif/Média dias). Fórmulas IDÊNTICAS às do rodapé (apenas elevadas pro hero — rodapé intacto). (d) **Legenda redesenhada (L2228-2247)** virou card bg-blue-50/40 com título uppercase + ícone Info; grid 2/4 de mini-cards com ícone + label + descrição + cor temática (Atraso=red, Presença=indigo, Justificada=emerald, HE=amber, Solicitação=orange). Itens variam por tipo. (e) Modal envolto em IIFE `(() => { cfg + kpis + return <Dialog/> })()`. + `shared/version.ts` → 1997. **Preservado**: `rankings` (allPontuais/allAtrasados/allExtras/allFaltosos slice top-5) INTACTO L1009-1020; `filteredRankingRows` (busca+obra) INTACTO L1056; `handlePrintRanking`/`handleExportRankingCSV` INTACTOS L1070-1178; tabela detalhada + sub-modal de calendário (`diasDetalhe`) + rodapé de totais INTACTOS; cliques continuam abrindo `openPontoDetalhe(e.id)` / `setRankingModal` originais; `EmpStatusBadge` INTACTO. Schema/tRPC INTACTOS. R-001/R-007/R-010 OK. Rev. 1996 INTACTA. Reversível em 1 arquivo (2 hunks grandes).
- ~~Rev. 1996~~ — ver `shared/changelog.ts`. **Compras · Cotações · Modal de Condições de Pagamento agora se adapta ao TIPO da cotação (Material / Mão de Obra pura / Pacote)**. Pedido direto do usuário: o modal mostrava as 4 seções fixas (Forma + Parcelamento + Entrega/Frete + Módulo de Medição) pra qualquer tipo — em MATERIAL pedia "Módulo de Medição" (irrelevante), em MÃO DE OBRA pura pedia CIF/FOB+prazo de entrega (serviço não tem frete), em PACOTE misturava tudo sem indicar o que era de cada lado. **Mudança** em 2 arquivos: (1) `client/src/pages/compras/Cotacoes.tsx` — `+1 state mdoTab: Record<number, "" | "medicao" | "parcelado">` perto do L662; derivação no início do `condModalPortal` IIFE: `modoModal` ("material"/"mdo"/"pacote" a partir de `cotTipoEfetivo`), `mdoModoEfetivo` (lê `mdoTab[fId]` OU infere pelos dados pré-carregados pela Rev. 1994), `FORMAS_RENDER` (filtra cheque/cartão pra MDO), flags `showParcelamento`/`showEntregaFrete`/`showModuloMedicao`/`mdoSemModo`, helper `handleMdoTabChange(novo)` que limpa state da opção oposta. Hero toggle MDO ~50 linhas (2 cards lado-a-lado purple/blue) renderizado SOMENTE quando `modoModal === "mdo"`. Card de contexto PACOTE no topo + badges "📦 MATERIAL"/"👷 MÃO DE OBRA" nas colunas. Grid mudou de `lg:grid-cols-[1.2fr_1fr]` fixo pra condicional (MDO=1col centrada; outros=2cols). Seções ganharam wraps condicionais (`{!mdoSemModo}`/`{showParcelamento}`/`{showEntregaFrete}`/`{showModuloMedicao}`); coluna direita ganha `hidden` quando ambas as flags são false. Botão Salvar: `disabled` inclui `mdoSemModo` + tooltip; `handleSalvar` ganha early-return com toast. (2) `shared/version.ts` → 1996. **Resultado**: MATERIAL inalterado; MDO pura exige escolha no hero (sem pré-seleção) e mostra só o que faz sentido pra cada modo; PACOTE indica visualmente material vs MDO. **Preservado**: payload da mutation IDÊNTICO (apenas omite campos das seções escondidas); lógica interna das 4 seções (parcelas, tabs Padrão/Fechamento/Personalizado, CIF/FOB, 5 módulos) INTACTA. Compat Rev. 1994 (pré-carga) e Rev. 1995 (bloqueio soma) OK. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em ~8 hunks.
- ~~Rev. 1995~~ — ver `shared/changelog.ts`. **Compras · Cotações · Modal de Condições de Pagamento bloqueia salvar quando soma das parcelas Personalizadas não bate**. Pedido direto do usuário (task #48): no modo "Personalizado" o card de totalização já mostrava "Faltam R$ X" / "Excede R$ Y" quando `|fornTotal − somaParcelas| ≥ 0.01`, mas o botão "Confirmar e Salvar" continuava habilitado e permitia gerar inconsistência financeira. **Mudança** em 2 arquivos: (1) `client/src/pages/compras/Cotacoes.tsx` (~28 linhas, 2 hunks no `condModalPortal` IIFE) — logo após `tipoBadge` (L1521) computa `modoAtual`/`parcListAtual`/`totalCustomAtual`/`diffCustom`/`customInvalid` (= modo "custom" E (0 parcelas OU |diff| ≥ 0.01)) + `customMotivo` ("Adicione pelo menos uma parcela…" / "Faltam R$ X…" / "Excede R$ X…"); `handleSalvar` ganha early-return com `toast.error(customMotivo)` (defesa em profundidade); footer renderiza hint amber com `<AlertTriangle>` quando inválido; botão desabilitado + `aria-disabled` + classes `disabled:opacity-60 disabled:cursor-not-allowed`, envolto em `<span title={customMotivo}>` (tooltip nativo confiável mesmo com botão disabled). (2) `shared/version.ts` → 1995. **Resultado**: em Personalizado com soma divergente OU sem parcelas → botão desabilitado; modos Padrão/Fechamento e Custom com soma OK seguem habilitando normalmente. **Preservado**: card de totalização interno (L1851-1867) INTACTO; cálculo de `fornTotal` (L1488-1499) INTACTO; payload da mutation INTACTO; imports já existiam (zero import novo). Rev. 1994 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 2 arquivos.
- ~~Rev. 1994~~ — ver `shared/changelog.ts`. **Compras · Cotações · Modal de Condições de Pagamento agora pré-carrega campos persistidos ao reabrir**. Pedido direto do usuário (task #47): antes os estados do modal (forma, tipo, condição, prazo, frete, transportadora, módulo, parcelas) só eram inicializados via `useEffect L1071` quando `mapaQ.data` mudava — em cenários de refetch parcial ou edit-sem-salvar-e-reabrir os campos voltavam vazios. Também `condModo`/`condCustomParcelas` nunca eram pré-inicializados, então `numeroParcelas > 1` salvo aparecia como modo Padrão vazio. **Mudança** em 2 arquivos: (1) `client/src/pages/compras/Cotacoes.tsx` (+44 linhas, novo `useEffect` após L1137) dispara em `[condModalFornId, mapaQ.data]`; quando modal abre busca `participantes[fId]` e seeda 8 campos persistidos APENAS quando a chave está `undefined`/vazia (preserva edições não salvas); para `freteTipo`/`valorFrete` só seeda quando `undefined` (não sobrescreve "0" digitado); se `numeroParcelas > 1` e `condModo[fId]` undefined e parcelas custom vazias, infere `condModo="custom"` e cria N parcelas dividindo `totalOrcado` igualmente com vencimentos a cada 30 dias. (2) `shared/version.ts` → 1994. **Resultado**: ao abrir o modal, todos os campos vêm preenchidos; fechar sem salvar e reabrir mantém estado; trocar modos preserva o que já estava. **Preservado**: useEffect L1071 INTACTO (segue rodando no load do mapa); `salvarCondicoesComerciais.mutate` INTACTO; handlers de toggle de modo INTACTOS; Rev. 1993 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 2 arquivos.
- ~~Rev. 1993~~ — ver `shared/changelog.ts`.
- ~~Rev. 1992~~ — ver `shared/changelog.ts`.
- ~~Rev. 1991~~ — ver `shared/changelog.ts`.
- ~~Rev. 1990~~ — ver `shared/changelog.ts`. **Cotações · UX · Coluna SALDO vinculada visualmente ao Vencedor (pedido direto do usuário)**. Tela `/compras/cotacoes/<id>`: coluna SALDO ficava no extremo direito DEPOIS de todas as colunas de fornecedores, mas seu valor é sempre calculado vs. o Vencedor (primeiro fornecedor). Visualmente parecia colada ao ÚLTIMO fornecedor, dando "impressão de erro". **Mudança** em 1 arquivo (`client/src/pages/compras/Cotacoes.tsx`, 3 hunks, ZERO lógica): (1) `<th>` Saldo recebeu fundo emerald-50/60, borda-l-2 emerald-300, ícone Trophy + subtítulo "vs. <Nome do Vencedor>"; (2) `<td>` por item recebeu bg-emerald-50/30 + border-l-2 emerald-200; (3) `<td>` TOTAL recebeu bg-emerald-50/40 + border-l-2 emerald-300. Badge interna emerald/red (positivo/negativo) INTACTA. version → 1990. **Resultado**: SALDO se destaca da última coluna de fornecedor + subtítulo explícito do vencedor → elimina sensação de "valor perdido no final". **Preservado**: TODA lógica (`hasMeta`/`melhorForn`/`metaTot`/`saldo`/`saldoTotal`) INTACTA — só CSS/markup. Rev. 1989 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 3 hunks.
- ~~Rev. 1989~~ — ver `shared/changelog.ts`. **Cotações · UX · Header e cell condensados (pedido direto do usuário)**. Tela `/compras/cotacoes/<id>` tinha cada coluna de fornecedor com 5+ blocos verticais empilhados (nome+score, chip Vencedor, botão Anexar+texto+nome arquivo, botão Ler com IA+texto, botão Propostas+texto, botão Editar Preços+texto) em ~200px de largura → wrap, sobreposição, visual confuso. Cell de item embaixo da barra de progresso de saldo orçamentário tinha 4 spans separados em 2 linhas. **Mudança** em 1 arquivo (`client/src/pages/compras/Cotacoes.tsx`, 6 hunks, ZERO lógica): (1) toolbar de ações sem `flex-wrap`, gap reduzido pra 0.5; (2-5) botões Anexar/Ler com IA/Propostas/Editar Preços viraram icon-only h-7 w-7 com tooltip preservando a info que estava no texto; modo edição (Salvar/Desconto/Acréscimo) mantido com texto (ações contextuais). (6) Linha de breakdown de saldo condensada de 4 spans empilhados pra 1 linha truncate com tooltip completo. version → 1989. **Resultado**: largura do header diminui ~50%, saldo passa de 2 linhas pra 1, tela cabe sem scroll horizontal interno em 1366+, hover preserva 100% da info. **Preservado**: TODA a lógica INTACTA — só CSS/markup. Handlers/popovers/mutations/Anexo popover/modo edição/Vencedor chip/score badges/COBERTURA header/TOTAL row/barra de progresso INTACTOS. Rev. 1988 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 6 hunks.
- ~~Rev. 1988~~ — ver `shared/changelog.ts`. **Lote 1 · Pós-revisão arquitetural · 2 correções de profundidade nos fixes anteriores**. Origem: code review identificou (i) C1 estava incompleto pra OC de MATERIAL — `gerarProximoNumeroOC` no branch "compra" usava COUNT(*) dentro do lock mas não persistia contador → INSERT fora da tx permitia 2 chamadas lerem o mesmo COUNT e duplicarem OC-YYYY-NNNN; e (ii) A2 não entregava observabilidade real — `syncNow` mascarava erros com `.catch(() => {})`, então `triggerFinancialSyncAwaited` nunca propagava falha. **Mudança** em 2 arquivos: (1) `server/routers/compras.ts` — branch material de `gerarProximoNumeroOC` reescrito (~28 linhas) pra usar `ocNumberConfig.proximoNumero` (coluna LEGACY que já existia, ZERO ALTER) como contador persistente dentro do lock; bootstrap inteligente via `Math.max(COUNT+1, proximoNumero)` pra primeira chamada com OCs históricas. Lookup do config movido pra antes do switch (compartilhado). (2) `server/services/financialEventTrigger.ts` (+15 linhas) — nova função privada `syncNowStrict` (idêntica a `syncNow` MENOS os swallows); `triggerFinancialSyncAwaited` agora usa ela; `syncNow` + `triggerFinancialSync` originais INTACTOS (8 callers fire-and-forget preservados). version → 1988. **Lote 1 (C1+C2+A1+A2) agora REALMENTE fechado**. **Preservado**: branch OS/Pacote INTACTO, callers fire-and-forget INTACTOS, schema INTACTO (coluna `proximoNumero` já existia), Revs. 1985-1987 INTACTAS. R-001/R-007/R-010 OK. **Não corrigido (deliberadamente, vai pra Lote 2)**: `existCheck` de contrato em `gerarContratoTerceiroDeOS` fica fora do lock — concorrência extrema pode criar 2 contratos com números diferentes pra MESMA OC (não é dup de numeração, é dup de contrato). Menos crítico, fica pra Lote 2 com C3/C4/A3/A4/A5.
- ~~Rev. 1987~~ — ver `shared/changelog.ts`.
- ~~Rev. 1986~~ — ver `shared/changelog.ts`.
- ~~Rev. 1985~~ — ver `shared/changelog.ts`.
- ~~Rev. 1984~~ — ver `shared/changelog.ts`. **Faxina do `replit.md`** (manutenção, sem mudança de comportamento). O arquivo havia crescido pra ~30k tokens com 7 blocos detalhados espalhados (Rev. 1983, 1979, 1975, 1968, 1967, 1965, 1964, 1963, 1962, 1961) violando a convenção do topo deste bloco — "APENAS últimas 5 detalhadas". Além disso havia duplicidades: Rev. 1965/1964/1963/1962/1961 apareciam DUAS vezes (detalhadas no meio + colapsadas no fim). **Mudança** em 2 arquivos: (1) `replit.md` — bloco "Recent changes" reescrito: Rev. 1984 entra como única entrada detalhada no topo; Rev. 1983 → 1903 todas colapsadas em formato one-liner. Convenção, "User preferences" e linha "Revisões anteriores a 1903" INTACTAS. (2) `shared/version.ts` → 1984. **Resultado**: arquivo reduzido de 152 linhas (~30k tokens) pra ~95 linhas (~6k tokens). Toda informação preservada — basta abrir `shared/changelog.ts` pra ler qualquer rev histórica em detalhe. Nenhum código de aplicação tocado. Nenhum schema alterado. Nenhuma rota tRPC modificada. Sem risco de regressão. **Preservado**: Rev. 1983 e todas anteriores 100% INTACTAS no codebase. R-001/R-007/R-010 OK. Reversível em 2 arquivos.
- ~~Rev. 1983~~ — ver `shared/changelog.ts`.
- ~~Rev. 1982~~ — ver `shared/changelog.ts`.
- ~~Rev. 1981~~ — ver `shared/changelog.ts`.
- ~~Rev. 1980~~ — ver `shared/changelog.ts`.
- ~~Rev. 1979~~ — ver `shared/changelog.ts`.
- ~~Rev. 1978~~ — ver `shared/changelog.ts`.
- ~~Rev. 1977~~ — ver `shared/changelog.ts`.
- ~~Rev. 1976~~ — ver `shared/changelog.ts`.
- ~~Rev. 1975~~ — ver `shared/changelog.ts`.
- ~~Rev. 1974~~ — ver `shared/changelog.ts`.
- ~~Rev. 1973~~ — ver `shared/changelog.ts`.
- ~~Rev. 1972~~ — ver `shared/changelog.ts`.
- ~~Rev. 1971~~ — ver `shared/changelog.ts`.
- ~~Rev. 1970~~ — ver `shared/changelog.ts`.
- ~~Rev. 1969~~ — ver `shared/changelog.ts`.
- ~~Rev. 1968~~ — ver `shared/changelog.ts`.
- ~~Rev. 1967~~ — ver `shared/changelog.ts`.
- ~~Rev. 1966~~ — ver `shared/changelog.ts`.
- ~~Rev. 1965~~ — ver `shared/changelog.ts`.
- ~~Rev. 1964~~ — ver `shared/changelog.ts`.
- ~~Rev. 1963~~ — ver `shared/changelog.ts`.
- ~~Rev. 1962~~ — ver `shared/changelog.ts`.
- ~~Rev. 1961~~ — ver `shared/changelog.ts`.
- ~~Rev. 1960~~ — ver `shared/changelog.ts`.
- ~~Rev. 1959~~ — ver `shared/changelog.ts`.
- ~~Rev. 1958~~ — ver `shared/changelog.ts`.
- ~~Rev. 1957~~ — ver `shared/changelog.ts`.
- ~~Rev. 1956~~ — ver `shared/changelog.ts`.
- ~~Rev. 1955~~ — ver `shared/changelog.ts`.
- ~~Rev. 1954~~ — ver `shared/changelog.ts`.
- ~~Rev. 1953~~ — ver `shared/changelog.ts`.
- ~~Rev. 1952~~ — ver `shared/changelog.ts`.
- ~~Rev. 1951~~ — ver `shared/changelog.ts`.
- ~~Rev. 1950~~ — ver `shared/changelog.ts`.
- ~~Rev. 1949~~ — ver `shared/changelog.ts`.
- ~~Rev. 1948~~ — ver `shared/changelog.ts`.
- ~~Rev. 1947~~ — ver `shared/changelog.ts`.
- ~~Rev. 1946~~ — ver `shared/changelog.ts`.
- ~~Rev. 1945~~ — ver `shared/changelog.ts`.
- ~~Rev. 1944~~ — ver `shared/changelog.ts`.
- ~~Rev. 1943~~ — ver `shared/changelog.ts`.
- ~~Rev. 1942~~ — ver `shared/changelog.ts`.
- ~~Rev. 1941~~ — ver `shared/changelog.ts`.
- ~~Rev. 1940~~ — ver `shared/changelog.ts`.
- ~~Rev. 1939~~ — ver `shared/changelog.ts`.
- ~~Rev. 1938~~ — ver `shared/changelog.ts`.
- ~~Rev. 1937~~ — ver `shared/changelog.ts`.
- ~~Rev. 1936~~ — ver `shared/changelog.ts`.
- ~~Rev. 1935~~ — ver `shared/changelog.ts`.
- ~~Rev. 1934~~ — ver `shared/changelog.ts`.
- ~~Rev. 1933~~ — ver `shared/changelog.ts`.
- ~~Rev. 1932~~ — ver `shared/changelog.ts`.
- ~~Rev. 1931~~ — ver `shared/changelog.ts`.
- ~~Rev. 1930~~ — ver `shared/changelog.ts`.
- ~~Rev. 1929~~ — ver `shared/changelog.ts`.
- ~~Rev. 1928~~ — ver `shared/changelog.ts`.
- ~~Rev. 1927~~ — ver `shared/changelog.ts`.
- ~~Rev. 1926~~ — ver `shared/changelog.ts`.
- ~~Rev. 1925~~ — ver `shared/changelog.ts`.
- ~~Rev. 1924~~ — ver `shared/changelog.ts`.
- ~~Rev. 1923~~ — ver `shared/changelog.ts`.
- ~~Rev. 1922~~ — ver `shared/changelog.ts`.
- ~~Rev. 1921~~ — ver `shared/changelog.ts`.
- ~~Rev. 1920~~ — ver `shared/changelog.ts`.
- ~~Rev. 1919~~ — ver `shared/changelog.ts`.
- ~~Rev. 1918~~ — ver `shared/changelog.ts`.
- ~~Rev. 1917~~ — ver `shared/changelog.ts`.
- ~~Rev. 1916~~ — ver `shared/changelog.ts`.
- ~~Rev. 1915~~ — ver `shared/changelog.ts`.
- ~~Rev. 1914~~ — ver `shared/changelog.ts`.
- ~~Rev. 1913~~ — ver `shared/changelog.ts`.
- ~~Rev. 1912~~ — ver `shared/changelog.ts`.
- ~~Rev. 1911~~ — ver `shared/changelog.ts`.
- ~~Rev. 1910~~ — ver `shared/changelog.ts`.
- ~~Rev. 1909~~ — ver `shared/changelog.ts`.
- ~~Rev. 1908~~ — ver `shared/changelog.ts`.
- ~~Rev. 1907~~ — ver `shared/changelog.ts`.
- ~~Rev. 1906~~ — ver `shared/changelog.ts`.
- ~~Rev. 1905~~ — ver `shared/changelog.ts`.
- ~~Rev. 1904~~ — ver `shared/changelog.ts`.
- ~~Rev. 1903~~ — ver `shared/changelog.ts`.

> Revisões anteriores à 1903: ver `shared/changelog.ts` (histórico completo).

## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + pop oldest do top-5 de `replit.md` (ver convenção acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
