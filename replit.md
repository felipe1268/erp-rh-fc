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

- **Rev. 2274** — **FIX · Curva S de Trabalho: linha verde (Realizado) ficava colada na vermelha em ~6,16 % mesmo com obra adiantada 8,48 %; label "Realizado atual" divergia do último ponto plotado.** Pedido user (23/05/2026, VITRA, Curva S Trabalho): "o previsto da curva S não deveria estar mais deslocado da curva prevista? ja ques ta bem adiantado? ou é algum erro de escala?". Diagnóstico (`server/routers/planejamento.ts::getCurvaS` L2860-2920): `curvaRealizada` é ponderação por atividade dos `planejamento_avancos` (6,16 %); snapshot MSP raiz UID=0 só era injetado se a semana do StatusDate NÃO tivesse entrada na tabela (`if (!jaTem)`) — VITRA tinha lançamentos manuais em 18/05, então o snapshot 8,48 % era ignorado. Mesma raiz das Rev. 2272/2273 (múltiplas fontes paralelas). Fix L2897-2936: snapshot raiz agora SOBRESCREVE o ponto via `findIndex`; fallback ponderado (`realizadoMspPct`) só roda quando não há snapshot raiz E a semana não tem ponto. Tendência ganha a correção automaticamente. Resultado VITRA: último ponto = 8,48 % = topo = chip do gráfico; linha verde se descola da vermelha. **R-001/R-007/R-010:** N/A (apenas leitura).
- **Rev. 2273** — **FIX · Alarme "DESVIO CRÍTICO DE PRAZO" disparava com a obra ADIANTADA; painel "Avanço Global (c/ Indiretas)" mostrava Diretas 3,75 % vs topo 8,48 %; card "Desvio Físico Global" exibia −2,65 pp em vez de +2,08 pp.** Pedido user (23/05/2026, VITRA, 3ª Sem): "pq o ERP esta dizendo que tem desvio quando a obra esta adiantada?". Diagnóstico: `spi` (L13301) e `desvioFisico` (L13642) dentro do Refis usavam `avancoRealAtual` (ponderação ad-hoc 3,75 %) em vez do realizado oficial do snapshot MSP raiz UID=0 (8,48 % no topo). Banner (L14448 `desvioFisico < -1` / L14449 `spi < 0.85`) disparava como "Crítico" porque 3,75 − 6,40 = −2,65 pp e SPI = 0,59 — contradizendo a barra do topo. Rev. 2272 só tinha corrigido `rReal`/`rDesvioFisico`/`rSpi` (chips), mas `desvioFisico`/`spi`/painel "Diretas" continuaram no caminho legado. Fix (`PlanejamentoDetalhe.tsx::Refis`): nova `realOficialRefis` (L13310) = `typeof avancoAtual === "number" ? avancoAtual : avancoRealAtual`; `spi` e `desvioFisico` reapontados; painel "Diretas" (L14380) exibe `realOficialRefis` e `desvDiretas` (L14420) usa a mesma fonte. **R-001/R-007/R-010:** N/A (client-only).

### Revisões recentes (one-liners)

- ~~Rev. 2272~~ — FIX · REFIS "Realizado Acumulado" passa a espelhar a barra do topo (`avancoAtual`). Ver `shared/changelog.ts`.
- ~~Rev. 2271~~ — FIX · Card "PREVISTO (SEMANA)" deixa de cair pra "—" quando snapshot MSP é zerado; agora replica topo via `pctRaizMSP`. Ver `shared/changelog.ts`.
- ~~Rev. 2270~~ — FIX · Botões "Limpar Avanços" também zeram snapshot MSP do `calendarioJson` (helper `limparSnapshotMspDoProjeto`). Ver `shared/changelog.ts`.
- ~~Rev. 2269~~ — FIX · Barra topo `avancoAtual` `okSemana = semFimVis >= sd` — Realizado deixa de regredir em semanas posteriores ao StatusDate. Ver `shared/changelog.ts`.
- ~~Rev. 2268~~ — FIX · Card "PREVISTO (SEMANA)" varia por semana via `pctRaizMSP` (mesma fórmula da barra do topo); chip "📸 Foto MSP" se refere SÓ ao Realizado. Ver `shared/changelog.ts`.

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
