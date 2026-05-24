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

- **Rev. 2366** — **FEATURE/UX · Busca de foto "como usuário normal faria" em `/equipamentos/locados`: 1 descrição → DuckDuckGo Images → 1º resultado → UPDATE em todas as unidades dessa descrição. ZERO LLM.** Pedido user (24/05/2026, IMG_1164): "Ela pesquisa na internet cada nome, acha a foto e coloca no item... como um usuário normal faria". **Diagnóstico:** Revs. 2340-2349 (lote com LLM gerando query EN → OpenVerse/Wikimedia cascade) entregavam foto errada em ~30-40% (LLM generalizava demais — "scaffold panel" pegava um painel qualquer, não o PAINEL NR18 1,5x1,0 BR). Rev. 2355 desistiu e fez biblioteca curada. Agora um terceiro caminho: literal "o que o Google mostraria". **Bloqueio técnico:** Rev. 2349.1 documenta GOOGLE_API_KEY bloqueada permanentemente pra Custom Search (403 API_KEY_SERVICE_BLOCKED). **DuckDuckGo Images** é o substituto — sem chave, sem cota, indexa PT-BR. Fluxo de 2 fetches: (1) GET `duckduckgo.com/?q=…&iax=images&ia=images` extrai token `vqd` via regex no HTML; (2) GET `duckduckgo.com/i.js?l=br-pt&o=json&q=…&vqd=…` retorna JSON com `results[]` → pega 1º item com URL HTTPS + extensão jpg/png/webp + ≤1000 chars. Headers de browser real (UA Chrome 120 + Accept-Language PT-BR). **Backend** (`server/routers/equipamentos.ts:1401`): novo `locadosBuscarFotoWebPorDescricao({companyId, descricao, sobrescrever})`, tenant guard, 2 fetches com timeout 9s, retorna `{ok, fotoUrl, itensAtualizados}` ou `{ok:false, motivo}`. UPDATE escopado por `company_id`+`descricao` exata; sem `sobrescrever` aplica só onde `foto_url` vazia E sem foto física. **Frontend** (`client/src/pages/equipamentos/Locados.tsx`): (1) hook+helpers — `buscandoDescricoes:Set` (loading por descrição), `batchWeb` state com `{atual,total,descricaoAtual,ok,falhas,itensAtualizados}`, `batchWebRef` pra cancelamento graceful, funções `buscarFotoUma(d,sob)` e `popularFotosWebTodas(sob)` (loop sequencial com pausa 250ms anti-rate-limit). (2) Botão hero **"Buscar fotos da web"** (substitui "Tentar IA" antigo — ícone Globe, cor sky em vez de pink, badge contador). (3) **Thumbnail interativo no grupo**: COM foto → overlay preto no hover com RefreshCw chama `buscarFotoUma(d,true)`; SEM foto → placeholder INTEIRO vira botão (hover sky-50, badge Globe). Loading mostra spinner. (4) **Widget de progresso flutuante** canto inferior direito (z-80, `role=status`+`aria-live=polite`) com header sky/cyan, barra animada, descrição atual, 3 KPIs (Encontradas/Sem foto/Aplicadas) + botão "Parar busca" (cancela após call atual). **Preservado:** `locadosBuscarFotosComIA` (multi-source LLM) intocado no backend; biblioteca curada (Rev. 2355) segue como caminho determinístico (indigo). **Limitação:** "1º resultado" não é 100% — botão por card permite re-trigger individual; pra casos críticos, biblioteca curada garante 100%. **R-001/R-007/R-010:** UPDATE escopado, idempotente, zero DDL.
- **Rev. 2365** — **UX/REORGANIZAÇÃO + KPI · Análise IA "Comprar vs Continuar Alugando" MIGRADA de `/equipamentos/locados` (botão âmbar + modal full-screen) pra Dashboard Almoxarifado aba "Equip. Locados", agora com KPI 0-100% em anel SVG.** Pedido user (24/05/2026, IMG_1163): "Quero um percentual de zero a cem porcento... tbm não quero esta análise aí. Quero uma análise no dash". **Problema**: análise vivia na tela operacional (`/equipamentos/locados` = recebimento físico+check-in+devolução do almoxarife) + modal pesado travava iPad. Quem TOMA decisão de comprar (engenheiro/comprador) nunca abria essa tela — vive no Dashboard. Faltava também métrica-resumo que respondesse "que fatia do meu aluguel é desperdício?" (os 4 KPIs antigos eram absolutos, não razão). **Fix em 2 arquivos**: (1) **Remoção em `client/src/pages/equipamentos/Locados.tsx`**: botão hero, modal full-screen (~215 linhas), types `AnaliseItem`/`AnaliseResultado`, states, mutation `analiseCAMut`, imports não-usados (`Scale`/`ShoppingCart`/`TrendingDown`). (2) **Adição em `client/src/pages/dashboards/DashAlmoxarifadoEquipamentos.tsx` aba locados** (após "Locações mês a mês", antes do `</TabsContent>`): card âmbar com header (gradient amber-50→white) + 2 CTAs (Gerar/Atualizar análise + Re-analisar) + **anel SVG 0-100% destacado** (R=44, dashoffset animado 700ms, cor escala por threshold ≥50%emerald/≥25%amber/<25%slate) mostrando "% do gasto mensal que vale a pena comprar" = `sum(gastoMesTotal dos COMPRAR_JA+COMPRAR) / sum(gastoMesTotal de todos)` × 100. Frase pt-BR ao lado: "Você gasta R$ X/mês... R$ Y/mês está em itens que a IA recomenda comprar". + 4 KPIs auxiliares (Recomendado comprar · Economia anual · Investimento · Avaliar/Manter) + filter pills + tabela completa (9 colunas) + estado erro (`iaErroMsg` em faixa amber). **Decisão de design**: das 3 alternativas pro %, escolhi "% do gasto mensal" porque pondera por valor (1 betoneira cara ≠ 1 sapata barata) e responde diretamente à pergunta financeira "fração do OPEX que vira CAPEX". 70%→cotação urgente; 20%→continua locando. **Decisão técnica**: endpoint `locadosAnalisarCompraVsAluguel` (server/routers/equipamentos.ts:1446-1620) INTOCADO — só o cliente que o chama mudou, zero risco de regressão. **Anel SVG sem dependência externa** (2 `<circle>` + rotação -90°, <1KB, respeita `prefers-reduced-motion` via Tailwind). **R-001/R-007/R-010**: N/A — 100% client-side, zero DDL.
- **Rev. 2364** — **UX/REDESIGN · Modal de cadastro de Equipamentos Próprios (`/equipamentos/proprios`) refeito do zero pra "servente consegue cadastrar".** Pedido user (24/05/2026, IMG_1161+1162): "Quero um layout novo, de fácil cadastramento... que seja tão fácil que um servente possa fazer o cadastro". **Problema**: modal antigo expunha 11 campos de uma vez (Patrimônio* · Nº Série · Descrição* · Categoria · Marca · Modelo · Data · Valor · Vida útil · Obs · Fotos) com `Patrimônio` obrigatório e zero auxílio — inviável pra cadastrar 50 ferramentas via tablet em campo. **Fix em 1 arquivo** (`client/src/pages/equipamentos/Proprios.tsx`): (1) **FOTO no topo** com dropzone gigante (border-dashed, Camera 12×12) + `capture="environment"` (abre câmera traseira direto em mobile); quando tem fotos vira grid 3-col com lixeira por foto + tile "+" (máx 6). Só renderiza no modo Novo. (2) **Descrição único obrigatório** com label "O que é?" (linguagem de canteiro), placeholder com exemplos, `autoFocus`. (3) **Categoria via 8 chips de toque** (Andaime·Betoneira·Compressor·Gerador·Compactador·Serra·Furadeira·Ferramenta elétrica — bate com `vida_util_*` do CAPEX); chip ativo azul sólido, toggle real; categoria livre digitada cai num input "Outra categoria" abaixo. (4) **Patrimônio auto-preenchido**: placeholder mostra próximo ID `EQP-NNNN` (`data.length+1`, padStart 4) + botão "Auto" (Sparkles); `salvar()` faz fallback se vazio. Backend valida unicidade (CONFLICT → toast). (5) **"Mais detalhes (opcional)" collapsible** (fechado no Novo, aberto no Editar) esconde Nº Série·Marca·Modelo·Data·Valor·Vida útil·Obs + `FotosUploader` antigo (só na edição). (6) **Mobile-first**: bottom-sheet no mobile (`items-end` + `rounded-t-2xl`), centralizado em ≥sm; header/footer `sticky`; `max-h-[92dvh]` pro iOS Safari; botão Salvar text-base. (7) **A11Y**: `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-expanded` no toggle, `aria-label` em botões só-ícone. **R-001/R-007/R-010**: N/A — só client, zero mudança de schema.

