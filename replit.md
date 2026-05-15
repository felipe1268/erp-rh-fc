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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1825**: **Planejamento · MSP — `pctRaizMSP` substitui `pvPonderadoPorAtividade` no banner Live, cards Avanço Semanal e REFIS (paridade ABSOLUTA com Texto6 raiz, com decimais)**. User (15/05/2026, após Rev. 1824 destravar calendar e mover live REVTE-CIVIL de 7,37%→2,51%): "preciso que use exatamente a fórmula da coluna % PREVISTO do MS Project, com casas decimais". Optou por (A): mesma fórmula Texto6 raiz (FieldID=188743746) sem o `Int(...)` que o MSP nativo aplica. **Diagnóstico**: pós-Rev. 1824 o calendar já dava paridade em dias úteis (`fracaoDecorridaMs` correto), mas o banner continuava em `pvPonderadoPorAtividade` (curva-S por atividade ponderada por custo, PMI Practice Standard for Scheduling §6.2) — metodologicamente válido (ANSI/EIA-748 §2.b) mas inflava p/ 2,51% pq frentes longas/caras com início futuro (FUNDAÇÕES + ESTRUTURA = 60% BCWS, iniciam jun/26) deformam o denominador. Texto6 raiz puramente temporal dá 1,41% em 07/05 (4/284 du). **Implementação**: (1) `shared/diasUteis.ts` L255-276 — nova função pura `pctRaizMSP(refStr, projIniIso, projFimIso, cal)`: reusa `fracaoDecorridaMs` (base do `ProjDateDiff` em horário comercial), guards p/ refs fora do envelope (0/100 — replica MSP), idempotente. (2) `PlanejamentoDetalhe.tsx` L17 import + 11 substituições de `pvPonderadoPorAtividade` → `pctRaizMSP` com fallback defensivo p/ `pvPonderadoPorAtividade` quando faltar `dataInicio`/`dataTerminoContratual`/`calMSP`: L617 (top bar Live), L5236-5240/5247-5252/5272-5275 (cards Avanço Semanal — prev/previstoAcumulado/pvAcum), L5333/L5372 (PREVISTO SEMANA + c/Indiretas), L11241/11262/11316/11358 (REFIS — 4 chamadas, lê `(proj as any)?.dataInicio` no escopo do componente). PRESERVADO: `pvMacro` (já era essa fórmula desde Rev. 1646.6), snapshot Texto11, cutoff clipping (Rev. 1656.1/1823), `pvPonderadoPorAtividade` mantida no shared p/ outros call sites detalhados. **Validação esperada (REVTE-CIVIL)**: live 07/05=1,41% (era 2,51%), live 15/05=~3,15%, top bar=card grande=REFIS (3 fontes convergentes). Zero schema/migration/DELETE/contrato tRPC. R-007 OK. Reversível em 11 linhas.
- **Rev. 1824**: **Planejamento · MSP — paridade 100% MS Project**. User (15/05/2026, projeto 35 SANTUÁRIO N.S. APARECIDA / REVTE-CIVIL, anexou XML PLN_805_03_2026_R04 com StatusDate 07/05, Cost R$ 141 mi, BCWS R$ 2,95 mi): "avanço apresentado no ERP está dando divergente do MSproject... precisamos seguir exatamente a informação Msproject... a planilha que adicionamos, precisamos que seja respeitada 100%". **Diagnóstico (parsei XML + reproduzi `pvPonderadoPorAtividade` em 07/05)**: MSP root BCWS/Cost = 2,09% ✅; ERP DIAS CORRIDOS = 1,50% ❌; ERP DIAS ÚTEIS (calendário MSP) = 1,99% ✅. **Causa-raiz**: coluna `planejamento_projetos.calendario_json` (Rev. 1642) estava declarada APENAS dentro do bloco grande do ColFix (`server/_core/index.ts` L1266) — bloco com version-guard que em DBs já versionados imprime `[ColFix] Versão ok, pulando migrations.` e SALTA todos os ALTER TABLE. Confirmado via pg_attribute em DEV E PROD: coluna AUSENTE. Sem ela, `proj.calendarioJson`=undefined → `parseCalendarioJson(null)` → `fracaoDecorridaMs` cai na fração LINEAR de dias corridos (sáb/dom contam) → Previsto inflava. **Fix**: movido `ALTER TABLE planejamento_projetos ADD COLUMN IF NOT EXISTS calendario_json TEXT` pro bloco INCONDICIONAL `[SyncSchema+]` (L494-499), junto dos `data_corte_*` e `cutoff_consolidado*` que já tinham sido movidos por motivo idêntico. Idempotente. ALTER duplicado dentro do ColFix L1266 fica intacto (compat). Snapshots Texto6/Texto7 (`previsto_msp_pct`/`realizado_msp_pct`, Rev. 1670) já estavam no SyncSchema+ L505-506 e ok. Import (`ImportarCronograma.tsx` L328) já extrai calendário e envia via `gravarMetadadosMSP` (planejamento.ts L2155). **Ação user**: após deploy, reimportar o XML em REVTE-CIVIL → popula `calendario_json` + Texto6/Texto7 nas 1.512 atividades → paridade ~99,5% (dias úteis) e absoluta no status date (snapshot Texto6 ponderado). Zero schema destrutivo, zero DELETE, R-007 OK.
- **Rev. 1823**: **Cronograma · checkbox "Responsável Manual" + fixes acumulados**. User (16/05/2026): "preciso ter um campo de check box... clientes pedem para incluir atividades de outras empresas... botão manual que o planejador indica responsabilidade da empresa X... aparecer na programação semanal... sem prejudicar a logica?". Decisão: reaproveitar a coluna `responsavel_lotus` que já existe e já é a 1ª camada do `resolverResponsaveisBatch` (override manual), só faltava UI no cronograma + persistência no `salvarAtividades`. (1) **Cronograma (PlanejamentoDetalhe.tsx L3636)**: 6ª checkbox cyan ao lado de Grupo/Marco/Indireta/Externa/Disabled — quando marcada abre input cyan logo abaixo do nome ("EMPRESA XYZ LTDA"); desmarcar limpa `responsavelLotus` → volta pro auto-resolve (FC/OS aprovada). Flag local `_respManual` controla UI sem persistir (zod strip). Não conflita com Externa (cores e inputs diferentes). (2) **Backend salvarAtividades (planejamento.ts L1066/L1105/L1292)**: zod aceita `responsavelLotus`; INSERT herda; UPDATE CASE bulk inclui coluna preservando valor existente quando undefined. ZERO impacto na hierarquia Rev.1817/1818 — auto-resolve continua igual. PSEM Lotus já lia o campo. (3) **AvisoPrevio (L3163-3215)**: botões Pencil azul (editar) + RotateCcw vermelho (estornar) ao lado de cada baixa no banner verde, agora pros 3 tipos (Rescisão/FGTS/Complementar); states ampliados pra `'complementar'`; backend já suportava. (4) **Previsto trava em semana FUTURA (PlanejamentoDetalhe L544/L598/L5269/L5312)**: clipping no cutoff só vale pra semana CORRENTE (`semIni<=cutoff<semFim`); semana futura usa previsto cheio. (5) **Excel PSEM (ProgramacaoSemanalLotus L1262)**: filename usa nome do projeto slugificado (NFD/uppercase/60ch) em vez de "REVTE" hardcoded. (6) **Importar MSP (ImportarCronograma L682+)**: barra Progress shadcn (assintota 99%, tick 120ms) no botão "Importar X atividades"; CHUNK INSERT subiu 100→500 (planejamento.ts L1303 — 1900 atividades = 4 round-trips). Zero schema/migration/DELETE; coluna `responsavel_lotus` já existia. R-007 OK.
- **Rev. 1822**: **Planejamento · Import MSP — lê o campo ITEM (Texto1) em vez do WBS automático; cronograma para de "renumerar"**. User (16/05/2026, screenshots QIU 2 - FASE 4 com ERP mostrando "1 / 2 / 2.1 / 3.1.1.1" e MSP mostrando "01.01 / 02.01.01.01 / 02.16.02.01"): "ERP não está identificando a coluna Item que vem da planilha XML, está renumerando... preciso que respeite 100% as informações que vem do project". Diagnóstico: XML tem DOIS códigos por tarefa — `<WBS>` automático (1, 2, 2.1…) E `ExtendedAttribute FieldID=188743731` (Texto1, Alias='ITEM') que tem o código REAL digitado pelo engenheiro. ERP lia `<WBS>` em 3 pontos → cronograma chegava "renumerado" e nunca casava com orçamento. A canonização da Rev. 1821 não resolvia: "1" jamais vira "01.01". Fix: helper `lerCodigoItemDaTask()` NOVO em `ImportarCronograma.tsx` L354 — lê APENAS Texto1 (FieldID=188743731), SEM fallback no `<WBS>` automático (refino após user reportar mistura: "1, 2, 3" do WBS poluindo sumários). Aplicado em uidToWbs + loop principal; mesmo lookup replicado inline em `PlanejamentoDetalhe.tsx` L5417 (reimport %realizado). Sumários/marcos podem ficar com `eap_codigo` vazio (não têm item no orçamento). Validação R-013 dura SOMENTE em folhas reais (`!summ && !isMarco`) — folha sem Item estoura erro pra engenheiro corrigir no Project. Compatibilidade Rev. 1821 100% preservada — fluxo agora: import grava ITEM LITERAL → orçamento já tem LITERAL → `eapCanonico()` casa ambos. Zero schema/migration/DELETE; banco intacto — usuário precisa REIMPORTAR cronograma de QIU 2 pro fix entrar em vigor lá. Reversível em 1 linha.
- **Rev. 1821**: **Planejamento · EAP — match CANÔNICO orçamento ↔ cronograma (sem zero à esquerda) corrige "Sem meta" em massa**. User (16/05/2026, com screenshots HOTEL DO PAPA): "ERP está renumerando atividades, gera desconexão com o orçamento... seria apagar os cronogramas e refazer? Preciso ser certeiro". Diagnóstico: NÃO era renumeração — `salvarAtividades` grava `eap_codigo` LITERAL. Era DIVERGÊNCIA DE FORMATO: orçamento Excel `02.16.02.01` (zero-padded) vs cronograma MSP `2.16.2.1` (WBS sem zero) → comparação string falhava em `recalcularPesos.ts` L88/L94 e `diagnosticoEapOrcVsCron` L3771/L3775 → peso=0 → "Sem meta". Auditoria PROD: HOTEL DO PAPA 0/449, CHLORUM 0/187, QIU 2 1/1512. Decisão alinhada (interview): match ON-THE-FLY sem persistir, sem schema, sem coluna nova. Implementação: (1) `server/_shared/normalizarEap.ts` NOVO — função pura `eapCanonico(s)` remove zero à esquerda de cada segmento (`02.16.02.01`→`2.16.2.1`), idempotente. (2) `recalcularPesos.ts` — 4 substituições de `.trim()` por `eapCanonico()` no custoMap + rateio item 4. FONTE ÚNICA preservada (Rev. 1820); 3 hooks defensivos herdam o fix. (3) `diagnosticoEapOrcVsCron` (L3704) — chaves dos Maps viram canônicas, mas EAP exibido na UI permanece o LITERAL (formato original do contrato). (4) Considerei criar procedure+UI nova de diagnóstico, REJEITEI antes de shipar — `<DiagnosticoEapOrcCron />` existente já cobre (R-017). Por que NÃO apagar e refazer: 1.512 atividades QIU 2 inviável; apagaria histórico de avanços; bug REAPARECE no próximo import sem o fix de código. Reversível em 1 linha. Zero schema/migration/DELETE; `eap_codigo` no banco INTACTO. Auto-sync existente (`autoSincronizarCodigosEapComOrcamento`) agora só dispara em divergência REAL de descrição.


