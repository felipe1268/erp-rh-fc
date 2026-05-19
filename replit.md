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

- **Rev. 2142** — **SECURITY/CONCORRÊNCIA · Hardening da Aba Templates de Documentos (Rev. 2141) após code review do architect.** Architect apontou 2 críticos: (1) **race condition** em `save()`/`restoreVersion()` (`server/routers/systemDocumentTemplates.ts`) — fluxo SELECT→UPDATE template→INSERT version sem transação podia deixar `versaoAtual` apontando pra estado sem entrada no histórico se 2 admins salvassem simultâneo (índice único `(template_id, versao)` falhava DEPOIS do UPDATE). Fix: ambas as procedures dentro de `db.transaction()` com `pg_advisory_xact_lock(hash(tipo))` + `SELECT FOR UPDATE` + INSERT version ANTES do UPDATE ponteiro (padrão usado em `planejamento.ts`/`frotas.ts`/`epis.ts`). (2) **XSS armazenado no preview** (`TemplatesDocsTab.tsx`) — `dangerouslySetInnerHTML` recebia conteúdo do banco sem sanitização (ACL admin não basta contra conta comprometida). Fix: `previewHtml` agora passa por `DOMPurify.sanitize()` com mesma config defensiva de `AssinarDocumento.tsx` (Rev. 2065) — FORBID script/iframe/form/etc + handlers `on*`. Backend continua salvando HTML cru (preserva `<style>` interno, classes `.clausula`, `print-color-adjust`). **R-001/R-007/R-010:** OK — só código.
- **Rev. 2141** — **NOVA FEATURE · Aba "Templates de Documentos" em Configurações com versionamento completo e editor WYSIWYG (Fase 1 — fundação).** User: "criar aba de templates na tela de critério... revisar e editar sem precisar usar o desenvolvimento... controle de revisão também". Escopo aprovado: 7 documentos (Contrato Experiência, Termo Responsabilidade, Comunicado, Advertência, Aviso Prévio, Termo Rescisão, Carta MDO), versionamento completo Rev. 1/2/3... com autor/data/restaurar, editor visual WYSIWYG. **Implementado nesta rev.:** (1) **DB** — 2 tabelas novas `system_document_templates` (id, tipo UNIQUE, conteudoHtml, versaoAtual) + `system_document_template_versions` (templateId, versao, conteudoHtml, comentario, autor, createdAt) em `drizzle/schema.ts` + `CREATE TABLE IF NOT EXISTS` em `server/_core/index.ts` (~linha 1693). **Não toca** `document_templates` legado do `controleDocumentos.ts`. (2) **Shared** — `shared/documentTemplates.ts` com `DOCUMENT_TEMPLATES_META` (7 tipos × placeholders por grupo) + helper `renderTemplate(html, dados)`. (3) **Backend** — `server/routers/systemDocumentTemplates.ts` com 5 procedures (`listAll/get/listVersions/save/restoreVersion`), ACL admin. (4) **Frontend Editor** — `client/src/components/RichTextEditor.tsx` (TipTap StarterKit + Underline + TextAlign + Placeholder, toolbar completa, expõe `insertText` via forwardRef). (5) **Frontend Aba** — `client/src/pages/configuracoes/TemplatesDocsTab.tsx` UI 3 colunas. **Fase 2 (próxima rev.):** refatorar os 7 builders hardcoded pra puxar do DB com fallback. **R-001/R-007/R-010:** OK — só CREATE TABLE IF NOT EXISTS em tabelas novas.

### Revisões recentes (one-liners)

- ~~Rev. 2140~~ — Documentos institucionais FC (`buildFcDocument`) · margens laterais padronizadas em 1,5cm (15mm) para melhor distribuição em A4. Aplica-se a TODOS os 7 docs institucionais. Ver `shared/changelog.ts`.
- ~~Rev. 2139~~ — Termo de Responsabilidade · corpo reescrito FIEL ao .docx + hardening fotos iOS (rejeita HEIC, valida toDataURL, helper fotosValidas) eliminando erro WebKit "string did not match expected pattern". Ver `shared/changelog.ts`.
- ~~Rev. 2138~~ — UX: `TermoResponsabilidadeDialog` migrado de `<Dialog>` shadcn (max-w-4xl) para `FullScreenDialog` com header navy + zIndex=70 + footer sticky 2-variantes + thumbs maiores. Ver `shared/changelog.ts`.
- ~~Rev. 2137~~ — NOVO Termo de Responsabilidade (entrega equip/veículos/EPIs) com fluxo FCSign completo: lista livre + fotos + numeração sequencial 001/2026 + múltiplos termos ativos por colaborador. Ver `shared/changelog.ts`.
- ~~Rev. 2136~~ — Contrato de Experiência · validação consolidada de pré-requisitos ANTES de gerar/enviar (toast.error listando bullets de campos faltando). Ver `shared/changelog.ts`.

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
