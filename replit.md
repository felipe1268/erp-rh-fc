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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção OBRIGATÓRIA (não negociável)** — este arquivo guarda APENAS as últimas **5 revisões** em formato detalhado (o quê + por quê + arquivos tocados). As 10 revisões seguintes aparecem como one-liner com título curto. Demais revisões vão para `replit-history.md`.
>
> **Ao criar uma nova revisão**:
> 1. Adicionar o bloco detalhado da NOVA revisão no TOPO.
> 2. Pegar o bloco mais ANTIGO dos 5 detalhados e converter pra one-liner curto na seção "Revisões recentes".
> 3. Se a seção "Revisões recentes" passar de 10 itens, mover o mais antigo pra `replit-history.md`.
> 4. NUNCA deletar parcialmente um bloco. Linhas órfãs sem prefixo `- ` são bug.
> 5. NUNCA usar marcadores HTML do tipo `<!-- DETALHES -->` (banidos na Rev. 1958).
>
> O histórico completo (causa-raiz, stack traces, arquivos tocados, comentários longos) vive em `shared/changelog.ts`. Esta convenção é validada visualmente: cada linha do bloco deve começar com `- ` (hífen+espaço).

### Top 5 detalhadas

- **Rev. 2032**: **DP · Fechamento de Ponto · Modal "Memória de cálculo · Atraso Acumulado" mostra agora a EQUAÇÃO COMPLETA por dia.** Pedido direto do usuário: "SIM FAÇA ESTA REVISÃO DE FORMA QUE NÃO GERE DUVIDAS.. DO JEITO QUE ESTA, DEIXA TUDO DUVIDOSO". Rev. 2027 já garantia `SOMA(dias[].minutos) === tabela` e Rev. 2029 colocou em full screen com fonte maior, mas a UI ainda só mostrava "entrada esperada vs entrada real + atraso" — usuário não enxergava por que o atraso existia (saída antecipada? intervalo estendido? falta parcial?). **Princípio**: tornar a equação visível — `DÉFICIT = JORNADA_ESPERADA − TOTAL_TRABALHADO`. **Mudança** em 2 arquivos: (A) `server/routers/fechamentoPonto.ts` (`getAtrasoDetalhe`, ~25L) — SELECT puxa também `saida1/entrada2/saida2/horasTrabalhadas`; `DiaAtraso` enriquecido com as 4 batidas, `horasTrabalhadasMin` e `jornadaEsperadaMin` (calculado via `getExpectedMinsFromJornada` existente, já líquido de intervalo). Fonte de verdade do atraso CONTINUA `r.atrasos` (motor — princípio Rev. 2027 INTACTO); novos campos são CONTEXTO didático. (B) `client/src/pages/FechamentoPonto.tsx` (~80L em 1 hunk) — tabela reescrita: Data | **Batidas do dia** (e1→s1/e2→s2 com cores semânticas) | **Trabalhado** (emerald grande) | **Esperado** (jornada líquida) | **Déficit (= Atraso)** (badge red + linha cinza `(Esperado − Trabalhado)` confirmando, ou linha âmbar quando motor diverge do cálculo simples) | **Acumulado**. Faixa explicativa e rodapé reescritos pra fechar o raciocínio: "Trabalhou X de Y esperadas → déficit = X − Y = atraso descontado". + `shared/version.ts` → 2032. **R-001/R-007/R-010 OK**: ZERO SQL/schema. Reversível em 2 arquivos. **Preservado**: Rev. 2027 (SOMA bate com tabela), Rev. 2029 (full screen + fontes), Rev. 2030 (férias), Rev. 2031 (docs extras) — todas INTACTAS; `observacao` da Rev. 2027 continua aparecendo quando há divergência. **Follow-up**: replicar equação visível nos modais H. Total e Faltas; destacar onde está o gap (saída antecipada vs intervalo estendido); botão Imprimir/PDF no modal.
- **Rev. 2031**: **Terceiros · Editar Funcionário · aba Documentos · botão "+ Adicionar documento" em CADA categoria.** Pedido direto do usuário (img image_1779037833119): "QUERO TER A OPÇÃO DE ADICIONAR MAIS DOCUMENTOS.. EM CADA CATEGORIA, O USUÁRIO PRECISA TER ESTA OPÇÃO PARA FACILITAR O DIA A DIA". Modelo (Revs. 2002/2017) só permitia os campos fixos por coluna (ASO, NR-10/33/35, Integração FC/Cliente, Ficha EPI, OS, Registro, Foto, Certificados). Docs complementares (vacinação, curso extra, licença de cliente) ficavam de fora. **Decisão**: coluna NOVA `documentos_extras` JSONB (em vez de uma coluna por tipo) — array de `{id, categoria, label, url, validade?, uploadedAt}`, categoria=key da seção ("saude_ocupacional", "treinamentos_nr", "integracao_seguranca", "documentos_trabalhistas", "identificacao_qualificacao"); label livre. Zero ALTER TABLE no futuro pra novos tipos. **Mudança** em 5 arquivos: (A) `drizzle/schema.ts` — `funcionariosTerceiros.documentosExtras: jsonb("documentos_extras")` NULLABLE. (B) `server/_core/index.ts` — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS documentos_extras JSONB` idempotente. (C) `server/routers/terceiros.ts` — 3 mutations: `addDocExtra` (upload + APPEND), `removeDocExtra` (filter), `updateDocExtraValidade` (map). (D) `client/src/pages/terceiros/FuncionariosTerceiros.tsx` — `key` em cada seção; state `extraModal/extraLabel/extraValidade/extraFile`; render dos avulsos com chip cinza "Avulso", date picker inline e botão lixeira; botão pleno "+ Adicionar documento" border-dashed na cor da seção em cada categoria; Modal shadcn (Dialog) com 3 campos (Nome*, Validade opcional, Arquivo*); painel de Status soma avulsos em "Total docs"/"Vencidos"/"Vencem ≤30d" (Obrigatórios OK permanece só com fixos). + `shared/version.ts` → 2031. **R-001/R-007/R-010 OK**: única mudança de schema é ADD COLUMN IF NOT EXISTS NULLABLE. Reversível em 5 arquivos. **Preservado**: TODOS os campos fixos e `uploadDoc` (Rev. 1998) INTACTOS; DDS (Revs. 2024/2025) INTACTO; Rev. 2030 INTACTA. **Hotfix pós code-review**: (a) IDOR — as 3 mutations agora carregam o row e chamam `_assertCompanyAccess` antes de upload/update; (b) vazamento entre funcionários — `editingIdRef` (useRef+useEffect) guarda o editingId atual e o `setForm` no onSuccess só aplica se `vars.funcTerceiroId === editingIdRef.current`. **Follow-up**: aplicar mesmo pattern aos `funcionarios` da Construtora; substituir read-modify-write do array JSON por update atômico SQL (`jsonb` append) pra eliminar race em uploads concorrentes; permitir editar label/trocar arquivo; cruzar avulsos com Controle de Documentos pra alertas globais de vencimento; bulk import CSV.
- **Rev. 2030**: **DP · Fechamento de Ponto · Calendário do colaborador reconhece FÉRIAS em gozo e não conta como "Falta provável".** Pedido direto do usuário (img image_1779037756992): "O SISTEMA PRECISA VALIDAR TBM.. NÃO PODE COLOCAR FALTA NESTE PERIODO PQ ELE ESTAVA DE FERIAS, NO CARTÃO DE PONTO DELE DEVERIA APARECER UM AVISO DE FERIAS EM TODOS OS DIAS UTEIS QUE ELES ESTEVE EM GOZO". Caso MARIANA CASTILHO (16/04→15/05) estava em gozo de férias e o calendário mostrava 19 "Faltas prováveis" com 5% presença. **Mudança** em 2 arquivos: (A) `server/routers/fechamentoPonto.ts` (getDiasEmployee, ~30L adicionadas) — SELECT em `vacationPeriods` (3 fracionamentos: dataInicio/Fim + periodo2/3 Inicio/Fim) do colaborador, helper `addRange` expande dia a dia recortado ao período, popula `Set<string>` `feriasSet`; cada item de `dias[]` ganha campo novo `ferias: boolean`. (B) `client/src/pages/FechamentoPonto.tsx` (modal calendário, ~25L mexidas) — `isFerias(d)` puxa `d.ferias` do backend; `totalFaltas` exclui dias em férias; resumo ganha chip cyan "🏖 N dia(s) em férias"; lista de dias com classe sky (bg-sky-50 ring-sky-200) e badge "🏖 Férias" no lugar de "× Falta provável"; prioridade trabalhado > feriado > férias > FDS > falta. Microcopy do rodapé estendido. + `shared/version.ts` → 2030. **R-001/R-007/R-010 OK**: ZERO ALTER TABLE, ZERO mudança de schema, apenas SELECT cruzado + render. Reversível em 2 arquivos. **Preservado**: lógica de feriados (Rev. 2014) INTACTA; modal "Memória de cálculo · Atraso Acumulado" (Rev. 2029) INTACTO; `getSummary` INTACTO; outros usos de vacationPeriods INTACTOS. **Follow-up**: aplicar mesma exclusão à tabela-mãe (`getSummary`) se houver mesmo viés; cobrir afastamentos (atestados longos, INSS, licença maternidade); cruzar com tabela `atestados` no drill-down.
- **Rev. 2029**: **DP · Fechamento de Ponto · Modal "Memória de cálculo · Atraso Acumulado" em FULL SCREEN com fontes maiores.** Pedido direto do usuário (img image_1779037696863): "AUMENTE A TELA, FALA EM TELA FULL SCREEM E TEXTOS MAIORES EU NÃO CONSIGO ENXERGAR DESTE TAMANHO". O modal vinha com `w-[820px] max-w-[95vw] max-h-[88vh]` e fontes pequenas (text-xs/text-[12px]/text-[10px]) ilegíveis em desktop. **Mudança** em 1 arquivo (`client/src/pages/FechamentoPonto.tsx`, ~140L em 1 hunk, ZERO lógica): DialogContent → `w-screen h-screen max-w-none rounded-none border-0`; header padding e ícone dobrados; título text-base → text-2xl; nome em text-lg; conteúdo wrapped em `max-w-7xl mx-auto` (evita esticar em ultrawide); faixa explicativa text-[12px] → text-base; resumo text-sm → text-lg com valores em text-xl; tabela text-xs → text-base com px-5 py-4; badge "+Xh:YYmin" text-[11px] → text-base; observação por linha agora INLINE visível ("⚠ {observacao}") sem mais tooltip escondido; empty-state com ícone h-10 → h-16, título text-xl, descrição text-base; rodapé didático text-[10px] → text-sm. + `shared/version.ts` → 2029. **R-001/R-007/R-010 OK**: ZERO SQL/schema/router, puramente visual (Tailwind+markup). Reversível em 1 arquivo / 1 hunk. **Preservado**: `getAtrasoDetalhe` (router Rev. 2027) INTACTO; princípio "SOMA(dias[].minutos) === tabela" INTACTO; modal Rev. 2019 (anatomia) INTACTA; microcopy "De onde vem o número" da Rev. 2027 INTACTA; fluxo de abertura INTACTO. **Follow-up**: aplicar mesma escalada aos modais H. Total e % Presença; botão "Imprimir / PDF" no próprio modal.
- **Rev. 2028**: **Faxina do `replit.md`** — arquivo cresceu de ~13k tokens (180 linhas, 144 bullets) para ~3k tokens. **Mudança** em 2 arquivos: (A) `replit-history.md` (NOVO) — recebe os one-liners das Revs. 1903 → 2012 (94 entradas), preservando o redirect canônico pra `shared/changelog.ts` (que segue intacto e é fonte de verdade). (B) `replit.md` — bloco "Recent changes" reescrito em 3 camadas: (1) Top-5 detalhado (2028/2027/2026/2025/2024), (2) "Revisões recentes" com 10 one-liners curtos (2023→2014), (3) ponteiro pra `replit-history.md`. Convenção atualizada pra refletir o novo formato (10 one-liners antes do dump pro history). + `shared/version.ts` → 2028. **R-001/R-007/R-010 OK**: ZERO SQL, ZERO schema, ZERO mudança de código de aplicação. Reversível em 2 arquivos. **Preservado**: TODO o histórico técnico em `shared/changelog.ts` INTACTO (zero linha removida); convenção top-5 mantida (só ganhou camada de one-liners curtos antes de mover pro history); Rev. 2027 INTACTA; User preferences INTACTA.
- **Rev. 2027**: **DP · Fechamento de Ponto · BUGFIX: divergência entre tabela e modal "Memória de cálculo · Atraso Acumulado".** Pedido direto do usuário (imgs IMG_0871/0872/0873/0874/0875): "na tela principal mostra muitos com atrasos, mas quando clico na memória diz que não tem atraso, em alguns casos os valores informados na tabela inicial não converge com o número externo da tabela e os valores devem sempre convergir". Casos: WALMIR (tabela 3:35, modal "Nenhum atraso"), CLAUDIO (1:38, modal vazio), FRANCISCO (tabela 2:55, modal 5h24min num dia só). **Causa**: `getSummary` (tabela) SOMA `timeRecords.atrasos` gravado pelo motor (payroll engine: tolerância CLT + abonos + ajuste manual + jornada vigente do dia); `getAtrasoDetalhe` da Rev. 2019 RECALCULAVA do zero (`entrada1 - jornada.entrada > tol`), ignorando o motor. Resultado: divergência sempre que houvesse abono/ajuste/jornada alterada. Princípio violado: fonte única de verdade. **Mudança** em 2 arquivos: (A) `server/routers/fechamentoPonto.ts` (getAtrasoDetalhe, ~55L reescritas no loop) — `minutos` de cada dia agora vem DIRETO de `r.atrasos` (mesma fonte da tabela); linhas com "0:00" puladas; entrada esperada/real exibidas só como CONTEXTO; quando o motor diverge ≥2 min do que "real-esperada-tol" sugere, `observacao` aparece explicando o motivo provável. Garantia: `SOMA(dias[].minutos) === tabela "Atraso Acumulado"` SEMPRE. (B) `client/src/pages/FechamentoPonto.tsx` (faixa explicativa) — microcopy "Como o atraso é calculado: comparamos a 1ª entrada real..." → "De onde vem o número: os valores vêm do mesmo registro de ponto que alimenta a tabela... A soma dos dias bate exatamente com o total da tabela". + `shared/version.ts` → 2027. **R-001/R-007/R-010 OK**: ZERO SQL/schema. Reversível em 2 arquivos.

### Revisões recentes (one-liners)

- ~~Rev. 2026~~ — SST Integração: Modal "Iniciar Integração" refeito sob a regra de ouro (header gradient emerald/teal, dropdown com avatares, 2-col Obra/Configuração). Ver `shared/changelog.ts`.
- ~~Rev. 2025~~ — Terceiros aba DDS: READ-ONLY (remove formulário manual; registros vêm só de sessões coletivas via `sessao_id`). Ver `shared/changelog.ts`.
- ~~Rev. 2024~~ — SST DDS: terceiros no detalhe da sessão + "Transferir colaborador" aceita terceiros. Ver `shared/changelog.ts`.
- ~~Rev. 2023~~ — SST Integração: card de vídeo reproduz upload (mp4/mov/webm) inline com player HTML5 nativo, sem download. Ver `shared/changelog.ts`.
- ~~Rev. 2022~~ — Infra: CompanyContext expõe `companyIdNum: number` + faxina do replit.md + auditoria de bug latente. Ver `shared/changelog.ts`.
- ~~Rev. 2021~~ — SST DDS: funcionários TERCEIROS vinculados à obra entram na lista "Equipe da obra" do modal Nova Sessão. Ver `shared/changelog.ts`.
- ~~Rev. 2020~~ — SST Integração: bugfix companyId coercion (Zod number). Ver `shared/changelog.ts`.
- ~~Rev. 2019~~ — DP Fechamento de Ponto: modal "Memória de cálculo · Atraso Acumulado" (header gradient, tabela dia a dia, empty-state). Ver `shared/changelog.ts`.
- ~~Rev. 2018~~ — SST Integração: barra lateral (DashboardLayout) restaurada. Ver `shared/changelog.ts`.
- ~~Rev. 2017~~ — Terceiros aba Documentos: nova seção "Documentos Trabalhistas" (Ficha de EPI NR-06, OS de SST NR-01, Registro CLT art. 41). Ver `shared/changelog.ts`.
> Revisões anteriores à 2017: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (ver convenção acima — Top-5 detalhado + 10 recentes em one-liner).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
