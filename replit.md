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

- **Rev. 2105** — **RH · FCSign — ajuste de layout do modal "Enviar para Assinatura" pra formato wide/2-colunas (regras de ouro).** Pedido do user (screenshot do modal Rev. 2104 680px estreito vertical, 3 cards empilhados): "ajuste o layout de forma que respeite as regras de ouro.. não gosto dele retangular como esta". **Mudanças em `client/src/components/FCSignSendDialog.tsx`:** (1) largura `sm:max-w-[680px]` → `sm:max-w-[960px]`; (2) **Linha 1: Empregado + Empregador lado a lado** em `lg:grid-cols-2` — Empregado ganhou 2 inputs labeled disabled (Nome/CPF) consistente com Empregador; (3) **Linha 2: card Testemunhas full-width** com `lg:grid-cols-2` interno separado por `lg:border-r`, sub-título amber Testemunha 1/2 cada uma com Nome (*) + CPF (opcional), placeholders "Ex.: João da Silva"; (4) tela success com 4 links agora `grid lg:grid-cols-2` 2x2; (5) hints "(opcional)" padronizados slate-400 normal-case. **Não-mudanças:** header gradient, backend, Felipe hardcoded. **R-001/R-007:** N/A — só frontend.
- **Rev. 2104** — **RH · FCSign — sistema interno de assinatura digital eletrônica.** Pedido do user (após Rev. 2102): "QUERO TER UMA PLATAFORMA INTERNA PARA QUE FACAMOS ASSINATURAS INTERNAS… NOSSO PROPRIO SISTEMA DE ASSINATURA, ELE TEM QUE TER A FUNCIONALIDADE DE ASSINATURA NO LINK." + auth: "PODE FAZER". Sem DocuSign/D4Sign (custo + LGPD + dependência SMTP). MP 2.200-2/2001: assinatura eletrônica simples com evidência (IP+hash+timestamp+aceite) vale no foro trabalhista. **Arquitetura:** (1) **Schema novo** (CREATE TABLE no Neon prod, R-001 OK): `signature_sessions` (company/employee/tipo/documentTitle/documentHtml/documentHash sha-256/status/finalDocUrl/finalEmployeeDocumentId) + `signature_signers` (sessionId/role empregado|empregador|testemunha_1|testemunha_2/nome/cpf/email/**token 64-char hex UNIQUE**/signedAt/signatureDataUrl PNG base64/signatureHash/ip/userAgent). (2) **Router `server/routers/signatures.ts`** com 5 procedures: `create` (protected, gera tokens crypto.randomBytes 32 bytes), **`getByToken` e `sign` (publicProcedure — sem auth!)**, `listByEmployee`, `cancel`. Quando todos assinam, `sign` chama `renderFinalHtml` que appenda bloco `<div>...assinaturas digitais — FCSign</div>` com cada `<img src=dataUrl>` + IP + hash; salva via `storagePut` em `fcsign/<companyId>/<employeeId>/sessao-<id>-assinado.html` text/html e **anexa automaticamente ao employeeDocuments tipo `contrato_trabalho`** (vínculo automático com RAIO-X). (3) **Rota pública `/assinar/:token`** em `App.tsx` ~L344 ANTES do `/` (Wouter pega primeira que casa). Página `AssinarDocumento.tsx` com header FC institucional #1B2A4A, layout 2-cols (documento scroll | painel: identidade + status assinaturas + canvas), 3 estados (cancelada/já assinada/ativa). Componente novo **`SignaturePad.tsx`** com canvas dpr-aware, onPointerDown/Move/Up/Leave (mouse+touch+caneta), `setPointerCapture`, lineWidth 2.2 round; `toDataURL()` compõe fundo branco + assinatura preta (economiza bytes), `clear()`/`isEmpty()` via forwarded ref. (4) **Integração em Contrato de Experiência (`Colaboradores.tsx` ~L1875-2055):** callback gigante de 130 linhas do "Imprimir" virou IIFE que calcula tudo uma vez + monta `const contratoHtml`, retorna `<div>` com 2 botões: Imprimir (orange, mantido) + **"Enviar para Assinatura (FCSign)" (gradient blue→indigo)** que bloqueia se `editingId == null` ("Salve o cadastro antes…"), preenche `fcsignPayload` e abre `<FCSignSendDialog>`. **Componente novo `FCSignSendDialog.tsx`:** header gradient blue→indigo→purple regras de ouro, body slate-50 com 3 cards (Empregado read-only verde / Empregador FC com **Felipe Costa Alves hardcoded** + CPF opcional / 2 Testemunhas nome obrigatório + CPF opcional). Após `create`: tela success com 4 cards de link com "Abrir" + "Copiar link" + URL completa em monospace truncada. **Captura compliance MP 2.200-2:** IP via `x-forwarded-for` (proxy Replit/Cloudflare) ou `req.socket.remoteAddress`, user-agent, timestamp UTC, hash SHA-256 do dataUrl exibido truncado 16chars no PDF final, hash do documento original em `document_hash` (detecta tamper). **Não-mudanças:** `storagePut`, schema antigo `employeeDocuments`, UI do Contrato (só callback). **Follow-ups:** painel "/admin/fcsign", WhatsApp Cloud API, botão FCSign em Aviso Prévio/Termo Rescisão. **R-001/R-007/R-010:** só CREATE TABLE (permitido). Nenhum ALTER/DROP/DELETE.
### Revisões recentes (one-liners)

- ~~Rev. 2103~~ — RH · Controle de Documentos / modal "Novo Documento do Colaborador" redesenhada nas regras de ouro (`ControleDocumentos.tsx` ~L1411-1576): header gradient emerald→cyan, body slate-50 com 2 cards (Identificação + Arquivo dropzone), footer pill. A11y fixes (DialogTitle sr-only, htmlFor/id, tabIndex). Ver `shared/changelog.ts`.
- ~~Rev. 2102~~ — RH · Contrato de Experiência ganhou cabeçalho institucional FC (logo + faixa azul #1B2A4A) em `Colaboradores.tsx` ~L1909. Mesmo padrão de Carta MDO + Comunicado Interno. Ver `shared/changelog.ts`.
- ~~Rev. 2101~~ — Frota · `parseTollPdf` fix "require is not defined" trocando `require("pdf-parse")` por `await import("pdf-parse")` (`package.json` é ESM `type: module`). Interop CJS via `.default`. Ver `shared/changelog.ts`.
- ~~Rev. 2100~~ — Frota · Pedágios / botão DEDICADO "Importar PDF" (rose) na barra superior ao lado de "Importar (IA)". `pdfFileRef` + `<input accept="application/pdf">` reusa `handleIaFileSelect` e mesmo modal Rev. 2096. Ver `shared/changelog.ts`.
- ~~Rev. 2099~~ — Frota · `parseTollPdf` aceita PDFs grandes (faturas Sem Parar/Caixa 100+ passagens) via pdf-parse + chunking por placa (regex `Descritivo: PLACA -`), CONCURRENCY=3 via `invokeLLM` text, prompt anti-spurious, fallback match por placa normalizada, limite frontend 10→15MB. Ver `shared/changelog.ts`.
- ~~Rev. 2098~~ — RH · alerta "Início de Férias" virou GLOBAL no módulo RH (não só `/ferias`) via novo `FeriasGozoPrompt` montado em `DashboardLayout`. Modal redesenhado nas regras de ouro. Limpeza em `Ferias.tsx`. Ver `shared/changelog.ts`.

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
