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

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1876**: **DDS · Sessões · Botão Editar Categoria por linha (override granular: sessão > tema)**. User (16/05/2026, screenshot iPad lista de Sessões + legenda 'Campanhas Govern./NRs/Sem tema vinculado'): 'precisa ter um botão de editar para poder informar as categorias'. **Causa**: categoria era 100% derivada de `dds_temas.categoria` via temaId (JOIN read-only). Sessão sem tema → SEM_TEMA sem como classificar; editar a categoria do tema afetaria todas as outras sessões. **Solução**: snapshot/override por sessão. (1) Schema `drizzle/schema.ts` L8216-8220 + SyncSchema+ `server/_core/index.ts` L856-857: nova coluna `dds_sessoes.categoria VARCHAR(30)` (null=herda do tema; idempotente ADD COLUMN IF NOT EXISTS). (2) Backend `dds.ts`: `listSessoes` L1296-1366 reescrito com `leftJoin(ddsTemas)`+ projeção explícita (`categoria`, `categoriaTema`, `categoriaEfetiva = override ?? tema`); `atualizarSessao` L1986 aceita `categoria: z.enum(['NR','CAMPANHA','VACINACAO','LIVRE']).nullable().optional()` (null limpa override); `getSessao` L1840-1841 inclui `categoria`; `dashboardKpis` sessoesPeriodo L1609 muda para `COALESCE(s.categoria, t.categoria)` (dashboard reflete overrides). (3) Frontend `DDSGuia.tsx`: nova coluna 'Categoria' L1132 (colSpan 8→9), badge clicável colorido por categoria (NR=azul/CAMPANHA=âmbar/VACINACAO=esmeralda/LIVRE=cinza/Sem categoria=cinza itálico) + ícone Pencil + hover-ring; state `editarCategoriaId`, mutation com invalidate de listSessoes+dashboardKpis; modal `max-w-md` com Select 4 opções (label+descrição da regra), dica 'padrão do tema: X', aviso amarelo quando não há temaId, botão 'Limpar (herdar do tema)' visível só com override ativo. **Preservado**: criação, finalizar/assinar, biblioteca, DDSDashboard (já usa coalesce), calendário. Reversível em ~6 hunks. R-001/R-007/R-010 OK.
- **Rev. 1875**: **Programação Semanal LOTUS · Fim de semana respeita calendário MSP por padrão + override granular por atividade (click em sáb/dom)**. User (16/05/2026, screenshot Semana 2 — barras pintando sáb/dom): 'Não houve atividade no domingo, se houve será lançado manualmente. ERP precisa deixar para o engenheiro preencher manualmente as atividades feitas no sáb/dom, caso contrário seguir o calendário do project'. **Causa raiz**: `faixasCelula` (`ProgramacaoSemanalLotus.tsx` L134) já gateava `inPrev` por `ehUtil` (calendário MSP via `parseCalendarioJson`+`ehDiaUtil`) e os branches de auto-derivação do REAL, MAS `inReal` explícito de `dataInicioReal/Fim` (L162) NÃO checava — qualquer atividade com Real cobrindo fds pintava sáb/dom. **Solução** (decidida com user via user_query — granular por atividade, não projeto): (1) Schema `drizzle/schema.ts` L5326-5332 + SyncSchema+ `server/_core/index.ts` L520-522: nova coluna `planejamento_atividades.dias_trabalhados_extras TEXT` (JSON YYYY-MM-DD, default null=respeita MSP). (2) Backend `server/routers/planejamento.ts` L947-994: mutation `toggleDiaTrabalhadoExtra({atividadeId, companyId, data})` com validação multi-tenant, sanitize regex, limite 366 datas. (3) `faixasCelula` L134-238: novo param `diasExtras: Set<string>|null`; `ehUtil = ehUtilCal || diasExtras.has(ds)`; `inReal` agora também gateado por `ehUtil`. (4) UI L1695-1729: célula de sáb/dom (quando calendário não marca como útil) vira clicável (`cursor-pointer hover:bg-indigo-50`, tooltip ＋/☑), `onClick` chama toggle; `useMemo` parseia JSON 1x; `useUtils().planejamento.listarAtividades.invalidate` no onSuccess. **Preservado**: PV/EV/SPI, Curva S, Last Planner, Excel export, drill semanal. Reversível em ~8 hunks. R-001/R-007/R-010 OK.
- **Rev. 1874**: **Colaborador · Isenção de Controle de Jornada (CLT Art. 62) com inciso I/II/III + validação legal + observação**. User (16/05/2026): 'Crie a lógica conforme a lei, para definir como MARCAR o funcionário que é considerado de confiança o que não tem horário e hora extra'. **Sistema já tinha** `cargoConfianca/Desde/Gratificacao` + badge "Art.62" + integração com fechamentoPonto (não gera inconsistência sem_registro). **Adicionado**: (1) Schema `drizzle/schema.ts` L1026-1028 + SyncSchema+ `server/_core/index.ts` L855-860: novas colunas `cargo_confianca_inciso VARCHAR(5)` + `cargo_confianca_observacao TEXT` em employees (idempotente). (2) Backend `server/routers.ts` L559-589 (employees.update): valida inciso ∈ {I,II,III}; II → grat ≥ 40% (Parágrafo único); I → observação ≥ 10 chars (anotação CTPS). (3) Frontend `Colaboradores.tsx` L2115-2192: Select de inciso (com descrição da lei no dropdown), gratificação % condicional só para II, textarea observação com placeholder dinâmico, aviso amarelo sobre prova TST + passivo retroativo. Badge L984 e print L630 mostram inciso real. **Preservado**: fechamentoPonto, folha, HE, employee_change_log (auditoria automática). Reversível em ~6 hunks. R-001/R-007/R-010 OK.
- **Rev. 1873**: **DDS · Nova Sessão · CPF do instrutor → Código Interno (LGPD) com auto-fill**. User (16/05/2026, screenshot iPad): 'Quero que mude o campo CPF PARA CODIGO interno do funcionário, para garantir o lgpd, de forma automática ok'. **Motivação**: CPF é dado sensível; codigoInterno (matrícula RH, já existe em `employees.codigoInterno` varchar 50) é identificador interno seguro. **Schema** (`drizzle/schema.ts` L8205 + SyncSchema+ `server/_core/index.ts` L850-854): nova coluna `dds_sessoes.instrutor_codigo_interno VARCHAR(50)` via ALTER TABLE ADD COLUMN IF NOT EXISTS (idempotente). Coluna `instrutor_cpf` PRESERVADA pra backward-compat com sessões antigas. **Backend** `dds.ts`: zod `instrutorCodigoInterno.max(50).optional()` em criar/atualizarSessao + persiste + projeta no getSessao. **Frontend** `DDSGuia.tsx`: (1) state `instrutorCodigoInterno`; (2) auto-fill no abrirNovaSessao via lookup do user logado em `employeesQ.data`; (3) botão 'Sou eu' também faz o lookup; (4) input nome com `<datalist>` de colaboradores — match exato auto-preenche código; (5) input substituído (placeholder 'Código interno do funcionário', sem máscara CPF, tooltip LGPD). **Preservado**: ZERO mudança em finalizar/assinar/exportar, dashboard, sidebar. Reversível em 7 hunks. R-001 OK (só ADD COLUMN).
- **Rev. 1872**: **DDS Dashboard · Todos os gráficos clicáveis com drill-down fullscreen (regra de ouro) + responsividade reforçada**. User (16/05/2026, 2 screenshots DDS Dashboard iPad): 'Quero todos os gráficos responsivos e quando clicar quero ver cada informação detalhada conforme nossas regras de ouro'. **Backend** `dds.ts` L1750-1781: adicionado `sessoesDetalhe` ao `dashboardKpis` (pré-agrega {id,data,obra,tema,categoria,instrutor,status,mes,dow,total/pres/assin} por sessão, ZERO query extra). **Frontend** `DDSDashboard.tsx` (reescrito): (1) cada gráfico envolto em wrapper `h-[260px] min-h-[220px]` ou proporcional + `ResponsiveContainer 100%/100%` (responsivo de verdade em iPad portrait); (2) onClick em 6 gráficos (line mensal, pie categoria, bar obra/tema/instrutor/dow) → `openDrill(title, filterFn)`; (3) modal fullscreen padrão Rev. 1869/1731 (`resizable={false}` + `w-screen sm:w-[98vw] sm:max-w-[1600px] h-[100dvh] sm:h-[95vh]`); (4) tabela drill com busca em tempo real + export CSV (BOM UTF-8, ';' Excel pt-BR) + botão 'Abrir' → `/sst/dds?sessaoId=X`. **Preservado**: KPIs, biblioteca temas, lista 'Sem DDS', filtros de período intactos. Reversível em 2 hunks. R-001 OK.
