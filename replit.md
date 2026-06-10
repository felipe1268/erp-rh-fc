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

- **Rev. 2950** — **CATÁLOGO DE EPIs — ESTOQUE SEPARADO POR OBRA (IGUAL EM ENTREGAS): SELETOR DE LOCAL (CENTRAL + OBRAS QUE O USUÁRIO GERENCIA) NO TOPO DO CATÁLOGO + CAMPO "LOCAL DO ESTOQUE" NO CADASTRO PARA DAR ENTRADA DIRETO NUMA OBRA, COM PERMISSÃO POR OBRA (`users.allowedObraIds`) E RASTREABILIDADE.** Pedido (usuário): o Catálogo só operava o Almoxarifado Central; Entregas já separava por obra (`epi_estoque_obra`). Regra: usuário VÊ Central; só CADASTRA/AJUSTA nas obras que tem acesso (restrito NÃO escreve no Central). SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE): `server/routers/epis.ts` ganhou helpers `assertObraWrite`/`assertCentralWrite`; `list` (input `obraId?`) usa `stockExpr` (subquery COALESCE em `epi_estoque_obra`) p/ `quantidadeEstoque` mantendo `estoqueCentral`; `create` (input `obraLocalId?`) cria central=0 + insere estoque-obra + histórico (autor); `update` só bloqueia Central se o saldo mudar; `ajustarEstoqueObra`/`entradaDiretaObra`/`transferir` ganharam hard-guard anti-IDOR por obra + `assertCentralWrite` em TODA rota que escreve no Central (`transferir` origem|destino central, `entradaEstoque`, `create` com qtd != 0). Entregas (createDelivery/update/delete) ficam como follow-up. `client/src/pages/Epis.tsx`: `<Select>` de local no header (state `catalogoObraId`→`obraId` no query), coluna "Estoque" rotulada, campo "Local do estoque" no Novo EPI (`obraLocalId`), input de Central desabilitado p/ restrito no Editar, dialogs (Entrada Direta/Transferência) listam só `obrasPermitidas`. Detalhe: `shared/changelog.ts`.
- **Rev. 2949** — **CONTROLE DE DOCUMENTOS (DASHBOARD) — A TABELA "DOCUMENTAÇÃO INCOMPLETA" AGORA É CLICÁVEL: AO CLICAR NUMA LINHA ABRE UM DIÁLOGO LISTANDO EXATAMENTE QUAIS DOCUMENTOS ESTÃO VENCIDOS / NÃO CADASTRADOS DO FUNCIONÁRIO.** Pedido (usuário, print do iPad): "Quero poder clicar e ver qual documento está vencido... não podemos ter documentos vencidos... todos devem estar aptos ao trabalho". A tabela só mostrava CONTAGENS (badges 4/3/2 e ícones X) sem dizer QUAIS. SOLUÇÃO (BACK read-only + FRONT, ZERO ALTER/DROP/DELETE): `server/routers/dashboards.ts` (`getDashControleDocumentos`) passou a anexar a cada `funcIncompleto` um array `pendencias[]` montado pela MESMA lógica que gera as contagens (lastAso/treinVencList/docsVencList/cnh) → paridade 1:1, com `categoria`, `tipo` (norma do treino / tipo do doc), `dataValidade`, `diasAtraso` e `motivo` ('sem'|'vencido'), ordenado por mais crítico; `client/src/pages/dashboards/DashControleDocumentos.tsx` deixou a `<tr>` clicável (`setDetalhe(f)`; nome mantém Raio-X via `stopPropagation`), adicionou ícone Eye de dica na coluna Pendências e um `<Dialog>` que lista cada documento pendente (ícone por categoria, badge "Vencido há Nd"/"Não cadastrado", validade) + aviso "NÃO está apto ao trabalho enquanto houver documento vencido" + botão "Ver Raio-X completo". Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2948** — ATESTADOS & ACIDENTES (SST) — NOVA TABELA "ATESTADOS POR OBRA — RANKING" (ABA OBRAS / AÇÕES): LISTA AS OBRAS ORDENADAS POR QUANTIDADE DE ATESTADOS (MAIS → MENOS). SOLUÇÃO (FRONT-only, `client/src/pages/sst/DashboardAtestadosAcidentes.tsx`): a tela JÁ recebia `d.atestadosPorObra`; novo `<Card>` (ícone Stethoscope) com colunas #, Obra, Atestados, Dias Afast., Colab. Afetados, INSS (≥15d), reordenado por `qtdAtestados` desc, 1ª linha destacada + Total no rodapé. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2947** — ATESTADOS & ACIDENTES (SST) — A TABELA "DIAS SEM ACIDENTE — POR OBRA" AGORA LISTA SOMENTE OBRAS ATIVAS / EM ANDAMENTO (DEIXA DE MOSTRAR CONCLUÍDAS, PARALISADAS E CANCELADAS). SOLUÇÃO (BACK read-only, `server/routers/sstAnalytics.ts`): a query passou a trazer `obras.status`; helper `obraStatusAtiva()` normaliza e EXCLUI o conjunto terminal {concluida, paralisada, cancelada}; o set `obraAtivaIds` filtra `obrasParaListagem`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2946** — ATESTADOS & ACIDENTES (SST) — A TABELA "FUNCIONÁRIOS COM ATESTADOS RECORRENTES (3+)" AGORA MOSTRA A FOTO DO FUNCIONÁRIO NA COLUNA "FUNCIONÁRIO". SOLUÇÃO (FRONT-only, `client/src/pages/sst/DashboardAtestadosAcidentes.tsx`): `d.atestadosRecorrentes` já trazia `fotoUrl`; a célula virou flex com `<PersonPhoto size="sm">` (lightbox + fallback de iniciais) ao lado do nome+#código. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2945** — DUPLICATAS DE CONTAS A PAGAR LIMPAS (R$ 1,02 mi), RAIZ DAS RECORRENTES CORRIGIDA E KPIs DO FLUXO DE CAIXA AGORA SEPARAM PROJEÇÃO × EFETIVO. (1) LIMPEZA: DELETE pontual autorizado (transação + verificação pré-COMMIT) de 85 linhas de SISTEMA duplicadas (R$ 1.021.272,69); (2) RAIZ (`server/routers/financial.ts` `materializeRecorrentes`): SELECT-then-INSERT → `INSERT ... SELECT ... WHERE NOT EXISTS` ATÔMICO; (3) KPIs (`client/src/pages/financeiro/FinanceiroFluxoCaixa.tsx`): cards Receitas/Despesas com chips Efetivo × Projeção. Detalhe: `shared/changelog.ts`.

- **Rev. 2944** — FLUXO DE CAIXA — REVISÃO COMPLETA: LAYOUT MAIS CLEAN (CORES PADRÃO) E OS VALORES AGORA BATEM 1:1 COM CONTAS A RECEBER E CONTAS A PAGAR. SOLUÇÃO (FRONT-only, `client/src/pages/financeiro/FinanceiroFluxoCaixa.tsx`): a tela COMPÕE os 2 endpoints irmãos — Receitas=`getContasReceberMatrix`, Despesas=`getContasAPagarByYear` (mesmo do Contas a Pagar) → paridade 1:1; nova `BUCKET_MAP` com origens reais do Neon corrige "Fixas zeradas"; escopo Efetivo/Projeção/Todos; layout paleta padrão + matriz 12 meses colapsável. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
