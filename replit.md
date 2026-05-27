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


- **Rev. 2495** — **TERCEIROS · Padronização: nomes SEMPRE em MAIÚSCULAS + lista SEMPRE em ordem alfabética por nome.** User (image_1779887776356, all-caps): "QUERO QUE TODOS OS NOMES SEMPRE FIQUEM EM MAIUSCULO PARA PADRONIZAÇÃO.. E SEMPRE FIQUE ORGANIZADO EM ORDEM ALFABETICA.." — screenshot mostrava mix de Title Case ("Alessandro Ferreira Da Silva", "Anderson Gonçalves Benedito", "Ari Vieira Povoa") e UPPERCASE ("AILTON NASCIMENTO S. COSTA", "BENEDITO APARECIDO DOS SANTOS"), sem ordem clara. 4 alterações: (1) Backend `server/routers/terceiros.ts` — `funcionarios.create` (L544) e `funcionarios.update` (L591-600) normalizam `nome` com `.toUpperCase()` antes do persist — single-source-of-truth pra qualquer caller (UI, importador, script). (2) Frontend `FuncionariosTerceiros.tsx` L564 — input "Nome Completo" com `onChange={...toUpperCase()}` + `style:{textTransform:"uppercase"}` (UX visual imediata sem flicker). (3) L455 — `<h3>` virou `(func.nome||"").toUpperCase()` pra cobrir registros LEGADOS sem precisar de UPDATE em massa no DB. (4) L152 — `filtered` useMemo ganhou `.sort()` final com `localeCompare("pt-BR", {sensitivity:"base"})` — alfabética pt-BR acento+case-insensitive; cópia via `[...list]` pra não mutar query. Filtros existentes (busca, aptidão, empresa) continuam aplicando ANTES do sort. Sem schema change, sem migration. Detalhe: `shared/changelog.ts`.
- **Rev. 2494** — **TERCEIROS · BUGFIX CRÍTICO — "Atualizar" não salvava por falha silenciosa da validação Zod (`null` em `z.string().optional()`) + ausência de `onError`.** User (image_1779887735657): "TO CLICANDO EM ATUALIZAR, MAS ELE NÃO ESTA SALVANDO AS ALTERAÇÕES.. PQ?". Causa raiz: `openEdit` faz `setForm({...func})` espalhando linha do banco direto — campos vazios voltam como `null` (cpf, rg, email, cep...), mas o schema do `terceiros.funcionarios.update` em `server/routers/terceiros.ts` usava `z.string().optional()` (= `string|undefined`, NÃO `string|null`). tRPC rejeitava com BAD_REQUEST e o frontend (que só tinha `onSuccess`, sem `onError`) engolia o erro — nenhum toast, nenhum feedback. Fix: (1) Backend L553-600 — todos os 17 campos string viraram `.nullish()` (`string|null|undefined`), idem `obraId`/enums; (2) `empresaTerceiraId: z.number().nullish()` ADICIONADO ao schema (UI permitia trocar empresa mas backend estripava silenciosamente); (3) handler ganhou limpeza `Object.entries(data).filter(v!==undefined)` antes do `set()` — `null` passa (intencional p/ limpar), `undefined` é removido (não sobrescreve sem intenção); (4) early-return se payload limpo ficar vazio (evita SQL inválido); (5) Frontend L66-76 — `createMut`/`updateMut` ganharam `onError: e => toast.error(...)`. Bônus: schema do `create` mantido com `.optional()` pq form "Novo" começa vazio. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2493** — TERCEIROS · Campo "Função" virou Combobox vinculado ao catálogo `jobFunctions` (saiu de texto livre). Novo `FuncaoCombobox.tsx` compartilhado entre Colaboradores e FuncionariosTerceiros. Ver `shared/changelog.ts`.
- **Rev. 2492** — EFETIVO DA OBRA (Planejamento) · Gráfico "Distribuição por Função" virou clicável — filtra Lista de Funcionários (cross-filter), pill removível, "Limpar" global zera 4 filtros. `PlanejamentoDetalhe.tsx` L11287/11340/11530. Ver `shared/changelog.ts`.
- **Rev. 2491** — EFETIVO DA OBRA · Redesign modal "Transferir em Lote" — header FC #1B2A4A, fluxo De→Para, chips, progresso real (bulkProgress), atalhos Esc/Ctrl+Enter, responsivo. `PlanejamentoDetalhe.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2490** — USUÁRIOS & PERMISSÕES · "Dashboards RH" explodido em 13 entradas (master + 12 dashboard_*) em `shared/modulePages.ts` módulo `rh.pages`. `PageRouteMap` intacto. Ver `shared/changelog.ts`.
- **Rev. 2489** — FOLHA · Cálculo Interno + Consolidações persistindo de verdade — helper `ensurePeriodExists` chamado em 11 mutations (gerarVale, realizarAfericao×2, simularPagamento + 8 consolidar/desconsolidar) corrige UPDATEs que afetavam 0 linhas. `server/routers/payrollEngine.ts` L204-251. Ver `shared/changelog.ts`.

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
- **REGRA DE OURO — Leitura do XML do MS Project (Rev. 2427+, vale pra TODAS as obras).** Fonte ÚNICA pra cronograma e avanços semanais. Validada com paridade 100% no XML HOTEL DO PAPA (BL 25/05/2026). Conventions canônicas:
  - **% PREVISTO** (raiz e atividades) = `Texto6` (FieldID 188743746) puro do XML. O MSP calcula via fórmula `Int(((StatusDate − BL_Start)/(BL_Finish − BL_Start))*100)` sobre as datas da BASELINE — não precisa ler `<Baseline>` separado. Fallback compatível: Texto10 (188743750) → Texto11 (188743997).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` nativo do MSP. ZERO heurística (Texto7, AD/(AD+RD), Texto9, Texto12, PhysicalPercentComplete ficaram fora — não são a coluna que o engenheiro vê na tela).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
  - Implementação: `client/src/pages/planejamento/ImportarCronograma.tsx` (bloco "REGRA DE OURO" L257-281).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
