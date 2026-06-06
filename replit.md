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

- **Rev. 2807** — **COMPRAS · COTAÇÕES — "CANCELAR DIVISÃO": DESFAZER A DIVISÃO DE UMA COTAÇÃO, DEVOLVENDO TODOS OS ITENS (E RESPOSTAS) PARA A COTAÇÃO ORIGINAL E REMOVENDO A COTAÇÃO-FILHA.** Pedido (usuário): "garanta tbm que eu possa cancelar a divisão da cotação se eu quiser e nesta situação todos itens voltam para a cotação inicial." SCHEMA: NOVA coluna `dividida_de_id` (INTEGER nullable) em `compras_cotacoes` — referência pai→filha gravada agora no `dividirCotacao` (a cotação criada por divisão aponta para a original); self-heal `[SyncSchema+]` Rev. 2807 (`ADD COLUMN IF NOT EXISTS`; ZERO DROP/DELETE). Antes a relação só vivia num texto em `observacoes` (frágil). BACKEND (`server/routers/compras.ts`): NOVO `cancelarDivisaoCotacao({cotacaoId})` recebe a cotação-FILHA, valida que ela TEM `dividida_de_id`, que filha E original estão em aberto (pendentes), que a original existe e é da mesma empresa, e que a filha NÃO gerou OC. Guard `_assertCompanyAccess`. Em UMA `db.transaction` com `pg_advisory_xact_lock(companyId,1001)`: re-parent dos itens (UPDATE `cotacao_id`→original, PRESERVA ids) + das `cotacao_respostas` (zera `propostaId`); DELETE dos fornecedores replicados da filha; recálculo do `totalOrcado` de TODOS os fornecedores da original pelas respostas reunidas + recálculo do `total` da original; e DELETE da cotação-filha (vazia). Falha em qualquer passo → ROLLBACK. FRONTEND (`Cotacoes.tsx`): mutation + botão "Cancelar Divisão" (âmbar, ícone `Undo2`) no header do detalhe, visível SÓ quando a cotação é filha (`divididaDeId`) e está em aberto, com modal `useConfirm` (tom destrutivo). `getCotacao` já traz todas as colunas → `divididaDeId` chega ao front sem mudança no endpoint. REGRAS FC: coluna via `ADD COLUMN IF NOT EXISTS` (não-destrutivo); DELETEs são do RECURSO (cotação vazia + fornecedores replicados) inerentes à feature — itens/respostas preservados (só re-parented). Validação: esbuild OK em ambos; servidor reiniciado (self-heal materializa a coluna). RESSALVA: ação só enquanto filha E original seguem em aberto e sem OC. Detalhe: `shared/changelog.ts`.
- **Rev. 2806** — **COMPRAS · COTAÇÕES — "COTAÇÃO PARCIAL": DIVIDIR UMA COTAÇÃO EM VÁRIAS (CADA UMA COM UM SUBCONJUNTO DE ITENS PARA FORNECEDORES DIFERENTES), + SELO DE COBERTURA NA SC, "COTAR RESTANTES" 1-CLIQUE E NAVEGAÇÃO ENTRE COTAÇÕES IRMÃS.** Pedido (usuário): quebrar uma cotação existente em várias separadas, cada uma com parte dos itens, p/ fornecedores diferentes. Decisões: (1) dividir = MOVER itens (saem da original); (2) função SÓ na Cotação; (3) MANTER as 2 formas (vencedor-por-item no mapa + cotações separadas). Aprovou as 3 opcionais: selo de cobertura na SC, "cotar restantes" 1-clique e navegação entre irmãs. BACKEND (`server/routers/compras.ts`): `criarCotacao` — trava anti-duplicidade trocada de "1 cotação ativa por SC" p/ "1 cotação ativa por ITEM" (a mesma SC pode ter várias ativas, sem repetir itens). NOVO `dividirCotacao({cotacaoId,itemIds[],...})` — MOVE itens selecionados p/ NOVA cotação via UPDATE `cotacao_id` (PRESERVA ids dos `cotacoes_itens`, mantendo válidas refs de OC/respostas), move as `cotacao_respostas` (zerando `propostaId`), replica fornecedores recalculando `totalOrcado` pelas respostas movidas E recalcula o `totalOrcado` dos fornecedores da ORIGINAL (sem isso ficava stale — apontado no code review), recalcula `total` de ambas. Guard `_assertCompanyAccess`. BLOQUEIA se aprovada/cancelada/concluída, se já gerou OC, ou se mover TODOS (≥1 fica na original). TUDO em UMA `db.transaction` com `pg_advisory_xact_lock(companyId,1001)` (atomicidade + numeração serializada). NOVO `cotarItensRestantes({solicitacaoId})` — cria em 1 clique uma cotação só com os itens da SC ainda NÃO cobertos por cotação ativa; check + insert na mesma transação/lock (anti-corrida). NOVO `getCoberturaSolicitacao({solicitacaoId})` → `{total,cobertos,pendentes,itens[],cotacoes[]}`. FRONTEND: `Cotacoes.tsx` — botão "Dividir Cotação" (cotação aberta + ≥2 itens) abrindo modal de seleção por checkbox (selecionar todos/limpar, resumo X saem/Y permanecem, trava ≥1 na original); faixa violeta de navegação entre cotações irmãs (chips clicáveis, atual destacada, canceladas riscadas) + "Cotar N restantes". `Solicitacoes.tsx` — selo de cobertura ("N de M itens em cotação · P pendentes", verde quando 100%) + botão "Cotar restantes" no detalhe da SC. ZERO ALTER/DROP/DELETE; ZERO schema novo. Code review (architect) apontou atomicidade/race/recalc — todos endereçados. RESSALVA: a trava por item de `criarCotacao` segue check-then-insert fora de transação no fluxo legado de criação manual; os 2 endpoints NOVOS já estão serializados. Detalhe: `shared/changelog.ts`.
- **Rev. 2805** — **CONFIGURAÇÕES · IA — NOVO PAINEL "INTELIGÊNCIA ARTIFICIAL" NA TELA DE CONFIGURAÇÕES QUE LIGA/DESLIGA, POR EMPRESA, AS FUNCIONALIDADES DE IA DE CADA MÓDULO.** Pedido (usuário, com screenshot da tela "Configurações"): "Quero um botão nas configurações para poder habilitar e desativar todas as ias de cada módulo... quero essa opção na tela de configurações." Foram catalogados 7 módulos com IA (`compras`, `rh`/convenção, `recrutamento`, `sst`, `planejamento`, `oraculo`, `assistente`) em `shared/aiModules.ts`. NOVA tabela `ai_module_config` (company_id, modulo, enabled, índice único) com self-heal `[SyncSchema+]` (`CREATE TABLE/INDEX IF NOT EXISTS`; ZERO ALTER/DROP/DELETE) — DEFAULT PERMISSIVO: sem linha = IA habilitada. NOVO router `aiConfig` (`getConfig`/`setModulo`/`setTodos`) com guard de empresa permissivo (padrão `_assertCompanyAccess`). ENFORCEMENT real: helper `server/_core/aiConfig.ts` (`assertAiModuleEnabled`) chamado como 1ª instrução EM TODOS os endpoints de IA de cada módulo (code review apontou que gatear só 1 por módulo deixava bypass): `compras` (`extrairCotacaoIA`, `preencherPrecosFaltantesIA`, `sugerirCategoriasIA`, `sugerirPrecoIA`, `classificarDisciplinas`, `reclassificarTipoControleIA`), `rh` (`convencaoIA.processarPdf` — cobre os helpers Vision Anthropic/Gemini só alcançáveis por ele), `recrutamento` (`curriculos.processarArquivosIA`), `sst` (`epiAvancado.iaSugerir{Kits,Cores,VidaUtil,Treinamentos}` + `analisarEstoqueIA`), `planejamento` (`iaCronograma` TODOS os endpoints com LLM: `chat`, `gerarAlertasClima`, `simularCenario`, `sugerirRecursos`, `analisarDesvio`, `analisarLOB`, `analisarEfetivo`, `simularEfetivo`, `perguntarEfetivo`, `alertasSemana` — via novo helper `companyIdDoProjeto(projetoId)` que resolve o companyId REAL pela linha do projeto, NÃO `ctx.user.companyId` que fica vazio p/ admin-master), `oraculo` (`sendMessage`) e `assistente` (`iaModulos.chat`). Endpoints com companyId opcional caem p/ `ctx.user.companyId`. FRONTEND: novo `client/src/pages/configuracoes/IAConfigSection.tsx` (card violeta colapsável com Switch por módulo + "Ativar todas / Desativar todas" + badge "N de 7 ativas") no TOPO de "Configurações por Módulo" em `Configuracoes.tsx`. RESSALVA: novos endpoints de IA precisam chamar `assertAiModuleEnabled` explicitamente (sem interceptação automática em `invokeLLM`); NÃO foram gateados de propósito os helpers de IA em background de fluxos não-IA (`compras.classificarTipoControleIA`, resolvedor de embalagem na criação de item). Já em `compras.buscarPorCodigoBarras` o RAMO IA (fallback quando não acha item local) é condicionado por `isAiModuleEnabled` — lookup local segue ativo com IA off. Validação: esbuild OK em todos os routers tocados; servidor reiniciado/Neon OK (self-heal materializa a tabela). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2805** — CONFIGURAÇÕES · IA: NOVO PAINEL "INTELIGÊNCIA ARTIFICIAL" NA TELA DE CONFIGURAÇÕES QUE LIGA/DESLIGA, POR EMPRESA, AS FUNCIONALIDADES DE IA DE CADA MÓDULO. 7 módulos catalogados em `shared/aiModules.ts`; NOVA tabela `ai_module_config` (self-heal `CREATE TABLE/INDEX IF NOT EXISTS`, DEFAULT PERMISSIVO: sem linha = IA on); NOVO router `aiConfig`; enforcement via `assertAiModuleEnabled` como 1ª instrução em TODOS os endpoints de IA de cada módulo; card violeta colapsável em `Configuracoes.tsx`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2804** — COMPRAS · SEGURANÇA: FECHADO IDOR MULTI-EMPRESA EM ~86 ENDPOINTS DO ROUTER DE COMPRAS QUE RECEBIAM `companyId` DO CLIENTE SEM VALIDAR ACESSO À EMPRESA. Auditoria SCHEMA-DRIVEN injetou `_assertCompanyAccess(ctx.user, …)` em todo procedure com `companyId` E nos id-only que cruzam o recurso (guard derivado da linha dona / do PAI cotação/SC). Re-auditoria dupla final = 0 sem guard. `_assertCompanyAccess` é PERMISSIVO (admin/sem-vínculo livre; só bloqueia user vinculado fora dos vínculos). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2803** — COMPRAS · COTAÇÕES: A LISTA E O DETALHE DA COTAÇÃO PASSAM A MOSTRAR O NÚMERO REAL DA SC VINCULADA (`numero_sc`, EXIBIDO COMO `SC-NNNN-AAAA`) EM VEZ DO ID INTERNO `SC #<id>`; E O NÚMERO VIROU UM LINK CLICÁVEL QUE ABRE A SOLICITAÇÃO. `listarCotacoes` passa a trazer `numeroSc`; na tela o número vira `<button>` com `formatNumeroScDisplay` que navega p/ `/compras/solicitacoes?destaque=<solicitacaoId>`. ZERO ALTER/DROP/DELETE; ZERO schema novo. Detalhe: `shared/changelog.ts`.

- **Rev. 2802** — COMPRAS · SOLICITAÇÕES: O NÚMERO DA SC PASSA A SER EXIBIDO COMO `SC-NNNN-AAAA` (NÚMERO PRIMEIRO, ANO DEPOIS) EM VEZ DE `SC-AAAA-NNNN` — SÓ EXIBIÇÃO; O VALOR GRAVADO CONTINUA CANÔNICO `SC-AAAA-NNNN`. Novo helper `shared/numeroSc.ts` (`formatNumeroScDisplay`) aplicado nos pontos de exibição (Solicitacoes/Painel/Cotacoes/Manutencoes); busca/ordenação seguem o canônico. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2801** — COMPRAS · COTAÇÕES: OS DIÁLOGOS DE CONFIRMAÇÃO DO `window.confirm()` NATIVO (QUE EXIBIAM A URL FEIA "…replit.dev diz" NO TÍTULO) FORAM SUBSTITUÍDOS PELO MODAL CUSTOMIZADO `useConfirm` (ALERTDIALOG shadcn, TÍTULO LIMPO, TOM/ÍCONE E BOTÕES ROTULADOS). SÓ `Cotacoes.tsx`: 7 `window.confirm()` → `await confirm({...})`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
