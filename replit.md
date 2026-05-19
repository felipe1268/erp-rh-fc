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

- **Rev. 2140** — **Documentos institucionais FC (`buildFcDocument`) · margens laterais padronizadas em 1,5cm (15mm) para melhor distribuição do texto em A4.** User (após screenshot do Termo de Responsabilidade no preview FCSign): "Arrume a margem lateral deixando 1,5cm como padrão, fica uma distribuição melhor." **Fix em `client/src/lib/fcDocumentTemplate.ts`:** `@page` 10mm → 15mm nas laterais (`25mm 15mm 14mm 15mm` + `:first 14mm 15mm`); `.fc-doc` container tela `padding:32px` → `padding:32px 1.5cm` para o preview espelhar o PDF; `@media print` `padding:8px` → `padding:8px 0` evita soma com `@page margin`. Aplica-se a TODOS os documentos institucionais (Comunicado, Contrato Experiência, Aviso Prévio, Termo Rescisão, Termo Responsabilidade, Advertência, Carta MDO). **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2139** — **Termo de Responsabilidade · corpo do doc reescrito FIEL ao modelo .docx aprovado + hardening de fotos (rejeita HEIC, valida toDataURL) para eliminar erro "The string did not match the expected pattern" no iPad.** User mandou screenshot do toast nativo iOS + 2 fotos pretas: "Está com erro... precisa que o termo modelo seja criado automaticamente com os dados... mesmo padrão do comunicado e contrato de experiência" + anexou `Termo_Responsabilidade_Geral.docx`. **Causa fotos pretas:** iPhone/iPad captura HEIC; Safari iOS cria `<img>` mas `canvas.toDataURL("image/jpeg")` retorna `"data:,"` vazio. Esse `<img src="data:,">` no HTML enviado disparava o erro nativo do WebKit downstream. **Fix em `client/src/components/TermoResponsabilidadeDialog.tsx`:** (1) `comprimirImagem()` rejeita HEIC/HEIF upfront com toast educativo (Câmera→Formatos→"Mais Compatível"), valida `naturalWidth/Height>0`, try/catch em `drawImage`+`toDataURL`, valida que data URL começa com `data:image/jpeg;base64,` e `length>200`. (2) Helper `fotosValidas()` filtra fotos quebradas antes de embutir no HTML. (3) Corpo reescrito palavra-por-palavra do .docx: declaração + `<ul>` com 6 categorias gerais + tabela RELAÇÃO ESPECÍFICA + CLÁUSULA 1ª `<ol>` com 5 compromissos + CLÁUSULA 2ª `<ul>` com 7 motivos + art. 462§1º CLT + CLÁUSULA 3ª `<ul>` veículos + CLÁUSULA 4ª vigência + "Por estarem de pleno acordo, firmam o presente termo." + local/data. Mantém `buildFcDocument` (regra de ouro: header navy, logo FC, razão caixa alta, faixa Nº/Data, assinaturas). **R-001/R-007/R-010:** OK — só client-side.

### Revisões recentes (one-liners)

- ~~Rev. 2138~~ — UX: `TermoResponsabilidadeDialog` migrado de `<Dialog>` shadcn (max-w-4xl) para `FullScreenDialog` com header navy + zIndex=70 + footer sticky 2-variantes + thumbs maiores. Ver `shared/changelog.ts`.
- ~~Rev. 2137~~ — NOVO Termo de Responsabilidade (entrega equip/veículos/EPIs) com fluxo FCSign completo: lista livre de itens + fotos + numeração sequencial 001/2026 + múltiplos termos ativos por colaborador. signatures.create dedup exceção termo_responsabilidade; nova mutation `allocateTermoResponsabilidadeNumero` (UPSERT atômico + ACL). Ver `shared/changelog.ts`.
- ~~Rev. 2136~~ — Contrato de Experiência · validação consolidada de pré-requisitos ANTES de gerar/enviar (toast.error listando bullets de campos faltando, aplicado em Imprimir + Enviar p/ Assinatura FCSign). Ver `shared/changelog.ts`.
- ~~Rev. 2135~~ — FCSign · Cancelar sessão de contrato_experiencia também REMOVE `employee_contracts` (criado em Rev. 2134) com filtro `criadoPor='FCSign'`. Ver `shared/changelog.ts`.
- ~~Rev. 2134~~ — FCSign · Contrato de Experiência aparece em "Contratos CLT" do RAIO-X JÁ NA CRIAÇÃO da sessão + backfill SQL p/ sessões pré-existentes. Ver `shared/changelog.ts`.

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
