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

- **Rev. 2771** — **EPI · HISTÓRICO DE TRANSFERÊNCIAS 100% RASTREÁVEL: A DESCRIÇÃO DO ITEM AGORA MOSTRA O TAMANHO (Nº DA BOTA / TAM. DA CAMISA), A DATA GANHA HORA E APARECE O USUÁRIO QUE FEZ A TRANSFERÊNCIA.** Pedido (usuário): no "Histórico de Transferências" (aba Transferências da tela de EPIs) a linha só mostrava o NOME do EPI sem o número/tamanho, a data sem hora e sem indicar QUEM fez. Constatação: o backend JÁ persistia tudo — `epi_transferencias.criadoPor`/`criadoPorUserId`/`createdAt` (timestamp COM hora) são gravados no `transferir` (`ctx.user`); só faltava trazer o tamanho/categoria na query e exibir. Fix (SERVER+CLIENT; ZERO SCHEMA): `listarTransferencias` (`server/routers/epis.ts`) passou a trazer `tamanhoEpi`/`categoriaEpi`/`criadoPorUserId`; em `client/src/pages/Epis.tsx` a tabela ganhou (1) coluna "Data / Hora" via `createdAt` (data+hora, fallback p/ `data`), (2) 2ª linha na descrição do EPI com o tamanho ("Nº {t}" p/ Calçado, "Tam. {t}" p/ Uniforme/EPI), (3) NOVA coluna "Usuário" com `criadoPor`. Ressalva: transferências antigas sem `criadoPor`/`createdAt` mostram "—" (sem backfill em produção — R-001/R-007/R-010). Validação: servidor sobe limpo; HMR ok; architect. Detalhe: `shared/changelog.ts`.
- **Rev. 2770** — **EPI · FILTRO DE CATEGORIA "CALÇADO" ZERAVA A LISTA DO CATÁLOGO — MISMATCH DE ACENTO ("Calçado" COM CEDILHA NO FILTRO vs "Calcado" SEM CEDILHA NO BANCO).** Sintoma (usuário): na tela de EPIs (aba Catálogo), ao filtrar a categoria "Calçado" a lista ficava VAZIA, mesmo havendo calçados cadastrados. Investigação (Neon, read-only): `epis.categoria` tem só três valores — "Uniforme", "EPI" e "Calcado" — TODOS SEM CEDILHA; o formulário de cadastro já salva `value="Calcado"` (só o rótulo exibido é "Calçado"). Causa-raiz (SÓ CLIENT) em `client/src/pages/Epis.tsx`: o filtro mandava `categoria="Calçado"` (com cedilha) p/ `epis.list` (`eq(epis.categoria, input.categoria)`) → nunca casava com "Calcado" → 0 linhas → "item fica zerado". O tipo do estado `filterCategoria` e a derivação `tamanhosFiltro` também comparavam contra "Calçado". Fix (SÓ CLIENT; ZERO SCHEMA/SERVER): alinhado ao valor REAL do banco — tipo do estado "Calçado"→"Calcado", comparação em `tamanhosFiltro` p/ "Calcado", e `<SelectItem value="Calcado">` mantendo o RÓTULO visível "Calçado" (mesma convenção do form de cadastro). EPI/Uniforme intactos. Validação: servidor sobe limpo; HMR ok; architect. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2769** — COMPRAS · GERAÇÃO DE OC A PARTIR DE COTAÇÃO POR PACOTE: OS ITENS DA SOLICITAÇÃO NÃO PERDEM MAIS O VÍNCULO/QUANTIDADE — ACABOU A OC COM "MONTE DE ITENS EM BRANCO" (QTD 0 / R$ 0,00). Causa (SÓ SERVER): em `criarOrdemDeCotacao` (`server/routers/compras.ts`), o insert dos itens fazia `qty = resp ? n(resp.quantidade) : n(it.quantidade)`; numa cotação por PACOTE o fornecedor consolida valores em poucas linhas e o `isPacoteChildZero` grava as demais ZERADAS (qtd 0/preço 0) de propósito → a OC herdava o zero e o item "perdia o vínculo". Fix (SÓ SERVER; ZERO SCHEMA/CLIENT): só em pacote, resposta zerada vira "não cotada" → a OC mantém a QUANTIDADE da solicitação com PREÇO/TOTAL 0 (sem preço fantasma; total da OC = `cot.total` não muda). Ressalva: vale p/ OCs geradas a partir desta rev.; as existentes precisam ser regeradas. Detalhe: `shared/changelog.ts`.

