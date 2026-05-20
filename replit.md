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

- **Rev. 2185** — **HOTFIX BLOQUEANTE · Filtro por OBRA no Relatório de Períodos HE mostrava linha "Aprovada" sob obra ERRADA quando o funcionário tinha ponto em outra obra no mesmo período. Fix: `obrasPorEmp` separado POR ORIGEM, lendo da fonte de verdade certa.** Lilian: "atentar o fitlro, a hora extra do caio é da obra do papa, inclusive a solicitação esta de la, porem o esta aparecendo como REVTE-CIVIL.. FAZER A CORREÇÃO.. E GARANTIR QUE ISSO NAÕ VAI SE REPETIR..". **Causa:** Rev. 2183 lia `obrasPorEmp` SÓ de `time_records`; com o split por origem da Rev. 2179, qualquer ponto em REVTE-CIVIL no período fazia a linha "Aprovada" (cuja solicitação real era da Obra do Papa) aparecer no filtro errado. **Fix (Server `horasExtras.ts:getDetalhe`):** `obrasPorEmp` agora retorna `{employeeId, origem, obraId, obraNome}` com 2 queries: (1) origem='aprovada' → `he_solicitacoes` JOIN `he_solicitacao_funcionarios` (status='aprovada', `dataSolicitacao ∈ período`, obra vem da solicitação); (2) origem='sem_solicitacao' → `time_records` no range com `NOT EXISTS` excluindo dias cobertos por solicitação aprovada. **Fix (Client `FolhaPagamento.tsx`):** `obrasMap` re-chaveado `Map<"empId|origem", Set<obra>>`; filtro casa por (employeeId+origem da linha). **Não-regressão:** vínculo obra↔origem agora é estrutural (mesma fonte que `computeHEForPeriod`). **R-001/R-007/R-010:** OK — só SELECT.
- **Rev. 2184** — **NOVA FEATURE · Drill-down do badge "✅ Aprovada" no Relatório de Períodos HE: clicar abre dialog listando as solicitações HE aprovadas que cobrem o funcionário no período.** Lilian: "nas aprovadas, quero poder clicar e ver a solicitação que ela foi aprovada". **Backend:** zero mudanças — reusa `heSolicitacoes.historyByEmployee` (já existente, retorna histórico do funcionário com obra/motivo/aprovador/data). Filtragem por período + status='aprovada' é client-side. **Frontend (`client/src/pages/FolhaPagamento.tsx`):** (1) state `solicAprovDialog: {empId, empNome, dataInicio, dataFim} | null`; (2) Badge "✅ Aprovada" agora envolto em `<button>` com `ev.stopPropagation()` + hover `bg-green-200` + ring focus; (3) novo Dialog (header gradiente verde) renderiza cards com #ID, data, horário, obra, motivo, solicitado/aprovado por; empty-state âmbar se nada cobre o intervalo (caso de cancelamento pós-cálculo). **R-001/R-007/R-010:** OK — zero DDL, SELECT-only no server.

### Revisões recentes (one-liners)

- ~~Rev. 2183~~ — NOVA FEATURE · Filtro por OBRA no Relatório de Períodos HE (Select acima dos cards KPI da Rev. 2182). Backend `getDetalhe` retorna `obrasPorEmp` via `time_records` JOIN `obras`. **OBS: revisado pela Rev. 2185 — agora separa por origem.** Ver `shared/changelog.ts`.
- ~~Rev. 2182~~ — NOVA FEATURE · 3 cards KPI clicáveis (Total HE / Aprovadas / Sem solicitação) acima da tabela do Relatório de Períodos HE, azul institucional FC #1B2A4A, filtro on-click via state `heOrigemFilter`. Ver `shared/changelog.ts`.
- ~~Rev. 2181~~ — MELHORIA UX · Botão Memorial de Cálculo agora aparece em TODAS as linhas do Relatório de Períodos HE (Rev. 2179 gateou por `isFirst`); fix removeu o gate em `FolhaPagamento.tsx:4804`. Ver `shared/changelog.ts`.
- ~~Rev. 2180~~ — HOTFIX BLOQUEANTE · "Calcular Vale" salvava `payroll_advances` mas falhava no UPDATE final de `payroll_periods` (13 colunas faltantes no DB Neon — `valeResultJson` etc); fix via ADD COLUMN IF NOT EXISTS aditivo + bootstrap `[SyncSchema+] Rev. 2180`. Ver `shared/changelog.ts`.
- ~~Rev. 2179~~ — NOVA FEATURE · Relatório de Períodos HE ganhou coluna "Solicitação" (✅ Aprovada / ⚠️ Sem solicitação) + quebra funcionário em até 2 linhas com Pagar/Banco independente por origem. Schema `he_period_employees.origem` + `computeHEForPeriod` classifica por dia. Ver `shared/changelog.ts`.

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
