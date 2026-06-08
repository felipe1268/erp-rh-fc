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

- **Rev. 2902** — **COLETA DE CAMPO (RH) — O LINK FECHA SOZINHO E APARECE COMO "CONCLUÍDO" ASSIM QUE TODOS OS FUNCIONÁRIOS ALOCADOS NA OBRA JÁ FORAM COLETADOS.** Pedido (print "Links por Obra"): "Precisa fechar a coleta assim que todos dados forem coletados e aparecer como concluídos." Antes o link ficava "Ativo" pra sempre, mesmo coletados todos os alocados. REGRA: concluída = funcionários DISTINTOS coletados (resposta `pendente` OU `aprovada`; `rejeitada` não conta) cobrem 100% dos funcionários ATIVOS alocados na obra (`obra_funcionarios.is_active=1` ∩ `employees.status='Ativo'`); total=0 nunca conclui. SOLUÇÃO (ADITIVA — ZERO schema/ALTER/DROP/DELETE; só UPDATE de `ativo` já existente): `server/routers/coletaRh.ts` `listarSessoes` conta coletados-distintos + alocados-ativos e expõe `totalAlocados/coletados/concluida` (respostas agora filtram `deleted_at IS NULL`); `enviarResposta` (link público) recomputa após gravar e, se completou, FECHA o link (`ativo=0`) em try/catch best-effort (nunca bloqueia o envio); `client/src/pages/ColetaCampo.tsx` exibe badge azul "Concluído" (prioridade sobre Ativo/Inativo/Expirado) + `coletados/totalAlocados coletado(s)`. Adm ainda pode reativar manualmente. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2901** — **COLETA DE CAMPO (RH) — GERAR / EDITAR / EXCLUIR / DESATIVAR LINKS AGORA É EXCLUSIVO DO ADMINISTRADOR (role `admin`) E DO ADMINISTRADOR MASTER.** Pedido: "Somente o Adm e Adm master poder gerar, ou apagar editar a coleta em campo." Antes qualquer usuário com acesso à empresa gerava/desativava links (procedures só tinham `assertColetaCompanyAccess`); e no front os botões Editar/Excluir estavam atrás de `isAdminMaster`, excluindo o `admin` comum (contra o pedido). SOLUÇÃO (ADITIVA — ZERO schema/ALTER/DROP/DELETE): `server/routers/coletaRh.ts` adiciona `assertColetaAdmin(ctx.user)` (libera admin E admin_master) em `criarSessao`, `criarSessoesTodas` e `desativarSessao` (editar/excluir já tinham); `server/routers.ts` (`getMyPermissions`) passa a expor `isAdmin` (`role==='admin'`); `client/src/contexts/PermissionsContext.tsx` ganha o campo `isAdmin`; `client/src/pages/ColetaCampo.tsx` usa `canManage = isAdmin || isAdminMaster` p/ esconder os cards de criação e os botões Desativar/Editar/Excluir de não-admins (mantém Copiar link/QR + a fila de revisão liberados). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2900** — ASSINATURA ELETRÔNICA (INTEGRASIGN/FcSign) — FIX DE LAYOUT: O BOTÃO "REENVIAR" (E "COPIAR LINK") DA LINHA DE SIGNATÁRIO NÃO VAZA MAIS PARA FORA DO CARD DE DETALHES NO iPad. `client/src/pages/IntegraSignDashboard.tsx` — linha vira responsiva `flex flex-col gap-2 ... sm:flex-row sm:items-center sm:justify-between`; nome ganha `min-w-0`+`break-words`; grupo de ações ganha `flex-wrap shrink-0` (quebra dentro do card em vez de vazar). SÓ CLIENT; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2899** — ASSINATURA ELETRÔNICA (INTEGRASIGN/FcSign) — BOTÕES "EDITAR" E "EXCLUIR" AGORA APARECEM DIRETO EM CADA CARD DA LISTA DE ENVELOPES (ANTES SÓ NO PAINEL DE DETALHES). Cada card da lista ganha botões-ícone Pencil/Trash2 ao lado do chevron com `e.stopPropagation()`; reaproveitam `abrirEdicao`/`setDeleteDialog` (backend soft-delete da Rev. 2898, nenhuma procedure nova). SÓ CLIENT; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2898** — ASSINATURA ELETRÔNICA (INTEGRASIGN) — DASHBOARD AGORA PERMITE EDITAR E EXCLUIR OS ENVELOPES EM QUALQUER STATUS (SOFT-DELETE, ZERO HARD DELETE). Nova coluna `excluidoEm` em `integrasign_envelopes` + self-heal; `excluirEnvelope` vira soft-delete (preserva registro legal/assinaturas), `listarEnvelopes` filtra `isNull(excluidoEm)`; nova `editarEnvelope` (título/descrição em qualquer status, corpo só rascunho); `isNull(excluidoEm)` propagado a todos os reads/mutations + rotas públicas. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2897** — ASSINATURA ELETRÔNICA (INTEGRASIGN) — "BAIXAR CONTRATO ASSINADO" AGORA GERA PDF PROFISSIONAL (LOGO + FAIXA AZUL + TABELA EAP PRESERVADA + REGISTRO DE ASSINATURAS + HASH) NO LUGAR DO `.txt`. Novo `client/src/lib/contratoAssinadoPdf.ts` (jspdf) usado pelos 2 handlers de download em `IntegraSignAssinar.tsx`. SÓ CLIENT; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2896** — ASSINATURA ELETRÔNICA (INTEGRASIGN) — ABRIR O LINK NO iPad/SAFARI NÃO MOSTRA MAIS O ERRO CRÍPTICO "The string did not match the expected pattern."; AGORA EXIBE MENSAGEM CLARA E AS DATAS RENDERIZAM iOS-SAFE. SÓ CLIENT em `client/src/pages/IntegraSignAssinar.tsx`: helper `msgErroLink(err)` troca a DOMException nativa do iOS por texto claro (erros reais do servidor intactos); os `new Date(...).toLocale*` de RENDER sobre `dataAssinatura` trocados pelos helpers iOS-safe `formatDateTime`/`formatDate`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
