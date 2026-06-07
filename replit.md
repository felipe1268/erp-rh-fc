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

- **Rev. 2862** — **DATABOOK DE OBRA (`/compras/databook`) — REPAGINADA VISUAL: MODERNO, INTUITIVO E FÁCIL DE VISUALIZAR (SÓ UI, ZERO MUDANÇA DE LÓGICA).** Pedido: "repaginada na tela do databook, algo moderno, intuitivo e fácil visualização" (anexo IMG_1679 = empty state antigo, cinza). SÓ camada visual — todos os handlers/mutations/queries/useMemos (`handleGerarCompleto`, `fichasAgrupadas`, `codigoFicha`, retry 3x da Rev. 2861) intactos. FEITO (`client/src/pages/compras/Databook.tsx`, só frontend): NOVA paleta `DISCIPLINA_CORES` (13 disciplinas → bg/soft/text/border/dot, classes Tailwind LITERAIS) + helper `corDisciplina()`; SELETOR DE OBRA virou faixa institucional FC navy (gradiente `#1B2A4A`→`#2d4373`, ícone `BookOpen` em chip white/15) com `Select` branco; EMPTY STATE virou card `border-dashed rounded-2xl` com ícone grande; ABAS viraram SEGMENTED CONTROL (pílula `bg-slate-100`, ativa branca c/ sombra+navy); DASHBOARD ganhou card de destaque "Gerar Completo" no topo + 7 KPI cards com ícone/ring/hover-shadow + "Progresso Geral"/"Por Disciplina" `rounded-2xl` com dots coloridos; ABA FICHAS com filtros/tabela `rounded-xl`+sombra, cabeçalhos de grupo coloridos por disciplina (soft+dot+badge) e código da ficha como chip colorido. ZERO ALTER/DROP/DELETE; ZERO schema; ZERO backend. Arquivo único. Detalhe: `shared/changelog.ts`.
- **Rev. 2861** — **DATABOOK DE OBRA — (1) "NÃO HAJA FALHAS" NA GERAÇÃO DE ESPECIFICAÇÕES IA, (2) FICHAS NUMERADAS E SEPARADAS POR DISCIPLINA, (3) APROVADAS NÃO SE PERDEM AO GERAR NOVAMENTE.** Pedido (tela `/compras/databook`): fase "Gerar Especificações IA" deu 19 falhas de 99. CAUSA-RAIZ (`server/_core/llm.ts`): Claude (claude-sonnet-4-6) retorna 529 "Overloaded" sob carga; `invokeAnthropic` só dava retry em 429 e o fallback Claude→Gemini de `invokeLLM` checava `"overloaded"` CASE-SENSITIVE (SDK manda "Overloaded") → ficha estourava. FEITO (1): `invokeAnthropic` trata 429 E 529/overloaded (regex `/overloaded/i` + `error.type==="overloaded_error"`) como retryable; fallback de `invokeLLM` virou regex CASE-INSENSITIVE c/ 529; no front (`Databook.tsx` `handleGerarCompleto` fase 2) cada ficha tenta até 3x c/ backoff. FEITO (2): NOVO `shared/databookDisciplinas.ts` (`codigoFicha`/`ordemDisciplina`/prefixos); `numeroSequencial` segue ID estável global; código exibido vira `<PREFIXO>-NNN` (ex.: "EST-014"); lista de Fichas AGRUPADA por disciplina (cabeçalho+contagem) e índice PDF (`databookPdf.ts`) com faixas por disciplina + `codigoFicha`. FEITO (3): `gerarEspecificacoesIA` JAMAIS reescreve ficha em status avançado (`revisado/enviado/aprovado/reprovado` → early-return `protegida:true`). ZERO ALTER/DROP/DELETE; ZERO schema. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2860** — COLETA DE CAMPO (RH) — "GERAR TODOS" + "COPIAR TODOS": GERA UM LINK PARA TODAS AS OBRAS ATIVAS DE UMA VEZ E COPIA A LISTA (OBRA → LINK). BACKEND (`server/routers/coletaRh.ts`): NOVO endpoint `criarSessoesTodas` (guard anti-IDOR `assertColetaCompanyAccess` + filtro canônico de obras ativas); IDEMPOTENTE (reaproveita link ativo não-expirado); retorna `{criadas, reaproveitadas, totalObras}`. FRONTEND (`ColetaCampo.tsx`): card "Gerar para todas as obras ativas" + "Copiar todos". ZERO ALTER/DROP/DELETE; ZERO schema. Detalhe: `shared/changelog.ts`.

