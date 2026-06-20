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

- **Rev. 3363** — **FINANCEIRO / CONCILIAÇÃO · APLICAÇÃO/RESGATE AUTOMÁTICO (CDB ContaMax / SANTANDER): (1) FLAG POR CONTA NO CADASTRO; (2) APLICAÇÃO E RESGATE JÁ CAEM COMO MOVIMENTAÇÃO INTERNA (NÃO-CAIXA); (3) O RENDIMENTO DO MÊS É LIDO DO EXTRATO E PROPOSTO PRA CONFIRMAÇÃO — AO CONFIRMAR, GERA 3 LANÇAMENTOS EFETIVOS: RECEITA FINANCEIRA (BRUTO) + DESPESA IOF + DESPESA IR (OPÇÃO A). NUNCA LANÇA SOZINHO. 1 COLUNA NOVA (SELF-HEAL) + PARSER + 1 MUTATION + 1 ALERTDIALOG.** Pedido: contas Santander "ContaMax" varrem o saldo todo dia (aplica de manhã/resgata à noite), poluindo a conciliação com mov. não-caixa; o rendimento precisa virar receita financeira. CAMADA 1: coluna `temAplicacaoAutomatica` SMALLINT default 0 em `company_bank_accounts` (`drizzle/schema.ts` camelCase quoted + `[SyncSchema+]`) + checkbox em `ContasBancarias.tsx` + campo em `criar/atualizarContaBancaria` (`folhaPagamento.ts`). CAMADA 2: o `_INTERNO_PATTERNS` (`financial.ts`) já reconhece "aplica/resgate/contamax/cdb" → linhas já caem como internas (sem código novo). CAMADA 3 (rendimento): `santanderPdfParser.ts` lê a linha "Acumulado Mês" da tabela CDB ContaMax (bruto=col Rendimento resgatado, IOF, IR); `parseExtratoLines`/`analyzeBankStatement` propagam `rendimentoAplicacao`; NOVA mutation `lancarRendimentoAplicacao` (3 entries efetivos receita+IOF+IR, find-or-create categorias AUTO, conciliado=1, `origem_modulo='rendimento_aplicacao'`, idempotente RACE-SAFE por conta+ano/mês via `pg_advisory_xact_lock`+re-check dentro da transação, tenant guard duplo); `FinanceiroConciliacao.tsx` abre `AlertDialog` esmeralda pós-import propondo bruto/IOF/IR/líquido em BRL. DESVIO: usei o BRUTO RESGATADO da "Acumulado Mês" (0,82) em vez do A+B da "Posição Consolidada" (0,84) do plano — só o resgatado reconcilia bruto−IOF−IR=líquido. RESSALVA: parser robusto, mas falta validar contra a saída exata do `pdf-parse` num ContaMax real. VALIDAÇÃO: tsc limpo (0 erros novos). Detalhe: `shared/changelog.ts`.

- **Rev. 3362** — **FINANCEIRO / MOVIMENTAÇÃO INTERNA (CNPJs/CPFs DO GRUPO) · AGORA DÁ PARA EXCLUIR DE VERDADE (HARD DELETE) E TAMBÉM INATIVAR (SOFT) À ESCOLHA: A LIXEIRA ANTES SÓ INATIVAVA; AGORA CADA LINHA TEM 3 AÇÕES — EDITAR · INATIVAR/REATIVAR (REVERSÍVEL) · EXCLUIR DEFINITIVAMENTE (COM CONFIRMAÇÃO). 1 MUTATION NOVA (BACKEND) + 1 FRONT.** Pedido (usuário): "Quero poder excluir mesmo e inativar tbm se eu quiser". BACKEND (`server/routers/financial.ts`): NOVA mutation `purgeInternalCnpj` que faz `DELETE FROM financial_internal_cnpjs WHERE id=$1 AND company_id=$2 RETURNING id` (tenant guard `_assertFinanceiroCompanyAccess` + escopo id+company_id); a `deleteInternalCnpj` antiga segue como o SOFT-delete (inativa). RESSALVA R-007: o DELETE real é restrito a ESTA tabela de CADASTRO interno (recadastrável, NÃO toca dado transacional/financeiro) e foi pedido EXPLÍCITO do usuário → exceção pontual à regra-padrão. FRONT (`FinanceiroConfiguracoes.tsx`): coluna "Ações" com 3 botões — Editar (lápis), Inativar (`PowerOff` âmbar)/Reativar (`Power` esmeralda), Excluir (`Trash2` vermelho) que abre `AlertDialog` de confirmação (mostra doc+nome, avisa "não pode ser desfeita", sugere Inativar p/ remoção reversível); `purgeCnpjMut` + state `cnpjToPurge`. VALIDAÇÃO: tsc limpo nos 2 arquivos. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3361** — **FINANCEIRO / MOVIMENTAÇÃO INTERNA · CORRIGIDO "NÃO LOCALIZEI O NOME AUTOMATICAMENTE": A CONSULTA À RECEITA (BrasilAPI) DAVA HTTP 403 PORQUE O `fetch` DO NODE (undici) NÃO MANDAVA `User-Agent` (WAF REJEITA SEM UA). AGORA MANDA `User-Agent`/`Accept` + FALLBACK ReceitaWS.** `server/routers/financial.ts` (`consultarCnpj` etapa 4): headers `User-Agent: FC-ERP/1.0`/`Accept`; timeout 4s→5s; FALLBACK ReceitaWS (`/v1/cnpj/<digits>`) se a BrasilAPI falhar/voltar vazia. Host FIXO + só dígitos → sem SSRF; READ-ONLY. Detalhe: `shared/changelog.ts`.

