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

- **Rev. 3353** — **FINANCEIRO / MOVIMENTAÇÃO INTERNA (CNPJs/CPFs DO GRUPO, EM CONFIGURAÇÕES FINANCEIRAS) · LAYOUT MAIS MODERNO (LINHAS-CARTÃO COM AVATAR, SELO DE SITUAÇÃO E TIPO DO DOC), MÁSCARA VIVA pt-BR NO CAMPO CPF/CNPJ (PONTOS/BARRA/TRAÇO ENQUANTO DIGITA) E AUTO-PREENCHIMENTO DO "NOME / IDENTIFICAÇÃO": AO DIGITAR O CNPJ COMPLETO (OU A RAIZ DE 8) O NOME É PUXADO DA BASE DE CADASTRO (EMPRESAS DO GRUPO → FORNECEDORES → EMPRESAS TERCEIRAS) E, EM ÚLTIMO CASO, DA RECEITA (BrasilAPI). 1 HELPER + 1 ROTA READ-ONLY + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário): na tela da Rev. 3351 deixar o layout "no nosso padrão", separar o CPF/CNPJ por pontos (máscara enquanto digita) e puxar o nome da empresa pelo CNPJ. MÁSCARA (`formatters.ts`): NOVO `maskCpfCnpj` — viva por nº de dígitos (11=CPF `000.000.000-00`; ≤10=CNPJ progressivo cobrindo a raiz de 8; 12–14=CNPJ `00.000.000/0000-00`), idempotente, máx. 14 díg.; aplicada no `onChange` e ao abrir a edição; salvar segue gravando só dígitos (`soDigitos`). AUTO-FILL (`financial.ts`, NOVA query READ-ONLY `consultarCnpj({companyId,cnpj})`): tenant guard `_assertFinanceiroCompanyAccess`; busca em cascata pelo 1º acerto — `companies` ACESSÍVEIS (`getCompaniesForUser`→IN de ids validados, `"razaoSocial"`) → `fornecedores` da empresa (`company_id`/`razao_social`) → `empresas_terceiras` (`"companyId"`/`razao_social`) → só p/ CNPJ 14 e nada casando, Receita via `brasilapi.com.br/api/cnpj/v1/<digitos>` (host FIXO + só dígitos → sem SSRF; fetch+AbortController 4s; try/catch nunca lança); casa por igualdade (14/11) ou prefixo da raiz (8); retorna `{nome,fantasia,fonte:'cadastro'|'receita'|null}`. FRONT (`FinanceiroConfiguracoes.tsx`): `useQuery` LAZY (enabled só com diálogo aberto + empresa + 14/8 díg.; `retry:false`, `staleTime` 5min) + `useEffect` preenche o Nome SÓ se vazio (não sobrescreve digitação); status sob o campo ("Buscando…/Nome sugerido pela base/Receita/Não localizei"); tabela `border-separate` (linhas-cartão), avatar `Building2`, doc monoespaçado + rótulo do tipo, selo "Ativo" com ponto verde. VALIDAÇÃO (Neon): `consultarCnpj` retorna a razão social pelo CNPJ real; raiz de 8 casa por prefixo; doc desconhecido → `nome=null`. tsc limpo. Detalhe: `shared/changelog.ts`.

