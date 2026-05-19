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

- **Rev. 2134** — **FCSign · Contrato de Experiência aparece em "Contratos CLT" do RAIO-X JÁ NA CRIAÇÃO da sessão (não espera último signer) + backfill SQL p/ sessões pré-existentes.** User: "Já temos o campo contratos e preciso que o contrato de experiência entre ali tbm.. para ficar salvo aqui no raio x do funcionário". **Causa:** Rev. 2133 só criava `employeeContracts` quando sessão completava — Lilian aguardando Felipe → registro nunca criado → aba vazia. **Fix (2 partes):** (1) `signatures.create`: quando `input.tipo==='contrato_experiencia'`, INSERT em `employeeContracts` IMEDIATAMENTE (mesmo SELECT idempotente da Rev. 2133), `conteudoGerado=input.documentHtml` (pré-assinatura, sobrescrito quando completar), SEM `contratoAssinadoUrl` ainda. (2) `server/_core/index.ts`: SQL `INSERT ... SELECT FROM signature_sessions sess JOIN employees emp WHERE sess.tipo='contrato_experiencia' AND sess.status<>'cancelado' AND NOT EXISTS (... ec ativo)` — backfill 1-shot pegando `sess.final_document_url` como `contrato_assinado_url` quando completo. Try/catch isolado em ambos. **R-001/R-007/R-010:** OK — INSERT idempotente protegido por NOT EXISTS.
- **Rev. 2133** — **FCSign · Contrato de Experiência assinado agora também é persistido em `employee_contracts` p/ aparecer na lista "Contratos CLT" do RAIO-X do colaborador (com link p/ visualizar/baixar).** User (screenshot iPad RAIO-X Lilian, aba Contratos CLT vazia): "O contrato de experiência precisa estar salvo aqui tbm... para visualizar ou baixar". **Contexto:** Rev. 2120 já criava `employeeDocuments` (timeline) + `signatureSessions.finalDocumentUrl` ao completar FCSign, mas a aba "Contratos CLT" lê de `employeeContracts` — tabela alimentada SÓ pelo fluxo manual `contracts.salvarContrato`. **Fix em `server/routers/signatures.ts → sign` (após estampar/upload do HTML final):** quando `session.tipo==='contrato_experiencia'` e `allSigned`, SELECT por `employeeId + tipo='experiencia' + status NOT IN ('encerrado','rescindido')`; se ZERO → INSERT em `employeeContracts` (`status='vigente'`, `dataInicio=emp.dataAdmissao`, funcao/salário/jornada do empregado, `conteudoGerado=finalHtml`, `contratoAssinadoUrl=url` + `contratoAssinadoKey=fileKey`, `criadoPor='FCSign'`); se EXISTE → UPDATE só anexando URL/key/updatedAt. Try/catch isolado: falha de persistência loga mas não bloqueia `success:true`. **R-001/R-007/R-010:** OK — só INSERT/UPDATE.

### Revisões recentes (one-liners)

- ~~Rev. 2132~~ — HOTFIX FCSign · `pendingForCurrentUser` retornava zero: `sql\`...=ANY(${'$'}{array})\`` no Drizzle não serializa `number[]` como PG array — trocado por `inArray()` (3 ocorrências). Ver `shared/changelog.ts`.
- ~~Rev. 2131~~ — FCSign · alerta global virou popup MODAL `<Dialog>` bloqueante que reabre a cada navegação (useLocation wouter + dismissedAtLocationRef). Ver `shared/changelog.ts`.
- ~~Rev. 2130~~ — FCSign · gate `enabled` do client relaxado p/ admin_master/admin sem email (complementa Rev. 2128). Ver `shared/changelog.ts`.
- ~~Rev. 2129~~ — HOTFIX iOS Safari · `fmtTs(ts)` no `FCSignContratoExperienciaPanel` (replace " "→"T" + isNaN guard) — toast falso "Erro ao alocar número do contrato" some. Ver `shared/changelog.ts`.
- ~~Rev. 2128~~ — FCSign · alerta global por PAPEL (admin_master/admin recebem todo pendente `empregador` nas empresas autorizadas, server-side). Ver `shared/changelog.ts`.

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
