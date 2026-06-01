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


- **Rev. 2671** — **GESTÃO DE DOCUMENTOS (`/gestao-documentos`) · AGORA DÁ PARA EDITAR UM DOCUMENTO (INCLUSIVE O TÍTULO) DEPOIS DO UPLOAD, DIRETO PELA TELA DE DETALHE.** Pedido (usuário, print image_1780331296759): na tela de detalhe do documento (ex.: "POITA-ARQ-000-PE-PL-GRAL-IMP-R02", com "Arquivo Atual"/"Histórico de Revisões"/"Nova Revisão") não havia como editar/corrigir o título depois do upload — só baixar e criar nova revisão; o usuário queria editar e colocar o título de cada um. Causa (SÓ CLIENT/UI): o modal de EDIÇÃO completo já existia (`openEditDoc` → "Editar Documento" com Título*/Disciplina/Tipo/Código/datas/Tags) e o endpoint `gestaoDocumentos.updateDocumento` JÁ ACEITAVA `titulo`, mas o modal de DETALHE não dava acesso a essa edição (só "Anexar arquivo", e apenas quando NÃO havia arquivo). Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER — reusa `openEditDoc` + `updateDocumento`): `client/src/pages/gestaodocumentos/index.tsx` — cabeçalho do "Modal — Detalhe do Documento" ganha botão "Editar" (`Pencil`) ao lado do título que faz `setShowDetailModal(false); openEditDoc(selectedDoc)` e abre o modal já preenchido; cabeçalho reorganizado num flex (título à esquerda c/ truncate, botão à direita). Sem SQL crua/`ALTER`/`DROP` (R-001/R-007/R-010). esbuild `index.tsx` EXIT 0 (`pnpm build`/`tsc` estouram OOM). Detalhe: `shared/changelog.ts`.
- **Rev. 2670** — **GESTÃO DE DOCUMENTOS (`/gestao-documentos` → "Projetos / Documentos Técnicos") · AGORA DÁ PARA APAGAR FICHEIROS (CARDS DE OBRA) EM LOTE, COM SELEÇÃO MÚLTIPLA.** Pedido (usuário, print image_1780330434115): a lista de ficheiros (IGREJA SÃO GERALDO, VITRA, REVTE-CIVIL…) só deixava criar/abrir, não tinha como excluir; o usuário queria apagar fazendo seleção múltipla. Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER — reusa o endpoint `gestaoDocumentos.deleteFicheiro` que JÁ EXISTIA, escopado por `companyId`+`id` com checagem de acesso por obra): `client/src/pages/gestaodocumentos/index.tsx` (view "obras") — botão "Selecionar" liga o MODO DE SELEÇÃO (`selectModeFicheiro`), no qual clicar num card marca/desmarca (`selectedFicheiroIds: Set`) em vez de abrir (card ganha ring/checkbox vermelho; subtítulo vira "N selecionado(s)"); botão "Excluir (N)" abre o `askConfirm` e, ao confirmar, chama `deleteFicheiro` 1×/id sequencialmente, conta sucessos/erros, invalida `listFicheiros`, sai do modo e dá toast; "Cancelar" sai sem apagar. Sem SQL crua/`ALTER`/`DROP` (R-001/R-007/R-010). esbuild `index.tsx` EXIT 0 (`pnpm build`/`tsc` estouram OOM). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2669** — COTAÇÕES (`/compras/cotacoes` → aba "Mapa de Cotação") · AO DIGITAR NO CAMPO DE PREÇO/QTD DE UM FORNECEDOR, A TELA PARA DE "SUBIR O CURSOR"/VOLTAR PRO TOPO A CADA TECLA — FOCO E SCROLL PRESERVADOS. Causa-raiz (SÓ CLIENT/UI; regressão do "fullscreen mode"): o wrapper do detalhe era definido DENTRO do render → função nova a cada render → React DESMONTA+REMONTA a subárvore a cada tecla (reset de scroll + perda de foco). Fix: `client/src/pages/compras/Cotacoes.tsx` extrai `DetalheWrapper` p/ escopo de módulo (referência estável). Detalhe: `shared/changelog.ts`.