## 🏆 Regras de Ouro (LER OBRIGATORIAMENTE)

**Antes de criar ou editar QUALQUER tela, modal, dashboard ou componente visual, consulte `REGRAS_DE_OURO.md` na raiz do projeto.**

Resumo das 10 regras (detalhes + checklist em `REGRAS_DE_OURO.md`):

1. **R-001 · Modais full-screen** — `w-[100vw] h-[100dvh]` mobile / `w-[98vw] h-[96dvh]` desktop, **SEMPRE** com `resizable={false}` no DialogContent (senão o style inline da shadcn força 512px).
2. **R-002 · Visual rico** — gradient header, ícones grandes, badges, KPI cards. Nunca telas chapadas.
3. **R-003 · Tailwind JIT-safe** — cores via `Record<string, ...>`, nunca template literals.
4. **R-004 · Responsividade** — tabela vira cards no mobile, testar no iPad (768-1024px).
5. **R-005 · Acessibilidade** — `tabIndex`, `role`, `aria-label`, focus-visible:ring.
6. **R-006 · pt-BR** — toda comunicação em português brasileiro.
7. **R-007 · Imports lucide-react** — UM ÚNICO import por arquivo (Babel barra duplicates).
8. **R-008 · Versionamento** — bump `version.ts` + entry completa em `changelog.ts` + 5 últimas em `replit.md`.
9. **R-009 · Secrets** — nunca logar/exibir valores de env vars sensíveis.
10. **R-010 · SQL Drizzle** — aspas duplas em camelCase no WHERE, sempre filtrar `deleted_at IS NULL` + `companyId`.
11. **R-011 · Indiretas/LoE não compõem o Caminho Crítico** (PMBOK §6.4.2 / DCMA #6).
12. **R-012 · Tela de impressão sem páginas em branco/vazias** — fix global no `@media print` de `index.css`. Para imprimir só conteúdo de modal aberto, envolva com `<div className="print-only">…</div>` (esconde o resto da árvore automaticamente).

**Checklist pré-conclusão** está no fim do `REGRAS_DE_OURO.md` — passar item a item antes de finalizar.

## User preferences

- **Idioma**: português brasileiro em toda comunicação.
- **Publicação**: Autoscale (`pnpm run build` + `node dist/index.js`).
- **Tom de UI**: visual rico, gradientes coloridos por contexto, badges, ícones grandes — evitar telas chapadas.
- **Modais SEMPRE full-screen** (R-001 das Regras de Ouro).
- **Nunca mostrar valores de secrets** em código ou logs.
- **Sempre citar o NOME do projeto** ao falar de algum projeto de planejamento (não usar só o id). Ex.: "projeto 29 (QIU 2 - FASE 4)" e não só "projeto 29". Se não souber o nome, falar isso explicitamente em vez de omitir.
