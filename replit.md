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

- **Rev. 2321** — **HOTFIX/INFRA · Importação PDF da locação migrada pra polling (Start+Status) — proxy Replit matava em 60s com PDFs grandes (toast "Load failed" no iOS Safari).** Pedido user (23/05/2026, screenshot do toast "Load failed" após Rev. 2320): "Erro persistente". **Diagnóstico**: a Rev. 2320 dobrou o `maxOutputTokens` (32k→65k), o que aumentou o WORST-CASE de tempo de geração do Gemini. PDFs grandes (40+ contratos) agora demoram 60-120s pra responder. O proxy mTLS do Replit tem timeout de ~60s — derruba a conexão TCP antes do server responder, e o iOS Safari (fetch nativo) mostra genérico "Load failed" sem chegar log nenhum no servidor (request foi até o fim, mas resposta não voltou). **Implementação** (`server/routers/equipamentos.ts` + `client/src/pages/equipamentos/Locados.tsx`): (1) **Server**: 2 procedures novas. `parsearContratoLocacaoPdfStart` (mutation) gera UUID, cria entrada em `Map<jobId, ParseContratoJob>` (status="pending"), dispara `executeParseContratoLocacao(input)` em background (`.then/.catch` populam o map), retorna `{jobId}` em ms. `parsearContratoLocacaoPdfStatus` (query) lê o map e retorna `{status:"pending"|"done"|"error"|"expired", result?, error?}`. Lógica original do parse extraída pra `executeParseContratoLocacao(input)` (mantida intacta — schema Gemini, `maxTokens=65536`, `tryRepairTruncated`, conversão DD/MM→ISO). GC interno limpa jobs finalizados >10min (pending nunca expira, protege polls longos). Procedure legada `parsearContratoLocacaoPdf` mantida como wrapper síncrono pra retrocompat. (2) **Client**: substitui `useMutation` única por combo `parsearStart.useMutation` + `useEffect` que faz polling via `utils.parsearContratoLocacaoPdfStatus.fetch({jobId})` a cada 2.5s até `done`/`error`/`expired`. Estados `parsePending`/`parseJobId` + shim `const parsearPdf = { isPending: parsePending }` pra preservar todos os usos existentes da `parsearPdf.isPending` (barra de progresso da Rev. 2318, disabled de botões, etc — 0 alteração nesses lugares). Retry de 5s em erros de rede transientes. **0 mudança schema**. **R-001/R-007/R-010:** N/A — server-side puro.
- **Rev. 2320** — **HOTFIX/IA · Importação PDF estava truncando JSON do Gemini em PDFs grandes ("Expected ',' or ']' at position 38975"); fix: `maxOutputTokens` 32768 → 65536 + reparo de array truncado.** Pedido user (23/05/2026, screenshot do toast de erro "Expected ',' or ']' after array element in JSON at position 38975"): "Erro". **Diagnóstico**: PDF F051/R051 da Jalves (40+ contratos, ~300 itens) gerava resposta JSON do Gemini com ~39KB, estourando o `maxOutputTokens: 32768` definido na Rev. 2308. A API retornava o JSON cortado no meio do array `contratos[]`, e o `JSON.parse` quebrava com a mensagem clássica de array não fechado. **Implementação** (`server/routers/equipamentos.ts`, procedure `parsearContratoLocacaoPdf`): (1) `maxTokens: 32768 → 65536` (`gemini-2.5-flash` suporta esse limite). (2) Nova função `tryRepairTruncated(raw)` que: acha o `"contratos": [`, varre caractere a caractere rastreando `depth` (chaves), `inStr` (string), `esc` (escape) — encontra o ÚLTIMO `}` no nível 1 do array (último contrato completo), e reconstrói o JSON como `{...head[}]}`. Resultado: o user recebe os contratos parciais que couberam (~90%) em vez de erro fatal. (3) Catch atualizado: tenta o regex `\{[\s\S]*\}` primeiro; se ainda falhar, chama `tryRepairTruncated`; se tudo falhar, mensagem clara "Resposta da IA truncada/inválida. Tente dividir o PDF em arquivos menores.". **0 mudança client, 0 mudança schema**. **R-001/R-007/R-010:** N/A — server-side puro.
### Revisões recentes (one-liners)

- ~~Rev. 2319~~ — HOTFIX/DB · CREATE TABLE IF NOT EXISTS para `equipamentos_locados` + `equipamento_locado_eventos` no SyncSchema+. Ver `shared/changelog.ts`.
- ~~Rev. 2318~~ — UX/HOTFIX · Barra de progresso da importação PDF não trava mais em 95% (creep 95→99% + estimativa realista 35s). Ver `shared/changelog.ts`.
- ~~Rev. 2317~~ — UX · Remove IMPORTAR PDF (IA) do header do Almoxarifado; fica só RECEBER + DEVOLVER LOCAÇÃO. Ver `shared/changelog.ts`.
- ~~Rev. 2316~~ — UX · Restaura RECEBER + DEVOLVER LOCAÇÃO como botões dedicados no header do Almoxarifado (Importar PDF removido depois na Rev. 2317). Ver `shared/changelog.ts`.
- ~~Rev. 2315~~ — UX · Removido botão "Receber locação" do hero da tela Equipamentos Locados; Importar PDF (IA) vira CTA primária. Ver `shared/changelog.ts`.

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
