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

- **Rev. 1897**: **Planejamento · Programação Semanal LOTUS · EXPORT EXCEL · Convenção 4-CÉLULAS-POR-DIA reforçada com guard defensivo final**. User (16/05/2026, 3 screenshots zoom J/K/L/M Seg-Qui): "note que os dias da semana tem 4 ceculas, a primeira fica vazia, a segunda fica demarcado em azul como previsto, a terceira é preenchida se for executada/não executada/outro status conforme legenda, e a 4 fica em branco.. este detalhe é importante ser respeitado". **Causa**: o init em L1202-1207 zera fills das 4 linhas (cols 10-16) por `pattern:"none"`, mas alguns templates trazem fills herdados em `pattern:"solid"` com `fgColor` que sobrevivem ao reset em certas builds do ExcelJS, fazendo r0/r0+3 aparecerem pintados em alguns viewers. **Mudança** (em `ProgramacaoSemanalLotus.tsx` L1381-1395 doc + L1443-1455 guard): (1) comentário-doc da convenção LOTUS reforçado no topo do bloco; (2) NOVO loop final após pintura por dia: força `fill: pattern:"solid", fgColor:FFFFFFFF` (BRANCO SÓLIDO, ajuste pós-architect — `pattern:"none"` só replica o reset do init e não derruba fgColor herdado que LibreOffice/Excel Online reaplicam) em r0 e r0+3 nas cols 10-14 (Seg-Sex). Cols 15-16 (Sáb/Dom) intocadas — preserva cinza_fds Rev. 1893. (3) version → 1897. **Preservado**: Rev. 1886 (TOP azul + atrasado migra p/ BOTTOM=vermelho), Rev. 1894 (cutoff), Rev. 1895 (sem espelhamento), Rev. 1875 (dias extras sobrescrevem cinza no loop antes do guard). Zero backend/DB/schema/tela (UI usa JSX dedicado). Reversível em 2 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1896**: **Planejamento · Cronograma · NOVO badge do RESPONSÁVEL ao lado do nome de cada atividade**. User (16/05/2026, screenshot): "Queria que aparece um card simples aqui indicando que a atividade é d responsabilidade de xx pessoa.. assim fica claro saber que se não foi indicado fica sendo de responsabilidade da construtora..". **Contexto**: o campo ciano `responsavelLotus` só aparece quando ativado; sem indicação manual o default era invisível. **Mudança** (em `PlanejamentoDetalhe.tsx` L4031-4084, dentro do flex do Input nome): badge `<span>` IIFE após o Input, usando `a.responsavel` (Rev. 1817/1891). Cor por tipo: FC=cinza, manual=ciano, contrato_terceiro=azul, externa=âmbar. Texto = `labelCurto`, tooltip Radix com `label` completo + descrição (FC = "responsabilidade da construtora"). Não aparece em `isGrupo`/`disabled`. Zero custo extra (campo já vem do servidor). version → 1896. **Preservado**: Input ciano, checkbox manual, cascata grupo (Rev. 1892), modal cascadeResp (Rev. 1860/1865), Input externa (Rev. 1641). Sem `responsavel` populado cai no fallback FC. Zero backend/DB/schema. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
- **Rev. 1895**: **Planejamento · Programação Semanal LOTUS · EXPORT EXCEL · Removido espelhamento que pintava AZUL nas DUAS faixas** (topo+baixo) quando havia só previsto sem realizado. User (16/05/2026, 2 screenshots): "TEM UM ERRO CONCEITUAL, O PREVISTO EM AZUL EM CIMA ESTA CORRETO, POREM ABAIXO A COR IRÁ VARIAR CONFORME INDICADO NA LEGENDA.. MAS NÃO TEM COR AZUL E EM CIMA COMO ESTA ACONTECENDO HOJE.. O AZUL É AO PREVISTO QUE FICA NO TOPO, ABAIXO FICA O STATUS CONFORME A LEGENDA". **Causa**: bloco legado em `handleExportExcel` L1419-1424 espelhava a única faixa nas DUAS linhas — `corTop && !corBot` copiava o azul p/ r0+2, criando barra cheia azul. Conceito LOTUS: TOPO=PLANO (azul), BAIXO=STATUS (verde/vermelho/laranja/amarelo) ou VAZIO. **Mudança** (em `ProgramacaoSemanalLotus.tsx` L1416-1431): REMOVIDOS os 2 ramos de espelhamento. Mantido `if (corTop) fill r0+1` e `if (corBot) fill r0+2`. Cada faixa pinta APENAS sua linha. version → 1895. **Preservado**: Rev. 1886 (TOP sempre azul + atrasado migra p/ BOTTOM=vermelho) intacta — garante que célula nunca fica só com bottom. Rev. 1893 (cinza Sáb/Dom), Rev. 1894 (cutoff guard), Rev. 1875 (dias extras) intactas. Tela (UI) usa JSX dedicado sem espelho — só o export precisava do fix. Zero backend/DB/schema/tela. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
- **Rev. 1894**: **Planejamento · Programação Semanal LOTUS · PINTURA DE PREVISTO E REALIZADO agora RESPEITA o CUTOFF** (tela + export Excel). User (16/05/2026, screenshot do Excel): "TEM OUTRO ERRO, A PINTURA DEVE DO PREVISTO E REALIZADO REVE RESPEITAR O CUTOFF". **Causa**: `faixasCelula(...)` pintava o envelope previsto completo + qualquer real, ignorando o status-date oficial. Padrão LOTUS/PMBOK: relatório é foto da obra ATÉ o cutoff — dias > cutoff devem ficar EM BRANCO. **Mudanças** (em `ProgramacaoSemanalLotus.tsx`): (1) L168-174: novo parâmetro `cutoffStr: string|null = null` em `faixasCelula`. (2) L177-178: guard `if (cutoffStr && ds > cutoffStr) return {top:null, bottom:null}` corta TODA pintura após o cutoff. (3) L326-335: novo memo `cutoffStrGlobal = cutoffIso?.slice(0,10) ?? null` acessível por tela + export. (4) L1399 (export) e L1798 (tela): passam `cutoffStrGlobal` no `faixasCelula` — paridade absoluta. (5) version → 1894. **Preservado**: Rev. 1785 (PPC fechamento semana), Rev. 1875 (sáb/dom extras), Rev. 1664.1/1677/1688 (auto-derivação real), Rev. 1886 (override TOP=azul no export), Rev. 1893 (cinza Sáb/Dom) INTACTAS — cutoff só REMOVE pintura > cutoff; ds ≤ cutoff roda como antes. Sem cutoffIso, comportamento legado. Zero backend/DB/schema. Reversível em 4 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1893**: **Planejamento · Programação Semanal LOTUS · EXPORT EXCEL · Sábado (col 15) e Domingo (col 16) agora SAEM PREENCHIDOS DE CINZA** conforme padrão do cliente. User (16/05/2026, 2 screenshots): "FALTA PREENCHER DE CINZA OS DIAS DE SABADO E DOMINGO CONFOREM O PADRAO DO CLIENTE". **Causa**: Rev. 1889 fez `fill:none` em B-P das linhas de grupo p/ tirar cinza herdado — limpou demais e arrancou Sáb/Dom também. Nas linhas de tarefa, o template não tinha cinza confiável e o loop de dias só pinta quando há previsto/realizado. **Mudanças** (em `ProgramacaoSemanalLotus.tsx` dentro de `handleExportExcel`): (1) L1306-1321: novo helper `pintaCinzaFds(r0)` aplica `#FFD9D9D9` nas 4 linhas do slot em cols 15 e 16. (2) L1334: strip da linha de grupo mudou `cIdx<=16` → `cIdx<=14` (não arranca mais cinza de Sáb/Dom). (3) L1339: após strip, chama `pintaCinzaFds` na linha de grupo. (4) L1345-1349: na linha de tarefa, chama `pintaCinzaFds` ANTES do loop dos dias — cinza vira fundo padrão e `dias.forEach` sobrescreve naturalmente quando há trabalho em sáb/dom (Rev. 1875). (5) version → 1893. **Preservado**: Rev. 1886/1889 INTACTAS (override azul/status, minWidths E/F/G/H=12, strip cols 2-14 grupo), Rev. 1818 (responsavel.labelCurto), Rev. 1875 (dias_trabalhados_extras sobrescreve quando há faixa). Zero backend/DB/schema/tela. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