- **Rev. 3360** — **FINANCEIRO / CARTÃO DE CRÉDITO · ABA GERENCIAL · DRILL-IN: AGORA DÁ PARA CLICAR EM QUALQUER GRÁFICO/LINHA DA ANÁLISE (PIZZA, BARRAS DE EVOLUÇÃO, PERFIL DE PARCELAMENTO, ENCARGOS, ESTABELECIMENTOS, OBRA E CATEGORIA) E ABRIR UM DIÁLOGO COM OS LANÇAMENTOS INDIVIDUAIS POR TRÁS DAQUELE NÚMERO. 1 ENDPOINT READ-ONLY + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** `server/routers/cartao.ts` (NOVO `itensDrill` após `analiseGerencial`): mesmos recortes + `{ itens[], qtd, total, truncado }` LIMIT 1000; `parcelas` 1/N/-1; `natureza` força `tipo='encargo'` via CASE SQL espelhando `classifEncargo`; helper `ph()` (dbExecute liga por ordem); tenant guard. `FinanceiroCartaoCredito.tsx`: state `drill` + query lazy + onClick em todos os gráficos + diálogo navy com tabela. Detalhe: `shared/changelog.ts`.

- **Rev. 3359** — **FINANCEIRO / MOVIMENTAÇÃO INTERNA (CNPJs/CPFs DO GRUPO) · AO EDITAR UM REGISTRO SEMEADO E DIGITAR O CNPJ, O "NOME / IDENTIFICAÇÃO" NÃO ERA PREENCHIDO PORQUE O NOME BUSCADO NÃO SOBRESCREVIA O PLACEHOLDER "(VALIDAR NOME)". AGORA O AUTO-PREENCHIMENTO TRATA O PLACEHOLDER COMO VAZIO E A SUGESTÃO APARECE COM O NOME COMPLETO + BOTÃO "USAR ESTE NOME". 100% FRONT · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `FinanceiroConfiguracoes.tsx`: helpers `nomeEhPlaceholder` (regex `/\(validar nome\)/i`) + `nomeSubstituivel` (vazio OU placeholder), `useEffect` sobrescreve quando `nomeSubstituivel`; notinha verde mostra o nome sugerido + fonte + botão "usar este nome". Detalhe: `shared/changelog.ts`.

- **Rev. 3358** — **FOLHA / FERIADOS · O DIÁLOGO "BAIXAR FERIADOS {ANO}" GANHOU UM LAYOUT MODERNO COM AS CORES INSTITUCIONAIS DA FC (FAIXA AZUL NO TOPO COM ÍCONE, CARD VERDE DOS NACIONAIS, CHIPS DE UF COM SELO/CHECK E PONTINHO ÂMBAR P/ AS UFs DAS OBRAS) + ATALHOS "TODAS"/"LIMPAR" E CONTADOR DE UFs SELECIONADAS. 100% FRONT · UX · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `Feriados.tsx` (só o diálogo "Baixar Feriados"): cabeçalho em faixa `bg-gradient-to-br from-primary` com ícone Download, card esmeralda dos nacionais, seção estaduais com contador `{n} selec.` + atalhos "Todas"/"Limpar" (handlers `selecionarTodasUfs`/`limparUfs`), chips de UF reestilizados (sigla mono, pontinho âmbar p/ UF de obra, CheckCircle). Mutation/query idênticas. Detalhe: `shared/changelog.ts`.

- **Rev. 3357** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A SUGESTÃO DE "PROVÁVEL FORNECEDOR/CLIENTE" GANHOU UM ALGORITMO DE CRUZAMENTO MUITO MELHOR (POR TOKENS, PONDERADO POR TAMANHO, COM FUZZY/DICE E MELHOR-MATCH EM VEZ DO "1º SUBSTRING VENCE") E, NO DIÁLOGO "LANÇAR", A SUGESTÃO É PRÉ-PREENCHIDA E EDITÁVEL. 1 MATCHER REESCRITO (BACKEND) + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** `matchCadastro` (`server/routers/financial.ts`): CNPJ = sinal FORTE ("alta"); por nome tokeniza descrição+beneficiário, descarta ruído (`_STOP_TOKENS`), pontua por PESO dos tokens (exato/prefixo/Dice ≥0.82), exige token forte (≥4) e ≥50% do peso, vence o de MAIOR peso ("media"/"baixa"). `FinanceiroConciliacao.tsx`: vínculo reflete a confiança + "Lançar" pré-preenche Fornecedor (datalist editável). Detalhe: `shared/changelog.ts`.


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
