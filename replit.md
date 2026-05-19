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

- **Rev. 2116** — **Documentos institucionais FC · margem superior de 40mm (4cm) na 2ª página em diante — 1ª página mantém os 14mm.** User: "DE UM ESPAÇO MAIOR NO INICIO DA 2 FOLHA UMA MARGEM DE 4cm ja ajudaria..". Print da 2ª folha do Contrato de Experiência mostrava as cláusulas 5ª-8ª colando no topo (só 14mm de respiro). **Solução CSS @page (1 linha) em `client/src/lib/fcDocumentTemplate.ts` L188-189:** trocado `@page{size:A4;margin:14mm 10mm}` por `@page{size:A4;margin:40mm 10mm 14mm 10mm}` (40mm topo em TODAS) + `@page :first{margin:14mm 10mm}` (override só na 1ª, preserva cabeçalho logo+faixa). 1ª folha continua idêntica; 2ª em diante ganha 4cm de respiro. **Reuso:** vale auto pra qualquer doc futuro (Aviso Prévio, Rescisão, MDO). **Não-mudanças:** corpo, cláusulas, assinaturas, rodapé, helpers, Colaboradores, FCSign. **R-001/R-007:** N/A — frontend.
- **Rev. 2115** — **RH · Contrato de Experiência — CLÁUSULA 2ª (REMUNERAÇÃO) com valor em formato BR (R$ X.XXX,XX) + por extenso entre parênteses.** User: "quero o valor separado por ponto e virgula, e o valor escrito por extenso..". Antes: "R$ 3200.00" (formato US). Depois: "R$ 3.200,00 (três mil e duzentos reais)". **NOVO `client/src/lib/numeroExtenso.ts`** com 3 helpers reutilizáveis: `parseValor(v)` (normaliza string BR/US/number/com R$), `formatBRL(v)` (toLocaleString pt-BR 2 casas), `valorPorExtenso(v)` (extenso pt-BR completo até bilhões com centavos, regras gramaticais: "cem" vs "cento", "mil" sem "um", trios com vírgula+e, singular/plural reais/centavos). **`Colaboradores.tsx` L20:** import `formatBRL, valorPorExtenso`; L1907-1908: substituído `empSalario = esc(...)` por `empSalarioBRL = formatBRL(...)` + `empSalarioExtenso = valorPorExtenso(...)`; L1955 CLÁUSULA 2ª: `R$ ${empSalario}` → `R$ ${empSalarioBRL} (${empSalarioExtenso})` (ambos com `esc()` — XSS safe Rev. 2114). **Reuso futuro:** helpers ficam disponíveis para Aviso Prévio, Termo de Rescisão, Recibo, Carta MDO. **Não-mudanças:** template `buildFcDocument`, demais cláusulas, schema, backend, FCSign. **R-001/R-007:** N/A — frontend.

### Revisões recentes (one-liners)

- ~~Rev. 2114~~ — Documentos institucionais FC · template ÚNICO `buildFcDocument` (`client/src/lib/fcDocumentTemplate.ts`) substitui 108 linhas de HTML inline no Contrato de Experiência por 1 chamada. Ver `shared/changelog.ts`.
- ~~Rev. 2113~~ — RH · Contrato Experiência: botão "Salvar Experiência" emerald dedicado no card laranja + mutation `updateExperienciaMut` sem fechar modal. `Colaboradores.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2112~~ — RH · Contrato Experiência micro-ajustes finais: Nº/Data sem indent + ASSUNTO indent 0.5cm. Substituído pela Rev. 2114. `Colaboradores.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2111~~ — RH · Contrato Experiência faixa azul de volta DENTRO do corpo com `border-radius:4px` (sem `margin:-1.8cm` edge-to-edge). `Colaboradores.tsx` L1956-1958. Ver `shared/changelog.ts`.
- ~~Rev. 2110~~ — RH · Contrato Experiência cabeçalho ampliado pra bater proporcionalmente com Comunicado renderizado: logo 72→115px, razão social 13→19pt, CNPJ 9.5→11pt bold, faixa padding 11→18px texto 12→14pt. `Colaboradores.tsx`. Ver `shared/changelog.ts`.

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
