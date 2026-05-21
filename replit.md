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

- **Rev. 2237** — **FEATURE/IMPORTER · Distribuição automática do avanço importado em semanas passadas seguindo a curva prevista.** User: "hoje a programação esta dizendo que não houve atividades na 1, 2 e 3 semana.. mas a atividade ocorreu". XML do MSP só traz cumulativo final por atividade — o fluxo antigo jogava 100% numa única semana e Prog. Semanal mostrava "Não exec." nas demais. User confirmou opção A: distribuir cumulativo seguindo a CURVA PREVISTA. Algoritmo por atividade: para cada semana passada W, `cumW = min(planAtW, imp)` onde `planAtW = fracaoDecorridaMs(ini_ativ, fim_W, fim_ativ, calMSP) * 100`; `semanal_W = max(0, cumW - cum_W-1)`. Semana ativa continua em `avancoLocal` (revisão + Salvar). Fix em `PlanejamentoDetalhe.tsx:6859-6953`: dispara `salvarAvancoLote` sequencial por semana passada (delta depende da anterior), tolera falha individual sem abortar lote. Status: "X de Y preenchidas + 🔁 Z avanços distribuídos em N semanas anteriores". **R-001/R-007/R-010:** N/A.
- **Rev. 2236** — **FIX/IMPORTER (continuação 2235) · Avanço ainda não aparecia para terceiros (Rohr, Lotus, Friul, Santuário).** A Rev. 2235 removeu descarte por Item ausente + matching por `mspUid`, mas iterava `folhas` (`PlanejamentoDetalhe.tsx:6252`) que exclui `isIndireta=true`. As 22 atividades de terceiros costumam estar marcadas como indireta via Padrão FC — saíam do `forEach` e `newLocal[a.id]` nunca era setado. Fix em `PlanejamentoDetalhe.tsx:6840`: troca `folhas.forEach(...)` por `folhasComInd.forEach(...)` (`!a.isGrupo && !a.disabled` — inclui indiretas). Status "X de Y" agora reflete `folhasComInd.length`. **R-001/R-007/R-010:** N/A.

### Revisões recentes (one-liners)

- ~~Rev. 2235~~ — FIX/IMPORTER · Importar MS Project pulava 20-30% das atividades (sem campo Item). DOIS maps (UID + Item), removida guarda `if (!wbs) return`. Ver `shared/changelog.ts`.
- ~~Rev. 2234~~ — FIX/UX · Planejamento abria sempre na 1ª semana, não na atual. Effect UNIFICADO em `[semanas, cutoffDow]` em `PlanejamentoDetalhe.tsx:6217-6253`. Ver `shared/changelog.ts`.
- ~~Rev. 2233~~ — FIX/RACE · Cronograma: responsável (cyan) digitado SUMIA ao clicar Salvar. Sync DOM→state via `querySelectorAll('[data-resp-input]')` no `onClick` antes do cascata+mutate. Ver `shared/changelog.ts`.
- ~~Rev. 2230/2231/2232~~ — FIX/PARSER (3 iterações, 2232 é a estável) · Importar Cronograma MS Project XLSX com linhas de título acima dos headers e headers MSP-PT-BR full. 2232 híbrido equals+word-boundary com norm() NFD + best-match. Ver `shared/changelog.ts`.
- ~~Rev. 2229~~ — CHORE/CLEANUP · Removidas 4 procedures duplicadas (warnings esbuild "Duplicate key") em `server/routers/financial.ts` + `payrollEngine.ts`. Ver `shared/changelog.ts`.

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
