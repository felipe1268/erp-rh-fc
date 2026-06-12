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

- **Rev. 2990** — **PORTAL DO CLIENTE (LOGADO) → NPS → CAMPO "NOME DO ENCARREGADO" NÃO VINHA PRÉ-PREENCHIDO COMO NO LINK PÚBLICO (CORRIGIDO — PARIDADE TOTAL).** PEDIDO: avaliar pelo portal logado (obra escolhida no dropdown) tem de ficar 100% igual ao link — GESTOR E ENCARREGADO preenchidos automaticamente. No print, o gestor preenchia mas o encarregado ficava como campo vazio. CAUSA-RAIZ: o backend `podeAvaliarEsteMes` deriva gestor+encarregado AO VIVO a partir do `obraId` embutido NO TOKEN — que só existe no link público, não na sessão do portal logado. No portal, `gestorAuto` salvava via fallback `obraSel.responsavel` (que `cliente.minhasObras` já trazia desde a Rev. 2965), mas `encarregadoAuto` ficava `null` porque `cliente.minhasObras` NÃO retornava `encarregadoNome`. SOLUÇÃO (BACKEND-only, ZERO ALTER/DROP/DELETE): `cliente.minhasObras` agora deriva e retorna `encarregadoNome` POR OBRA usando a MESMA régua do link (Rev. 2970)/`podeAvaliarEsteMes` (Rev. 2971): `getEquipeObra` → indireto cuja função/cargo contém "ENCARREGAD" → `nomeCompleto`. `.map()` virou `await Promise.all(...)` (paralelo) e cada obra é DEFENSIVA (try/catch → null, campo volta manual). O cliente já tinha o fallback `obraSel.encarregadoNome` — agora resolve. ZERO mudança de schema/JSX/token. Requer REPUBLICAR. Detalhe: `shared/changelog.ts`.
- **Rev. 2989** — **PORTAL DO CLIENTE → NPS → LINK PÚBLICO CURTO `/a/<codigo>` REDIRECIONAVA O CLIENTE PARA `/login` EM PRODUÇÃO (CORRIGIDO).** PEDIDO: o link público de avaliação `…/a/<codigo>` abria e em seguida jogava o cliente para `/login`; ele NÃO deve precisar logar. CAUSA-RAIZ: em `client/src/main.tsx` o interceptor GLOBAL do `queryClient` (subscribers de query/mutation cache) redireciona qualquer erro `UNAUTHORIZED` (`UNAUTHED_ERR_MSG`) para `/login`, EXCETO quando o pathname casa com a whitelist `publicPaths` (Rev. 1601). A whitelist nunca foi atualizada quando o short-link `/a/<codigo>` nasceu (Rev. 2980); a página pública renderiza `PortalDashboardCliente` em modo público e, se qualquer query volta `UNAUTHORIZED`, o subscriber não achava `/a/` e forçava o redirect. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): adicionar `"/a/"` às DUAS cópias de `publicPaths` em `main.tsx` (`redirectToLoginIfUnauthorized` e `isAuthErrorOnLoginPage`). A rota já era pública no `<Switch>` (sem `RouteGuard`) e `resolverLinkAvaliacao` já era `publicProcedure`; o bug era SÓ o interceptor. BÔNUS (mesma classe de bug, achado no code review): `/assinar/:token` (FCSign) também era pública mas estava fora da whitelist → adicionado `"/assinar/"` nas mesmas 2 cópias. Requer REPUBLICAR. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2988** — PORTAL DO CLIENTE → NPS → ABAS POR OBRA (ATIVAS EM DESTAQUE) + SEPARAÇÃO POR MÊS/ANO, NAS DUAS ÁREAS: "LINKS DE AVALIAÇÃO GERADOS" E "AVALIAÇÕES RECEBIDAS" (PEDIDO DO ADMIN MASTER). SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE — só reorganização de render): `ClientesPortalAdmin.tsx` helpers `normObraStatus`/`MESES_PT`/`mesAnoKey`/`mesAnoLabel`; `obraAtivaMap`; `agruparPorObra` (ativas-first) e `agruparPorMesAno`; estados `linkObraTab`/`avalObraTab` + memos `linksVisiveis`/`avaliacoesVisiveis`; barra de abas pill + subgrupos por mês/ano. Detalhe: `shared/changelog.ts`.

