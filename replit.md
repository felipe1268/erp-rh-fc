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

- **Rev. 2973** — **PORTAL DO CLIENTE → ADMINISTRAÇÃO → AVALIAÇÕES (NPS) → "LINK DE AVALIAÇÃO (SEM LOGIN)" — ESCOLHA DE QUANTOS LINKS GERAR DE UMA VEZ + CADA LINK PASSA A SER DE USO ÚNICO (1 AVALIAÇÃO).** Pedido (usuário): ao gerar o link, perguntar QUANTOS criar (ex.: 3 avaliadores na mesma obra), premissa "cada link só permite UMA avaliação". CAUSA-RAIZ: link ABERTO (sem `credId`) NÃO tinha limite — `criarAvaliacao` só marcava em `cliente_avaliacao_marcacoes` com `credId` e `podeAvaliarEsteMes` com `!credId` sempre devolvia `podeAvaliar:true` → 1 link = ilimitado. SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE): self-heal `cliente_avaliacao_link_uso (link_id PK, company_id, obra_id, usado_em)` (`server/_core/index.ts`); `gerarLinkAvaliacao` ganha input `quantidade` (1–50) e gera N tokens, cada um com `linkId=crypto.randomUUID()`+`unico:true`, retornando `tokens: string[]` (`token`=tokens[0] p/ compat); `criarAvaliacao` faz CLAIM atômico `INSERT ... ON CONFLICT DO NOTHING RETURNING` quando há `linkId` (0 linhas = FORBIDDEN "link já utilizado"); `podeAvaliarEsteMes` checa uso por LINK; FRONT (`ClientesPortalAdmin.tsx`) input "Qtd. de links" + LISTA de links cada um com Copiar/Abrir/WhatsApp. Links antigos (sem `linkId`) seguem ilimitados (backward-compat). Detalhe: `shared/changelog.ts`.
- **Rev. 2972** — **PORTAL DO CLIENTE → ADMINISTRAÇÃO → AVALIAÇÕES (NPS) → "LINK DE AVALIAÇÃO (SEM LOGIN)" → BOTÃO "WHATSAPP" — MENSAGEM CORDIAL REESCRITA, MAIS CALOROSA E AGRADECIDA.** Pedido (usuário): "melhore a mensagem que vai para o WhatsApp na avaliação, quero algo mais cordial". SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, `client/src/pages/ClientesPortalAdmin.tsx`): reescrita do template montado no `onClick` do botão "WhatsApp" (Rev. 2969) — saudação acolhedora ("Olá! Tudo bem? 😊"), agradecimento pela confiança + personalização "…na obra {linkObraNome}", explicação de que é rápida/anônima/melhoria contínua, convite sem pressionar ("Quando puder…") e fechamento de parceria ("…pela parceria! Conte sempre conosco. 🤝"); `*FC Engenharia*` em negrito do WhatsApp. Mesmo fluxo `https://wa.me/?text=<encoded>` com o `linkAvaliacao` já gerado. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2971** — PORTAL DO CLIENTE → NPS PÚBLICA → bloco "Encarregado FC na obra" — o pré-preenchimento do "Nome do encarregado" (Rev. 2970) passa a funcionar também em LINKS ANTIGOS e a refletir trocas no efetivo, resolvendo o nome AO VIVO no backend em vez de depender só do token. SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE): `cliente.podeAvaliarEsteMes` resolve ao vivo `gestorNome`/`encarregadoNome` quando o token tem `obraId`; FRONT (`PortalDashboardCliente.tsx`) move `podeAvaliarQ` p/ antes dos memos (TDZ) e dá precedência ao valor ao vivo (token = fallback). Detalhe: `shared/changelog.ts`.

- **Rev. 2970** — PORTAL DO CLIENTE → NPS PÚBLICA → bloco "Encarregado FC na obra" — campo "Nome do encarregado" passa a ser pré-preenchido automaticamente a partir do efetivo da obra (indireto cuja função é "Encarregado"), sem o cliente digitar. SOLUÇÃO (BACK+FRONT, ZERO ALTER/DROP/DELETE): `gerarLinkAvaliacao` consulta `getEquipeObra` e embute `encarregadoNome` no JWT (try/catch → null mantém manual); FRONT extrai `encarregado` do token, novo memo `encarregadoAuto` + `useEffect setEncarregadoNome`, UI espelha o gestor (card read-only). Detalhe: `shared/changelog.ts`.

- **Rev. 2969** — PORTAL DO CLIENTE → ADMINISTRAÇÃO → AVALIAÇÕES (NPS) → "LINK DE AVALIAÇÃO (SEM LOGIN)" — novo botão "WhatsApp" que abre o WhatsApp com uma mensagem cordial já pronta, convidando o cliente a reservar alguns minutos para avaliar a equipe (melhoria contínua), com o link embutido. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, `client/src/pages/ClientesPortalAdmin.tsx`): ao lado de "Copiar"/"Abrir", botão "WhatsApp" (ícone `MessageSquare`, verde) monta mensagem pt-BR cordial com o `linkAvaliacao` embutido e personaliza "…na obra {linkObraNome}" quando vinculado; abre `https://wa.me/?text=<encoded>` em nova aba. Detalhe: `shared/changelog.ts`.

- **Rev. 2968** — PORTAL DO CLIENTE → PESQUISA DE SATISFAÇÃO (NPS) PÚBLICA — a "Nota geral" deixa de ser digitada/selecionada e passa a ser CALCULADA AUTOMATICAMENTE como média ponderada das respostas. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): `useMemo notaGeralAuto` em `PortalDashboardCliente.tsx` pondera blocos (Gestor 25%, Equipe direta 25%, Obra/Execução 25%, Encarregado 10%, Escritório 10%, Empresa 5%), só conta blocos com ≥1 item, RENORMALIZA pesos ativos e arredonda/clamp p/ int 0–10; card do topo vira read-only. Detalhe: `shared/changelog.ts`.

- **Rev. 2967** — PORTAL DO CLIENTE → PESQUISA DE SATISFAÇÃO (NPS) PÚBLICA — correção do crash "ReferenceError: Cannot access 'aval' before initialization" que derrubava a página inteira ao abrir o link público. CAUSA-RAIZ: regressão da Rev. 2965 — effects/memos (`obraSel`/`gestorAuto`/trava-obra) referenciavam `aval`/`setAval` ACIMA da declaração `const`, violando a TDZ. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): mover a declaração `const [aval, setAval]` para antes dos effects/memos que a usam; remover `useState` duplicado. Detalhe: `shared/changelog.ts`.

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
