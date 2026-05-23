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

- **Rev. 2282** — **FEAT/UX · HISTÓRICO DE RELATÓRIOS EMITIDOS (REFIS) vira EXPANSÍVEL com painel de ANÁLISE COMPARATIVA vs semana anterior.** Pedido user (23/05/2026, IMG_1058/1059, follow-up direto da Rev. 2281): "Acho que tem erro no histórico do refis… quero que reavalie e quando eu clicar quero poder ver os dados e uma análise comparativa, se o valor subiu ou caiu… se o desempenho melhorou ou não mês a mês". Linhas da tabela viram clicáveis (ChevronRight rotativo + cursor-pointer + hover) e abrem painel full-width com: **(1) BANNER DE VEREDITO** automático "Desempenho MELHOROU / PIOROU / ESTÁVEL" em emerald/red/amber c/ ícone TrendingUp/Down/Activity, subtítulo com datas + nº de dias do intervalo. **(2) GRID DE 4-5 KPIs Δ** (Δ Previsto, Δ Realizado, Δ Desvio Físico, Δ SPI, Δ Faturamento Realizado), cada um em tile rounded-xl com setinha (Up/Down/Minus), valor BLACK contextual e label "subiu/caiu/estável vs sem. anterior". **(3) TABELA DENSA lado-a-lado** (grid 12 cols: Indicador | Sem.Anterior DD/MM | Sem.Atual DD/MM | Δ) cobrindo Avanço Previsto/Realizado, SPI, Faturamento Previsto/Realizado. **(4) OBSERVAÇÕES COMPLETAS** dos 2 relatórios em colunas pareadas (sem truncamento — fim do `max-w-[200px] truncate`), esta semana destacada em violet-50/30. Heurística: melhorou = ΔDesvio > +0.01pp E ΔSPI ≥ −0.02; piorou = ΔDesvio < −0.01pp OU ΔSPI < −0.05; senão estável. Implementação: state local `expandedHistRows: Set<string>` (múltiplas linhas podem estar abertas simultaneamente p/ comparação), `prevRow = sortedRefis[idx+1]` (array já está DESC), `totalCols` dinâmico (7 base + 3 se financeiro visível). Mapa PALETA ESTÁTICO de classes Tailwind (JIT não pega `bg-${cor}-100`), sem novas chamadas tRPC, sem novos imports lucide. Arquivo único: `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. **R-001/R-007/R-010:** N/A (client-only).
- **Rev. 2281** — **UX · REFIS Análise do Cronograma — redesign sweeping de 3 blocos visíveis na tela do relatório semanal: (A) HEADER de cada GROUP CARD, (B) trio de KPIs de FATURAMENTO DO MÊS, (C) HISTÓRICO DE RELATÓRIOS EMITIDOS.** Pedido user (23/05/2026, screenshots IMG_1055/1056): "Quero um layout moderno e ultra revolucionário para análise do cronograma, me surpreenda". Linguagem visual antiga (slate-700 flat, bordas duras, números pequenos) substituída por bento + glassmorphism + dataviz contextual. **(A)** Group cards passam a header com gradient noturno DINÂMICO por status (indigo→violet quando realizado≥previsto, rose→red quando desvio < −10pp, amber→orange p/ atraso leve), glows decorativos, padrão de pontos textural, EAP em chip 3D backdrop-blur, datas Início/Fim em pills glass coloridos, RING DE PROGRESSO RADIAL SVG 64px com gradient ok/warn, 3 tiles KPI glass (Previsto/Realizado/Desvio) e barra-gradiente comparativa h-2 c/ glow ShadowBox no rodapé. **(B)** KPIs Faturamento promovidos a bento cards rounded-2xl c/ gradient + glow circular + ícone container (Target/Activity/TrendingUp), número 3xl font-black tabular-nums, pill informativa backdrop-blur + mini progress bar h-1.5 gradient. **(C)** Histórico header vira gradient slate-900→slate-800→slate-900 c/ ícone History container, subtítulo descritivo e pill de contagem com pulse. Tabela ganha border-l-4 colorida por status, número #NNN font-mono, badge "ATUAL" pulsante, chips coloridos pra Desvio % e R$, mini-gauge SPI 10x1.5 c/ tick "SPI=1.00" e cor contextual (verde ≥1, amber 0.85-1, red <0.85). Único arquivo: `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. ZERO mudança em wiring de dados/hooks/mutations/props — todos os bindings preservados (`g.eapCodigo`, `g.realizado`, `r.spi`, `r.custoPrevisto` etc). Classes `refis-block` mantidas p/ não quebrar CSS de print. Único novo import: `Target` de lucide. **R-001/R-007/R-010:** N/A (client-only).

### Revisões recentes (one-liners)

- ~~Rev. 2280~~ — FIX · LOTUS Prog. Semanal: atividade ANTECIPADA / NÃO PROGRAMADA na semana corrente não pintava célula r0+2 (UI+Excel). Ver `shared/changelog.ts`.
- ~~Rev. 2279~~ — CHORE · Solicitação de Equipamento (SE) DELETADA do ERP (Etapa 1 da consolidação SE→SC). Ver `shared/changelog.ts`.
- ~~Rev. 2278~~ — FIX · Curva S Financeira KPI/linha verde usa `realOficialRefis` (snapshot MSP raiz UID=0) em vez de `avancoRealAtual`. Ver `shared/changelog.ts`.
- ~~Rev. 2277~~ — FEAT · Filtro "Apenas atrasadas" na seção "Avanço Físico por Grupo" com pill clicável e contador. Ver `shared/changelog.ts`.
- ~~Rev. 2276~~ — UX · "AVANÇO FÍSICO POR GRUPO" redesenhado no estilo CRONOGRAMA, macro BarChart redundante removido. Ver `shared/changelog.ts`.

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

> Revisões 2098 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
