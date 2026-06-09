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

- **Rev. 2922** — **INTEGRAÇÃO DE SEGURANÇA (SST) · APROVADOS — ASSINATURA DO TST EM LOTE: SELECIONAR TODOS E ASSINAR DE UMA VEZ (GANHO DE TEMPO).** Pedido (usuário, com print da aba "Aprovados"): cada aprovado tinha um botão "Assinar" individual na coluna "Assinatura TST" — assinar muitos um a um era lento; pediu "selecionar todos e assinar o TST de todos de uma vez". SOLUÇÃO (BACKEND + FRONT, ZERO ALTER/DROP/DELETE — só UPDATE de dados): BACKEND `server/routers/integracaoSST.ts` ganhou a mutation `assinarComoTstEmLote` ({companyId, registroIds[], assinaturaBase64, nomeTst}) — mesmo guard de tenant (`assertCompanyAccess`) e validação PNG base64 do `assinarComoTst`; um único `UPDATE ... WHERE inArray(id, ids) AND companyId=X AND status='aprovado' AND deletedAt IS NULL AND assinaturaTstBase64 IS NULL` aplica a MESMA assinatura/nome a todos os selecionados sem sobrescrever quem já estava assinado; retorna `{success, count}`; limite 500 ids (zod). FRONT `client/src/pages/sst/IntegracaoSST.tsx` (AprovadosTab) reaproveita a multisseleção do bulk-delete; novo botão azul "Assinar N selecionado(s)" (aparece só com selecionados SEM assinatura — `naoAssinadosSel`) abre o `AssinarTstLoteDialog` (mesmo canvas-pad mouse/touch, lista dos colaboradores, 1 nome + 1 assinatura → grava em todos). Botão individual por linha mantido. Detalhe: `shared/changelog.ts`.
- **Rev. 2921** — **INTEGRAÇÃO DE SEGURANÇA (SST) · MÓDULO INTERNO — USUÁRIOS DO GRUPO SST VOLTARAM A VER OS DADOS: FIM DO "ACESSO NEGADO A ESTA EMPRESA" QUE ZERAVA TODAS AS TELAS.** Bug (usuário, com prints): logando com usuário do grupo SST, TODAS as telas do módulo Integração vinham vazias — Dashboard com TOTAL/APROVADOS/PENDENTES/REPROVADOS em 0 e aba "Aprovados" com card vermelho "Falha ao carregar aprovados — Acesso negado a esta empresa" (idem Pendentes/Reprovados/Vídeos/Configurações). CAUSA-RAIZ: o helper `assertCompanyAccess` em `server/routers/integracaoSST.ts` checava `ctx.user.companyIds` — campo que NÃO EXISTE no `ctx.user` (linha da tabela `users`) → `ids` sempre `[]` → `ids.includes(companyId)` sempre `false` → como o usuário não era `admin_master`, lançava `FORBIDDEN "Acesso negado a esta empresa"` em TODOS os ~26 endpoints (todo o grupo SST e até `admin` comum eram bloqueados em 100% das telas). SOLUÇÃO (BACKEND-only, ZERO ALTER/DROP/DELETE): substituído pelo GUARD CANÔNICO usado em `ferramentasTerceiros`/`terceiros` — sessão inválida→UNAUTHORIZED; `admin`/`admin_master`→libera; usuário COM vínculos em `user_companies` (via `getUserCompanyLinks`)→exige pertencer; SEM vínculos→LIBERA (acesso por grupo/módulo, não pela empresa-casa). Helper virou `async` → `await` nos ~26 call sites; mantido filtro anti-IDOR por `companyId` em cada query. Sem mudança de schema/front. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2920** — INTEGRAÇÃO DE SEGURANÇA (SST) · PORTAL PÚBLICO — VÍDEO DE TREINAMENTO AGORA APARECE CENTRALIZADO, NA PROPORÇÃO CERTA E COM CARREGAMENTO/ERRO TRATADOS (FIM DO "BURACO PRETO" E DO "NÃO CARREGA"). `VideoPlayer` em `client/src/pages/sst/IntegracaoPublica.tsx` prendia o `<video>` numa caixa rígida `aspect-video` → vídeo ≠16:9/metadata carregando renderizava ~300×150 preso ao topo. FRONT-only: player de upload usa proporção NATURAL (`w-full max-h-[70vh] object-contain`) centralizado; estados `videoLoading`/`videoError` (overlay + fallback "abrir em nova aba"); `preload="metadata"`+`playsInline`+`key={url}`. Backend OK (chunk 8MB da Rev. 2917). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2919** — USUÁRIOS E PERMISSÕES · GRUPOS — SALVAR PERMISSÕES DE MÓDULOS FICOU À PROVA DE FALHA: INDICADOR DE "ALTERAÇÕES NÃO SALVAS" + ERRO LOUD + CONFIRMAÇÃO DO QUE FOI PERSISTIDO. Bug: abrir grupo "TST", "Todos admin" + salvar e a tela voltar a mostrar só os módulos antigos. Causa: estado só persistia com clique explícito em "Salvar Grupo" (sem aviso), falhas silenciosas e redisplay via refetch reexibia estado ANTIGO. FRONT-only `client/src/pages/Usuarios.tsx`: `serializeGroupState` + snapshot `gBaseline`→`gDirty`; botão âmbar/pulsante + aviso "Alterações não salvas"; `handleSaveGroup` com `try/catch` (erro LOUD); pós-save atualiza `gBaseline`+`selectedGroup.moduleAccess` localmente. Sem mudança de backend/schema. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2918** — INTEGRAÇÃO DE SEGURANÇA (SST) · DASHBOARD — CLICAR NUM CARD DE KPI AGORA FILTRA: LEVA DIRETO PRA ABA CORRESPONDENTE (APROVADOS/PENDENTES/REPROVADOS). Os 5 cards (Total/Aprovados/Pendentes/Reprovados/Vencendo 30d) eram `<div>` estático. FRONT-only `client/src/pages/sst/IntegracaoSST.tsx`: `KpiCard` ganhou prop `onClick` (clicável: cursor, hover, `role=button`, `tabIndex=0`, Enter/Espaço, rótulo "Ver lista ›"); `DashboardTab` recebe `onNavigate` e liga Aprovados→"aprovados", Pendentes→"pendentes", Reprovados→"reprovados", Vencendo(30d)→"pendentes". "Total" segue informativo. Sem mudança de backend/schema. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2917** — INTEGRAÇÃO DE SEGURANÇA (SST) · PORTAL PÚBLICO — VÍDEO DE TREINAMENTO VOLTOU A TOCAR: CORREÇÃO DO 500 AO SERVIR ARQUIVOS GRANDES DE `/uploads` ATRÁS DO PROXY DO DEPLOY. O proxy do deploy (Cloud Run) rejeita com 500 respostas com Content-Length > ~32MB; o `express.static` servia o `Range: bytes=0-` (aberto) com o arquivo INTEIRO (140MB). Novo middleware em `server/_core/index.ts` ANTES do `express.static("/uploads")` LIMITA cada resposta a `UPLOADS_MAX_CHUNK=8MB` (reescreve `Range`, força 206); mesmo cap no fallback DB; HEAD/arquivos pequenos passam intactos; trata `bytes=-N`, 416 e path traversal. Efeito só em PROD após republicar. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2916** — CONTROLE DE EPIs · NECESSIDADE — CORREÇÃO DO INPUT DE CONFIG QUE TRAVAVA EM ZERO: AGORA DÁ PRA APAGAR O CAMPO "CAMISAS/CALÇAS/CALÇADOS POR PESSOA" E DIGITAR OUTRO NÚMERO. Input numérico fazia `parseInt(value)||0` gravando número; ao apagar, `NaN→0` reexibia `0`. FRONT-only `client/src/pages/EpiNecessidade.tsx`: guarda config como STRING; `onChange` aceita `""`/1-2 dígitos; `onBlur`/Salvar clampam 0..99. Sem mudança de backend/schema. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
