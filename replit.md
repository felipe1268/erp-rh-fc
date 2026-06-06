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

- **Rev. 2788** — **PLANEJAMENTO · REFIS (RELATÓRIO DE EVOLUÇÃO FÍSICA DA OBRA): REPAGINAÇÃO EXECUTIVA DA IMPRESSÃO NO ESTILO DO MODELO CLÁSSICO FC — AS FAIXAS DE SEÇÃO PASSARAM DE AZUL-MARINHO/CINZA PARA DOURADO COM TEXTO AZUL-MARINHO, GANHOU MOLDURA DO DOCUMENTO, A BARRA DE LOGOS FICOU SLIM E A MARGEM PADRÃO CAIU DE 3cm PARA 12mm.** Pedido (usuário): "ficou péssimo... vou te mandar um modelo que fazíamos anteriormente, não é para seguir o modelo exatamente, mantenha as nossas informações mas quero que entenda a formatação das margens, e da organização das informações" (anexou o MODELO antigo — 1 pág A4 paisagem, cabeçalho navy compacto, FAIXAS DE SEÇÃO DOURADAS sobre fundo branco, gráficos densos — + 2 PDFs do resultado ruim: 4 páginas, cards navy gigantes, baixa densidade). A Rev. 2787 deixou o REFIS com estética de "dashboard escuro" (faixas navy/cinza, chips de logo grandes, 3cm de margem) — o oposto do modelo. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (componente `Refis`): (1) FAIXAS DOURADAS — nova classe `.refis-section-head` nos cabeçalhos do BLOCO 1 (título REFIS), BLOCO 2 (Evolução Física Global) e Curva S 3A/3B; no `@media print` vira faixa dourada (`linear-gradient(180deg,#FFD24A,#FFC107)`) com texto navy bold (regra só na IMPRESSÃO, `!important` vence o inline navy → tela segue navy, PDF sai dourado); (2) FALLBACK — qualquer `bg-slate-800`/`bg-slate-700` dentro de `.refis-block` também vira dourada no print, com os números de KPI claros (`text-blue/emerald/red-300`) recoloridos p/ tons escuros legíveis (#1d4ed8/#047857/#b91c1c) e textos `slate-100/200/300/white`→navy; (3) MOLDURA — `#refis-print-area` ganhou `border:1pt solid #1A3461` + `padding:5pt`; (4) BARRA DE LOGOS SLIM (chips min-height 24pt→13pt, img 19pt→11pt, etc.) — friso elegante dentro da faixa azul (que segue navy); (5) MARGEM default 30→12mm com migração de chave `localStorage` (`refisMargemMmV2`→`V3`) e "reset"→12mm. Cabeçalho-TOPO (`.refis-doc-header`) PERMANECE navy de propósito (igual ao modelo). ZERO ALTER/DROP/DELETE. Validação: esbuild OK; HMR; architect. Detalhe: `shared/changelog.ts`.
- **Rev. 2787** — **PLANEJAMENTO · REFIS (RELATÓRIO DE EVOLUÇÃO FÍSICA DA OBRA): CABEÇALHO REPAGINADO — OS 3 LOGOS (EXECUÇÃO/FC · GERENCIAMENTO · CLIENTE) PASSARAM A FAZER PARTE DA FAIXA AZUL DO CABEÇALHO, EM CHIPS BRANCOS BEM AJUSTADOS COM MICRO-RÓTULO DOURADO; E OS GRÁFICOS DA CURVA S GANHARAM DESTAQUE.** Pedido (usuário): "quero o logo do cliente, da construtora e da gerenciadora melhor ajustado... faça ele fazer parte do cabeçalho de forma interativa... dê destaque aos gráficos, quero tudo altamente moderno". Contexto: a Rev. 2782 punha os 3 logos numa FAIXA BRANCA solta (`.refis-logo-strip`) ACIMA da faixa azul — descolada do cabeçalho; os cabeçalhos da Curva S eram cinza (`bg-slate-700`). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (componente `Refis`): (1) os 3 logos viraram uma BARRA DE MARCAS INTEGRADA (`.refis-brand-bar`) — PRIMEIRO bloco DENTRO da faixa azul `.refis-doc-header`; cada marca tem micro-rótulo DOURADO (#FFC233) sobre CHIP BRANCO arredondado (logo legível no azul), distribuídos uniformemente (`flex:1 1 0`) com separadores sutis; sem logo da ger./cli. cai no NOME (`.refis-brand-name`); FC mantém fallback `/logo-fc.jpg`; (2) `.refis-doc-header` ganhou borda superior DOURADA (2.5pt #FFB800) + cantos arredondados; (3) DESTAQUE AOS GRÁFICOS — cabeçalhos da Curva S (Física 3A + Financeira 3B) de cinza → AZUL-MARINHO FC (#1A3461) com ACENTO DOURADO à esquerda + `print-color-adjust:exact`. O cabeçalho é PRINT-ONLY (aparece no Ctrl+P). Mantidos margem 3cm (2786), motor de impressão (2785), Zoom (2784). ZERO ALTER/DROP/DELETE. Validação: esbuild OK; HMR; architect. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2786** — PLANEJAMENTO · REFIS: REPAGINAÇÃO DA IMPRESSÃO — A MARGEM PADRÃO PASSOU A SER 3cm EM TODOS OS LADOS; ACABOU O RELATÓRIO "COLADO NA BORDA". Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): DEFAULT da margem = 30mm; MIGRAÇÃO da chave `localStorage` (`refisMargemMm`→`refisMargemMmV2`); RANGE 0-25mm→0-40mm; "reset"→30mm. (Revogado pela Rev. 2788, que baixou p/ 12mm + moldura.) Detalhe: `shared/changelog.ts`.

- **Rev. 2785** — PLANEJAMENTO · REFIS: NA IMPRESSÃO O RELATÓRIO PASSOU A OCUPAR A FOLHA INTEIRA E FICAR CENTRALIZADO — ACABOU A FAIXA DE "ESPAÇO LIVRE" EM VOLTA QUE VINHA DO LAYOUT DO APP (SIDEBAR). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`, `@media print`): neutraliza o shell (`#root`/`main`/`sidebar-inset` → `position:static`, margin/padding 0) p/ o `#refis-print-area` (`position:absolute`) ancorar no INITIAL CONTAINING BLOCK (a folha); esconde a sidebar; centraliza (`left/right:0; margin:auto`). Detalhe: `shared/changelog.ts`.

- **Rev. 2784** — PLANEJAMENTO · REFIS: A BARRA DO RELATÓRIO GANHOU CONTROLES DE "MARGEM" (mm) E "ZOOM" (%) PARA O USUÁRIO CALIBRAR A IMPRESSÃO AO VIVO — CONFIGURAÇÃO SALVA NO NAVEGADOR (localStorage). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (componente `Refis`): estados `refisMargemMm`/`refisZoom` + controles na barra; aplicação no `@media print` via `@page { margin }` e `#refis-print-area` com `zoom` compensado por `width`. Detalhe: `shared/changelog.ts`.

- **Rev. 2783** — PLANEJAMENTO · REFIS: IMPRESSÃO REDESENHADA P/ PADRÃO EXECUTIVO DENSO — REMOVIDAS QUEBRAS FORÇADAS (`refis-break-before`) DOS BLOCOS DA CURVA S (PÁGINAS NÃO FICAM MAIS MEIO-VAZIAS), GRÁFICOS AMPLIADOS E EM LARGURA TOTAL, CABEÇALHO ENCOLHIDO E LETRAS MÍNIMAS AMPLIADAS. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (componente `Refis`, `<style>` `@media print` + JSX da Curva S). Ressalva: "cores não saem" = opção "Gráficos de plano de fundo" desmarcada no Ctrl+P. Detalhe: `shared/changelog.ts`.

- **Rev. 2782** — PLANEJAMENTO · REFIS: O CABEÇALHO DE IMPRESSÃO PASSOU A EXIBIR OS LOGOS DO CLIENTE E DA GERENCIADORA (GESTORA) ALÉM DO DA EXECUTORA (FC); LAYOUT REORGANIZADO E MARGENS ENXUTAS (UNIFORME 8mm). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (componente `Refis`): nova faixa branca `.refis-logo-strip` com até 3 células (EXECUÇÃO/GERENCIAMENTO/CLIENTE, cada uma logo OU nome); removida a célula textual "FC" da faixa azul; `@page` unificado p/ `margin: 8mm` (era `8mm 10mm 10mm 10mm`). Detalhe: `shared/changelog.ts`.

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
- **REGRA DE OURO — CAMINHO B (Rev. 2646+, substitui Rev. 2644/2617/2533/2603).** O "% PREVISTO" é a réplica da coluna **"% PREVISTO" (Texto10) do MS Project** — "verdade absoluta". O "% CONCLUÍDA" segue a coluna `PercentComplete`. As duas régua são alinhadas às fórmulas do MSP:
  - **% PREVISTO — FÓRMULA-FONTE (Texto10):** a coluna "% PREVISTO" do MSP é `Int(Num Dur(Prev)[188743983] ÷ PESO DUR(BL)[188743982] × 100 + 0.5)` = fração de duração da baseline DECORRIDA até o StatusDate, ponderada por DURAÇÃO das folhas, **ARREDONDADA** (`+0.5` antes do `Int` = `round`, NÃO trunca).
  - **% PREVISTO — RÉGUA NO ERP (projeção p/ TODAS as semanas):** motor de **TEMPO ÚTIL MINUTO-A-MINUTO** da baseline (`unitsElapsed`/`unitsTotal` sobre `shared/diasUteis`, clipando aos `weekDayIntervals` do calendário). **RAIZ = ROLLUP** = `round(Σ minutos úteis DECORRIDOS das folhas ÷ Σ minutos úteis TOTAIS das folhas × 100)` — soma das DURAÇÕES das folhas, **NÃO** o vão início→fim do projeto (corrigido na Rev. 2644). POR ATIVIDADE = `round(elapsed/total × 100)`. `round` (não `trunc`) p/ espelhar o `+0.5` do Texto10.
  - **% PREVISTO — LEITURA DO VALOR-SNAPSHOT (cliente) (Rev. 2647+, substitui Rev. 2644):** `client/.../ImportarCronograma.tsx` lê SEMPRE a MESMA coluna FIXA `Texto10 (188743750)` via const `FID_PREVISTO_TEXTO10`, em TODOS os projetos (presentes e futuros). **ACABARAM a detecção por `<Alias>` (`detectarFidPorAlias` removida) e as reservas Texto6/Texto11.** Se Texto10 faltar no XML, o valor fica `null` → a tela mostra "—" (jamais lê outra coluna; Texto6 em templates LOTUS é lixo sem alias/fórmula). Vale pra RAIZ (`parseMSProjectFull`) e pra cada ATIVIDADE (`parseMSProjectTasksFromDoc`).
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora). Sem `weekDayIntervals` OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal = fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **PADRÃO ATUAL (Rev. 2646): o snapshot "% Previsto" REGENERA EM TODO UPLOAD DO XML — inclusive o SEMANAL — usando o calendário do XML como verdade absoluta.** Acontece em `salvarAtividades` (cadastro/substituir) E em `salvarMetadadosMSProject` (que roda em todo import e regrava o `calendarioJson` limpo). Como a baseline é imutável dentro da revisão, re-rodar é IDEMPOTENTE (mesma curva), mas garante que projetos ANTIGOS se AUTO-CUREM no próximo upload semanal (ex.: a curva ~1% baixa por feriado injetado pré-Rev. 2645 some sozinha). REVOGA a regra anterior "snapshot regenerado SÓ no salvarAtividades / avanço semanal NÃO regenera". RESSALVA: projetos dormentes (sem novos uploads) só corrigem com reimport do cronograma inicial.
  - **RESSALVA DE PARIDADE NUMÉRICA:** o XML de referência (PLN_816 R04) tem StatusDate < StartDate → Texto10 = 0% em tudo, então a curva numérica NÃO foi cravada empiricamente nesta revisão. A régua matemática está alinhada à fórmula; falta re-validar com XML de status-date no meio do projeto.
  - Implementação: `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB` — rollup das folhas + round; chamada pós-transaction em `salvarAtividades` E em `salvarMetadadosMSProject` — Rev. 2646, que roda em TODO upload e resolve a revisão ativa + respeita a fonte; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (`detectarFidPorAlias` + parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
