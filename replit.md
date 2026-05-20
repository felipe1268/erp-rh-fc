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

- **Rev. 2174** — **HOTFIX UX · Erro cru do Postgres (23505 / `uq_fa_company_lower_nome_ativo`) vazava no toast ao editar conta do Plano de Contas — traduzido pra mensagem amigável.** Print Lilian: editando "3.1 TESTE" pra "Mão de Obra Direta" (sob "3 CUSTOS DIRETOS"), toast mostrava `DB: code=23505 | constraint=uq_fa_company_lower_nome_ativo | ... | msg=duplicate key value violates unique constraint`. Causa real: já existe outra conta ATIVA com nome "Mão de Obra Direta" no company 60002 (índice único parcial `(company_id, lower(nome)) WHERE ativo=1`). **Fix em `server/routers/financial.ts` updateAccount:** envolver `dbExecute(UPDATE)` em try/catch que detecta `code=23505` (via `e.cause.code` enriquecido pela Rev. 2170 ou `e.code` direto), constraint `uq_fa_*`, ou mensagem `duplicate key`. Para `uq_fa_company_lower_nome_ativo`, lança `TRPCError BAD_REQUEST` com "Já existe uma conta ATIVA com este nome nesta empresa. Renomeie a outra conta primeiro, ou edite-a diretamente." Genéricas mencionam a constraint pra debug. `createAccount` já tinha tratamento próprio (L194-202: SELECT-by-name + idempotente alreadyExists=true). **Out of scope:** auto-resolver conflito. **R-001/R-007/R-010:** OK.
- **Rev. 2173** — **HOTFIX BLOQUEANTE · Edição de código contábil no Plano de Contas era silenciosamente ignorada — não dava pra reorganizar filhos órfãos.** Print Lilian: item "3 CUSTOS DIRETOS" tinha intermediário "3.1 TESTE" com Salários/Encargos/13º/PJ virando 3.1.1/3.1.2/3.1.3/3.1.4. Ela queria estes como filhos diretos de "3" (3.2/3.3/3.4/3.5). "porque? pois mesmo editanto, esses níveis nao estao mudando". **Causa dupla:** (1) `server/routers/financial.ts:207` `updateAccount` zod NÃO aceitava `codigo` — silenciosamente descartado antes do UPDATE; (2) `client/src/pages/financeiro/FinanceiroPlanoDeConta.tsx` — `onPickParent` mantinha `codigo: f.codigo` em edição (`codigo: f.id ? f.codigo : next`); `handleSave` update branch não enviava `codigo`. **Fix em 3 partes:** (a) backend ganha `codigo: z.string().optional()` + validação reusada do `createAccount` (regex `^[0-9]+(\.[0-9]+){0,4}$`, bloqueia `AUTO-*`); (b) `onPickParent` agora sempre sugere `next` mesmo editando — user pode digitar manual depois; (c) `handleSave` update envia `codigo: form.codigo`. Cenário pós-fix: trocar Conta Pai de "3.1.1 Salários" para "3" → código auto-vira "3.2" e nivel=2, salva. **Out of scope:** auto-renumerar siblings em cascata — move manual mantém controle 100% na user. **R-001/R-007/R-010:** OK.