- **Rev. 3352** — **FOLHA / HORAS EXTRAS · CALENDÁRIO DE FERIADOS AGORA TEM OBSERVÂNCIA POR EMPRESA E ESCOPO POR CIDADE. PONTO FACULTATIVO (CARNAVAL, CORPUS CHRISTI) NASCE "NÃO SEGUIDO" (DIA NORMAL, SEM HE INDEVIDA) ATÉ O GESTOR MARCAR "SEGUE" — E PODE LIMITAR A QUEM SEGUE POR CIDADE/UF (O CAMPO CIDADE JÁ AUTOCOMPLETA COM AS CIDADES DAS OBRAS ATIVAS). O HE (E O MEMORIAL) SÓ TRATA O DIA COMO FERIADO (JORNADA ESPERADA=0 → HE 100%) QUANDO ELE É OBSERVADO NA CIDADE DA OBRA ONDE A PESSOA BATEU PONTO NAQUELE DIA. 1 COLUNA NOVA (SELF-HEAL) + BACKEND (HELPERS + CRUD + NOVA MUTATION) + 2 ROTAS DE HE + 1 FRONT · ZERO ALTER/DROP/DELETE EM DADOS EXISTENTES.** Pedido (usuário, com print "Editar Feriado" do Corpus Christi): Carnaval/Corpus são ponto facultativo (cada cidade decide se "segue"), não nacional obrigatório; hoje qualquer feriado força HE 100% p/ todos. MODELAGEM (self-heal `[SyncSchema+]` + `drizzle/schema.ts`): `feriados.observado smallint DEFAULT 1 NOT NULL` (1=segue; 0=dia normal) + backfill ÚNICO na criação da coluna `UPDATE feriados SET observado=0 WHERE tipo='ponto_facultativo'` (nunca re-flipa escolha do gestor — copy-on-write). Escopo continua DERIVADO de cidade/estado (cidade→municipal; estado→estadual; senão nacional), free-text casado por normalização (sem acento/minúsc.). BACKEND (`feriados.ts`, FONTE ÚNICA): `feriadosMoveis` reclassificado (Carnaval/Corpus=facultativo `observadoDefault=false`; Sexta Santa=nacional `true`); NOVO `getFeriadosObservadosForPeriod`→ocorrências `{data,escopo,estado,cidade,observado,nome}` (defaults suprimidos por NOME quando há row); `indexFeriadosObservados`+`isFeriadoObservado(idx,data,cidade,estado)`; `criar`/`atualizar` aceitam `observado`/`cidade`/`estado`; `seedNacionais` grava observado; NOVA mutation `definirObservancia` (copy-on-write p/ defaults; tenant guard `ensureUserOwnsCompanies`). HE (`horasExtras.ts`): `computeHEForPeriod`+`memorialCalculo` trazem `tr."obraId"`+`LEFT JOIN obras` (cidade/estado/nome); `feriadosSet.has` → `isFeriadoObservado(idx,data,obraCidade,obraEstado)`; memorial expõe obra/cidade no dia. FRONT (`Feriados.tsx`): selo clicável "Segue/Não segue" por linha + badge facultativo + selo cidade/UF; diálogo com Cidade (datalist autocompletando as cidades das obras ativas, autofill da UF)/UF + "A empresa segue (observa)?"; marcar facultativo "segue" sem cidade abre o diálogo. VALIDAÇÃO (Neon): coluna `observado` presente (default 1), facultativos backfillados. tsc limpo nos arquivos tocados. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3351** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A "MOVIMENTAÇÃO INTERNA" (DINHEIRO QUE SÓ GIRA ENTRE CONTAS/EMPRESAS DA PRÓPRIA FC) GANHOU UMA BASE DE CNPJs/CPFs CADASTRÁVEL (NOVA ABA EM CONFIGURAÇÕES FINANCEIRAS) ALÉM DA HEURÍSTICA POR TEXTO; CLASSIFICAÇÃO SIMÉTRICA (ENTRADA E SAÍDA) E EXCEÇÃO MANUAL POR LANÇAMENTO ("EFETIVO"/"INTERNO") COM MOTIVO. 2 TABELAS NOVAS (SELF-HEAL) + BACKEND READ-ONLY/CRUD + 3 FRONTS · ZERO ALTER/DROP/DELETE.** `financial_internal_cnpjs` + `financial_internal_overrides`; `_loadInternoConfig` + predicado SQL/JS espelhados + override por id; CRUD com `_assertFinanceiroCompanyAccess`; aba em `FinanceiroConfiguracoes.tsx` + `_NaturezaOverride.tsx` + drill-ins. Detalhe: `shared/changelog.ts`.