- **Rev. 2668** — EQUIPAMENTOS (`/equipamentos`) · O CADASTRO DE FERRAMENTA/EQUIPAMENTO PRÓPRIO VOLTA A FUNCIONAR — ANTES, A PARTIR DO 2º ITEM, DAVA O TOAST "NÃO FOI POSSÍVEL GERAR UM PATRIMÔNIO ÚNICO APÓS 8 TENTATIVAS." Causa-raiz: o gerador `proximoCodigoPatrimonio` (server) montava `~ '^EQP-\d+$'` dentro de TEMPLATE LITERAL JS, onde `\d` é "cozido" pra `d` literal → regex `'^EQP-d+$'` casava 0 dígitos → `MAX`=0 → sempre `EQP-0001`, colidindo na unique nas 8 tentativas. Fix (SÓ SERVER, 1 query LEITURA; ZERO SCHEMA/CLIENT; R-001/R-007/R-010): `server/routers/equipamentos.ts` troca `\d` por `[0-9]` nas duas regex. Detalhe: `shared/changelog.ts`.

- **Rev. 2667** — PAINEL RH (`/painel-rh`) · O BOTÃO "CONFIRMAR PRORROGAÇÃO" (E EFETIVAR/DESLIGAR) DO CARD "CONTRATOS DE EXPERIÊNCIA" VOLTA A FUNCIONAR — ANTES O MODAL FICAVA TRAVADO, "NADA ACONTECIA". Causa-raiz: os 3 botões enviavam `companyId: companyId!`, `undefined` no modo MULTI-EMPRESA → mutation tRPC falhava na validação `z.number()`; sem `onError`, erro SILENCIOSO. Fix (SERVER aditivo só LEITURA + CLIENT/UI; ZERO SCHEMA): SERVER `homeData.ts` carrega `companyId` por experiência; CLIENT `PainelRH.tsx` envia `(expAction.emp.companyId ?? companyId)!` + `onError`/`onSuccess` com `toast`. Detalhe: `shared/changelog.ts`.

- **Rev. 2666** — FÉRIAS (`/ferias`) · O FILTRO DE STATUS PASSA A PERMITIR SELECIONAR VÁRIAS OPÇÕES AO MESMO TEMPO (MULTI-SELEÇÃO / FILTRO PERSONALIZADO) E GANHA "VENCIDA — 1º PERÍODO" E "VENCIDA — 2º PERÍODO OU +". Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): CLIENT `Ferias.tsx` — `statusFilter` vira `string[]` (vazio=todos); query deixa de mandar `status` (busca tudo); filtragem no `useMemo` via `matchStatusFiltro` (OR entre marcados); `STATUS_OPCOES` ganha compostos "vencida_1"/"vencida_2"; dropdown→`Popover` com checkboxes; cards-atalho/`filtrosAtivos`/"Limpar" usam o array. Detalhe: `shared/changelog.ts`.

- **Rev. 2665** — PAINEL RH (`/painel-rh`) · CARD "FÉRIAS — PERÍODO AQUISITIVO": A FRASE PARA DE DAR A IMPRESSÃO DE "FÉRIAS VENCIDAS" — DEIXA CLARO QUE É O FUNCIONÁRIO COMPLETANDO MAIS UM ANO DE EMPRESA E ABRINDO UM NOVO PERÍODO DE FÉRIAS, NÃO PENDÊNCIA/ATRASO. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): CLIENT `PainelRH.tsx` em 5 pontos do dado `feriasAlerta` (card expandido/compacto, sino de alertas, KPI e badge da seção) — frases/badges reescritas de "vencer/vencido" para "abrir o Nº período". Cálculo/cores/link `/ferias` inalterados. Detalhe: `shared/changelog.ts`.

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
