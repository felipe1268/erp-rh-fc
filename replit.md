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

- **Rev. 2219** — **UX/PAYROLL · Alerta "HE aprovada SEM ponto" agora mostra status do período HE + aviso de duplicidade.** Lilian: "não tem mais pessoas e veja o intervalo da aprovação tbm.. para não haver pagamento em duplicidade". Cenário: Anderson com HE-120013 aprovada 18/04 (sem ponto), mas período HE 16/04→15/05 já APROVADO (R$ 5.742,10 por Isabella) → lançar manual agora duplica. Fix backend: `heSolicitacoes.aprovadasSemPonto` ganhou LEFT JOIN LATERAL com `he_periods` (tie-break pago>aprovado>calculado + criadoEm DESC) + EXISTS contra `he_period_employees`. Retorna `periodoHE: { id, dataInicio, dataFim, status, aprovadoEm, pagoEm, temLinhaNoPeriodo }`. Fix frontend `HEAprovadaSemPontoAlert.tsx`: badge inline no header (vermelho=pago, âmbar=aprovado, cinza=calculado, sufixo "· c/ linha") + faixa vermelha "Atenção duplicidade … faça desconsolidação/recálculo, não lance HE manual". **R-001/R-007/R-010:** OK — só SELECT; LATERAL respeita companyId.
- **Rev. 2218** — **FIX/UX · Alerta "HE aprovada SEM ponto" propagado pra Fechamento de Ponto + Módulo HE da Folha + bugfix de tenant na 2217.** Lilian: "onde ficou o alerta? não está aqui na tela.. Eric/Eliel/Gledson têm aprovada mas sem ponto.. precisa gerar alerta no Fechamento de Ponto e no cálculo da HE". Causa do "não aparece": chamada inline da 2217 só passava `companyId` — em modo grupo (isConstrutoras), `companyId=0` zerava o filtro `WHERE companyId IN (0)`. Fix: novo componente `client/src/components/HEAprovadaSemPontoAlert.tsx` que passa `companyId` + `companyIds`, aceita `mesReferencia` OU `dataInicio/dataFim`, e tem callbacks opcionais `onOpenEmployee`/`onOpenSolicitacao`. Wiring: (1) `SolicitacaoHE.tsx` aba Aprovações trocou bloco inline pelo componente; (2) `FechamentoPonto.tsx` L1603 — alerta entre seletor de meses e toolbar, `mesReferencia=mesAno`, `onOpenEmployee=openRaioX`; (3) `FolhaPagamento.tsx` Módulo HE L4606 — alerta após EXPIRY BANNER com `dataInicio=heDataInicio` + `dataFim=heDataFim`. **R-001/R-007/R-010:** OK — apenas SELECT; tenant safety reforçado.

### Revisões recentes (one-liners)

- ~~Rev. 2217~~ — UX/HE · Alerta "HE aprovada SEM ponto batido" na aba Aprovações. Nova procedure `heSolicitacoes.aprovadasSemPonto` (`server/routers/heSolicitacoes.ts:184-264`) com raw SQL + `NOT EXISTS` contra `time_records`, respeitando `getEffectiveAllowedObraIds`. Ver `shared/changelog.ts`.
- ~~Rev. 2216~~ — FIX/PAYROLL · Memorial de Cálculo de HE reconhece feriados (nacionais fixos, móveis e custom). Novo helper `getFeriadosSetForPeriod` exportado de `server/routers/feriados.ts`; `computeHEForPeriod`+`memorialCalculo` tratam feriado idêntico a domingo. Ver `shared/changelog.ts`.
- ~~Rev. 2215~~ — UX/LAYOUT · Tela Contas a Pagar usa largura estendida (1600px) — `FinanceiroContasAPagar.tsx:480` `max-w-7xl` → `max-w-[1600px]`, coluna "Ações" não corta mais. Ver `shared/changelog.ts`.
- ~~Rev. 2214~~ — FIX/UX · Lançamentos recorrentes aparecem automaticamente em Contas a Pagar. Novo helper `materializeRecorrentes(db, companyId, horizonteMeses)` (`server/routers/financial.ts:94-187`) idempotente chamado por `getContasAPagarByYear` ANTES do SELECT (horizonte = meses até fim do ano consultado, capado em 13). Ver `shared/changelog.ts`.
- ~~Rev. 2213~~ — UX/CRUD · Botão "Excluir" nos Lançamentos Recorrentes. Nova procedure `financial.deleteRecurringEntry` + UI Trash2 vermelho com `confirm()` em `FinanceiroRecorrentes.tsx`. Lançamentos já materializados em `financial_entries` permanecem intactos. Ver `shared/changelog.ts`.

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
