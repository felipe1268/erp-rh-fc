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

- **Rev. 3124** — **FINANCEIRO / "LANÇAMENTOS" · O MODAL "NOVO LANÇAMENTO" (E EDIÇÃO/RECORRÊNCIA) AGORA ABRE EM TELA CHEIA — APROVEITANDO TODA A LARGURA/ALTURA NO LUGAR DO CARD CENTRAL ESTREITO COM SCROLL APERTADO.** PEDIDO (iPad, build mode, com print): "QUERO A TELA FULL SCREEN". O modal de Novo Lançamento (também Editar Lançamento/Recorrência) abria limitado a `max-w-[min(1200px,96vw)]` × `95vh`, espremendo o formulário com muito scroll interno. SOLUÇÃO (FRONTEND-ONLY, 1 CLASSNAME + 1 PROP; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE): em `client/src/pages/financeiro/FinanceiroLancamentos.tsx` o `<DialogContent>` passou para TELA CHEIA — `max-w-none w-screen h-[100dvh] max-h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none border-0 p-0 overflow-hidden flex flex-col` (as classes `top-0/left-0/translate-x-0/translate-y-0` anulam a centralização base `top-[50%] left-[50%] -translate-1/2`; `100dvh` respeita as barras do Safari iOS) + `resizable={false}`. A estrutura interna já era flex-col correto (header `shrink-0` → corpo `flex-1 min-h-0 overflow-y-auto` → rodapé `shrink-0`), então só o corpo rola e o form respira. O "X" de fechar e o "Cancelar" do rodapé seguem funcionando. Puramente layout/UX. Detalhe: `shared/changelog.ts`.

