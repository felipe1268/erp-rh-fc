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

- **Rev. 2805** — **CONFIGURAÇÕES · IA — NOVO PAINEL "INTELIGÊNCIA ARTIFICIAL" NA TELA DE CONFIGURAÇÕES QUE LIGA/DESLIGA, POR EMPRESA, AS FUNCIONALIDADES DE IA DE CADA MÓDULO.** Pedido (usuário, com screenshot da tela "Configurações"): "Quero um botão nas configurações para poder habilitar e desativar todas as ias de cada módulo... quero essa opção na tela de configurações." Foram catalogados 7 módulos com IA (`compras`, `rh`/convenção, `recrutamento`, `sst`, `planejamento`, `oraculo`, `assistente`) em `shared/aiModules.ts`. NOVA tabela `ai_module_config` (company_id, modulo, enabled, índice único) com self-heal `[SyncSchema+]` (`CREATE TABLE/INDEX IF NOT EXISTS`; ZERO ALTER/DROP/DELETE) — DEFAULT PERMISSIVO: sem linha = IA habilitada. NOVO router `aiConfig` (`getConfig`/`setModulo`/`setTodos`) com guard de empresa permissivo (padrão `_assertCompanyAccess`). ENFORCEMENT real: helper `server/_core/aiConfig.ts` (`assertAiModuleEnabled`) chamado como 1ª instrução EM TODOS os endpoints de IA de cada módulo (code review apontou que gatear só 1 por módulo deixava bypass): `compras` (`extrairCotacaoIA`, `preencherPrecosFaltantesIA`, `sugerirCategoriasIA`, `sugerirPrecoIA`, `classificarDisciplinas`, `reclassificarTipoControleIA`), `rh` (`convencaoIA.processarPdf` — cobre os helpers Vision Anthropic/Gemini só alcançáveis por ele), `recrutamento` (`curriculos.processarArquivosIA`), `sst` (`epiAvancado.iaSugerir{Kits,Cores,VidaUtil,Treinamentos}` + `analisarEstoqueIA`), `planejamento` (`iaCronograma` TODOS os endpoints com LLM: `chat`, `gerarAlertasClima`, `simularCenario`, `sugerirRecursos`, `analisarDesvio`, `analisarLOB`, `analisarEfetivo`, `simularEfetivo`, `perguntarEfetivo`, `alertasSemana` — via novo helper `companyIdDoProjeto(projetoId)` que resolve o companyId REAL pela linha do projeto, NÃO `ctx.user.companyId` que fica vazio p/ admin-master), `oraculo` (`sendMessage`) e `assistente` (`iaModulos.chat`). Endpoints com companyId opcional caem p/ `ctx.user.companyId`. FRONTEND: novo `client/src/pages/configuracoes/IAConfigSection.tsx` (card violeta colapsável com Switch por módulo + "Ativar todas / Desativar todas" + badge "N de 7 ativas") no TOPO de "Configurações por Módulo" em `Configuracoes.tsx`. RESSALVA: novos endpoints de IA precisam chamar `assertAiModuleEnabled` explicitamente (sem interceptação automática em `invokeLLM`); NÃO foram gateados de propósito os helpers de IA em background de fluxos não-IA (`compras.classificarTipoControleIA`, resolvedor de embalagem na criação de item). Já em `compras.buscarPorCodigoBarras` o RAMO IA (fallback quando não acha item local) é condicionado por `isAiModuleEnabled` — lookup local segue ativo com IA off. Validação: esbuild OK em todos os routers tocados; servidor reiniciado/Neon OK (self-heal materializa a tabela). Detalhe: `shared/changelog.ts`.
- **Rev. 2804** — **COMPRAS · SEGURANÇA — FECHADO IDOR MULTI-EMPRESA EM ~86 ENDPOINTS DO ROUTER DE COMPRAS QUE RECEBIAM `companyId` DO CLIENTE SEM VALIDAR ACESSO À EMPRESA.** Origem: code review da Rev. 2803 apontou que `listarCotacoes`/`listarSolicitacoes` (e, na auditoria do router inteiro, dezenas de outros) usavam `input.companyId` direto no `WHERE company_id` sem checar pertencimento — usuário autenticado podia ler/alterar dados de OUTRA empresa trocando o `companyId` no payload. Usuário aprovou ("pode fazer as correções"). Fix (SÓ `server/routers/compras.ts`): auditoria programática injetou `await _assertCompanyAccess(ctx.user, input.companyId)` como 1ª instrução em todo procedure com `companyId: z.number()` e SEM guard (85 endpoints; handlers só com `{ input }` ganharam `ctx`; `classificacaoProgresso` síncrono virou `async`); + `getCotacao` (recebe só `id`) ganhou guard derivado da linha (`cot.companyId`). 2º PASSE (code review architect achou 8 escapes da regex inicial): `criarItem`/`registrarMovimento`/`avaliarFornecedor`/`cancelarAprovacaoCotacao` (singular) + 4 dashboards que recebem `companyIds` ARRAY (`getDashboardCompras`/`getComprasBadgeCounts`/`getAlertasCompras`/`getDashboardPorObra`) ganharam guard — os de array com `for (const _cid of ids) await _assertCompanyAccess(ctx.user, _cid)`. Re-auditoria ampliada = 0 endpoints sem guard. 3º+4º PASSES (code review architect): fechados também os endpoints id-only (sem `companyId` no input) que cruzam o recurso, com GUARD DERIVADO-DO-RECURSO (fetch da linha dona → `_assertCompanyAccess(ctx.user, <linha>.companyId)`, derivando do PAI `comprasCotacoes`/`comprasSolicitacoes` quando o input traz só `cotacaoId`/`solicitacaoId`). 3º passe: `atualizarItem`, `excluirItem`, `aprovarSolicitacao`, `getMapaCotacao`, `atualizarStatusOrdem`, `estornarRecebimentoOC`. 4º passe (+18): `getFornecedor`, `devolverLocacaoItem`, `atualizarStatusSolicitacao`, `registrarRecebimentoItem`, `cancelarItemSc`, `excluirSolicitacao`, `aprovarCotacao`, `atualizarStatusCotacao`, `excluirCotacao`, `adicionarFornecedorMapa`, `removerFornecedorMapa`, `salvarRespostasLote`, `salvarAnexoFornecedor`, `selecionarVencedorMapa`, `cancelarVencedorMapa`, `getOrdem`, `atualizarOrdem`, `excluirOrdem`. 2 correções pós-review: `excluirOrdem` (faltou `ctx` na assinatura) e `registrarRecebimentoItem` (resource-binding `item.solicitacaoId === input.solicitacaoId`). 5º passe: auditoria com lista hard-coded escapou `deletarCondicaoPagamento` (DELETE por id sem guard) → guard derivado + auditoria refeita SCHEMA-DRIVEN (392 tabelas com `company_id` do `drizzle/schema.ts`, sem ponto cego de lista manual). Re-auditoria DUPLA final (companyId-referencing + id-only tenant-touching) = 0 sem guard. O helper `_assertCompanyAccess` (Rev. 1702) é PERMISSIVO por design: admin libera, usuário SEM vínculo libera, só bloqueia usuário VINCULADO tentando empresa fora dos vínculos ("só restringe quando o master restringir") — sweep amplo é seguro, ZERO mudança p/ usuários legítimos. RESSALVA: mutations que recebem companyId mas não cruzam com o recurso por `id` (ex.: `solicitarAutorizacaoCompra`, `registrarMovimento`) ainda têm IDOR de RECURSO mais profundo — follow-up. ZERO ALTER/DROP/DELETE; ZERO schema. Validação: esbuild OK; servidor reiniciado e reconectado ao Neon; re-auditoria final = 0 sem guard. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2803** — COMPRAS · COTAÇÕES: A LISTA E O DETALHE DA COTAÇÃO PASSAM A MOSTRAR O NÚMERO REAL DA SC VINCULADA (`numero_sc`, EXIBIDO COMO `SC-NNNN-AAAA`) EM VEZ DO ID INTERNO `SC #<id>`; E O NÚMERO VIROU UM LINK CLICÁVEL QUE ABRE A SOLICITAÇÃO. `listarCotacoes` passa a trazer `numeroSc`; na tela o número vira `<button>` com `formatNumeroScDisplay` que navega p/ `/compras/solicitacoes?destaque=<solicitacaoId>`. ZERO ALTER/DROP/DELETE; ZERO schema novo. Detalhe: `shared/changelog.ts`.

