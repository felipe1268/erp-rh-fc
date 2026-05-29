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


- **Rev. 2535** — **PAINEL RH · OBRA DO FUNCIONÁRIO NOS CONTRATOS DE EXPERIÊNCIA.** User: "Quero que indique a obra que o funcionário está". Card "Contratos de Experiência" agora mostra badge emerald com ícone MapPin da obra alocada ao lado da função (ou "Sem obra" cinza quando sem alocação ativa). Server `server/routers/homeData.ts` (~L569): campo `obra` no map de experiencias, reusando `homeEmpObraMap`+`obraMap` JÁ existentes (alocações ativas em `obraFuncionarios`) — zero query nova. Client `client/src/pages/PainelRH.tsx` (~L255): Badge MapPin + import `MapPin`. Type-safe (string|null). Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2534** — **DEPLOY/SEGURANÇA · DESBLOQUEIO DO PUBLISH (Security Scan).** Publish do Replit abortava em "Security Scan" (antes do Build) com 1 CRITICAL + 60 HIGH. Ações: (a) bump diretas — `axios ^1.15.2` (inst 1.16.1), `drizzle-orm ^0.45.2`, `vite ^7.3.2` (inst 7.3.3), `@trpc/* 11.8.0`; (b) `xlsx` via tarball CDN SheetJS `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (NPM publica só 0.18.5 com proto-pollution sem fix); (c) `pnpm.overrides` p/ transitives: tar^7.5.11, fast-xml-parser^5.5.6, minimatch, undici^7.24.0, picomatch^4.0.4, tmp^0.2.6, uuid^11.1.1, node-fetch^2.6.7, rollup^4.59.0; (d) `path-to-regexp@<0.1.13 → 0.1.13` (preservando Express 4 — qualquer ^8 quebra com `pathRegexp is not a function`); (e) `pnpm install --force` p/ re-resolver lockfile. Bloqueio resolvido: override `pnpm: ">=10.27.0"` puxava 11.4 (exige Node 22) → removido do override + fixado em `devDependencies.pnpm: "10.27.0"` (pnpm é tool, não runtime — não pertence a audit nem override). Resultado: `critical=0`. xlsx mantém 2 highs "sem fix" — limitação upstream aceita. Arquivo: `package.json`. Workflow `Start application` RUNNING validado. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2533** — PLANEJAMENTO · CAMINHO B (FONTE ÚNICA = `PercentComplete`). 1 upload no cadastro grava `baseline_start/finish` por atividade E expande PREVISTO semana-a-semana pela fórmula nativa MSP (snapshot `previsto_semanas_json`); avanço semanal lê `PercentComplete`. Helper `regenerarPrevistoSemanasCaminhoB` (`server/routers/planejamento.ts` L96-203) + parser `<Baseline Number=0>` (`ImportarCronograma.tsx`). 3 colunas via SyncSchema+. Ver `shared/changelog.ts`.
- **Rev. 2532** — APONTAMENTOS DE CAMPO — Multi-select de funcionários no diálogo "Novo Apontamento". State `novoEmployeeIds: number[]`, chips pill, submit via `Promise.allSettled` com toast agregado. `client/src/pages/ApontamentosCampo.tsx` L1/L143-145/L554-616. Ver `shared/changelog.ts`.
- **Rev. 2531** — BUILD — OOM no `vite build` durante o deploy: heap 4096→8192 MB no vite, +4096 no esbuild. `package.json` L11 `NODE_OPTIONS=--max-old-space-size`. Causa: bundle ~70 chunks (vendor-webifc 3,48 MB, vendor-xlsx 1,37 MB, index 1,32 MB). Build validado 1m14s. Ver `shared/changelog.ts`.
- **Rev. 2530** — INVENTÁRIO SEMANAL — Busca + leitor de código de barras (scan → baixa BATE automática). Server `warehouse.getInventorySessionItems` ~L1086 +`itemCodigoBarras`+`itemCodigoInterno`; client `almoxarifado/Inventario.tsx` ~L452-520 input emerald ScanLine, Enter auto-confirma quando match EXATO por código OU 1 só pendente filtrado. Ver `shared/changelog.ts`.
- **Rev. 2529** — PAINEL RH — Contratos de Experiência com avatar do funcionário à esquerda. Server `homeData.ts` ~L560 +`fotoUrl` no return de experiencias; client `PainelRH.tsx` ~L242 row em flex gap-3 com `<PersonPhoto size="sm" />`. Padrão igual Aniversariantes/Férias. Ver `shared/changelog.ts`.

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

> Revisões anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **REGRA DE OURO — CAMINHO B (Rev. 2533+, substitui Rev. 2427).** FONTE ÚNICA = coluna `PercentComplete` do MS Project, lida nos dois momentos:
  - **% PREVISTO** (raiz e atividades) = EXPANSÃO de `PercentComplete` sobre `BaselineStart`/`BaselineFinish` pela fórmula nativa do MSP `floor(((cutoff − BL_Start) / (BL_Finish − BL_Start)) * 100)`, gerada uma vez no `salvarAtividades` (cadastro do cronograma) e congelada em `planejamento_projetos.previsto_semanas_json`. Matematicamente idêntico a varrer "Data do Status" no MSP semana a semana (Caminho A) — mesma fórmula, mesmo resultado, sem o trabalho repetido.
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` L96-203 + chamada pós-transaction em `salvarAtividades`), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` L470-490).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
