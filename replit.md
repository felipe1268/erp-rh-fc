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

- **Rev. 2125** — **RH · Contrato de Experiência: numeração automática NNN/AAAA sequencial, atômica e idempotente por empresa.** User: "este é o primeiro que estávamos fazendo este ano (034/2026 atual), começe a contagem com ela, e todos os outros devem seguir, garantindo zero duplicidade". Antes o número era `padStart(editingId)/year` — i.e., ID do banco vazando + saltos enormes + reinício não voltava p/ 001. **Solução em 4 camadas:** (1) `drizzle/schema.ts`: nova tabela `contractCounters(company_id, ano, tipo, ultimo_seq)` + UNIQUE `(company_id, ano, tipo)` (espelho de `compras_sc_counters`/Rev. 1799) + 2 colunas em `employees`: `numero_contrato_experiencia` e `numero_contrato_experiencia_ano` (NULL até 1ª alocação, imutáveis depois). (2) `server/_core/index.ts` SyncSchema+ Rev. 2125: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS ...` (×2) + `CREATE TABLE IF NOT EXISTS contract_counters` + unique idx + **seed defensivo** `INSERT ... ON CONFLICT DO NOTHING` com `ultimo_seq=33` p/ ano corrente em toda company ativa → próxima alocação cai em 034/2026 (alinha com pedido do user). Pra 2027+, contador começa zerado → 001/AAAA. (3) `server/routers.ts → employees.allocateContratoExperienciaNumero`: mutation idempotente — se employee já tem `numeroContratoExperiencia` retorna existente; senão UPSERT atômico `INSERT ... ON CONFLICT DO UPDATE SET ultimo_seq+=1 RETURNING ultimo_seq` (mesmo padrão de `gerarProximoNumeroScAtomico`), grava em employee, devolve `{numero, ano}`. (4) `client/src/pages/Colaboradores.tsx`: hook `allocateContratoExpMut` + closure `buildContratoHtmlWithNumero(numeroStr)` + 2 onClick agora **async** (Imprimir + FCSign `onEnviar`) — chamam `mutateAsync` ANTES de gerar HTML; label do botão exibe `(Nº NNN/AAAA)` se já alocado; `documentTitle` do FCSign inclui o número. **Garantias:** UNIQUE INDEX impede race; idempotência por employee impede duplo-clique consumir 2 números; isolamento `(company,ano,tipo)` permite outros tipos de contrato futuros sem nova tabela. **Limitação intencional:** soft-delete de colaborador "queima" o número (compliance trabalhista exige ordem cronológica imutável). **R-001/R-007/R-010:** OK — apenas ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / INSERT ON CONFLICT DO NOTHING.
- **Rev. 2124** — **RH · Contrato de Experiência: prazo + datas da CLÁUSULA 5ª destacados em VERMELHO.** User: "quero também o prazo e data do contrato de experiência em vermelho para destaque". Single-file change em `client/src/pages/Colaboradores.tsx` — os 6 spans `<strong>` da CLÁUSULA 5ª (dias inicial, data início, data término previsto, dias prorrogação, total dias, data término final) ganharam `style="color:#c1121f"` (vermelho-bordô, contrasta bem em impressão e monitor; inline pra sobreviver à serialização DOMPurify/window.open). **R-001/R-007/R-010:** OK — cosmético client-side.

### Revisões recentes (one-liners)

- ~~Rev. 2123~~ — RH · Contrato de Experiência usa JORNADA REAL do colaborador + bloqueia geração se jornada não definida (toast.error) + nova CLÁUSULA 4ª (HE Art. 59 CLT como prerrogativa empregador) + renumeração 5-9. Ver `shared/changelog.ts`.
- ~~Rev. 2122~~ — FCSign · painel de status do Contrato de Experiência (sem sessão→botão / pendente→card âmbar + signers / completo→card emerald + visualizar/baixar) + admin_master pode apagar p/ nova emissão (soft-delete) + timeline RAIO-X com eventos FCSign. Hardening: CONFLICT no `create`, ACL via `getCompaniesForUser`. Ver `shared/changelog.ts`.
- ~~Rev. 2121~~ — FCSign · alerta GLOBAL automático de docs pendentes pra assinatura ao logar · nova `signatures.pendingForCurrentUser` (match por email, respeita ordem sequencial) + `FCSignPendingAlertGlobal` plugado no `DashboardLayout` com toast persistente "Assinar agora" abrindo `/assinar/:token`. Ver `shared/changelog.ts`.
- ~~Rev. 2120~~ — FCSign · assinatura ESTAMPADA SOBRE a linha do contrato via placeholder HTML comment `<!--FCSIGN:SIG:{role}-->` + helper `stampSignaturesOnSlots` em `server/routers/signatures.ts` + fix sobreposição texto no painel sidebar `AssinarDocumento.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2119~~ — FCSign · fluxo SEQUENCIAL de assinatura + preview parcial com assinaturas estampadas a cada assinatura; `renderFinalHtml` ganha `isPreview`; `getByToken` enriquece HTML + `canSignNow`/`aguardando`; `sign` valida ordem; UI ↑/↓ + card âmbar "Aguardando". Ver `shared/changelog.ts`.

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
