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

- **Rev. 2409** — **IA/PERFORMANCE · Desligado o "modo thinking" do Gemini 2.5 Flash em `invokeGeminiVision` — corta 50-70% do tempo no parse de PDF de locação (combate o "trava em 99%").** Pedido user (25/05/2026): "ELE DEMORA MUITO QUANDO ESTÁ NO 99% NÃO TEM JEITO DE MELHORAR A VELOCIDADE?" — screenshot mostrava 2:02 parado em 99% num JALVES de 263 KB. Causa raiz: `gemini-2.5-flash` por default ativa "extended thinking" (tokens de raciocínio invisíveis antes da resposta), 30-90s puro overhead pra tarefas de extração JSON estruturada. Fix: `thinkingConfig: { thinkingBudget: 0 }` em `generationConfig` (server/_core/llm.ts). Novo parâmetro `thinking?: "off" | "auto"` (default "off") — callers que precisem de reasoning passam "auto". Impacto extrapolado: PDF pequeno 25-40s→8-15s, médio 60-90s→20-35s, grande 100-130s→35-60s. Com a fila multi-PDF da Rev. 2407, 8 PDFs que levavam 8min agora levam ~3min. Zero impacto em qualidade (OCR de layout repetitivo não precisa raciocínio multi-passo). R-001/R-007/R-010 OK. Detalhe completo + alternativas descartadas (flash-lite, streaming SSE, split server-side): `shared/changelog.ts`.
- **Rev. 2408** — **EQUIPAMENTOS LOCADOS/UX · Filtro por LOCADORA (fornecedor) na toolbar da Visão Geral.** Pedido user (25/05/2026, sequência da Rev. 2407): "preciso poder filtrar por empresa de locação tbm, pra não dar erro. Cadastro de empresa de locação é o mesmo cadastro de Fornecedor / Empresa Terceira, só nome diferente." 100% client-side em `client/src/pages/equipamentos/Locados.tsx`: novo state `filtroFornecedor`, useMemo `dataPorFornecedor` inserido entre `dataPorCat` e `data` (pipeline status→obra→categoria→fornecedor→vencimento), `fornecedoresComItens` deriva a lista DOS PRÓPRIOS equipamentos (não do cadastro completo de 1190 fornecedores — assim só aparecem locadoras realmente em uso, mesmo pattern do filtro de categoria). Comparação por nome normalizado (`toUpperCase().trim()`) pra resistir a "Jalves"/"JALVES". UI: grid 2→3 cols, 3º select amber com ícone Truck, chip amber nos filtros ativos, "limpar tudo" reseta também. Zero backend, zero migration, zero tabela nova. R-001/R-007/R-010 OK. Detalhe completo + follow-up (unificar fornecedorNome em FK): `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2407** — EQUIPAMENTOS LOCADOS/IMPORT · Multi-PDF no modal "Importar contratos de locação (PDF · IA)". Fila client-side (`importFilas`/`Ref`), `handlePdfPickMultiple({append})`, poll done acumula preview e auto-avança, branches error/expired/start-error também avançam. `<input multiple>`, badge X/N, "+ Adicionar PDFs", lista da fila. Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2406** — ALMOXARIFADO/UX · Filtro por vínculo Equipamento (Próprio/Locado/Qualquer/Nenhum) nas 2 barras de filtro da Visão Geral. Novo state `filtroEquip` (5 valores) em `almoxarifado/index.tsx`, filtro aplicado em `lista` e `consListFinal`, 2 `<select>` indigo idênticos. Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2405** — ALMOXARIFADO ← EQUIPAMENTOS · Sync reverso (vínculo bidirecional). Novo `server/lib/almoxEquipamentoSync.ts` com `ensureAlmoxItemForEquipamento` (idempotente, INSERT/UPDATE conforme transferência) + `backfillAlmoxFromEquipamentos` (SQL bulk no startup). Hooks `locadoCriar`/`locadoAtualizar`. Zero migration. Ver `shared/changelog.ts`.
- **Rev. 2404** — ALMOXARIFADO/EQUIPAMENTOS · Marcar item do almox como Equipamento Próprio/Locado direto do card. 3 colunas novas em `almoxarifado_itens` (`equipamento_vinculado_tipo/_id/_em` via ADD COLUMN IF NOT EXISTS). Novo `ModalVincularEquipamento.tsx` (toggle Próprio indigo / Locado amber) reaproveita nome→descrição, categoria, foto e valor unitário. Card ganha badge + botão `<Wrench/>` indigo entre Editar e Histórico. Ver `shared/changelog.ts`.
- **Rev. 2403** — CONFIGURAÇÕES/UX · Abas viraram cards coloridos (1 cor por módulo) num grid responsivo 2/3/4/5/7 cols. `allTabs` ganhou campo `color` (14 cores); mapa estático `TAB_COLOR_STYLES` em `Configuracoes.tsx` L89-105 contorna o Tailwind JIT (não pega classes interpoladas). Card ativo: gradient `from-{c}-500 to-{c}-600` + ring + shadow + chip translúcido. Ver `shared/changelog.ts`.

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
