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

- **Rev. 2120** — **FCSign · assinatura ESTAMPADA SOBRE a linha do contrato + fix sobreposição texto no painel "Assinaturas" do sidebar.** User: "quero assinatura aparecendo acima do local indicado no documento, abaixo vc pode manter com todas as demais informações" + "arrume aqui tbm, esta com texto sobreposto". Antes: doc no FCSign mostrava as linhas de assinatura vazias (nome+CNPJ/CPF embaixo, sem imagem por cima); só o bloco de auditoria no final mostrava a assinatura. E no painel lateral o `<span w-16>` (64px) era curto e o nome do signatário vazava sobre o label "EMPREGADO(A)". **Fix em 4 frentes:** (A) `client/src/lib/fcDocumentTemplate.ts` — `FcAssinaturaParte` ganha campo opcional `role` ('empregado'|'empregador'|'testemunha_1'|'testemunha_2'); helper `slotHtml(role)` renderiza acima da linha um div de 50px com placeholder HTML comment `<!--FCSIGN:SIG:{role}-->`. (B) `server/routers/signatures.ts` — novo helper `stampSignaturesOnSlots(documentHtml, signers)` que faz `html.split(placeholder).join('<img src="data:..." style="max-height:50px;max-width:240px">')`. `signatureDataUrl` já vem validado por regex `^data:image/(png|jpeg);base64,…$` no `sign` → src seguro. Chamado em `getByToken` (preview) E `sign` (finalHtml persistido) → consistência. (C) `client/src/pages/Colaboradores.tsx` passa `role: 'empregador'` e `role: 'empregado'` no contrato de experiência. (D) `AssinarDocumento.tsx` sidebar: layout empilhado (label uppercase em cima, nome `break-words` embaixo) em vez de lado-a-lado com width fixo. **Backward-compat:** docs legados sem placeholder → `if (!html.includes(placeholder)) continue` → comportamento antigo preservado. **R-001/R-007/R-010:** OK — sem ALTER/DROP/DELETE; sem mudança schema.
- **Rev. 2119** — **FCSign · fluxo SEQUENCIAL de assinatura + preview parcial com assinaturas estampadas A CADA assinatura.** User: "ja assinei o documento mas as assinatura não esta aparecendo aqui pq?" + "quero poder escolher a sequencia de aprovação". Antes: `renderFinalHtml` só rodava ao completar TUDO; sem validação de ordem; doc mostrado ao signatário era o template original sem nada de assinatura. **Fix em 3 frentes (schema `ordem` JÁ existia):** (A) `server/routers/signatures.ts::renderFinalHtml` ganha `opts.isPreview` — pendentes viram caixa âmbar "⏳ Aguardando" com badge "Nª"; (B) `getByToken` retorna `session.documentHtml` JÁ ENRIQUECIDO com bloco de assinaturas inline + flags `canSignNow`/`aguardando` (nome/role/ordem de quem está bloqueando); (C) `sign` valida ordem (SELECT pendentes com `ordem < minhaOrdem`; se algum, recusa `BAD_REQUEST`). (D) `FCSignSendDialog.tsx` state `roleOrder: ['empregado','empregador']` com setas ↑/↓ por card + badge "Nª" + banner explicando fluxo sequencial; testemunhas sempre no fim (3ª/4ª). (E) `AssinarDocumento.tsx` lê `canSignNow`/`aguardando`; quando bloqueado, mostra card âmbar "Aguardando assinatura anterior · Nª · nome" SEM SignaturePad. Painel de assinaturas mostra ordem (1ª, 2ª…) com destaque azul no "(você)". **Fluxo agora:** Lilian assina 1º → Felipe vê preview com assinatura dela + "Aguardando" nele → Felipe assina → doc final com 2 assinaturas vai pro RAIO-X. **R-001/R-007/R-010:** OK — só SELECT/UPDATE, sem ALTER/DROP/DELETE; backward-compat (signers antigos sem `ordem` caem no `?? 0`).

### Revisões recentes (one-liners)

- ~~Rev. 2118~~ — RH · `codigoInterno` agora SEMPRE é gerado · novo helper `getMaxCodigoInternoNumero` em `server/db.ts`; `createEmployee` faz `COALESCE(...,0)+1` e realinha se colidir; `updateEmployee` preenche código vazio retroativamente. Ver `shared/changelog.ts`.
- ~~Rev. 2117~~ — Documentos institucionais FC · margem superior da 2ª página ajustada de 40mm para 25mm em `client/src/lib/fcDocumentTemplate.ts` L188. Ver `shared/changelog.ts`.
- ~~Rev. 2116~~ — Documentos institucionais FC · margem superior de 40mm (4cm) na 2ª página em diante via `@page` + `@page :first` em `client/src/lib/fcDocumentTemplate.ts`. Valor depois ajustado pra 25mm na Rev. 2117. Ver `shared/changelog.ts`.
- ~~Rev. 2115~~ — RH · Contrato Experiência CLÁUSULA 2ª: valor em formato BR (R$ X.XXX,XX) + por extenso entre parênteses via novo helper `client/src/lib/numeroExtenso.ts` (`formatBRL` + `valorPorExtenso`). Ver `shared/changelog.ts`.
- ~~Rev. 2114~~ — Documentos institucionais FC · template ÚNICO `buildFcDocument` (`client/src/lib/fcDocumentTemplate.ts`) substitui 108 linhas de HTML inline no Contrato de Experiência por 1 chamada. Ver `shared/changelog.ts`.

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