- **Rev. 3123** — **CONTROLE DE DOCUMENTOS / ABA "MAPEAMENTO" · A LEITURA DE ASOs POR IA AGORA ABRE UM PAINEL DE PROGRESSO FIXO COM BARRA 0–100% E EVOLUÇÃO DETALHADA ITEM-A-ITEM — E FICA NA TELA ATÉ O USUÁRIO REVISAR/APROVAR CADA LEITURA.** PEDIDO (iPad, build mode): "no processamento de IA dos ASOs, mostra a % de 0 a 100% com a evolução detalhada, e deixa o painel fixado na tela até eu aprovar o documento." Antes era um botão mudo "Processando..." que despejava tudo de uma vez na seção "Revisão por IA". SOLUÇÃO (FRONTEND + 1 ENDPOINT READ-ONLY; ZERO SCHEMA/ALTER/DROP/DELETE): novo `docs.asos.listPendentesIA` (`server/routers/controleDocumentos.ts`) lista ASOs elegíveis (ativos, COM PDF, SEM extração `aguardando_revisao`/`aprovado`), tenant-safe (`assertAiModuleEnabled` + `resolveCompanyIdsGuard`), espelhando o filtro do antigo `lerLoteIA`. No `MapeamentoPanel`, o processamento virou um RUNNER CLIENT-SIDE (`runBatch`/`runLote`) que chama `docs.asos.lerComIA` 1 ASO por vez (lista de alvos EXPLÍCITA → sem estagnação), atualizando `fila→processando→ok/erro`. Overlay `<Dialog>` FIXO: barra %, "Processando X de N" + ASO atual, 3 contadores (Total/Sucesso/Falhas) e lista item-a-item com ícone por estado. Fica TRAVADO (`batchLocked` = rodando OU `awaitingReview` OU `revisaoQ.isFetching` OU fila > 0): "X" some (`showCloseButton`), clique-fora/Escape bloqueados (`onInteractOutside`/`onPointerDownOutside`/`onEscapeKeyDown`), botão do rodapé desabilitado ("Aprove para fechar"). A flag `awaitingReview` (setada se o lote teve ≥1 leitura OK; zerada por `useEffect` só quando o fetch da fila resolve SEM erro e REALMENTE vazia) fecha a brecha de corrida do refetch (fila momentaneamente 0 não libera o fechamento). Ao terminar, troca p/ fase "revisão" embutindo os cards `RevisaoCardIA` — só libera "Concluído — Fechar" quando cada extração for Aprovada/Descartada; estado de erro no fetch mostra "Tentar novamente" (não libera). Nada aplica ao ASO sem "Aprovar". As mutations `lerSelecionadosIA`/`lerLoteIA` seguem no backend, só não são mais chamadas pelo client. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3122** — CONFIGURAÇÕES / "MÓDULOS DO SISTEMA" · O TOGGLE DO MÓDULO DE MEDIÇÃO DO CLIENTE FOI RENOMEADO DE "MEDIÇÃO" PARA "MEDIÇÃO CLIENTE" — AGORA BATE COM O CARD DA HOME E DISTINGUE DO "MEDIÇÃO TERCEIROS". FRONTEND-ONLY, 1 STRING: em `client/src/pages/Configuracoes.tsx` a entrada `medicao` do `MODULE_INFO` teve o `label` trocado de "Medição" → "Medição Cliente" (subtitle e key `medicao` intactos — gating/toggle/navegação inalterados). Puramente cosmético/UX. ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3121** — RAIO-X DO FUNCIONÁRIO / ABA "ASOs" · A "FICHA DO ASO (LEITURA POR IA · REVISADA)" DEIXOU DE SER TEXTO CORRIDO E VIROU TABELAS ESTRUTURADAS (APTIDÕES, RESTRIÇÕES ITEMIZADAS, FATORES DE RISCO POR CATEGORIA) — DADOS GRANULARES PRONTOS PRA LEITURA TABULAR E FUTUROS GRÁFICOS DE PERFIL. 2 parsers puros novos em `client/src/components/RaioXFuncionario.tsx` — `parseRestricoesItens` (1 frase = 1 item; split em ". " sem lookbehind/lookahead p/ não quebrar no iOS) e `parseFatoresRiscoCategorias` (quebra por "Físicos:"/"Químicos:"/etc → `[{categoria,texto}]`; sem rótulo cai em "Geral"). A ficha (tela aba "ASOs" + PDF SST) vira 3 tabelas: Aptidões campo/valor com badges, Restrições itemizada com destaque VERMELHO, e Fatores de risco por Categoria × Fatores. Só com `temIa`; conteúdo IA `esc` (anti-XSS). FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3120** — CONFIGURAÇÕES / "MÓDULOS DO SISTEMA" · O MÓDULO "MEDIÇÃO TERCEIROS" PASSOU A APARECER NA LISTA DE TOGGLES (ANTES SÓ NA HOME) — HABILITÁVEL/DESABILITÁVEL DE FORMA INDEPENDENTE, RESPEITANDO A HIERARQUIA COM "TERCEIROS". `moduleConfig.list` (`server/routers.ts`) ganhou `medicao-terceiros` em `ALL_MODULES` (default `enabled:true`); `Configuracoes.tsx` nova entrada no `MODULE_INFO` (label "Medição Terceiros", ícone `Receipt`). Gating HIERÁRQUICO pai→filho em `DashboardLayout.tsx`/`ModuleHub.tsx`: exige `isModEnabled("terceiros") && isModEnabled("medicao-terceiros")`. ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3119** — RAIO-X DO FUNCIONÁRIO / ABA "ASOs" · A LEITURA POR IA DO ASO (APTO ALTURA NR-35, ESPAÇO CONFINADO NR-33, RESULTADO, RESTRIÇÕES, FATORES DE RISCO) VIROU UMA FICHA ORGANIZADA SOB CADA ASO — RESTRIÇÕES DESTACADAS EM VERMELHO. `raioX` (`server/routers/controleDocumentos.ts`) mescla as extrações `aso_extracao_ia` `status="aprovado"` (SELECT tenant-safe) em cada ASO (`fatoresRisco`/`iaConfianca` + flag `temIa`). Frontend `RaioXFuncionario.tsx`: cada ASO com `temIa` ganha linha-ficha; PDF "Exportar PDF" (Documentos SST) replica. Nada aplicado sem aprovação humana. Detalhe: `shared/changelog.ts`.

- **Rev. 3118** — CONTROLE DE DOCUMENTOS / ABA "MAPEAMENTO" · MÚLTIPLA SELEÇÃO PARA LER VÁRIOS ASOs COM IA DE UMA VEZ — ANTES SÓ DAVA P/ LER 1 POR LINHA (✨) OU O LOTE AUTOMÁTICO (10 pendentes). Backend `docs.asos.lerSelecionadosIA` (input `asoIds[]` min 1/max 100) via o mesmo `processarAsoComIA` (dedup; valida companyId), gateada por `assertAiModuleEnabled(companyId,"rh")` + `resolveCompanyIdsGuard`. Frontend `MapeamentoPanel`: checkbox por linha (só com PDF), "selecionar todos" filtrado, botão "Ler selecionados com IA (N)" abre a Revisão por IA. Nada aplica ao ASO sem aprovação humana. Detalhe: `shared/changelog.ts`.

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
- **Moeda SEMPRE em formato BRL pt-BR (`R$ 100.000,00` — ponto p/ milhar, vírgula p/ centavos).** Tanto na EXIBIÇÃO (usar `formatBRL`) quanto em INPUTS de digitação de valor (usar máscara `maskBRL`/`parseMaskBRL`). Nunca exibir/aceitar o formato cru anglo `100000.00`.
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
