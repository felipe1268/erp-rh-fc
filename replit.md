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

- **Rev. 3127** — **MEDIÇÃO / "LEVANTAMENTO" (ENGINE COMPARTILHADA CLIENTE×TERCEIRO) · A TELA DEIXOU DE EXIGIR ESPECIFICAMENTE O MÓDULO DE MEDIÇÃO-CLIENTE — AGORA É LIBERADA P/ QUEM TEM O MÓDULO DE MEDIÇÃO (CLIENTE) OU O DE TERCEIROS.** PEDIDO (iPad, build mode, com print): usuária "Kellen Larissa" (perfil Usuário) recebia "Acesso Restrito · Você não tem permissão para acessar esta página" ao abrir `/medicao/17/levantamento/1?origem=terceiro` — "Libere esta função para todos que têm o módulo, quero 100% liberado." CAUSA-RAIZ: em `client/src/App.tsx` a rota `"/medicao/:contratoId/levantamento/:campoId"` usava `<RouteGuard route="/medicao" />`, que exige o MÓDULO DE MEDIÇÃO-CLIENTE; mas o Levantamento é engine COMPARTILHADA cliente×terceiro (`?origem=cliente|terceiro`), então um usuário só-Terceiros (fluxo `origem=terceiro`) caía no "Acesso Restrito". CORREÇÃO (FRONTEND-ONLY; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE): o `RouteGuard` JÁ aceita ARRAY de rotas (`routes.some(r => groupCanAccessRoute(r))`); a rota passou de `route="/medicao"` p/ `route={["/medicao", "/terceiros/medicoes"]}` — libera p/ quem tem Medição (cliente) OU Terceiros. Admin Master/sem-grupo seguem livres; os DADOS continuam protegidos pelos guards de tenancy no backend (IDOR fechados na Rev. 3126), então ampliar o gate de UI não expõe dado de outra empresa. Detalhe: `shared/changelog.ts`.

- **Rev. 3126** — **MEDIÇÃO / "LEVANTAMENTO" (ENGINE COMPARTILHADA CLIENTE×TERCEIRO) · CORRIGIDA A TELA DE ERRO "OCORREU UM ERRO INESPERADO · RENDERED MORE HOOKS THAN DURING THE PREVIOUS RENDER" QUE QUEBRAVA A PÁGINA DE LEVANTAMENTO (EX.: `/medicao/17/levantamento/1?origem=terceiro`).** SINTOMA (iPad, com print): ao abrir o Levantamento, a tela caía no ErrorBoundary com "Rendered more hooks than during the previous render". CAUSA-RAIZ: em `client/src/pages/medicao/MedicaoLevantamento.tsx`, dois `useMemo` (`fotosPorContorno` e `contornoById`) estavam DEPOIS dos early-returns de carregamento (`if (loadingCampo) return` / `if (!campo) return`): no 1º render (carregando) NÃO rodavam, e quando o `campo` chegava o componente passava a chamar 2 hooks A MAIS — violando a Regra dos Hooks (a contagem/ordem tem que ser idêntica em todo render). CORREÇÃO (FRONTEND-ONLY, REORDENAÇÃO; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE): os 2 `useMemo` (e o derivado `const fotos = campo?.fotos ?? []`, agora com optional-chaining) foram MOVIDOS p/ ANTES dos early-returns, junto dos demais hooks de topo. Nenhuma lógica de cálculo/visual mudou — só a POSIÇÃO das declarações. HARDENING DE TENANCY (mesma rev.; superfície Medição-Terceiros que a engine consome): fechadas 2 brechas de IDOR em `server/routers/terceiroContratos.ts` — `listarMedicoes` agora chama `_assertCompanyAccess(ctx.user, input.companyId)` antes da query, e `getMedicao` (recebia só `{id}`) deriva o `companyId` da linha e valida o acesso. Aditivo, ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3125** — **FINANCEIRO / "LANÇAMENTOS" · O CAMPO "OBRA (OPCIONAL)" DO MODAL DE LANÇAMENTO DEIXOU DE SER TEXTO LIVRE E AGORA SUGERE/SELECIONA AS OBRAS ATIVAS DA EMPRESA.** PEDIDO (iPad, build mode, com print): "No nome da obra, precisa aparecer as obras ativas... para seleção." O campo era um `<Input>` de texto puro, exigindo digitar o nome exato (risco de erro/divergência). SOLUÇÃO (FRONTEND-ONLY; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE): em `client/src/pages/financeiro/FinanceiroLancamentos.tsx` adicionada a query `obras.listActive` (`{ companyId }`, tenant-safe) + derivado `obrasOptions` (nomes não-vazios, dedup case-insensitive, ordenado `localeCompare pt-BR`). O `<Input>` ganhou `list="obras-financeiras-datalist"` + `<datalist>` com as obras ATIVAS (mesmo padrão de "Conta/Categoria" e "Fornecedor"), ícone `Building2` e contador "N obras ativas — toque pra selecionar". Continua `datalist` (não `<select>` fechado): escolhe da lista OU digita livre (compat com lançamentos antigos). Estado segue em `form.obraNome` (string); nada muda no schema/payload. Detalhe: `shared/changelog.ts`.

