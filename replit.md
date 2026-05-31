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


- **Rev. 2641** — **CONTROLE DE DOCUMENTOS · TREINAMENTOS RENOVADOS CONTINUAVAM "VENCIDO": O PAINEL DE VALIDADE LISTAVA *TODO* REGISTRO DE TREINAMENTO COM VALIDADE, SEM DEDUP. AGORA SÓ O REGISTRO DE MAIOR VALIDADE POR (FUNCIONÁRIO + NORMA) APARECE → A RENOVAÇÃO ESCONDE O ANTIGO VENCIDO, IGUAL JÁ ACONTECIA COM OS ASOs.** Pedido (usuário): "tem muitos documentos que não estão vencidos, alguns ja foram renovados mas o ERP não esta lendo que foi atualizado e mostra que ta vencido". CAUSA-RAIZ: em `docs.painelValidade` (`server/routers/controleDocumentos.ts`), os ASOs já deduplicavam (mais recente por `employeeId+tipo` + guarda de ASO mais novo válido), mas os TREINAMENTOS eram mapeados 1:1 de `treinRows` — SEM agrupamento. Renovação cria NOVO registro (não edita), então o antigo (validade expirada) ficava na lista mostrando "Vencido" pra sempre (NR-18/NR-01 de 2019/2021 no print). Fix (SÓ BACKEND DE LEITURA, ZERO SCHEMA/ALTER/DELETE; R-001/R-007/R-010): agrupa `treinRows` por `${employeeId}__${norma||nome}`, escolhe o de MAIOR `dataValidade` (empate → `dataRealizacao` recente → `id`), filtra `treinsComStatus` por esse Set. Havendo renovação válida, ela vence e o antigo some; se TODOS vencidos, ainda mostra 1 por requisito. Agrupa por NORMA (não cruza NR-18 com NR-01). Stats derivam de `todos` → refletem auto. Validado: esbuild bundle-check exit 0. Detalhe: `shared/changelog.ts`.
- **Rev. 2640** — **RAIO-X DO FUNCIONÁRIO · O FILTRO "AVISO PRÉVIO" PERDIA GENTE: MOSTRAVA SÓ OS REGISTROS DO MÓDULO (`em_andamento`, EX.: 3) E IGNORAVA OS COLABORADORES COM STATUS "AVISO" NO CADASTRO. AGORA UNE AS DUAS FONTES (DEDUPLICADO).** Pedido (usuário): "esta tudo bagunçado os status.. so motras 3 funcionarios de avisos e temos muito mais.." CAUSA-RAIZ: `avisoPrevioEmployeeIds` derivava SÓ de `avisoPrevio.avisoPrevio.list` (registros `em_andamento`), ignorando a fonte canônica do RH = campo `status === "Aviso"` do cadastro (EMPLOYEE_STATUS, label "Aviso Prévio"). Prova: Ativos 106 + Desligados 162 + Afastados 4 + Férias 4 + Licença 0 + Reclusos 2 + Blacklist 22 = 300 vs. Todos 307 → 7 com `status="Aviso"` invisíveis. Fix (SÓ CLIENT, ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/pages/relatorios/RaioXPage.tsx` — `avisoPrevioEmployeeIds` vira UNIÃO deduplicada de `status==="Aviso"` + módulo `em_andamento` (contagem/filtro/destaque do card já dependem desse Set); badge "Aviso" laranja + label "Aviso Prévio". Validado: esbuild transform-check limpo (exit 0). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2639** — COLABORADORES · A FILEIRA DE FILTROS POR STATUS SUMIA INTEIRA DURANTE O CARREGAMENTO/REFETCH DO STATS; AGORA FICA SEMPRE VISÍVEL QUANDO HÁ EMPRESA SELECIONADA. CAUSA-RAIZ: fileira renderizada só dentro de `{statsQ.data && (...)}`, some no refetch. Fix (SÓ CLIENT; R-001/R-007/R-010): `client/src/pages/Colaboradores.tsx` — gate passa para `{hasValidSelection && (...)}`; contadores com fallback `?? "—"`. Detalhe: `shared/changelog.ts`.

- **Rev. 2638** — RH & DP · MENU "RELATÓRIOS" ENXUTO: REMOVIDOS OS RELATÓRIOS QUE NÃO FAZEM MAIS SENTIDO (PONTO, FOLHA, DIVERGÊNCIAS, CUSTO POR OBRA, HABILIDADES POR OBRA); FICA SÓ O "RAIO-X DO FUNCIONÁRIO". Fix (SÓ CLIENT; R-001/R-007/R-010): `client/src/components/DashboardLayout.tsx` — na seção `Relatórios` do sidebar, `items` reduzido a `{ Raio-X do Funcionário → /relatorios/raio-x }`. Conservador: só a VISIBILIDADE no menu; rotas/permissões intactas. Detalhe: `shared/changelog.ts`.

- **Rev. 2637** — DASHBOARD DE FUNCIONÁRIOS · O SELETOR "ANO DE ANÁLISE" PARAVA EM 2020 (7 ANOS FIXOS); AGORA LISTA TODOS OS ANOS DESDE A FUNDAÇÃO (2011), EM PARIDADE COM O GRÁFICO "TOTAL POR ANO". CAUSA-RAIZ: array de opções HARD-CODED em 7 anos. Fix (SÓ CLIENT; R-001/R-007/R-010): `client/src/pages/dashboards/DashFuncionarios.tsx` — `anosDisponiveis` reusa `headcountAnual.anos` (mesma fonte do gráfico), `Set` p/ unicidade + `anoAtual`, fallback 7 anos, ordenação decrescente. Detalhe: `shared/changelog.ts`.

- **Rev. 2636** — RH & DP · "ANÁLISE DE EXPERIÊNCIA" (TELA FULL-SCREEN) DEIXA DE FICAR TRANSPARENTE — FUNDO 100% OPACO. CAUSA-RAIZ: `bg-muted/30` no `<DialogContent>` substituía via `twMerge` o `bg-background` opaco base → 30% de opacidade em tela full-screen. Fix (SÓ CLIENT, 1 CLASSE; R-001/R-007/R-010): `client/src/components/AnaliseExperiencia.tsx` — `bg-muted/30` → `bg-muted` (sólido opaco). Detalhe: `shared/changelog.ts`.

- **Rev. 2635** — PAINEL RH & DP · O CABEÇALHO GANHA UM SELO "X PESSOAS" COM O TOTAL DE COLABORADORES DA EMPRESA, AO LADO DO TÍTULO "PAINEL RH & DP" — SEPARADO DO CARD "TOTAL" DO QUADRO DE PESSOAL. Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/pages/PainelRH.tsx` — ao lado do `<h1>` um SELO clicável `{s?.totalFuncionarios} pessoas` (ícone `Users`, pt-BR) reusando `home.getData.stats.totalFuncionarios` (paridade com o card "Total"); clique → `/colaboradores?status=Todos`; guardado por `hasValidCompany && canSeeColaboradores && s`. Detalhe: `shared/changelog.ts`.

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
- **REGRA DE OURO — CAMINHO B (Rev. 2617+, substitui Rev. 2533/2603).** FONTE ÚNICA = coluna `PercentComplete` ("% Concluída") do MS Project, lida nos dois momentos com a MESMA régua → paridade EXATA (PLN_816 R04 = 2/9/15/20 CRAVADO):
  - **% PREVISTO** (raiz e atividades) = fração de duração da baseline em **TEMPO ÚTIL MINUTO-A-MINUTO** (motor `minutosUteisEntre`/`fracaoMinutos` de `shared/diasUteis`, varrendo dia a dia e clipando aos intervalos de trabalho `weekDayIntervals` do calendário do XML). RAIZ = `round(Σ minutos úteis DECORRIDOS de cada folha ÷ Σ minutos úteis TOTAIS × 100)` (ponderado por minutos úteis, NÃO por contagem de atividades); POR ATIVIDADE = `round(fracaoMinutos(BL_Start, semana, BL_Finish, cal) × 100)`. `round` (não `floor`) porque a coluna "% Concluída" do MSP é arredondada.
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora capturada no import). Date-only diverge (PLN_816 daria 2/9/16/22). Sem `weekDayIntervals` no calendário OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal segue fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` + chamada pós-transaction em `salvarAtividades`; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
