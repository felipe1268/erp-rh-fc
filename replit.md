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

- **Rev. 2813** — **COMPRAS · ORDENS — HOTFIX (DADOS INCONSISTENTES): NA OC O CAMPO "ORIGEM" MOSTRAVA "Cotação #<id>" USANDO O ID INTERNO DA COTAÇÃO (ex.: "Cotação #433"), QUE NÃO BATE COM O NÚMERO VISÍVEL (`COT-2026-0292`). AGORA EXIBE O NÚMERO REAL FORMATADO.** Pedido (usuário, screenshot OC-2026-388, item "7. Dados inconsistentes"): "ele informa que a cotação é 433, porém esse número não existe; está vinculado à COT-2026-0292 — quando você vai procurar pelo número não bate". CAUSA-RAIZ: `Ordens.tsx` renderizava a "Origem" concatenando o ID INTERNO (`cotacaoId`, serial PK) em vez do `numeroCotacao` (número humano `COT-AAAA-NNNN`). O QUE FOI FEITO: (1) BACKEND — `getOrdem` JÁ trazia `cotInfo.numeroCotacao`; `listarOrdens` passou a buscar em LOTE o `numeroCotacao` das cotações de origem e expõe `cotacaoNumero` por linha. (2) FRONT — os TRÊS pontos de exibição da "Origem" (detalhe, célula da lista e chave de ordenação/export) passaram a usar `formatNumeroCotacaoDisplay` (helper da Rev. 2808 → `COT-NNNN-AAAA`), com fallback "Cotação" / "Manual". RESSALVA: só EXIBIÇÃO; nenhum valor gravado mudou. ZERO ALTER/DROP/DELETE; ZERO schema novo. Validação: esbuild OK em `compras.ts` e `Ordens.tsx`. Detalhe: `shared/changelog.ts`.
- **Rev. 2812** — **COMPRAS · ORDENS — HOTFIX: AO CLICAR EM "EDITAR OC" O VÍNCULO DA ETAPA (EAP) SE PERDIA — O SELETOR "SELECIONAR ETAPA DO ORÇAMENTO (EAP)" ABRIA VAZIO, MESMO A OC TENDO ORIGEM NA SOLICITAÇÃO/COTAÇÃO. AGORA A ETAPA É PRESERVADA.** Pedido (usuário, com screenshot da OC-2026-388, criada a partir da Cotação #433): ao editar a OC, o chip de etapa de cada item ficava em branco. CAUSA-RAIZ: o front (`Ordens.tsx`) usa a coluna `insumoCodigo` do item da OC como CÓDIGO DA ETAPA (EAP) — lê `eapCodigo = it.insumoCodigo` e grava `insumoCodigo = i.eapCodigo`, casando contra `getEapParaObra`. Mas os DOIS caminhos de criação de OC a partir de cotação (`criarOrdemDeCotacao` e `criarOCsParciais` em `server/routers/compras.ts`) inseriam os itens SEM gravar `insumoCodigo` — o item da COTAÇÃO não carrega a etapa; ela vive no item da SC (`comprasSolicitacoesItens.eapCodigo`, via `solicitacaoItemId`). Resultado: `insumoCodigo` nulo → chip vazio. O QUE FOI FEITO: (1) LEITURA — `getOrdem` busca também `eapCodigo` da SC e, quando o item da OC não tem `insumoCodigo` próprio, herda o `eapCodigo` da SC (READ-ONLY, conserta TODAS as OCs já existentes inclusive a #388; ao salvar persiste). (2) CRIAÇÃO — nos dois caminhos foi montado um mapa `scItemId → eapCodigo` e o insert de `comprasOrdensItens` passou a gravar `insumoCodigo` derivado dele. RESSALVA: a coluna se chama `insumoCodigo` mas por convenção do front guarda o CÓDIGO DA ETAPA — não foi renomeada. ZERO ALTER/DROP/DELETE; ZERO schema novo. Validação: esbuild OK em `compras.ts`. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2811** — COMPRAS · SOLICITAÇÕES: HOTFIX — NO PDF DA SC ("GERAR PDF") AS QUANTIDADES APARECIAM COM "ESCALA EM MIL" (QTD 50 SAÍA "50.000"). Novo helper local `fmtQtd` (`parseFloat → toLocaleString("pt-BR")`); a célula "Qtd" do `gerarPdfSC` em `Solicitacoes.tsx` passou de `esc(it.quantidade)` cru para `esc(fmtQtd(it.quantidade))`. Causa: coluna numeric escala 3 → "50.000" interpretado como milhar em pt-BR. ZERO ALTER/DROP/DELETE; ZERO backend. Detalhe: `shared/changelog.ts`.

- **Rev. 2810** — CONFIGURAÇÕES · IA: HOTFIX — O LIGA/DESLIGA DO ASSISTENTE DE PERGUNTAS E RESPOSTAS NÃO SALVAVA ("ERRO AO SALVAR" / VOLTAVA A "7 DE 7 ATIVAS"); O SCHEMA DRIZZLE DA TABELA `ai_module_config` ESTAVA DESALINHADO DA COLUNA REAL. A tabela foi criada pelo self-heal com `company_id` (snake_case), mas no `drizzle/schema.ts` o campo era `companyId: integer().notNull()` SEM nome explícito → o Drizzle gerava `"companyId"` (camelCase) → toda query falhava (`column "companyId" does not exist`): leitura silenciosa (default permissivo) e escrita virava toast. FIX de 1 LINHA: `companyId: integer("company_id").notNull()`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2809** — CONFIGURAÇÕES · IA: O PAINEL "INTELIGÊNCIA ARTIFICIAL" PASSA A CONTROLAR EXCLUSIVAMENTE O CHAT DE "PERGUNTAS E RESPOSTAS" (BOTÃO VERDE FLUTUANTE / `IAModuloChat`), POR MÓDULO OU TODOS, E O BUG "0 DE 0 ATIVAS" FOI CORRIGIDO. NOVO catálogo `QA_CHAT_MODULES` (7 personas) + helper `qaChatModuleKey` (chaves `qa_`); `aiConfig.ts` ganha FALLBACK GLOBAL (sentinela companyId=0, precedência EMPRESA > GLOBAL); novos `getQaConfig`/`setQaModulo`/`setQaTodos`; gate do `chat` vira POR PERSONA; `IAConfigSection.tsx` renderiza SEMPRE o catálogo estático; botão se auto-oculta quando a persona está off. ZERO ALTER/DROP/DELETE; ZERO schema novo. Detalhe: `shared/changelog.ts`.

- **Rev. 2808** — COMPRAS · COTAÇÕES: O NÚMERO DA COTAÇÃO PASSA A SER EXIBIDO COMO `COT-NNNN-AAAA` (NÚMERO PRIMEIRO, ANO DEPOIS) EM VEZ DE `COT-AAAA-NNNN` — SÓ EXIBIÇÃO; O VALOR GRAVADO CONTINUA CANÔNICO. NOVO helper `shared/numeroCotacao.ts` (`formatNumeroCotacaoDisplay`, regex `^COT-(\d{4})-(\d+)$`) aplicado nos pontos de exibição (`Cotacoes.tsx`/`Solicitacoes.tsx`/`Painel.tsx`/`Realocacao.tsx`); geração/busca/ordenação seguem o canônico. Espelha a Rev. 2802 (SC). ZERO ALTER/DROP/DELETE; ZERO schema novo. Detalhe: `shared/changelog.ts`.

- **Rev. 2807** — COMPRAS · COTAÇÕES: "CANCELAR DIVISÃO" — DESFAZER A DIVISÃO DE UMA COTAÇÃO, DEVOLVENDO TODOS OS ITENS (E RESPOSTAS) À COTAÇÃO ORIGINAL E REMOVENDO A COTAÇÃO-FILHA. NOVA coluna `dividida_de_id` (self-heal `ADD COLUMN IF NOT EXISTS`); `cancelarDivisaoCotacao` numa `db.transaction` com advisory lock re-parenteia itens/respostas, deleta fornecedores replicados + a cotação-filha vazia e recalcula totais da original; botão "Cancelar Divisão" (âmbar) no header do detalhe só quando filha em aberto sem OC. ZERO DROP/DELETE de schema. Detalhe: `shared/changelog.ts`.

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
