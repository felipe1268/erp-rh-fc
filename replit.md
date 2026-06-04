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

- **Rev. 2745** — **CONFIGURAÇÕES · BACKUP & SINCRONIZAÇÃO: BACKUP MANUAL/AUTOMÁTICO, HISTÓRICO E SAÚDE VOLTARAM A FUNCIONAR — O SQL DO SERVIÇO E O SELF-HEAL ESTAVAM EM snake_case ENQUANTO A TABELA `backups` NO NEON É camelCase.** Bug (Felipe, print do toast): clicar em "Backup Manual" estourava `column "iniciado_por" of relation "backups" does not exist`; em paralelo `backup.listar`/`backup.health`/`[SyncMonitor]` falhavam com `column "tabelasTotal" does not exist`. Causa-raiz (confirmada no `information_schema` do NEON real): a tabela `backups` foi criada com colunas em camelCase (padrão do Drizzle quando o `pgTable` não passa string de nome) — `iniciadoPor`/`tabelasExportadas`/`registrosExportados`/`tamanhoBytes`/`s3Key`/`s3Url`/`concluidoEm`; mas (a) `server/services/backupService.ts` montava TODO o SQL cru de INSERT/UPDATE em snake_case → colunas inexistentes → backup nunca concluía; (b) o self-heal da Rev. 2743 adicionou a coluna nova como `tabelas_total` (snake), enquanto o schema declara `tabelasTotal` (camel) → `db.select()` de listar/health quebrava. Fix (SERVER ONLY; ZERO ALTER destrutivo/DROP/DELETE — R-001/R-007/R-010): `backupService.ts` referencia TODAS as colunas da `backups` em camelCase entre aspas; o self-heal garante `ALTER TABLE backups ADD COLUMN IF NOT EXISTS "tabelasTotal" ...` (idempotente); a coluna camelCase também foi aplicada ao Neon em runtime para destravar a instância em execução. A `tabelas_total` (snake) criada por engano na Rev. 2743 fica ÓRFÃ/inerte (não removida). `backup_snapshots` (snake próprio, autoconsistente) intocada. Validação: esbuild parse EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde; app reiniciado sem os erros `column ... does not exist`. Detalhe: `shared/changelog.ts`.
- **Rev. 2744** — **COMPRAS · COTAÇÃO · APROVAÇÃO ("APROVAR E GERAR OC"): O AVISO DE "ACIMA DA META / DÉFICIT" SÓ APARECE QUANDO HÁ DÉBITO REAL — ANTES ESTOURAVA FALSO DÉFICIT EM COTAÇÃO POR PACOTE MESMO COM CRÉDITO (ex.: COT-2026-0283).** Bug (Felipe): na COT-2026-0283 ("Cotação por Pacote — itens agrupados por composição") o fornecedor vencedor (R$ 235.002,01) ficou ABAIXO da meta total (R$ 256.811,34) → saldo +R$ 21.809,33 (CRÉDITO); ainda assim o popup de "Aprovar e Gerar OC" dizia "acima da meta orçamentária (R$ 10.339,59). Déficit: R$ 224.662,42" (como se fosse débito). Causa-raiz (`client/src/pages/compras/Cotacoes.tsx`): os DOIS gatilhos do popup (`handleConfirmarTotal` + onClick do card "Total") RECOMPUTAVAM a meta com um reduce ingênuo somando os INSUMOS CRUS de `mapa.itens` (`metaUnitario*metaQtd` por linha) — em cotação POR PACOTE esses insumos não representam a meta do pacote, então a soma dava R$ 10.339,59 e disparava falso `fornTotal>metaTotal`. A tabela da tela, por outro lado, já calculava o saldo correto via `metaGrandTotal`/`saldoTotal`/`deficit` (pacote-aware: `isPacoteTotals` + `composicaoMetaTotal`/`composicaoQtdOrcada` + `getItemSaldo`=meta−custoCompra). Fix (SÓ CLIENT/UI; ZERO SERVER/SCHEMA; ZERO ALTER/DROP/DELETE — R-001/R-007/R-010): os dois gatilhos deixam de recomputar e passam a usar o `deficit` (já = `saldoTotal<0?abs:0`) e o `metaGrandTotal` do escopo do componente. Agora o alerta só aparece quando `deficit > 0` (débito real) e NUNCA quando há crédito; a mensagem mostra a meta e o déficit corretos. Risco/realocação (`cobertoPorRisco`/`semVerbaAutorizado`) inalterados. Validação: esbuild parse EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde; app rodando, console limpo. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2743** — CONFIGURAÇÕES · BACKUP & SINCRONIZAÇÃO · HISTÓRICO DE BACKUPS: percentual de progresso (0–100%) para saber quanto falta. Antes travava em "Em andamento" com 0 tabelas porque o contador só era gravado no fim. SERVER `backupService.ts` grava o total no início + UPDATE a cada 10 tabelas; CLIENT `Configuracoes.tsx` (`BackupTab`) com `refetchInterval` 3s enquanto `em_andamento` + badge/barra de %. +1 coluna via self-heal `IF NOT EXISTS`. Ressalva: o NOME da coluna foi corrigido p/ camelCase (`tabelasTotal`) na Rev. 2745 — esta revisão a criara em snake_case, quebrando o `db.select()`. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2742** — COMPRAS · MAPA DE COTAÇÃO · "FORNECEDORES PARTICIPANTES": cadastrar fornecedor novo por popup, sem sair da cotação. No seletor, quando não há resultado ("Nenhum fornecedor encontrado"), link "Cadastrar novo fornecedor" fecha o popover e abre um `Dialog` de cadastro rápido (CNPJ c/ botão "Buscar" auto-preenche via `buscarCNPJ`; Razão Social, Nome Fantasia, Telefone, E-mail, Cidade, UF). Salva via `criarFornecedor` (anti-duplicidade de CNPJ no server), faz refetch e PRÉ-SELECIONA o novo. SÓ CLIENT/UI; reusa endpoints; ZERO SERVER/SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2741** — CONFIGURAÇÕES · NOVO MÓDULO "BACKUP & SINCRONIZAÇÃO": saúde do backup de dados (alertas stale>36h/erro) + sincronização do código com o GitHub (versão em execução × último commit — o `main` ficou travado em `e7f3f3f` por 2+ meses) + redundância (botão "Enviar cópia do código agora" zipa o source via Git Data API → branch `erp-code-snapshots`). SERVER `githubClient.ts`/`codeSyncService.ts`/`syncMonitorJob.ts` (NOVOS) + `backupService.getBackupHealth` + `backup.ts` (+health/githubStatus/pushCodeSnapshot); BUILD `gen-build-info.mjs`; CLIENT aba em `Configuracoes.tsx`. ZERO ALTER/DROP/DELETE; ZERO schema. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2740** — PAINEL RH · MODAIS DE EXPANSÃO (ASOs / FÉRIAS / ANIVERSÁRIOS): ACABOU A BARRA DE ROLAGEM HORIZONTAL — o listão cabe na largura do modal (só rola na vertical). Causa (`PainelRH.tsx`): os 2 modais embrulhavam a lista no `<ScrollArea>` shadcn/Radix, cujo viewport (`display:table`) expande p/ a maior linha, quebrando `min-w-0`/`flex-wrap`. Fix: trocados por `<div className="max-h-[...] overflow-y-auto overflow-x-hidden pr-2">`; import órfão de `ScrollArea` removido. SÓ CLIENT/UI; ZERO SERVER/SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2739** — PLANEJAMENTO · PREVISÃO DE MEDIÇÃO (POR AVANÇO FÍSICO): A TABELA DEIXA EXPLÍCITO QUE "O QUE É PRODUZIDO NUM MÊS (COMPETÊNCIA) É RECEBIDO DEPOIS (mês seguinte)" SEM ROLAR PARA A DIREITA. A relação já existia no motor (coluna "Recebimento" em `previsoesMensais`/`PlanejamentoDetalhe.tsx` = corte `cfgDiaCorte` + `cfgPrazoRecDiasUteis` dias úteis, c/ trava de sinal da Rev. 2730), mas a coluna ficava cortada no celular. Fix (SÓ CLIENT/UI; não muda valores/cálculo): "Competência" ganhou sub-rótulo "→ recebe em mmm/aaaa" (verde; âmbar "(aguarda sinal)"), cabeçalho "Competência (produção)" e legenda no rodapé. ZERO SERVER/SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2738** — RH · EPI · FICHA DE ENTREGA DE EPI · IMPRESSÃO (window.print): A FICHA AGORA SAI INTEIRA EM UMA PÁGINA LIMPA (acabou a pág.1 em branco com só "Controle de EPIs" e o conteúdo espremido em 3 páginas). Causa: o container imprimível (`Epis.tsx`, `viewMode==="ficha_epi"`) não era `print-only` → o `@media print` global (`index.css`) não escondia o cromo do DashboardLayout e os espaçamentos de tela empurravam p/ 3 páginas. Fix: container ganhou `print-only` + `print:max-w-none` + classe `epi-ficha-print`; novo bloco `@media print` zera borda/padding, reduz fonte e aplica `page-break-inside: avoid` nos blocos críticos. NÃO mexido: `generateFichaEpiPdf`. SÓ CLIENT/UI; ZERO SERVER/SCHEMA. Detalhe: `shared/changelog.ts`.

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
