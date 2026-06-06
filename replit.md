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

- **Rev. 2809** — **CONFIGURAÇÕES · IA — O PAINEL "INTELIGÊNCIA ARTIFICIAL" PASSA A CONTROLAR EXCLUSIVAMENTE O CHAT DE "PERGUNTAS E RESPOSTAS" (O BOTÃO VERDE FLUTUANTE / `IAModuloChat`), POR MÓDULO OU TODOS, E O BUG "0 DE 0 ATIVAS" FOI CORRIGIDO.** Pedido (usuário, com 2 screenshots — o botão verde + o painel "0 de 0 ativas"): "nao to conseguindo habilitar e desabilitar.. quero que tenha a possibilidade de desativar por modulo.. ou todas.. para facilitar.. porem somente a IA de perguntas e respostas que demarquei na foto." CAUSA-RAIZ do "0 de 0": `IAConfigSection.tsx` tinha `enabled: !!companyId` com `companyId = Number(selectedCompanyId) || 0`; admin-master sem empresa → companyId=0 → query desabilitada → lista vazia. Além disso o painel listava 7 FEATURES heterogêneas (cotações/currículos/EPIs…), não o chat Q&A. O QUE FOI FEITO: NOVO catálogo `QA_CHAT_MODULES` em `shared/aiModules.ts` (7 personas: planejamento/orçamento/compras/rh/financeiro/sst/medição) + helper `qaChatModuleKey` — chaves gravadas em `ai_module_config.modulo` SEMPRE prefixadas `qa_` p/ não colidir com as chaves de feature. `server/_core/aiConfig.ts`: `isAiModuleEnabled`/`assertAiModuleEnabled` aceitam `string` e ganham FALLBACK GLOBAL (sentinela `companyId = 0`); precedência EMPRESA > GLOBAL > habilitado (necessário pq admin-master opera com companyId=0). `server/routers/aiConfig.ts`: NOVOS `getQaConfig`/`setQaModulo`/`setQaTodos`/`isQaModuloEnabled` (reusam a tabela + upsert genérico). `server/routers/iaModulos.ts`: gate do `chat` deixa de ser a chave única "assistente" e vira POR PERSONA via `qaChatModuleKey(input.modulo)`. `IAConfigSection.tsx` reescrito (renderiza SEMPRE o catálogo estático → nunca mais "0 de 0"; companyId=0 = escopo GLOBAL; toggles por módulo + "todos"). `IAModuloChat.tsx`: botão se auto-oculta (`return null`) quando a persona está desativada. ZERO ALTER/DROP/DELETE; ZERO schema novo (`ai_module_config` já auto-curada; default permissivo). RESSALVA: as 7 features antigas (getConfig/setModulo/setTodos) seguem no router p/ retrocompat mas sem UI. Validação: esbuild OK nos 6 arquivos; servidor reiniciado (Neon OK); code review PASS. Detalhe: `shared/changelog.ts`.
- **Rev. 2808** — **COMPRAS · COTAÇÕES — O NÚMERO DA COTAÇÃO PASSA A SER EXIBIDO COMO `COT-NNNN-AAAA` (NÚMERO PRIMEIRO, ANO DEPOIS) EM VEZ DE `COT-AAAA-NNNN` — SÓ EXIBIÇÃO; O VALOR GRAVADO CONTINUA CANÔNICO `COT-AAAA-NNNN`.** Pedido (usuário, com screenshots da tela "Cotações"): "quero o número da cotação primeiro depois o ano." Espelha a Rev. 2802 (que fez o mesmo para a SC). NOVO helper `shared/numeroCotacao.ts` (`formatNumeroCotacaoDisplay`) que SÓ inverte a ORDEM na TELA (regex `^COT-(\d{4})-(\d+)$`; se não casar, devolve o valor intacto). O valor PERSISTIDO segue `COT-${year}-${seq}` — geração, busca por número e ordenação seguem o canônico, INTOCADOS. Aplicado nos pontos de exibição: `Cotacoes.tsx` (breadcrumb + título do detalhe, chips de navegação entre cotações irmãs, célula "Número" da tabela, título do dialog, linha do histórico de preços), `Solicitacoes.tsx` (aba "Cotação" do rastreio + cartões no detalhe da SC), `Painel.tsx` (tabela de cotações recentes) e `Realocacao.tsx` (coluna "Cotação" + modal de desfazer). RESSALVA: toasts/logs seguem com o número cru. ZERO schema novo; ZERO ALTER/DROP/DELETE. Validação: esbuild OK nos 4 arquivos. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2807** — COMPRAS · COTAÇÕES: "CANCELAR DIVISÃO" — DESFAZER A DIVISÃO DE UMA COTAÇÃO, DEVOLVENDO TODOS OS ITENS (E RESPOSTAS) À COTAÇÃO ORIGINAL E REMOVENDO A COTAÇÃO-FILHA. NOVA coluna `dividida_de_id` (self-heal `ADD COLUMN IF NOT EXISTS`); `cancelarDivisaoCotacao` numa `db.transaction` com advisory lock re-parenteia itens/respostas, deleta fornecedores replicados + a cotação-filha vazia e recalcula totais da original; botão "Cancelar Divisão" (âmbar) no header do detalhe só quando filha em aberto sem OC. ZERO DROP/DELETE de schema. Detalhe: `shared/changelog.ts`.

