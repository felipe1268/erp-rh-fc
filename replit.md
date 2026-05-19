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

- **Rev. 2114** — **Documentos institucionais FC · template ÚNICO `buildFcDocument` (`client/src/lib/fcDocumentTemplate.ts`) — fim das 10 micro-revisões no Contrato de Experiência.** User (10ª rev sem sucesso): "qual a sua dificuldade em manter o padrão dos documentos, me liste para que eu possa ajudar..". **Causa raiz identificada e listada honestamente ao user:** (1) Comunicado é JSX React com Tailwind, Contrato era HTML string isolada em `window.open()` — mundos diferentes sem template comum; (2) padding fantasma: `@page{margin:1.5cm}` + `body{padding:1.8cm}` somavam 3.3cm laterais jogando tudo pro meio; (3) medidas calibradas erradas (logo 115px vs real 64px `h-16`, faixa `letter-spacing:4px` vs `tracking-wider`); (4) sem template compartilhado, cada ajuste desincronizava. **Solução estrutural:** NOVO `fcDocumentTemplate.ts` com `buildFcDocument({empresa, titulo, numero, dataEmissao, assunto, corpoHtml, assinaturas, geradoPor, logoSrc})` retornando HTML inline-style replicando EXATAMENTE o visual do Comunicado React (container 760px, logo 64px, razão social 13pt navy, faixa 11pt letter-spacing 1.5px, ASSUNTO/corpo com border cinza, assinaturas border-top cinza, rodapé 8.5pt). `Colaboradores.tsx` L1928-2010: substituídas 108 linhas de HTML inline por 1 chamada `buildFcDocument({...})`. Próximos docs (Aviso Prévio, Rescisão, Advertência) agora triviais. **Não-mudanças:** Comunicado React intacto (zero risco), mutations, backend, FCSign, DOMPurify. **R-001/R-007:** N/A — frontend.
- **Rev. 2113** — **RH · Contrato de Experiência — botão "Salvar Experiência" dedicado dentro do card laranja (não fecha o modal).** User: "preciso ter um botão de salvar o para não perder o que ja foi feito.... ou ele so vai ficar salvo depois que assinar qual a logica?" Após explicação (Salvar geral fica no rodapé do formulão + FCSign não salva), escolheu **Opção B**: botão dedicado. **Implementação `Colaboradores.tsx`:** (1) L357-365 nova mutation `updateExperienciaMut` (cópia do `updateMut` SEM `setDialogOpen(false)` no onSuccess, toast "Dados do Contrato de Experiência salvos!", invalidate `employees.list` + `getById`); (2) L2043-2067 novo botão emerald→teal "Salvar Experiência" com `<Save/>` ANTES do "Imprimir" no flex, disabled enquanto `isPending || !editingId || !comp?.id`, payload mínimo (só os 6 campos `experienciaTipo/Inicio/Fim1/Fim2/Status/Obs`); (3) L16 import `Save` adicionado ao lucide-react. **Não-mudanças:** `updateMut` original intacto, schema/backend `employees.update` — nada tocado. **R-001/R-007:** N/A — frontend.

### Revisões recentes (one-liners)

- ~~Rev. 2112~~ — RH · Contrato Experiência micro-ajustes finais: Nº/Data sem indent + ASSUNTO indent 0.5cm. Substituído pela Rev. 2114. `Colaboradores.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2111~~ — RH · Contrato Experiência faixa azul de volta DENTRO do corpo com `border-radius:4px` (sem `margin:-1.8cm` edge-to-edge). `Colaboradores.tsx` L1956-1958. Ver `shared/changelog.ts`.
- ~~Rev. 2110~~ — RH · Contrato Experiência cabeçalho ampliado pra bater proporcionalmente com Comunicado renderizado: logo 72→115px, razão social 13→19pt, CNPJ 9.5→11pt bold, faixa padding 11→18px texto 12→14pt. `Colaboradores.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2109~~ — RH · Contrato Experiência refatorado pra Helvetica 10.5pt + faixa edge-to-edge + bloco ASSUNTO simples + cláusulas inline-bold + rodapé "| Por: userName". Padrão visual depois reajustado nas Rev. 2110/2111. `Colaboradores.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2108~~ — RH · FCSign — viewer `max-w-5xl`→`max-w-[1400px]`, sidebar 360→340px, maxHeight 75→82vh + modo "Leitura em Tela Cheia" (`<Eye/>`) com CTA "Ir para Assinatura" emerald→teal no fim do doc + sticky footer. `AssinarDocumento.tsx`. Ver `shared/changelog.ts`.

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
