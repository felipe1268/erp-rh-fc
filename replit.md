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


- **Rev. 2682** — **COLABORADORES (`/colaboradores` → ficha → "Isenção de Controle de Jornada (Art. 62 CLT)") · O "TERMO FORMAL DE CIÊNCIA E ANUÊNCIA" (TERMO DE ISENÇÃO ART. 62) AGORA PODE SER ASSINADO ONLINE PELO FCSIGN — MESMOS MEIOS/CRITÉRIOS DO CONTRATO DE EXPERIÊNCIA. "GERAR / IMPRIMIR TERMO" E "UPLOAD DO TERMO ASSINADO" SEGUEM IGUAIS.** Pedido (usuário, print IMG_1488): assinar online o termo Art. 62 seguindo os meios/critérios do Contrato de Experiência. Diagnóstico: o fluxo FCSign já é genérico no server (`signatures.create` aceita `tipo` livre, dedup por `employeeId+tipo`, roles `empregado/empregador/testemunha_1|2`, `FCSignSendDialog`/`getForEmployeeTipo`/`adminDelete` agnósticos). Faltava gerar o HTML do termo como string com placeholders `<!--FCSIGN:SIG:{role}-->` e generalizar o painel. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/Colaboradores.tsx` — `imprimirTermoArt62` refatorado em `buildTermoArt62(forFcsign)` (fonte única: impressão E FCSign); corpo passa a usar SÓ estilos INLINE (sem `<style>` global, que VAZARIA na tela `/assinar` via DOMPurify); slots de 50px c/ placeholders nas linhas de assinatura; novo `validarTermoArt62()`; painel FCSign plugado na seção (tipo `termo_art62`) reusando o `FCSignSendDialog`. `client/src/components/FCSignContratoExperienciaPanel.tsx` — generalizado c/ props opcionais `tipo` (default `contrato_experiencia`) + `docLabel` (default `Contrato de Experiência`), sem quebrar o contrato. esbuild EXIT 0. Detalhe: `shared/changelog.ts`.
- **Rev. 2681** — **COLABORADORES (`/colaboradores`) · O RAIO-X DO FUNCIONÁRIO (ABERTO AO CLICAR NO NOME/FOTO) DEIXA DE QUEBRAR O LAYOUT EM TABLET/iOS — ABRE EM FULLSCREEN DE VERDADE (COBRINDO TUDO), COM BOTÃO DE FECHAR, SEM A LISTA VAZANDO POR BAIXO NEM CONTEÚDO EMPURRADO PRO FIM.** Pedido (usuário, prints IMG_1486/1487, iPad Safari): "abrir o raiox tá com bug.. deixa fullscreen com botão de fechar sem bugs de layout". Causa-raiz: `RaioXFuncionario` é overlay `fixed inset-0` renderizado inline na árvore da página; a regra GLOBAL `*:not([class*="overflow-"]):has(> table){overflow-x:auto}` (Rev. 2177, `index.css`) torna pais de `<table>` scroll-containers, e no iOS Safari `position:fixed` fica PRESO a ancestral com overflow scrollável (vira ~absolute) em vez de ancorar no viewport → modal confinado, não cobria a tela. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/components/RaioXFuncionario.tsx` — overlay passa a renderizar via React Portal `createPortal(<div fixed inset-0 .../>, document.body)`, escapando de TODOS os ancestrais (overflow/transform/stacking). Zero mudança de markup/estilo/botões de fechar/scroll-lock/ESC/lightbox. Import add `createPortal`. esbuild EXIT 0. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2680** — FUNCIONÁRIOS TERCEIROS (`/funcionarios-terceiros`) · AGORA DÁ PRA CLICAR NO FUNCIONÁRIO (NOME/CARD OU BOTÃO "RAIO-X") E VER UM RAIO-X COMPLETO READ-ONLY COM TODA A DOCUMENTAÇÃO — SEM PRECISAR ENTRAR NO "EDITAR". Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/terceiros/FuncionariosTerceiros.tsx` — helper `getSecoesTerceiro()` (fonte única editor+Raio-X); novo `RaioXTerceiroDialog` (FullScreenDialog read-only) com cabeçalho + Status de Integração + links "Ver documento"; abertura por clique no nome ou botão "Raio-X" (Eye); "Editar" faz ponte pro `openEdit`. Detalhe: `shared/changelog.ts`.

- **Rev. 2679** — CONTROLE DE DOCUMENTOS (`/controle-documentos` → aba "ASO") · A LISTA DE ASOs PASSA A SER AGRUPADA POR FUNCIONÁRIO: O EXAME VIGENTE EM DESTAQUE E OS ANTERIORES (SUBSTITUÍDOS) VIRAM UM "HISTÓRICO" RECOLHÍVEL — EM VEZ DE REPETIR O MESMO FUNCIONÁRIO VÁRIAS VEZES. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/ControleDocumentos.tsx` — nova memo `groupedAso` (agrupa `filteredAso` por `employeeId` em `{atuais, historicos}` via `isHistorico`), estado `expandedAsoEmps`/`toggleAsoEmp`, `tbody` itera grupos com helper `renderAsoRow`; última linha "atual" ganha botão "Ver histórico (N)"/"Ocultar". Imports add `ChevronDown`/`ChevronRight` + `Fragment`. Detalhe: `shared/changelog.ts`.

