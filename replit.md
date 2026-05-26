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


- **Rev. 2455** — **DEVOLVER LOCAÇÃO · ao concluir, volta pro Almoxarifado da MESMA obra de origem (não joga no Central).** User (00:08): após devolução iniciada de QIU 2 - FASE 4, o ERP voltava pra `/almoxarifado` SEM query string → `obraContexto` (useState local) renderizava no valor inicial → mostrava "Almoxarifado Central" em vez da obra. **Fix:** novo state `returnToAlmoxObraId` (`Locados.tsx` L429-433); useEffect do `action=devolver` (L734-737) grava o `obraId` do query param; `voltarParaAlmoxSeNecessario` (L487-498) monta destino como `/almoxarifado?obra=X` quando tem obra (Almox já lê `?obra=` na L1515-1524 desde Rev. 2391). Combinado com Rev. 2452 (picker pré-filtra) + Rev. 2454 (single passa por assinaturas), ciclo Almox(obraX) → devolução → volta Almox(obraX) end-to-end. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
- **Rev. 2454** — **[BUG GRAVE — Rev. 2453 fallout] DEVOLVER ESTE (atalho single do card) fechava a tela sem abrir modal de assinatura.** User em `/almoxarifado` (QIU 2 - FASE 4 — IMG_1248/IMG_1249 00:05) clicava DEVOLVER LOCAÇÃO → picker filtrado pela obra OK → DEVOLVER ESTE → tela fechava. Causa: `escolherSingle` (L2541) chamava `fecharPickerDevolver()` ANTES de `setModalDev(l)`, e quando o picker veio do Almox via `?action=devolver`, o `voltarParaAlmoxSeNecessario()` navegava pra `/almoxarifado` antes do modal renderizar. Bug latente da Rev. 2449, virou crítico agora que assinatura é obrigatória. Segundo: o `modalDev` (single legado) NÃO tem o fluxo de assinaturas — só o `modalDevLote` da Rev. 2453 tem. **Fix:** `escolherSingle` (`Locados.tsx` L2541-2561) agora envia o item pelo mesmo caminho do lote (`setModalDevLote([l])`) → ganha 2 etapas + assinaturas + comprovante PDF. Limpa estado local sem chamar `voltarParaAlmox` (consumido só pelo `devolverLote.onSuccess`). Comportamento uniforme: TODO fluxo de devolução (single ou lote) passa pelas assinaturas + comprovante. R-001/R-007/R-010 OK (zero backend). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2453** — DEVOLUÇÃO DE LOCAÇÃO · fluxo completo com assinaturas (entregador FC + recebedor locadora) + comprovante PDF compartilhável via WhatsApp. `SignaturePad.tsx` + `equipmentReturnReceiptPdf.ts` + modal 2 etapas + rota pública assinada. Ver `shared/changelog.ts`.
- **Rev. 2452** — DEVOLVER LOCAÇÃO respeita o almoxarifado/obra do contexto pra evitar baixa em obra errada. `almoxarifado/index.tsx` + `Locados.tsx` (filtro+banner). Ver `shared/changelog.ts`.
- **Rev. 2451** — [BUG GRAVE] ALMOXARIFADO · tela quebrava com `ReferenceError: Can't find variable: consListFinal` em iOS Safari. Hoist do `consListFinal` para `useMemo` no escopo do componente. Ver `shared/changelog.ts`.
- **Rev. 2450** — AUDITORIA DO ALMOXARIFADO · tela `/almoxarifado/auditoria` + banner global pro gestor revisar exclusões/baixas manuais. Ver `shared/changelog.ts`.
- **Rev. 2449** — DEVOLVER LOCAÇÃO · volta pro Almoxarifado ao fechar/concluir + chip sólido emerald pra nome da obra no card. Ver `shared/changelog.ts`.

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
