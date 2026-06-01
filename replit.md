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


- **Rev. 2669** — **COTAÇÕES (`/compras/cotacoes` → aba "Mapa de Cotação") · AO CLICAR/DIGITAR NO CAMPO DE PREÇO (OU QTD) DE UM FORNECEDOR, A TELA PARA DE "SUBIR O CURSOR" / VOLTAR PRO TOPO A CADA TECLA — FOCO E SCROLL PRESERVADOS.** Pedido (usuário, vídeo WhatsApp_Video_2026-05-29_at_08.17.30): no mapa comparativo, ao digitar no "Preço Unit." de um fornecedor a página dava um pulo pro topo a cada caractere (input perdia foco, scroll voltava pro cabeçalho), inviabilizando o preenchimento. Causa-raiz (SÓ CLIENT/UI; regressão dos commits "fullscreen mode" do mapa): o detalhe era envolvido por `const Wrapper = fullscreenMapa ? ({children})=><div .../> : ({children})=><DashboardLayout/>` DEFINIDO DENTRO do render de `Cotacoes` → função NOVA a cada render → React vê "tipo" diferente e DESMONTA+REMONTA toda a subárvore; cada tecla (`setEditPrecos`/`setEditQtds` → re-render) recriava o container `overflow-auto` (resetando `scrollTop`=0) e removia o `<input>` focado do DOM. Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER; R-001/R-007/R-010): `client/src/pages/compras/Cotacoes.tsx` — extrai o wrapper p/ componente de ESCOPO DE MÓDULO `DetalheWrapper({fullscreen,children})` (referência estável); render usa `<DetalheWrapper fullscreen={fullscreenMapa}>`. Como `fullscreenMapa` não muda ao digitar, o React reconcilia em vez de remontar → scroll e foco preservados (toggle real de aba ainda remonta, esperado). esbuild `Cotacoes.tsx` EXIT 0 (`pnpm build`/`tsc` estouram OOM). Detalhe: `shared/changelog.ts`.
- **Rev. 2668** — **EQUIPAMENTOS (`/equipamentos`) · O CADASTRO DE FERRAMENTA/EQUIPAMENTO PRÓPRIO VOLTA A FUNCIONAR — ANTES, A PARTIR DO 2º ITEM, DAVA O TOAST "NÃO FOI POSSÍVEL GERAR UM PATRIMÔNIO ÚNICO APÓS 8 TENTATIVAS. TENTE NOVAMENTE."** Pedido (usuário, print image_1780312988630): o cadastro de equipamento próprio recusava com esse toast; o 1º item da empresa entrava, do 2º em diante sempre falhava. Causa-raiz: o gerador `proximoCodigoPatrimonio` (server) monta a SQL do `MAX(...substring...'^EQP-(\d+)$')`/`~ '^EQP-\d+$'` dentro de um TEMPLATE LITERAL JS (`sql\`...\``); ali `\d` é escape inválido e é "cozido" para o caractere literal `d`, então a SQL chegava no Postgres como `'^EQP-d+$'` (casa "EQP-ddd…", nunca dígitos) → o `~` não casava nenhum código real, o `MAX` voltava sempre 0 e o gerador produzia sempre `EQP-0001`, colidindo na unique `uq_equip_proprio_company_patrimonio` nas 8 tentativas. (Compras/SC já usavam barra DUPLA `\\d`, que coze correto; só equipamentos tinha barra simples.) Confirmado no Neon (company 60002): regex quebrada casa 0 linhas, `[0-9]` casa as 2 reais (EQP-0001/EQP-0002). Fix (SÓ SERVER, 1 query de LEITURA; ZERO SCHEMA; ZERO CLIENT; R-001/R-007/R-010): `server/routers/equipamentos.ts` (`proximoCodigoPatrimonio`) — troca `\d` por `[0-9]` nas duas regex; sem barra invertida, sobrevive ao template literal e casa dígitos. Agora gera EQP-0003 (único). Retry/unique/padding inalterados. esbuild `equipamentos.ts` EXIT 0 (`pnpm build`/`tsc` estouram OOM). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2667** — PAINEL RH (`/painel-rh`) · O BOTÃO "CONFIRMAR PRORROGAÇÃO" (E EFETIVAR/DESLIGAR) DO CARD "CONTRATOS DE EXPERIÊNCIA" VOLTA A FUNCIONAR — ANTES O MODAL FICAVA TRAVADO, "NADA ACONTECIA". Causa-raiz: os 3 botões enviavam `companyId: companyId!`, `undefined` no modo MULTI-EMPRESA → mutation tRPC falhava na validação `z.number()`; sem `onError`, erro SILENCIOSO. Fix (SERVER aditivo só LEITURA + CLIENT/UI; ZERO SCHEMA): SERVER `homeData.ts` carrega `companyId` por experiência; CLIENT `PainelRH.tsx` envia `(expAction.emp.companyId ?? companyId)!` + `onError`/`onSuccess` com `toast`. Detalhe: `shared/changelog.ts`.

