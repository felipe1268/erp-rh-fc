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

- **Rev. 2214** — **FIX/UX · Lançamentos recorrentes agora aparecem automaticamente em Contas a Pagar.** Lilian: "os lançamentos de contas recorrentes ainda não estão aparecendo no CONTAS A PAGAR". Print Jun/2026 tinha 71 contas, nenhuma das 4 recorrências (Celular, Energia, Seguro Vida, Título de Capitalização). Causa dupla: `generateRecurringEntries` só gerava quando `proximo_vencimento <= hoje` (recorrências futuras nunca materializavam mesmo clicando "Gerar Pendentes") **+** nenhum trigger automático ligando recorrência → conta a pagar. Fix: novo helper `materializeRecorrentes(db, companyId, horizonteMeses)` (`server/routers/financial.ts:94-178`) idempotente que projeta todas recorrências ativas até o horizonte, e `getContasAPagarByYear` agora chama esse helper ANTES do SELECT com horizonte = meses até fim do ano consultado (capado em 13). Resultado: abrir /contas-a-pagar já popula as recorrências sem clique. **R-001/R-007/R-010:** OK — INSERTs idempotentes, sem DELETE/ALTER.
- **Rev. 2213** — **UX/CRUD · Botão "Excluir" nos Lançamentos Recorrentes.** Lilian: "nos lançamentos recorrentes, coloque tambem um botao de excluir". A tela só tinha Editar e Pausar/Retomar — sem como remover de vez recorrência encerrada. Backend: nova procedure `financial.deleteRecurringEntry` (`server/routers/financial.ts:2808`) com DELETE escopado por `id + company_id`; lançamentos já materializados em `financial_entries` permanecem intactos. Frontend: `deleteMut` + `handleDelete` (com `confirm()` explicativo) + botão Trash2 vermelho na linha (`client/src/pages/financeiro/FinanceiroRecorrentes.tsx:59-67,247-256`). **R-001/R-007/R-010:** OK — DELETE individual escopado, iniciado pelo usuário, não bulk.

### Revisões recentes (one-liners)

- ~~Rev. 2212~~ — HOTFIX · Contagem "N membros" dos cards de grupo não atualizava ao trocar usuário (mesmo após Rev. 2211). `handleQuickSetGroup` agora awaita `Promise.all([list.refetch(), listAllMembers.refetch(), getMembers.invalidate()])` antes do toast. Ver `shared/changelog.ts`.
- ~~Rev. 2211~~ — HOTFIX · Trocar grupo do usuário não atualizava painel "Membros do Grupo" do grupo antigo. `setGroupsMut.onSuccess` agora invalida `userGroups.getMembers` (sem filtro) + `userGroups.list`. Ver `shared/changelog.ts`.
- ~~Rev. 2210~~ — UX · Aba "Grupos de Acesso" abre o 1º grupo automaticamente em vez de mostrar painel vazio. Novo `useEffect` chama `openGroup(filteredGroups[0])` ao entrar na aba sem seleção. Ver `shared/changelog.ts`.
- ~~Rev. 2209~~ — UX · Mudar Grupo de Acesso do usuário virou INSTANTÂNEO (clicar no radio salva automaticamente). Novo `handleQuickSetGroup` dispara `userGroups.setUserGroups` no `onChange` do radio. Ver `shared/changelog.ts`.
- ~~Rev. 2208~~ — SEGURANÇA/HOTFIX · Sigilo do "Aviso Prévio" fecha brechas no Raio-X, Dashboards, Painel RH e Seguro de Vida (5 procedures). `avisoPrevio.list`, `docs.raioX`, `dashboards.avisoPrevio*`, `home.getData`, `seguroVida.listarFuncionariosComStatus`. Ver `shared/changelog.ts`.

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
