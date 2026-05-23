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

- **Rev. 2277** — **FEAT · Filtro "Apenas atrasadas" na seção "Avanço Físico por Grupo": pill clicável no header com contador de atividades em atraso. Ao ativar: macro BarChart mostra só os grupos com atraso, cada card filtra a árvore para os ramos problemáticos e força-os expandidos até as folhas.** Pedido user (23/05/2026, VITRA): "quero um filtro para poder clicar e ver todas atividades em atraso..". Mudanças (`PlanejamentoDetalhe.tsx`): (1) novo estado `apenasAtrasadas` (L13019) — default OFF; (2) pill `⚠ Apenas atrasadas (N)` no header do BLOCO 4 à direita do título — vermelho tomato quando ativo, ghost quando inativo, disabled com tooltip quando `totalAtrasadas === 0`; (3) helpers `isAtrasadaFolha` / `temAtrasoNaArvore` / `contarAtrasadas` (BLOCO 4) + `filtrarAtrasos` recursivo (BLOCO 5) que poda mantendo ancestrais; (4) `gruposFiltrados` no macro chart com mensagem ✓ verde quando vazio; (5) cada card do BLOCO 5 usa `etapasView = apenasAtrasadas ? filtrarAtrasos(g.etapas) : g.etapas` e retorna `null` quando vazio; (6) `renderRow` força `isOpen = true` quando filtro ativo (não faz sentido pedir pra ver atrasos e ter que abrir manualmente). **R-001/R-007/R-010:** N/A (client-only).
- **Rev. 2276** — **UX · "AVANÇO FÍSICO POR GRUPO" redesenhado no estilo CRONOGRAMA: tree pai→filho com hierarquia visual por nível, cabeçalho de colunas sticky, barra inline compacta. Macro BarChart redundante removido (em VITRAIS plotava 10+ barras zeradas sobrepostas) e toggle "Mostrar/Ocultar detalhamento" eliminado.** Pedido user (23/05/2026, VITRA+VITRAIS): "melhore o layout dos graficos e tela. de forma que ela se pareça com a estruturação do cronograma. ajuste tudo para que fique de facil interpretação". Mudanças (`PlanejamentoDetalhe.tsx` BLOCO 5): (1) removido `BarChart` recharts do topo + toggle "Mostrar detalhamento" — árvore é a única visão; (2) `renderRow` reescrito como grid CSS 5 cols (Item·Atividade | Avanço | Prev | Real | Desvio) com badge EAP slate-700/white em grupos, fundos gradativos por profundidade (depth0=slate-100, depth1=slate-50, folhas=white), uppercase tracking-wide em grupos N1, border-left como indent guide, barra Previsto azul + Realizado colorido por desvio (`mix-blend-mode: multiply`), chip Desvio translúcido; (3) cabeçalho de colunas sticky (slate-700/white); (4) toolbar Expandir/Recolher acima da árvore com hint; (5) legenda de atrasos críticos coleta recursivamente das FOLHAS (antes só olhava `g.etapas` direto). **R-001/R-007/R-010:** N/A (client-only JSX).

### Revisões recentes (one-liners)

- ~~Rev. 2275~~ — FEAT · "AVANÇO FÍSICO POR GRUPO" separa pais e filhos até as FOLHAS finais com barras horizontais por nível. Ver `shared/changelog.ts`.
- ~~Rev. 2274~~ — FIX · Curva S Trabalho: snapshot MSP raiz UID=0 sobrescreve ponderação local na semana do StatusDate. Ver `shared/changelog.ts`.
- ~~Rev. 2273~~ — FIX · `realOficialRefis` em Refis: `spi`/`desvioFisico`/painel "Diretas" deixam de divergir do topo; banner "Desvio Crítico" não dispara com obra adiantada. Ver `shared/changelog.ts`.
- ~~Rev. 2272~~ — FIX · REFIS "Realizado Acumulado" passa a espelhar a barra do topo (`avancoAtual`). Ver `shared/changelog.ts`.
- ~~Rev. 2271~~ — FIX · Card "PREVISTO (SEMANA)" deixa de cair pra "—" quando snapshot MSP é zerado; agora replica topo via `pctRaizMSP`. Ver `shared/changelog.ts`.

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

> Revisões 2098 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
