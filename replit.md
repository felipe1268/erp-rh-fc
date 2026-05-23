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

- **Rev. 2261** — **BACKFILL · Propaga leitura MSP da Rev. 2260 para todas as obras antigas, automaticamente no startup (idempotente).** Pedido user: "propague para todas as obras existentes". Escolheu backfill automático server-side. Como o XML cru não é persistido (só `previsto_msp_pct` / `realizado_msp_pct` em `planejamento_atividades`), obras importadas antes da Rev. 2260 com template LOTUS R05 (só Texto6) ficaram com `previsto_msp_pct = NULL`. Novo bloco em `server/_core/index.ts` (dentro de SyncSchema+) que ao subir o servidor: (1) checa sentinel `backfill_msp_pct_v2260` em `startup_cache` (pula se já rodou); (2) itera `planejamento_projetos` com `calendario_json NOT NULL`, parseia calMSP e `statusDateSnapshot`; (3) pra cada folha (`is_grupo=false`) com datas e snapshot NULL, calcula `pctRaizMSP(statusDate, dataInicio, dataFim, calMSP)` (mesma fórmula que o MSP usa pro Texto6) e aplica `Math.floor` (replica `Int(...)`); (4) UPDATE em batch CASE WHEN/CHUNK 500 com `SET previsto_msp_pct = COALESCE(previsto_msp_pct, val::numeric)` — concorrência-safe; (5) grava sentinel. %REALIZADO não é tocado (depende de Texto7/AD+RD não persistidos — só re-import resolve). Re-imports futuros sobrescrevem com fonte original via `salvarAtividades`. **R-001/R-007/R-010:** UPDATE-only com COALESCE e WHERE estrito — ZERO ALTER/DROP/DELETE.
- **Rev. 2260** — **FIX · Importador MS Project lê `% PREVISTO` por atividade via Texto6 (FieldID 188743746) como fallback de Texto10.** Pedido user (junto com regra formalizada em User preferences): "sempre adote % PREVISTO calculado no MSP como PREVISTO e PercentComplete da tarefa-resumo como REALIZADO". Auditoria identificou bug no parser per-task: `parseMSProjectTasksFromDoc` em `client/src/pages/planejamento/ImportarCronograma.tsx` (L424-452) lia SÓ Texto10 (FieldID 188743750, 4 casas) — XMLs do template LOTUS R05 (ex.: VITRA 3 Semana) NÃO trazem Texto10, só Texto6 ("% PREVISTO" inteiro), então `previstoMsp` ficava `undefined` e o ERP caía no cálculo dinâmico em vez de espelhar o snapshot oficial. Fix adiciona captura de `previstoMspT6` (FieldID 188743746) com prioridade SECUNDÁRIA — Texto10 ganha quando presente (preserva precisão 4 casas em templates modernos). Limpeza do valor atualizada p/ tirar "%" e converter vírgula BR (Texto6 vem " 4%", Texto10 vem "1,41"). Parser da raiz UID=0 já tinha esse fallback desde Rev. 1646.7 — só o per-task estava torto. **R-001/R-007/R-010:** N/A (100% client).

### Revisões recentes (one-liners)

- ~~Rev. 2259~~ — REFACTOR · SE (Solicitação de Equipamento de locação) migra do Almoxarifado para o módulo Compras. Ver `shared/changelog.ts`.
- ~~Rev. 2258~~ — FEATURE · Módulo Controle de Equipamentos Fase 1 Sprint 3 (5 páginas React em /equipamentos/*). Ver `shared/changelog.ts`.
- ~~Rev. 2257~~ — FEATURE · Módulo Controle de Equipamentos Fase 1 Sprint 2 (tRPC router 18 procedures + auto-seed CAPEX). Ver `shared/changelog.ts`.
- ~~Rev. 2256~~ — FEATURE · Módulo Controle de Equipamentos Fase 1 Sprint 1 (6 tabelas novas + 2 extensões aditivas + migration 0025 idempotente). Ver `shared/changelog.ts`.
- ~~Rev. 2255~~ — FIX · Barra superior "Avanço Físico" (Planejamento → Detalhe) passa a refletir avanço real desde a 1ª renderização. Ver `shared/changelog.ts`.

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
