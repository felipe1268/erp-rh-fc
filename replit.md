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

- **Rev. 2995** — **PESQUISA DE SATISFAÇÃO (NPS) → FILTRO POR OBRA UNIFICADO: UMA ÚNICA BARRA NO TOPO GOVERNA "LINKS DE AVALIAÇÃO GERADOS" + DASHBOARD + LISTA "AVALIAÇÕES RECEBIDAS".** BUG: "tô clicando na obra do REVTE, mas ainda aparece a avaliação da obra do QIU 2." CAUSA-RAIZ: a Rev. 2994 filtrou o DASHBOARD, mas a barra de obras dentro de "Links de avaliação gerados" (Rev. 2988) era OUTRA, com estado próprio (`linkObraTab` × `avalObraTab`) e lista diferente (links vinham de `linksData` → REVTE aparecia; dashboard de `avaliacoesData` → só obras com avaliação recebida → REVTE nem listava). SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema): em `client/src/pages/ClientesPortalAdmin.tsx` as duas barras viraram UMA SÓ no topo ("Filtrar por obra"), estado único (`avalObraTab`), lista = UNIÃO via novo memo `obraTabGroups` (mescla `linkObraGroups`+`avalObraGroups` por `obraId`, ativas-first, contagem "N aval · N links"); `effObraTab`/`linksVisiveis`/2ª query `dashObra`/`dashView` seguem o filtro único (obra só-com-links resolve `obraSelId` e mostra dashboard zerado); removidas as barras internas das Rev. 2988/2994; trocar de obra limpa a seleção múltipla de links. Requer REPUBLICAR. Detalhe: `shared/changelog.ts`.
- **Rev. 2994** — **PESQUISA DE SATISFAÇÃO (NPS) → ABA "AVALIAÇÕES" AGORA FILTRA TODO O DASHBOARD POR OBRA (DEFAULT ABRE NUMA OBRA; "TODAS" É OPT-IN).** PEDIDO: "Quero que cada avaliação seja filtrada por obra, para evitar poluição na tela; só quando mandar ver todas as obras é que aparece tudo." A aba "Avaliações (NPS)" de `ClientesPortalAdmin` mostrava TODOS os agregados de TODAS as obras juntos (cards Respostas/NPS/Média/Promotores, "Recomendaria", "Médias por critério", "Por obra", perguntas extras, "Por período" e a lista); só a lista "Avaliações recebidas" tinha filtro por obra (Rev. 2988). SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema — REUTILIZA o param `obraId` que `dashboardAvaliacoesCliente` já aceita desde a Rev. 1593): em `client/src/pages/ClientesPortalAdmin.tsx` a barra de abas por OBRA subiu pro TOPO do dashboard (ativas em destaque + "Todas"); `avalObraTab` inicia "" → `effObraTab` abre na 1ª obra (menos poluição), "Todas" vira escolha explícita; 2ª query `dashObra` ({obraId}) recomputa TUDO no servidor só da obra selecionada (necessário porque `avaliacoes` vem capado em 100 — recompute no client erraria com >100 respostas); `dashView` alimenta toda a render + spinner `carregandoObra`; "Por obra" só aparece em "Todas"; removida a barra de abas duplicada que vivia dentro de "Avaliações recebidas". Backend/schema INALTERADOS. Requer REPUBLICAR. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2993** — CONTROLE DE EPIs → "ESTOQUE POR OBRA" → A TELA INTEIRA AGORA ROLA JUNTO (REMOVIDO O "CONGELAMENTO" STICKY DOS CARDS DE OBRA NO TOPO). SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): em `client/src/pages/Epis.tsx` (view `estoque_obra`) removido `sticky top-0 z-20 bg-background` do wrapper e `max-h-[42vh] overflow-y-auto pr-1` do grid de cards; resumo → cards → tabela rolam como documento único. NOTA (correção de DADOS, sem código): 2 linhas de `epi_estoque_obra` da empresa 60002 apontavam p/ obra de outra empresa → REATRIBUÍDAS via `UPDATE` (SEM DELETE/DROP/ALTER). Detalhe: `shared/changelog.ts`.

- **Rev. 2992** — LIBERAÇÕES DO PORTAL → SELEÇÃO DE "OBRAS LIBERADAS" AGORA VIVE DENTRO DA TELA "LIBERAÇÕES DO PORTAL — MÓDULOS E ABAS". SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE — REUTILIZA a infra da Rev. 2851): seção "3. Obras liberadas para este usuário" dentro do mesmo modal (toggle "Todas"×"Selecionar" + checkboxes); `salvarLiberacoesCompletas` grava `setObrasLiberadasCliente` + `setAbasLiberadasCliente` de uma vez. Backend/coluna `portal_credentials.obras_liberadas` INALTERADOS. Detalhe: `shared/changelog.ts`.

- **Rev. 2991** — PORTAL DO CLIENTE → PLANEJAMENTO → REFIS DIVERGIA DA BARRA "AVANÇO FÍSICO" DO TOPO (CORRIGIDO — PARIDADE TOTAL PORTAL × ERP). CAUSA-RAIZ: topo lê `kpis` (snapshot MSP raiz UID=0); `AbaRefis` em "Só Diretas" lia valores SALVOS congelados na emissão. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): `AbaRefis` "Só Diretas" espelha o topo via props `topPrevisto`/`topRealizado`; SPI recalculado do acumulado; modo "Global" mantém recálculo próprio. Detalhe: `shared/changelog.ts`.

- **Rev. 2990** — PORTAL DO CLIENTE (LOGADO) → NPS → CAMPO "NOME DO ENCARREGADO" NÃO VINHA PRÉ-PREENCHIDO COMO NO LINK PÚBLICO (CORRIGIDO — PARIDADE TOTAL). CAUSA-RAIZ: `podeAvaliarEsteMes` deriva gestor+encarregado do `obraId` do TOKEN (só existe no link público); no portal logado `cliente.minhasObras` NÃO retornava `encarregadoNome`. SOLUÇÃO (BACKEND-only, ZERO ALTER/DROP/DELETE): `cliente.minhasObras` deriva/retorna `encarregadoNome` POR OBRA com a régua do link (`getEquipeObra` → "ENCARREGAD"); `.map()` → `await Promise.all` defensivo. Detalhe: `shared/changelog.ts`.

- **Rev. 2989** — PORTAL DO CLIENTE → NPS → LINK PÚBLICO CURTO `/a/<codigo>` REDIRECIONAVA O CLIENTE PARA `/login` EM PRODUÇÃO (CORRIGIDO). CAUSA-RAIZ: o interceptor GLOBAL do `queryClient` em `client/src/main.tsx` redireciona erro `UNAUTHORIZED` p/ `/login`, exceto na whitelist `publicPaths` (Rev. 1601), que nunca recebeu o short-link `/a/<codigo>` (Rev. 2980). SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): adicionar `"/a/"` (e bônus `"/assinar/"` do FCSign) às DUAS cópias de `publicPaths`. Detalhe: `shared/changelog.ts`.


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