- **Rev. 2678** — CONTROLE DE DOCUMENTOS (`/controle-documentos`: ASOs, Treinamentos, Atestados, Advertências, Painel de Validade, cards) · FUNCIONÁRIOS DESLIGADOS (Desligado/Lista_Negra/Inativo) DEIXAM DE ENTRAR NO CONTROLE DE DOCUMENTOS — LISTAS, CARDS E PAINEL DE VALIDADE CONTAM/EXIBEM SÓ VÍNCULO ATIVO. Fix (SÓ SERVER; ZERO SCHEMA/CLIENT): `server/routers/controleDocumentos.ts` — factory `empNaoDesligado()` (`status NOT IN (...)`, régua de `server/db.ts`) em list/resumo/treinVencidos/treinAVencer/asosVencidos/asosAVencer/painelValidade; `semASO` já era `= Ativo`. Detalhe: `shared/changelog.ts`.

- **Rev. 2677** — FUNÇÕES (`/funcoes` → "Nova Função") · O BOTÃO "GERAR COM IA" (DESCRIÇÃO + ORDEM DE SERVIÇO NR-1) DEIXA DE DAR "TIMEOUT: A IA DEMOROU MAIS DE 90 SEGUNDOS" — A GERAÇÃO PASSA A USAR O CAMINHO RÁPIDO (GEMINI 2.5 FLASH, thinkingBudget=0). Fix (SÓ SERVER; ZERO SCHEMA/CLIENT): `server/routers/goldenRules.ts` — `generateJobDescription` e `generateBatchJobDescriptions` passam `fast: true` (Claude/Gemini lento como fallback), prompts explicitam o JSON `{descricao, ordemServico}`. Detalhe: `shared/changelog.ts`.

- **Rev. 2676** — FUNÇÕES (`/funcoes` → "Nova Função", autocomplete da base CBO) · A BUSCA DA BASE CBO PASSA A RANKEAR OS RESULTADOS (PREFIXO > INÍCIO DE PALAVRA > TRECHO > CÓDIGO) E A MOSTRAR ATÉ 40, ENTÃO "ELETRICISTA" E DEMAIS PROFISSÕES OPERACIONAIS VOLTAM A APARECER. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER; `cbo.json` intacto): `client/src/pages/Funcoes.tsx` — `CboAutocomplete.filtered` PONTUA cada item (0 prefixo > 1 começo de palavra `\b` > 2 trecho > 3 código), ordena por score + `desc.length`, `slice(0,40)`, termo normalizado por `removeAccents` + regex escapado. Detalhe: `shared/changelog.ts`.



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
