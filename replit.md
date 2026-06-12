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

- **Rev. 2967** — **PORTAL DO CLIENTE → PESQUISA DE SATISFAÇÃO (NPS) PÚBLICA — CORREÇÃO DO CRASH "ReferenceError: Cannot access 'aval' before initialization" QUE DERRUBAVA A PÁGINA INTEIRA ("OCORREU UM ERRO INESPERADO") AO ABRIR O LINK PÚBLICO DE AVALIAÇÃO.** Reportado (usuário, print iPad Safari, link público → `AvaliacaoPublica`): a tela não abria, caía no fallback de erro com "Cannot access 'aval' before initialization" (`PortalDashboardCliente.tsx:146`). CAUSA-RAIZ: regressão da Rev. 2965 — ao adicionar os blocos `obraSel`/`gestorAuto` (e mantendo o effect "trava-obra" da Rev. 2892), o componente passou a referenciar `aval`/`setAval` em effects/memos POSICIONADOS ACIMA da declaração `const [aval, setAval] = useState({...})`. Como `const` tem Temporal Dead Zone, o acesso antes da linha de declaração lança `ReferenceError` no primeiro render; por ser durante a renderização, o ErrorBoundary troca a tela toda pelo fallback. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): MOVER a declaração de `aval`/`setAval` para ANTES dos effects/memos que a usam (logo após a query `minhasObras`, antes do effect da Rev. 2892); removido o `useState` duplicado mais abaixo e o comentário de seção redundante. Sem mudança de lógica/estado inicial nem na ordem relativa dos hooks — apenas reordenação textual exigida pela TDZ. Detalhe: `shared/changelog.ts`.
- **Rev. 2966** — **AVISO PRÉVIO TRABALHADO (DO EMPREGADOR) — O DOCUMENTO VOLTA A SAIR COM A SEÇÃO DE OPÇÃO DE REDUÇÃO DO ART. 488 CLT (2 HORAS DIÁRIAS OU 7 DIAS CORRIDOS), QUE SUMIU AO ADOTAR TEMPLATE VIGENTE DA CENTRAL DE DOCUMENTOS.** Reportado (usuário, print "AVISO PRÉVIO TRABALHADO — ERIC GUSTAVO DE SOUZA"): o documento não traz mais o bloco onde o colaborador escolhe a forma de cumprimento ("[ ] Redução de 2 horas diárias" ou "[ ] Falta de 7 dias corridos"). CAUSA-RAIZ: `gerarDocumentoCore` (`client/src/pages/AvisoPrevio.tsx`) tem 2 caminhos — o HTML hard-coded (fallback, SEMPRE teve a seção `.opcoes`) e o caminho do **template Vigente** (`renderTemplate(...) + buildFcDocument(...)`), que renderiza só o corpo do template, e o template institucional FC não contém a seção de redução. A empresa adotou o Vigente (cabeçalho FC, "ASSUNTO:", assinatura "Ciente — Empregado(a)"), então a seção parou de sair. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): no caminho Vigente, quando `isTrabalhado && !isPedidoDemissao`, monta `reducaoOpcoesHtml` (2 opções EM BRANCO — escolha do colaborador, regra de 14/05/2026 — com datas `dt2hOpcao`/`dt7DiasUltimoTrab`) e ANEXA ao `corpoHtml`. Inline styles (REGRA DE OURO — `buildFcDocument`/DOMPurify). Indenizado e pedido de demissão seguem SEM a seção (Art. 488 é exclusivo do empregador); fallback intacto. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2965** — PORTAL DO CLIENTE → PESQUISA DE SATISFAÇÃO (NPS) — formulário público reformulado: GESTOR auto-preenchido pelo responsável da obra; avaliação granular (0-10) de gestor, encarregado, equipe direta e escritório central. SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE): nova tabela espelho `cliente_avaliacao_detalhes` (self-heal); `gerarLinkAvaliacao` embute `gestorNome` no JWT; `criarAvaliacao` ganhou input `detalhes` e deriva as headlines legadas; FRONT com `CriterioRow` + `gestorAuto`. Detalhe: `shared/changelog.ts`.

