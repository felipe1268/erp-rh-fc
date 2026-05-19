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

- **Rev. 2156** — **NOVA AÇÃO ADM Master · Botão "Excluir" em Centros de Custo (hard-delete com guarda de referências).** User: "Em Centro de Custo, preciso ter um botão para excluir (apenas para login adm master)". **Backend** — nova procedure `financial.deleteCostCenter` em `server/routers/financial.ts` após `updateCostCenter`: (1) gate `ctx.user.role==='admin_master'`; (2) SELECT prévio pra confirmar escopo de `company_id`; (3) checagem de refs em `financial_recurring_entries` e `financial_accounts` (confirmado via information_schema — só essas têm `centro_custo_id`); se vinculado, `BAD_REQUEST` pedindo inativar; (4) DELETE real só se sem vínculos. **Frontend** — `client/src/pages/financeiro/FinanceiroCentrosCusto.tsx`: import `Trash2`+`usePermissions`, state `confirmDelete`+mutation com refetch, botão ghost vermelho ao lado do Power renderizado só com `isAdminMaster`, `<AlertDialog>` "Excluir centro de custo?" com warning. **R-001/R-007/R-010:** OK — DELETE controlado pelo app é o mesmo padrão da Rev. 2135 (`signatures.adminDelete`); sem ALTER/DROP/migração.
- **Rev. 2155** — **HOTFIX · "Imprimir Contrato de Experiência" pedindo Endereço mesmo com a aba preenchida.** User: "Não consigo gerar o contrato pra imprimir, fala que preciso preencher o endereço, porém essa informação está preenchida" (Lilian — endereço todo OK na aba Endereço). **Causa raiz:** o form tem 2 campos legados — `endereco` (antigo) e `logradouro` (atual, usado pela aba Endereço — `set("logradouro", ...)` L1617). O helper `empEnderecoRaw` (L466) já fazia o fallback correto, mas a validação consolidada da Rev. 2136 (L2122) e a montagem do HTML do contrato (L1936) checavam só `form.endereco` → validação bloqueava + contrato sairia com endereço em branco. **Fix em `client/src/pages/Colaboradores.tsx`:** (1) L2122 troca `if (!form.endereco?.trim())` por `if (!(form.endereco?.trim() || (form as any).logradouro?.trim()))`; (2) L1936 troca `esc(form.endereco || '')` por `esc(form.endereco || (form as any).logradouro || '')`. `cidade`/`estado` já consistentes; só `endereco` divergia. **Backend:** zero. **R-001/R-007/R-010:** N/A — só client-side.
- **Rev. 2150** — **NOVA FEATURE · Termos & Documentos Assinados (FCSign) no Raio-X do funcionário, com Visualizar + Baixar.** User: "O termo precisa estar no raio-x do funcionário tbm... precisa poder visualizar e fazer download". Backend já entregava `fcsignSessions` em `controleDocumentos.raioX` (linha 2032), mas o cliente só usava na timeline — sem botão pra abrir/baixar. **Mudanças em `client/src/components/RaioXFuncionario.tsx`:** (1) novo derivado `fcsignSessions`/`termosFcsign` (filtra status≠cancelado); (2) nova tab `value="termos_fcsign"` no grupo SST (ao lado de Integrações) com ícone FileSignature e count; (3) `<TabsContent>` com card branco + tabela colunas Documento/Tipo/Status (badge color-coded)/Emitido em/Concluído em/Por/Ações (Ver+Baixar); (4) "Ver" abre `finalDocumentUrl` em nova aba quando completo, fallback p/ `/assinar/{token}` se tiver token de signer pendente; "Baixar" usa `<a download>` direto pro HTML auto-contido; (5) labels amigáveis para tipos (termo_responsabilidade→"Termo de Recebimento", contrato_experiencia→"Contrato de Experiência"). **Backend:** zero mudanças. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2149** — **NOVA FEATURE · Multi-seleção + exclusão em lote no painel "Termo de Recebimento".** User: "quero tbm poder fazer multselcao para apagar tudo de uma vez". Antes era 1 clique/lixeira/confirm() por termo. **Mudanças em `client/src/components/controleDocumentos/TermosResponsabilidadePanel.tsx`:** (1) state `selectedIds: Set<number>` + helpers; (2) coluna nova de checkbox c/ "select all visíveis" no header (respeita filtros) + checkbox por linha + highlight `bg-indigo-50/40` na linha selecionada; (3) barra de ação em lote acima da tabela (só visível com seleção) c/ contador + Limpar + botão destrutivo "Excluir selecionados"; (4) `bulkDelete()` faz confirm() único, loop sequencial em `adminDelete.mutateAsync` (evita contention escrevendo em signatures+employee_documents), toast final com resumo ok/fail; gate `isAdminMaster`. **Backend:** nenhum procedure novo, reusa `signatures.adminDelete` (soft-cancel + soft-delete). **R-001/R-007/R-010:** OK.

### Revisões recentes (one-liners)

- ~~Rev. 2154~~ — HOTFIX BUILD · Deploy quebrava porque `RichTextEditor.tsx` não exportava `stripHtml`/`sanitizeHtml`/`isHtmlContent` usados pelo `ComunicadosInternos.tsx`; helpers adicionados + DOMPurify top-level. Ver `shared/changelog.ts`.
- ~~Rev. 2153~~ — NOVA AÇÃO ADM Master · Botão "Zerar Termos" no Raio-X (aba "Termos Assinados") pra limpar termos de recebimento em bulk (filtrado estritamente a `tipo==='termo_responsabilidade'` pra não tocar contratos de experiência — ver código Rev. 2135). Ver `shared/changelog.ts`.
- ~~Rev. 2152~~ — UX/CLEANUP · Sessões FCSign canceladas deixam de poluir a Timeline Cronológica do Raio-X (early-return em `controleDocumentos.raioX` no `fcsignRows.forEach`; soft, sem DELETE em prod). Ver `shared/changelog.ts`.
- ~~Rev. 2151~~ — UX POLISH · Dialog "Novo Termo de Recebimento" repaginado com a identidade FC (faixa azul #1B2A4A, uppercase letter-spacing 3px, avatar com iniciais). Ver `shared/changelog.ts`.
- ~~Rev. 2150~~ — Termos & Documentos Assinados (FCSign) no Raio-X do funcionário, com Visualizar + Baixar (nova tab "Termos Assinados" no grupo SST). Ver `shared/changelog.ts`.

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