- **Rev. 2666** — FÉRIAS (`/ferias`) · O FILTRO DE STATUS PASSA A PERMITIR SELECIONAR VÁRIAS OPÇÕES AO MESMO TEMPO (MULTI-SELEÇÃO / FILTRO PERSONALIZADO) E GANHA "VENCIDA — 1º PERÍODO" E "VENCIDA — 2º PERÍODO OU +". Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): CLIENT `Ferias.tsx` — `statusFilter` vira `string[]` (vazio=todos); query deixa de mandar `status` (busca tudo); filtragem no `useMemo` via `matchStatusFiltro` (OR entre marcados); `STATUS_OPCOES` ganha compostos "vencida_1"/"vencida_2"; dropdown→`Popover` com checkboxes; cards-atalho/`filtrosAtivos`/"Limpar" usam o array. Detalhe: `shared/changelog.ts`.

- **Rev. 2665** — PAINEL RH (`/painel-rh`) · CARD "FÉRIAS — PERÍODO AQUISITIVO": A FRASE PARA DE DAR A IMPRESSÃO DE "FÉRIAS VENCIDAS" — DEIXA CLARO QUE É O FUNCIONÁRIO COMPLETANDO MAIS UM ANO DE EMPRESA E ABRINDO UM NOVO PERÍODO DE FÉRIAS, NÃO PENDÊNCIA/ATRASO. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): CLIENT `PainelRH.tsx` em 5 pontos do dado `feriasAlerta` (card expandido/compacto, sino de alertas, KPI e badge da seção) — frases/badges reescritas de "vencer/vencido" para "abrir o Nº período". Cálculo/cores/link `/ferias` inalterados. Detalhe: `shared/changelog.ts`.

- **Rev. 2664** — CONTRATO DE EXPERIÊNCIA (gerado em `/colaboradores`) · O TÉRMINO IMPRESSO NO CONTRATO PARA DE FICAR 1 DIA À FRENTE — PASSA A SEGUIR A REGRA CLT (DIA DO INÍCIO CONTA COMO DIA 1), IGUAL AO PAINEL RH. Causa-raiz: o gerador do contrato em `Colaboradores.tsx` lia os valores GRAVADOS `experienciaFim1`/`experienciaFim2` (cadastros pré-Rev. 2500 sem o `−1`), enquanto o Painel RH RECALCULA. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): helper `calcFimExp(base, dias, fallback)` faz `inicio + dias − 1` a partir de `experienciaInicio || dataAdmissao`; `fim1`/`fim2` do contrato passam a vir dele. Validação: Lilian → fim1 01/07/2026 ✓, fim2 15/08/2026 ✓. Detalhe: `shared/changelog.ts`.

- **Rev. 2663** — PAINEL RH (`/painel-rh`) · CONTRATOS DE EXPERIÊNCIA: AS DATAS DE FIM (1º/2º PERÍODO) FICAM MAIORES E SURGE UM BANNER DE "LEMBRETE" PARA RH/USUÁRIO MASTER 5 DIAS ANTES DE QUALQUER CONTRATO VENCER. Dados já existiam no SERVER (`homeData.experiencias`: `fim1`/`fim2`/`status`/`diasRestantes`, este último já contra o FIM RELEVANTE → cobre ambos os períodos). Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER; R-001/R-007/R-010): CLIENT `PainelRH.tsx` (card "Contratos de Experiência", gated por `canSeeExperiencia`) — datas maiores + BANNER vermelho pulsante (`Bell`) listando contratos com `diasRestantes` entre 0 e 5. Detalhe: `shared/changelog.ts`.

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