- **Rev. 2806** — COMPRAS · COTAÇÕES: "COTAÇÃO PARCIAL" — DIVIDIR UMA COTAÇÃO EM VÁRIAS (CADA UMA COM UM SUBCONJUNTO DE ITENS PARA FORNECEDORES DIFERENTES), + SELO DE COBERTURA NA SC, "COTAR RESTANTES" 1-CLIQUE E NAVEGAÇÃO ENTRE COTAÇÕES IRMÃS. `dividirCotacao` MOVE itens (UPDATE `cotacao_id`, preserva ids) + respostas + replica/recalcula fornecedores numa `db.transaction` com advisory lock; `cotarItensRestantes` e `getCoberturaSolicitacao` novos; trava anti-duplicidade trocada de "1 cotação ativa por SC" p/ "por ITEM". `Cotacoes.tsx` (modal de seleção + faixa de navegação) e `Solicitacoes.tsx` (selo de cobertura). ZERO ALTER/DROP/DELETE; ZERO schema novo. Detalhe: `shared/changelog.ts`.

- **Rev. 2805** — CONFIGURAÇÕES · IA: NOVO PAINEL "INTELIGÊNCIA ARTIFICIAL" NA TELA DE CONFIGURAÇÕES QUE LIGA/DESLIGA, POR EMPRESA, AS FUNCIONALIDADES DE IA DE CADA MÓDULO. 7 módulos catalogados em `shared/aiModules.ts`; NOVA tabela `ai_module_config` (self-heal `CREATE TABLE/INDEX IF NOT EXISTS`, DEFAULT PERMISSIVO: sem linha = IA on); NOVO router `aiConfig`; enforcement via `assertAiModuleEnabled` como 1ª instrução em TODOS os endpoints de IA de cada módulo; card violeta colapsável em `Configuracoes.tsx`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2804** — COMPRAS · SEGURANÇA: FECHADO IDOR MULTI-EMPRESA EM ~86 ENDPOINTS DO ROUTER DE COMPRAS QUE RECEBIAM `companyId` DO CLIENTE SEM VALIDAR ACESSO À EMPRESA. Auditoria SCHEMA-DRIVEN injetou `_assertCompanyAccess(ctx.user, …)` em todo procedure com `companyId` E nos id-only que cruzam o recurso (guard derivado da linha dona / do PAI cotação/SC). Re-auditoria dupla final = 0 sem guard. `_assertCompanyAccess` é PERMISSIVO (admin/sem-vínculo livre; só bloqueia user vinculado fora dos vínculos). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2803** — COMPRAS · COTAÇÕES: A LISTA E O DETALHE DA COTAÇÃO PASSAM A MOSTRAR O NÚMERO REAL DA SC VINCULADA (`numero_sc`, EXIBIDO COMO `SC-NNNN-AAAA`) EM VEZ DO ID INTERNO `SC #<id>`; E O NÚMERO VIROU UM LINK CLICÁVEL QUE ABRE A SOLICITAÇÃO. `listarCotacoes` passa a trazer `numeroSc`; na tela o número vira `<button>` com `formatNumeroScDisplay` que navega p/ `/compras/solicitacoes?destaque=<solicitacaoId>`. ZERO ALTER/DROP/DELETE; ZERO schema novo. Detalhe: `shared/changelog.ts`.

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