- **Rev. 2802** — COMPRAS · SOLICITAÇÕES: O NÚMERO DA SC PASSA A SER EXIBIDO COMO `SC-NNNN-AAAA` (NÚMERO PRIMEIRO, ANO DEPOIS) EM VEZ DE `SC-AAAA-NNNN` — SÓ EXIBIÇÃO; O VALOR GRAVADO CONTINUA CANÔNICO `SC-AAAA-NNNN`. Novo helper `shared/numeroSc.ts` (`formatNumeroScDisplay`) aplicado nos pontos de exibição (Solicitacoes/Painel/Cotacoes/Manutencoes); busca/ordenação seguem o canônico. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2801** — COMPRAS · COTAÇÕES: OS DIÁLOGOS DE CONFIRMAÇÃO DO `window.confirm()` NATIVO (QUE EXIBIAM A URL FEIA "…replit.dev diz" NO TÍTULO) FORAM SUBSTITUÍDOS PELO MODAL CUSTOMIZADO `useConfirm` (ALERTDIALOG shadcn, TÍTULO LIMPO, TOM/ÍCONE E BOTÕES ROTULADOS). SÓ `Cotacoes.tsx`: 7 `window.confirm()` → `await confirm({...})`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2800** — COMPRAS · COTAÇÕES: LEITURA POR IA PASSA A ACEITAR VÁRIOS ARQUIVOS DE UMA VEZ (PÁGINAS/FOTOS DA MESMA COTAÇÃO) NUMA ÚNICA CHAMADA AO CLAUDE VISION (UM JOB / UMA PROPOSTA, SEM DUPLICAR ITENS). `invokeAnthropicVision` aceita `files[]`, `extrairCotacaoIA` ganha `arquivos[]` (.min1.max10) e o botão "Ler cotação (IA)" ganha `multiple`. ZERO schema novo; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2799** — COMPRAS · COTAÇÕES: OVERLAY "CONFERÊNCIA — LEITURA IA" REFEITO COM LIBERDADE TOTAL DE MATCH POR LINHA (COMBOBOX COM BUSCA + TOP-3 SUGESTÕES ★ + REMOVER VÍNCULO) + BOTÃO CLARO "LER COTAÇÃO (IA)" NO TOOLBAR DO FORNECEDOR (1 CLIQUE: ANEXA + LÊ + ABRE A CONFERÊNCIA). TUDO CLIENT-ONLY; ZERO SCHEMA/SERVER; REUSA `extrairCotacaoIA` E `salvarRespostasLote`. Detalhe: `shared/changelog.ts`.

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
