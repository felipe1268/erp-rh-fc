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

- **Rev. 4000** — **BANCO DE HORAS: DÉBITOS AUTOMÁTICOS DE ATRASO/FALTA E DSR (GERADOS PELA FOLHA) GRAVAVAM `minutos` NEGATIVO, INVERTENDO O SALDO MENSAL NA ABA "SALDOS".** Achado em revisão de código: `debito_atraso_falta`/`debito_dsr` (Rev. 3977/3983) gravavam `minutos` negativo em `banco_horas_lancamentos`, mas toda leitura agregada (Rev. 3996 `getSaldoBancoMensal`, totais da aba Extrato) assume `minutos` sempre positivo com sinal derivado do `tipo` — dupla-negação inflava o saldo mensal (débito virava crédito na soma) e duplicava o sinal visual no card "Débito Atraso/Falta". O saldo TOTAL do funcionário (`banco_horas_saldo`) nunca esteve errado, só a coluna de detalhe. Fix: INSERTs em `payrollEngine.ts` agora gravam `minutos`/`minutosBase` positivos (igual ao débito manual); reversão idempotente usa `ABS()`; `getSaldoBancoMensal`/`getResumoMensalBanco` também usam `ABS()` como defesa extra; as 93 linhas históricas já gravadas negativas tiveram o sinal corrigido direto no Neon. ZERO DELETE de linhas · ZERO ALTER de schema.

- **Rev. 3999** — **CONTAS A PAGAR: BUSCA POR FORNECEDOR/OC AGORA PROCURA NO ANO INTEIRO, NÃO SÓ NO MÊS ABERTO NA TELA.** Usuário buscou "eletrogu" e só viram 2 títulos, mesmo tendo várias OCs desse fornecedor (confirmado no Neon: dezenas de lançamentos, incluindo um com vencimento em outro mês e outro com `data_vencimento` NULL). Causa: a busca por texto rodava sobre `mesData` (lista já filtrada pelo mês selecionado no navegador de meses), não sobre `allContas` (ano inteiro, já carregado do backend) — um fornecedor com títulos em outros meses ou sem data de vencimento ficava invisível mesmo estando nos dados do cliente. Fix: com termo de busca ativo, `filtered` passa a usar `allContas`; título/mensagem de vazio avisam que a busca abrange o ano todo; busca também passou a checar `fornecedorNome`. Sem busca, comportamento por mês inalterado. ZERO DELETE · ZERO ALTER.

### 5 one-liners

- **Rev. 3998** — **CORRIGIDO 404 "ARQUIVO NÃO ENCONTRADO" EM ANEXOS COM ESPAÇO NO NOME QUANDO O DISCO EFÊMERO JÁ NÃO TINHA MAIS A CÓPIA LOCAL.** `decodeURIComponent` faltando no fallback do banco em `/uploads` (server/_core/index.ts) fazia a chave nunca bater com `file_key`. ZERO DELETE · ZERO ALTER.

- **Rev. 3997** — **FOLHA DE PAGAMENTO: CAMPO "LÍQUIDO" GANHA EDIÇÃO INLINE (LÁPIS → INPUT → SALVAR/CANCELAR), IGUAL À FOLHA DE VALE.** Nova mutation `payrollEngine.editarLiquidoFolha` (espelha `editarLiquidoVale`); força líquido final, zera arredondamento, guard de pagamento consolidado, badge "Editado". ZERO DELETE · ZERO ALTER.

- **Rev. 3996** — **BANCO DE HORAS: ADICIONADO NAVEGADOR MENSAL (ESTILO FOLHA DE PAGAMENTO) NA ABA "SALDOS".** Dois endpoints novos (`getSaldoBancoMensal`/`getResumoMensalBanco`) reconstroem histórico mensal a partir dos lançamentos; Card de navegação ano/mês, débito desabilitado fora do mês corrente. ZERO DELETE · ZERO ALTER.

- **Rev. 3995** — **VERIFICAÇÃO CRUZADA (FOLHA): CORRIGIDA COLUNA "LÍQUIDO ERP" QUE MOSTRAVA VALOR ~100x MAIOR DO QUE O REAL.** Causa: `verificacaoCruzada` lia `payroll_payments.salarioLiquido` (formato US "1394.00") com `parseBRL()` (assume BR), virando 139400; fix detecta formato pela vírgula antes de escolher o parser. ZERO DELETE · ZERO ALTER.

- **Rev. 3994** — **BENEFÍCIOS DE ALIMENTAÇÃO: CORRIGIDA A EDIÇÃO QUE REABRIA CONFIGURAÇÕES JÁ ENCERRADAS + TELA GANHA VISIBILIDADE/CONTROLE DE VIGÊNCIA.** UPDATE só altera `vigencia_fim` quando enviado explicitamente; tela ganha coluna "Vigência" (badges) e inputs de Início/Fim. ZERO DELETE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3993 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
