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


- **Rev. 2532** — **APONTAMENTOS DE CAMPO · MULTI-SELECT DE FUNCIONÁRIOS no diálogo "Novo Apontamento".** User: "Preciso ter a opção de selecionar mais de 01 colaborador". State único `novoEmployeeIds: number[]` substitui `novoEmployeeId`. UI: label vira "Funcionário(s) *" com contador, chips azuis pill (X p/ remover) listados acima do input; sugestão exclui já selecionados; click adiciona, limpa input, refoca (setTimeout 0); placeholder vira "Adicionar outro funcionário…". `obraAtualId` só pre-seleciona a obra do PRIMEIRO func adicionado. Submit usa `Promise.allSettled` rodando `createMut.mutateAsync` 1× por id (mesma desc/horários/obra), toast agregado "N apontamentos registrados", 1 invalidate em `list`/`stats`, parciais → `toast.warning`. `createMut` agora só trata erro (sucesso orquestrado pelo botão). Botão Novo do header chama `resetNovoForm()` (que limpa chips + horários). Arquivos: `client/src/pages/ApontamentosCampo.tsx` L1/L143-145/L197-199/L258-267/L310/L554-616/L698-740. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2531** — **BUILD · OOM no `vite build` durante o deploy: heap subiu de 4096 MB → 8192 MB.** User: "My deployment build failed to publish". Reprodução local: `pnpm check` (tsc default 2 GB) e `pnpm build` (4 GB) ambos morriam com `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`. O bundle cresceu pra ~70 chunks com vários > 500 KB (`vendor-webifc` 3,48 MB, `vendor-xlsx` 1,37 MB, `index` 1,32 MB, `DashboardAtestadosAcidentes` 1,19 MB, `PlanejamentoDetalhe` 1,12 MB) — Vite 7/Rollup ultrapassa 4 GB de heap. Fix: `package.json` script `build` agora usa `NODE_OPTIONS='--max-old-space-size=8192'` no `vite build` e `--max-old-space-size=4096` no `esbuild`. Build validado: 1m14s, 8.6 MB `dist/index.js`. Arquivos: `package.json` L11. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2530** — INVENTÁRIO SEMANAL — Busca + leitor de código de barras (scan → baixa BATE automática). Server `warehouse.getInventorySessionItems` ~L1086 +`itemCodigoBarras`+`itemCodigoInterno`; client `almoxarifado/Inventario.tsx` ~L452-520 input emerald ScanLine, Enter auto-confirma quando match EXATO por código OU 1 só pendente filtrado. Ver `shared/changelog.ts`.
- **Rev. 2529** — PAINEL RH — Contratos de Experiência com avatar do funcionário à esquerda. Server `homeData.ts` ~L560 +`fotoUrl` no return de experiencias; client `PainelRH.tsx` ~L242 row em flex gap-3 com `<PersonPhoto size="sm" />`. Padrão igual Aniversariantes/Férias. Ver `shared/changelog.ts`.
- **Rev. 2528** — PAINEL RH — Aniversariantes só de Ativos (remove Afastado/Recluso/Férias/Lista Negra). 2 linhas em `server/routers/homeData.ts` L105+L145: `todosNaoDesligados` → `ativos`. KPIs derivados refletem automaticamente. Central de Alertas intacta. Ver `shared/changelog.ts`.
- **Rev. 2527** — FOLHA DE PAGAMENTO — Comparativo Folha × ERP (verba por verba, 1 linha por func com expand). ViewMode `comparativo_completo` + banner azul Scale + `ComparativoFolhaErpView`+`DetalhamentoVerbasFuncionario` reusando `listarItens`+`comparativoDescontos`+`cruzamentoHE`. 5 KPIs, 10 cols, export CSV. HE ERP proxy `(sal÷220)×1,5`. `client/src/pages/FolhaPagamento.tsx` L74/L2255/L7196/L9117. Ver `shared/changelog.ts`.
- **Rev. 2526** — FOLHA DE PAGAMENTO — Relatório Consolidado 2.0: multi-select KPIs, chips severidade, ordenação configurável, KPI Impacto R$, export CSV, tabs Por Funcionário × Por Tipo. Reusa 3 queries existentes. `client/src/pages/FolhaPagamento.tsx` `RelatorioConsolidadoView`. Ver `shared/changelog.ts`.

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
