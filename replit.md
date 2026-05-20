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

- **Rev. 2194** — **REMOÇÃO DE FEATURE · Bloco "Conferência com Contabilidade" removido da aba Folha de Pagamento (UI + dialog de alerta + estado).** Lilian: "dentro da aba de folha de pagamento,, tire a função conferencia de contabilidade". **Fix (Client `FolhaPagamento.tsx`):** (1) Card colapsável "Conferência com Contabilidade" (importação/verificação dos PDFs da contabilidade terceirizada — vale + pagamento side-by-side) DELETADO (~192 linhas, antiga L7003-7193). (2) Dialog "Conferência com Contabilidade Recomendada" (alerta pós-`consolidarLancamento` quando server retorna `alertaConferencia`) DELETADO (antiga L7687-7718). (3) State `showConferencia` e `conferenciaDialog` removidos. (4) `consolidarMut.onSuccess` simplificado: sempre toast.success + refetch (branch `alertaConferencia` morto). **Server intacto** (`payrollEngine.ts:4150`, `folhaPagamento.ts:1405`) — checagem `conferenciaContabilidade !== 'opcional' && !ignorarConferencia` ainda existe; se algum usuário tiver esse critério configurado como obrigatório, consolidar vai falhar com toast.error. **R-001/R-007/R-010:** OK — só client, zero server, zero schema.
- **Rev. 2193** — **MELHORIA UX · Layout da Ficha de Entrega de EPI reorganizado em documento ÚNICO: tabela de EPIs → política → declaração → obrigações → assinaturas → fotos (no final como evidência).** Lilian: "as fotoss precisam aprecer junto ao relatorio, quando eu clicar em visualizar, quero ver um documento unico, documento, assinatura e depois fotos.. organize o layout para isso". **Contexto:** Rev. 2191 colocou o bloco de fotos ENTRE tabela e Policy Box, quebrando o fluxo narrativo. **Fix (Client `Epis.tsx`):** bloco de fotos movido da posição antiga (L1747-1779) pra DEPOIS do grid de assinaturas (após L1870), separado por `mt-8 pt-6 border-t-2 border-gray-300` (visual de anexo). Header rebatizado "📷 Evidência Fotográfica — EPIs (n)" uppercase + subtítulo legal (Art. 462, §1º CLT). Thumbnails `h-32` → `h-40`. **Não-regressão:** Rev. 2192 (nomes) + Rev. 2190 (olhinho in-app) intactos. **R-001/R-007/R-010:** OK — só reorder JSX.

### Revisões recentes (one-liners)

- ~~Rev. 2192~~ — MELHORIA UX · Nome do funcionário e do responsável aparecem em destaque abaixo de cada assinatura na Ficha de Entrega de EPI. Schema aditivo `epi_deliveries.assinatura_responsavel_{nome,em}` (bootstrap isolado L1762-1772). Server grava `ctx.user.name` no `salvarAssinatura` quando `tipoAssinante==='responsavel'`. Ver `shared/changelog.ts`.
- ~~Rev. 2191~~ — MELHORIA UX · Ficha de Entrega de EPI passou a exibir bloco "📷 FOTOS ANEXADAS" com `fotoEstadoUrl` (foto obrigatória em troca por desgaste/mau_uso, `epis.ts:403`). Posição revisada pela Rev. 2193 (movida pro final do doc). Ver `shared/changelog.ts`.
- ~~Rev. 2190~~ — HOTFIX BLOQUEANTE · Assinatura de EPI "sumia" ao abrir via olhinho. Causa: `fichaUrl` (PDF) gerado ANTES da assinatura nunca regerado. Fix: olhinho abre preview in-app (sobrepõe `assinaturaUrl` como `<img>`) em vez de `window.open(fichaUrl)`. Ver `shared/changelog.ts`.
- ~~Rev. 2189~~ — MELHORIA UX · Tabela do Relatório de Períodos HE mostra foto do colaborador (avatar 32px circular) à esquerda do nome via `employees.fotoUrl`. Fallback iniciais quando null. Ver `shared/changelog.ts`.
- ~~Rev. 2188~~ — HOTFIX UX · Dropdown "Filtrar por obra" do Relatório de Períodos HE listava QUALQUER obra em que o funcionário bateu ponto, mesmo sem HE. Fix server `semSolRows`: `tr."horasExtras" IS NOT NULL` + `NOT IN ('', '0', '0:00', '00:00', '0:0')`. Ver `shared/changelog.ts`.

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
