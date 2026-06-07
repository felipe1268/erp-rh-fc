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

- **Rev. 2822** — **COMPRAS · RESERVAS PREVENTIVAS — LIMPEZA AUTOMÁTICA DE RESERVAS ÓRFÃS (COTAÇÃO INEXISTENTE).** Pergunta/pedido (usuário, vendo linhas com id interno `#253`/`#272`/`#275`...): "Tem cotações que não existem, por quê? Faça um limpa e valide só as que fazem sentido." DIAGNÓSTICO (Neon real): das 59 reservas ATIVAS, 12 eram ÓRFÃS — a cotação foi EXCLUÍDA mas a reserva ficou presa em "ativa" (por isso a Rev. 2821 mostrava o fallback `#<cotacaoId>`); 47 eram legítimas (cotação existente pendente/aprovada sem OC). CAUSA-RAIZ: órfãs criadas antes dos ganchos de liberação por exclusão de cotação (ou por caminho de exclusão que não as soltou). O QUE FOI FEITO (`server/routers/compras.ts`, só lógica/leitura): (1) NOVO `_autoLiberarReservasOrfas(companyId)` — descobre os cotacaoIds distintos das reservas ativas, consulta `comprasCotacoes` (inArray+companyId) e libera (via `_liberarReservasDaCotacao`, acao "liberada") as que não existem mais; idempotente, cobre todo o backlog; (2) NOVO wrapper `_autoSanearReservas` roda as DUAS auto-baixas (OC já gerada — Rev. 2820 — + órfãs) em try/catch; (3) os 3 self-heals (`_statusTravamentoCompras`, `getSaldosRealocacaoGeral`, `listarReservasAtivas`) passaram a chamar o wrapper → órfãs somem ao abrir a tela. RESSALVA: libera (status "liberada"), NUNCA deleta; 47 legítimas preservadas. ZERO ALTER/DROP/DELETE; ZERO schema novo. Validação: esbuild OK; Neon confirmou as 12 órfãs-alvo. Detalhe: `shared/changelog.ts`.
- **Rev. 2821** — **COMPRAS · RESERVAS PREVENTIVAS — Nº DA COTAÇÃO CORRETO + CLICAR PRA ABRIR A COTAÇÃO.** Pedido (usuário, sobre a tela "Realocação de Verba → Reservas Preventivas em Andamento"): "Quero poder clicar e ver a cotação, e o número da cotação deve ser o correto." A coluna "Cotação" exibia o ID INTERNO do registro (`#249`, `#253`...), NÃO clicável, e o número não batia com o Nº VISÍVEL (COT-AAAA-NNNN) do resto do módulo. O QUE FOI FEITO (só leitura/UI): (1) BACKEND `listarReservasAtivas` (`server/routers/compras.ts`) resolve o Nº VISÍVEL da cotação em LOTE (`inArray` sobre `comprasCotacoes` filtrando por `companyId` + ids; `Map<id,numeroCotacao>`) e devolve o novo campo `numeroCotacao` (null se a cotação sumiu); mantém `cotacaoId` pra navegar; (2) FRONTEND (`client/src/pages/compras/Realocacao.tsx`) a célula "Cotação" agora mostra `formatNumeroCotacaoDisplay(numeroCotacao)` (fallback `#<cotacaoId>`), ficou clicável (`cursor-pointer` + hover underline + `title="Abrir cotação"`) e navega via wouter `useLocation` pra `/compras/cotacoes?destaque=<cotacaoId>` — reaproveitando o mecanismo da tela de Cotações que lê `?destaque=<id>` no mount e abre o modal de detalhe; o modal "Estender" também passou a exibir o Nº correto. RESSALVA: só UI/navegação + 1 batch-read; nenhuma mudança de regra das reservas. ZERO ALTER/DROP/DELETE; ZERO schema novo; ZERO mutation. Validação: esbuild OK. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2820** — COMPRAS · REALOCAÇÃO/RESERVAS PREVENTIVAS — BAIXA AUTOMÁTICA DA RESERVA QUANDO A COTAÇÃO JÁ TEM OC GERADA. As rotas que GERAM a OC (`criarOrdemDeCotacao`, `criarOCsParciais`) não liberavam a reserva → ela vencia em 7d e entupia a lista. NOVO `_autoLiberarReservasComOcGerada(companyId)` cruza reservas ATIVAS com `comprasOrdens` (status != 'cancelada') e libera via `_liberarReservasDaCotacao` (acao "consumida"); auto-cura nos 3 self-heals + baixa DIRETA na geração da OC. Decisão do usuário: liberar assim que QUALQUER OC for gerada. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2819** — COMPRAS · PAINEL FD — LANÇAMENTOS FD AGORA ABREM A OC AO CLICAR. As tabelas de "Lançamentos de FD (OCs)" (visão "Todas as obras" e obra específica) em `PainelFd.tsx` ficaram clicáveis (`cursor-pointer` + hover indigo + `title="Abrir OC"`); ao clicar navega para `/compras/ordens?destaque=<oc.id>`, reaproveitando o mecanismo da tela de Ordens que lê `?destaque=<id>` no mount; `e.stopPropagation()` no botão "PDF". Só UI/navegação. ZERO ALTER/DROP/DELETE; ZERO backend. Detalhe: `shared/changelog.ts`.

- **Rev. 2818** — COMPRAS · PAINEL FD: REDESIGN COMPLETO + FIX "FD REALIZADA NÃO APARECE". CAUSA-RAIZ: o "Utilizado" só somava `fd_valor` de OCs `fd_cliente`, mas as OCs FD da REVTE são `fd_fc` e `fd_valor` é quase sempre NULL (35/37 no Neon). REGRA NOVA: valorEfetivo de uma OC FD = `fd_valor`>0 ? `fd_valor` : `total`; "Utilizado" = soma do valorEfetivo de TODAS as modalidades FD (fd_cliente/fd_fc/fd_terceiro). `getSaldoFd`/`getSaldoFdTodasObras` trazem `total`+`criadoEm`; `PainelFd.tsx` redesenhado em ABAS (Itens do FD / Lançamentos FD / Histórico) com KPIs sempre visíveis. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2817** — COMPRAS · PAINEL FD: HOTFIX FINAL (SEGUNDO BUG, "AINDA VAZIO" APÓS A REV. 2816) + NOVA VISÃO "TODAS AS OBRAS". `getSaldoFd` resolvia o orçamento com SQL cru referenciando `obras.company_id`/`orcamento_id` (inexistentes no Neon — colunas reais `companyId`; vínculo vive em `orcamentos.obraId`) → lançava em runtime p/ TODAS as obras. FIX: resolve orçamento via Drizzle em `orcamentos`; NOVO endpoint `getSaldoFdTodasObras` agrega por obra + consolidado; `PainelFd.tsx` ganha "Todas as obras". ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2816** — COMPRAS · PAINEL FD: HOTFIX (CONTINUAÇÃO 2814/2815) — PAINEL CONTINUAVA TOTALMENTE VAZIO (REVTE/OC-2026-339) porque `getSaldoFd` selecionava `comprasOrdens.descricao` (coluna inexistente; o campo livre é `observacoes`) → `db.select` LANÇAVA em runtime p/ TODAS as obras. FIX: select usa `observacoes`; payload mantém a chave `descricao`. (Necessário mas insuficiente — ver Rev. 2817/2818.) ZERO ALTER/DROP/DELETE; ZERO front. Detalhe: `shared/changelog.ts`.

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
