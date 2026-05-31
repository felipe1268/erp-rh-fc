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


- **Rev. 2634** — **RH & DP · "ANÁLISE DE EXPERIÊNCIA" VIRA TELA FULL-SCREEN ALTAMENTE MODERNA E RESPONSIVA, COM INDICADORES CLICÁVEIS QUE SALTAM DIRETO PRO DETALHE (RASTREIO 1-CLIQUE).** Pedido (usuário): "Quero tela full screen altamente moderna com todos os indicadores responsivos e de fácil rastreio das informações que ele mostrar." Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/components/AnaliseExperiencia.tsx` reescrito mantendo EXATAMENTE os mesmos bindings (`employees.analiseExperiencia`) e props. `<DialogContent resizable={false} showCloseButton={false}>` agora abre full-screen (`left-0 top-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none p-0`, grid `grid-rows-[auto_1fr]` = header fixo + corpo rolável). HEADER em gradiente institucional (#1B2A4A→#243860) com avatar/nome/pill do veredito + botão fechar próprio. HERO: card grande do veredito (gauge maior + barra de progresso do período colorida pelo nível) + card "Por que esta recomendação". KPIs em grade responsiva 2/3/6 (Assiduidade, Faltas, Atrasos, Advertências, Atestados, Acidentes) com tom por severidade e CLICÁVEIS → `scrollIntoView` suave pra seção (`sec-cartao`/`sec-faltas`/`sec-atrasos`/`sec-advertencias`/`sec-atestados`/`sec-acidentes`) via ref do corpo. Período/avisos/critério/tabela do cartão (cabeçalho+zebra) preservados; detalhes em grid 2-col no desktop; `Section` ganha `id`+`scroll-mt-4`. Validado: esbuild transform-check limpo (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2633** — **PLANEJAMENTO · "% PREVISTO" GANHA MODO MANUAL: NOVA ABA "PREVISTO" ONDE O ENGENHEIRO SOBE 1 XML POR SEMANA E O ERP LÊ A COLUNA "% CONCLUÍDA" (PercentComplete) DA RAIZ E DE CADA ATIVIDADE COMO O VALOR PREVISTO — SEM CÁLCULO PRÓPRIO. INTERRUPTOR GLOBAL MOTOR/MANUAL NOS CRITÉRIOS DO SISTEMA (POR EMPRESA); EM MODO MANUAL O MOTOR (CAMINHO B) NÃO SOBRESCREVE A CURVA.** Pedido (usuário, aprovado): "Quero FORNECER o % Previsto em vez de o ERP calcular — uma aba onde subo 1 XML/semana, lê a coluna % Concluída por atividade e da raiz; interruptor global Manual/Motor nos Critérios." Impl. ADITIVA (R-001/R-007/R-010 — só ADD COLUMN IF NOT EXISTS): SCHEMA `oc_number_config.previsto_fonte` (default 'motor') + `planejamento_projetos.previsto_manual_json` (`drizzle/schema.ts` + guardas em `server/_core/index.ts`). TOGGLE: `purchaseRouter.salvarConfigOC` aceita `previstoFonte`; client `PlanejamentoConfigSection.tsx` (select Motor/Manual) em `Configuracoes.tsx`. BUILDER+MUTATIONS em `server/routers/planejamento.ts`: `regenerarPrevistoManual` monta o MESMO grid de semanas do motor (cutoffs do diaCorte sobre o envelope da baseline; fallback = datas dos uploads), lê o JSON cru e grava `previsto_semanas_json` em DEGRAU CUMULATIVO com marcador `fonte:"manual"`; `salvarPrevistoManualSemana`/`limparPrevistoManualSemana`/`getPrevistoManual`. GATE: `salvarAtividades` e o self-heal do `getProjeto` respeitam o interruptor e RECONCILIAM a curva (compara marcador `fonte` vs fonte global → rebuild lazy ao alternar; curvas antigas sem marcador = "motor", zero regressão). ABA: `AbaPrevistoManual.tsx` (novo) + tab em `PlanejamentoDetalhe.tsx`; `parseMSProjectFull` agora expõe `realizadoMspRaiz`. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2632** — PLANEJAMENTO · IMPORTAÇÃO DE CRONOGRAMA · AUTO-COMPLETAR FERIADOS MÓVEIS NACIONAIS (CARNAVAL, SEXTA-FEIRA SANTA, CORPUS CHRISTI): QUANDO FALTAM NO CALENDÁRIO DO XML, O ERP CALCULA AS DATAS A PARTIR DA PÁSCOA, INJETA NO CÁLCULO DO "% PREVISTO" E AVISA O ENGENHEIRO. Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/pages/planejamento/ImportarCronograma.tsx` — `feriadosMoveisBR(year)` (Páscoa por Meeus/Butcher) + `completarFeriadosMoveisBR(cal,anoIni,anoFim)` ADITIVA injeta em `cal.exceptions` os móveis que faltam e caem em dia útil; chamada em `parseMSProjectFull` ANTES do `calendarioJson` → flui pra curva "% Previsto" (Caminho B). Prova: SEM Corpus Christi = 3/6/10/14/18; COM = 2/6/10/14/17. Detalhe: `shared/changelog.ts`.

