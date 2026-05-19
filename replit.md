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

- **Rev. 2127** — **FCSign · alerta global de assinatura pendente agora dispara pro EMPREGADOR — bug: signers eram criados SEM email, e o match do alerta é `signers.email == user.email`.** User: "após assinatura do documento do contrato de experiência não está aparecendo o alerta na minha tela para que eu lembre de assinar este documento". Causa: `FCSignSendDialog` montava signers com `{role,nome,cpf}` sem email → `signatures.create` salvava `email=NULL` → `pendingForCurrentUser` (Rev. 2121) que faz `WHERE LOWER(signers.email)=LOWER(user.email)` retornava vazio → toast nunca aparecia. **Fix em 2 camadas:** (1) `server/routers/signatures.ts` — import `users` + bloco antes do INSERT que resolve email automaticamente: role='empregado' → `employees.email` via `employeeId` da sessão; demais roles → `users.email` por `LOWER(users.name)=LOWER(signers.nome)` filtrando `deleted_at IS NULL`. Precedência: email vindo do cliente (se houver). (2) `server/_core/index.ts` SyncSchema+ Rev. 2127 — backfill retroativo via 2 UPDATEs idempotentes (`email IS NULL AND signed_at IS NULL`) pra cobrir Felipe na sessão atual sem reemitir o contrato. Match por NOME (não CPF) pq `users` não tem coluna CPF — só `name/email/openId`. **R-001/R-007/R-010:** OK — UPDATE em coluna existente.
- **Rev. 2126** — **RH · Contrato de Experiência HOTFIX: numeração agora reinicia em 001/2026 (eu havia seedado o counter em 33 por erro de interpretação na Rev. 2125).** User: "Na0 zerou o número do contrato pq?". Releitura do pedido original: "este é o primeiro" → deve ser **001**, não 034 (eu havia interpretado 034 como ponto de partida). **Fix em 2 partes em `server/_core/index.ts` (bloco Rev. 2125+2126):** (1) removida a linha `INSERT ... seed=33` → counter nasce vazio → 1ª alocação cai no `INSERT VALUES (1)` do UPSERT → 001/AAAA; (2) one-shot idempotente: `UPDATE contract_counters SET ultimo_seq=0 WHERE ultimo_seq IN (33,34)` (reseta seed bruto + seed+1 da única alocação ruim, preserva qualquer >=35 legítimo) + `UPDATE employees SET numero_contrato_experiencia=NULL WHERE numero_contrato_experiencia=34` (limpa a alocação errada da Lilian). Boots seguintes viram no-op. **R-001/R-007/R-010:** OK — apenas UPDATE em coluna recém-criada. Zero mudança em router/cliente.

### Revisões recentes (one-liners)

- ~~Rev. 2125~~ — RH · Contrato de Experiência: numeração automática NNN/AAAA sequencial, atômica, idempotente por empresa (`contract_counters` + UPSERT + `allocateContratoExperienciaNumero` + closure builder client). Ver `shared/changelog.ts`.
- ~~Rev. 2124~~ — RH · Contrato de Experiência: prazo + datas da CLÁUSULA 5ª destacados em VERMELHO `#c1121f` inline (6 spans `<strong>`). Ver `shared/changelog.ts`.
- ~~Rev. 2123~~ — RH · Contrato de Experiência usa JORNADA REAL do colaborador + bloqueia geração se jornada não definida (toast.error) + nova CLÁUSULA 4ª (HE Art. 59 CLT como prerrogativa empregador) + renumeração 5-9. Ver `shared/changelog.ts`.
- ~~Rev. 2122~~ — FCSign · painel de status do Contrato de Experiência (sem sessão→botão / pendente→card âmbar + signers / completo→card emerald + visualizar/baixar) + admin_master pode apagar p/ nova emissão (soft-delete) + timeline RAIO-X com eventos FCSign. Hardening: CONFLICT no `create`, ACL via `getCompaniesForUser`. Ver `shared/changelog.ts`.
- ~~Rev. 2121~~ — FCSign · alerta GLOBAL automático de docs pendentes pra assinatura ao logar · nova `signatures.pendingForCurrentUser` (match por email, respeita ordem sequencial) + `FCSignPendingAlertGlobal` plugado no `DashboardLayout` com toast persistente "Assinar agora" abrindo `/assinar/:token`. Ver `shared/changelog.ts`.

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
