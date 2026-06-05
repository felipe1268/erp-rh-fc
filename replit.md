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

- **Rev. 2763** — **RH/DP · RECONTRATAÇÃO: A FOTO DO COLABORADOR AGORA É COPIADA JUNTO COM OS "DADOS PESSOAIS" AO INICIAR UMA RECONTRATAÇÃO — NÃO PRECISA MAIS RE-FOTOGRAFAR / RE-ANEXAR.** Pedido (Felipe, print): no card de recontratação o avatar aparecia VAZIO (ícone de câmera) mesmo o vínculo anterior já tendo foto; ele queria a foto copiada "para facilitar". Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER — R-001/R-007/R-010) em `client/src/pages/Colaboradores.tsx`: o bloco "Dados pessoais" de `BLOCOS_RECONTRATACAO` (selecionado por padrão) ganhou `fotoUrl` em `fields`. Como a `fotoUrl` copiada é uma URL REAL já hospedada (não data-URL), o `aplicarRecontratacao` a injeta no `form` (avatar exibe a foto) e o submit a preserva (guard só descarta `data:`) → segue na `ficha` → `criarSolicitacao` → `aprovar` faz `createEmployee({...ficha})` e o `createEmployee` (whitelist em `server/db.ts`) persiste `fotoUrl`. Reaproveita a MESMA URL do vínculo anterior (mesma pessoa). Label virou "Dados pessoais (com foto)". Validação: client-only; vite HMR sem erros. Detalhe: `shared/changelog.ts`.
- **Rev. 2762** — **RH/DP · RECONTRATAÇÃO: O MODAL "INICIAR RECONTRATAÇÃO" FOI MODERNIZADO E PERDEU A BARRA DE ROLAGEM HORIZONTAL — CABEÇALHO COM FAIXA ÂMBAR, ETAPAS NUMERADAS, CARD DE VÍNCULO LIMPO E BLOCOS A COPIAR COMO CARDS COM ÍCONE.** Pedido (Felipe, print): o modal aparecia com barra de rolagem horizontal e layout pouco amigável; queria algo mais moderno e fácil de cadastrar. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER — R-001/R-007/R-010) em `client/src/pages/Colaboradores.tsx`: `DialogContent` ganhou `overflow-x-hidden` + largura responsiva `w-[calc(100vw-2rem)]` (some a barra horizontal); `p-0 gap-0` com cabeçalho/rodapé fixos. Cabeçalho com faixa âmbar (gradiente) + ícone em chip. Conteúdo em 2 etapas numeradas ("1 Vínculo anterior" / "2 Blocos a copiar"). Card de vínculo redesenhado (nome truncável + badge de código, metadados com ícones, alerta jurídico em caixa destacada, check de seleção). "Blocos a copiar" viraram cards com ícone (grid 2/3 col.) + atalhos "Selecionar tudo / Limpar"; `BLOCOS_RECONTRATACAO` ganhou campo `icon` (visual, não muda a lógica de cópia). Rodapé fixo com botão de aplicar + spinner. Validação: `tsc --noEmit` limpo em `Colaboradores.tsx`; client-only. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2761** — RH/DP · NOVO COLABORADOR / RECONTRATAÇÃO: A VERIFICAÇÃO DE CPF AGORA ENXERGA FUNCIONÁRIOS DE TODOS OS STATUS — INCLUSIVE OS 22 EM "LISTA_NEGRA" QUE ANTES VIRAVAM FALSO "ATIVO" E SUMIAM DA ANÁLISE. Causa (SÓ SERVER): a verificação de CPF (`recontratacao.*` + `create`) só checava `"Desligado"`/`"Inativo"`, ESQUECENDO `"Lista_Negra"` → 22 registros tratados como `ativoMesmaEmpresa` e fora de `vinculos`. Fix: NOVA fonte única `EMPLOYEE_STATUS_DESLIGADOS` em `shared/modules.ts`, aplicada em todos os pontos da verificação. ZERO schema. `vitest` 46/46 verde; architect. Detalhe: `shared/changelog.ts`.

