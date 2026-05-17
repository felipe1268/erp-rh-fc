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

- **Rev. 1992**: **Compras · Cotações · Modal "Condições de Pagamento" redesenhado em full-screen (regras de ouro)**. Pós-rebase: renumerado de Rev. 1984 → 1992 porque o main avançou até Rev. 1991 (saldo por fornecedor) enquanto esta task estava em andamento. User (17/05/2026, image_1779021843980): pediu para refazer o lay-out do modal de Condições de Pagamento (acessível pelo card de cada fornecedor no Mapa de Cotação) que aparecia como pop-up estreito `max-w-2xl` ~640px, com seções espremidas, header pequeno, footer colado, botão primário pálido — em desktop sobrava área lateral preta inútil, em iPad ficava difícil de operar. **Mudança** em 1 arquivo (`client/src/pages/compras/Cotacoes.tsx`, ~430 linhas reescritas no `condModalPortal`): (1) imports lucide-react ampliados com `Zap, PenTool, CreditCard, Banknote, Calendar, Truck, Target, BarChart2, Clock, Wallet, Layers, type LucideIcon`; (2) wrapper full-screen `w-[100vw] h-[100vh]` mobile/iPad e `lg:w-[96vw] lg:h-[94vh] lg:max-w-[1400px] lg:rounded-2xl`, overlay `bg-slate-900/60 backdrop-blur-sm`; (3) header faixa gradient violet com ícone Wallet em chip + badge dinâmico de tipo derivado de `tipoEfetivo`; (4) corpo em `grid lg:grid-cols-[1.2fr_1fr]` — esquerda Forma+Parcelamento, direita Entrega+Módulo Medição; helper local `SectionHeader` tipado `{ Icon: LucideIcon }`; (5) Forma: 6 botões h-14 com ícones lucide reais substituindo emojis; (6) Parcelamento: tabs `role=tablist` h-9 + `aria-selected`; modos Padrão/Fechamento/Personalizado preservados; (7) Entrega: Clock/Calendar inline, CIF/FOB com ring amber; (8) Módulo Medição: 5 cards com ícones em chip colorido; (9) footer sticky com Save + loading. Tipagem com `LucideIcon` em vez de `any`, e `mapaData` narrowed. version → 1992. **Funcionalidade INTACTA**: todos os estados, `calcularParcelas`, validação soma, alternância CIF/FOB, label dinâmica "Mobilização & Frete" e payload da `salvarCondicoesComerciais.mutate({...})` IDÊNTICO (extraído num handler local `handleSalvar`). **Preservado**: outros modais INTACTOS; Rev. 1991 (saldo por fornecedor) e Rev. 1990 INTACTAS; backend/schema INTACTOS. R-001/R-007/R-010 OK.
- **Rev. 1991**: **Cotações · UX · Saldo agora aparece DENTRO de cada coluna de fornecedor (pedido direto do usuário, 3ª iteração)**. Tela `/compras/cotacoes/<id>`: coluna SALDO solitária no fim sempre comparava vs. Vencedor — confundia porque o saldo positivo NÃO era do último fornecedor adjacente, e só havia UM saldo (do Vencedor). **Mudança** em 1 arquivo (`client/src/pages/compras/Cotacoes.tsx`, 8 hunks, lógica trivial `metaTot - displayTotal` e `metaGrandTotal - totalForn`): (1) `<th>` fornecedor `colSpan={3}` → `{4}`; (2) `<th>` SALDO solitário REMOVIDO; (3) sub-header ganha 4ª div "Saldo"; (4) body ganha 4ª `<td>` por fornecedor com badge emerald/red; (5) `<td>` Saldo solitário do item REMOVIDO; (6) footer ganha 4ª `<td>` total por fornecedor; (7) `<td>` Saldo total solitário REMOVIDO; (8) `numFornCols` *3→*4 + colSpan composição expandida ajustado. version → 1991. **Resultado**: cada fornecedor tem 4 sub-colunas (QTD/Preço Unit/Total/Saldo). Comprador vê fornecedor por fornecedor se está acima/abaixo da meta. **Preservado**: badge emerald/red interna, `getFornTotal`, ranking, Vencedor chip, Pin, modo edição INTACTOS. Rev. 1990 (destaque emerald da col solitária) REVERTIDA por remoção da col. Rev. 1989 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 8 hunks.
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
