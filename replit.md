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

- **Rev. 2130** — **FCSign · alerta global · gate `enabled` do client relaxado: admin_master/admin agora disparam a query mesmo sem email cadastrado em `users` (complementa Rev. 2128).** User: "E o alerta de assinatura não estou recebendo no meu usuário... ele está como adm master... precisa vincular isso". Causa: Rev. 2128 fez o server casar por PAPEL independente de email, mas `FCSignPendingAlertGlobal.tsx` L29 tinha `enabled: isAuthenticated && !!user?.email`. Felipe logou via Manus OAuth sem email em `users.email` → query nunca era disparada → Rev. 2128 nunca chamada → nenhum toast. **Fix:** novo `isAdminLike = user.role === 'admin_master' || 'admin'` + gate vira `enabled: isAuthenticated && (!!user?.email || isAdminLike)`. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2129** — **HOTFIX iOS Safari · `FCSignContratoExperienciaPanel` quebrava com "The string did not match the expected pattern" ao renderizar timestamps da sessão FCSign — toast aparecia prefixado com "Erro ao alocar número do contrato" (falsa atribuição).** User: screenshot iPad mostrando toast vermelho na tela Editar Colaborador. **Causa:** armadilha clássica iOS Safari (Rev. 1848+) — Drizzle/superjson devolve TIMESTAMP como `"YYYY-MM-DD HH:MM:SS.fff"` (espaço, não T), WebKit rejeita. Linhas 95/159/192 do painel faziam `new Date(x).toLocaleString("pt-BR")` cru em `completedAt`/`createdAt`/`signedAt`. Quando a mutation de alocação rodava `getById.invalidate()`, o refetch re-renderizava o painel → crash no `new Date` → erro vazava pro contexto da mutation no iOS, disparando `onError` ao invés de `onSuccess`. **Fix em `FCSignContratoExperienciaPanel.tsx`:** novo helper `fmtTs(ts)` no topo (replace " "→"T" + guarda `isNaN` + try/catch + fallback string crua, mesmo padrão de `FinanceiroContasAPagar.tsx` L154 e `PlanejamentoDetalhe.tsx` L83). 3 chamadas trocadas. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2128** — **FCSign · alerta global agora dispara por PAPEL (role) do user logado, não por email do signer.** User: "Não quero receber e-mail, quero alerta no usuário que precisa assinar, se eu sou o sócio adm quero que apareça para mim". Mudança em `server/routers/signatures.ts → pendingForCurrentUser`: se `user.role ∈ {admin_master, admin}`, retorna TODO signer pendente com `role='empregador'` nas empresas autorizadas (vínculo por PAPEL × PAPEL, não identidade pessoal); mantém também email-match pra empregados/testemunhas com conta. Ordem sequencial (Rev. 2119) e ACL por empresa preservadas. Mais robusto que Rev. 2127 (não depende de cadastrar email correto no signer nem de match por nome em `users`). **R-001/R-007/R-010:** OK — só query, zero DDL.

### Revisões recentes (one-liners)

- ~~Rev. 2128~~ — FCSign · alerta global por PAPEL (admin_master/admin recebem todo pendente `empregador` nas empresas autorizadas, server-side). Ver `shared/changelog.ts`.
- ~~Rev. 2127~~ — FCSign · backfill de `signature_signers.email` (empregado via `employees.email`, demais via `users.name`-match) — pré-requisito da Rev. 2128 e ainda útil pro email-match de empregados/testemunhas. Ver `shared/changelog.ts`.
- ~~Rev. 2126~~ — RH · Contrato de Experiência HOTFIX: numeração reinicia em 001/2026 (removido seed=33 + UPDATE one-shot zerando counter + NULL no employee=34). Ver `shared/changelog.ts`.
- ~~Rev. 2125~~ — RH · Contrato de Experiência: numeração automática NNN/AAAA sequencial, atômica, idempotente por empresa (`contract_counters` + UPSERT + `allocateContratoExperienciaNumero` + closure builder client). Ver `shared/changelog.ts`.
- ~~Rev. 2124~~ — RH · Contrato de Experiência: prazo + datas da CLÁUSULA 5ª destacados em VERMELHO `#c1121f` inline (6 spans `<strong>`). Ver `shared/changelog.ts`.

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
