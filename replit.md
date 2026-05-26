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


- **Rev. 2453** — **DEVOLUÇÃO DE LOCAÇÃO · fluxo completo com assinaturas + comprovante PDF compartilhável via WhatsApp.** User pediu (IMG_1247): selecionar equipamentos → tirar foto → colher assinatura do entregador (FC) e do recebedor (locadora) → gerar PDF → compartilhar via WhatsApp. Implementado: (a) `SignaturePad.tsx` canvas inline com pointer events (sem dep externa, exporta PNG dataURL). (b) Modal de devolução em lote ganha 2 etapas (`Locados.tsx` L442-450 states + L2809-2872 UI com stepper visual): etapa 1 = fotos/data/obs (atual), etapa 2 = nomes + assinaturas (entregador slate + recebedor emerald). (c) Backend `locadoDevolverEmLote` (`equipamentos.ts` L818-922) aceita 4 novos campos + gera `pdfComprovanteToken` (crypto.randomBytes 24 bytes) compartilhado por todos os eventos do lote; retorna `{ comprovante: { eventoId, token } }`. (d) PDF helper novo `server/services/equipmentReturnReceiptPdf.ts` com cabeçalho FC oficial (logo+CNPJ+endereço+faixa azul), partes envolvidas, tabela de equipamentos, assinaturas embedadas, rodapé. (e) Rota pública assinada `GET /api/comprovante-devolucao/:eventoId/:token.pdf` (`_core/index.ts` L477-508) — locadora abre direto do WhatsApp sem login. (f) Modal pós-sucesso "📱 Compartilhar via WhatsApp" (tenta `navigator.share` PWA → fallback `wa.me/?text=`) + Ver PDF + Baixar + Copiar link. Schema: 5 colunas novas em `equipamento_locado_eventos` (assinaturas dataURL + token), ADD COLUMN IF NOT EXISTS. R-001/R-007/R-010 OK. Detalhe completo: `shared/changelog.ts`.
- **Rev. 2452** — **DEVOLVER LOCAÇÃO · respeita almoxarifado/obra do contexto pra evitar baixa em obra errada.** User em `/almoxarifado` no contexto "Almoxarifado Central" (IMG_1245/IMG_1246 23:41) clicou DEVOLVER LOCAÇÃO e o picker abriu com 1.314 itens de TODAS as obras misturados (IMG_1244) — risco grave de dar baixa em equipamento da obra errada. **Fix:** (1) `almoxarifado/index.tsx` L1721-1743 — botão checa `obraContexto`: `"central"` → toast.warning ("Central não recebe locações"); número → `?action=devolver&obraId=X`; "todos"/null → comportamento atual. (2) `Locados.tsx` L705-719 — useEffect do action=devolver lê `obraId` param e seta `setFiltroObra`. (3) `Locados.tsx` L2484-2493 — picker filtra `emUso` por `obraIdLock`. (4) Banner verde EXPLÍCITO no topo do picker (L2564-2586) "Mostrando apenas equipamentos da obra X · N itens" + CTA "Ver todas". Backend `locadosListar` (Rev. 2420) já filtrava por `allowedObras` — esta é a 2ª camada de defesa pro admin/admin_master. R-001/R-007/R-010 OK (zero backend). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2451** — [BUG GRAVE] ALMOXARIFADO · tela quebrava com `ReferenceError: Can't find variable: consListFinal` em iOS Safari. Hoist do `consListFinal` para `useMemo` no escopo do componente. `pages/almoxarifado/index.tsx` L443-464. Ver `shared/changelog.ts`.
- **Rev. 2450** — AUDITORIA DO ALMOXARIFADO · tela `/almoxarifado/auditoria` + banner global pro gestor revisar exclusões/baixas manuais. Router `auditoriaAlmoxarifado` + `Auditoria.tsx` + `AuditoriaAlmoxPendingAlert.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2449** — DEVOLVER LOCAÇÃO · volta pro Almoxarifado ao fechar/concluir + chip sólido emerald pra nome da obra no card. `Locados.tsx` L467-475/L709-712/L2650-2658. Ver `shared/changelog.ts`.
- **Rev. 2448** — [BUG GRAVE] DASHBOARD ALMOX & EQUIP · "Valor parado" e gráficos por categoria ficavam R$ 0,00 — leitura de campos com nomes errados do schema (`saldoAtual` vs `quantidadeAtual`). `DashAlmoxarifadoEquipamentos.tsx` L229-241. Ver `shared/changelog.ts`.
- **Rev. 2447** — ALMOXARIFADO · INVENTÁRIO VISUAL · banner "Rotina diária" fixo no rodapé reforça que a aferição é tarefa de TODO DIA. `InventarioVisual.tsx` L825-840. Ver `shared/changelog.ts`.

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
