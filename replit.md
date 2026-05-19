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

- **Rev. 2166** — **MELHORIA UX + NOVA AÇÃO · Plano de Contas ganha ordenação natural por código, geração automática de código via "Conta Pai", e botões Editar/Excluir por linha.** User reportou 3 problemas (print anexado): (1) "4.9 Honorários" criada no topo da lista em vez de embaixo da "4.8 Software e Licenças" — backend ordenava por `ordem ASC, codigo ASC` e `ordem=0` jogava tudo pra cima; (2) pediu "ao selecionar a conta, a numeração venha automática"; (3) pediu botões editar/excluir. **Backend** (`financial.ts`): novo procedure `deleteAccount({id, companyId})` — soft-delete (`ativo=0`) com checagem de refs em `financial_entries.conta_id` + filhas via `financial_accounts.conta_pai_id` (cada SELECT em try/catch próprio, mesma estratégia da Rev. 2163). **Frontend** (`FinanceiroPlanoDeConta.tsx`): novo `cmpCodigo` faz sort natural (`"4.9" < "4.10" < "5"`); novo `suggestNextCode(parent, all)` calcula próximo filho disponível; combobox "Conta Pai" (Popover + cmdk) herda tipo/natureza do pai e ajusta nível ao escolher; botões Pencil/Trash2 inline (hover) abrem dialog em modo edição ou `AlertDialog` vermelho de exclusão. Código fica disabled em edição (evita quebrar lançamentos vinculados). Exclui a própria conta + descendentes da lista de pais elegíveis pra evitar ciclo. **R-001/R-007/R-010:** OK — `deleteAccount` é UPDATE, sem ALTER/DROP/DELETE.
- **Rev. 2165** — **MELHORIA UX · Campo "Plano de Contas (opcional)" no dialog de Categoria virou combobox pesquisável (Popover + cmdk).** Sequência da Rev. 2162 — user mandou print do `<select>` nativo ocupando metade do dialog (50+ contas) e pediu literalmente "deixe a barra em aberto para poder digitar". **Frontend** (`FinanceiroCategorias.tsx`): novo componente local `PlanoDeContaCombobox` (final do arquivo) substitui o `<select>`. Stack `Popover` + `Command`/`CommandInput`/`CommandList`/`CommandItem` — mesmo padrão do combobox de funcionário em `AvisoPrevio.tsx` (linhas 2358-2421). `Command.filter` normaliza acentos via `NFD` + regex `\u0300-\u036f`, busca case/acento-insensitive; `CommandItem.value = "{codigo} {nome}"` aceita digitar código contábil OU pedaço do nome. Trigger custom mostra "código · nome" + ChevronsUpDown + "×" inline pra limpar; PopoverContent `w-[var(--radix-popover-trigger-width)]` alinha largura ao trigger; item "— Não vincular —" no topo. **Backend:** zero mudanças (procedure `financial.getAccounts({escopo:"plano",ativo:true})` já existia desde 2162). **R-001/R-007/R-010:** OK — só client-side.


- **Rev. 2150** — **NOVA FEATURE · Termos & Documentos Assinados (FCSign) no Raio-X do funcionário, com Visualizar + Baixar.** User: "O termo precisa estar no raio-x do funcionário tbm... precisa poder visualizar e fazer download". Backend já entregava `fcsignSessions` em `controleDocumentos.raioX` (linha 2032), mas o cliente só usava na timeline — sem botão pra abrir/baixar. **Mudanças em `client/src/components/RaioXFuncionario.tsx`:** (1) novo derivado `fcsignSessions`/`termosFcsign` (filtra status≠cancelado); (2) nova tab `value="termos_fcsign"` no grupo SST (ao lado de Integrações) com ícone FileSignature e count; (3) `<TabsContent>` com card branco + tabela colunas Documento/Tipo/Status (badge color-coded)/Emitido em/Concluído em/Por/Ações (Ver+Baixar); (4) "Ver" abre `finalDocumentUrl` em nova aba quando completo, fallback p/ `/assinar/{token}` se tiver token de signer pendente; "Baixar" usa `<a download>` direto pro HTML auto-contido; (5) labels amigáveis para tipos (termo_responsabilidade→"Termo de Recebimento", contrato_experiencia→"Contrato de Experiência"). **Backend:** zero mudanças. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2149** — **NOVA FEATURE · Multi-seleção + exclusão em lote no painel "Termo de Recebimento".** User: "quero tbm poder fazer multselcao para apagar tudo de uma vez". Antes era 1 clique/lixeira/confirm() por termo. **Mudanças em `client/src/components/controleDocumentos/TermosResponsabilidadePanel.tsx`:** (1) state `selectedIds: Set<number>` + helpers; (2) coluna nova de checkbox c/ "select all visíveis" no header (respeita filtros) + checkbox por linha + highlight `bg-indigo-50/40` na linha selecionada; (3) barra de ação em lote acima da tabela (só visível com seleção) c/ contador + Limpar + botão destrutivo "Excluir selecionados"; (4) `bulkDelete()` faz confirm() único, loop sequencial em `adminDelete.mutateAsync` (evita contention escrevendo em signatures+employee_documents), toast final com resumo ok/fail; gate `isAdminMaster`. **Backend:** nenhum procedure novo, reusa `signatures.adminDelete` (soft-cancel + soft-delete). **R-001/R-007/R-010:** OK.

### Revisões recentes (one-liners)

- ~~Rev. 2164~~ — MELHORIA UX · AlertDialog de excluir Centro de Custo mostra vínculos detalhados (novo procedure `getCostCenterLinks` + componente `DeleteCostCenterDialog` com tabela das categorias vinculadas; bloqueia exclusão se houver refs). Ver `shared/changelog.ts`.
- ~~Rev. 2163~~ — HOTFIX · "Excluir Centro de Custo" devolvia `Unexpected end of JSON input` — `financial_recurring_entries.centro_custo_id` não existia; cada SELECT do `deleteCostCenter` agora em try/catch próprio (coluna ausente vira warn + 0 refs). Ver `shared/changelog.ts`.
- ~~Rev. 2162~~ — NOVO CAMPO · Vincular Categoria ao Plano de Contas via `conta_pai_id` (reaproveitamento da coluna self-FK existente); update `financial.updateAccount` ganha `contaPaiId` no Zod; frontend novo select indentado por nível + badge indigo na lista. Ver `shared/changelog.ts`.
- ~~Rev. 2161~~ — HOTFIX BUILD · syntax error em `FinanceiroCategorias.tsx` (vírgula dupla `,,` no `createMut.mutate` depois da Rev. 2157). Quebra do objeto em múltiplas linhas + remoção da vírgula extra. Ver `shared/changelog.ts`.
- ~~Rev. 2160~~ — HOTFIX continuação da Rev. 2159 · filtrar contas inativas (`ativo:true`) na query de Plano de Contas (a órfã 3.3 soft-deletada continuava aparecendo). 1 linha em `FinanceiroPlanoDeConta.tsx`. Ver `shared/changelog.ts`.

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
