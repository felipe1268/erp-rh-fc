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

- **Rev. 2160** — **HOTFIX continuação da Rev. 2159 · filtrar contas inativas (ativo=0) na tela Plano de Contas.** User: "ainda aparece a linha 3.3". A query `financial.getAccounts` no `FinanceiroPlanoDeConta.tsx` não passava `ativo:true`; backend só filtra quando o param vem, então a órfã `3.3` soft-deletada na Rev. 2159 (ativo=0) continuava aparecendo. **Fix**: 1 linha em `client/src/pages/financeiro/FinanceiroPlanoDeConta.tsx` — adicionar `ativo: true` no `useQuery`. Zero mudança em backend ou dados. **R-001/R-007/R-010:** OK.
- **Rev. 2159** — **DATA-FIX · Migração da conta órfã "3.3 DESPESAS COM MATERIAIS" para "3.2 Materiais de Construção" do plano padrão.** User: "apague esse item e deixe apenas o plano de contas padrão". A órfã (id=1, company_id=60002) tinha **219 lançamentos vinculados** em `financial_entries` — hard-delete violaria FK. Aprovado pelo user (opção A do choice_query): migrar os 219 lançamentos para `3.2 Materiais de Construção` (mesma classificação `custo_obra`) e soft-deletar (`ativo=0`) a órfã — histórico preservado, tela limpa. SQL transacional: `UPDATE financial_entries SET conta_id=56 WHERE conta_id=1` (219 linhas) + `UPDATE financial_accounts SET ativo=0 WHERE id=1`. Conferido: 0 lançamentos restantes na órfã, 219 em `3.2`. **R-001/R-007/R-010:** OK — single-tenant, aprovado pelo user, apenas UPDATE idempotente, sem ALTER/DROP/DELETE. Zero mudança de código de aplicação.

- **Rev. 2150** — **NOVA FEATURE · Termos & Documentos Assinados (FCSign) no Raio-X do funcionário, com Visualizar + Baixar.** User: "O termo precisa estar no raio-x do funcionário tbm... precisa poder visualizar e fazer download". Backend já entregava `fcsignSessions` em `controleDocumentos.raioX` (linha 2032), mas o cliente só usava na timeline — sem botão pra abrir/baixar. **Mudanças em `client/src/components/RaioXFuncionario.tsx`:** (1) novo derivado `fcsignSessions`/`termosFcsign` (filtra status≠cancelado); (2) nova tab `value="termos_fcsign"` no grupo SST (ao lado de Integrações) com ícone FileSignature e count; (3) `<TabsContent>` com card branco + tabela colunas Documento/Tipo/Status (badge color-coded)/Emitido em/Concluído em/Por/Ações (Ver+Baixar); (4) "Ver" abre `finalDocumentUrl` em nova aba quando completo, fallback p/ `/assinar/{token}` se tiver token de signer pendente; "Baixar" usa `<a download>` direto pro HTML auto-contido; (5) labels amigáveis para tipos (termo_responsabilidade→"Termo de Recebimento", contrato_experiencia→"Contrato de Experiência"). **Backend:** zero mudanças. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2149** — **NOVA FEATURE · Multi-seleção + exclusão em lote no painel "Termo de Recebimento".** User: "quero tbm poder fazer multselcao para apagar tudo de uma vez". Antes era 1 clique/lixeira/confirm() por termo. **Mudanças em `client/src/components/controleDocumentos/TermosResponsabilidadePanel.tsx`:** (1) state `selectedIds: Set<number>` + helpers; (2) coluna nova de checkbox c/ "select all visíveis" no header (respeita filtros) + checkbox por linha + highlight `bg-indigo-50/40` na linha selecionada; (3) barra de ação em lote acima da tabela (só visível com seleção) c/ contador + Limpar + botão destrutivo "Excluir selecionados"; (4) `bulkDelete()` faz confirm() único, loop sequencial em `adminDelete.mutateAsync` (evita contention escrevendo em signatures+employee_documents), toast final com resumo ok/fail; gate `isAdminMaster`. **Backend:** nenhum procedure novo, reusa `signatures.adminDelete` (soft-cancel + soft-delete). **R-001/R-007/R-010:** OK.

### Revisões recentes (one-liners)

- ~~Rev. 2158~~ — HOTFIX continuação da Rev. 2157 · botão "Carregar Padrão" sempre visível + seed do plano contábil idempotente (skip por código OU nome). Armadilha: migrar `db.execute(string, params)` → `sql\`...\`` template tag. Ver `shared/changelog.ts`.
- ~~Rev. 2157~~ — Separação Plano de Contas × Categorias (Opção C) — `financial.getAccounts`/`createAccount` ganham param `escopo: plano|categoria|all` + guard do `seedPlanoDeConta` muda pra `COUNT(*) WHERE codigo NOT LIKE 'AUTO-%'`. Ver `shared/changelog.ts`.
- ~~Rev. 2156~~ — NOVA AÇÃO ADM Master · Botão "Excluir" em Centros de Custo (hard-delete com gate `admin_master` + checagem de refs em `financial_recurring_entries`/`financial_accounts`; AlertDialog vermelho). Ver `shared/changelog.ts`.
- ~~Rev. 2155~~ — HOTFIX · "Imprimir Contrato de Experiência" pedia Endereço mesmo com a aba preenchida (Colaboradores.tsx L2122/L1936 só checavam `form.endereco`; aba Endereço usa `form.logradouro`). Fallback adicionado nos 2 pontos. Ver `shared/changelog.ts`.
- ~~Rev. 2154~~ — HOTFIX BUILD · Deploy quebrava porque `RichTextEditor.tsx` não exportava `stripHtml`/`sanitizeHtml`/`isHtmlContent` usados pelo `ComunicadosInternos.tsx`; helpers adicionados + DOMPurify top-level. Ver `shared/changelog.ts`.

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
