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

- **Rev. 2106** — **RH · Documentos institucionais — cabeçalho centralizado vira REGRA DE OURO + fix Contrato de Experiência no FCSign.** Pedido do user em 4 mensagens (logo não aparecia, texto não justificado, layout "amontoado", erro "conteúdo não permitido"), terminando com screenshot do Comunicado Interno como padrão: "este e o padrão que estamos adotando.. faça isso como regra de ouro". **Causa-raiz:** (a) `comp?.logoUrl` vinha vazio sem fallback; (b) `<style>` dentro de `<head>` era descartado pelo DOMPurify do `/assinar/:token`; (c) browsers desligam cores de fundo no print por default; (d) `onerror=` no `<img>` casava com filtro anti-XSS do `signatures.create`. **Fix em 3 camadas:** (1) **`Colaboradores.tsx` ~L1914-1958** `logoSrc` com fallback `${window.location.origin}/logo-fc.jpg`, inline styles em TODOS elementos críticos, `<style>` migrado pra dentro do `<body>`, `onerror` removido. (2) **`AssinarDocumento.tsx` L246-285** bloco `<style>` scopado em `.fcsign-document-body` injetado no JSX da página + `#fcsign-pdf-page * { print-color-adjust:exact }`. (3) **REGRA DE OURO** cabeçalho FC centralizado: logo 88px → razão social em caixa alta 16pt → CNPJ 9.5pt → endereço uppercase 9pt → faixa azul `#1B2A4A` full-width com border branco 2px → linha meta `Nº NNN/AAAA` esquerda + `Data de Emissão` direita. Aplicar em todos os docs oficiais (contrato, aviso prévio, termo rescisão, advertência). **Não-mudanças:** backend `signatures.create` intacto (filtro XSS mantido), schema, modal `FCSignSendDialog`. **Follow-up:** extrair `fcDocumentHeader.ts` helper. **R-001/R-007:** N/A — só frontend.
- **Rev. 2105** — **RH · FCSign — ajuste de layout do modal "Enviar para Assinatura" pra formato wide/2-colunas (regras de ouro).** Pedido do user (screenshot do modal Rev. 2104 680px estreito vertical, 3 cards empilhados): "ajuste o layout de forma que respeite as regras de ouro.. não gosto dele retangular como esta". **Mudanças em `client/src/components/FCSignSendDialog.tsx`:** (1) largura `sm:max-w-[680px]` → `sm:max-w-[960px]`; (2) **Linha 1: Empregado + Empregador lado a lado** em `lg:grid-cols-2` — Empregado ganhou 2 inputs labeled disabled (Nome/CPF) consistente com Empregador; (3) **Linha 2: card Testemunhas full-width** com `lg:grid-cols-2` interno separado por `lg:border-r`, sub-título amber Testemunha 1/2 cada uma com Nome (*) + CPF (opcional), placeholders "Ex.: João da Silva"; (4) tela success com 4 links agora `grid lg:grid-cols-2` 2x2; (5) hints "(opcional)" padronizados slate-400 normal-case. **Não-mudanças:** header gradient, backend, Felipe hardcoded. **R-001/R-007:** N/A — só frontend.

### Revisões recentes (one-liners)

- ~~Rev. 2104~~ — RH · FCSign — sistema interno de assinatura digital eletrônica (MP 2.200-2/2001). Schema `signature_sessions` + `signature_signers` (token 64-char), router público `getByToken`/`sign`, rota `/assinar/:token`, `SignaturePad.tsx` canvas dpr-aware, integração em Contrato de Experiência com botão "Enviar para Assinatura (FCSign)". Ver `shared/changelog.ts`.
- ~~Rev. 2103~~ — RH · Controle de Documentos / modal "Novo Documento do Colaborador" redesenhada nas regras de ouro (`ControleDocumentos.tsx` ~L1411-1576): header gradient emerald→cyan, body slate-50 com 2 cards (Identificação + Arquivo dropzone), footer pill. A11y fixes (DialogTitle sr-only, htmlFor/id, tabIndex). Ver `shared/changelog.ts`.
- ~~Rev. 2102~~ — RH · Contrato de Experiência ganhou cabeçalho institucional FC (logo + faixa azul #1B2A4A) em `Colaboradores.tsx` ~L1909. Mesmo padrão de Carta MDO + Comunicado Interno. Ver `shared/changelog.ts`.
- ~~Rev. 2101~~ — Frota · `parseTollPdf` fix "require is not defined" trocando `require("pdf-parse")` por `await import("pdf-parse")` (`package.json` é ESM `type: module`). Interop CJS via `.default`. Ver `shared/changelog.ts`.
- ~~Rev. 2100~~ — Frota · Pedágios / botão DEDICADO "Importar PDF" (rose) na barra superior ao lado de "Importar (IA)". `pdfFileRef` + `<input accept="application/pdf">` reusa `handleIaFileSelect` e mesmo modal Rev. 2096. Ver `shared/changelog.ts`.

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
