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

- **Rev. 2111** — **RH · Contrato de Experiência — faixa azul de volta DENTRO do corpo (não edge-to-edge) com border-radius 4px, como o Comunicado renderizado.** User mandou print pós-Rev. 2110: "ainda não esta correto..". **Diagnóstico:** única divergência restante era a faixa azul que na Rev. 2109 forcei edge-to-edge (margin lateral negativo -1.8cm) baseado em leitura incorreta do PDF text-only. Mas no Comunicado VISUAL a faixa fica DENTRO do body com cantos arredondados leves. **`Colaboradores.tsx` L1956-1958:** `margin:22px -1.8cm 0 -1.8cm` → **`margin:22px 0 0 0`**; adicionado **`border-radius:4px`**. Resto (padding 18px, fonte 14pt 4px, cor) preservado. **Não-mudanças:** todas as medidas da Rev. 2110 (logo 115px, razão social 19pt, CNPJ 11pt, endereço 10pt, meta 11pt indent 1cm, ASSUNTO 11pt) mantidas. Cláusulas, assinaturas, rodapé, viewer FCSign, backend, DOMPurify — nada tocado. **Padrão FINAL:** logo 115px, razão social 19pt, CNPJ 11pt, endereço 10pt, faixa azul DENTRO do body com border-radius 4px (NÃO edge-to-edge), padding 18px texto 14pt 4px, meta 11pt indent 1cm, ASSUNTO 11pt indent 1cm. **Lição (6ª iteração no mesmo doc):** "ficar igual a X" sempre se refere ao renderizado VISUAL (PDF text-only descarta border-radius/padding/cores). **R-001/R-007:** N/A — frontend.
- **Rev. 2110** — **RH · Contrato de Experiência — cabeçalho aumentado pra bater PROPORCIONALMENTE com o Comunicado Interno (5ª iteração).** User mandou 2 prints lado a lado (contrato atual vs. Comunicado modelo): "veja que cabeçario, o tamanho do logo e ate a moldura não esta igual, preciso que deixae exatamente igual ao comunicado de interno". **Diagnóstico:** Rev. 2109 medi o PDF text-only e subdimensionei tudo achando que era "limpo" — mas o user referenciava o RENDERIZADO visual do Comunicado, que é bem maior. **Ajustes em `Colaboradores.tsx` L1948-1972:** logo 72→**115px** (max-width 180→260px); razão social 13pt→**19pt** bold uppercase letter-spacing .5px; CNPJ 9.5pt cinza→**11pt #1a1a1a font-weight 600**; endereço 9pt→**10pt** com letter-spacing .2px; faixa azul padding `11px 18px`→**`18px 24px`**, texto 12pt 3px→**14pt 4px**; linha meta Nº/Data 10pt cinza→**11pt #1a1a1a bold** + indent 1cm (alinhado com ASSUNTO); bloco ASSUNTO 10.5pt→**11pt** com letter-spacing .5px/.3px. **Padrão fixado pra próximos docs:** logo 115px, razão social 19pt, CNPJ 11pt, endereço 10pt uppercase, faixa azul padding 18px texto 14pt 4px, meta 11pt indent 1cm. **Não-mudanças:** cláusulas 1ª-8ª inline-bold (Rev. 2109), assinaturas, rodapé `| Por: userName`, `AssinarDocumento.tsx`, backend, DOMPurify, schema. **Follow-up CRÍTICO (4ª vez REALMENTE urgente):** extrair `fcDocumentTemplate.ts` ANTES de criar qualquer novo doc institucional. **R-001/R-007:** N/A — frontend.

### Revisões recentes (one-liners)

- ~~Rev. 2109~~ — RH · Contrato Experiência refatorado pra Helvetica 10.5pt + faixa edge-to-edge + bloco ASSUNTO simples + cláusulas inline-bold + rodapé "| Por: userName". Padrão visual depois reajustado nas Rev. 2110/2111. `Colaboradores.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2108~~ — RH · FCSign — viewer `max-w-5xl`→`max-w-[1400px]`, sidebar 360→340px, maxHeight 75→82vh + modo "Leitura em Tela Cheia" (`<Eye/>`) com CTA "Ir para Assinatura" emerald→teal no fim do doc + sticky footer. `AssinarDocumento.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2107~~ — RH · Contrato de Experiência alinhado ao modelo do Comunicado Interno: adicionado bloco ASSUNTO (slate-50 + border-left navy) + rodapé institucional (`Colaboradores.tsx` L1960-1964/L2033-2037). Ver `shared/changelog.ts`.
- ~~Rev. 2106~~ — RH · Cabeçalho FC institucional centralizado vira REGRA DE OURO (logo + razão social uppercase + CNPJ + endereço + faixa azul #1B2A4A) + fix Contrato de Experiência no FCSign (logo fallback, `<style>` no body, inline styles, `onerror` removido). Ver `shared/changelog.ts`.
- ~~Rev. 2105~~ — RH · FCSign — modal "Enviar para Assinatura" refatorado pra wide/2-colunas (`sm:max-w-[960px]`): Empregado+Empregador lado a lado, card Testemunhas full-width com 2 sub-colunas. `FCSignSendDialog.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2104~~ — RH · FCSign — sistema interno de assinatura digital eletrônica (MP 2.200-2/2001). Schema `signature_sessions` + `signature_signers` (token 64-char), router público `getByToken`/`sign`, rota `/assinar/:token`, `SignaturePad.tsx` canvas dpr-aware, integração em Contrato de Experiência com botão "Enviar para Assinatura (FCSign)". Ver `shared/changelog.ts`.

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
