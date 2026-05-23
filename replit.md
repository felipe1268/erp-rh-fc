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

- **Rev. 2267** — **UX/REGRA DE OURO · Cards exibem snapshot MSP em semanas POSTERIORES ao StatusDate, com chip âmbar "📸 Foto MSP de DD/MM" explicitando que é a última medição disponível.** Pedido user (23/05/2026, VITRA 4ª Sem): "pq não está aparecendo os valores após a 4ª semana? só muda a barra superior". Causa: Rev. 2265 tinha gate estrito (`semanaFim !== statusDate → null`); barra superior (sem gate por semana) mostrava 6,40/3,75 mas os 6 cards ficavam todos "—". Fix em `PlanejamentoDetalhe.tsx`: hook `mspReadOnly` agora retorna `staleFromDate`. Política nova — `semanaFim < statusDate` → "—" (sem foto histórica), `semanaFim === statusDate` → snapshot fresco, `semanaFim > statusDate` → exibe snapshot + chip âmbar com data da última medição + CTA pra exportar novo XML com StatusDate atualizado. Coerência Rev. 2265: continua leitura PURA do snapshot, só afrouxa o gate de exibição. **R-001/R-007/R-010:** N/A (client-side).
- **Rev. 2266** — **FIX · Importer "Avanço Semanal" (botão roxo "Importar MS Project") agora REGRAVA o snapshot MSP (`calendarioJson`) ao reimportar XML.** Pedido user (23/05/2026, screenshot VITRA 3ª Sem): "REALIZADO mostra 0,00 %... importei o XML novo... não está abrindo". Causa raiz: existem 2 pontos de entrada de XML — (1) aba Cronograma → `salvarMetadadosMSProject` (grava snapshot); (2) aba Avanço Semanal → `importarDoMSProject` (só atualizava % por folha, snapshot ficava stale). VITRA teve import inicial quando obra tinha 0 h realizadas, então `realizadoMspSnapshot` virou 0; toda reimportação semanal usava o fluxo #2 e nunca refrescava esse 0. A Rev. 2265 (mspReadOnly) lia o 0 e mostrava "0,00 %" verde — comportamento correto pro hook, mas com dado obsoleto. Fix: importer #2 agora guarda `xmlTextSnapshot`, chama `parseMSProjectFull` ao final e dispara `salvarMetadadosMSProject` pra regravar snapshot + envelope + statusDate. Invalida `getProjetoById` → cards re-renderizam. Toast ganha sufixo `📸 snapshot MSP atualizado`. Fire-and-forget: erro na regravação não invalida o import de avanços. Coerência Rev. 2265: NÃO reintroduz cálculo — só mais um caminho de leitura do XML sem destruir atividades. **R-001/R-007/R-010:** N/A (UPDATE de registro existente).

### Revisões recentes (one-liners)

- ~~Rev. 2265~~ — REGRA ABSOLUTA · Planejamento é READ-ONLY do MSP — SSOT `mspReadOnly`, 6 cards lendo snapshot direto. Ver `shared/changelog.ts`.
- ~~Rev. 2264~~ — FIX/REGRA DE OURO · Cards "PREVISTO (SEMANA)" / "REALIZADO (ACUM.)" / "AVANÇO GLOBAL PREVISTO" espelham snapshot MSP da raiz UID=0. Ver `shared/changelog.ts`.
- ~~Rev. 2263~~ — UX · Modal "Editar Revisão" adota layout moderno FC, espelhando "Nova Revisão do Cronograma". Ver `shared/changelog.ts`.
- ~~Rev. 2262~~ — FIX/REGRA DE OURO · Card "Avanço Físico" do topo (Planejamento → Detalhe) espelha snapshot MSP da raiz UID=0. Ver `shared/changelog.ts`.
- ~~Rev. 2261~~ — BACKFILL · Propaga leitura MSP da Rev. 2260 para todas as obras antigas, automaticamente no startup (idempotente). Ver `shared/changelog.ts`.

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
