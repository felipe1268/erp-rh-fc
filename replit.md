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

- **Rev. 4015** — **COMPRAS: ERRO AO SELECIONAR MATERIAL DO ESTOQUE NA COTAÇÃO — MATCH RESTRITO A "CENTRAL + OBRA DE DESTINO" IGNORAVA SALDO EM OUTRA OBRA (Item 3 dos ~20 ajustes do docx).** Reprodução: SC-2026-0163, item só tinha saldo na obra 90005 mas a cotação era da obra 90004 — `adicionarEstoqueAoMapa` e o pré-check de `criarOrdemDeCotacao` filtravam o almoxarifado a `obraId IS NULL OR = destino`, mesmo o modal "Selecionar do Estoque" (Rev. 2470) já listando a empresa inteira; user escolhia o item explicitamente mas o auto-match não achava de novo → gravava quantidade=0/preço=0, e a OC travava com falso "sem correspondência"/"saldo insuficiente". Fix: `adicionarEstoqueAoMapa` remove o filtro de obra quando há `almoxItemIds` (seleção explícita — whitelist já é confiável); `criarOrdemDeCotacao` passa a buscar company-wide quando `obraOrigemId` não foi escolhido explicitamente (antes só central+destino); `obraOrigemId` explícito continua restringindo. Validado via HTTP real (SC/cotação/item descartáveis, cenário reproduzido, match correto obtido, tudo revertido); dado real de SC-2026-0163 também corrigido (quantidade 0→1, preço 0→25.40). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4014** — **COMPRAS: PERMITIR QUANTIDADE PARCIAL NA "DIVIDIR COTAÇÃO" (Item 2 dos ~20 ajustes do docx).** `dividirCotacao` só movia o item INTEIRO para a nova cotação; agora aceita `itens: {id, quantidade}[]` (quantidade legado `itemIds` continua funcionando = 100%). Itens com quantidade movida < total viram `partialMoveItems`: cria item NOVO na cotação destino com a fração, reduz o item original, e divide PROPORCIONALMENTE cada resposta de fornecedor já lançada (senão o orçamento por fornecedor ficaria incoerente entre as 2 cotações). Front-end: `dividirSel` virou `Map<itemId, quantidade>` (era `Set`), com input numérico + badge "parcial" no modal "Dividir Cotação" de `Cotacoes.tsx`. Validado via HTTP real (usuário admin_master temporário) na cotação 616: split 10/33un + 1 item inteiro, conferido item/respostas/fornecedores proporcionais nas 2 pontas, revertido sem rastro. ZERO DELETE · ZERO ALTER destrutivo (reusa schema existente).

### 5 one-liners

- **Rev. 4013** — **COMPRAS: REGIME DE CUSTO/RISCO (BDI) NA EQUALIZAÇÃO DE COTAÇÃO PARA OBRAS "FORNECIMENTO DE MDO" (Item 1 dos ~20 ajustes do docx).** Seletor de 3 opções por item (cliente paga / empresa sem risco / empresa com risco) via novo `regime_custo` em `compras_cotacoes`/`compras_ordens`; sem-risco/cliente pula travamento por estouro. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4012** — **ALMOXARIFADO: (1) 2 ITENS COM EMPRESA ERRADA CORRIGIDOS, (2) 11 ITENS DUPLICADOS ("Bacia com Caixa Acoplada Ravena") UNIFICADOS EM 1, (3) FORMATO DE QUANTIDADE CORRIGIDO PARA PADRÃO BRASILEIRO.** Backup completo em tabelas `*_backup_rev4012` antes de qualquer escrita. ZERO DELETE fora do grupo auditado · ZERO ALTER destrutivo.

- **Rev. 4011** — **ALMOXARIFADO: OS 3 ITENS PENDENTES DA AUDITORIA "CORREÇÕES E MELHORIAS ERP - ALMOXARIFADO" (12/15 já implementados em revisões anteriores).** Usuário confirmou "Sim" para os 3 restantes: campo `especificacao` separado do `nome`; assinatura digital OPCIONAL na devolução de ferramenta emprestada; rename "Devolução de Ferramentas" já não se aplicava. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4010** — **ALMOXARIFADO: PADRONIZAÇÃO AUTOMÁTICA DO NOME DE MATERIAL (1ª LETRA MAIÚSCULA + RESTANTE MINÚSCULO).** Função SQL única `padronizar_nome_material(text)` reusada em todos os pontos de escrita (criação manual/import/OC/sync de equipamento). Backfill nos 2.638 itens existentes — 100% padronizados. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4008** — **ALMOXARIFADO: UNIFICAÇÃO DOS 985 ITENS COM NOME IDÊNTICO (165 GRUPOS), MAIS RENUMERAÇÃO SEQUENCIAL.** Usuário, ao ver a lista de materiais: "se tem o mesmo nome, pode unificar pra não ter dúvidas". Os 165 grupos (nome idêntico após normalizar só espaços) tinham 100% `tipo_controle='estoque'` — critério que se revelou insuficiente (ver Rev. 4009: não excluiu itens vinculados a equipamento). Backup completo antes da operação (posteriormente limpo do ambiente); migração em 1 transação: soma de `quantidade_atual` no item mais antigo de cada grupo (canônico), histórico repontado em 7 tabelas antes de apagar os 985 duplicados. Resultado imediato: 2.823 → 1.838 itens — corrigido na Rev. 4009 após descoberta do efeito colateral.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4009 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