### Revisões recentes (one-liners)

- **Rev. 2363** — UX/FILTRO · Cards KPI da aba "Equip. Locados" do Dashboard Almoxarifado ficaram CLICÁVEIS — clique aplica filtro contextual à tabela abaixo (troca fonte + título + colunas). Ver `shared/changelog.ts`.
- **Rev. 2362** — FEATURE/IA · Nova análise "Comprar vs Continuar Alugando" em /equipamentos/locados — IA estima preço de mercado de cada descrição e calcula payback + recomendação (migrada pra Dashboard na Rev. 2365). Ver `shared/changelog.ts`.
- **Rev. 2361** — UX/FILTRO · Cards KPI de Equipamentos Locados ficaram CLICÁVEIS (drill-down por urgência) + novo card "Vencendo (5d)" + grid 5col responsivo (2/3/5). Ver `shared/changelog.ts`.
- **Rev. 2360** — UX/REDESIGN · Aba "Movimentações" do Dashboard Almoxarifado refeita pra análise mais profunda + todas as datas dos charts padronizadas em DD/MM (BR). Ver `shared/changelog.ts`.
- **Rev. 2359** — UX/OBSERVABILIDADE · Parse de PDF de locação ganha painel de diagnóstico em tempo real (fase atual + timer mm:ss + contador de checagens + heartbeat verde) pra eliminar percepção de "travado em 99%". Ver `shared/changelog.ts`.

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
