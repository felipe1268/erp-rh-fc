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

- **Rev. 2983** — **CADASTRO DE CONTAS BANCÁRIAS — NOVOS CAMPOS "SALDO INICIAL" + "DATA"; SALDO INICIAL CONSIDERADO NO FLUXO DE CAIXA PARA CONCILIAR COM O EXTRATO REAL.** PEDIDO (usuário, 2 msgs): adicionar saldo inicial + data (saldo da conta no dia X em que começaram os lançamentos) no cadastro de contas bancárias, e usar esse saldo no Fluxo de Caixa p/ a conciliação bater com o extrato. CONTEXTO: o Fluxo de Caixa começava o "Saldo Acumulado" do zero → nunca batia com o extrato (que tem saldo de abertura). SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE — REUTILIZA tabela EXISTENTE `financial_opening_balances`, sem coluna/tabela nova nem self-heal): (1) `folhaPagamento.ts` helper `upsertSaldoInicialConta` (UPSERT SEM DELETE, grava autor); `listarContasBancarias` mescla o opening balance por `contaBancariaId` e devolve `saldoInicial`/`saldoInicialData`; `criar`/`atualizarContaBancaria` ganham inputs opcionais + `ctx` e gravam/atualizam o saldo quando há data; (2) `ContasBancarias.tsx` seção "Saldo Inicial" (`MoneyInput` + date) no form + exibição no card (gate: saldo sem data → toast); (3) `FinanceiroFluxoCaixa.tsx` soma `saldoInicialTotal` e o "Saldo Acumulado" parte dele (era `acc=0`) + footnote. RESSALVA: página anual sem carry cross-ano; Conciliação item-a-item inalterada. Detalhe: `shared/changelog.ts`.
- **Rev. 2982** — **PORTAL DO CLIENTE → NPS — MARCAÇÃO INTERNA DO TEMPO QUE CADA AVALIAÇÃO LEVOU PARA SER PREENCHIDA (ABERTURA DO FORMULÁRIO → ENVIO), VISÍVEL SÓ PARA O ADMIN MASTER.** PEDIDO (usuário): "Marque internamente para o Adm master ver, o tempo que cada avaliação demorou para ser feita". CONTEXTO: indicador interno de engajamento/qualidade — avaliação respondida em poucos segundos sugere preenchimento apressado. Dado de auditoria interna, NÃO aparece pro cliente. SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE destrutivo — coluna nova via self-heal `ADD COLUMN IF NOT EXISTS`): (1) `drizzle/schema.ts` nova coluna `tempoRespostaSegundos` (`tempo_resposta_segundos INTEGER`, nullable) em `cliente_avaliacoes`; (2) self-heal em `server/_core/index.ts` garante a coluna; (3) `criarAvaliacao` (`portalExterno.ts`) aceita input opcional clampado 0..86400 e grava no insert — `getDashboardCliente` faz `select()` de todas as colunas, então flui sozinho pro admin; (4) `PortalDashboardCliente.tsx` marca `useRef(Date.now())` na abertura e envia `round((now-inicio)/1000)` (≥1s) no submit; (5) `ClientesPortalAdmin.tsx` helper `fmtDuracao` + selo `Clock` na lista, só quando `isMaster`. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2981** — PORTAL DO CLIENTE → NPS → TELA "OBRIGADO PELA AVALIAÇÃO!" — REMOVIDO O BOTÃO "ENVIAR NOVA AVALIAÇÃO" (cada link é de uso único por período; o botão confundia). FRONT-only, `PortalDashboardCliente.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 2980** — PORTAL DO CLIENTE → NPS → "LINK DE AVALIAÇÃO (SEM LOGIN)" — SOLUÇÃO DEFINITIVA PARA O LINK QUE CHEGAVA TRUNCADO PELO WHATSAPP ("este link não está vinculado a uma obra"): O LINK VIRA UM SHORT-LINK CURTÍSSIMO (`/a/<codigo>`) EM VEZ DO JWT LONGO NA URL. CAUSA-RAIZ: JWT embute obraId/obraNome/gestor/encarregado → URL LONGA (400-600 chars) → detector de links do WhatsApp (iOS) trunca → token cortado → "não vinculado". SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE, tabela NOVA via self-heal): nova `cliente_avaliacao_shortlink` (codigo PK→token); `gerarLinkAvaliacao` retorna `codigo`/`codigos`; endpoint público `cliente.resolverLinkAvaliacao`; rota `/a/:codigo` → `AvaliacaoPublicaCurta.tsx`; admin monta `${origin}/a/<codigo>`. Rota antiga segue válida. Detalhe: `shared/changelog.ts`.

- **Rev. 2979** — PORTAL DO CLIENTE → NPS → "LINK DE AVALIAÇÃO (SEM LOGIN)" → BOTÃO "WHATSAPP" — O LINK QUE CHEGAVA NO WHATSAPP NÃO ERA IGUAL AO LINK COPIÁVEL ("não está vinculado a uma obra"); CORRIGIDO REMOVENDO EMOJI/MARKDOWN DA MENSAGEM E PONDO O URL COMO ÚLTIMA LINHA. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, `ClientesPortalAdmin.tsx`): emoji (pares surrogados UTF-16) e `*markdown*` ANTES do URL desalinham o detector de links do WhatsApp → token truncado; mensagem reescrita em texto PLANO com o URL na ÚLTIMA linha → link compartilhado = link copiável. Detalhe: `shared/changelog.ts`.

- **Rev. 2978** — PORTAL DO CLIENTE → NPS — GARANTIA DEFINITIVA: NUNCA EXISTE UMA AVALIAÇÃO SEM OBRA VINCULADA (obra obrigatória na geração do link, no envio e na UI). SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE, defense-in-depth): `criarAvaliacao` recusa envio sem `obraIdEfetivo`; `gerarLinkAvaliacao` exige `obraId`; admin remove opção "geral" + botão desabilitado sem obra; público remove "geral", seletor obrigatório quando logado, aviso vermelho p/ link público sem obra, gate no `enviarAvaliacao`. Detalhe: `shared/changelog.ts`.

- **Rev. 2977** — PORTAL DO CLIENTE → NPS PÚBLICA → "OBRA AVALIADA" — a trava da obra (e o pré-preenchimento de gestor/encarregado) passa a ser resolvida TAMBÉM pelo token verificado no backend (`jwt.verify`), não só pelo parse base64 do JWT no navegador. SINTOMA: link vinculado à obra abria em "Avaliação geral". SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE): `podeAvaliarEsteMes` devolve `obraId`/`obraNome` do token verificado; `PortalDashboardCliente.tsx` ganha `useMemo obraTravada` = `linkObra` ?? backend. Detalhe: `shared/changelog.ts`.

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
