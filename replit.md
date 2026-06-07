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

- **Rev. 2869** — **COLETA DE CAMPO (RH) — CABEÇALHO GANHA BOTÕES "VOLTAR" E "FECHAR" (BARRA LATERAL MANTIDA INTACTA).** Pedido: "Mantenha a barra de comando lateral e quero um botão de voltar e fechar a tela" (IMG_1687 = tela interna sem navegação própria no topo). FEITO (SÓ frontend `ColetaCampo.tsx`): no cabeçalho navy FC, bloco de título virou `flex items-start` (texto em `flex-1`) + grupo de ações à direita (`shrink-0`) com 2 botões translúcidos (`bg-white/15 hover:bg-white/25`): "Voltar" (`ArrowLeft`) → `window.history.back()` (fallback "/"); "Fechar" (`X`) → navega "/" via `useLocation` do wouter. Labels `hidden sm:inline` (só ícone no mobile). BARRA LATERAL (DashboardLayout) preservada — nada na navegação global tocado. ZERO ALTER/DROP/DELETE; ZERO schema; ZERO backend. Detalhe: `shared/changelog.ts`.
- **Rev. 2868** — **COLETA DE CAMPO (RH) — O ADM MASTER PODE EDITAR OU EXCLUIR UM LINK DE COLETA (ALÉM DE COPIAR / QR / DESATIVAR).** Pedido: "O Adm master precisa poder editar ou excluir a coleta de campo" (IMG_1686 = cards de link só tinham Copiar/QR/Desativar). FEITO: BACKEND (`server/routers/coletaRh.ts`) ganha `editarSessao` (título e/ou grupos; obra/token fixos) e `excluirSessao` (SOFT-DELETE), ambos com `assertColetaCompanyAccess` (anti-IDOR) + NOVO `assertColetaAdmin` (só admin/admin_master). EXCLUIR = soft-delete (R-001/R-007/R-010, JAMAIS DELETE físico): marca `deleted_at`+`ativo=0`; some das listagens (`listarSessoes`), não é reaproveitado em `criarSessoesTodas` e é invalidado no público (`dadosSessao` E `enviarResposta` barram `deletedAt`); respostas enviadas permanecem. SCHEMA: NOVA coluna `coleta_rh_sessoes.deleted_at` (TIMESTAMP) + self-heal `[SyncSchema+]` aditivo. FRONTEND (`ColetaCampo.tsx`): botões "Editar"/"Excluir" (Dialogs) nos cards, SÓ p/ `isAdminMaster`. ZERO ALTER/DROP/DELETE (schema só aditivo via IF NOT EXISTS). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2867** — COLETA DE CAMPO (RH) — NA PÁGINA PÚBLICA, QUEM JÁ FOI COLETADO SAI DA LISTA; FICAM SÓ OS QUE FALTAM. FEITO (SÓ frontend `ColetaCampoPublica.tsx`): "coletado" = resposta `pendente`/`aprovada` → SAEM da lista; ficam só os que FALTAM (sem envio OU `rejeitada`/refazer). Filtro client-side sobre o `jaEnviado` do `dadosSessao`; `refetch` pós-envio some o card. NOVO contador "N já coletado(s) · faltam M"; empty-state contextual. ZERO ALTER/DROP/DELETE; ZERO schema; ZERO backend. Detalhe: `shared/changelog.ts`.

- **Rev. 2866** — COLETA DE CAMPO (RH) — LAYOUT RESPONSIVO (CELULAR / TABLET / PC) NAS DUAS TELAS (LINK PÚBLICO + INTERNA DO RH). FEITO (SÓ frontend): PÚBLICA (`ColetaCampoPublica.tsx`) → container escala `max-w-md sm:max-w-2xl lg:max-w-4xl`; LISTA virou GRADE (`grid sm:grid-cols-2 lg:grid-cols-3`); FORMULÁRIO `grid gap-4 lg:grid-cols-2`. INTERNA (`ColetaCampo.tsx`) → abas `overflow-x-auto`; botões "Gerar/Copiar todos" `w-full sm:w-auto`; chips `flex-wrap`; ações `flex-wrap shrink-0`. ZERO ALTER/DROP/DELETE; ZERO schema; ZERO backend. Detalhe: `shared/changelog.ts`.

- **Rev. 2865** — COLETA DE CAMPO (RH) — ESCOLHER, ANTES DE GERAR O LINK, QUAIS INFORMAÇÕES O AUXILIAR VAI COLETAR. Escolha por GRUPO (5: `foto`/`epi`/`contato`/`emergencia`/`endereco`), persistida em `coleta_rh_sessoes.campos_json` (NULL/ausente = TODOS, compat) + self-heal `[SyncSchema+]`. FONTE ÚNICA `shared/coletaCampos.ts`. BACKEND (`coletaRh.ts`): `criarSessao`/`criarSessoesTodas` aceitam `grupos[]`; `dadosSessao`/`listarSessoes` devolvem `grupos`; `enviarResposta` aplica whitelist + gate da foto server-side. FRONTEND: seletor de chips (interno) + render condicional (público). ZERO ALTER/DROP/DELETE; schema só aditivo. Detalhe: `shared/changelog.ts`.

- **Rev. 2864** — CONTROLE DE REVISÕES (`/revisoes`) — DEDUPLICAÇÃO NA LEITURA (CADA REVISÃO 1x) + RE-SYNC DAS REVISÕES RECENTES. `server/db.ts` (`getRevisions`) DEDUPLICA por `version` (mantém maior `id`; `ORDER BY version DESC, id DESC` + `Set`) — NÃO-DESTRUTIVO (zero ALTER/DELETE/UNIQUE); + RESTART p/ o sync de startup registrar versões faltantes e realinhar o badge. RESSALVA: gaps históricos permanecem. ZERO ALTER/DROP/DELETE; ZERO schema; só backend + restart. Detalhe: `shared/changelog.ts`.

- **Rev. 2863** — DRE (`/financeiro/dre`) — "ANÁLISE INTELIGENTE" GANHA BARRA DE PROGRESSO 0→100% (EVOLUÇÃO VISÍVEL DA IA), NO LUGAR DO "ANALISANDO..." PARADO. FEITO (`client/src/pages/financeiro/FinanceiroDRE.tsx`, SÓ frontend): NOVO estado `iaProgresso` (0–100) + 4 FASES (`IA_FASES`) animadas por `setInterval` (teto 95% em `isPending`, completa 100% em `isSuccess`, zera em `isError`); card laranja com `Sparkles`, % grande, barra gradiente + checklist; botão "Analisando… NN%". ZERO ALTER/DROP/DELETE; ZERO schema; ZERO backend. Detalhe: `shared/changelog.ts`.

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