- **Rev. 2768** — FOLHA DE PAGAMENTO · "LISTA POR BANCO" + "GERAR REMESSA CNAB": AGORA AGRUPAM PELA CONTA DA EMPRESA (CONTA SALÁRIO), NÃO MAIS PELO BANCO PESSOAL DO FUNCIONÁRIO. Sintoma: "Por Banco" separava pelo banco da conta PESSOAL (`employees.banco`) e mostrava a conta pessoal — mas a empresa paga por uma conta-salário específica. Fix (SERVER+CLIENT; ZERO SCHEMA): `simularPagamento` anexa a conta-empresa (`contaBancariaEmpresaId`→`company_bank_accounts`) a cada funcionário; `FolhaPagamento.tsx` agrupa por `contaEmpresaId` (conta específica id→ag/cc), grupo "Sem conta definida" sem CNAB; `gerarRemessaCnab` filtra por `contaBancariaEmpresaId` + HARDENING (tenancy guard, `ativo=1 AND deletedAt IS NULL`). Ressalva: meses simulados antes da rev. caem em "Sem conta definida" até resimular. Detalhe: `shared/changelog.ts`.

- **Rev. 2767** — PLANEJAMENTO · "% PREVISTO": PARIDADE 100% COM O MS PROJECT — O ERP AGORA EXIBE O Texto10 LITERAL (O NÚMERO QUE O MSP JÁ CALCULOU) DE CADA UPLOAD SEMANAL, EM VEZ DO VALOR DO MOTOR. ELIMINA O +1% A PARTIR DA ~4ª SEMANA. Causa: o motor conta TEMPO ÚTIL minuto-a-minuto, mas o MSP conta DURAÇÃO em DIAS ÚTEIS FECHADOS → excesso cresce no miolo. Fix (SERVER+CLIENT+SCHEMA aditivo): NOVA coluna `planejamento_projetos.previsto_literal_json` (self-heal); `capturarPrevistoLiteralSemana` grava o Texto10 por cutoff no `salvarMetadadosMSProject` (`origem==="avanco"`); o cliente PREFERE o literal nas semanas enviadas e cai no motor nas futuras. Detalhe: `shared/changelog.ts`.

- **Rev. 2766** — PLANEJAMENTO · AVANÇO SEMANAL · BARRA "AVANÇO FÍSICO" DO TOPO: O "% PREVISTO" DA 1ª SEMANA VOLTA A APARECER (mostrava 0% / barra vazia, só "acendia" da 2ª semana em diante), FICANDO IDÊNTICO AO CARD "PREVISTO (SEMANA)". Causa-raiz (SÓ CLIENT): a curva "% Previsto" (Caminho B) é função-DEGRAU ancorada nos cutoffs semanais; `raizAt` antes do 1º cutoff devolve 0%. Fix (SÓ CLIENT) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`: novo memo `previstoRefStr` (semana selecionada lê SEMPRE o fim da semana, igual ao card; em Live mantém `topRefStr`); `avancoPrevistoDia` passou a ler a curva em `previstoRefStr`. ZERO cálculo novo. Detalhe: `shared/changelog.ts`.

- **Rev. 2765** — PLANEJAMENTO · "% PREVISTO": A CURVA É CONGELADA NO CADASTRO DO CRONOGRAMA E O UPLOAD SEMANAL (AVANÇO) NUNCA MAIS A REGENERA — ELIMINA A DERIVA DE ±1% VS MS PROJECT EM SEMANAS AVANÇADAS. Causa (SÓ SERVER): desde a Rev. 2646 `salvarMetadadosMSProject` regenerava a curva (`previsto_semanas_json`) em TODO upload — inclusive o SEMANAL — re-rodando o motor com o calendário daquela semana → oscilação. Fix (SERVER+CLIENT; ZERO SCHEMA): input `origem:"cadastro"|"avanco"`; em `"avanco"` NÃO regenera o previsto e mescla o `calendarioJson` preservando do cadastro `previstoMspSnapshot`+calendário (só atualiza realizado/StatusDate). `importarDoMSProject` passa `origem:"avanco"`; cadastro passa `origem:"cadastro"`. Detalhe: `shared/changelog.ts`.



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
