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


- **Rev. 2488** — **COTAÇÕES · Mapa de Cotação em fullscreen + célula de Item enxuta (estilo ERP de mercado).** User (image_1779826710559/886/990): "redistribua o tamanho da tela no mapa de cotação, que ao clicar em MAPA DE COTAÇÃO, ele abra em tela full. Nos itens em si... deixe apenas o item (material que está sendo cotado)" — imagem 3 mostrou referência limpa de outro ERP. Em `client/src/pages/compras/Cotacoes.tsx`: (a) wrapper externo do detalhe condicional — `abaAtiva==="mapa"` aplica `px-3 py-3 space-y-3` (era `p-6 space-y-5`), ganhando ~70px de largura útil; (b) célula `<td>` Item — bloco poluído (parentEapDescricao, eapPath, RastreabilidadeTag SC/EAP, "✓ Em OC", "SEM VERBA"/"FORA DO ORÇAMENTO", barra de progresso "Estouro de N un / N%") removido do DOM e movido pra `title=` HTML nativo num ícone `<Info h-3 w-3>` cinza colado à direita da descrição. Renderiza só se ≥1 parte (return null evita ruído). `_grouped` omitido (cada item pode ter rastreabilidade divergente). Preservados: badge PACOTE/N composições, HistoricoPrecoPopover, colunas Saldo Orç e Meta MAT. Backend/schema/autorização INTACTOS. Detalhe: `shared/changelog.ts`.
- **Rev. 2487** — **COMPRAS · Ordenação clicável por coluna em Cotações e OCs (mesmo padrão da tela de SC).** User (image_1779824678770): "no menu de OC e cotação, insira os filtros circulados da imagem 1" — setinhas ↑↓ ao lado dos cabeçalhos. Adicionado em `Cotacoes.tsx` (7 colunas: Número, Descrição/SC, Obra, Fornecedor, Total, Validade, Status — hover azul) e `Ordens.tsx` (7 colunas: Número OC, Obra, Fornecedor, Origem, Total, Entrega Prevista, Status — hover verde). State `[sortKey,sortDir]` + `toggleSort` com defaults sensatos (DESC pra número/total/data, ASC pra textos). Sort via `localeCompare("pt-BR",{numeric:true,sensitivity:"base"})`. Vazios vão pro fim. Zero mudança em backend/filtros/contadores. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2486** — ORDENS DE COMPRA · Form de itens AGRUPADO POR ETAPA (EAP) — 1 etapa × N itens. Refatoração 100% frontend em `Ordens.tsx`: `GrupoForm`, helpers `flattenGrupos`/`agruparItens`, UI card lilás por etapa com Popover EAP no header + stack de itens. Backend/payload INTACTOS. Ver `shared/changelog.ts`.
- **Rev. 2485** — ORDENS DE COMPRA · mutation `repararDuplicatasNumeroOC` (adminProcedure, dryRun default) + dialog Wrench âmbar no command bar. Renumera duplicatas retroativas mantendo id menor; advisory lock 1001 + sync `ocNumberConfig.proximoNumero`. Ver `shared/changelog.ts`.
- **Rev. 2484** — EFETIVO DA OBRA (Planejamento, `EfetivoObraView`) · seleção múltipla + transferência EM LOTE entre obras. Checkbox + barra de ações + modal lote. Reusa `obras.allocateEmployee`. Ver `shared/changelog.ts`.
- **Rev. 2483** — ORDENS DE COMPRA · gerador unificado `gerarProximoNumeroOC` (advisory lock + bootstrap por MAX(seq)) corrige criação de novas duplicatas. 4 spots consolidados, rascunhos não-sequenciais. Ver `shared/changelog.ts`.
- **Rev. 2482** — EQUIPE DA OBRA (modal `ObraEfetivo.tsx`) · funcionários ordenados alfabeticamente (`localeCompare pt-BR`) dentro de cada grupo de status. Ver `shared/changelog.ts`.

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
