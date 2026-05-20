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

- **Rev. 2191** — **MELHORIA UX · Ficha de Entrega de EPI agora exibe as fotos anexadas (estado do EPI no momento da troca).** Lilian: "esta faltando as fotos que foram anexadas aos documentos". **Contexto:** troca por `desgaste_normal`/`mau_uso` exige upload obrigatório de foto do EPI danificado (`epis.ts:403`) — salva em `epi_deliveries.foto_estado_url`. Mas o preview da ficha nunca renderizava esse campo. **Fix (Client `Epis.tsx`):** (1) hoisted `MOTIVO_TROCA_LABEL` p/ escopo de módulo (antes local na tabela L2449); (2) novo bloco "📷 FOTOS ANEXADAS (n)" entre tabela de EPIs e Policy Box (L1742-1774) — grid responsivo 2/3 colunas com thumbnails clicáveis (abrem em nova aba); legenda `nomeEpi — MOTIVO`. Bloco oculto quando nenhum item tem foto. `fotoEstadoUrl` já vinha no payload do `list` query (`epis.ts:283`). **Não-regressão:** Rev. 2190 (olhinho → preview in-app) intacto. **R-001/R-007/R-010:** OK — só client.
- **Rev. 2190** — **HOTFIX BLOQUEANTE · Assinatura de EPI "sumia" ao abrir a ficha via olhinho.** Lilian: "TEM MUITOS QUE NÃO ESTÃO ASSINADOS, MAS O SISTEMA ESTA FALANDO QUE ESTA... PESSOAL ESTA ASSINANDO, SALVANDO A ASSINTURA, MAS DEPOIS QUE VOU VERIFICAR A ASSINATURA ESTA SUMINDO". **Causa:** `assinaturaUrl` (PNG) é fonte de verdade do filtro "✓ Assinadas", mas `fichaUrl` (PDF) é gerado UMA ÚNICA VEZ na criação da entrega — antes de qualquer assinatura — e nunca é regerado automaticamente. O olhinho (Rev. 2186) chamava `window.open(d.fichaUrl)` → abria PDF unsigned em branco → usuário achava que a assinatura sumiu. **Fix (Client `Epis.tsx` L2530 + L2618):** olhinho passa a abrir o **preview IN-APP** (mesma ação do FileText), que renderiza `assinaturaUrl` como `<img>` sobre a linha de assinatura — garante que sempre apareça quando existir. Botão "Ver PDF Salvo" + "Salvar PDF" (regera fichaUrl) seguem dentro do dialog. **Não-regressão:** filtro tri-state (Rev. 2186) intacto; ⚠ âmbar sem assinatura intacto. **R-001/R-007/R-010:** OK — só client.

### Revisões recentes (one-liners)

- ~~Rev. 2189~~ — MELHORIA UX · Tabela do Relatório de Períodos HE mostra foto do colaborador (avatar 32px circular) à esquerda do nome via `employees.fotoUrl`. Fallback iniciais quando null. Ver `shared/changelog.ts`.
- ~~Rev. 2188~~ — HOTFIX UX · Dropdown "Filtrar por obra" do Relatório de Períodos HE listava QUALQUER obra em que o funcionário bateu ponto, mesmo sem HE. Fix server `semSolRows`: `tr."horasExtras" IS NOT NULL` + `NOT IN ('', '0', '0:00', '00:00', '0:0')`. Ver `shared/changelog.ts`.
- ~~Rev. 2187~~ — HOTFIX UX · Dropdown "Filtrar por obra" do Relatório de Períodos HE mostrava opção "Sem Obra" agrupando `time_records.obraId=NULL`. Fix: server `LEFT JOIN obras`→`JOIN obras` + `IS NOT NULL`; client pula `obraId==null`. Ver `shared/changelog.ts`.
- ~~Rev. 2186~~ — MELHORIA UX + HOTFIX VISUAL · Lista de Entregas de EPI: olhinho só com `assinaturaUrl`; entregas sem assinatura mostram ⚠ âmbar "Aguardando assinatura"; novo filtro tri-state Todas/✓ Assinadas/⚠ Não assinadas. Ver `shared/changelog.ts`.
- ~~Rev. 2185~~ — HOTFIX BLOQUEANTE · Filtro por OBRA no Relatório de Períodos HE mostrava linha "Aprovada" sob obra ERRADA. Fix: `obrasPorEmp` separado POR ORIGEM no server (aprovada via `he_solicitacoes`; sem_solicitacao via `time_records` + NOT EXISTS); client `obrasMap` re-chaveado `Map<"empId|origem", Set<obra>>`. Ver `shared/changelog.ts`.

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
