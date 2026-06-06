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

- **Rev. 2785** — **PLANEJAMENTO · REFIS (RELATÓRIO DE EVOLUÇÃO FÍSICA DA OBRA): NA IMPRESSÃO, O RELATÓRIO PASSOU A OCUPAR A FOLHA INTEIRA E FICAR CENTRALIZADO — ACABOU A FAIXA DE "ESPAÇO LIVRE" À ESQUERDA/EM VOLTA QUE VINHA DO LAYOUT DO APP (SIDEBAR).** Pedido (usuário): mandou screenshot do PDF com grandes áreas marcadas EM AMARELO em volta do relatório ("estas áreas em amarelo não podem ficar; quero layout mais ajustado nas margens, pode considerar ele centralizado na folha") e depois esclareceu que o amarelo era ANOTAÇÃO dele apontando o espaço desperdiçado, não cor do sistema. Causa-raiz: o `#refis-print-area` é `position:absolute` e, no print, se ancorava no `<SidebarInset>` do shadcn (`<main class="relative ...">`), que fica À DIREITA da sidebar → o relatório herdava esse deslocamento horizontal + o `padding` do `<main>`, gerando a faixa lateral de espaço livre e o desalinhamento (mesmo com a sidebar escondida). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`, `@media print`): (1) NEUTRALIZA o shell — `#root, #root > *, [data-slot="sidebar-inset"], main, [role="main"]` viram `position:static; margin/padding:0; width:100%; max-width:none; min-height:0; overflow:visible; border-radius/box-shadow:0` → nenhum ancestral posicionado, o relatório ancora no INITIAL CONTAINING BLOCK (a folha); (2) esconde `[data-slot="sidebar"]`/`[data-slot="sidebar-container"]`/`aside`; (3) CENTRALIZA — `#refis-print-area` ganhou `left:0; right:0; margin-left/right:auto`. Mantidos os controles de Margem/Zoom da Rev. 2784; o "espaço livre" VERTICAL (quebras/curva-S) segue calibrável via Zoom. ZERO ALTER/DROP/DELETE. Validação: esbuild OK; HMR; architect. Detalhe: `shared/changelog.ts`.
- **Rev. 2784** — **PLANEJAMENTO · REFIS (RELATÓRIO DE EVOLUÇÃO FÍSICA DA OBRA): A BARRA DO RELATÓRIO GANHOU CONTROLES DE "MARGEM" (mm) E "ZOOM" (%) PARA O PRÓPRIO USUÁRIO CALIBRAR A IMPRESSÃO AO VIVO — A CONFIGURAÇÃO FICA SALVA NO NAVEGADOR.** Pedido (usuário): "ainda está errado... arrume isso de vez OU criar uma forma de configurar os critérios de margem e zoom para o usuário calibrar o formato da página". Depois de 2 rodadas de CSS de impressão às cegas (Rev. 2782/2783) que não convergiram (o agente não enxerga o PDF do Ctrl+P), adotada a 2ª opção do usuário: colocar o controle na mão dele. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (componente `Refis`): (1) estados `refisMargemMm` (0-25mm, default 8) e `refisZoom` (40-160%, default 100) lidos/gravados no `localStorage` via 2 `useEffect`; (2) controles novos na barra (`no-print`, ao lado do toggle de orientação): input de Margem (mm) + stepper −/+ de Zoom (%) com "reset"; (3) aplicação no `@media print`: `@page { margin: ${refisMargemMm}mm }` (era fixo 8mm) e `#refis-print-area` com `zoom: ${refisZoom/100}` COMPENSADO por `width: ${10000/refisZoom}%` (densidade real sem faixa branca à direita). Fluxo: ajusta → Ctrl+P → repete. Mantidas as melhorias estruturais da Rev. 2783. Ressalva: "cores não saem" depende da opção "Gráficos de plano de fundo" LIGADA no Ctrl+P. ZERO ALTER/DROP/DELETE. Validação: esbuild OK; HMR; architect. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2783** — PLANEJAMENTO · REFIS: IMPRESSÃO REDESENHADA P/ PADRÃO EXECUTIVO DENSO — REMOVIDAS QUEBRAS FORÇADAS (`refis-break-before`) DOS BLOCOS DA CURVA S (PÁGINAS NÃO FICAM MAIS MEIO-VAZIAS), GRÁFICOS AMPLIADOS E EM LARGURA TOTAL, CABEÇALHO ENCOLHIDO E LETRAS MÍNIMAS AMPLIADAS. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (componente `Refis`, `<style>` `@media print` + JSX da Curva S). Ressalva: "cores não saem" = opção "Gráficos de plano de fundo" desmarcada no Ctrl+P. Detalhe: `shared/changelog.ts`.

