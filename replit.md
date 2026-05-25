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

- **Rev. 2422** — **INVENTÁRIO VISUAL DE BAIAS · "Desfazer aferição" com estorno automático do almox.** Pedido user (25/05/2026, follow-up Rev. 2421): "quero poder desfazer o apontamento". Schema: ADD COLUMN `movimentacao_id INTEGER` em `almoxarifado_baia_leituras` (SyncSchema+ idempotente, drizzle `movimentacaoId`), vincula leitura ↔ mov de saída gerada na Rev. 2421. Backend: (a) `baiaLeituraRegistrar` agora UPDATE leitura com `movId` pós-INSERT da mov; (b) novo `baiaLeituraDeletar({companyId, leituraId})` — valida acesso obra/empresa + permissão (autor OU role contém "ADMIN") + GUARD anti-inconsistência (só a leitura MAIS RECENTE da baia, senão BAD_REQUEST), busca a mov vinculada, `UPDATE almox_itens SET qtd = qtd + estornado` (sem clamp), INSERT mov "entrada" motivo `Estorno: aferição desfeita da baia "X" (leitura #N)`, DELETE da leitura. Retorna `{ok, estornado, movimentacaoEstornadaId}`. Leituras antigas (pré-2422 sem `movimentacaoId`) deletam sem estorno. Frontend: state `desfazendoLeitura` + mutation; botão `<Trash2 /> Desfazer aferição` vermelho na 1ª leitura do modal histórico; modal confirmação com banner verde "✓ Será estornado" ou amber "⚠ Sem baixa vinculada"; toast cita valor pt-BR. R-001/R-007/R-010 OK (ADD COLUMN não-destrutivo; DELETE em id isolado). Detalhe: `shared/changelog.ts`.
- **Rev. 2421** — **INVENTÁRIO VISUAL DE BAIAS · 3 bugs numa só revisão.** Pedido user (25/05/2026, screenshot Rev. 2419 com "RESTANTE 50" mas item ainda em 100): "Dei baixa mas não está baixando do almoxarifado... quando eu clicar quero que apareça o histórico completo... veja pq a função de conferir baías não está aparecendo para todos usuários que tem o módulo almoxarifado liberado". **(A) Baixa não debitava** — `baiaLeituraRegistrar` só inseria a leitura, nunca criava movimentação. Adicionado bloco pós-INSERT que, se baia.itemId existir e novoVol<antVol, faz `UPDATE almox_itens SET qtd=GREATEST(qtd-consumo,0)` + `INSERT almox_movimentacoes (tipo='saida', motivo="Inventário Visual de Baias — aferição")`. Conservador: vol subindo NÃO infere entrada (vem de NF); primeira leitura nunca debita. Import `ne` novo. **(B) Card clicável** — `onClick={() => setHistoricoBaia(b)}` + `cursor-pointer` no wrapper; botões internos (Editar/Remover/Registrar/Ver histórico) ganham `stopPropagation`. `baiaLeiturasListar` default 50→200. **(C) Menu sumia em grupo** — `/almoxarifado/inventario-visual` não estava registrado em `shared/modules.ts`; `groupCanAccessRoute` devolvia `false` → `filterWithChildren` escondia. Adicionada feature `almoxarifado-inventario-visual`. Zero schema/migration. R-001/R-007/R-010 OK. Detalhe completo: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2420** — EQUIPAMENTOS LOCADOS/Picker "Devolver" · MULTI-SELEÇÃO + filtro de permissão de obra. `equipamentos.locadosListar` ganha `getEffectiveAllowedObraIds()`; picker vira toggle multi com sticky footer laranja; endpoint novo `locadoDevolverEmLote` (200 ids, sequencial, reusa lógica single). Ver `shared/changelog.ts`.
- **Rev. 2419** — ALMOXARIFADO/VALOR POR ALMOXARIFADO · Mostra TODAS as obras ativas, mesmo as zeradas. Removido `.filter(e => e.valor > 0)` em `almoxarifado/index.tsx` L1743-1768; zeradas com styling distinto (opacity-60). Ver `shared/changelog.ts`.
- **Rev. 2418** — ALMOXARIFADO/VALOR TOTAL DO ESTOQUE · Exclui locados por padrão + respeita filtros visíveis. Default `filtroEquip=todos` → locados EXCLUÍDOS + badge "X locado(s) excluído(s)"; `locado`/`vinculado` → inclui; demais filtros → reflete lista filtrada. 5 blocos no `almoxarifado/index.tsx` (consolidado + por obra + banners + tfoot). Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2417** — ALMOXARIFADO/INVENTÁRIO VISUAL DE BAIAS · SÓ categoria "Agregados" + input numérico de volume + consumo do dia. ADD COLUMN `volume_estimado NUMERIC(14,3)`. Filtro `normalizarCat==="agregados"`, helper `calcConsumoHoje`, modal com `<Input inputMode=decimal>` grande. Histórico mostra volume em vez de %. Ver `shared/changelog.ts`.
- **Rev. 2416** — ALMOXARIFADO/INVENTÁRIO VISUAL DE BAIAS · Opção "Todas as obras" (visão consolidada) de volta no seletor. `baiaAgregadosListar.input.obraId` vira `nullable()`, resolve `targetObras` via `userCanAccessObra`, indexação `${obraId}:${itemId}`, frontend grupado por obra. Zero migration. Ver `shared/changelog.ts`.

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
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
