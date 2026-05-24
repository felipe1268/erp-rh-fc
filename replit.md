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

- **Rev. 2363** — **UX/FILTRO · Cards KPI da aba "Equip. Locados" do Dashboard Almoxarifado ficaram CLICÁVEIS — clique aplica filtro contextual à tabela abaixo (troca fonte + título + colunas).** Pedido user (24/05/2026, IMG_1160): "Quero cada card responsivo para que quando clicar o filtro aconteça". **Problema**: os 8 cards (Ativos·Custo/mês·Vencendo 30d·Atrasados·Devolvidos·Sem obra·Fornecedores·Obras atendidas) eram só leitura — pra ver "quais ativos não têm obra?" o engenheiro tinha que ir até `/equipamentos/locados` e filtrar lá. **Fix em 1 arquivo** (`client/src/pages/dashboards/DashAlmoxarifadoEquipamentos.tsx`): (1) State novo `filtroLocCard: FiltroLocCard | null` (8 valores). (2) Todos os 8 `DashKpi` ganharam `onClick` + `active` — toggle real (clique no mesmo limpa). (3) Painel abaixo virou contextual: pra 6 dos cards (ativos·custoMes·vencendo30·atrasados·devolvidos·semObra) mostra tabela de 5 cols (Equipamento·Fornecedor·Obra·Fim·R$/mês) com fonte/ordem que muda por `cfgMap` (atrasados em vermelho, custoMes ordenado por valor desc, vencendo30/atrasados por data fim asc); pra fornecedores/obras vira tabela agregada (Nome·Unidades·Custo·% do total) reusando `locAgg.porFornecedor`/`porObra`. (4) Chip "Limpar filtro ×" + contador "(N itens, exibindo 25)" no header. (5) Heurística "atrasado" client-side (`status === 'atrasado'` OU `em_uso` + fim < hoje) pra não depender do StatusSync horário. **Decisões**: toggle real em todos os cards (consistente com Rev. 2361); fornecedores/obras viram agregado em vez de lista item-a-item; sem filtro mantém comportamento "vencendo 30d" original (não regride). **R-001/R-007/R-010**: N/A — 100% client-side, reusa `locadosQ.data` em cache.
- **Rev. 2362** — **FEATURE/IA · Nova análise "Comprar vs Continuar Alugando" em /equipamentos/locados — IA estima preço de mercado de cada descrição e calcula payback + recomendação.** Pedido user (24/05/2026, IMG_1158+1159): "Análise nos valores dos equipamentos locados x o preço do produto na internet, pra analisar se vamos comprar ou não. Não faz sentido ter estes produtos locados se é mais fácil comprar". **Problema**: 1.218 equipamentos em locação gastando ~R$ 18,2k/mês, mas zero ferramenta pra decidir "isso vale a pena alugar ou já era pra ter comprado?" — cotar manual 50-80 SKUs é inviável. **Fix em 2 arquivos**: (1) Backend — nova mutation `equipamentos.locadosAnalisarCompraVsAluguel` (tenant guard + READ-ONLY): agrega `em_uso` por descrição (SUM/AVG valorMensal, COUNT qtd), ordena por gasto desc, cap 80, chama `invokeLLM` (Claude→Gemini 2.5 Flash, JSON mode) pedindo `precoMedio/Min/Max` BR + `canalTipico` + `confianca`; calcula `paybackMeses = preço/aluguel`, `economiaAnual = 12×gasto − investimento`; heurística COMPRAR_JA(≤6m) / COMPRAR(≤12m) / AVALIAR(≤24m) / MANTER_LOCACAO(>24m); JSON quebrado/rede degradam pra `{itens:[]}` + `iaErroMsg` em vez de derrubar endpoint; sem preço → investimento/economia=null (não simula economia falsa); sort prioriza `temPreco`. (2) Frontend — botão âmbar no header + modal full-screen com 3 estados, banner `iaErroMsg`, ARIA (role=dialog/aria-modal/labelledby), renderização null-safe das colunas. **R-001/R-007/R-010**: N/A — mutation 100% READ-ONLY.

### Revisões recentes (one-liners)

- **Rev. 2361** — UX/FILTRO · Cards KPI de Equipamentos Locados ficaram CLICÁVEIS (drill-down por urgência) + novo card "Vencendo (5d)" + grid 5col responsivo (2/3/5). Ver `shared/changelog.ts`.
- **Rev. 2360** — UX/REDESIGN · Aba "Movimentações" do Dashboard Almoxarifado refeita pra análise mais profunda + todas as datas dos charts padronizadas em DD/MM (BR). Ver `shared/changelog.ts`.
- **Rev. 2359** — UX/OBSERVABILIDADE · Parse de PDF de locação ganha painel de diagnóstico em tempo real (fase atual + timer mm:ss + contador de checagens + heartbeat verde) pra eliminar percepção de "travado em 99%". Ver `shared/changelog.ts`.
- **Rev. 2358** — FEATURE/UX · Import PDF de locação ganha campo "Fornecedor (locadora) deste PDF" + botão "Aplicar a todos" pra padronizar o fornecedor em todos os contratos do mesmo PDF. Ver `shared/changelog.ts`.
- **Rev. 2357** — HOTFIX/UX · Modal drill-down de "Locações mês a mês" ganha botão "Fechar" no rodapé + altura usa `dvh` em vez de `vh` pra respeitar a URL bar dinâmica do iOS Safari. Ver `shared/changelog.ts`.

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
