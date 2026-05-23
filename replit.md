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

- **Rev. 2258** — **FEATURE · Módulo Controle de Equipamentos — Fase 1 Sprint 3 (páginas React).** Fecha a Fase 1 do módulo entregando toda a UI plugada no sidebar de Almoxarifado em `/equipamentos/*`. 5 páginas novas: **Hub** (4 cards + lista "vencendo em 30d"), **Próprios** (CRUD + filtros + stats), **Locados** (receber c/ foto OBRIGATÓRIA + check-in semanal + devolução c/ foto OBRIGATÓRIA + histórico de eventos), **Solicitações** (criar SE + decidir c/ detecção visual de override + aprovar pendente), **Parâmetros CAPEX** (editor agrupado por categoria). Decisões: (a) foto via `compressImage` 800px JPEG 78% → base64 dataURL no JSON (mesma estratégia do almox/RDO, zero infra extra); (b) plug em Almoxarifado, não novo módulo (herda permissão via `RouteGuard route="/almoxarifado"`); (c) validação client-side de foto duplica a do router (defense-in-depth). Arquivos: `client/src/pages/equipamentos/{_shared,index,Proprios,Locados,Solicitacoes,ParametrosCapex}.tsx` (novos) + `client/src/App.tsx` (+5 lazy +5 rotas) + `client/src/components/DashboardLayout.tsx` (+section "Controle de Equipamentos" com 5 itens em `menuSectionsAlmoxarifado`). **R-001/R-007/R-010:** N/A (100% frontend). Próximas: cron alerta vencimento (2259), plug Raio-X (2260), bloqueio baixa obra (2261), Dash Operacional (2262).
- **Rev. 2257** — **FEATURE · Módulo Controle de Equipamentos — Fase 1 Sprint 2 (tRPC router + auto-seed CAPEX).** Continuação direta da 2256 (schema). Expõe backend completo via tRPC (`trpc.equipamentos.*`) com 18 procedures: CRUD de próprios + locados, registro de eventos (9 tipos), check-in semanal, devolução com foto obrigatória, solicitações de equipamento (SE-AAAA-NNNN com numeração via MAX-scan), decisão com detecção automática de override + alçada R$ 5k, aprovação formal, listagem de faturas (skeleton p/ Fase 3). **Auto-seed** de 13 parâmetros CAPEX default na 1ª listagem por company (idempotente, lazy — funciona p/ company nova sem DBA): TMA 1.2%/mês, alçada R$ 5k, manutenção 8%/ano, seguro 1%/ano, payback ≤60% vida útil, + vida útil por categoria. **Foto obrigatória** validada NO ROUTER (não só UI) — bypass via API direta é bloqueado. Arquivos: `server/routers/equipamentos.ts` (~580 linhas, novo) + `server/routers.ts` (+2 linhas). **R-001/R-007/R-010:** N/A (sem DDL nesta rev).

### Revisões recentes (one-liners)

- ~~Rev. 2256~~ — FEATURE · Módulo Controle de Equipamentos Fase 1 Sprint 1 (6 tabelas novas + 2 extensões aditivas + migration 0025 idempotente). Ver `shared/changelog.ts`.
- ~~Rev. 2255~~ — FIX · Barra superior "Avanço Físico" (Planejamento → Detalhe) passa a refletir avanço real desde a 1ª renderização. Ver `shared/changelog.ts`.
- ~~Rev. 2254~~ — FIX · Programação Semanal LOTUS preserva hierarquia EAP completa via walk-back por `nivel`+ordem. Ver `shared/changelog.ts`.
- ~~Rev. 2253~~ — UX · Campo "Responsável" do modal "Nova Revisão" vira FIXO (readOnly). Ver `shared/changelog.ts`.
- ~~Rev. 2252~~ — FIX · Modal "Nova Revisão" lê `obra.engenheiroResponsavel` (não `proj.responsavel` legado). Ver `shared/changelog.ts`.

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
