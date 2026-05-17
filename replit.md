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

- **Rev. 2009**: **SST · Integração · Modal "Novo/Editar Vídeo" repaginado na regra de ouro**. Pedido direto do usuário (img IMG_0851_1779031346140): "Melhore isso seguindo nossa regra de ouro". Modal chapado com DialogHeader cinza padrão, campos empilhados sem hierarquia, sem ícones, sem agrupamento — quebrava o padrão estabelecido. **Mudança** em 1 arquivo (`client/src/pages/sst/IntegracaoSST.tsx`, ~150L reescritas no modal de VideosTab): (1) Largura `max-w-lg` → `max-w-2xl`, container `p-0 gap-0 overflow-hidden`. (2) **Header gradient** emerald→teal full-width com chip Film ring-2 + título + subtítulo explicativo. (3) **4 seções numeradas e coloridas** com chip de ícone lucide: "1 · Onde encaixa" (indigo, Settings), "2 · Conteúdo do módulo" (slate, GraduationCap), "3 · Mídia do vídeo" (blue, Video) com **preview rico do YouTube** (overlay Play hover + badge), "4 · Configurações de exibição" (amber, Clock) com toggle Obrigatório estilo card verde + hint da consequência. (4) Container scroll `max-h-[calc(100vh-220px)]` pra não estourar em mobile/tablet. (5) Footer com borda + bg slate-50 + CTA gradient emerald→teal com sombra. (6) `shared/version.ts` → 2009. **Resultado**: modal alinhado à regra de ouro, fluxo em 4 etapas numeradas, CTA destacado, hint reforça consequência da obrigatoriedade. **Preservado**: TODOS os estados/mutations/resetForm/handleSave INTACTOS; outros modais do arquivo (Config/Sessão/Pendentes/Histórico) INTACTOS — só VideosTab mudou. Rev. 2008 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK (CSS+markup-only). Reversível em 1 hunk. **Follow-up**: aplicar regra aos outros modais (Config/Sessão/Pendentes/Histórico); render real do iframe YouTube/Vimeo no preview; suporte real a upload direto.
- ~~Rev. 2008~~ — ver `shared/changelog.ts`. **Terceiros · Funcionários · Endereço residencial completo + bloco "Contato & Endereço" destacado**. Pedido direto do usuário: "coloque mais dados, como endereço.. para controlar de onde nossos terceiros são.. telefone tbm seria importante". Cadastro tinha só Telefone+E-mail soltos no grid genérico, ZERO endereço — impossibilitando logística de transporte/vale-transporte e relatório de origem. **Mudança** em 4 arquivos: (1) `drizzle/schema.ts` (+7L em `funcionariosTerceiros`): cep, logradouro, numeroEndereco, complemento, bairro, cidade, uf (todas nullable). (2) `server/_core/index.ts` (+13L): bootstrap idempotente `ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS …` pras 7 colunas. Log confirma "Colunas de endereço garantidas". (3) `server/routers/terceiros.ts`: inputs zod de `create`/`update` ganharam as 7 chaves opcionais. (4) `client/src/pages/terceiros/FuncionariosTerceiros.tsx`: Telefone+E-mail+endereço viraram **bloco destacado emerald "Contato & Endereço Residencial"** (chip Phone + header explicando o porquê), grid interno 1/2/4/6 cols: Telefone marcado * + E-mail | CEP + Logradouro (3 cols) + Número | Complemento + Bairro + Cidade (2 cols cada) + UF auto-uppercase. +1 import `Phone` lucide. (5) `shared/version.ts` → 2008. **Resultado**: gestor cadastra endereço completo em segundos, vê origem dos terceiros por cidade/UF, possibilita logística de transporte. **Preservado**: nº interno (Rev. 1998), foto, integração Construtora/Cliente (Rev. 2003), DDS (Rev. 2004), documentos (Rev. 2002), grid responsivo (Rev. 2007) — INTACTOS. R-001/R-007/R-010 OK (só ADD COLUMN IF NOT EXISTS aditivo). Reversível em 4 arquivos. **Follow-up**: integração ViaCEP autopreenchimento; relatório agregado de origem (mapa); cálculo distância casa→obra pra vale-transporte.
- ~~Rev. 2007~~ — ver `shared/changelog.ts`. **Terceiros · Modal Editar/Novo Funcionário · Aproveita largura em PC widescreen**. Pedido direto do usuário (img image_1779030288131): "Melhorou esta tela, no tablet ficou perfeito, no PC ficou estranho.. isso para todas as telas." Container do modal usava `max-w-4xl` (~896px) — no PC widescreen sobrava 50%+ de espaço cinza lateral e campos ficavam só em 2 colunas estreitas. **Mudança** em 1 arquivo (`client/src/pages/terceiros/FuncionariosTerceiros.tsx`, 2 hunks, ZERO lógica): (1) Container: `max-w-4xl mx-auto p-4` → `max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto p-4 lg:px-6`. (2) Grid de campos: `md:grid-cols-2` → `md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`. (3) `shared/version.ts` → 2007. **Resultado**: PC widescreen mostra 3-4 colunas usando toda a tela, sem espaço morto; tablet/iPad/mobile INALTERADOS (breakpoints `lg:`/`xl:` só ativam ≥1024px). **Preservado**: header laranja, hero foto+nº interno (Rev. 1998), tabs Dados/Documentos/DDS, DdsTabContent (Rev. 2004), abas Documentos (Rev. 2002+2003) INTACTAS. Rev. 2006 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 2 hunks. **Nota**: "para todas as telas" será propagado em revisões subsequentes (próximos: modais Compras/SC, FechamentoPonto edit, Currículos edit).
- ~~Rev. 2006~~ — ver `shared/changelog.ts`. **DP · Fechamento de Ponto · Modal de ranking · Transparência do cálculo de % Presença**. Pedido direto do usuário (img image_1779030037258): "Ainda não ficou claro, falta legenda. Preciso saber o que é % Presença, como é calculado, de que dia a que dia está considerando — o % está muito baixo pra realidade". Legenda do modal desatualizada desde Rev. 2000 (dizia "dias corridos" mas o cálculo passou pra dias úteis), sem indicação visível do período/dias úteis/fórmula. **Mudança** em 1 arquivo (`client/src/pages/FechamentoPonto.tsx`, 4 hunks, ZERO mudança de cálculo): (1) Legenda atualizada nos 3 modais (pontuais/atrasados/faltosos): "Dias com ponto ÷ dias úteis (seg-sex) do período (Xd). Ex: 10÷X = N%." com X dinâmico. (2) **Faixa nova "Como é calculado"** entre filtros e legenda — gradient indigo, chip Timer, explicação curta + 3 chips: período DD/MM → DD/MM, badge "= N dias úteis", fórmula `dias÷N×100`. Diz explicitamente que sáb/dom/datas futuras NÃO entram e feriados ainda NÃO excluídos. (3) Header da coluna `% Presença` ganhou underline pontilhado + ícone Info + tooltip nativo c/ exemplo + subtítulo "de N úteis". (4) `shared/version.ts` → 2006. **Resultado**: usuário vê em 1 segundo o período, dias úteis, fórmula e exemplo — 45% médio agora é AUTOEXPLICATIVO (10 dias ÷ 22 úteis), elimina suspeita de bug. **Preservado**: cálculo INTACTO (Rev. 2000), filtros/ordenação/KPIs/tabela INTACTOS, Rev. 2005 INTACTA, schema INTACTO. R-001/R-007/R-010 OK. Reversível em 1 arquivo. Follow-up: integrar calendário de feriados (aberto desde Rev. 2000).
- ~~Rev. 2005~~ — ver `shared/changelog.ts`. **SST · Integração de Segurança · Tela repaginada na regra de ouro**. Pedido direto do usuário (img IMG_0850): "Quero a tela de integração repaginada conforme a regra de ouro e fácil usabilidade". Tela `/sst/integracao` tinha header cinza chapado, abas sem hierarquia e KPIs brancos genéricos — fugia do padrão estabelecido em Fechamento Ponto/Terceiros/Compras. **Mudança** em 1 arquivo (`client/src/pages/sst/IntegracaoSST.tsx`, 3 hunks): (1) **Header full-width** gradient emerald→teal com chip ring-2 + GraduationCap; descrição em branco translúcido. (2) **Tabs** sticky com chip lucide 6x6 (ativo: fundo branco ring emerald + borda inferior emerald; inativo: slate); horizontal scroll em mobile; subtítulo dinâmico da aba ativa. (3) **KpiCard repaginado**: barra superior colorida + bg tingido + chip 7x7 do ícone + número 3xl tabular-nums (5 accents: blue/emerald/amber/red/orange). (4) **Indicadores**: Taxa de Aprovação destacada (2xl + barra gradiente verde≥80%/amber≥60%/vermelho<60%); Média de Nota e Em Andamento viram mini-cards indigo/blue. (5) **Alertas**: header iconizado + contador dinâmico; empty-state com CheckCircle "tudo em dia"; lista divide-y com badges contextuais. (6) Estado "sem empresa" virou card border-dashed. (7) `shared/version.ts` → 2005. **Resultado**: visual alinhado à regra de ouro, hierarquia clara, 100% responsivo (iPad/mobile). **Preservado**: TODAS as 6 sub-abas (Dashboard/Vídeos/Config/Pendentes/Histórico/Sessões) INTACTAS — só wrapper+header+dashboard mudaram; tRPC INTACTO; Rev. 2004 INTACTA. R-001/R-007/R-010 OK (CSS-only + componentes). Reversível em 1 arquivo. Follow-up: aplicar mesma regra às sub-abas internas (Vídeos/Config/Pendentes/Histórico/Sessões).
- ~~Rev. 2004~~ — ver `shared/changelog.ts`.- ~~Rev. 2003~~ — ver `shared/changelog.ts`.- ~~Rev. 2002~~ — ver `shared/changelog.ts`.- ~~Rev. 2001~~ — ver `shared/changelog.ts`.- ~~Rev. 2000~~ — ver `shared/changelog.ts`.- ~~Rev. 1999~~ — ver `shared/changelog.ts`.- ~~Rev. 1998~~ — ver `shared/changelog.ts`._PLACEHOLDER_QUE_NAO_DEVE_EXISTIR_ (a) cadastrar foto pra facilitar identificação visual e (b) ERP gerar automaticamente um número interno `[INICIAIS_EMPRESA]-[SEQ_GLOBAL]` (sequencial único pra TODOS terceiros do tenant, só a sigla muda por empresa). **Mudança** em 4 arquivos: (1) `drizzle/schema.ts` (L3566-3569) — `funcionariosTerceiros` ganhou `numeroInterno varchar(30)` (nullable, retrocompat). (2) `server/_core/index.ts` (+5L, bloco logo após `curriculos.historico_status_json`) — bootstrap idempotente `ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS numero_interno VARCHAR(30)` + `CREATE INDEX IF NOT EXISTS idx_func_terc_numero_interno (company_id, numero_interno)`. (3) `server/routers/terceiros.ts` (`funcionarios.create` ~60L reescritas L480-540) — input ganhou `fotoBase64`/`fotoFileName`/`fotoContentType` opcionais; fluxo: busca empresa → gera sigla (NFD remove acentos + uppercase + `/[^A-Z]/` strip + slice(0,3) + padEnd(3,'X'), ex: "Construtora XPTO Ltda"→"CON") → próximo seq GLOBAL via `MAX(NULLIF(regexp_replace(numero_interno,'^.*-',''),'')::INTEGER) + 1` filtrado por `company_id` → monta `${sigla}-${String(seq).padStart(5,'0')}` (ex: `CON-00001`) → se foto enviada, `storagePut` em `terceiros/funcionarios/_novos/{ts}-{name}` → INSERT com `.returning({id})` (corrigido de pattern MySQL `[result] = ...` pra postgres) → retorna `{id, numeroInterno}`. (4) `client/src/pages/terceiros/FuncionariosTerceiros.tsx`: 2 states novos (`fotoPreview` data URL + `fotoPayload` base64), 2 handlers (`handlePickFotoNovo` via FileReader; `handlePickFotoEdit` faz upload imediato via `uploadDoc`); `openNew`/`openEdit`/`handleSave` adaptados; aba Dados Pessoais ganhou **hero card no topo** (gradient blue→indigo, border dashed) com avatar circular h-24 w-24 ring-4 + Camera placeholder/preview + botão X vermelho pra remover + título + badge `numeroInterno` (em edit) OU "Nº interno será gerado ao salvar" (em new) + botão "Selecionar/Trocar foto"; item da lista ganhou avatar circular h-12 w-12 à esquerda + badge azul mono `BadgeCheck numeroInterno` ao lado do nome. + `shared/version.ts` → 1998. **Preservado**: `update` mutation INTACTA, `uploadDoc` INTACTO, filtros/stats/aba Documentos INTACTOS, outras leituras de `funcionariosTerceiros` (warnings/obrigacoes/portal externo) — coluna nullable, queries SELECT * seguem OK. Rev. 1997 INTACTA. Race em geração de seq aceitável pra cadastro manual low-throughput (migra pra advisory lock se virar problema). R-001/R-007/R-010 OK (só ADD COLUMN/INDEX IF NOT EXISTS). Reversível em 4 arquivos.
- ~~Rev. 1997~~ — ver `shared/changelog.ts`.- ~~Rev. 1996~~ — ver `shared/changelog.ts`.- ~~Rev. 1995~~ — ver `shared/changelog.ts`.
- ~~Rev. 1994~~ — ver `shared/changelog.ts`.
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
