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

- **Rev. 2271** — **FIX · Card "PREVISTO (SEMANA)" deixa de cair pra "—" quando snapshot MSP é zerado; agora replica o mesmo valor que a barra do topo via `pctRaizMSP`.** Pedido user (23/05/2026, VITRA): "so tem valor da barra superior do previsto.. quero a teseja replicado para abaixo tbm". Contexto: pós Rev. 2270, "Limpar Avanços" apaga snapshot MSP, mas a barra do topo continua exibindo 1,35 % porque `avancoPrevistoDia` chama `pctRaizMSP` direto. Card caía pra "—" porque `mspReadOnly` fazia early-return em `!cal.statusDateSnapshot`. Fix em `PlanejamentoDetalhe.tsx::mspReadOnly`: removidos early-returns em `!statusDateSnapshot` e `!envOk`. **PREVISTO** agora sempre via `pctRaizMSP(semanaFim, projIni, projFim, cal)` se `cal`+projIni/projFim existem (independe do snapshot — espelha topo). **REALIZADO** continua snapshot-only com `missingReason` específico por cenário. Comportamento pós-limpeza: Previsto 1,35 % / Realizado "—" / Variação "—". **R-001/R-007/R-010:** N/A (client-only).
- **Rev. 2270** — **FIX · Botões "Limpar Avanços" (só semana / todas as semanas) agora TAMBÉM zeram o snapshot MSP — cards REALIZADO (ACUM.) e barra topo refletem a limpeza.** Pedido user (23/05/2026, VITRA): "estou limpando os semans mas não estão apagando pq". Diagnóstico: mutations `limparAvancos`/`limparAvancosSemana` apagavam só a tabela `planejamento_avancos`. Desde a Regra de Ouro (Rev. 2264/2265), cards grandes leem do snapshot MSP (`realizadoMspSnapshot` no `calendarioJson`), não da tabela → user limpava e cards permaneciam em 8,48 %. Fix server: helper top-level `limparSnapshotMspDoProjeto(db, projetoId)` parseia `calendarioJson`, remove `previstoMspSnapshot`/`realizadoMspSnapshot`/`statusDateSnapshot`/`envelopeStartSnapshot`/`envelopeFinishSnapshot`, preserva jornadas/feriados, zera `dataCorteAtual` + `dataCorteIso`. Tolera JSON malformado. Ambas mutations chamam o helper após o DELETE. Fix client: invalidam `getProjetoById` no onSuccess; toast atualizado pra "Avanços limpos (inclui snapshot MSP)". **R-001/R-007/R-010:** UPDATE em registro existente; schema preservado.

### Revisões recentes (one-liners)

- ~~Rev. 2269~~ — FIX · Barra topo `avancoAtual` `okSemana = semFimVis >= sd` — Realizado deixa de regredir em semanas posteriores ao StatusDate. Ver `shared/changelog.ts`.
- ~~Rev. 2268~~ — FIX · Card "PREVISTO (SEMANA)" varia por semana via `pctRaizMSP` (mesma fórmula da barra do topo); chip "📸 Foto MSP" se refere SÓ ao Realizado. Ver `shared/changelog.ts`.
- ~~Rev. 2267~~ — UX/REGRA DE OURO · Cards exibem snapshot MSP em semanas POSTERIORES ao StatusDate, com chip âmbar "📸 Foto MSP de DD/MM". Ver `shared/changelog.ts`.
- ~~Rev. 2266~~ — FIX · Importer "Avanço Semanal" agora REGRAVA snapshot MSP via `parseMSProjectFull` + `salvarMetadadosMSProject` ao reimportar XML. Ver `shared/changelog.ts`.
- ~~Rev. 2265~~ — REGRA ABSOLUTA · Planejamento é READ-ONLY do MSP — SSOT `mspReadOnly`, 6 cards lendo snapshot direto. Ver `shared/changelog.ts`.

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
