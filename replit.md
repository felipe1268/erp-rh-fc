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

- **Rev. 2028**: **Faxina do `replit.md`** — arquivo cresceu de ~13k tokens (180 linhas, 144 bullets) para ~3k tokens. **Mudança** em 2 arquivos: (A) `replit-history.md` (NOVO) — recebe os one-liners das Revs. 1903 → 2012 (94 entradas), preservando o redirect canônico pra `shared/changelog.ts` (que segue intacto e é fonte de verdade). (B) `replit.md` — bloco "Recent changes" reescrito em 3 camadas: (1) Top-5 detalhado (2028/2027/2026/2025/2024), (2) "Revisões recentes" com 10 one-liners curtos (2023→2014), (3) ponteiro pra `replit-history.md`. Convenção atualizada pra refletir o novo formato (10 one-liners antes do dump pro history). + `shared/version.ts` → 2028. **R-001/R-007/R-010 OK**: ZERO SQL, ZERO schema, ZERO mudança de código de aplicação. Reversível em 2 arquivos. **Preservado**: TODO o histórico técnico em `shared/changelog.ts` INTACTO (zero linha removida); convenção top-5 mantida (só ganhou camada de one-liners curtos antes de mover pro history); Rev. 2027 INTACTA; User preferences INTACTA.
- **Rev. 2027**: **DP · Fechamento de Ponto · BUGFIX: divergência entre tabela e modal "Memória de cálculo · Atraso Acumulado".** Pedido direto do usuário (imgs IMG_0871/0872/0873/0874/0875): "na tela principal mostra muitos com atrasos, mas quando clico na memória diz que não tem atraso, em alguns casos os valores informados na tabela inicial não converge com o número externo da tabela e os valores devem sempre convergir". Casos: WALMIR (tabela 3:35, modal "Nenhum atraso"), CLAUDIO (1:38, modal vazio), FRANCISCO (tabela 2:55, modal 5h24min num dia só). **Causa**: `getSummary` (tabela) SOMA `timeRecords.atrasos` gravado pelo motor (payroll engine: tolerância CLT + abonos + ajuste manual + jornada vigente do dia); `getAtrasoDetalhe` da Rev. 2019 RECALCULAVA do zero (`entrada1 - jornada.entrada > tol`), ignorando o motor. Resultado: divergência sempre que houvesse abono/ajuste/jornada alterada. Princípio violado: fonte única de verdade. **Mudança** em 2 arquivos: (A) `server/routers/fechamentoPonto.ts` (getAtrasoDetalhe, ~55L reescritas no loop) — `minutos` de cada dia agora vem DIRETO de `r.atrasos` (mesma fonte da tabela); linhas com "0:00" puladas; entrada esperada/real exibidas só como CONTEXTO; quando o motor diverge ≥2 min do que "real-esperada-tol" sugere, `observacao` aparece explicando o motivo provável. Garantia: `SOMA(dias[].minutos) === tabela "Atraso Acumulado"` SEMPRE. (B) `client/src/pages/FechamentoPonto.tsx` (faixa explicativa) — microcopy "Como o atraso é calculado: comparamos a 1ª entrada real..." → "De onde vem o número: os valores vêm do mesmo registro de ponto que alimenta a tabela... A soma dos dias bate exatamente com o total da tabela". + `shared/version.ts` → 2027. **R-001/R-007/R-010 OK**: ZERO SQL/schema. Reversível em 2 arquivos.
- **Rev. 2026**: **SST · Integração de Segurança · Modal "Iniciar Integração" refeito sob a regra de ouro.** Pedido do usuário (img IMG_0870): "Melhore esta tela conforme a nossa regra de ouro". Modal era chapado (max-w-lg, header só ícone UserPlus verde, dropdown cortando no iPad, sem helper text, CTA sem destaque). **Mudança** em 1 arquivo (~150L em 1 hunk no PendentesTab): `client/src/pages/sst/IntegracaoSST.tsx` — DialogContent `max-w-2xl p-0 gap-0 overflow-hidden`; novo DialogHeader gradient `from-emerald-600 via-teal-600 to-emerald-700` com ShieldCheck em badge branco + subtítulo. Body p-5 com 2 blocos: "Colaborador(es)" (busca h-10 autoFocus, dropdown com avatares gradient emerald→teal, cards de selecionados com X hover vermelho), grid 2-col "Obra" (HardHat amber) + "Configuração" (Sparkles) com helper text Info-ícone explicando "Automática usa a config padrão da empresa". CTA gradient `from-emerald-600 to-teal-600` com Send. Success state também usa o header gradient + link em card emerald-50. +5 ícones lucide. + `shared/version.ts` → 2026. **R-001/R-007/R-010 OK**: ZERO SQL/schema/routers — puramente visual. Reversível em 1 arquivo. **Preservado**: toda lógica (selectedEmps/selectedObraId/selectedConfigId/handleCriar/criarRegistro/criarLote) INTACTA.
- **Rev. 2025**: **Terceiros · aba DDS · READ-ONLY (remove formulário "Registrar Participação em DDS").** Pedido do usuário (img IMG_0869): "Não quero precisar lançar DDS por aqui, quero que apenas fique o registo quando ele participar". Depois da Rev. 2024 (sessão coletiva ↔ terceiros via `sessao_id`), o formulário manual ficou redundante. **Mudança** em 1 arquivo: `client/src/pages/terceiros/FuncionariosTerceiros.tsx` — REMOVE bloco "Form de novo DDS" (~52L); SUBSTITUI por banner indigo-50/40 read-only "Aba somente leitura — registros aparecem automaticamente sempre que este terceiro for marcado em uma sessão de DDS criada em SST › DDS › Nova Sessão". Empty-state do histórico ajustado. Hooks/state/mutations PRESERVADOS — não dão erro de unused e mantêm porta aberta pra admin/import. + `shared/version.ts` → 2025. **R-001/R-007/R-010 OK**: ZERO SQL/schema/routers. Reversível em 1 arquivo. **Preservado**: painel "Frequência em DDS" INTACTO; Histórico INTACTO; backend de criação INTACTO no router.
- **Rev. 2024**: **SST · DDS · Terceiros aparecem no detalhe da sessão + "Transferir colaborador" aceita terceiros (vincula direto à obra).** Pedido do usuário (limitações Rev. 2021 promovidas a prioritário): "vão como follow-up: o Detalhe da sessão ainda não lista os terceiros que participaram (...) O botão Transferir colaborador continua só pra CLT". **Decisão**: nova coluna OPCIONAL `sessao_id` em `dds_participacoes_terceiros` — NULL pra DDS avulso, preenchido quando vem da sessão coletiva. **Mudança** em 4 arquivos: (A) `drizzle/schema.ts` — `ddsParticipacoesTerceiros.sessaoId: integer("sessao_id")` NULLABLE. (B) `server/_core/index.ts` — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS sessao_id INTEGER` idempotente + índice parcial. (C) `server/routers/dds.ts` — `getSessao` anexa `terceiros: []` via LEFT JOIN; `criarSessao` popula `sessaoId`; `colaboradoresParaTransferir` retorna união CLT+Terceiros com `tipo: "clt"|"terceiro"`; `transferirParaObra` aceita `tipo`/`funcTerceiroId`. (D) `client/src/pages/sst/DDSGuia.tsx` — Modal Transferir com chip laranja "TERCEIRO"; SessaoDetalhe lista CLT e terceiros (linhas bg-orange-50/30). + `shared/version.ts` → 2024. **R-001/R-007/R-010 OK**: única mudança de schema é ADD COLUMN IF NOT EXISTS NULLABLE. Reversível em 4 arquivos.

### Revisões recentes (one-liners)

- ~~Rev. 2023~~ — SST Integração: card de vídeo reproduz upload (mp4/mov/webm) inline com player HTML5 nativo, sem download. Ver `shared/changelog.ts`.
- ~~Rev. 2022~~ — Infra: CompanyContext expõe `companyIdNum: number` + faxina do replit.md (Revs. 1988/1989/1990) + auditoria de bug latente. Ver `shared/changelog.ts`.
- ~~Rev. 2021~~ — SST DDS: funcionários TERCEIROS vinculados à obra entram na lista "Equipe da obra" do modal Nova Sessão. Ver `shared/changelog.ts`.
- ~~Rev. 2020~~ — SST Integração: bugfix companyId coercion (Zod number). Ver `shared/changelog.ts`.
- ~~Rev. 2019~~ — DP Fechamento de Ponto: modal "Memória de cálculo · Atraso Acumulado" (header gradient, tabela dia a dia, empty-state). Ver `shared/changelog.ts`.
- ~~Rev. 2018~~ — SST Integração: barra lateral (DashboardLayout) restaurada. Ver `shared/changelog.ts`.
- ~~Rev. 2017~~ — Terceiros aba Documentos: nova seção "Documentos Trabalhistas" (Ficha de EPI NR-06, OS de SST NR-01, Registro CLT art. 41). Ver `shared/changelog.ts`.
- ~~Rev. 2016~~ — SST Integração: modal de vídeo destrava criação de Config padrão inline (auto-seleção + empty-state com CTA). Ver `shared/changelog.ts`.
- ~~Rev. 2015~~ — DP Fechamento de Ponto: avatares clicáveis com foto + selo CIPA Ativo/Estabilidade em modais de ranking. Ver `shared/changelog.ts`.
- ~~Rev. 2014~~ — DP Fechamento de Ponto: feriados (federais/estaduais/municipais) deixam de contar como falta + chip âmbar no drill-down. Ver `shared/changelog.ts`.

> Revisões anteriores à 2014: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (ver convenção acima — Top-5 detalhado + 10 recentes em one-liner).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
