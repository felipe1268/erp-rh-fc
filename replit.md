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

- **Rev. 2217** — **UX/HE · Alerta "HE aprovada SEM ponto batido" na aba Aprovações.** Lilian (21/05/2026): "pode acontecer de ter solicitação de HE aprovada, mas o funcionário não bateu o ponto.. precisa colocar um alerta pra o RH analisar se paga ou não". Cenário: funcionário esquece de bater ponto facial → folha gera "sem solicitação" (na verdade tem, só falta o ponto pra cruzar) e RH não consegue separar casos legítimos (HE retroativa manual) dos que de fato não fizeram. Fix: nova procedure `heSolicitacoes.aprovadasSemPonto` (`server/routers/heSolicitacoes.ts:184-264`) com raw SQL `JOIN he_solicitacao_funcionarios + LEFT JOIN employees/obras` + `NOT EXISTS` contra `time_records` (filtra `horasTrabalhadas IN ('','0:00','00:00','0:0')`), respeitando `getEffectiveAllowedObraIds` (R-007). Frontend `SolicitacaoHE.tsx` ganhou `aprovadasSemPontoQuery` (L293) + badge laranja no mini-resumo + card laranja no topo da aba Aprovações agrupando por solicitação, com pills clicáveis abrindo Raio-X e botão "Ver solicitação". Só aparece quando há ≥1 caso. **R-001/R-007/R-010:** OK — apenas SELECT.
- **Rev. 2216** — **FIX/PAYROLL · Memorial de Cálculo de HE agora reconhece feriados (nacionais fixos, móveis e custom).** Lilian (21/05/2026): "o ERP não esta considerando os feriados, note que teve atividade no dia 01/05 e ele está considerando como dia normal". Print: 01/05/2026 (Sex — Dia do Trabalho) calculado como dia útil normal (jornada 8:00, HE 0:17, 60%) quando deveria ser feriado (jornada 0:00, 8:17 inteiras em HE 100%) → sub-pagamento. Causa: `computeHEForPeriod` + `memorialCalculo` (`server/routers/horasExtras.ts`) só checavam `dow === 0` para disparar bucket "fim de semana"; feriado em dia útil era ignorado. Fix: novo helper `getFeriadosSetForPeriod(db, companyIds, dataInicio, dataFim)` exportado de `server/routers/feriados.ts` (unifica banco + FERIADOS_NACIONAIS + móveis), pré-carregado nas duas funções e tratado idêntico a domingo (`expectedMins = 0`, percentual `he_domingos_feriados`). Payload ganhou `feriado: boolean` e UI `FolhaPagamento.tsx` (L3294/L5471) pinta linha em roxo claro + badge "Fer". Recálculo da folha aplica o ajuste retroativo aos períodos ainda não-aprovados. **R-001/R-007/R-010:** OK — sem ALTER/DROP/DELETE.

### Revisões recentes (one-liners)

- ~~Rev. 2215~~ — UX/LAYOUT · Tela Contas a Pagar usa largura estendida (1600px) — `FinanceiroContasAPagar.tsx:480` `max-w-7xl` → `max-w-[1600px]`, coluna "Ações" não corta mais. Ver `shared/changelog.ts`.
- ~~Rev. 2214~~ — FIX/UX · Lançamentos recorrentes aparecem automaticamente em Contas a Pagar. Novo helper `materializeRecorrentes(db, companyId, horizonteMeses)` (`server/routers/financial.ts:94-187`) idempotente chamado por `getContasAPagarByYear` ANTES do SELECT (horizonte = meses até fim do ano consultado, capado em 13). Ver `shared/changelog.ts`.
- ~~Rev. 2213~~ — UX/CRUD · Botão "Excluir" nos Lançamentos Recorrentes. Nova procedure `financial.deleteRecurringEntry` + UI Trash2 vermelho com `confirm()` em `FinanceiroRecorrentes.tsx`. Lançamentos já materializados em `financial_entries` permanecem intactos. Ver `shared/changelog.ts`.
- ~~Rev. 2212~~ — HOTFIX · Contagem "N membros" dos cards de grupo não atualizava ao trocar usuário (mesmo após Rev. 2211). `handleQuickSetGroup` agora awaita `Promise.all([list.refetch(), listAllMembers.refetch(), getMembers.invalidate()])` antes do toast. Ver `shared/changelog.ts`.
- ~~Rev. 2211~~ — HOTFIX · Trocar grupo do usuário não atualizava painel "Membros do Grupo" do grupo antigo. `setGroupsMut.onSuccess` agora invalida `userGroups.getMembers` (sem filtro) + `userGroups.list`. Ver `shared/changelog.ts`.

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

> Revisões 2098 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
