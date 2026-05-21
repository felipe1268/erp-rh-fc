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

- **Rev. 2229** — **CHORE/CLEANUP · Removidas 4 procedures duplicadas (warnings esbuild "Duplicate key") — `getCashFlow`, `markAlertRead`, `getDRE` em `server/routers/financial.ts` + `consolidarPagamento` em `server/routers/payrollEngine.ts`.** Em JS object literal a 2ª chave sobrescreve a 1ª silenciosamente — a 1ª virava código morto e o build emitia warning. Em todas, a 2ª (ativa em produção) foi mantida; removidas as 1ªs (mortas). Frontend não impactado (todas as chamadas já casavam com a 2ª assinatura, conferido via `rg`). Build antes: 4 warnings duplicate. Depois: 0 warnings (resta só info do Lightning CSS sobre `.print\:hidden` que é Tailwind escapado válido, não-fatal). Bundle ~3KB menor. **R-001/R-007/R-010:** N/A (zero SQL/schema, apenas dead code).
- **Rev. 2228** — **FEATURE/UX · Contas a Pagar: (1) sem scroll horizontal (compressão de colunas); (2) botão EXCLUIR duplicidade com confirm+motivo+auditoria; (3) botão ESTORNAR pagamento na aba Pagos com confirm+motivo+auditoria.** Lilian: "ainda está ruim, quero sem barra de rolagem mas com todas as informações sem cortar. Tambem precisa de botão EXCLUIR (pode haver duplicidade), com confirmação e registro de quem excluiu" + "na aba PAGOS precisa ter botão ESTORNAR, pois pode dar baixa errado". Fixes: (1) `FinanceiroContasAPagar.tsx:1146-1154` Categoria vira `<span><Icon/>{cat truncate}</span>` único (era texto + pill ORIGEM duplicado) — economia ~120px/linha; header Ações `w-32`→`w-[140px]` + `px-2`; (2) novo `financial.deleteEntry` (`server/routers/financial.ts:1437`) HARD DELETE com bloqueio se `status='pago'`, motivo mín. 5 chars, snapshot+autor em `createAuditLog({action:'financial_entry_deleted'})`; botão `<Trash2>` vermelho + dialog vermelho com textarea motivo; (3) novo `financial.estornarPagamento` (`server/routers/financial.ts:1394`) reverte `pago→a_pagar`, limpa `data_pagamento/valor_realizado/forma_pagamento/comprovante_url`, append em `observacoes` com timestamp+autor+motivo, `createAuditLog({action:'financial_entry_reversed'})`; botão `<RotateCcw>` âmbar APARECE no lugar do "Pagar" quando `status='pago'`. **R-001/R-007/R-010:** `deleteEntry` faz DELETE user-driven (produto, não admin); mitigação: bloqueia pagos, exige motivo, audita autor+snapshot.

### Revisões recentes (one-liners)

- ~~Rev. 2227~~ — FIX/UX · Tela Contas a Pagar cortava coluna Ações. `FinanceiroContasAPagar.tsx`: L477 `max-w-[1600px]`→`w-full`; L809 `<th>` Ações `sticky right-0 bg-gray-50 w-32`; L1162 `<td>` Ações mesma stickiness + `bg-white group-hover:bg-slate-50`. Tabela já em `overflow-x-auto` → sticky funciona. Ver `shared/changelog.ts`.
- ~~Rev. 2226~~ — FEATURE/UX · Fornecedor/Prestador no modal "Novo Lançamento" Financeiro: agora em AMBOS modos (Único+Recorrente), autocomplete `compras.listarFornecedores`, botão "Cadastrar novo" abre `/compras/fornecedores` em nova aba, DialogContent tela cheia (`max-w-[min(1200px,96vw)] w-[96vw] h-[95vh]`). Ver `shared/changelog.ts`.
- ~~Rev. 2225~~ — FIX/UX · Botão "Cadastrar contas" do Painel Financeiro abria Regime Tributário. `FinanceiroDashboard.tsx:162` `Link href="/financeiro/configuracoes"` → `/contas-bancarias`. Dashboard já lê de `company_bank_accounts` (mesma tabela do cadastro) — só faltava link certo. Novo botão "+ Nova / Gerenciar" no header. Ver `shared/changelog.ts`.
- ~~Rev. 2224~~ — FIX/PARSER · Contrato puxava "R$ 3,20" quando salário base era "3.200" (formato BR de milhar). `client/src/lib/numeroExtenso.ts:17-37` `parseValor` novo ramo `else if (hasDot)`: se último grupo após ponto tem 3 dígitos exatos = milhar BR (strip pontos); senão decimal US. Impacto: contratos, advertências, comunicados via `formatBRL`/`valorPorExtenso`. Ver `shared/changelog.ts`.
- ~~Rev. 2223~~ — UX · Foto do funcionário no alerta "HE aprovada SEM ponto". `HEAprovadaSemPontoAlert.tsx`: avatar (h-5 w-5) com `<AvatarImage src=fotoUrl>` quando existe ou `<AvatarFallback>` com iniciais (cor laranja/azul seguindo seleção). `pl-2`→`pl-1` + `ring-1 ring-white`. Sem backend. Ver `shared/changelog.ts`.

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
