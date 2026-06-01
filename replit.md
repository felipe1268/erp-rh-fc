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


- **Rev. 2676** — **FUNÇÕES (`/funcoes` → "Nova Função", autocomplete da base CBO) · A BUSCA DA BASE CBO PASSA A RANKEAR OS RESULTADOS (PREFIXO > INÍCIO DE PALAVRA > TRECHO > CÓDIGO) E A MOSTRAR ATÉ 40, ENTÃO "ELETRICISTA" E DEMAIS PROFISSÕES OPERACIONAIS VOLTAM A APARECER.** Pedido (usuário, print IMG_1479_1780354520842): ao digitar "Ele" o autocomplete só mostrava engenheiros e o usuário concluiu que "faltam profissões / não tem eletricista". Diagnóstico: `client/public/cbo.json` JÁ é a CBO 2002 quase completa (~2450 ocupações, INCLUSIVE Eletricista de instalações 7156-10, 7321-05 etc.); o problema era SÓ A BUSCA — filtrava em ordem de código e cortava em `slice(0,15)`, soterrando os eletricistas (7xxx/9xxx) sob telecomunicações/elétrica/eletrônico. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER; `cbo.json` intacto): `client/src/pages/Funcoes.tsx` — `CboAutocomplete.filtered` passa a PONTUAR cada item (0 prefixo `removeAccents(desc)` > 1 começo de palavra `\b` > 2 trecho > 3 código), ordena por score + `desc.length` e mostra `slice(0,40)`; termo normalizado por `removeAccents` (robusto a acento) + regex escapado. Sem SQL crua/`ALTER`/`DROP` (R-001/R-007/R-010). esbuild `Funcoes.tsx` EXIT 0; ranking validado contra o `cbo.json` real. Detalhe: `shared/changelog.ts`.
- **Rev. 2675** — **GESTÃO DE DOCUMENTOS (`/gestao-documentos` → lista de documentos de uma pasta) · A COLUNA "TÍTULO / CÓDIGO" INVERTE A HIERARQUIA: O NOME/CÓDIGO DO ARQUIVO PASSA A APARECER EM DESTAQUE E O TÍTULO DIGITADO PELO USUÁRIO LOGO ABAIXO (INVERTE A Rev. 2673).** Pedido (usuário, print image_1780333925880): após a Rev. 2673 a célula mostrava o TÍTULO em destaque ("TOPOGRAFIA - POITA") e o CÓDIGO/NOME do arquivo abaixo ("POITA-ARQ-000-PE-PL-GRAL-IMP-R02"); o usuário achou melhor o contrário ("deixa o nome do arquivo em evidência e o título abaixo"). Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER): `client/src/pages/gestaodocumentos/index.tsx` — por linha do `filteredDocs.map` reusa a heurística `veioDoLote`/`tituloIsCode` (trim+lowercase + stem) mas troca os papéis: `tituloDoc = tituloIsCode ? descricao : titulo` (sem fallback p/ código); `nomeArquivoDestaque = codigo||arquivoNome||tituloDoc||"—"` (1ª linha `font-semibold`); `tituloAbaixo = tituloDoc` quando `!== nomeArquivoDestaque` (2ª linha `text-gray-600`); `descricaoExtra` (docs manuais) segue como 3ª linha (`text-gray-400`, só se `!== tituloAbaixo`). Badges/clipe/`docParsed`/busca inalterados — só reordenação/estilo. Sem SQL crua/`ALTER`/`DROP` (R-001/R-007/R-010). esbuild `index.tsx` EXIT 0 (`pnpm build`/`tsc` estouram OOM). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2674** — GESTÃO DE DOCUMENTOS (`/gestao-documentos` → lista de documentos) · A COLUNA "REV." PASSA A MOSTRAR A REVISÃO SEMPRE COM 2 DÍGITOS (01, 02, 03…). Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/gestaodocumentos/index.tsx` — na `TableCell` "Rev." do `filteredDocs.map`: se `parseRevision(titulo||codigo).rev >= 0` → `padStart(2,"0")`; senão fallback `doc.revisaoAtual` normalizado (`trim()`): vazio→"—", numérico→pad 2 díg., não-numérico ("R02")→cru. Só formatação de exibição. Detalhe: `shared/changelog.ts`.

- **Rev. 2673** — GESTÃO DE DOCUMENTOS (`/gestao-documentos` → lista de documentos) · O LAYOUT DA COLUNA "TÍTULO / CÓDIGO" PASSA A MOSTRAR O TÍTULO DIGITADO EM DESTAQUE E O NÚMERO/CÓDIGO ABAIXO (REFINA A Rev. 2672; depois INVERTIDA pela Rev. 2675). Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/gestaodocumentos/index.tsx` — heurística `veioDoLote` (normTxt+stem) + `tituloIsCode`; `tituloDestaque` (título real) em `font-semibold`; `numeroArquivo` (codigo||arquivoNome) abaixo; `descricaoExtra` (docs manuais) como 3ª linha. Detalhe: `shared/changelog.ts`.

- **Rev. 2672** — GESTÃO DE DOCUMENTOS (`/gestao-documentos` → lista de documentos) · A COLUNA "TÍTULO / CÓDIGO" PASSA A MOSTRAR O TÍTULO (PREENCHIDO PELO USUÁRIO) EM DESTAQUE E O NOME DO ARQUIVO LOGO ABAIXO, PARA FACILITAR A BUSCA. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): `client/src/pages/gestaodocumentos/index.tsx` — na `TableCell` "Título / Código": `doc.titulo` vira `text-sm font-medium text-gray-900`; nova linha com `doc.arquivoNome` (`text-[11px] font-mono text-gray-500`); `descricao` em `text-gray-400` abaixo. (Refinada depois pela Rev. 2673.) Detalhe: `shared/changelog.ts`.

- **Rev. 2671** — GESTÃO DE DOCUMENTOS (`/gestao-documentos`) · AGORA DÁ PARA EDITAR UM DOCUMENTO (INCLUSIVE O TÍTULO) DEPOIS DO UPLOAD, DIRETO PELA TELA DE DETALHE. Causa (SÓ CLIENT/UI): o modal de EDIÇÃO (`openEditDoc`) e o endpoint `updateDocumento` (aceita `titulo`) já existiam, mas o modal de DETALHE não dava acesso (só "Anexar arquivo", e só sem arquivo). Fix (reusa `openEditDoc`+`updateDocumento`): `client/src/pages/gestaodocumentos/index.tsx` — cabeçalho do "Modal — Detalhe do Documento" ganha botão "Editar" (`Pencil`) que faz `setShowDetailModal(false); openEditDoc(selectedDoc)`. Detalhe: `shared/changelog.ts`.

- **Rev. 2670** — GESTÃO DE DOCUMENTOS (`/gestao-documentos` → "Projetos / Documentos Técnicos") · AGORA DÁ PARA APAGAR FICHEIROS (CARDS DE OBRA) EM LOTE, COM SELEÇÃO MÚLTIPLA. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER — reusa `gestaoDocumentos.deleteFicheiro`, escopado por `companyId`+`id` com acesso por obra): `client/src/pages/gestaodocumentos/index.tsx` (view "obras") — botão "Selecionar" liga o MODO DE SELEÇÃO (`selectModeFicheiro`, card marca/desmarca em vez de abrir, ring/checkbox vermelho); "Excluir (N)" abre `askConfirm` e chama `deleteFicheiro` 1×/id, conta ok/erros, invalida `listFicheiros`, sai do modo (try/finally) e dá toast; "Cancelar" sai sem apagar. Detalhe: `shared/changelog.ts`.

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