- **Rev. 2150** — **NOVA FEATURE · Termos & Documentos Assinados (FCSign) no Raio-X do funcionário, com Visualizar + Baixar.** User: "O termo precisa estar no raio-x do funcionário tbm... precisa poder visualizar e fazer download". Backend já entregava `fcsignSessions` em `controleDocumentos.raioX` (linha 2032), mas o cliente só usava na timeline — sem botão pra abrir/baixar. **Mudanças em `client/src/components/RaioXFuncionario.tsx`:** (1) novo derivado `fcsignSessions`/`termosFcsign` (filtra status≠cancelado); (2) nova tab `value="termos_fcsign"` no grupo SST (ao lado de Integrações) com ícone FileSignature e count; (3) `<TabsContent>` com card branco + tabela colunas Documento/Tipo/Status (badge color-coded)/Emitido em/Concluído em/Por/Ações (Ver+Baixar); (4) "Ver" abre `finalDocumentUrl` em nova aba quando completo, fallback p/ `/assinar/{token}` se tiver token de signer pendente; "Baixar" usa `<a download>` direto pro HTML auto-contido; (5) labels amigáveis para tipos (termo_responsabilidade→"Termo de Recebimento", contrato_experiencia→"Contrato de Experiência"). **Backend:** zero mudanças. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2149** — **NOVA FEATURE · Multi-seleção + exclusão em lote no painel "Termo de Recebimento".** User: "quero tbm poder fazer multselcao para apagar tudo de uma vez". Antes era 1 clique/lixeira/confirm() por termo. **Mudanças em `client/src/components/controleDocumentos/TermosResponsabilidadePanel.tsx`:** (1) state `selectedIds: Set<number>` + helpers; (2) coluna nova de checkbox c/ "select all visíveis" no header (respeita filtros) + checkbox por linha + highlight `bg-indigo-50/40` na linha selecionada; (3) barra de ação em lote acima da tabela (só visível com seleção) c/ contador + Limpar + botão destrutivo "Excluir selecionados"; (4) `bulkDelete()` faz confirm() único, loop sequencial em `adminDelete.mutateAsync` (evita contention escrevendo em signatures+employee_documents), toast final com resumo ok/fail; gate `isAdminMaster`. **Backend:** nenhum procedure novo, reusa `signatures.adminDelete` (soft-cancel + soft-delete). **R-001/R-007/R-010:** OK.

### Revisões recentes (one-liners)

- ~~Rev. 2172~~ — HOTFIX display · Data de Nascimento/validades do Funcionário Terceiro "sumiam" ao reabrir — `split("T")[0]` em `FuncionariosTerceiros.tsx` quebra com timestamp PG `"YYYY-MM-DD HH:MM:SS"` (espaço, sem T). Fix: `String(x).slice(0, 10)` em 3 inputs (L469/L769/L813). Ver `shared/changelog.ts`.
- ~~Rev. 2171~~ — HOTFIX UX · Modal "Novo Lançamento" (Financeiro) com `DialogContent flex flex-col max-h-[90vh]` + header/footer `shrink-0` + body `flex-1 min-h-0` — footer (botão Salvar) agora sempre visível em viewports ~700px. Ver `shared/changelog.ts`.
- ~~Rev. 2170~~ — DIAGNÓSTICO · `dbExecute` do Financeiro agora propaga causa real do PG (code/constraint/column/detail/hint) via try/catch + log `[dbExecute][PG ERROR]` + re-throw `Error("DB: <diag>")` com `.cause` preservada. Não é fix definitivo — instrumentação pra próxima retentativa da Lilian. Ver `shared/changelog.ts`.
- ~~Rev. 2169~~ — MELHORIA UX · Campo "Função" no cadastro de Colaboradores virou combobox pesquisável (FuncaoCombobox no final de Colaboradores.tsx, mesmo padrão do PlanoDeContaCombobox/Rev.2165). Setor NÃO convertido (escopo enxuto). Ver `shared/changelog.ts`.
- ~~Rev. 2168~~ — HOTFIX BLOQUEANTE · Cadastro de colaborador falhava com `Failed query: SELECT COALESCE(MAX(CAST(REGEXP_REPLACE("codigoInterno", ... AS INTEGER)) ... params: 60002` — `getMaxCodigoInternoNumero` em `server/db.ts:516` estourava INT4 (codigoInterno c/ 10+ dígitos). Fix: CAST AS BIGINT + WHERE LENGTH BETWEEN 1 AND 9 + NULLIF + try/catch fail-open. Ver `shared/changelog.ts`.

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
