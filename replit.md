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

- **Rev. 3161** — **FINANCEIRO / LANÇAMENTOS · AS RECEITAS PREVISTAS DEIXARAM DE CAIR SOZINHAS NO CONTAS A RECEBER — AGORA UM BOTÃO "RECEBÍVEIS PREVISTOS (N)" NA TELA DE LANÇAMENTOS LISTA OS PREVISTOS DO MÊS; O USUÁRIO SELECIONA E CONFIRMA A TRANSFERÊNCIA P/ RECEITA (a_receber), SEM PERDER O AVISO AUTOMÁTICO.** PEDIDO: ao EXCLUIR uma receita prevista (ex.: "QIU 2"/"LUCIANA") ela voltava sozinha no próximo sync — a exclusão "não colava"; o usuário quis a entrada MANUAL/consciente "mas sem perder o aviso automático das receitas". CAUSA: `runAllReceitasImport` (`financialIntegrationBridge`) chamava `importFinancialRevenueToEntries` a cada sync, materializando TODO `financial_revenue` em aberto como `financial_entries` (origem='revenue', idempotente por par) → recriava o que se excluía. MUDANÇA: (1) BACKEND `financialIntegrationBridge.ts` — COMENTADA a chamada `importFinancialRevenueToEntries` (importers que POPULAM `financial_revenue` seguem ativos; função preservada); (2) `cfoPhase2.ts` — `AlertaTipo` += "receita_prevista" + alerta INFO contando previstos não-lançados (preserva o aviso); (3) `financial.ts` — `getRecebiveisPrevistos` (query, lista não-lançados c/ dedup revenue+planejamento_medicao) e `transferirRecebiveisPrevistos` (mutation, `db.transaction`, INSERT...SELECT...WHERE NOT EXISTS idempotente, statusMap→a_receber, audit, tenant guard); (4) FRONTEND `FinanceiroLancamentos.tsx` — botão "Recebíveis Previstos (N)" + Dialog seleção/lote + "Efetuar lançamento" + invalida queries; a lista é ESCOPADA pela timeline da tela (`mes=${ano}-${mesSel}`; "Ano todo"=todos). RACE: a mutation abre a transação com `pg_advisory_xact_lock(hashtext('fin_recebiveis_previstos'), companyId)` serializando transferências da mesma empresa (não há índice único em origem) — SEM DDL. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3160** — **EPIs · DOIS BUGS CORRIGIDOS DE UMA VEZ: (A) NA "NOVA TRANSFERÊNCIA" O DROPDOWN DE OBRA (ORIGEM/DESTINO) APARECIA VAZIO PARA ADMIN COMUM; (B) NAS ENTREGAS AGRUPADAS (VÁRIOS EPIs NUMA LINHA) SUMIU O LÁPIS DE EDITAR ANTES DA ASSINATURA — NÃO DAVA P/ CORRIGIR A DATA DE ENTREGA EM LOTE.** PEDIDO (2 IMGs, iPad): "tela de transferência como se não tivesse obra... sumiu a função de editar antes das assinaturas... precisava alterar a data desses dois que lancei, arrume isso de vez". BUG A: o select de obra usava `obrasPermitidas`, que filtra por `canAccessObra` → só admin_master (`allowedObraIds===null`) via tudo; ADMIN COMUM (`isAdmin`) ficava com lista vazia. CORREÇÃO (FRONTEND `client/src/pages/Epis.tsx`): `obrasPermitidas` devolve TODAS as obras quando `isAdminMaster || isAdmin || allowedObraIds===null` (mesma régua do `canWriteCentral`); restrito segue filtrado. BUG B: a linha AGRUPADA (mesmo `grupoEntregaId`) nunca teve botão de editar — só a linha única tinha. CORREÇÃO (FRONTEND `Epis.tsx`): lápis "Editar" na linha agrupada quando nenhum item está assinado (`!items.some(d=>d.assinaturaUrl)`); novo `openEditGroup`+estado `editGroupItems` reaproveitam o diálogo, ocultam Quantidade e aplicam data/motivo/observações a TODOS os itens via loop `updateDeliveryMut.mutateAsync` (sem mexer em qtd/estoque). Backend `epis.updateDelivery` já recusa item assinado. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3159** — **USUÁRIOS E PERMISSÕES · NOVO CONTROLE DE ACESSO "ATIVO / DESLIGADO" POR USUÁRIO — DESLIGAR BLOQUEIA O LOGIN E DERRUBA A SESSÃO NA HORA, SEM EXCLUIR O CADASTRO.** `users.status varchar(20) DEFAULT 'ativo'` (self-heal `ADD COLUMN IF NOT EXISTS`); `loginLocal` recusa 'desligado'; `context.ts` zera a sessão; mutation `userManagement.setUserStatus` (admin, auditado); `Usuarios.tsx` badge + Switch. ZERO DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3158** — **RH / COLABORADORES · OS CARDS DE RESUMO GANHARAM UM CARD "Sócio" — ANTES "Ativos" NÃO FECHAVA COM "CLT" + "PJ" PORQUE OS SÓCIOS (tipoContrato='Socio') FICAVAM INVISÍVEIS.** Na FC (60002): Ativos=106, mas CLT(94)+PJ(9)=103 → faltavam 3 sócios. BACKEND `server/db.ts`·`getEmployeeStats` ganhou campo `socio` (mesmo agrupamento `tipoContrato` restrito a Ativo); FRONTEND `Colaboradores.tsx` card "Sócio" após "PJ". ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3157** — **RH / RAIO-X DO FUNCIONÁRIO · A FICHA NA TELA PASSOU A MOSTRAR A DATA DE NASCIMENTO COMPLETA (DIA/MÊS/ANO) — ANTES SÓ APARECIA "Aniversário: 18/03" (DIA/MÊS) E A "Idade".** PEDIDO (IMG_2095, iPad): "coloca o nascimento na ficha tbm, dia mês e ano". O card de identificação do Raio-X exibia só "Idade" + "Aniversário" (dia/mês), sem a data por extenso com o ANO; o PDF já trazia "Nascimento" (`formatDateSafe`). MUDANÇA (FRONTEND-ONLY, `client/src/components/RaioXFuncionario.tsx`): adicionado o item `Nascimento` (ícone `Calendar`) ao grid de campos, logo ANTES de "Idade", via `formatDateSafe(emp.dataNascimento)` (→ `DD/MM/AAAA`) — respeita a máscara de PII (`hidePersonal`→`PII_MASK` sem a flag `dados_pessoais`) e só renderiza quando há `dataNascimento`. "Aniversário"/"Idade" intactos. ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3156** — **FINANCEIRO / LANÇAMENTOS · OS LANÇAMENTOS CANCELADOS QUE VIERAM DE OUTRO MÓDULO E NUNCA FORAM PAGOS NO FINANCEIRO SUMIRAM DA LISTA — FICA SÓ O QUE FOI CANCELADO DENTRO DO PRÓPRIO FINANCEIRO OU O QUE TEVE BAIXA.** REGRA (FRONTEND-ONLY, `FinanceiroLancamentos.tsx`): `isCanceladoRuido(l)` = `status==="cancelado"` E origem EXTERNA (`origemModulo` fora de `recorrente`/`importacao_excel`; `null`=manual=nativo) E NUNCA teve baixa (via `teveBaixaFinanceiro`). Descartados em `baseLancamentos` antes de contagem/exibição. Totais já ignoravam cancelado → puramente visual. ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3155** — **FINANCEIRO / LANÇAMENTOS · O AGRUPAMENTO DOS LANÇAMENTOS DE FROTA PASSOU DE "POR TIPO" PARA "POR POSTO/FORNECEDOR" — CADA LINHA-GRUPO É UM POSTO (COMBUSTÍVEL) OU UMA OFICINA/FORNECEDOR (MANUTENÇÃO), ESPELHANDO O DASH "POSTOS MAIS UTILIZADOS".** Correção da Rev. 3154 (o posto/fornecedor EXISTE no módulo Frota). BACKEND READ-ONLY (`financial.ts`·`getEntries`): 2 `LEFT JOIN` por PK expõem `frotaFornecedor = COALESCE(NULLIF(BTRIM(fornecedor_nome),''), ffr.posto, fm.fornecedor)`. FRONTEND (`FinanceiroLancamentos.tsx`): `frotaGrupoOf` agrupa por `frotaFornecedor` com chave `${tipoKey}::${forn}`; sem fornecedor cai em "Combustível (sem posto)"/"Manutenção (sem fornecedor)". ZERO BACKEND DE ESCRITA/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
