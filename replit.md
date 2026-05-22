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

- **Rev. 2244** — **FIX/TZ · `todayLocalISO()` substitui `new Date().toISOString().split("T")[0]` em TODO `PlanejamentoDetalhe.tsx`.** User: "semana atual está errada" → "hoje é 21/05". Bug: `toISOString` retorna UTC; às 21h BRT de 21/05 (cutoff=Qui), virava "2026-05-22" → `isCurrentWeek` marcava badge "ATUAL" na 4ª semana (22-28/05) um dia ANTES da virada real, e o initialState do `semanaAtual` saltava junto. Helper `todayLocalISO` no topo do arquivo monta YYYY-MM-DD via `getFullYear/Month/Date` (fuso LOCAL). `replace_all` trocou 19 ocorrências: `isCurrentWeek` (L182), initialState/effect realign (L6136/L6230), marcação de atrasos (L4405), `todayX` Gantt (L5174), defaults de pickers em forms (compras L11497, nova revisão L12054), fallback `dataInicio` do projeto (L17064). **R-001/R-007/R-010:** N/A.
- **Rev. 2243** — **FIX/UX · "Importar MS Project" do Avanço Semanal vira self-healing (matching por NOME + backfill auto de `msp_uid`).** User: "mas pq vc quer isso? so quero importar o MSproject". Razão: a "solução" 2241/2242 exigia 2 cliques (botão verde do topo `ImportarCronograma` ANTES do botão azul do Avanço Semanal) com nomes idênticos — UX inaceitável. Solução: (a) Backend nova mutation `planejamento.backfillMspUid({ projetoId, pares })` — UPDATE em chunks de 50 com `WHERE msp_uid IS NULL` (idempotente, jamais sobrescreve). (b) Frontend `importarDoMSProject` — parser XML também popula `uidByEap`/`uidByNome` (nomes colidentes viram `null`)/`pctByUid`; matching loop ganha 3º fallback por NOME normalizado (NFD+lower+collapse); quando match via EAP ou NOME e `a.mspUid` é null, acumula em `backfillPares` e dispara `backfillUidMutation.mutateAsync` (não-fatal, invalida cache em sucesso); toast mostra `· N via nome` + `🔗 N msp_uid gravado(s)`. Caso VITRA: 201 folhas sem UID devem casar por nome agora e gravar UID em background — próximas importações casam direto via UID. **R-001/R-007/R-010:** UPDATE atômico/idempotente/não-destrutivo.

### Revisões recentes (one-liners)

- ~~Rev. 2242~~ — FEATURE/DEFESA · Alerta visível de drift `msp_uid` no importer MSP (follow-up 2241). Toast vermelho se `xmlUids>10 && pctFolhasUid<0.30`. Ver `shared/changelog.ts`.
- ~~Rev. 2241~~ — FIX/SCHEMA · Coluna `msp_uid` criada em `planejamento_atividades` (DRIFT drizzle↔DB); renomeados índices `clcom_*` da `clienteComentarios`. Ver `shared/changelog.ts`.
- ~~Rev. 2240~~ — FIX/UX · Header de grupo no Avanço Semanal funciona p/ atividades SEM `eapCodigo` (stack-walk por nivel em `grupoParentByAtivId`). `PlanejamentoDetalhe.tsx:6427-6450`. Ver `shared/changelog.ts`.
- ~~Rev. 2239~~ — UX/AVANÇO-SEMANAL · Headers de grupo (EAP-pai imediato) antes de cada bloco de atividades. `.flatMap` detecta troca de pai. Limitação EAP-only corrigida em 2240. Ver `shared/changelog.ts`.
- ~~Rev. 2238~~ — STYLE/UI · Regra de Ouro FC aplicada no modal "Nova Revisão do Cronograma": faixa `#1B2A4A` no header. Ver `shared/changelog.ts`.

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
