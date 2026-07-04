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

- **Rev. 4019** — **COMPRAS: SUGESTÃO AUTOMÁTICA DE CARTÃO DE CRÉDITO NA COTAÇÃO/OC + VÍNCULO AUTOMÁTICO OC↔FATURA DO CARTÃO PARA CONCILIAÇÃO.** Novo campo `escopo` em `financial_cartoes` ("fc" = titularidade da empresa | "local" = obra/particular) — só cartões "fc" entram na sugestão de Compras. `cartao.resumoParaCompra` ranqueia cartões elegíveis por ciclo de fatura + limite disponível estimado; `CartaoDisponivelCard` exibido em Cotação/OC ao selecionar "Cartão" (sugestivo, usuário pode trocar). Campo `cartaoId` em `compras_cotacoes`/`compras_ordens`/`compras_cotacao_fornecedores`, herdado automaticamente Cotação→OC. Vínculo automático: `compra_oc_id`/`compra_oc_numero` em `financial_cartao_itens`, casado por valor+janela de data na importação da fatura (`importarConfirmar`); tela "Financeiro > Cartão de Crédito" ganhou seletor de Escopo no cadastro + coluna "OC vinculada" na lista de itens. "SOS" do pedido original confirmado como typo de "OS ou OC". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4018** — **COMPRAS: BUG DE CASA DECIMAL "MUDANDO SOZINHA" NA QUANTIDADE — CAUSA-RAIZ E FIX (Item 6) + FECHAMENTO DOS ITENS 1 (BDI) E 4 (UPLOAD IA NO CADASTRO DE ITEM) DOS ~20 AJUSTES DO DOCX.** Item 6: causa-raiz achada por inspeção (padrão bate com floating point JS) — `Solicitacoes.tsx` consolidava itens duplicados da SC somando quantidade em ponto flutuante puro (`String(parseFloat(a)+parseFloat(b))`), gerando artefatos tipo `0.30000000000000004`; corrigido nos 2 pontos de soma com `Math.round(x*1000)/1000` (precisão `numeric(14,3)` do banco). Cotação/OC usam `type="number"` nativo e não somam quantidade — sem risco, sem alteração. Item 1: usuário confirmou BDI ok, fechado sem mudança de código. Item 4: confirmado que "+ Novo Item" já tem upload de foto com IA (`handleFotoChange`→`sugerirCadastroItem`), cobrindo o pedido. Restam pendentes 21/22 itens do docx — só o item 11 (upload de documento genérico pra criar OC, feature maior, sem prioridade ativa). ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4017** — **COMPRAS: RASTREIO INVERSO COTAÇÃO→OC, DUPLICAR OC E RESUMO DE CARTÃO DE CRÉDITO DISPONÍVEL NA COTAÇÃO/OC (Itens 8, 10 e 12 dos ~20 ajustes do docx).** Item 8: `getCotacao` retorna `ordensVinculadas` (OCs geradas via `comprasOrdens.cotacaoId`), campo "OC Gerada" clicável na tela de Cotação. Item 10: nova mutation `duplicarOrdem` (espelha `duplicarSolicitacao`), copia itens/fornecedor/pagamento e reseta datas/histórico/NF/anexos/status; botão "Duplicar OC" em Ordens.tsx. Item 12: novo procedure `cartao.resumoParaCompra` (limite disponível estimado = limite − soma de faturas com `total > pagamentos`, aproximação transparente por falta de status pago/aberto explícito) + componente `CartaoDisponivelCard` exibido em Cotação/OC ao selecionar "Cartão" como forma de pagamento. Itens 1 (BDI Hotel do Papa), 6 (decimal) e 21 (campos obrigatórios) ficaram de fora — dependem de decisão de negócio/reprodução. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4016** — **COMPRAS: LOTE FINAL DOS ~20 AJUSTES DO DOCX (Itens 7, 9, 13, 14, 17, 19, 20, 21a, 22) + CORREÇÃO DE BUG DE AUTORIZAÇÃO NA "TRANSFERÊNCIA EM LOTE" DO ALMOXARIFADO (Item 5, reaberto).** Causa-raiz do Item 5: `createTransferenciaOrigemDestino`/`createTransferenciaLote` usavam guard `userCanAccessObra` em vez de `userCanAccessObraAlmox`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4015** — **COMPRAS: ERRO AO SELECIONAR MATERIAL DO ESTOQUE NA COTAÇÃO — MATCH RESTRITO A "CENTRAL + OBRA DE DESTINO" IGNORAVA SALDO EM OUTRA OBRA (Item 3 dos ~20 ajustes do docx).** `adicionarEstoqueAoMapa`/`criarOrdemDeCotacao` passam a buscar company-wide quando a obra de origem não é explícita. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4014** — **COMPRAS: PERMITIR QUANTIDADE PARCIAL NA "DIVIDIR COTAÇÃO" (Item 2 dos ~20 ajustes do docx).** `dividirCotacao` só movia o item INTEIRO para a nova cotação; agora aceita `itens: {id, quantidade}[]` (quantidade legado `itemIds` continua funcionando = 100%), com split proporcional de respostas de fornecedor já lançadas. Validado via HTTP real. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4013** — **COMPRAS: REGIME DE CUSTO/RISCO (BDI) NA EQUALIZAÇÃO DE COTAÇÃO PARA OBRAS "FORNECIMENTO DE MDO" (Item 1 dos ~20 ajustes do docx).** Seletor de 3 opções por item (cliente paga / empresa sem risco / empresa com risco) via novo `regime_custo` em `compras_cotacoes`/`compras_ordens`; sem-risco/cliente pula travamento por estouro. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4010 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
