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


- **Rev. 2446** — **ALMOXARIFADO · INVENTÁRIO VISUAL · cards padronizados em altura uniforme: CTA "Registrar baixa" sempre ancorado no rodapé.** User (print 22:46): cards desalinhados — alguns com "Saldo no sistema:" + "Última: ..." e outros sem, causando alturas diferentes na mesma linha do grid. **Fix CSS-only:** `client/src/pages/almoxarifado/InventarioVisual.tsx` L375 card root `h-full flex flex-col` + L439 header `flex-shrink-0` + L458-463 painel inferior `flex-1 flex flex-col` + L509 botão CTA `mt-auto`. CSS Grid `grid-cols-2` do pai (L797/L810) garante `auto-rows: 1fr` quando o item é `h-full`. Fotos com fundo branco (Areia, Areia Média Lavada) seguem como estão por escolha do user. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
- **Rev. 2445** — **ALMOXARIFADO · CASCADE de exclusão: deletar item agora desativa baias vinculadas + defensivo no listar esconde baias apontando pra item inativo.** User (prints 22:38) deletou "Item TESTE -areia" da Visão Geral mas o card continuava no Inventário Visual da obra QIU 2 – FASE 4 com botão "Registrar baixa" ativo. **Causa raiz:** `compras.ts → excluirItem` só fazia soft-delete do `almoxarifado_itens`, deixando `almoxarifado_baias.ativo=true` com `itemId` apontando pra item inativo — o fallback "baias com itemId apontando pra item NÃO-agregado" do `baiaAgregadosListar` exibia indefinidamente. **Fix em 2 frentes:** (1) `server/routers/compras.ts` L122 import `almoxarifadoBaias` + L2253-2261 `UPDATE almoxarifado_baias SET ativo=false WHERE itemId=? AND ativo=true RETURNING` + L2272 snapshot em `dadosDepois.baiasDesativadas` da auditoria. (2) `server/routers/warehouse.ts` L3050-3057 `itensAtivosIds: Set` + `continue` se item inativo (defensivo, cobre baias já órfãs sem precisar SQL manual em prod). Histórico de leituras preservado. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2444** — [BUG GRAVE] ALMOXARIFADO · INVENTÁRIO VISUAL · itens do almoxarifado CENTRAL não duplicam mais em todas as 24 obras. `warehouse.ts → baiaAgregadosListar` L2930-2952/L2974-2997. Ver `shared/changelog.ts`.
- **Rev. 2443** — ALMOXARIFADO · INVENTÁRIO VISUAL · dropdown só mostra obras ATIVAS com ≥1 item alocado, contagem inline ("· 4 itens"), visão consolidada suprimida quando vazio. `InventarioVisual.tsx` L122-149/L558-574. Ver `shared/changelog.ts`.
- **Rev. 2442** — ALMOXARIFADO · VISÃO GERAL · Shift+clique seleciona INTERVALO de cards (range select estilo Finder) + botões "Marcar todos visíveis" / "Limpar". `index.tsx` L317-366/L2009/L4456-4475. Ver `shared/changelog.ts`.
- **Rev. 2441** — ALMOXARIFADO · Combobox filtrável de categoria (digite pra achar) no cadastro/edição + 2 modais "Alterar categoria em lote". `index.tsx` L50-145/L2766/L4377/L4469. Ver `shared/changelog.ts`.
- **Rev. 2440** — ALMOXARIFADO · VISÃO GERAL · card limpo (3 badges + "+N locais") e card/linha clicáveis abrem modal completo de edição. `index.tsx` L1877-2065. Ver `shared/changelog.ts`.

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