- **Rev. 2859** — COLETA DE CAMPO (RH) — O SELETOR DE OBRA DO "NOVO LINK DE COLETA" AGORA LISTA SOMENTE OBRAS ATIVAS (EM ANDAMENTO). CAUSA-RAIZ (`server/routers/coletaRh.ts`, `obrasDisponiveis`): filtro era só `isActive = 1` (flag "não-arquivada"), que NÃO é a definição de "obra ativa" do ERP (inclui o `status`). FEITO (SÓ backend): `obrasDisponiveis` espelha EXATAMENTE o filtro canônico de `getObrasByCompanyActive` (fonte de `obras.listActive`): `isActive = 1` AND `deletedAt IS NULL` AND `status = 'Em_Andamento'` (import `isNull`). ZERO ALTER/DROP/DELETE; ZERO schema; só backend. Detalhe: `shared/changelog.ts`.

- **Rev. 2858** — NOVO MÓDULO "COLETA DE CAMPO" (RH) — LINK EXTERNO POR OBRA (TOKEN + QR, SEM LOGIN) P/ AUXILIAR DE CAMPO COLETAR DADOS DOS FUNCIONÁRIOS ALOCADOS PELO CELULAR, COM FILA DE REVISÃO (RH APROVA ANTES DE GRAVAR). MODELO 100% ADITIVO (ZERO coluna nova em `employees`): NOVAS tabelas `coleta_rh_sessoes` + `coleta_rh_respostas` + self-heal `[SyncSchema+]`. BACKEND `server/routers/coletaRh.ts` (interno protegido + público por token; LGPD só nome/função/foto; aprovar→`updateEmployee` whitelist). FRONTEND `ColetaCampoPublica.tsx` (rota pública mobile) + `ColetaCampo.tsx` (interno Links/QR + Fila). Registro modules/modulePages/App/DashboardLayout. ZERO ALTER/DROP/DELETE; schema só aditivo. Detalhe: `shared/changelog.ts`.

- **Rev. 2856** — CADASTRO DO COLABORADOR — ABA "UNIFORME / EPI" GANHA LAYOUT MODERNO, COLORIDO E INTERATIVO (CARTELAS COM CHIPS TOCÁVEIS), MANTENDO O PADRÃO FC. FEITO (`Colaboradores.tsx`, SÓ frontend): NOVA config `EPI_CARDS` (3 cartelas Calçado/Camisa/Calça, ícone+emoji, acento sky/emerald/amber, classes Tailwind LITERAIS); faixa FC topo; CHIPS tocáveis que alternam + "Limpar" + resumo em pills. `Select`/`TAMANHO_NONE` da Rev. 2855 REMOVIDOS; persistência inalterada. ZERO ALTER/DROP/DELETE; ZERO schema; só UI. Detalhe: `shared/changelog.ts`.

- **Rev. 2855** — CADASTRO DO COLABORADOR — TAMANHOS DE EPI/UNIFORME VIRAM ABA PRÓPRIA COM LISTAS PRONTAS (DROPDOWN), SEM DIGITAÇÃO LIVRE. FEITO (`Colaboradores.tsx`, SÓ frontend): NOVA ABA "🦺 Uniforme / EPI" (entre Profissional e Bancário); 3 inputs de texto viraram `Select` com LISTAS PRONTAS module-level (`TAMANHOS_CALCADO` 33–48, `TAMANHOS_CAMISA` PP…EXG, `TAMANHOS_CALCA` 36–58 par) + "— Não informado —" (sentinel `TAMANHO_NONE`→""). SEM schema/backend: colunas/whitelist da Rev. 2854 intactos. ZERO ALTER/DROP/DELETE; só UI. Detalhe: `shared/changelog.ts`.

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
