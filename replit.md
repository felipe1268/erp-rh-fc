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

- **Rev. 2119** — **FCSign · fluxo SEQUENCIAL de assinatura + preview parcial com assinaturas estampadas A CADA assinatura.** User: "ja assinei o documento mas as assinatura não esta aparecendo aqui pq?" + "quero poder escolher a sequencia de aprovação". Antes: `renderFinalHtml` só rodava ao completar TUDO; sem validação de ordem; doc mostrado ao signatário era o template original sem nada de assinatura. **Fix em 3 frentes (schema `ordem` JÁ existia):** (A) `server/routers/signatures.ts::renderFinalHtml` ganha `opts.isPreview` — pendentes viram caixa âmbar "⏳ Aguardando" com badge "Nª"; (B) `getByToken` retorna `session.documentHtml` JÁ ENRIQUECIDO com bloco de assinaturas inline + flags `canSignNow`/`aguardando` (nome/role/ordem de quem está bloqueando); (C) `sign` valida ordem (SELECT pendentes com `ordem < minhaOrdem`; se algum, recusa `BAD_REQUEST`). (D) `FCSignSendDialog.tsx` state `roleOrder: ['empregado','empregador']` com setas ↑/↓ por card + badge "Nª" + banner explicando fluxo sequencial; testemunhas sempre no fim (3ª/4ª). (E) `AssinarDocumento.tsx` lê `canSignNow`/`aguardando`; quando bloqueado, mostra card âmbar "Aguardando assinatura anterior · Nª · nome" SEM SignaturePad. Painel de assinaturas mostra ordem (1ª, 2ª…) com destaque azul no "(você)". **Fluxo agora:** Lilian assina 1º → Felipe vê preview com assinatura dela + "Aguardando" nele → Felipe assina → doc final com 2 assinaturas vai pro RAIO-X. **R-001/R-007/R-010:** OK — só SELECT/UPDATE, sem ALTER/DROP/DELETE; backward-compat (signers antigos sem `ordem` caem no `?? 0`).
- **Rev. 2118** — **RH · Colaboradores · `codigoInterno` agora SEMPRE é gerado — fix preventivo no `createEmployee` + fix retroativo no `updateEmployee`.** User: "VC CRIOU A LILIAN mas pq o codigo interno não foi criado automaticamente? resolve isso e crie o codigo apartir do ultimo criado". Lilian foi cadastrada com `codigoInterno = NULL` porque o counter `nextCodigoInterno` da empresa estava desincronizado / NULL — gerava colisão e o retry escapava silenciosamente. **Fix em `server/db.ts`:** (A) NOVO helper `getMaxCodigoInternoNumero(db, companyId, prefixo)` que faz `SELECT MAX(CAST(REGEXP_REPLACE(codigoInterno,'\D','','g') AS INTEGER))` da empresa — fonte da verdade independente do counter. (B) `createEmployee`: `UPDATE ... COALESCE(nextCodigoInterno,0)+1` (não vira NULL), e APÓS calcular `num`, se `num <= maxExistente`, realinha `num = maxExistente+1` e bumpa counter — impossível colidir. (C) `updateEmployee`: se employee atual está com `codigoInterno` vazio E update não está mudando, gera próximo via `maxExistente+1` (respeitando `numerosProibidos`) e adiciona ao sanitized. **Como usar o fix retroativo:** abrir cadastro da Lilian (ou de qualquer colaborador sem código) → clicar Salvar → código aparece. **R-001/R-007/R-010:** OK — só SELECT/UPDATE de colunas existentes, sem ALTER/DROP/DELETE, idempotente.

### Revisões recentes (one-liners)

- ~~Rev. 2117~~ — Documentos institucionais FC · margem superior da 2ª página ajustada de 40mm para 25mm em `client/src/lib/fcDocumentTemplate.ts` L188. Ver `shared/changelog.ts`.
- ~~Rev. 2116~~ — Documentos institucionais FC · margem superior de 40mm (4cm) na 2ª página em diante via `@page` + `@page :first` em `client/src/lib/fcDocumentTemplate.ts`. Valor depois ajustado pra 25mm na Rev. 2117. Ver `shared/changelog.ts`.
- ~~Rev. 2115~~ — RH · Contrato Experiência CLÁUSULA 2ª: valor em formato BR (R$ X.XXX,XX) + por extenso entre parênteses via novo helper `client/src/lib/numeroExtenso.ts` (`formatBRL` + `valorPorExtenso`). Ver `shared/changelog.ts`.
- ~~Rev. 2114~~ — Documentos institucionais FC · template ÚNICO `buildFcDocument` (`client/src/lib/fcDocumentTemplate.ts`) substitui 108 linhas de HTML inline no Contrato de Experiência por 1 chamada. Ver `shared/changelog.ts`.
- ~~Rev. 2113~~ — RH · Contrato Experiência: botão "Salvar Experiência" emerald dedicado no card laranja + mutation `updateExperienciaMut` sem fechar modal. `Colaboradores.tsx`. Ver `shared/changelog.ts`.

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