- **Rev. 2782** — PLANEJAMENTO · REFIS: O CABEÇALHO DE IMPRESSÃO PASSOU A EXIBIR OS LOGOS DO CLIENTE E DA GERENCIADORA (GESTORA) ALÉM DO DA EXECUTORA (FC); LAYOUT REORGANIZADO E MARGENS ENXUTAS (UNIFORME 8mm). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (componente `Refis`): nova faixa branca `.refis-logo-strip` com até 3 células (EXECUÇÃO/GERENCIAMENTO/CLIENTE, cada uma logo OU nome); removida a célula textual "FC" da faixa azul; `@page` unificado p/ `margin: 8mm` (era `8mm 10mm 10mm 10mm`). Detalhe: `shared/changelog.ts`.

- **Rev. 2781** — PLANEJAMENTO · AVANÇO SEMANAL: O "% CONCLUÍDA" (REALIZADO ACUM.) AGORA FICA SALVO EM TODAS AS SEMANAS JÁ ENVIADAS — ANTES SÓ APARECIA NA ÚLTIMA SEMANA CADASTRADA. Causa: o REALIZADO só tinha 1 snapshot único no `calendarioJson` (última foto); `mspReadOnly` caía em "—" nas semanas anteriores. Fix (SERVER+CLIENT+SHARED; ZERO SCHEMA — só novas chaves no JSON via UPDATE do app): `shared/diasUteis.ts` ganhou `realizadoSemanas` (whitelist no parse); `salvarMetadadosMSProject` acumula `realizadoSemanas[statusDate]` (merge aditivo); `mspReadOnly` lê a foto da semana ou a mais recente anterior (carry-forward). Detalhe: `shared/changelog.ts`.

- **Rev. 2780** — EPI · TELA "ESTOQUE POR OBRA": AO CLICAR NUMA OBRA, OS DEMAIS CARDS NÃO SOMEM MAIS — TODOS OS LOCAIS PERMANECEM VISÍVEIS NO PAINEL FIXO; O CLIQUE SÓ DESTACA O CARD (ÂMBAR) E FILTRA A TABELA DE INSUMOS ABAIXO. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/Epis.tsx`: DESACOPLADO o painel do filtro — `filteredObras = estoqueResumo` (sempre todas) e `showCentral = true`; destaque âmbar e filtragem da TABELA (`tabelaEstoqueList`) intactos. Detalhe: `shared/changelog.ts`.

- **Rev. 2779** — EPI · TELA "ESTOQUE POR OBRA": OS CARDS (RESUMO + ALMOXARIFADO CENTRAL + OBRAS) FICARAM FIXOS (STICKY) NO TOPO — SÓ A TABELA DE INSUMOS ABAIXO ROLA; E O CARD CLICADO GANHOU COR DE DESTAQUE DISTINTA (ÂMBAR). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/Epis.tsx`: card-resumo + grade em `sticky top-0 z-20 bg-background border-b`; grade com `max-h-[42vh] overflow-y-auto`; realce do selecionado de `ring esmeralda/azul` para `ring-2 ring-amber-500 bg-amber-100/70 shadow-md`. Detalhe: `shared/changelog.ts`.

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
