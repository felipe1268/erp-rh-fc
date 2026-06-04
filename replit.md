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

- **Rev. 2747** — **CONFIGURAÇÕES · CENTRAL DE DOCUMENTOS (TEMPLATES DE DOCUMENTOS) VIROU FONTE OFICIAL ISO + IA, E OS GERADORES DE CONTRATO DE EXPERIÊNCIA E TERMO DE RESPONSABILIDADE PASSARAM A CONSUMIR O TEMPLATE VIGENTE (COM FALLBACK).** Task #59: transformar a aba "Templates de Documentos" na fonte oficial dos 7 documentos institucionais FC com controle de revisão ISO (código FC-RH-001..007, status rascunho/vigente/obsoleto, elaborado/aprovado por+data, vigência, próxima revisão), seed faithful por tipo, placeholders pesquisáveis, IA (ler PDF→sugerir / gerar do zero→validar) e — central — fazer os módulos geradores usarem o VIGENTE quando existir, sem quebrar a saída atual. Mudanças: (1) SCHEMA aditivo em `system_document_templates` (campos ISO via `ADD COLUMN IF NOT EXISTS`; `[SyncSchema+]` é automático por introspecção — R-001/R-007/R-010, zero destrutivo); (2) `shared/documentTemplates.ts` NOVO (`DOCUMENT_TEMPLATES_META`, `getSeedTemplate`, `DEFAULT_CODIGOS`, `SEED_BODIES`, enum status, `renderTemplate(html,dados)` que troca `{{chave}}` preservando desconhecidos); (3) `server/routers/systemDocumentTemplates.ts` (`save` grava ISO; NOVAS `aprovar`/`marcarObsoleto`/`voltarParaRascunho`/`getVigente`/`seedDefaults`/`iaStatus`/`iaGerarDoZero`/`iaLerPdfSugerir`; GATE ISO: mudar conteúdo no `save` rebaixa p/ `rascunho` + limpa aprovação → exige re-`aprovar` antes de voltar a circular); (4) UI `client/src/pages/configuracoes/TemplatesDocsTab.tsx` (master-detail, ficha ISO, selos, ações, "Inicializar padrões", busca de placeholders, painel IA que degrada via `iaStatus`); (5) geradores ligados ao Vigente — `Colaboradores.tsx` (contrato exp.) e `TermoResponsabilidadeDialog.tsx` (termo) consultam `getVigente` e montam o corpo via `renderTemplate(...)` com os mesmos dados; sem vigente caem no HTML inline atual. No termo, itens entram via `{{itensTabela}}` e obs+rodapé local/data são anexados após o template. Contrato PJ NÃO tocado (drift). IA: GOOGLE_API_KEY presente → "gerar do zero" ok; "ler PDF" exige Anthropic Vision (ausente) e degrada com aviso. Validação: esbuild parse EXIT 0 nos 5 arquivos; `vitest server/rescisao.test.ts` 41/41 verde; app rodando. Detalhe: `shared/changelog.ts`.
- **Rev. 2746** — **CONFIGURAÇÕES · TERCEIROS · "GESTORES PARA CONTRATOS DE TERCEIROS": OS DOIS SELETORES (GESTOR FINANCEIRO / GESTOR DE PROJETO) VIRARAM CAMPOS PESQUISÁVEIS POR NOME E LISTAM SOMENTE FUNÇÕES DA CATEGORIA INDIRETA.** Pedido (Felipe, print da tela): os dropdowns listavam TODOS os ativos, incluindo mão de obra direta (pedreiro, servente, armador...), o que poluía a lista; pediu busca por nome + "nestas só se enquadram as funções da categoria indiretas". Causa/contexto (`client/src/pages/Configuracoes.tsx` — `GestoresContratoTab`): os dois `<Select>` mapeavam o memo `ativos` sem classificar categoria; `employees.list`/`getEmployees` não retorna `categoria` (a regra Direto/Indireto vive em `jobFunctions.categoriaMO`: `indireta_obra`|`escritorio_central`→Indireto). Fix (SÓ CLIENT/UI; ZERO SERVER/SCHEMA; ZERO ALTER/DROP/DELETE — R-001/R-007/R-010): NOVO `client/src/components/EmployeeCombobox.tsx` (Popover + cmdk, busca acento/caixa-insensitive, item "— Nenhum —"); `GestoresContratoTab` consulta `trpc.jobFunctions.list`, monta `catByFn` → `isIndireta()` → `ativosIndiretos` e troca os dois `<Select>` pelo combobox. Salvaguarda `withSelected()` reinclui o gestor JÁ SALVO mesmo se sua função não for indireta. `handleSalvar` preservado. Validação: esbuild parse (stdin) EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde; app rodando. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2745** — CONFIGURAÇÕES · BACKUP & SINCRONIZAÇÃO: backup manual/automático, histórico e saúde voltaram a funcionar — o SQL do serviço e o self-heal estavam em snake_case enquanto a tabela `backups` no NEON é camelCase (`column "iniciado_por"...`, `column "tabelasTotal"...`). Fix (SERVER ONLY; ZERO destrutivo): `backupService.ts` referencia colunas em camelCase entre aspas; self-heal garante `ADD COLUMN IF NOT EXISTS "tabelasTotal"`; coluna `tabelas_total` (snake) da Rev. 2743 fica órfã/inerte. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2743** — CONFIGURAÇÕES · BACKUP & SINCRONIZAÇÃO · HISTÓRICO DE BACKUPS: percentual de progresso (0–100%) para saber quanto falta. Antes travava em "Em andamento" com 0 tabelas porque o contador só era gravado no fim. SERVER `backupService.ts` grava o total no início + UPDATE a cada 10 tabelas; CLIENT `Configuracoes.tsx` (`BackupTab`) com `refetchInterval` 3s enquanto `em_andamento` + badge/barra de %. +1 coluna via self-heal `IF NOT EXISTS`. Ressalva: o NOME da coluna foi corrigido p/ camelCase (`tabelasTotal`) na Rev. 2745 — esta revisão a criara em snake_case, quebrando o `db.select()`. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2742** — COMPRAS · MAPA DE COTAÇÃO · "FORNECEDORES PARTICIPANTES": cadastrar fornecedor novo por popup, sem sair da cotação. No seletor, quando não há resultado ("Nenhum fornecedor encontrado"), link "Cadastrar novo fornecedor" fecha o popover e abre um `Dialog` de cadastro rápido (CNPJ c/ botão "Buscar" auto-preenche via `buscarCNPJ`; Razão Social, Nome Fantasia, Telefone, E-mail, Cidade, UF). Salva via `criarFornecedor` (anti-duplicidade de CNPJ no server), faz refetch e PRÉ-SELECIONA o novo. SÓ CLIENT/UI; reusa endpoints; ZERO SERVER/SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2741** — CONFIGURAÇÕES · NOVO MÓDULO "BACKUP & SINCRONIZAÇÃO": saúde do backup de dados (alertas stale>36h/erro) + sincronização do código com o GitHub (versão em execução × último commit — o `main` ficou travado em `e7f3f3f` por 2+ meses) + redundância (botão "Enviar cópia do código agora" zipa o source via Git Data API → branch `erp-code-snapshots`). SERVER `githubClient.ts`/`codeSyncService.ts`/`syncMonitorJob.ts` (NOVOS) + `backupService.getBackupHealth` + `backup.ts` (+health/githubStatus/pushCodeSnapshot); BUILD `gen-build-info.mjs`; CLIENT aba em `Configuracoes.tsx`. ZERO ALTER/DROP/DELETE; ZERO schema. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

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
