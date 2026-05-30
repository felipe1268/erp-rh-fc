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


- **Rev. 2603** — **PLANEJAMENTO · A CURVA DO PREVISTO (CAMINHO B) PASSA A USAR O MESMO MOTOR DE TEMPO ÚTIL DO MSP QUE O TOP BAR JÁ USA — ANTES CALCULAVA EM DIAS CORRIDOS + RAIZ POR MÉDIA PONDERADA, POR ISSO DIVERGIA DO MSP SEMANA A SEMANA (0,2,4,5,7 vs 1,3,4,6,8) E DO PRÓPRIO TOP BAR.** Decisão (usuário, Opção 1): MANTER a curva futura (projeção até o fim da obra no cadastro), mas replicando a fórmula NATIVA do MSP — não "ler Texto6/Texto10" (que só existe na semana do XML), e sim refazer a conta do Project. Confirmado nos dados (projeto 35 REVTE-CIVIL): "% Concluída" (`PercentComplete`) é o REALIZADO (0 em 115/115 tarefas do BASE_LINE) e segue lido por semana (golden rule Rev. 2533+); "% PREVISTO" = `Texto6`. CAUSA-RAIZ (2): (1) `regenerarPrevistoSemanasCaminhoB` calculava a fração em DIAS CORRIDOS (ms) vs MSP em TEMPO ÚTIL (ProjDateDiff/calendário UID=6 Seg–Qui 9h/Sex 8h −feriados); (2) raiz por média ponderada de peso vs fórmula sobre a baseline da própria raiz. O motor correto (`pctRaizMSP`/`fracaoDecorridaMs` de `shared/diasUteis`) JÁ existia e o top bar/`mspReadOnly` já o usavam — só a curva não. FIX (SÓ SERVER — `server/routers/planejamento.ts`; ZERO CLIENT/SCHEMA/ALTER/DROP/DELETE): o helper carrega o calendário, RAIZ = `pctRaizMSP(semana, min(BL_Start), max(BL_Finish), cal)`, POR ATIVIDADE = `floor(fracaoDecorridaMs(BL_Start, semana, BL_Finish, cal)×100)`; sem calendário → fallback dias corridos. Camada de exibição inalterada (só muda a FONTE). Validação matemática: raiz do projeto 35 → 1,38/3,10/4,83/6,55/8,27% → floor 1,3,4,6,8 = bate exato com o MSP. Validado: esbuild server (exit 0) + workflow reiniciado. Detalhe: `shared/changelog.ts`.
- **Rev. 2602** — **PLANEJAMENTO · AO EXCLUIR O CRONOGRAMA, O PREVISTO DAQUELA REVISÃO É APAGADO JUNTO. ANTES A BARRA SUPERIOR "AVANÇO FÍSICO" CONTINUAVA EXIBINDO O PREVISTO ANTIGO (EX.: 18,37%) MESMO COM 0 ATIVIDADES.** Sintoma (screenshots projeto 35 REVTE-CIVIL): após limpar o cronograma (Cronograma "0 atividades", Avanço Semanal sem atividades), a barra superior seguia em Previsto 18,37%. Pedido: "quando excluir o cronograma as atividades previstas devem ser apagadas também". CAUSA-RAIZ: a mutation `limparCronograma` apagava só `planejamento_atividades`/`planejamento_avancos` da revisão, mas NÃO a curva CAMINHO B `previsto_semanas_json` nem o snapshot MSP do `calendario_json`; como a barra lê a curva (`previstoCurva`, Rev. 2599/2600) com o snapshot como fallback, o previsto antigo seguia vivo. FIX (SÓ SERVER — `server/routers/planejamento.ts`; ZERO CLIENT/SCHEMA/ALTER/DROP/DELETE de schema): em `limparCronograma`, após apagar atividades/avanços, se a curva PERTENCE à revisão excluída (`snap.revisaoId === input.revisaoId`) zera `previsto_semanas_json`/`previsto_semanas_gerado_em` (UPDATE da própria coluna — permitido) + chama o helper existente `limparSnapshotMspDoProjeto`; curvas de OUTRAS revisões ficam intactas; retorno ganha `previstoLimpo`. CLEANUP (UPDATE só da coluna via script node→Neon — permitido): projeto 35 já estava quebrado (0 atividades + curva revisaoId=50 do backfill da Rev. 2601) → curva LIMPA (snapshot já vazio). Validado: esbuild server (exit 0) + workflow reiniciado + verificação SQL → barra superior passa a exibir "—". Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2601** — PLANEJAMENTO · CORRIGE A CAUSA-RAIZ DO PREVISTO TRAVADO EM ~1%: BUG DE ZONA MORTA TEMPORAL (TDZ) NO SERVER IMPEDIA A CURVA CAMINHO B DE SER GRAVADA (`previsto_semanas_json` NULL em TODOS os projetos). As Rev. 2599/2600 (client) estavam certas — só faltava o dado. CAUSA: em `regenerarPrevistoSemanasCaminhoB` a montagem de `folhas` chamava `toUtc()`/`toDateStr()` ANTES das declarações `const` → `ReferenceError` sempre (esbuild isolado não roda o código, passou batido). FIX (SÓ SERVER — `server/routers/planejamento.ts`; ZERO CLIENT/SCHEMA/ALTER/DROP/DELETE): mover `toDateStr`/`toUtc` para ANTES de `folhas`. Backfill via UPDATE da própria coluna JSON + self-heal em `getProjetoById`. Validado via esbuild (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2600** — PLANEJAMENTO · HOTFIX DA REV. 2599: (1) CORRIGE O CRASH `ReferenceError: Can't find variable: previstoCurva` QUE DERRUBAVA A TELA; (2) DESTRAVA O PREVISTO DA BARRA SUPERIOR (CONGELADO EM ~1%). CAUSA: a Rev. 2599 definiu `previstoCurva` no componente PRINCIPAL mas as refs vivem no componente irmão `AvancoSemanal` (escopo léxico distinto → ReferenceError em runtime); e o previsto do topo (`avancoPrevistoDia`) lia só o snapshot UID=0. FIX (SÓ CLIENT — `PlanejamentoDetalhe.tsx`): `previstoCurva` propagado como prop para `<AvancoSemanal>`; `avancoPrevistoDia` passa a ler `previstoCurva.raizAt(topRefStr)` (snapshot vira fallback). CAMINHO B mantido. Validado via esbuild (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2599** — PLANEJAMENTO · AVANÇO SEMANAL · PREVISTO DESTRAVADO: A TELA (CLIENT) PASSA A LER A CURVA CAMINHO B (`previsto_semanas_json`) POR SEMANA — ANTES FICAVA CONGELADA EM ~1% (SNAPSHOT ÚNICO DA RAIZ UID=0). FIX-A (CLIENT — `PlanejamentoDetalhe.tsx`): novo useMemo `previstoCurva` (parser com `raizAt`/`ativAt`/`idxAt`); `mspReadOnly`, `previstoRealizadoSemana` e a coluna % por atividade passam a LER a curva (snapshot/fórmulas legadas viram FALLBACK). FIX-B (SERVER — `getProjetoById`): self-heal que regenera a curva quando NULL. Decisão MANTIDA: CAMINHO B fica, ERP só LÊ. **NOTA: o self-heal não populava de fato por causa do bug de TDZ — corrigido na Rev. 2601.** Validado via esbuild (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2598** — PLANEJAMENTO · AVANÇO SEMANAL VIRA LEITURA PURA DO MS PROJECT: REMOVIDA A AUTO-DISTRIBUIÇÃO (Rev. 2237) QUE INVENTAVA AS SEMANAS PASSADAS A PARTIR DA CURVA PREVISTA. Decisão do usuário ("ERP só LÊ, não calcula"): no import semanal o ERP só lê a `% Concluída` (PercentComplete) do XML e grava a semana do StatusDate — sem preencher semanas anteriores com cumulativo planejado. O PREVISTO continua sendo a curva CAMINHO B gerada no cadastro (`regenerarPrevistoSemanasCaminhoB`). FIX (SÓ CLIENT; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE): `PlanejamentoDetalhe.tsx` (`importarDoMSProject`) — removido o bloco de auto-distribuição + `matched` + contadores/toasts `semanasAutoSalvas`/`avancosAutoSalvos`/`avancosPreservados`. REFIS e indiretas intocados. Validado via esbuild client (exit 0). Detalhe: `shared/changelog.ts`.

- **Rev. 2597** — **PLANEJAMENTO · ABA "EFETIVO × IA" · PLANO DE ATAQUE ENXUTO: FICA SÓ O GUIA PASSO A PASSO + O PLANO TÁTICO + A LINHA DE BALANÇO; AS DEMAIS SEÇÕES NARRATIVAS DA "MESA DE GUERRA" SAEM DA TELA.** User: "só deixa o guia passo a passo" (manter também Linha de Balanço e Plano Tático). FIX (SÓ CLIENT — UI; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE; prompt da IA INTOCADO): `AnaliseEfetivoIA.tsx` (`PlanoAtaque`) mantém Missão/veredito + Guia passo a passo + Plano Tático + Linha de Balanço; remove da renderização Centro de Gravidade, Frentes Críticas, Mesa de Guerra, Manobras, Realocação, Assertividade, Processos/Automações, Cenários, Absorção das férias, KPIs e Condições de vitória. Validado via esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
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
- **REGRA DE OURO — CAMINHO B (Rev. 2533+, substitui Rev. 2427).** FONTE ÚNICA = coluna `PercentComplete` do MS Project, lida nos dois momentos:
  - **% PREVISTO** (raiz e atividades) = fórmula NATIVA do MSP em **TEMPO ÚTIL** (ProjDateDiff sobre o calendário do XML), **NÃO** dias corridos (Rev. 2603). RAIZ = `floor(pctRaizMSP(semana, min(BL_Start), max(BL_Finish), cal))` (fórmula sobre a baseline DA PRÓPRIA RAIZ, sem ponderação por peso, INT como a coluna Texto6); POR ATIVIDADE = `floor(fracaoDecorridaMs(BL_Start, semana, BL_Finish, cal) × 100)`. Usa o MESMO motor de `shared/diasUteis` que o top bar/`mspReadOnly` (curva = top bar = MSP). Sem calendário gravado → fallback dias corridos (backward compat). Gerada uma vez no `salvarAtividades` (cadastro do cronograma) e congelada em `planejamento_projetos.previsto_semanas_json`. Matematicamente idêntico a varrer "Data do Status" no MSP semana a semana. (Antes da Rev. 2603: dias corridos + raiz por média ponderada → divergia 0,2,4,5,7 vs 1,3,4,6,8.)
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` L96-203 + chamada pós-transaction em `salvarAtividades`), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` L470-490).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