- **Rev. 3124** — FINANCEIRO / "LANÇAMENTOS" · O MODAL "NOVO LANÇAMENTO" (E EDIÇÃO/RECORRÊNCIA) AGORA ABRE EM TELA CHEIA — APROVEITANDO TODA A LARGURA/ALTURA NO LUGAR DO CARD CENTRAL ESTREITO COM SCROLL APERTADO. FRONTEND-ONLY, 1 CLASSNAME + 1 PROP: em `client/src/pages/financeiro/FinanceiroLancamentos.tsx` o `<DialogContent>` virou TELA CHEIA (`max-w-none w-screen h-[100dvh] max-h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none border-0 p-0 overflow-hidden flex flex-col` anulando a centralização base; `100dvh` p/ Safari iOS) + `resizable={false}`. Estrutura interna já era flex-col (só o corpo rola). ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3123** — CONTROLE DE DOCUMENTOS / ABA "MAPEAMENTO" · A LEITURA DE ASOs POR IA AGORA ABRE UM PAINEL DE PROGRESSO FIXO (BARRA 0–100% + EVOLUÇÃO ITEM-A-ITEM) QUE FICA TRAVADO NA TELA ATÉ O USUÁRIO REVISAR/APROVAR CADA LEITURA. Backend READ-ONLY `docs.asos.listPendentesIA` (tenant-safe); runner CLIENT-SIDE `runBatch`/`runLote` chama `lerComIA` 1 ASO por vez (lista de alvos explícita → sem estagnação); overlay `<Dialog>` com `batchLocked` (X some, clique-fora/Escape bloqueados) + flag `awaitingReview` p/ fechar a corrida do refetch; fase "revisão" só libera "Fechar" após Aprovar/Descartar cada extração. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3122** — CONFIGURAÇÕES / "MÓDULOS DO SISTEMA" · O TOGGLE DO MÓDULO DE MEDIÇÃO DO CLIENTE FOI RENOMEADO DE "MEDIÇÃO" PARA "MEDIÇÃO CLIENTE" — AGORA BATE COM O CARD DA HOME E DISTINGUE DO "MEDIÇÃO TERCEIROS". FRONTEND-ONLY, 1 STRING: em `client/src/pages/Configuracoes.tsx` a entrada `medicao` do `MODULE_INFO` teve o `label` trocado de "Medição" → "Medição Cliente" (subtitle e key `medicao` intactos — gating/toggle/navegação inalterados). Puramente cosmético/UX. ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3121** — RAIO-X DO FUNCIONÁRIO / ABA "ASOs" · A "FICHA DO ASO (LEITURA POR IA · REVISADA)" DEIXOU DE SER TEXTO CORRIDO E VIROU TABELAS ESTRUTURADAS (APTIDÕES, RESTRIÇÕES ITEMIZADAS, FATORES DE RISCO POR CATEGORIA) — DADOS GRANULARES PRONTOS PRA LEITURA TABULAR E FUTUROS GRÁFICOS DE PERFIL. 2 parsers puros novos em `client/src/components/RaioXFuncionario.tsx` — `parseRestricoesItens` (1 frase = 1 item; split em ". " sem lookbehind/lookahead p/ não quebrar no iOS) e `parseFatoresRiscoCategorias` (quebra por "Físicos:"/"Químicos:"/etc → `[{categoria,texto}]`; sem rótulo cai em "Geral"). A ficha (tela aba "ASOs" + PDF SST) vira 3 tabelas: Aptidões campo/valor com badges, Restrições itemizada com destaque VERMELHO, e Fatores de risco por Categoria × Fatores. Só com `temIa`; conteúdo IA `esc` (anti-XSS). FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

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
- **Moeda SEMPRE em formato BRL pt-BR (`R$ 100.000,00` — ponto p/ milhar, vírgula p/ centavos).** Tanto na EXIBIÇÃO (usar `formatBRL`) quanto em INPUTS de digitação de valor (usar máscara `maskBRL`/`parseMaskBRL`). Nunca exibir/aceitar o formato cru anglo `100000.00`.
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
