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

- **Rev. 4011** — **ALMOXARIFADO: OS 3 ITENS PENDENTES DA AUDITORIA "CORREÇÕES E MELHORIAS ERP - ALMOXARIFADO" (12/15 já implementados em revisões anteriores).** Usuário confirmou "Sim" para os 3 restantes: (1) campo `especificacao` (text, nullable) separado do `nome` em `almoxarifado_itens` — plugado em criação/edição (`compras.ts`) e no formulário + listagens de `client/src/pages/almoxarifado/index.tsx`, opcional, sem migração retroativa de dados já misturados; (2) assinatura digital OPCIONAL na devolução de ferramenta emprestada ("🔧 Ferramentas em Aberto") via modal com `SignaturePad` reusado, nova coluna `assinatura_devolucao_url` em `warehouse_loans`, nunca bloqueia a devolução; (3) rename "Devolução de Ferramentas" — investigado, tela já não existe mais com esse título (já é "🔧 Ferramentas em Aberto"), nenhuma ação necessária. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4010** — **ALMOXARIFADO: PADRONIZAÇÃO AUTOMÁTICA DO NOME DE MATERIAL (1ª LETRA MAIÚSCULA + RESTANTE MINÚSCULO).** Usuário: "crie uma rotina de padronizar todos os nomes... independente se o usuário digitar caixa alta, você sempre padroniza". Implementado como função SQL única `padronizar_nome_material(text)` (trim + colapsa espaços + só 1ª letra maiúscula, resto minúsculo), reusada em TODOS os pontos de escrita: `criarItemAlmoxarifadoComCodigo` (criação manual/import Mas Controle/recebimento de OC), `atualizarItem` (edição manual) e os 3 pontos de INSERT de `almoxEquipamentoSync.ts` (equipamentos locados/próprios). Backfill rodou nos 2.638 itens existentes — 100% padronizados, 0 exceções. Diferente das Rev. 4008/4009, essa operação só troca caixa/espaçamento (conteúdo e ordem das palavras preservados 1:1), risco de perda mínimo. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4009** — **ALMOXARIFADO: CORREÇÃO DE BUG CRÍTICO DA REV. 4008 — FUSÃO POR "NOME IDÊNTICO" ATINGIU ITENS QUE ERAM 1-REGISTRO-POR-UNIDADE-FÍSICA DE EQUIPAMENTO.** ~806 itens vinculados a equipamento (locado/próprio) foram mesclados/apagados indevidamente; recriados via auto-recuperação + códigos `MAT-1837`...`MAT-2636` reatribuídos; os 3 INSERTs de `almoxEquipamentoSync.ts` agora sempre geram código. **Perda irreversível** do histórico granular de movimentação desse subconjunto (~806 itens); estado final funcionalmente correto (2.638 itens, 0 duplicados, 0 órfãos).

- **Rev. 4008** — **ALMOXARIFADO: UNIFICAÇÃO DOS 985 ITENS COM NOME IDÊNTICO (165 GRUPOS), MAIS RENUMERAÇÃO SEQUENCIAL.** Usuário, ao ver a lista de materiais: "se tem o mesmo nome, pode unificar pra não ter dúvidas". Os 165 grupos (nome idêntico após normalizar só espaços) tinham 100% `tipo_controle='estoque'` — critério que se revelou insuficiente (ver Rev. 4009: não excluiu itens vinculados a equipamento). Backup completo antes da operação (posteriormente limpo do ambiente); migração em 1 transação: soma de `quantidade_atual` no item mais antigo de cada grupo (canônico), histórico repontado em 7 tabelas antes de apagar os 985 duplicados. Resultado imediato: 2.823 → 1.838 itens — corrigido na Rev. 4009 após descoberta do efeito colateral.

- **Rev. 4007** — **ALMOXARIFADO: FORMATO DO CÓDIGO DE MATERIAL AJUSTADO PARA `MAT-NNNN`.** Usuário pediu logo após a Rev. 4006: "MAT-0001 quero neste formato". Re-migrados os mesmos 2.823 materiais no Neon de `MATNNNNNN` para `MAT-0001`... Helper `criarItemAlmoxarifadoComCodigo` ajustado. ZERO DELETE · ZERO ALTER.

- **Rev. 4006** — **ALMOXARIFADO: PACOTE DE 6 CORREÇÕES E MELHORIAS (usuário: "quero que você faça tudo").** Código automático de material (`criarItemAlmoxarifadoComCodigo`, `pg_advisory_xact_lock`) plugado nos 5 pontos que criam material novo; matching de duplicata NF/OC melhorado; Saída de Insumos aceita busca de terceiro; Fechar Dia tratado; bug "Devolver Todas" corrigido; Inventário ganhou "Corrigir" + Empréstimo ganhou observação. ZERO DELETE · ZERO ALTER destrutivo (na época).

- **Rev. 4004** — COMPRAS/COTAÇÕES: PDF e Excel do Mapa de Cotação não traziam a linha de total por fornecedor; `gerarPdfCotacao`/`exportarExcelCotacao` passaram a reaproveitar `getFornTotal`/`metaGrandTotal`/`qtdGrandTotal` pra gerar a linha de total. ZERO DELETE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4002 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
