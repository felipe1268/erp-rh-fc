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

- **Rev. 1835**: **Planejamento · Curva S Financeira — distribuição working time MSP (AACE 80R-13 §5.3 / Mattos), elimina retangular**. User (15/05/2026, screenshots Curva S Financeira × Trabalho do REVTE-CIVIL): "pq o formato é diferente? não deveria ser igual?" → após discussão da literatura (PMBOK/EVM, AACE, MSP, Mattos), pediu "implante a leitura correta". **Causa pré-existente**: `getCurvaSFinanceira` (`server/routers/planejamento.ts` L5582-5607) distribuía R$ LINEARMENTE pelas semanas (`semValor = valorAtiv / dur`) → curva RETANGULAR, não-S. Violava AACE 80R-13 §5.3 (PV deve seguir resource loading real). Atividades caras antecipadas (Tapumes/Mobilização) inflavam início artificialmente. **Fix (1 arquivo, 2 hunks)**: (1) L5532-5546 query do projeto seleciona `calendarioJson`+`dataInicio`+`dataTerminoContratual`; `parseCalendarioJson` gera `calMspFin` (parser unificado, mesmo do `getCurvaS`). (2) L5582-5650 bloco de distribuição reescrito: estrutura `FolhaFin` per-leaf pré-parseada alimenta 2 caminhos. Caminho MSP (calMSP presente): BCWS(W) = Σ valor_i × `fracaoDecorridaMs(ini_i, min(sun_W, fim_i), fim_i, calMSP)` por Monday do envelope; mesma estrutura iterativa de `gerarCurvaPlanejadaMSP` (Rev. 1689.1). Caminho fallback (XML sem calMSP): mantém algoritmo retangular legado idêntico. **Preservado**: BCWP, receita, tendência, contrato `pontos[]`, `valorPorAtiv` map, `totalVenda`. Zero schema/migration/DELETE/contrato tRPC. Reversível em 2 hunks. **Compliance**: AACE 80R-13 §5.3 + PMBOK 7ª/EVM Practice Std + MSP nativo + Mattos cap. 12. **Esperado REVTE-CIVIL**: Financeira ganha forma de S real, próxima da Trabalho, divergindo só pela escala (R$ vs %) e antecipação de mobilização (working time, não retangular). R-001/R-007/R-010 OK.
- **Rev. 1834**: **Planejamento · Importer MSP — barra de progresso mais responsiva + mensagem por estágio (acaba a sensação de 'travou no 88%')**. User (15/05/2026, screenshot 'Processando arquivo... 88%' no REVTE-CIVIL): "pq quando chega no 88% ele trava e demora muito?". **Causa pré-existente (Rev. 1822)**: backend processa o XML inteiro em transação única, sem streaming. Frontend usava curva assintótica `+ (99-p)*0.06 / 120ms` que desacelerava dramaticamente (p=88→+0,66pp/tick, p=95→+0,24pp/tick); 88→99 demorava ~10s e depois pinava em 99% por 20-60s aguardando INSERT no Postgres. Sem feedback de estágio = parecia travamento. **Fix (1 arquivo, 4 hunks)**: (1) L687-707 curva mais agressiva — tick 100ms, decay 0.10, min 0.20pp → 90% em ~2s, 95% em ~3s, 99% em ~6s. (2) L696/700/715 novo state `progressoTotalAtv` propagado por `iniciarProgresso(totalAtividades)`. (3) L720-730 função `progressoMensagem(p, totalAtv)` com 4 estágios: 'Lendo arquivo MS Project…' (<30), 'Convertendo N atividades…' (<75), 'Enviando para o servidor…' (<95), 'Salvando N atividades no banco — projetos grandes podem levar até 60s…' (<100, >300 atv) ou 'Salvando no banco — pode levar alguns segundos…'. (4) L946 + L1427-1448 — JSX usa msg dinâmica, spans `truncate`+`shrink-0`. **Honestidade**: usuário sabe explicitamente que aos ~95-99% a espera é o INSERT no Postgres. Zero schema/migration/DELETE/contrato. Reversível em 4 edits. R-001/R-007/R-010 OK.
- **Rev. 1833**: **Planejamento · Paridade MSP TRAVADA — toggle removido, ERP sempre pondera por duração**. User (15/05/2026, após Rev. 1832): "só quero o MSP, não quero outra informação". **Fix (1 arquivo, 2 hunks)**: (1) `PlanejamentoDetalhe.tsx` L251-258 — state `usarPesoPorDuracao`+localStorage da Rev. 1832 substituídos por `const usarPesoPorDuracao = true`. Sem opção de toggle. Árvore inteira (avancoAtual, AvancoSemanal, Refis, pvPonderado) recebe `true` e pondera por `duracaoDias`. (2) L911-928 — toggle 2-botões substituído por badge estático azul '📐 Paridade MSP (Duração)' com tooltip da fórmula (Σ AD_leaf / Σ Duration_leaf). **Por que é seguro**: caminho 'duracao' já existia desde Rev. 1343, ativado pela Rev. 1832, agora vira único. Previsto LIVE intocado (usa `pctRaizMSP` Rev. 1825). Entradas órfãs em localStorage `planejamentoPesoBase:*` ficam sem efeito. **Esperado**: REVTE-CIVIL Realizado bate com a coluna '% concluída' da raiz MSP (~1%). Reversível em 2 edits. Zero schema/migration. R-001/R-007/R-010 OK.
- **Rev. 1832**: **Planejamento · Toggle 'Peso Financeiro ↔ Duração (MSP)' — paridade ABSOLUTA com a coluna '% concluída' do MS Project**. User (15/05/2026, screenshots da tabela MSP do REVTE-CIVIL com raiz='1%'): "quero paridade absoluta — o projeto não apresenta estes valores, o valor está aparecendo 1%". **Causa pré-existente**: `PlanejamentoDetalhe.tsx` L250 era `const usarPesoPorDuracao = false` desde Rev. 1343 — toda a árvore (avancoAtual, AvancoSemanal, Refis, pvPonderado) ponderava por `pesoFinanceiro` (EVM clássico). MSP nativo faz rollup por DURAÇÃO em working time: `% Complete = Σ AD_leaf / Σ Duration_leaf`. Para REVTE-CIVIL, folhas caras (Tapumes/Mobilização ~28% peso × ~28% pct) inflavam → 2,12% por custo vs ~1% por duração. **Fix (1 arquivo, 2 hunks)**: (1) L250 vira **state** persistido em `localStorage[planejamentoPesoBase:${projetoId}]` ('financeiro'|'duracao'), default 'financeiro' (preserva histórico). (2) L911-933 banner 'Avanço Físico' troca badge estático por **toggle 2-botões** (mesmo design do Live/Oficial Rev. 1637): 💰 Peso Financeiro (amber) ↔ 📐 Duração (MSP) (azul). **Por que é seguro**: árvore inteira já recebia `usarPesoPorDuracao` como prop (L1034/1071/1090/1103) — constante false só desativava caminho 'duracao' que JÁ EXISTIA. Reativar via state recompõe avanço físico topo + AvancoSemanal cards + Refis. **Previsto LIVE intocado** — usa `pctRaizMSP` (Rev. 1825), puramente temporal sobre envelope raiz. Toggle muda principalmente REALIZADO. **Esperado REVTE-CIVIL SEMANA 1**: 💰 → 2,12% (EVM); 📐 → ~1% (paridade MSP). Zero schema/migration/DELETE. Reversível em 2 edits. R-001/R-007/R-010 OK.
- **Rev. 1831**: **Aviso Prévio · modal 'Dar Baixa' redimensionado — sem barra de rolagem global**. User (15/05/2026, screenshot c/ scrollbar vertical no modal de Multa FGTS): "redistribua o tamanho dessa tela para que não precise da barra de rolagem". **Causa**: `client/src/pages/AvisoPrevio.tsx` L3120 — DialogContent em `max-w-xl` (576px) + conteúdo grande (BAIXAS REGISTRADAS + 3 cards Tipo da Baixa + valor + obs + checkbox + footer) excedia `max-h-[85vh]` default do shadcn → scroll global, footer fora da viewport. **Fix (1 edit, 2 hunks)**: DialogContent vira `sm:max-w-3xl max-h-[92dvh] flex flex-col p-0 gap-0`; DialogHeader ganha padding próprio + `border-b shrink-0`; div body interno vira `flex-1 overflow-y-auto min-h-0` (scroll APENAS no body); DialogFooter `px-6 py-4 border-t shrink-0 bg-white`. **Resultado**: ≥768px cabe sem scroll; telas menores rolam só o miolo, footer/header sempre visíveis. Lógica intocada (handleConfirmarBaixa, darBaixa mutation, darBaixaForm). R-001 OK.
