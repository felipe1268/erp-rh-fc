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


- **Rev. 2521** — **FOLHA DE PAGAMENTO · BARRA DE PROGRESSO 0→100% no import do PDF da contabilidade (substitui spinner "Processando PDFs…").** User (screenshot do botão azul full-width sem feedback de tempo): "quero um processamento de 0 a 100 %". Como `folha.importarFolhaAuto` é UMA mutation tRPC sem streaming, optei por progresso **cliente estimado** (sem refatorar pra SSE/WS): `client/src/pages/FolhaPagamento.tsx` ganha estado `uploadProgress` (0-100) + `uploadPhase` + `uploadTimerRef`. `startUploadProgress(nFiles)` (L381-403) inicia interval 250ms com curva assintótica `next = prev + max(0.4, (90-prev)/(ticks-t+4))` (rápido no início, desacelera perto de 90%, NUNCA passa de 90 sem confirmação do servidor). Duração estimada `max(6s, nFiles*4s + 3s)`. Fases trocam em 35% ("Extraindo texto e classificando…") e 70% ("Vinculando funcionários e salvando…"). `stopUploadProgress(final)` no `onSuccess→100` / `onError→0`, reseta após 600ms. UI substitui `<Button disabled>` por bloco `<div bg-[#1B2A4A] text-white>` com header (RefreshCw spin + fase + `%` tabular-nums) + trilha `h-2 bg-white/15` com barra gradient amber→green e `transition-[width] 300ms ease-out`. Aplicado em 2 lugares: card estado VAZIO (L7121) e rodapé "Reimportar" do IMPORTADO (L7198). Zero mudança server-side. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2520** — **FOLHA DE PAGAMENTO · LOG DIAGNÓSTICO no import do PDF quando parser devolve 0 registros.** User (screenshot pós-2519 com toast "0 funcionários processados | 0 vinculados — Arquivos: Sintético (Lista): 0, Sintético (Lista): 0"): Rev. 2519 destravou o `require is not defined`, mas `parseSinteticoPDF` agora devolve array vazio (detecção auto OK via `text.includes("Relação de líquido")`, regex `matchNew` tab-separated e `matchOld` 2+ spaces não batem). Hipótese: `pdf-parse@1.1.1` (CJS) collapsa whitespace em alguns layouts e quebra o `\s{2,}`. Sem amostra do texto real (PDFs não vieram nos attached_assets, só screenshot) não dá pra ajustar o regex às cegas. Instrumentação em `server/routers/folhaPagamento.ts` L878-897 (2 blocos paralelos analítico+sintético): se `parsed.length===0`, loga `[FolhaImport][DIAG] <TIPO> 0 registros · arquivo=... · textLen=N · primeiras 60 linhas não-vazias:` + `L01..L60` com `JSON.stringify` (preserva \t e espaços) cortado em 300 chars. Custo zero no caminho feliz (gated). Follow-up: user reimporta UMA vez, agente lê `refresh_all_logs`, ajusta regex e remove o log na Rev. seguinte. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2519** — FOLHA DE PAGAMENTO — Hotfix `require is not defined` no parser do PDF da contabilidade (Rev. 2517 reintroduziu o botão, mas `require('pdf-parse')` quebrava em ESM). Trocado por `await import("pdf-parse")` com fallback `.default || mod`. `server/routers/folhaPagamento.ts` L51-59. Ver `shared/changelog.ts`.
- **Rev. 2518** — EQUIPAMENTOS LOCADOS — Renomear LOCADORA em lote direto do chip de filtro (pílula Pencil âmbar). Server `locadosRenomearFornecedor` em `server/routers/equipamentos.ts` ~L853 (bulk UPDATE case-insensitive via `UPPER(TRIM(fornecedor_nome))`, tenant-isolation, sem evento porque é correção administrativa). Modal âmbar com aviso "substitui em todas as N unidade(s)". `client/src/pages/equipamentos/Locados.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2517** — FOLHA DE PAGAMENTO — Card "Conferência com Contabilidade" restaurado (removido na Rev. 2194). 4 KPIs + 3 sub-relatórios (Verificação Cruzada / Comparativo Descontos / Cruzamento HE). Reusa backend `folha.importarFolhaAuto` + `verificacaoCruzada` + `comparativoDescontos` + `cruzamentoHE`. `client/src/pages/FolhaPagamento.tsx` ~L6984-7177. Ver `shared/changelog.ts`.
- **Rev. 2516** — EQUIPAMENTOS LOCADOS — Editor inline de OBRA no modal de GRUPO (drill-down). Pílula "Editar" (Pencil) na linha de obra; `<select>` com obras ativas + "— Sem obra vinculada —"; Salvar reusa `locadosVincularObraLote` com `ids = modalGrupo.unidades.map(u => u.id)`. `client/src/pages/equipamentos/Locados.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2515** — EQUIPAMENTOS PRÓPRIOS — Lightbox ao clicar na foto do card (overlay z-[60] com setas + Esc/←/→ + contador) + bloco FOTOS movido pra fora do collapse "Mais detalhes" e sem gating `{editingId}` (sempre visível em criar e editar). `client/src/pages/equipamentos/Proprios.tsx`. Ver `shared/changelog.ts`.

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
