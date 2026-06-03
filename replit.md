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


- **Rev. 2739** — **PLANEJAMENTO · PREVISÃO DE MEDIÇÃO (POR AVANÇO FÍSICO): A TABELA AGORA DEIXA EXPLÍCITO QUE "O QUE É PRODUZIDO NUM MÊS (COMPETÊNCIA) É RECEBIDO DEPOIS (mês seguinte)" — SEM PRECISAR ROLAR A TABELA PARA A DIREITA.** Pedido (print no celular): "o que produzimos no mês atual será pago no próximo mês em função da data de pagamento acordada com o cliente.. a tabela abaixo não mostra isso" → usuário escolheu a OPÇÃO 3 (melhorar o layout). Contexto: a relação JÁ EXISTIA no motor — a coluna "Recebimento" (`previsoesMensais`, `PlanejamentoDetalhe.tsx`) calcula a data como `dia de corte (cfgDiaCorte) + cfgPrazoRecDiasUteis dias úteis`, com a trava do sinal (Rev. 2730). O problema era SÓ apresentação: "Recebimento" é a 9ª/última coluna e no celular fica cortada fora da tela. Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA; ZERO ALTER/DROP/DELETE — R-001/R-007/R-010; NÃO mexe em valores/%/retenção/sinal/cálculo de data — só exibição): (1) a célula "Competência" (1ª coluna, SEMPRE visível) de cada linha mensal ganhou o sub-rótulo "→ recebe em mmm/aaaa" derivado de `dataRecebimentoPrev` (verde; âmbar + "(aguarda sinal)" quando `recebimentoTravadoSinal`); (2) cabeçalho virou "Competência (produção)"; (3) legenda do rodapé explica Competência (produção/medição) × Recebimento (corte dia N + M dias úteis, normalmente mês seguinte), citando `cfgDiaCorte`/`cfgPrazoRecDiasUteis` dinâmicos. Ressalva: a PROIBIÇÃO DE CÁLCULO NO PLANEJAMENTO vale p/ cards agregados (snapshot MSP); esta tabela é financeira/ERP e só REUTILIZA o valor já calculado. Validação: esbuild parse EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde; app rodando, console limpo. Detalhe: `shared/changelog.ts`.
- **Rev. 2738** — **RH · EPI · FICHA DE ENTREGA DE EPI · IMPRESSÃO (window.print): A FICHA AGORA SAI INTEIRA EM UMA PÁGINA LIMPA (acabou a página 1 em branco com só "Controle de EPIs" e o conteúdo espremido em 3 páginas).** Pedido (prints): "o layout para impressão das fichas de EPIs estão péssimos! (imagens 1 e 2) preciso que saia a impressão inteira como está na imagem 3". Causa: o botão "Imprimir" chama `window.print()` sobre a view HTML da ficha (`Epis.tsx`, `viewMode === "ficha_epi"`), mas o container imprimível NÃO era marcado como `print-only` → o CSS global `@media print` (`index.css`) não escondia o cromo do DashboardLayout (cabeçalho "Controle de EPIs" vazava como pág.1 vazia) e os espaçamentos da tela (`p-8`/`mb-6`/`mt-12`) empurravam o conteúdo p/ 3 páginas, sem trava de quebra. Solução (SÓ CLIENT/UI; ZERO SERVER; ZERO SCHEMA; ZERO ALTER/DROP/DELETE — R-001/R-007/R-010): (1) o container imprimível ganhou `print-only` (o seletor global `body:has(.print-only) *:not(.print-only)...` esconde TODO o resto — sidebar, header, botões — restando só a ficha) + `print:max-w-none` + classe âncora `epi-ficha-print`; (2) novo bloco escopado em `@media print` (`.epi-ficha-print`) zera borda/sombra/padding, reduz fonte (10px), comprime espaçamentos verticais grandes e aplica `page-break-inside: avoid` nos blocos críticos (tabela, política `.border-2`, grids de info/assinatura) → ficha sai inteira (imagem 3). NÃO MEXIDO: `generateFichaEpiPdf` (botão "Salvar PDF") já gerava layout correto. Validação: esbuild parse EXIT 0; app rodando sem erros, console limpo. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2737** — PJ · CONTRATOS · CLÁUSULA QUARTA (PRAZO E FORMA DE EXECUÇÃO): O PRAZO DE VALIDADE DEIXA DE SER HARDCODED "1 (UM) ANO" E PASSA A SER DERIVADO DA VIGÊNCIA PREENCHIDA (dataInicio → dataFim). O PJ-2026-0131 tinha vigência 6 meses mas a 4.1 dizia "1 (um) ano". Novo helper `shared/contratoPrazo.ts` (`calcularPrazoVigencia`/`numeroPorExtenso`, contagem INCLUSIVA: 6→"6 (seis) meses", 12→"1 (um) ano"); template troca "validade de 1 (um) ano" por placeholder `[PRAZO_VIGENCIA]`, substituído nos 3 renderizadores (`ContratoPJView.tsx`, `gerarTexto`, `contratoPjDocument.ts`). Ressalva: `MODELO_CONTRATO_PJ_DEFAULT` não tocado. SERVER+CLIENT; ZERO SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2736** — PJ · CONTRATOS · ASSINATURA DIGITAL COM LINK (FCSign): ENVIO DO CONTRATO DE PRESTAÇÃO DE SERVIÇOS PARA ASSINATURA POR LINK ÚNICO POR SIGNATÁRIO (CONTRATADA + CONTRATANTE + TESTEMUNHAS OPCIONAIS). O FCSign era modelado p/ vínculo empregatício (roles `empregado`/`empregador`); reaproveita-se a ACL de `signatures.create` (PJ tem `employeeId` notNull). Server (`signatures.ts`): roles `contratado`/`contratante` + rótulos PJ + dedup contract-scoped p/ `contrato_pj` + hardening de tenancy. Client: `contratoPjDocument.ts` (`buildContratoPjSignHtml`) + `FCSignPJSendDialog.tsx` + botão em `ModuloPJ.tsx`. Ressalva: ativação pendente→ativo segue MANUAL. ZERO SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.
- **Rev. 2735** — RH · COMUNICADOS INTERNOS · LISTA PARA ASSINATURA: MOSTRA A OBRA ATUAL DE CADA COLABORADOR + FILTROS (POR OBRA / POR QUEM ASSINOU / QUEM FALTA ASSINAR). A obra atual NÃO existe em `employees`; fonte = alocação ativa em `obra_funcionarios` (`isActive=1`) + `obras.nome`. Server (`comunicadosInternos.listarFuncionariosParaAssinatura`): query das alocações ativas (`innerJoin obras` escopado nos 2 lados + `deletedAt IS NULL`; `orderBy dataInicio desc,id desc`) injeta `obraId`/`obraNome`. Client (`ComunicadosInternos.tsx`): obra abaixo do nome + 2 `<select>` (obra / assinou-falta), contador e "Limpar". SÓ SERVER+CLIENT; ZERO SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.
- **Rev. 2734** — RH · CONTROLE DE DOCUMENTOS · ADVERTÊNCIAS · LGPD/AUDITORIA: APÓS A ASSINATURA DO COLABORADOR O DOCUMENTO FICA IMUTÁVEL (não pode mais ser editado). Causa (`controleDocumentos.ts`, `docs.advertencias.update`): a mutation aplicava `UPDATE` sem checar `warnings.assinatura_funcionario_url`. Fix: `update` bloqueia (`FORBIDDEN`) se assinatura presente; `salvarAssinatura` do colaborador vira once-only; lápis vira cadeado `disabled` no client. SÓ SERVER+CLIENT; ZERO SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.
- **Rev. 2733** — RH · FOLHA DE PAGAMENTO · ALERTA "VALE CALCULADO MAS FORA DA FOLHA MENSAL" NÃO PODE LISTAR FUNCIONÁRIO DESLIGADO QUE JÁ SAIU EM MÊS ANTERIOR (advance "stale"). Caso Elizeu: desligado em março (aviso `empregador_trabalhado` concluído) ainda aparecia no alerta de vale por ter `payroll_advances` `calculado` stale p/ maio. Causa (`payrollEngine.ts`, `simularPagamento`): bloco `valeForaDaFolha` lia TODOS os `calculado` sem revalidar elegibilidade. Fix: a query exclui advances de `status IN ('Desligado','Lista_Negra')` SEM `termination_notices` válido sobrepondo a competência (espelha o motor). Self-healing por leitura. SÓ SERVER; ZERO SCHEMA/ALTER/DROP/DELETE. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

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
