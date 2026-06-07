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

- **Rev. 2889** — **PORTAL DO CLIENTE — NOVO ATALHO "PESQUISA DE SATISFAÇÃO (NPS)" NA BARRA LATERAL, ABRINDO DIRETO A ABA DE AVALIAÇÕES.** Pedido: a pesquisa de satisfação (avaliações/NPS) só era acessível entrando em "Acessos do Portal" e trocando manualmente p/ a aba "Avaliações (NPS)"; usuário quer acesso direto no menu. FIX (só front): (1) `client/src/components/DashboardLayout.tsx` — novo item "Pesquisa de Satisfação (NPS)" (ícone `Star`) na seção Administração do menu Portal do Cliente, path `/clientes/portal?tab=avaliacoes`; a filtragem de permissão já normaliza a query (`route.split("?")[0]`), então herda a visibilidade de "Acessos do Portal" (sem registrar nova rota). (2) `client/src/pages/ClientesPortalAdmin.tsx` — passa a LER `?tab=` via `useSearch` (wouter) p/ inicializar/sincronizar a aba ativa; antes era `useState("acessos")` fixo. ZERO schema; ZERO backend; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2888** — **CONTROLE DE REVISÕES — CARD "TOTAL" PASSA A MOSTRAR O NÚMERO DA REVISÃO ATUAL (2888) EM VEZ DA CONTAGEM DE REGISTROS DISTINTOS (2503).** Sintoma (print iPad): card "Total" mostrava 2503; usuário aponta que "o correto é 2888". CAUSA: o card usava `revisions.length` (= versões DISTINTAS em `system_revisions`); o banco tem só 2503 distintas porque a numeração tem 383 GAPS reais (números nunca registrados, herdados do `CHANGELOG` legado ≤1878) → `length` ≠ número da revisão atual. O contador de revisões é a versão de `shared/version.ts`, não a contagem de linhas. FIX (só front `client/src/pages/Revisoes.tsx`): card "Total" passa a exibir `APP_VERSION_NUMBER` (de `@shared/version`) — fonte única do nº da revisão atual, acompanha cada bump futuro; os 5 cards de categoria seguem contando registros classificados (inalterados). ZERO schema; ZERO backend; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2887** — COLETA DE CAMPO (RH) — ITENS EXTRAS POR LINK, DEFINIDOS NA HORA, MAPEANDO CADA UM PARA UM CAMPO DA FICHA → GRAVA AUTOMÁTICO NA APROVAÇÃO. Pedido: além dos 5 grupos fixos (contato/emergência/endereço/EPI/foto), o RH quer acrescentar na geração do link OUTROS dados (CPF, RG, PIS, CNH, banco/agência/conta, chave PIX, e-mail…), cada um amarrado a um campo do cadastro, de forma que ao APROVAR já caia na ficha. NOVO catálogo SEGURO `CAMPOS_CUSTOM_CATALOGO` (26 campos — subconjunto do whitelist `updateEmployee`) + helpers `shared/coletaCampos.ts`. SCHEMA ADITIVO `coletaRhSessoes.itensCustomJson` (TEXT) + self-heal `[SyncSchema+]`. BACKEND `server/routers/coletaRh.ts`; FRONTEND `ColetaCampo.tsx` + `ColetaCampoPublica.tsx`. ZERO ALTER/DROP/DELETE destrutivo (só ADD COLUMN aditivo). Detalhe: `shared/changelog.ts`.

- **Rev. 2886** — DASHBOARD FINANCEIRO — KPIs/LISTAS AGORA EM VALOR CHEIO EM REAIS (R$ 1.400.000,00) NO LUGAR DA FORMA ABREVIADA (R$ 1.4M / R$ 123.9K). Pedido (print do Dashboard Financeiro): cards do mês (Receita/Despesa/Resultado/A Receber/A Pagar) mostravam "R$ 1.4M"/"R$ 123.9K"; usuário quer valor cheio. FIX `client/src/pages/financeiro/FinanceiroDashboard.tsx`: helper `formatCompact()` REMOVIDO; chamadas trocadas p/ `formatBRL` (`Intl.NumberFormat pt-BR currency BRL`); layout responsivo p/ caber (`text-sm lg:text-base`+`tabular-nums`+`break-words`; colunas 30 dias `w-16`→`w-24`). ZERO schema; ZERO backend; ZERO ALTER/DROP/DELETE — só front. Detalhe: `shared/changelog.ts`.

- **Rev. 2885** — CLIENTES — BOTÕES "EDITAR"/"EXCLUIR" DOS CARDS AGORA SEMPRE VISÍVEIS (ANTES DEPENDIAM DE HOVER → INVISÍVEIS EM IPAD/TOUCH). CAUSA: barra de ações em `client/src/pages/Clientes.tsx` usava `opacity-100 md:opacity-0 md:group-hover:opacity-100` — a partir de `md` (≥768px) só aparecia no `:hover`; toque (iPad) não tem hover → nunca aparecia. FIX: `opacity-100 transition-opacity` (sem hover-gate). Obras já mostrava "Editar" sempre, NÃO mexida. ZERO schema; ZERO backend; ZERO ALTER/DROP/DELETE — 1 linha CSS. Detalhe: `shared/changelog.ts`.

- **Rev. 2884** — HOTFIX: LISTA DE OBRAS VOLTOU VAZIA ("Nenhuma obra encontrada") — COLUNAS `databook_logo_*` (Rev. 2879) + `numero_contrato` (Rev. 2882) NUNCA FORAM CRIADAS NO NEON; SELF-HEAL MIGRADO P/ BLOCO UNGATED. CAUSA: drizzle `select()` de obras pede TODAS as colunas do schema; as 4 colunas existiam no schema mas NÃO no Neon → query estourava `column does not exist` (42703) → lista vazia. O self-heal vivia SÓ no `[ColFix] Bloco2` VERSION-GATED + `DO/EXCEPTION` atômico → nunca rodava em bancos já atualizados. FIX (1) `ALTER TABLE obras ADD COLUMN IF NOT EXISTS` no Neon; FIX (2) novo bloco UNGATED em `server/_core/index.ts` `[SyncSchema+]` (statements SEPARADOS). ZERO ALTER/DROP/DELETE destrutivo. Detalhe: `shared/changelog.ts`.

- **Rev. 2883** — FORNECEDORES / EMPRESAS TERCEIRAS — NOME SEMPRE SALVO EM CAIXA ALTA (TUDO EM MAIÚSCULAS), REVERTENDO O TITLE CASE DA REV. 2881. Helper `shared/normalizeNomeEmpresa.ts` reescrito (`upperCaseEmpresa` = trim + colapsa espaços + `toUpperCase`); todos os writes (`compras.ts`, `terceiros.ts`, `terceiroContratos.ts`, `masControle.ts`) + `onBlur` no front. Backfill (UPDATE) no Neon: `fornecedores`(1202)+`empresas_terceiras`(23) em CAIXA ALTA. ZERO schema; ZERO ALTER/DROP/DELETE (só UPDATE). Detalhe: `shared/changelog.ts`.

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