- **Rev. 2987** — PORTAL DO CLIENTE → NPS → "LINKS DE AVALIAÇÃO GERADOS" — SELEÇÃO MÚLTIPLA PARA EXCLUIR VÁRIOS LINKS DE UMA VEZ (PEDIDO DO ADMIN MASTER). SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE — SOFT-DELETE): `portalExterno.ts` endpoint `excluirLinksAvaliacao` (admin_master only) faz UM ÚNICO `UPDATE deletado_em=NOW() WHERE codigo=ANY(...) AND company_id=...` (idempotente, mais confiável no iOS que N requisições); `ClientesPortalAdmin.tsx` checkbox por linha + "selecionar tudo da obra" + barra "Selecionar todos/Limpar/Excluir selecionados (N)". Detalhe: `shared/changelog.ts`.

- **Rev. 2986** — PORTAL DO CLIENTE → NPS → "LINKS DE AVALIAÇÃO GERADOS" — POLIMENTOS + CORREÇÃO DO ERRO "THE STRING DID NOT MATCH THE EXPECTED PATTERN" AO EXCLUIR UM LINK NO iPad/iOS. PEDIDOS: (a) NOME da obra na lista; (b) data/hora Brasília BR; (c) bandeira inglês = EUA; (d) excluir falhava com toast vermelho e o link não sumia. CAUSA-RAIZ: DOMException crua do WebKit iOS ao derrubar a requisição no transporte; com `retry:false` global a 1ª tentativa caía e nada acontecia. SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE): `excluirLinkAvaliacao` IDEMPOTENTE; mutation com `retry` SÓ p/ transporte iOS + msg PT + `onSettled` refetch; `listarLinksAvaliacao` resolve nome da obra ao vivo (LEFT JOIN `obras`) e formata em Brasília; `portalAvaliacaoI18n.ts` bandeira inglês → 🇺🇸. Detalhe: `shared/changelog.ts`.

- **Rev. 2985** — PORTAL DO CLIENTE → NPS — 3 MELHORIAS: (1) LINKS GERADOS PERSISTEM E FICAM LISTADOS POR OBRA E DATA (só Admin Master apaga, soft-delete); (2) E-MAIL AOS ADMINS QUANDO O CLIENTE PREENCHE; (3) ESCOLHA DO IDIOMA DAS PERGUNTAS (PT-BR/INGLÊS/MANDARIM) AO GERAR O LINK + SELETOR NA PÁGINA PÚBLICA. SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE — colunas via self-heal): `_core/index.ts` colunas novas no shortlink; `portalExterno.ts` `gerarLinkAvaliacao(lang)`/`listarLinksAvaliacao`/`excluirLinkAvaliacao`/e-mail em `criarAvaliacao`; `ClientesPortalAdmin.tsx` seletor idioma + lista por obra; `PortalDashboardCliente.tsx` + `shared/portalAvaliacaoI18n.ts` (pt/en/zh). Detalhe: `shared/changelog.ts`.

- **Rev. 2984** — PLANEJAMENTO — USUÁRIO RESTRITO POR OBRA (ex.: "Mateus") NÃO VIA AS ATIVIDADES DO PROJETO ("0 atividades") MESMO COM O PROJETO LISTADO; CORRIGIDO P/ TODOS OS RESTRITOS. CAUSA-RAIZ: catálogo resolve permissão por OBRA (projeto aparece), mas as 4 queries do detalhe usavam compare ESTRITO `projeto.companyId === ctx.user.companyId` → multi-empresa bloqueado. SOLUÇÃO (BACKEND-only, ZERO ALTER/DROP/DELETE): helper `resolvePlanAllowedObraIds` (régua do catálogo; admin→null); detalhe valida obra do projeto ∈ obras permitidas. MUTATIONS seguem com guard estrito. Detalhe: `shared/changelog.ts`.

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