- **Rev. 2631** — PLANEJAMENTO · IMPORTAÇÃO DE CRONOGRAMA · ANÁLISE DE INTEGRIDADE PRÉ-UPLOAD: O ERP EXAMINA O XML DO MS PROJECT ANTES DE SUBIR E, SE FALTAR INFORMAÇÃO ESSENCIAL PRO "% PREVISTO" BATER COM O MSP, BLOQUEIA O ENVIO E EXPLICA O QUE FALTA. ARQUIVO COMPLETO GANHA SELO VERDE; PENDÊNCIAS MENORES VIRAM AVISOS ÂMBAR. Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/pages/planejamento/ImportarCronograma.tsx` — `baselineReal` em `TarefaImportada` + função pura `analisarIntegridadeMSP(tarefas,cal,statusDate)→{bloqueios,avisos}` em `parseMSProjectFull`. BLOQUEIA: calendário sem jornada, NENHUMA baseline real, baseline date-only. AVISA: baseline parcial, sem StatusDate, sem feriados. CALIBRAÇÃO: PLN_816 R04 tem 62/1105 folhas sem baseline e a curva bate exato (régua = ENVELOPE) → parcial é AVISO. Detalhe: `shared/changelog.ts`.

- **Rev. 2630** — PLANEJAMENTO · ABA "AVANÇO SEMANAL" · O "% PREVISTO" ACUMULADO (CURVA CAMINHO B) PASSA A SER CALCULADO EXATAMENTE COMO O MS PROJECT A PARTIR DA BASELINE — SEM LER A COLUNA TEXTO6. ALVO CRAVADO PLN_816 R04 = 3/6/10/14/18. Fix SÓ recálculo da curva (ZERO SCHEMA/DESTRUTIVO — só UPDATE da coluna JSON `previsto_semanas_json`; R-001/R-007/R-010): `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB`) — RAIZ deixa de ser média ponderada das folhas e passa a `trunc(unitsElapsed(minStart,semana,maxFinish) ÷ unitsTotal(minStart,maxFinish) × 100)` (baseline do PROJETO INTEIRO em tempo útil minuto-a-minuto, régua da linha-resumo UID=0); POR ATIVIDADE `Math.round`→`Math.trunc` (paridade com `int()` do MSP). Motor `minutosUteisEntre` (shared/diasUteis) aplica feriados+almoço+sexta-curta do `calendarioJson`. Validado: jsdom rodou a fórmula via motor real no XML PLN_816 R04 → 3/6/10/14/18 EXATO. ESCOPO: `previstoMspSnapshot` (Texto6) vira só fallback (curva tem prioridade via `mspReadOnly`/`previstoCurva.raizAt`). Detalhe: `shared/changelog.ts`.

- **Rev. 2629** — PAINEL RH & DP · A SEÇÃO "QUADRO DE PESSOAL" GANHA UM CARD "TOTAL" COM O NÚMERO DE PESSOAS DA EMPRESA (TODOS OS COLABORADORES CADASTRADOS), IGUAL AO QUE JÁ EXISTE NA ABA COLABORADORES. Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/pages/PainelRH.tsx` — na grade "Quadro de Pessoal" adicionado como PRIMEIRO card um `KpiCard title="Total"` (ícone `Users`, cor `blue`) lendo `s.totalFuncionarios` (o MESMO campo de `home.getData.stats`), garantindo paridade com a aba Colaboradores. Card clicável → `/colaboradores?status=Todos`. Grade `lg:grid-cols-5`→`lg:grid-cols-6`. Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2628** — ANÁLISE DE EXPERIÊNCIA · TRANSPARÊNCIA DO CARTÃO DE PONTO: O MODAL "ANÁLISE" AGORA AVISA QUANDO O CARTÃO DE PONTO NÃO FOI IMPORTADO/FECHADO NO PERÍODO (EM VEZ DE EXIBIR "0 FALTAS / 100% ASSIDUIDADE" ENGANOSO), EXPLICA O CRITÉRIO USADO E MOSTRA OS DADOS BRUTOS DO CARTÃO QUE O ERP ANALISOU — TUDO RESPONSIVO. Fix ADITIVO (SOMENTE SELECT/LEITURA; R-001/R-007/R-010). CAUSA-RAIZ: em `employees.analiseExperiencia`, faltas/assiduidade só enxergam `time_records`; sem nenhuma linha (mês não fechado) faltas=0 e assiduidade cai no DEFAULT 100%. Impl.: `server/routers.ts` (novo objeto `cartao` no retorno + `assiduidade.verificada`); `client/src/components/AnaliseExperiencia.tsx` (cards "N/D"+"sem cartão" quando não verificado; banner âmbar; caixa explicando o critério; seção "Cartão de Ponto (dados analisados)" responsiva). Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

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