- **Rev. 2760** — RH/DP · NOVO COLABORADOR: A VERIFICAÇÃO DE CPF AGORA RECONHECE FUNCIONÁRIO JÁ CADASTRADO MESMO QUANDO O CPF ESTÁ GRAVADO FORMATADO NO BANCO — ACABOU O "CPF LIVRE" FALSO. Causa (SÓ SERVER): o cliente envia o CPF LIMPO, mas a query comparava `or(eq(cpf,input.cpf),eq(cpf,cleanCpf))` — não batia em CPF FORMATADO no banco → "CPF livre" falso. Fix: as três comparações (`verificarCpf` + solicitação pendente + `checkDuplicateCpf`) NORMALIZAM OS DOIS LADOS via `regexp_replace(<cpf>,'[^0-9]','','g') = cleanCpf`. ZERO client/schema. `vitest` 46/46 verde; architect. Detalhe: `shared/changelog.ts`.

- **Rev. 2759** — RH/DP · RECONTRATAÇÃO: A VERIFICAÇÃO DE CPF VOLTOU A FUNCIONAR — corrigido erro SQL "syntax error at or near 'desc'" que jogava TODO CPF no card laranja "Não foi possível verificar". Causa (SÓ SERVER): `recontratacao.ts` ordenava por `desc(employees.dataDesligamento)`, coluna inexistente em `employees` → `ORDER BY  desc` → Postgres quebrava a query inteira (bug desde a Rev. 2755, silencioso até a 2758). Fix: ordenar por `desc(dataDemissao)`; endpoint `recontratados` lê `dataDesligamentoEfetiva` aliased; HARDENING: acessos runtime a `dataDesligamento` (sempre `undefined`) trocados p/ `dataDesligamentoEfetiva || dataDemissao`. ZERO client/schema. `vitest` 41/41 verde; architect. Detalhe: `shared/changelog.ts`.

- **Rev. 2758** — RH/DP · NOVO COLABORADOR: O VEREDITO DO CPF VIRA UM CARD FIXO E SEMPRE CONCLUSIVO — "NOVO", "JÁ CADASTRADO", "JÁ EM RECONTRATAÇÃO", "JÁ FOI COLABORADOR (DESLIGADO) → RECONTRATAR?" OU "FALHA NA VERIFICAÇÃO". Sintoma: ao terminar de digitar o CPF ficava no spinner sem veredito. Causa (SÓ CLIENT): a Rev. 2757 amarrava spinner E veredito a DUAS queries. Fix: veredito de FONTE ÚNICA (`verificarCpf`), `cpfVeredito` (erro>ativo>pendente>desligado>novo); UM card FIXO por estado + card LARANJA "Não foi possível verificar" com "Tentar novamente" (`refetch`) em falha de rede. `Colaboradores.tsx` apenas. `vitest` 41/41 verde; architect. Detalhe: `shared/changelog.ts`.

- **Rev. 2757** — RH/DP · NOVO COLABORADOR: AO TERMINAR DE DIGITAR O CPF, O ERP PASSA A DAR UM VEREDITO EXPLÍCITO — "VERIFICANDO…", "JÁ EM PROCESSO DE RECONTRATAÇÃO", "JÁ CADASTRADO" OU "CPF LIVRE". Antes, quando o CPF não batia em nada a tela ficava MUDA e não detectava solicitação de recontratação JÁ pendente (risco de duplicata). Fix (SERVER+CLIENT; ZERO SCHEMA): `verificarCpf` passa a retornar `solicitacaoPendente` (busca `recontratacao_solicitacoes` status `pendente` do MESMO CPF no grupo permitido); `Colaboradores.tsx` mostra spinner "Verificando…", banner índigo "já pendente" (suprime "Iniciar recontratação"), selo verde "CPF livre". `vitest` 41/41 verde; architect. Detalhe: `shared/changelog.ts`.

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
