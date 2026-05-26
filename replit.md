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


- **Rev. 2471** — **COTAÇÕES · estoque-picker ganha layout ultra moderno (cards em grid, gradient header, chips de filtro por origem, footer com resumo financeiro).** User (ref. image_1779807289838.png — modal "Status: Em Andamento" do Aviso Prévio): "quero um layout ultra moderno, seguindo as nossas regras de ouro". **Redesign:** (1) header com gradient indigo→violet `#1E1B4B→#312E81→#4C1D95`, ícone glassmorphism, título 20pt + subtítulo + badge "X itens disponíveis" com pulse-dot; (2) toolbar com busca grande rounded-xl (agora busca também por nomeObra) + chips de filtro de origem (Todas/Central/UM POR OBRA, cada um com contador interno) horizontal-scroll; (3) **grid de cards** (em vez de tabela), responsivo `cols-1 md:2 xl:3 2xl:4`, cada card com avatar circular gradient único (hash mod 6) + iniciais, checkbox custom canto sup-dir, pílulas origem+categoria, saldo bold 18pt + preço médio + subtotal estimado, hover lift + ring violet quando marcado; (4) footer com "X de Y selecionados" + "Valor estimado R$" em emerald + botão Confirmar gradient indigo→violet com badge contador. Novo state `estoquePickerOrigem`. R-001/R-007/R-010 OK (só JSX/CSS). Detalhe: `shared/changelog.ts`.
- **Rev. 2470** — **COTAÇÕES · estoque-picker lista TODO almoxarifado (Central + TODAS as obras) e pílula mostra o NOME da obra.** User (image_1779801482993 + image_1779801605591 + image_1779801739481): "estoque do escritorio central nao aparece (tenho Chamex 500 folhas que some); pílula diz 'Obra' mas não fala qual obra". **Bug raiz (Rev. 2466 carryover):** query `listEstoqueDisponivel` (`server/routers/compras.ts` L5028) filtrava `OR(isNull(obraId), eq(obraId, input.obraId))` — só Central + obra-atual-da-cotação. Itens de outras obras sumiam. **Fix:** (1) backend — removido filtro de obra (input.obraId mantido por retrocompat mas ignorado), adicionado `leftJoin(obras)` pra trazer `obraNome` no payload; (2) UI Cotacoes.tsx — coluna "Origem" alargada (w-20→w-56), pílula renderiza `it.obraNome || "Obra"` com `truncate` + `title` pra hover, Central segue como "Central" (title "Escritório Central"). R-001/R-007/R-010 OK (só SELECT/JOIN + JSX). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2469** — COTAÇÕES · modal "Selecionar do Estoque" virou tela cheia (full-viewport). `DialogContent` 100vw×100vh, flex column, header/footer `shrink-0` + border, tabela `flex-1 min-h-0 overflow-y-auto`. Ver `shared/changelog.ts`.
- **Rev. 2468** — HOTFIX REAL DA Rev. 2466 (COTAÇÕES) · `<Dialog>` do estoque-picker estava no return principal mas o BOTÃO está dentro do bloco fullscreen (`if (showDetalhe !== null)`) que faz early-return — Dialog nunca montava. Movido pra dentro do bloco fullscreen antes do `</DashboardLayout>`. Ver `shared/changelog.ts`.
- **Rev. 2467** — HOTFIX SEGUROS DA FROTA · `vehicleId: z.number().optional()` adicionado ao input zod de `frotas.updateInsurance` (estava sendo descartado silenciosamente, deixando o vínculo manual sem salvar). Bônus: hotfix de TDZ em `Cotacoes.tsx` L1157 (`listEstoqueDisponivel` referenciava `detalheFullscreen` fora de escopo). Ver `shared/changelog.ts`.
- **Rev. 2466** — COTAÇÕES · botão "Atender pelo Estoque" passa a abrir modal de seleção do almoxarifado (checkboxes + busca) em vez de auto-match cego. Backend: nova query `listEstoqueDisponivel` + input opcional `almoxItemIds` em `adicionarEstoqueAoMapa` (whitelist via `inArray`). **NOTA:** a entrega do modal em si só ficou completa na Rev. 2468 (hotfix do scope-bug do Dialog). Ver `shared/changelog.ts`.
- **Rev. 2465** — RECEBIMENTO DE EQUIPAMENTO LOCADO · espelho do fluxo de devolução (Rev. 2453+2461) com assinaturas + comprovante PDF + Nº DA OC em destaque. Inputs opcionais (`assinaturaEntregador/Recebedor{Nome,Url}`) em `locadoCriar`, novo `equipmentReceiptPdf.ts` (faixa verde, cards invertidos, Nº OC via JOIN comprasOrdens), rota pública `/api/comprovante-recebimento/:eventoId/:token.pdf`, modal 2-etapas em Locados.tsx. Ver `shared/changelog.ts`.

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
