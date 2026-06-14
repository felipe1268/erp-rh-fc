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

- **Rev. 3089** — **MEDIÇÃO DE TERCEIROS · REPAGINAÇÃO DA TELA DE DETALHE DO CONTRATO QUANDO ABERTA PELO MÓDULO DEDICADO: LAYOUT ENXUTO E FOCADO NO PROCESSO DE MEDIÇÃO — SOME TODA A GESTÃO DO CONTRATO QUE NÃO FAZ SENTIDO PARA QUEM ESTÁ MEDINDO.** PEDIDO (prints iPad): "repagine a tela… foco no processo de medição, sejam práticos, eliminem o que não faz sentido — layout limpo e fácil preenchimento". Ao clicar "Medir", a tela de detalhe (`/terceiros/contratos/:id`) abria com TODA a pilha de gestão do contrato antes das medições (Admin Master cancelar/excluir, Objeto editável, Vigência editar/recalcular, Critérios + Fluxograma de 6 passos, Acesso ao Portal, Orçamento×Fechado). CAUSA-RAIZ: `ContratoDetalhe.tsx` renderiza a MESMA pilha de cards p/ os 2 módulos; a Rev. 3088 só tratou a aba "Medições". SOLUÇÃO (FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND): quando `emModuloMedicoes` — (1) abre DIRETO na aba "Medições"; (2) esconde Admin Master, Objeto, Vigência, Critérios+Fluxograma, Portal e Orçamento×Fechado; (3) adiciona FAIXA DE CONTEXTO enxuta (objeto 1-linha + "Dia da Medição"); (4) barra de abas remove "Contrato" e põe "Medições" 1ª. Resumo financeiro + barras de progresso mantidos (úteis à medição). Pelo módulo "Terceiros" NADA muda. Arquivo único: `client/src/pages/terceiros/contratos/ContratoDetalhe.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 3088** — **MEDIÇÃO DE TERCEIROS · A ABA "MEDIÇÕES" DO CONTRATO DEIXA DE SER CONFUSA QUANDO ABERTA PELO PRÓPRIO MÓDULO DE MEDIÇÕES: SOME A MENSAGEM CONTRADITÓRIA "ABRIR MÓDULO DE MEDIÇÕES" (O USUÁRIO JÁ ESTÁ NELE) E A EDIÇÃO JÁ VEM LIGADA.** PEDIDO (prints iPad): no módulo "Medição Terceiros", ao clicar "Medir" e cair na aba "Medições" do contrato, aparecia "Espelho só-leitura… Abrir módulo de Medições" — sem sentido, pois o usuário JÁ está no módulo. CAUSA-RAIZ: `MedicoesTab` (`ContratoDetalhe.tsx`) foi desenhada na Rev. 3082 como espelho só-leitura pensando no acesso pelo módulo "Terceiros", mas a MESMA aba é o destino do "Medir" do módulo dedicado (Rev. 3084) — o banner não tinha consciência do MÓDULO ATIVO. SOLUÇÃO (FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND): a tela lê o módulo ativo via `ln()` e calcula `emModuloMedicoes = activeModule === "medicao-terceiros"`, propagado a `MedicoesTab`. Quando em medições: `modoEdicao` inicia LIGADO + banner vira cabeçalho LIMPO laranja ("Medições deste contrato. Gere, edite e acompanhe a aprovação aqui mesmo.") SEM espelho só-leitura, SEM "Abrir módulo de Medições" e SEM toggle. Pelo módulo "Terceiros" o espelho só-leitura + CTA + toggle ficam 100% intactos. Botões "Gerar Medição" do corpo já gateados em `assinado && modoEdicao` (sem duplicar). Confia no menu sticky da Rev. 3087. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3087** — MEDIÇÃO DE TERCEIROS · O PAINEL/MENU FICA FIXO NO MÓDULO: AO CLICAR "MEDIR" (OU ABRIR O DETALHE DO CONTRATO) DENTRO DO MÓDULO "MEDIÇÃO TERCEIROS", A BARRA LATERAL DEIXA DE TROCAR PARA "TERCEIROS". CAUSA: `ModuleContext.tsx` resolvia o módulo só pela rota. SOLUÇÃO (FRONTEND-ONLY): rota AMBÍGUA "sticky" no `useEffect` — `STICKY_AMBIGUOUS = [{ prefix: "/terceiros/contratos", keepIf: ["medicao-terceiros"] }]`; casa prefixo E `activeModule` em `keepIf` → efeito retorna ANTES de trocar. Fluxo pelo "Terceiros" intacto. ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3086** — CONTRATOS DE SERVIÇO (TERCEIROS) · TAG DE ASSINATURA NA LISTA: CADA CONTRATO EXIBE "ASSINADO" (VERDE) × "FALTA ASSINATURA" (ÂMBAR), DERIVADA DA REGRA ADESIVA DO ENVELOPE FCSIGN — NÃO DO `status` BRUTO. BACKEND `server/routers/terceiroContratos.ts` `listarContratos` calcula `assinaturaStatus` em LOTE (`integrasign_envelopes` via inArray) + FE `ContratosList.tsx` (Badge CheckCircle2/Clock). BACKEND READ-ONLY + FRONTEND, ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3085** — MEDIÇÃO DE TERCEIROS · CORREÇÃO DO GATE DA TELA "CONTRATOS ATIVOS PARA MEDIR": O CONTRATO ASSINADO (CT-2026-0006) NÃO APARECIA PORQUE O FILTRO USAVA `status="ativo"` BRUTO (INCONSISTENTE). Gate passa a ser a ASSINATURA CONCLUÍDA (regra adesiva), excluindo só cancelados. `server/routers/terceiroContratos.ts` `listarContratosParaMedicao` (WHERE `notInArray(status,["cancelado","cancelada","rascunho"])`; `notInArray` no import). BACKEND READ-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3084** — MEDIÇÃO DE TERCEIROS · LIMPEZA FINAL DO MENU + A TELA `/terceiros/medicoes` PASSA A LISTAR OS CONTRATOS ATIVOS PRONTOS PARA MEDIR (SÓ APÓS ASSINATURA CONCLUÍDA). `DashboardLayout.tsx` (Medições PJ → barra dedicada; "Contratos de Serviço" removido do menu) + `ModuleContext.tsx` + BACKEND `terceiroContratos.ts` (nova query `listarContratosParaMedicao`, READ-ONLY) + FE `Medicoes.tsx` (bloco "Contratos ativos para medir"). Detalhe: `shared/changelog.ts`.

- **Rev. 3083** — MEDIÇÃO DE TERCEIROS · VIRA MÓDULO DEDICADO COM BARRA DE COMANDO PRÓPRIA: `/terceiros/medicoes` MOSTRA SÓ AS FUNÇÕES DE MEDIÇÃO (NÃO O MENU INTEIRO DO TERCEIROS) + ITEM "MEDIÇÕES" REMOVIDO DO TERCEIROS (DEDUP). FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. `ModuleContext.tsx` (novo `ModuleId` "medicao-terceiros"; `ROUTE_MODULE_MAP`) + `DashboardLayout.tsx` (`menuSectionsMedicaoTerceiros` nos Records exaustivos). Detalhe: `shared/changelog.ts`.

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
