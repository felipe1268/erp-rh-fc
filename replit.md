# ERP Gestão Integrada — FC Engenharia

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

- **Rev. 4603** — **FEAT: CONTRATO DE PRESTAÇÃO DE SERVIÇOS — 7 REFORÇOS ANTI-DESCARACTERIZAÇÃO (CLT).** Análise pelo art. 3º da CLT aplicada ao modelo: removida "de mão de obra" do título/objeto (agora "por resultado"); cláusula de substituição INVERTIDA (antes vedava substituir = pessoalidade; agora permite equipe própria/substituição livre com comunicação, vedada só a cessão do contrato); nova seção "DA NÃO EXCLUSIVIDADE E DA ASSUNÇÃO DOS RISCOS" (2 cláusulas: multi-cliente expresso + riscos/recursos próprios/refazimento como obrigação de resultado); Parágrafo único na 3ª (SEM controle de jornada/ponto/frequência); EPIs às expensas da CONTRATADA; prorrogação tácita removida (só Termo Aditivo expresso). 20→22 cláusulas com renumeração automática por código (Poka-Yoke). Propagado aos 2 constants do server + Neon template id 8 republicado Vigente (versão 14). Arquivos: `pjContracts.ts`, `controleDocumentos.ts`. ZERO schema change.
- **Rev. 4602** — **FEAT: CONTRATO PJ → "CONTRATO DE PRESTAÇÃO DE SERVIÇOS" — NOVO MODELO DO JURÍDICO + VALOR TOTAL COM MEDIÇÕES MENSAIS (BLINDAGEM B2B).** Template renomeado (interfaces e documento; chave interna `contrato_pj` intacta) e corpo substituído pelo modelo do jurídico (20 cláusulas, art. 593 CC): autonomia, inexistência de vínculo, sigilo/LGPD, rescisão 30 dias sem multa. Objeto/atividades vêm AUTOMÁTICOS do cadastro do prestador; cláusulas fixas de SST do DOCX descartadas. Novidade validada com o usuário: contrato declara VALOR TOTAL ([VALOR_TOTAL_CONTRATO/EXTENSO] = mensal × mesesDeVigencia) com desembolso via MEDIÇÕES mensais (percentuais/dias do ciclo), descaracterizando periodicidade salarial. `gerarTexto` resolve todos os novos placeholders + valor por extenso real (`valorPorExtensoBR`); `extrairClausulas` adaptado. Neon: template id 8 publicado DIRETO como Vigente (Rev. 13). Arquivos: `pjContracts.ts`, `controleDocumentos.ts`, `contratoPrazo.ts`, `documentTemplates.ts`, `contratoPjDocument.ts`, `FCSignPJSendDialog.tsx`, `ContratoPJView.tsx`. ZERO schema change.
### 5 one-liners

- **Rev. 4601** — **FIX: CONCILIAÇÃO — ESTORNO DEIXAVA LANÇAMENTO ÓRFÃO E CHEQUE PRESO → DUPLICIDADES NO FLUXO DE CAIXA.** `desconciliarLinha` cancela lançamentos de origem `cheque_conciliacao` e libera cheques baixados; flags `orfaoA/orfaoB` destacam o lado órfão no card. Cheques 347/393 curados. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4600** — **FIX: CONTAS A PAGAR — CHEQUES RESPEITAM O "PRAZO ENTRE PARCELAS" DO CICLO DO FORNECEDOR.** Backend anota `cicloPrazoParcela/cicloNumParcelas/cicloFormaPagamento` em todo título com ciclo; front usa `addDaysISO` (1º venc + i×prazo) nos 3 pontos + "Em quantas vezes" pré-preenchido. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4599** — **UX: CONTAS A PAGAR — SETINHAS −/+ NA QUANTIDADE DE CHEQUES + VALORES NO PADRÃO BR (1.234,56).** `QtdStepper` no "Em quantas vezes" (Pagar/Editar) + campos de valor text/inputMode=decimal com formatação BR no blur via `parseValorBR`. Detalhe em `shared/changelog.ts`. ZERO schema/server change.
- **Rev. 4598** — **UX: CONTAS A PAGAR — PAGAMENTO COM CHEQUE PRÓPRIO SÓ LISTA CONTAS COM TALÃO.** Poka-Yoke nível 3: seletor de Conta Bancária dos diálogos "Pagar"/"Editar" filtra só contas com `temTalao === 1`; seleção limpa se a conta atual não tem talão. Detalhe em `shared/changelog.ts`. ZERO schema/server change.
- **Rev. 4597** — **UX: CONTAS A PAGAR — CONTA BANCÁRIA PREENCHE BANCO/AGÊNCIA/CONTA DO CHEQUE AUTOMATICAMENTE.** Poka-Yoke nível 3: seleção da conta nos diálogos "Pagar"/"Editar" auto-preenche Banco/Agência/Conta do bloco "Cheque Empresa"; campos seguem editáveis. Detalhe em `shared/changelog.ts`. ZERO schema/server change.
### Histórico completo

Ver `replit-history.md` para revisões Rev. 4596 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — POKA-YOKE EM TODA REVISÃO (25/07/2026):** Toda nova revisão/feature deve aplicar o princípio Poka-Yoke (à prova de erros): preferir SEMPRE o nível mais forte viável — (3) prevenção pelo design (máscara/select/campo que só aceita valor válido) > (2) bloqueio (validação que impede salvar dado inconsistente, ex.: data no passado, valor zero, duplicidade) > (1) aviso (alerta visual). Ao revisar um fluxo existente, identificar e propor Poka-Yokes faltantes na área tocada.

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
