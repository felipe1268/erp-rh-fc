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

- **Rev. 2122** — **FCSign · painel de status do Contrato de Experiência + timeline na RAIO-X + admin_master pode apagar p/ nova emissão.** User: "depois que TODOS assinarem o documento, preciso que ao abrir aquela tela ja tenha um status mostrando que o documento esta assinado, com a opcao para baixar ou abrir o doc.. e nao permitindo mais o reenvio dos links... e neste mesmo local, o ADM master, pode cancelar ou apagar o documento para nova emisão.. somente o master pode fazer isso. e o documento assinado deve aparecer no raio-x do colaborador." Antes o botão "Enviar para Assinatura" SEMPRE abria o dialog vazio (permitia duplicar sessão) e a timeline da RAIO-X não tinha eventos FCSign. **Fix em 4 partes:** (A) Backend `signatures.ts` — `getForEmployeeTipo` (protected) retorna a sessão MAIS RECENTE não-cancelada de um colaborador+tipo enriquecida com signers (ordem, signedAt, token); `adminDelete` (protected + guard `ctx.user.role === 'admin_master'`) faz SOFT-DELETE (cancela sessão + deletedAt no employee_document associado) — cumpre R-001 sem DELETE físico. (B) Backend `controleDocumentos.ts::raioX` — query `signatureSessions + signatureSigners` por employee, adiciona `fcsignSessions` ao retorno, e injeta 4 tipos de eventos na timeline (enviado/assinatura/concluído/cancelado). (C) Novo `client/src/components/FCSignContratoExperienciaPanel.tsx` com 3 estados mutuamente exclusivos baseados em `getForEmployeeTipo`: SEM sessão → botão enviar; PENDENTE → card âmbar com lista de signers (Copy link + Open) + admin_master "Cancelar sessão"; COMPLETO → card emerald com Visualizar/Baixar + admin_master "Apagar p/ nova emissão". (D) `Colaboradores.tsx` substitui botão estático pelo painel + invalida `getForEmployeeTipo` no `onOpenChange` do dialog. **Limitação:** só `contrato_experiencia` ganhou painel — outros tipos seguem visíveis só pela RAIO-X. **R-001/R-007/R-010:** OK — soft-delete via UPDATE; sem ALTER/DROP/DELETE físico. **Hardening pós code-review (mesma rev.):** (i) `create` rejeita duplicidade server-side (CONFLICT se já existir sessão não-cancelada do mesmo employee+tipo); (ii) `cancel` restrito a `admin_master`; (iii) `getForEmployeeTipo`/`adminDelete`/`cancel` validam companyId via `getCompaniesForUser` (server-side ACL forte).
- **Rev. 2121** — **FCSign · alerta global automático de documentos pendentes pra assinatura ao logar no ERP.** User: "quando eu acessar o ERP e tiver algum documento pendente para minha assinatura, preciso que apareça na hora um aviso para seguir com as assinaturas e não ficar nada pendente". Antes, o user só descobria via email ou navegando até a RAIO-X. **Fix em 2 partes:** (A) Backend — nova procedure `signatures.pendingForCurrentUser` (protected, sem input) em `server/routers/signatures.ts` que usa `ctx.user.email` (case-insensitive) pra match com `signatureSigners.email`. Filtra `signedAt IS NULL` + `session.status IN ('pendente','em_andamento')`. Pós-filtro JS respeita ordem sequencial da Rev. 2119: só retorna se NÃO houver outro signer da MESMA sessão com `ordem < minha_ordem` pendente (i.e., é a vez do user). Retorna `{sessionId, signerId, token, ordem, documentTitle, createdAt}`. (B) Frontend — novo `client/src/components/FCSignPendingAlertGlobal.tsx` plugado no `DashboardLayout` (ao lado de `ReservasAlertModalGlobal`/`FeriasGozoPromptGlobal`). Usa `refetchInterval: 60s` + `refetchOnWindowFocus: true`. Pra cada doc dispara um toast persistente (sonner, `duration: Infinity`) com ícone azul, título do doc + botão "Assinar agora" abrindo `/assinar/:token` em nova aba (`noopener`). Set ref em memória evita duplicação na mesma sessão de aba. **Limitação:** match SOMENTE por email — se user logado tem email diferente do cadastrado no signer, alerta não aparece. **R-001/R-007/R-010:** OK — só SELECT, sem ALTER/DROP/DELETE.

### Revisões recentes (one-liners)

- ~~Rev. 2120~~ — FCSign · assinatura ESTAMPADA SOBRE a linha do contrato via placeholder HTML comment `<!--FCSIGN:SIG:{role}-->` + helper `stampSignaturesOnSlots` em `server/routers/signatures.ts` + fix sobreposição texto no painel sidebar `AssinarDocumento.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2119~~ — FCSign · fluxo SEQUENCIAL de assinatura + preview parcial com assinaturas estampadas a cada assinatura; `renderFinalHtml` ganha `isPreview`; `getByToken` enriquece HTML + `canSignNow`/`aguardando`; `sign` valida ordem; UI ↑/↓ + card âmbar "Aguardando". Ver `shared/changelog.ts`.
- ~~Rev. 2118~~ — RH · `codigoInterno` agora SEMPRE é gerado · novo helper `getMaxCodigoInternoNumero` em `server/db.ts`; `createEmployee` faz `COALESCE(...,0)+1` e realinha se colidir; `updateEmployee` preenche código vazio retroativamente. Ver `shared/changelog.ts`.
- ~~Rev. 2117~~ — Documentos institucionais FC · margem superior da 2ª página ajustada de 40mm para 25mm em `client/src/lib/fcDocumentTemplate.ts` L188. Ver `shared/changelog.ts`.
- ~~Rev. 2116~~ — Documentos institucionais FC · margem superior de 40mm (4cm) na 2ª página em diante via `@page` + `@page :first` em `client/src/lib/fcDocumentTemplate.ts`. Valor depois ajustado pra 25mm na Rev. 2117. Ver `shared/changelog.ts`.

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
