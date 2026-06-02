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


- **Rev. 2687** — **SST (`/sst/atestados-acidentes` → aba "Visão Geral") · OS CARDS "TOTAL ATESTADOS" E "DIAS AFASTAMENTO (ATESTADO)" VIRARAM CLICÁVEIS E ABREM UM MODAL "DE ONDE VEM O NÚMERO?" QUE EXPLICA O CÁLCULO (SOMA DO CAMPO `diasAfastamento` DE CADA ATESTADO NO PERÍODO) E LISTA O DETALHAMENTO POR COLABORADOR (NOME, FUNÇÃO, QTD, DIAS), COM BUSCA/FILTRO, EXPORT CSV E CLIQUE NA LINHA → RAIO-X.** Pedido (usuário, prints IMG_1496/97/98): "como o ERP calcula os dias de afastamento... quero ver de onde vêm as informações e filtrar quem são os funcionários". Fix (1 CAMPO READ-ONLY NOVO + UI; ZERO SCHEMA — R-001/R-007/R-010): SERVER `server/routers/sstAnalytics.ts` (`atestadosAcidentes`) — add `atestados.todosFuncionarios` (mesma agregação do `topFuncionarios`, porém COMPLETA, ordenada por dias desc; Σ dias = `totalDiasAfastamento`, reconcilia c/ o card; sem query nova). CLIENT `client/src/pages/sst/DashboardAtestadosAcidentes.tsx` — `KPI` ganhou props `onClick`/`hint` (card acessível c/ cursor/hover + microcópia); cards "Total Atestados"/"Dias Afastamento" abrem modal `diasDetalhe` (cabeçalho explicativo c/ fórmula+período+totais, busca `diasFiltro`, tabela por colaborador c/ TOTAIS, CSV, clique→`setSelectedEmployeeId` reusa `EmployeeDetailDialog`); icons Search/Info/Download. esbuild EXIT 0. Detalhe: `shared/changelog.ts`.
- **Rev. 2686** — **ALMOXARIFADO (`/almoxarifado` → menu "Histórico de Inventário") · NOVO PAINEL ÚNICO READ-ONLY P/ ANALISAR O HISTÓRICO DO INVENTÁRIO: ABA "INVENTÁRIO SEMANAL" (TODAS AS SESSÕES PASSADAS, SEMANA A SEMANA, DIVERGÊNCIAS EM DESTAQUE) + ABA "BAIAS / GRANEL" (LEITURAS DE CADA BAIA AO LONGO DO TEMPO, COM CONSUMO/TENDÊNCIA). ANTES SÓ EXISTIA A SEMANA CORRENTE.** Pedido (usuário): "um registro para analisar corretamente" semanal + baias; escolheu painel único + novo item no menu. Dados já existiam no banco; faltava só a TELA. Fix (1 ENDPOINT READ-ONLY NOVO + 1 PÁGINA NOVA + WIRING; ZERO SCHEMA — R-001/R-007/R-010): SERVER `server/routers/warehouse.ts` — query `historicoInventarioSemanal({companyId, obraId?, limit?})` lista TODAS as sessões (desc por `semanaRef`/`id`, resolve obraNome; central=obraId null) com guards tenant+obra espelhando `baiaListar`; detalhe REUSA `getInventorySessionItems` (que ganhou guard de tenant+obra nesta rev., antes era IDOR), baias REUSAM `baiaListar`+`baiaLeiturasListar` (nada novo). CLIENT `client/src/pages/almoxarifado/HistoricoInventario.tsx` (NOVO): seletor Central/obra + 2 abas; Semanal = cards de sessão que expandem (lazy) p/ itens (divergências em destaque); Baias = só por obra (CTA no Central), cards com tendência expandindo p/ timeline de leituras com consumo Δ. WIRING: rota em `App.tsx`, feature `almoxarifado-historico-inventario` em `shared/modules.ts`, item na sidebar (`DashboardLayout.tsx`, icon BarChart3). esbuild EXIT 0. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2685** — COLABORADORES (`/colaboradores` → ficha → aba "Documentos" → "Documentos digitalizados") · O LAYOUT DESSE BLOCO FOI REFEITO P/ FICAR MAIS AMIGÁVEL: SAIU O GRID DE CAIXAS TRACEJADAS VAZIAS (Rev. 2683) E ENTROU UMA LISTA DE CARDS (2 COLUNAS) — CADA TIPO COM ÍCONE TEMÁTICO, RÓTULO LEGÍVEL, SELO DE STATUS (PENDENTE / N ARQUIVOS / ASSINADO) E BOTÃO DE AÇÃO. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/Colaboradores.tsx` — bloco B do `DocumentUploadSection` reescrito: mapa `DOC_ICONS`; cada tipo vira card horizontal (avatar de ícone colorido por estado + título + selo + lista de arquivos + botão de ação). Detalhe: `shared/changelog.ts`.
- **Rev. 2684** — COLABORADORES (`/colaboradores` → ficha → "Isenção de Controle de Jornada (Art. 62 CLT)" → "Termo formal de Ciência e Anuência") · A OPÇÃO "UPLOAD DO TERMO ASSINADO" FOI REMOVIDA — O TERMO DE ISENÇÃO (ART. 62) AGORA É ASSINADO EXCLUSIVAMENTE ONLINE PELO FCSign. "GERAR / IMPRIMIR TERMO" (CONFERÊNCIA) E O PAINEL DE ASSINATURA DIGITAL CONTINUAM. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/Colaboradores.tsx` — removido `<label>`/`<input type=file>` "Upload do Termo Assinado" + nota "Salve o cadastro antes…"; texto de ajuda reescrito (gerar/imprimir = só conferência; assinatura coletada online). Removidos helpers mortos (`uploadingTermoArt62`, `uploadTermoArt62Mut`, `handleTermoArt62Upload`). Mantido endpoint `employees.uploadTermoArt62` no server (só não é mais chamado). Detalhe: `shared/changelog.ts`.
- **Rev. 2683** — COLABORADORES (`/colaboradores` → ficha → aba "Documentos") · A SEÇÃO DE DOCUMENTOS FOI REDESENHADA: OS DOCS QUE JÁ TÊM ASSINATURA DIGITAL (FCSign) APARECEM NUM BLOCO "ASSINADOS DIGITALMENTE" (READ-ONLY, COM "VER") E NÃO PRECISAM MAIS DE UPLOAD; O UPLOAD MANUAL VIROU SLOTS POR TIPO. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/Colaboradores.tsx` — `DocumentUploadSection` reescrito: consulta `signatures.listByEmployee`, deriva `assinados` + `slotsCobertos` (`FCSIGN_COBRE_SLOT`: `contrato_experiencia→contrato_trabalho`), 2 blocos (A: cards verdes read-only; B: slots por `TIPOS_DOC` com `docsByTipo`/status/validade/Ver/Excluir). Header "Documentos Digitalizados"→"Documentos"; chamada `formCompanyIdNum||companyId||0`. (Layout do bloco B depois refeito na Rev. 2685.) Detalhe: `shared/changelog.ts`.
- **Rev. 2682** — COLABORADORES (`/colaboradores` → ficha → "Isenção de Controle de Jornada (Art. 62 CLT)") · O "TERMO FORMAL DE CIÊNCIA E ANUÊNCIA" (TERMO DE ISENÇÃO ART. 62) AGORA PODE SER ASSINADO ONLINE PELO FCSIGN — MESMOS MEIOS/CRITÉRIOS DO CONTRATO DE EXPERIÊNCIA. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/Colaboradores.tsx` — `imprimirTermoArt62` refatorado em `buildTermoArt62(forFcsign)` (fonte única impressão E FCSign), corpo SÓ com estilos INLINE (sem `<style>` global que vazaria no `/assinar` via DOMPurify), slots de 50px c/ placeholders `<!--FCSIGN:SIG:{role}-->`, `validarTermoArt62()`, painel FCSign plugado (tipo `termo_art62`); `FCSignContratoExperienciaPanel.tsx` generalizado c/ props `tipo`+`docLabel`. Detalhe: `shared/changelog.ts`.
- **Rev. 2681** — COLABORADORES (`/colaboradores`) · O RAIO-X DO FUNCIONÁRIO (ABERTO AO CLICAR NO NOME/FOTO) DEIXA DE QUEBRAR O LAYOUT EM TABLET/iOS — ABRE EM FULLSCREEN DE VERDADE (COBRINDO TUDO), COM BOTÃO DE FECHAR, SEM A LISTA VAZANDO POR BAIXO. Causa-raiz: overlay `fixed inset-0` inline + regra GLOBAL `*:has(> table){overflow-x:auto}` (Rev. 2177) torna pais de `<table>` scroll-containers, e no iOS Safari `position:fixed` fica PRESO a ancestral com overflow scrollável. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/components/RaioXFuncionario.tsx` — overlay renderizado via React Portal `createPortal(..., document.body)`, escapando de todos os ancestrais. Import add `createPortal`. Detalhe: `shared/changelog.ts`.


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
