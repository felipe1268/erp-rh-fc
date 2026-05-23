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

- **Rev. 2319** — **HOTFIX/DB · CREATE TABLE IF NOT EXISTS para `equipamentos_locados` + `equipamento_locado_eventos` no SyncSchema+ (a Rev. 2308 esqueceu de criá-las e dependia de `pnpm db:push` que nunca rodou — quebrava o INSERT da importação PDF).** Pedido user (23/05/2026, após Rev. 2318): "Tá dando erro na importação". **Diagnóstico**: log do servidor mostrava `[SyncSchema+] Rev. 2308: tabela equipamentos_locados ainda não existe — pulando ADDs` — o parse Gemini funcionava (procedure pura), mas no `confirmarImport` o `tx.insert(equipamentosLocados)` estourava porque a tabela física não existia no Neon. A Rev. 2308 criou as defs Drizzle e o ALTER COLUMN aditivo, mas pulou o CREATE TABLE assumindo `db:push`. **Implementação** (`server/_core/index.ts`, bloco SyncSchema+): substituído o `if (!exists) skip` por `CREATE TABLE IF NOT EXISTS equipamentos_locados (...)` com TODAS as 30 colunas do schema Drizzle + 6 índices (`idx_equip_loc_company_status`, `_obra`, `_fornecedor`, `_data_fim`, `_oc`, `_num_contrato`); idem `CREATE TABLE IF NOT EXISTS equipamento_locado_eventos (...)` com 13 colunas + 3 índices; ADD COLUMN IF NOT EXISTS aditivos da Rev. 2308 preservados (idempotentes). **R-001/R-007/R-010: OK** — somente CREATE/ADD IF NOT EXISTS, nenhum DROP/ALTER destrutivo. **0 mudança client, 0 mudança schema Drizzle** (definições já existiam desde a Rev. 2308). Log confirma: `[SyncSchema+] Rev. 2319: tabelas equipamentos_locados + equipamento_locado_eventos garantidas`.
- **Rev. 2318** — **UX/HOTFIX · Barra de progresso da importação PDF não trava mais em 95% (creep 95→99% + estimativa realista 35s).** Pedido user (23/05/2026, screenshot da tela mostrando "IA analisando layout do documento… 95%" parada por longo tempo num PDF F051/R051 da Jalves de 259KB / ~40 contratos): "Trava em 95%". **Diagnóstico**: a Rev. 2310 usou `duracaoEstimada = 20_000` (20s) com `Math.min(95, …)` — pra PDFs grandes (300+ linhas), o Gemini leva 30-60s e a barra estourava o teto em ~20s, parecendo travada. **Implementação** (`client/src/pages/equipamentos/Locados.tsx`): (1) `duracaoEstimada` 20s → 35s (mais realista pra PDFs médios). (2) Nova FASE 2 (creep): após estourar os 35s da curva ease-out, em vez de parar em 95, cresce +1% a cada 15s até 99 (máximo 99 — só `onSuccess` força 100). Isso elimina a sensação de travado em PDFs longos: o user vê 95 → 96 → 97 → 98 → 99 ao longo do extra-time. (3) Novo state `importDemorando` que vira `true` após 30s e troca o texto auxiliar de "Tempo típico: 15–45s · não feche esta janela." pra "📄 PDF extenso detectado — a IA ainda está processando. Aguarde mais alguns segundos…". Interval passa de 200ms → 250ms (suficiente, menos re-renders). **0 backend, 0 schema**. **R-001/R-007/R-010:** N/A — 100% client-side (animação).
### Revisões recentes (one-liners)

- ~~Rev. 2317~~ — UX · Remove IMPORTAR PDF (IA) do header do Almoxarifado; fica só RECEBER + DEVOLVER LOCAÇÃO. Ver `shared/changelog.ts`.
- ~~Rev. 2316~~ — UX · Restaura RECEBER + DEVOLVER LOCAÇÃO como botões dedicados no header do Almoxarifado (Importar PDF removido depois na Rev. 2317). Ver `shared/changelog.ts`.
- ~~Rev. 2315~~ — UX · Removido botão "Receber locação" do hero da tela Equipamentos Locados; Importar PDF (IA) vira CTA primária. Ver `shared/changelog.ts`.
- ~~Rev. 2314~~ — UX/ANALYTICS · Tabela "Custo por obra" agregada no preview da importação PDF de locação. Ver `shared/changelog.ts`.
- ~~Rev. 2313~~ — UX · Substitui 2 botões de locação por 1 "IMPORTAR PDF (IA)" no Almoxarifado (revertido parcialmente na Rev. 2316 → 2317). Ver `shared/changelog.ts`.

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
