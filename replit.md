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

- **Rev. 2189** — **MELHORIA UX · Tabela do Relatório de Períodos HE agora mostra a foto do colaborador (avatar 32px circular) à esquerda do nome, puxando direto de `employees.fotoUrl`.** Lilian: "quero que apareça as fotos de todos aqui, busque no cadastro de cada um..". **Fix (Server `horasExtras.ts:getDetalhe`):** query de `empRows` passa a selecionar `e."fotoUrl"` no LEFT JOIN `employees`. **Fix (Client `FolhaPagamento.tsx:4945`):** célula do nome renderiza `<img>` 32px rounded-full `object-cover` com fallback de iniciais (2 primeiras palavras) num círculo cinza quando `fotoUrl` é null/erro de carregamento; `onError` esconde a img. Layout flex preserva o botão de nome (abre espelho de ponto). **R-001/R-007/R-010:** OK — só SELECT.
- **Rev. 2188** — **HOTFIX UX · Dropdown "Filtrar por obra" do Relatório de Períodos HE listava QUALQUER obra em que o funcionário bateu ponto no período, mesmo quando essa obra não gerou HE. Fix: só aparece obra que de fato teve HE.** Lilian: "so deve aparecer no filtro, as obras que tiveram horas extras..". **Causa:** Rev. 2187 limpou o bucket "Sem Obra" mas `semSolRows` ainda trazia qualquer ponto com `obraId`, mesmo dias sem HE. **Fix (Server `horasExtras.ts:getDetalhe`):** query (2) ganha `tr."horasExtras" IS NOT NULL` + `tr."horasExtras" NOT IN ('', '0', '0:00', '00:00', '0:0')`. `aprovadasRows` não precisa (já filtra por `he_solicitacoes.status='aprovada'`, HE>0 por definição). **R-001/R-007/R-010:** OK — só SELECT.

### Revisões recentes (one-liners)

- ~~Rev. 2187~~ — HOTFIX UX · Dropdown "Filtrar por obra" do Relatório de Períodos HE mostrava opção "Sem Obra" agrupando `time_records.obraId=NULL`. Fix: server `LEFT JOIN obras`→`JOIN obras` + `IS NOT NULL`; client pula `obraId==null`. Ver `shared/changelog.ts`.
- ~~Rev. 2186~~ — MELHORIA UX + HOTFIX VISUAL · Lista de Entregas de EPI: olhinho só com `assinaturaUrl`; entregas sem assinatura mostram ⚠ âmbar "Aguardando assinatura"; novo filtro tri-state Todas/✓ Assinadas/⚠ Não assinadas. Ver `shared/changelog.ts`.
- ~~Rev. 2185~~ — HOTFIX BLOQUEANTE · Filtro por OBRA no Relatório de Períodos HE mostrava linha "Aprovada" sob obra ERRADA. Fix: `obrasPorEmp` separado POR ORIGEM no server (aprovada via `he_solicitacoes`; sem_solicitacao via `time_records` + NOT EXISTS); client `obrasMap` re-chaveado `Map<"empId|origem", Set<obra>>`. Ver `shared/changelog.ts`.
- ~~Rev. 2184~~ — NOVA FEATURE · Drill-down do badge "✅ Aprovada" no Relatório de Períodos HE: clicar abre dialog listando solicitações HE aprovadas que cobrem o funcionário no período. Reusa `heSolicitacoes.historyByEmployee`. Ver `shared/changelog.ts`.
- ~~Rev. 2183~~ — NOVA FEATURE · Filtro por OBRA no Relatório de Períodos HE (Select acima dos cards KPI da Rev. 2182). Backend `getDetalhe` retorna `obrasPorEmp` via `time_records` JOIN `obras`. **OBS: revisado pela Rev. 2185 — agora separa por origem.** Ver `shared/changelog.ts`.

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
