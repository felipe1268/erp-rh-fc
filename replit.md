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

- **Rev. 2109** — **RH · Contrato de Experiência — cópia 1:1 do PDF modelo do Comunicado Interno (cada detalhe).** User (4ª iteração, frustrado com diferenças residuais): "quero uma copia exata, no tamanho da letra, tamanho do logo, ajuste da tela de impresasõ e recuo das abas laterais.. cada detalhe". **Medições do PDF modelo aplicadas:** fonte CORPO Helvetica/Arial 10.5pt (era Times 11.5pt); logo 72px (era 88px); razão social 13pt 700 (era 16pt 800); faixa azul **full-width edge-to-edge** via `margin:18px -1.8cm 0 -1.8cm` (sem border-radius, sem border branco, sem box-shadow); bloco ASSUNTO **sem fundo, sem border** — só indent 1cm + label/valor uppercase 10.5pt em 2 linhas; cláusulas 1ª-8ª refeitas como `<p><strong>CLÁUSULA Nª — TÍTULO.</strong> Texto...</p>` (sem painel border-left navy); margens A4 1.5cm; rodapé ganhou "| Por: ${userName}" via `useAuth()`. **`Colaboradores.tsx` L1928-2050** refatoração ampla. **`AssinarDocumento.tsx` L150-165/L294-305/L356-365**: page A4 padding 15mm uniforme, fonte Helvetica 10.5pt, `overflow:hidden` (pra conter margin-negativo edge-to-edge da faixa), CSS scopado **reduzido ao mínimo** (removidas ~20 linhas de regras `.header`, `.title-bar`, `.clausula`, `.assinaturas` que conflitavam com inline styles). **Não-mudanças:** estrutura jurídica, backend, DOMPurify, schema, modal de leitura Rev. 2108. **Follow-up CRÍTICO (3ª vez):** extrair `fcDocumentTemplate.ts` com 4 helpers (`openBody`, `header`, `assunto`, `footer`) — sem isso cada novo doc vai exigir 4 iterações. **R-001/R-007:** N/A — frontend.
- **Rev. 2108** — **RH · FCSign — viewer mais largo + modo "Leitura em Tela Cheia" com CTA "Ir para Assinatura" no fim.** User pediu (após Rev. 2107 ficou com preview estreito demais): "quero a tela mais larga.. e ou tire a tela e coloque um botão de olho para o usuário clicar, ler em tela full screem e depois no final clicar na assinatura de assinar". **Fez AS DUAS coisas:** (1) viewer principal `max-w-5xl` (1024px) → `max-w-[1400px]` em header/main/footer, sidebar 360→340px, maxHeight 75vh→82vh — cabe A4 (210mm) confortavelmente em telas 1440p+; (2) botão azul `<Eye/>` "Ler em tela cheia" na toolbar abre overlay `fixed inset-0 z-50` com header navy + documento A4 centralizado em fundo slate-700 + **CTA orgânico no FIM** (border tracejado, texto "Você leu o documento até o final" + botão grande emerald→teal "Ir para Assinatura" com `<PenLine/>`) + **sticky footer** branco com mesmo botão pra UX safety net. Estados guardados: se sessão cancelada/já assinada, CTA somem (substituídos por badge "Documento já assinado por você"). **Arquivo único:** `client/src/pages/AssinarDocumento.tsx` (+ imports Eye/X/PenLine, state `readerOpen`, ~100 linhas novas no modal). **Não-mudanças:** DOMPurify, backend, schema, HTML do contrato. **UX rationale:** fluxo "leu → entendeu → assinou" exigido pela MP 2.200-2/2001 (manifestação de vontade informada). **R-001/R-007:** N/A — só frontend.

### Revisões recentes (one-liners)

- ~~Rev. 2107~~ — RH · Contrato de Experiência alinhado ao modelo do Comunicado Interno: adicionado bloco ASSUNTO (slate-50 + border-left navy) + rodapé institucional (`Colaboradores.tsx` L1960-1964/L2033-2037). Ver `shared/changelog.ts`.
- ~~Rev. 2106~~ — RH · Cabeçalho FC institucional centralizado vira REGRA DE OURO (logo + razão social uppercase + CNPJ + endereço + faixa azul #1B2A4A) + fix Contrato de Experiência no FCSign (logo fallback, `<style>` no body, inline styles, `onerror` removido). Ver `shared/changelog.ts`.
- ~~Rev. 2105~~ — RH · FCSign — modal "Enviar para Assinatura" refatorado pra wide/2-colunas (`sm:max-w-[960px]`): Empregado+Empregador lado a lado, card Testemunhas full-width com 2 sub-colunas. `FCSignSendDialog.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2104~~ — RH · FCSign — sistema interno de assinatura digital eletrônica (MP 2.200-2/2001). Schema `signature_sessions` + `signature_signers` (token 64-char), router público `getByToken`/`sign`, rota `/assinar/:token`, `SignaturePad.tsx` canvas dpr-aware, integração em Contrato de Experiência com botão "Enviar para Assinatura (FCSign)". Ver `shared/changelog.ts`.
- ~~Rev. 2103~~ — RH · Controle de Documentos / modal "Novo Documento do Colaborador" redesenhada nas regras de ouro (`ControleDocumentos.tsx` ~L1411-1576): header gradient emerald→cyan, body slate-50 com 2 cards (Identificação + Arquivo dropzone), footer pill. A11y fixes (DialogTitle sr-only, htmlFor/id, tabIndex). Ver `shared/changelog.ts`.

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
