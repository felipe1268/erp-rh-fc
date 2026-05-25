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

- **Rev. 2413** — **EQUIPAMENTOS LOCADOS/IMPORT · Fornecedor (locadora) agora é OBRIGATÓRIO antes de cadastrar itens via PDF (IA).** Pedido user (25/05/2026): "quero que a indicação do fornecedor seja obrigatoria, antes de cadastrar os itens, para não ter erro." Card amber "Fornecedor (locadora) deste PDF" existe desde Rev. 2358 mas era opcional — cabeçalho do PDF traz LOCATÁRIO (FC Engenharia), não LOCADORA, e o user esquecia de preencher → ERP criava itens órfãos quebrando filtro por fornecedor (Rev. 2408) + agregados financeiros + rastreabilidade. Fix em `Locados.tsx`: (1) `confirmarImport()` ganhou 2º guard após o de obra — conta `c.fornecedorNome` vazios/whitespace e bloqueia com popup listando 8 primeiros números de contrato pendentes + instrução; (2) Botão "Confirmar e cadastrar" incorpora `semForn` em `bloqueado` (prioridade visual: semObra > semForn > OK) — vermelho com label "⛔ N sem fornecedor — indique antes" e tooltip. Reusa toda a infra existente do card amber + "Aplicar a todos". Mesma simetria do bloqueio de obra (Rev. 2353) — user já entende o pattern. Zero backend, zero migration. R-001/R-007/R-010 OK. Detalhe completo: `shared/changelog.ts`.
- **Rev. 2412** — **AVALIAÇÃO INTELIGENTE/UX · Modal "Score Detalhado" modernizado seguindo identidade FC (faixa azul #1B2A4A, hero card, 4 sub-cards coloridos por dimensão, dados brutos em linhas legíveis).** Pedido user (25/05/2026): "melhore este layout, deixando mais moderno e conforme as nossas regras de ouro." Mudanças em `DashAvaliacaoFuncionarios.tsx`: (1) Header com gradient azul FC `#1B2A4A→#2E4373`, ícone Award em quadrado de vidro, badge "últ. Nm" no canto; (2) Hero card com gradient da cor da classificação + círculo decorativo opacity-10 + ScoreCircle 96→120px; (3) 4 sub-cards coloridos POR DIMENSÃO (frequência=blue, saúde=rose, disciplina=violet, segurança=emerald) com ring + barra de progresso — `SUBSCORE_COLOR_MAP` estático contorna Tailwind JIT (mesmo pattern Rev. 2403); (4) Dados brutos viraram tabela `DadoBrutoRow` com ícone colorido + bullet "·" no lugar do "→ ... ., ... ." confuso; (5) Footer com disclaimer LGPD/CLT + botão Fechar primary azul FC. `DialogContent` `max-w-2xl→3xl` + `p-0 overflow-hidden gap-0` pra faixa encostar nas bordas. Zero backend. R-001/R-007/R-010 OK. Detalhe completo: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2411** — EQUIPAMENTOS LOCADOS ↔ ALMOXARIFADO/BUGFIX · Devolução/exclusão de locado agora propaga pro almox + 3 novos statuses (aguardando_chegada/quebrado/solicitado_substituicao). 3 helpers em `server/lib/almoxEquipamentoSync.ts` (single + bulk + purge startup). `locadoDevolver` calcula `tempoNaObraDias` no evento. STATUS_* expandidos 5→8 pills com cyan/rose/fuchsia. Ver `shared/changelog.ts`.
- **Rev. 2410** — AVALIAÇÃO INTELIGENTE/BUGFIX · `getDb()` chamado sem `await` em `carregarInputs` (server/routers/avaliacaoFuncionarios.ts L74). `db` virava Promise, quebrava "db.select is not a function" e zerava a tela. Fix 1 caractere: `await getDb()`. Único call site síncrono no server/. Ver `shared/changelog.ts`.
- **Rev. 2409** — IA/PERFORMANCE · Desligado "modo thinking" do Gemini 2.5 Flash em `invokeGeminiVision` (server/_core/llm.ts). `thinkingConfig.thinkingBudget=0` + param `thinking?:"off"|"auto"` default "off" + guarda regex `gemini-2.5+`. Combate "trava em 99%": PDF pequeno 25-40s→8-15s. Ver `shared/changelog.ts`.
- **Rev. 2408** — EQUIPAMENTOS LOCADOS/UX · Filtro por LOCADORA (fornecedor) na toolbar da Visão Geral. State `filtroFornecedor` + useMemo `dataPorFornecedor` (pipeline status→obra→cat→**fornecedor**→venc), `fornecedoresComItens` derivado dos próprios equipamentos (não dos 1190 cadastrados), comparação case-insensitive. UI: grid 2→3 cols, select amber Truck, chip amber. Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2407** — EQUIPAMENTOS LOCADOS/IMPORT · Multi-PDF no modal "Importar contratos de locação (PDF · IA)". Fila client-side (`importFilas`/`Ref`), `handlePdfPickMultiple({append})`, poll done acumula preview e auto-avança, branches error/expired/start-error também avançam. `<input multiple>`, badge X/N, "+ Adicionar PDFs", lista da fila. Zero backend. Ver `shared/changelog.ts`.

### REGRA DE OURO — Cabeçalho de documentos institucionais FC (Rev. 2106+)

Todo documento oficial FC (contrato, aviso prévio, termo de rescisão, comunicado interno, carta MDO, advertência etc.) DEVE usar este cabeçalho HTML:

```
[logo centralizado ~88px — fallback ${window.location.origin}/logo-fc.jpg]
[RAZÃO SOCIAL caixa alta 16pt bold centralizado]
[CNPJ: xx.xxx.xxx/xxxx-xx — 9.5pt centralizado cinza]
[ENDEREÇO COMPLETO uppercase 9pt centralizado cinza claro]
[faixa azul #1B2A4A full-width, border branco 2px, padding 14px,
 TÍTULO DO DOC caixa alta 13pt letter-spacing 3px branco]
[Nº NNN/AAAA (esq) ───── Data de Emissão: DD/MM/AAAA (dir)]
```

Regras técnicas obrigatórias:
- **Inline styles** em TODOS elementos críticos (DOMPurify pode descartar `<style>` externo).
- `<style>` interno SEMPRE dentro do `<body>` (não no `<head>`).
- `print-color-adjust: exact` inline na faixa azul (cores de fundo no print).
- JAMAIS usar `onerror=`, `onload=` ou qualquer handler `on*` (filtro XSS do `signatures.create`).
- Logo SEMPRE com fallback `${window.location.origin}/logo-fc.jpg`.
- Corpo: `text-align:justify; hyphens:auto`, Times serif 11.5pt.
- Cláusulas com `border-left:3px solid #1B2A4A; padding-left:8px` no título.

> Revisões anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