- **Rev. 2964** — PORTAL DO CLIENTE → ADMINISTRAÇÃO → AVALIAÇÕES (NPS) → "LINK DE AVALIAÇÃO (SEM LOGIN)" — combo de obra passa a listar APENAS obras em andamento (antes trazia todas/concluídas como "PÓS OBRA"/"ESCRITÓRIO CENTRAL"). CAUSA-RAIZ: `<select>` em `ClientesPortalAdmin.tsx` mapeava `obrasDaEmpresaAdmin` sem filtrar status. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): `.filter` por `status` normalizado p/ `em_andamento` antes do `.map`. Detalhe: `shared/changelog.ts`.

- **Rev. 2963** — CONTROLE DE EPIs → NOVA TRANSFERÊNCIA — TELA UNIFICADA PARA TODOS OS USUÁRIOS (FIM DAS "DUAS TELAS DIFERENTES") + INDICADOR DE ESTOQUE DISPONÍVEL NA ORIGEM. CAUSA-RAIZ (regra Rev. 2950): modal escondia o botão "Almoxarifado Central" p/ restrito (`!canWriteCentral`) → layout dropdown-only ≠ admin; e a OBRA "ESCRITÓRIO CENTRAL" (id 90005/270005) tem ZERO estoque em `epi_estoque_obra` (≠ Almoxarifado Central real, em `epis.quantidadeEstoque`) → "Disponível: 0" como origem. SOLUÇÃO (FRONT-only, `Epis.tsx`): Origem/Destino sempre renderizam [Central|Obra]; restrito vê Central DISABLED + 🔒 + toast; novo `dispOrigem(epiId)` mostra "Disponível: N" da origem; `estoqueObraQ` carrega no viewMode "transferencias". Detalhe: `shared/changelog.ts`.

- **Rev. 2962** — PLANEJAMENTO → DETALHE DO PROJETO → ABA CRONOGRAMA — CORREÇÃO DO CRASH "ReferenceError: _calMSPInner is not defined" QUE DERRUBAVA A TELA AO ABRIR O CRONOGRAMA. CAUSA-RAIZ: a coluna "Duração" usa `diasUteisEntre(ini, fim, _calMSPInner)`, mas o memo `_calMSPInner` só existia em `PlanejamentoDetalheInner` — o `Cronograma` é componente SEPARADO que não recebia `proj` (mesma classe da Rev. 1713/1715 com `pvMacro`). SOLUÇÃO (FRONT-only): `<Cronograma>` recebe `proj={proj}` e define LOCALMENTE `_calMSPInner = useMemo(...)` antes de early returns; `parseCalendarioJson`/`diasUteisEntre` toleram calendário `null` (fallback `a.duracaoDias`). Detalhe: `shared/changelog.ts`.

- **Rev. 2961** — DASHBOARD AVISO PRÉVIO → COMBO DE DEMISSÕES — AGORA PODE SER SALVO POR NOME (SIMULAÇÃO PERSISTENTE: LISTAR/REABRIR/EDITAR/EXCLUIR) E TEM O BOTÃO "GERAR AVISOS DE TODOS" QUE CRIA, EM 1 CLIQUE, O AVISO PRÉVIO DE CADA FUNCIONÁRIO SELECIONADO — PULANDO QUEM JÁ TEM AVISO EM ANDAMENTO. BACKEND (`avisoPrevioFerias.ts`, ZERO ALTER/DROP/DELETE): helper EXPORTADO `criarAvisoPrevioInterno` extraído VERBATIM da `avisoPrevio.create`; novo sub-router `combo` (salvar/listar/abrir/atualizar/excluir/gerarEmLote) com tenant guard anti-IDOR; `gerarEmLote` try/catch (CONFLICT→pulados, erro→erros[], ok→criados). SCHEMA: tabela espelho `comboDemissaoSimulacoes` + self-heal `CREATE TABLE IF NOT EXISTS`. FRONT (`DashAvisoPrevio.tsx`): salvar/listar/editar/excluir + "Gerar avisos de todos (N)". Detalhe: `shared/changelog.ts`.


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