- **Rev. 3350** — **FINANCEIRO / DASHBOARD DE CHEQUES · GRÁFICO "EVOLUÇÃO MENSAL POR STATUS": O VERDE (COMPENSADO) AGORA FICA NA BASE DA BARRA EMPILHADA E AS DEMAIS SITUAÇÕES (PENDENTE / INDEFINIDO) SOBEM POR CIMA DELE.** `DashCheques.tsx` (100% front): `statusKeys` ORDENADO por `rank` fixo (`compens`→0/base, `pend`→1, demais→2; desempate `localeCompare`) → Compensado vira a base; cores/drill/legenda inalterados. Detalhe: `shared/changelog.ts`.

- **Rev. 3349** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA (DASHBOARD + PANORAMA GERAL) · OS TOTAIS "ENTRADAS / SAÍDAS / SALDO" AGORA MOSTRAM O CAIXA REAL (EXTERNO): A MOVIMENTAÇÃO INTERNA (TRANSFERÊNCIA ENTRE CONTAS DA PRÓPRIA FC, APLICAÇÃO/RESGATE, PIX/TED INTRA-FC) SAIU DOS TOTAIS E GANHOU UM CARD SEPARADO "MOVIMENTAÇÃO INTERNA" COM DRILL-IN. 1 BACKEND (READ-ONLY) + 2 FRONTS · CLASSIFICAÇÃO · ZERO SCHEMA/ALTER/DROP/DELETE.** Heurística ÚNICA em `financial.ts` (`_INTERNO_PATTERNS`/`_INTERNO_REGEX_SRC` alimenta o predicado SQL `descricao ~* '<src>'` E o helper JS `_isLancInterno`); 3 endpoints READ-ONLY ganham `interno` por linha + `valorEntradas/SaidasExternas|Internas`; `DashConciliacao.tsx`/`FinanceiroConciliacao.tsx` exibem cards "(caixa real)" + 4º card "Movimentação interna". Detalhe: `shared/changelog.ts`.

- **Rev. 3348** — **FOLHA DE PAGAMENTO / HORAS EXTRAS · DRILL-IN DOS DIAS: DÁ PRA CLICAR DIRETO NAS HORAS ("HE ÚTEIS", "HE FIM SEM.", "TOTAL HE") DE CADA FUNCIONÁRIO PARA ABRIR O DETALHAMENTO DIA A DIA — ANTES SÓ ABRIA POR UM ÍCONE DISCRETO AO LADO DO "VALOR HE". 100% FRONT · UX · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `FolhaPagamento.tsx`: helper `abrirMemorial()` (mesma validação do botão existente) + as 3 células de horas viram `<button>` (hover roxo, `stopPropagation`) quando há HE; reusa o dialog "Memorial de Cálculo". Detalhe: `shared/changelog.ts`.

- **Rev. 3347** — **FINANCEIRO / DASHBOARD DE CHEQUES · DRILL-IN: A COLUNA "STATUS" DA TABELA DE DETALHE AGORA EXIBE UM SELO COLORIDO (COMPENSADO=VERDE, PENDENTE=VERMELHO, INDEFINIDO=ÂMBAR, DEVOLVIDO/SUSTADO=VERMELHO ESCURO) EM VEZ DE TEXTO CRU — PARA FICAR CLARO NA TELA, NA IMPRESSÃO E NO RELATÓRIO/PDF. 100% FRONT · UX · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `DashCheques.tsx`: novo helper `statusPill(s)` reusa a régua `statusColor` (Rev. 3341) e renderiza selo arredondado branco; a coluna "Status" vira `align:"center"` + `format:(_v,row)=>statusPill(statusEf(row))` (status EFETIVO); `printColorAdjust:"exact"` inline garante a cor no print/PDF. Detalhe: `shared/changelog.ts`.

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
