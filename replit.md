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

- **Rev. 2415** — **ALMOXARIFADO/INVENTÁRIO VISUAL DE BAIAS · AGREGADOS APARECEM AUTOMATICAMENTE — almoxarife não cadastra baia, só dá baixa.** Pedido user (25/05/2026, com screenshot do modal "Nova baia"): "nao quero precisar cadastrar baia.. se o produto recebido for, areia, pedra, ou melhor qualquer agregado.. precisamos que apareça automaticamente o que foi recebido aqui e o almoxarife vai dando baixa." Decisão arquitetural ZERO migration: `almoxarifado_baias.itemId` já existia (Rev. 2373), agora vira o **link primário**. **2 endpoints novos** em `server/routers/warehouse.ts`: (1) `baiaAgregadosListar({companyId, obraId})` — lista `almoxarifado_itens` da obra filtrados por regex de agregado (`areia|brita|pedra|pedrisco|p[óo]-de-pedra|rach[ãa]o|bica corrida|seixo|lajota|tijolo|bloco|argamass|cimento|cal|saibro|terra|entulho|concreto|agregado|granel|aglomerado|gnaisse|calc[áa]rio` + fallback unidade m³/m3/t/ton) com LEFT JOIN nas baias por itemId pra trazer ultimaLeitura/leituraAnterior + SOMA entradas de hoje (tipo='entrada' AT TIME ZONE 'America/Sao_Paulo' AND estornada_em IS NULL); itens sem baia vêm com `id:null`+`itemId`; preserva baias órfãs (legado); (2) `baiaAutoEnsureFromItem({companyId, obraId, itemId})` idempotente — INSERT herdando nome/material/unidade/foto do item, chamado no 1º clique do `confirmarLeitura`. **Frontend `InventarioVisual.tsx`**: query trocada, `confirmarLeitura()` chama `autoEnsureMut` se `id==null`, card ganhou 3 badges (sky "+X un hoje" / amber "Auto" / linha "Saldo no sistema") + pergunta dinâmica acima dos 5 botões (`semBaia` → "Quanto restou na baia?"), edit/trash/histórico escondidos quando `semBaia`, empty state reescrito ("Nenhum agregado recebido nesta obra"), botão "Cadastrar baia manual" só no modo Gerenciar. R-001/R-007/R-010 OK. Detalhe completo: `shared/changelog.ts`.
- **Rev. 2414** — **ALMOXARIFADO/INVENTÁRIO VISUAL DE BAIAS · Reformatado pra MESMA LINGUAGEM do Inventário Semanal — sessão DIÁRIA por obra (não mais lista solta de baias).** Pedido user (25/05/2026): "O CONTROLE VISUAL DE BAIAS PRECISA SEGUIR A MESMA LOGICA DO INVENTARIO SEMANAL... AFERIÇÃO DIARIA DA QUANTIDADE EM OBRA. QUERO O MESMO FORMATO PARA GARANTIR A MESMA LINGUAGEM DE UTILIZAÇÃO." Decisão arquitetural: ZERO backend novo — "sessão diária" é DERIVADA de `baia_leituras` existentes (Rev. 2373). Helpers `hojeYmdLocal()` + `isLeituraHoje(lidaEm)` comparam YMD local (sem TZ drift). Mudanças em `client/src/pages/almoxarifado/InventarioVisual.tsx`: (1) Filtro "todas as obras" → seletor de obra OBRIGATÓRIO (`obraContexto: number|null`, mesmo pattern do semanal); (2) 5 estados: sem obra → placeholder / loading / sem baia → "Cadastrar primeira baia" / sem leitura hoje → botão verde GRANDE `bg-emerald-500 px-8 py-4 text-lg` "Iniciar Aferição" / sessão em andamento → barra progresso 3-col (Pendentes amber / Conferidas emerald / Total slate) + card verde "Aferição do dia concluída" quando 100% + 2 grids "Aguardando aferição"/"Conferidas hoje"; (3) `renderCardBaia(b, conferida)` unificado — pendentes com ring amber, conferidas com border emerald + badge "Conferida hoje" sobre a foto; (4) Modo "Gerenciar baias" toggle `Settings` no header esconde/mostra editar/remover/Nova baia (foco em aferição); (5) Bugfix lateral: `ult.lida_por_nome`/`ult.lida_em` → `lidaPorNome`/`lidaEm`. R-001/R-007/R-010 OK. UI puro, zero migration. Detalhe completo: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2413** — EQUIPAMENTOS LOCADOS/IMPORT · Fornecedor (locadora) OBRIGATÓRIO antes de cadastrar itens via PDF (IA). `confirmarImport()` 2º guard após o de obra (conta `fornecedorNome` vazios, popup com 8 primeiros números). Botão "Confirmar" prioriza visual semObra > semForn > OK. Mesma simetria de Rev. 2353. Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2412** — AVALIAÇÃO INTELIGENTE/UX · Modal "Score Detalhado" modernizado (faixa azul #1B2A4A, hero card colorido, 4 sub-cards por dimensão via `SUBSCORE_COLOR_MAP` estático, `DadoBrutoRow` tabela, footer LGPD). `DialogContent max-w-2xl→3xl p-0 overflow-hidden gap-0`. Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2411** — EQUIPAMENTOS LOCADOS ↔ ALMOXARIFADO/BUGFIX · Devolução/exclusão de locado agora propaga pro almox + 3 novos statuses (aguardando_chegada/quebrado/solicitado_substituicao). 3 helpers em `server/lib/almoxEquipamentoSync.ts` (single + bulk + purge startup). `locadoDevolver` calcula `tempoNaObraDias` no evento. STATUS_* expandidos 5→8 pills com cyan/rose/fuchsia. Ver `shared/changelog.ts`.
- **Rev. 2410** — AVALIAÇÃO INTELIGENTE/BUGFIX · `getDb()` chamado sem `await` em `carregarInputs` (server/routers/avaliacaoFuncionarios.ts L74). `db` virava Promise, quebrava "db.select is not a function" e zerava a tela. Fix 1 caractere: `await getDb()`. Único call site síncrono no server/. Ver `shared/changelog.ts`.
- **Rev. 2409** — IA/PERFORMANCE · Desligado "modo thinking" do Gemini 2.5 Flash em `invokeGeminiVision` (server/_core/llm.ts). `thinkingConfig.thinkingBudget=0` + param `thinking?:"off"|"auto"` default "off" + guarda regex `gemini-2.5+`. Combate "trava em 99%": PDF pequeno 25-40s→8-15s. Ver `shared/changelog.ts`.

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
