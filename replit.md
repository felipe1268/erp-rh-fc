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

- **Rev. 2137** — **NOVO: Termo de Responsabilidade (entrega de equipamentos/veículos/EPIs) com fluxo FCSign completo — lista livre de itens, fotos do estado de conservação embutidas, numeração sequencial por empresa/ano, múltiplos termos ativos por colaborador.** User: "criar um termo de responsabilidade" com itens em lista livre + numeração sequencial (001/2026) + fotos do estado + envio via FCSign. **Implementação:** (1) `server/routers/signatures.ts` — dedup de `create` ganhou exceção `if (tipo !== 'termo_responsabilidade')` (Rev. 2122 bloqueava 2º termo do mesmo colaborador) + persist em `employee_documents` agora usa `tipo` da sessão (antes hard-coded 'contrato_trabalho'). (2) `server/routers.ts` — nova mutation `employees.allocateTermoResponsabilidadeNumero` (UPSERT atômico em `contract_counters`, **NÃO idempotente** ≠ contrato exp Rev. 2125). (3) NOVO `client/src/components/TermoResponsabilidadeDialog.tsx` (~660L): dialog 2-modos (LIST=lista sessões + status + admin cancel; COMPOSE=array dinâmico de itens com descrição/estado/fotos + local + data + observações), compressão de fotos client-side (canvas 800x600 + JPEG q=0.7 → data:URL embutida no HTML), validação consolidada, HTML via `buildFcDocument` com 4 cláusulas (Responsabilidade, Desconto art. 462§1º CLT, Veículos, Vigência). (4) `Colaboradores.tsx` — botão "Gerenciar Termos de Responsabilidade" na aba Documentos do form, mount top-level reusando `setFcsignPayload+setFcsignOpen`. **R-001/R-007/R-010:** OK — UPSERT/INSERT no fluxo normal, `adminDelete` reusado é soft.
- **Rev. 2136** — **Contrato de Experiência · validação consolidada de pré-requisitos ANTES de gerar/enviar (Imprimir + Enviar p/ Assinatura FCSign).** User: "Quando o usuário clicar para gerar o contrato de experiência, e tiver algum dado faltando para ser preenchido precisa gerar um alerta...para evitar documento com informações faltando". **Causa:** os 2 botões só bloqueavam quando a Jornada estava indefinida — demais campos (CPF/RG/CTPS/endereço/função/salário/datas exp/dados da empresa) podiam estar vazios e o template usa fallback `'________________'`, gerando contratos com lacunas literais. **Fix em `client/src/pages/Colaboradores.tsx`:** dentro do IIFE do bloco Contrato de Experiência, criado `validarPreReqsContratoExperiencia()` retornando lista de pendências (Empresa: razão/cnpj/endereço/cidade/UF; Empregado: nome/cpf/rg/ctps/endereço/cidade/UF/função/salário>0; Experiência: tipo/início/fim1/fim2; Jornada) + `exibirToastPreReqsFaltando()` que mostra `toast.error` com `whiteSpace:'pre-line'`, `maxWidth:480`, `duration:12000` listando bullets `• Campo`. Aplicado em ambos os onClick (Imprimir → toast "imprimir", onEnviar → toast "enviar para assinatura"). **R-001/R-007/R-010:** OK — só client-side.

### Revisões recentes (one-liners)

- ~~Rev. 2135~~ — FCSign · Cancelar sessão de contrato_experiencia também REMOVE `employee_contracts` (criado em Rev. 2134) com filtro `criadoPor='FCSign'`. Ver `shared/changelog.ts`.
- ~~Rev. 2134~~ — FCSign · Contrato de Experiência aparece em "Contratos CLT" do RAIO-X JÁ NA CRIAÇÃO da sessão + backfill SQL p/ sessões pré-existentes. Ver `shared/changelog.ts`.
- ~~Rev. 2133~~ — FCSign · Contrato de Experiência assinado também persistido em `employee_contracts` (INSERT/UPDATE quando `allSigned`) p/ aba "Contratos CLT" do RAIO-X. Ver `shared/changelog.ts`.
- ~~Rev. 2132~~ — HOTFIX FCSign · `pendingForCurrentUser` retornava zero: `sql\`...=ANY(${'$'}{array})\`` no Drizzle não serializa `number[]` como PG array — trocado por `inArray()` (3 ocorrências). Ver `shared/changelog.ts`.
- ~~Rev. 2131~~ — FCSign · alerta global virou popup MODAL `<Dialog>` bloqueante que reabre a cada navegação (useLocation wouter + dismissedAtLocationRef). Ver `shared/changelog.ts`.

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
