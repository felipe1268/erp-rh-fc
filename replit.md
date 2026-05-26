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


- **Rev. 2449** — **DEVOLVER LOCAÇÃO · volta pro Almoxarifado ao fechar/concluir + nome da obra com destaque ALTO no card pra evitar baixa de obra errada.** User (prints 23:11/23:13) clicou "DEVOLVER LOCAÇÃO" no Almox → ERP abriu picker em `/equipamentos/locados` mas ficava lá ao fechar (user nem reconhecia a página); nome da obra ("HOTEL DO PAPA…") em texto verde pequeno era fácil de ignorar num lote de 1.314 equipamentos. **Fix `Locados.tsx`:** (1) `useLocation` da wouter + state `returnToAlmoxAfterClose` setado pelo useEffect do `?action=devolver` (L709-712), consumido pelo helper `voltarParaAlmoxSeNecessario()` (L467-475) em TODOS os pontos de saída: `fecharPickerDevolver` L997, `devolver.onSuccess` L446, `devolverLote.onSuccess` L463, `modalDev.onClose` L2762. Flag fica `false` no fluxo legado (entrar direto na página) — helper é no-op. (2) Chip sólido pra obra (L2650-2658): `bg-emerald-100 border-emerald-300 text-emerald-900 font-bold` + MapPin h-4; "Sem obra cadastrada" vira chip amber. Backend `locadosListar` (`server/routers/equipamentos.ts` L378-385) já filtra `inArray(obraId, allowed)` desde Rev. 2420 — destaque visual é a 2ª camada de defesa pro admin. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
- **Rev. 2448** — **[BUG GRAVE] DASHBOARD ALMOX & EQUIP · "Valor parado" e gráficos por categoria ficavam SEMPRE R$ 0,00 — leitura de campos com nomes errados do schema.** User (print 23:04): aba "Estoque" com tabela "Categorias — detalhe" mostrando ITENS corretos (343, 1.190, 130, 46…) mas TODAS as 18 linhas com "VALOR PARADO: R$ 0,00", zerando também o gráfico "Valor do estoque por categoria (top 10)" e os KPIs "Valor do estoque" / "Valor total" / "Cobertura mensal". **Causa raiz:** `client/src/pages/dashboards/DashAlmoxarifadoEquipamentos.tsx` useMemo `stockAgg` (L221) lia `it.saldoAtual`/`it.precoMedio`/`it.estoqueMinimo` — campos que NÃO existem no schema `almoxarifado_itens`. As colunas reais são `quantidadeAtual`, `valorUnitario` e `quantidadeMinima` — daí `Number(undefined ?? 0) → 0` pra todo item. Bug existia desde a criação do dashboard. **Fix:** L229-241 lê os nomes corretos com fallback defensivo pros aliases legados. Agora KPIs/tabela/gráficos refletem `saldo × valorUnitario` real, e "Abaixo do mínimo" deixa de contar tudo como semEstoque. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2447** — ALMOXARIFADO · INVENTÁRIO VISUAL · banner "Rotina diária" fixo no rodapé reforça que a aferição é tarefa de TODO DIA. `InventarioVisual.tsx` L825-840. Ver `shared/changelog.ts`.
- **Rev. 2446** — ALMOXARIFADO · INVENTÁRIO VISUAL · cards padronizados em altura uniforme (CTA "Registrar baixa" ancorado no rodapé). `InventarioVisual.tsx` L375/L439/L463/L509. Ver `shared/changelog.ts`.
- **Rev. 2445** — ALMOXARIFADO · CASCADE excluirItem desativa baias vinculadas + defensivo no listar esconde baias órfãs. `compras.ts` L122/L2253-2272 + `warehouse.ts` L3050-3057. Ver `shared/changelog.ts`.
- **Rev. 2444** — [BUG GRAVE] ALMOXARIFADO · INVENTÁRIO VISUAL · itens do almoxarifado CENTRAL não duplicam mais em todas as 24 obras. `warehouse.ts → baiaAgregadosListar` L2930-2952/L2974-2997. Ver `shared/changelog.ts`.
- **Rev. 2443** — ALMOXARIFADO · INVENTÁRIO VISUAL · dropdown só mostra obras ATIVAS com ≥1 item alocado, contagem inline ("· 4 itens"), visão consolidada suprimida quando vazio. `InventarioVisual.tsx` L122-149/L558-574. Ver `shared/changelog.ts`.

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
