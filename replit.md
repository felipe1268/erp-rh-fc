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

- **Rev. 2793** — **PLANEJAMENTO · REFIS (RELATÓRIO DE EVOLUÇÃO FÍSICA DA OBRA): A IMPRESSÃO GANHOU MOLDURA FECHANDO O RETÂNGULO DE CADA PÁGINA, CABEÇALHO FIXO REPETIDO EM TODA PÁGINA (LOGO FC + OBRA + DATA DE STATUS) E A DATA DE STATUS PASSOU A SAIR EM VERMELHO/DESTAQUE; REFORÇO ANTI-CORTE DE LINHAS/CABEÇALHOS DE TABELA.** Pedido (usuário): "Quero que o ERP evite de cortar informações... ao final de cada página tenha uma linha fechando o retângulo da página... cada página deve ter o cabeçalho fixado, quero a data de status em destaque e na cor vermelha". Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): (1) `.refis-page-frame` (`position:fixed`, inset ≈ margem−3mm, borda navy) → moldura repintada em TODA página; (2) `.refis-running-header` (`position:fixed`, faixa branca topo: logo FC + obra à esq. + "DATA DE STATUS" + data VERMELHA à dir.) repete em todas as páginas; `@page` ganhou +16mm SÓ no topo p/ reservar o espaço e não sobrepor o conteúdo; moldura+cabeçalho ficam FORA do `#refis-print-area` (que tem `zoom`), renderizados via Fragment como irmãos, só no print; (3) data de status em destaque vermelho também na faixa-título (chip branco `.refis-title-statuschip`) e na célula "Data-Status" da ficha (`.refis-status-cell`/`.refis-status-red`); (4) anti-corte: `tr{break-inside:avoid}`, `thead/tfoot` repetem entre páginas, `orphans/widows:3`, `.refis-section-head{break-after:avoid}`. Nenhuma série/cálculo/dado mudou — só apresentação de impressão. ZERO ALTER/DROP/DELETE. Validação: esbuild OK; HMR; architect. RESSALVA: repetição de `position:fixed` por página depende do motor de impressão (validado p/ Chrome). Detalhe: `shared/changelog.ts`.
- **Rev. 2792** — **PLANEJAMENTO · REFIS (RELATÓRIO DE EVOLUÇÃO FÍSICA DA OBRA): NA IMPRESSÃO OS GRÁFICOS DA CURVA S AGORA PREENCHEM A LARGURA DA FOLHA (ACABOU O ESPAÇO BRANCO À DIREITA) E OS RÓTULOS DO EIXO X NÃO SE SOBREPÕEM MAIS.** Pedido (usuário): "Ainda não está bom, temos muito espaço branco na tela, onde o gráfico pode ficar maior... a legenda deve ser nítida e não pode ter textos sobrepostos" (3 prints: Curva S Financeira/Física estreitas com branco à direita + eixo X com datas sobrepostas). Causa-raiz (DUAS): (A) o Recharts `ResponsiveContainer width="100%"` mede a largura na TELA; gerando o PDF pelo CELULAR (tela estreita) o SVG nasce pequeno e `window.print()` não re-mede p/ a folha A4 → gráfico estreito; (B) `interval={0}` forçava TODOS os rótulos do eixo X → datas sobrepostas. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): (1) os 2 containers (BLOCO 3A físico + 3B financeiro) ganharam classe `refis-chart-box`; o botão "Imprimir PDF" agora, antes de imprimir, calcula a largura útil da folha (A4 retrato/paisagem − 2× margem, mm→px@96dpi, compensada pelo `zoom`), aplica em px inline nos chart-box, dispara `resize` p/ o Recharts re-medir, aguarda ~260ms e `window.print()`, restaurando no `afterprint` (try/catch → print puro); (2) `interval={0}` → `interval={Math.max(0, Math.ceil(data.length/24)-1)}` + `minTickGap={6}` nos 2 gráficos. Nenhuma série/cálculo/dado mudou — só apresentação. ZERO ALTER/DROP/DELETE. Validação: esbuild OK; HMR; architect. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2791** — PLANEJAMENTO · REFIS: OS GRÁFICOS DA CURVA S (FÍSICA 3A E FINANCEIRA 3B) GANHARAM EVIDÊNCIA — MAIS ALTOS NA TELA (360→460px) E, PRINCIPALMENTE, NA IMPRESSÃO (215pt→330pt). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): containers 3A/3B `height` 360→460; seletor print `[style*="height: 460"] { height: 330pt }`; `break-inside: avoid` mantido. Detalhe: `shared/changelog.ts`.

- **Rev. 2790** — PLANEJAMENTO · REFIS: LOGOS DA BANDA DE MARCAS GANHARAM EVIDÊNCIA — SLOT QUASE DOBROU (28→52pt) E A BANDA FICOU MAIS ALTA P/ VALORIZAR AS 3 MARCAS (ESQ = CONSTRUTORA · MEIO = GERENCIADORA · DIR = CLIENTE). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`, CSS `@media print`): ordem mantida; `.refis-logo-slot` 28→52pt, `.refis-logo-cell` min-height 44→76pt + paddings/gap maiores, rótulos/nome-fallback ampliados. Detalhe: `shared/changelog.ts`.

- **Rev. 2789** — PLANEJAMENTO · REFIS: CABEÇALHO DE IMPRESSÃO REMODELADO EM 3 BANDAS (LOGOS UNIFORMES EM FUNDO BRANCO · TÍTULO NAVY COM SELO DE REVISÃO · FICHA TÉCNICA) E MARGEM TRIPLICADA (12→36mm). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): `.refis-doc-header` reconstruído em banda de logos (grid 3 colunas fundo branco) + banda de título navy + ficha técnica; margem default 12→36mm (chave `refisMargemMmV3`→`V4`). (Logos ampliados depois na Rev. 2790; gráficos na Rev. 2791.) Detalhe: `shared/changelog.ts`.

- **Rev. 2788** — PLANEJAMENTO · REFIS: REPAGINAÇÃO EXECUTIVA DA IMPRESSÃO NO ESTILO DO MODELO CLÁSSICO FC — FAIXAS DE SEÇÃO PASSARAM A DOURADO COM TEXTO NAVY, GANHOU MOLDURA, BARRA DE LOGOS SLIM E MARGEM 3cm→12mm. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): `.refis-section-head` dourada no print; fallback bg-slate→dourado; moldura `#refis-print-area`; margem default→12mm (chave `refisMargemMmV2`→`V3`). (Cabeçalho remodelado depois nas Rev. 2789/2790.) Detalhe: `shared/changelog.ts`.

- **Rev. 2787** — PLANEJAMENTO · REFIS: CABEÇALHO REPAGINADO — OS 3 LOGOS (EXECUÇÃO/FC · GERENCIAMENTO · CLIENTE) VIRARAM CHIPS BRANCOS DENTRO DA FAIXA AZUL COM MICRO-RÓTULO DOURADO; CABEÇALHOS DA CURVA S GANHARAM DESTAQUE NAVY. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): barra `.refis-brand-bar` integrada à faixa azul; cabeçalhos 3A/3B de cinza→navy + acento dourado. (Cabeçalho substituído na Rev. 2789.) Detalhe: `shared/changelog.ts`.

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
