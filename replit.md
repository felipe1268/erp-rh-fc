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

- **Rev. 3048** — **INTEGRASIGN (FCSIGN) · "DETALHES DO ENVELOPE → SIGNATÁRIOS": NOME DO SIGNATÁRIO PARA DE QUEBRAR UMA LETRA POR LINHA (TEXTO VOLTA A SER HORIZONTAL).** PEDIDO (prints iPad): o nome (ex.: "CELSO ANTONIO BITTENCOURT SALES JUNIOR") aparecia na VERTICAL, 1 letra/linha. CAUSA-RAIZ (FRONT/CSS): linha do signatário usava `... sm:flex-row sm:items-center sm:justify-between`; no painel estreito o `sm:` já vira row pondo NOME e BOTÕES lado a lado — botões `shrink-0` + nome `min-w-0` colapsam a coluna do nome a ~1 caractere e `break-words` quebra letra a letra. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE) em `client/src/pages/IntegraSignDashboard.tsx`: remove `sm:flex-row sm:items-center sm:justify-between`, deixando `flex flex-col gap-2` — nome ocupa largura inteira (horizontal) e botões (Copiar link/WhatsApp/Reenviar, com `flex-wrap`) vão pra linha de baixo. Detalhe: `shared/changelog.ts`.

- **Rev. 3047** — **INTEGRASIGN (FCSIGN) · PÁGINA PÚBLICA DE ASSINATURA PRÉ-PREENCHE AUTOMATICAMENTE "NOME COMPLETO" E "CPF / CNPJ" CONFORME O CADASTRO DO SIGNATÁRIO.** PEDIDO (print da página pública de assinatura, iPad): "Nome e o CNPJ desse ser preenchido automaticamente conforme cadastro" — os campos vinham vazios mesmo com o ERP já tendo o dado (`integrasign_signatarios.cpfCnpj` gravado na criação a partir do `cnpj` do fornecedor). SOLUÇÃO (ZERO ALTER/DROP/DELETE — só leitura/exibição): (1) BACKEND `server/routers/integrasign.ts` (`getDocumentoPublico`) passa a incluir `cpfCnpj` no objeto `signatario` retornado (o `nome` já vinha; SELECT já era `db.select()`); (2) FRONT `client/src/pages/IntegraSignAssinar.tsx` novo `useEffect([doc.data])` semeia `nomeConfirmado`/`cpfCnpjConfirmado` com guarda `prev => prev || valor` (não sobrescreve digitação; campos seguem editáveis). RESSALVA: envelopes antigos sem `cpfCnpj` seguem com CNPJ vazio. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3046** — CIPA · DIÁLOGO "NOVA AÇÃO" (PLANOS DE AÇÃO) GANHA LAYOUT MODERNO, "RESPONSÁVEL" VIRA SELETOR DE CIPEIROS E "PRAZO" GANHA CALENDÁRIO COM ÍCONE. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE — usa `cipa.planosAcao` create/update existentes; `responsavel` segue TEXT) em `client/src/pages/CipaCompleta.tsx` (diálogo `showPlanoDialog`): card `rounded-2xl` com cabeçalho gradiente FC + ícones por campo e grid responsivo; Responsável vira `<Select>` de `membrosAtivos` (opções "— Sem responsável" e "(externo)" preservando valor fora da lista); Prazo mantém `type=date` + ícone `CalendarDays`. Detalhe: `shared/changelog.ts`.

- **Rev. 3045** — CIPA · ABA "REUNIÕES" GANHA SELEÇÃO MÚLTIPLA COM EXCLUSÃO EM MASSA E ORDENAÇÃO CRESCENTE POR DATA. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE — usa `cipa.reunioes.delete` existente) em `CipaCompleta.tsx`: memo `reunioesOrdenadas` ordena CRESCENTE por `dataReuniao`; estado `selReunioes` (Set) + `Checkbox` header/linha com realce; botão "Excluir N selecionada(s)" → `handleBulkDeleteReunioes` em loop `mutateAsync` (sem toast por item), tolera falha parcial (mantém as que falharam selecionadas), 1 refetch + toast de resumo; seleção limpa ao trocar mandato e saneada quando a lista muda. Detalhe: `shared/changelog.ts`.

- **Rev. 3044** — CIPA · INSCREVER CANDIDATO E LISTAS DE COLABORADOR PASSAM A MOSTRAR A FOTO DO FUNCIONÁRIO (NÃO MAIS A INICIAL GENÉRICA "A"). SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE) em `CipaCompleta.tsx`: NOVO `EmpAvatar({emp,size})` (`<img src={emp.fotoUrl}>` redondo com fallback na inicial via estado `imgOk`), aplicado no dropdown de busca, no card do colaborador selecionado e no diálogo de Membro; lista de candidatos já inscritos passa a exibir `c.employeeFoto`. Detalhe: `shared/changelog.ts`.

- **Rev. 3043** — FROTA → PEDÁGIOS · TABELA DE LANÇAMENTOS: DIA DA SEMANA + FERIADO ABAIXO DA DATA, E MODELO DO CARRO ABAIXO DA PLACA. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): NOVO `shared/feriados.ts` (helpers puros `nomeDiaSemana`/`ehFimDeSemana`/`feriadoNacional` — fixos + móveis via Computus-Gauss, parse UTC; sem estaduais/municipais); FRONT `Pedagios.tsx` célula "Data" mostra dia da semana + "Feriado · {nome}", célula "Veículo" mostra placa + `marca modelo`. Detalhe: `shared/changelog.ts`.

- **Rev. 3042** — INTEGRASIGN (FCSIGN) · ENVIO DO LINK DE ASSINATURA POR WHATSAPP + ESCOLHA "E-MAIL × SOMENTE LINKS" AO ENVIAR O ENVELOPE. SOLUÇÃO (ZERO ALTER/DROP/DELETE — só lógica + UI): BACKEND `integrasign.ts` (`enviarParaAssinatura`) ganha input `enviarEmail` (default true); com `false` os LINKS ficam ativos sem disparar e-mail (gate público só bloqueia cancelado/expirado/recusado); FRONT `IntegraSignDashboard.tsx` ganha `handleWhatsApp` (abre `wa.me/?text=…` com link codificado) + botão "WhatsApp" por signatário e 2 botões no rascunho ("Enviar por e-mail" × "Gerar links"). Detalhe: `shared/changelog.ts`.

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
