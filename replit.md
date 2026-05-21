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

- **Rev. 2235** — **FIX/IMPORTER · Importar MS Project pulava 20-30% das atividades silenciosamente.** User (1ª-iésima vez): "TODA VEZ QUE FAÇO A IMPORTAÇÃO ELE NÃO TRAZ O VALOR DO REALIZADO CONFORME O MSPROJECT... ALGUNS ITENS FORAM IMPORTADOS OUTROS NÃO". Diagnóstico real parseando o XML do user (`PLN_805_03_2026_R04_REVTE-CIVIL_SEMANA_03.xml`): 128 tasks → 48 summary → 80 folhas → **22 sem campo "Item" (Texto1)** porque são atividades de TERCEIROS (Rohr, Lotus, Friul, Santuário). `importarDoMSProject` tinha `if (!wbs) return` que pulava silenciosamente. Ex.: UID=5655 "Montagem do andaime - Rohr" PercentComplete=22% nunca importava. Fix em `PlanejamentoDetalhe.tsx:6717-6859`: (1) DOIS maps — `percentByUid` (UID nativo MSP, 100% das tasks) + `percentByEap` (Item, fallback legado); (2) removida guarda `if (!wbs) return` — agora processa toda task não-summary; (3) matching no cliente prioriza `mspUid` (já persistido pela Rev. 1829) com fallback `eapCodigo`; (4) status detalhado "X de Y preenchidas (N via UID · M via Item · K sem correspondência)" + amostra dos sem-match. **R-001/R-007/R-010:** N/A.
- **Rev. 2234** — **FIX/UX · Planejamento abria sempre na 1ª semana, não na atual.** User: "QUANDO ENTRO NO PLANEJAMENTO ELE ABRE O PERCENTUAL DA PRIMEIRA SEMANA, O CORRETO É ABRIR DA SEMANA ATUAL". Dois bugs nos effects de `semanaAtual` em `AvancoSemanal`: (1) auto-corretor de "fora da faixa" usava `setSemanaAtual` (com S) que marcava `userSelectedSemanaRef=true` — desligando o realign futuro; (2) realign pra hoje só disparava na MUDANÇA de `cutoffDow`, então quando o default 4 coincidia com o cutoff real do projeto, nunca corrigia. Fix em `PlanejamentoDetalhe.tsx:6217-6253`: effect UNIFICADO em `[semanas, cutoffDow]` que, enquanto o usuário não clicou em semana, SEMPRE prioriza a Monday da semana cutoff de HOJE se estiver em `semanas`, fallback `past[last]`, fallback `semanas[0]` só se nada <= hoje. Setamos via `setSemanaAtualRaw` p/ não marcar como ação do usuário. **R-001/R-007/R-010:** N/A.

### Revisões recentes (one-liners)

- ~~Rev. 2233~~ — FIX/RACE · Cronograma: responsável (cyan) digitado SUMIA ao clicar Salvar. Sync DOM→state via `querySelectorAll('[data-resp-input]')` no `onClick` antes do cascata+mutate. Ver `shared/changelog.ts`.
- ~~Rev. 2230/2231/2232~~ — FIX/PARSER (3 iterações, 2232 é a estável) · Importar Cronograma MS Project XLSX com linhas de título acima dos headers e headers MSP-PT-BR full. 2232 híbrido equals+word-boundary com norm() NFD + best-match. Ver `shared/changelog.ts`.
- ~~Rev. 2229~~ — CHORE/CLEANUP · Removidas 4 procedures duplicadas (warnings esbuild "Duplicate key") — `getCashFlow`, `markAlertRead`, `getDRE` em `server/routers/financial.ts` + `consolidarPagamento` em `server/routers/payrollEngine.ts`. Ver `shared/changelog.ts`.

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
