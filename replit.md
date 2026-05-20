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

- **Rev. 2172** — **HOTFIX · Data de Nascimento (e validades de documentos) do Funcionário Terceiro "sumiam" ao reabrir — bug de DISPLAY, não de persistência.** User: "coloco a data de nascimento, aparece uma mensagem que salvou, mas se eu sair da tela e voltar novamente, a data some". Causa em `client/src/pages/terceiros/FuncionariosTerceiros.tsx:469`: `value={form.dataNascimento?.split("T")[0] || ""}`. Schema Drizzle declara `timestamp({ mode: "string" })` e o driver `pg` retorna timestamps como `"1990-05-15 00:00:00"` (com **espaço**, sem `T`) — `split("T")[0]` devolve a string inteira, inválida pra `<input type="date">` → browser exibe vazio. A data ESTÁ salva no banco (confirmado via psql information_schema: coluna existe, sem triggers, sem CHECK), só não renderiza. **Fix:** trocar `.split("T")[0]` por `String(x).slice(0, 10)` que tolera os 3 formatos da natureza (`YYYY-MM-DD`, `YYYY-MM-DD HH:MM:SS`, `YYYY-MM-DDTHH:...`). Aplicado em 3 inputs do mesmo arquivo (L469 nascimento, L769 validades fixas, L813 validades extras). L922 (`extraValidade`) é state local, intacto. **Follow-up:** existem outros `split("T")[0]` em outros módulos — refactor pra helper `toDateInputValue` fica como tarefa fora do hotfix. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2171** — **HOTFIX UX · Modal "Novo Lançamento" (Financeiro) cortava o footer e escondia o botão Salvar em telas médias.** Print do user: dialog rolado até o fim mostrava Forma/Natureza/Adicionar observações mas SEM footer. User: "redistribua a tela de uma forma que apareça tudo, aqui nao está aparecendo o botao de salvar". Causa em `client/src/pages/financeiro/FinanceiroLancamentos.tsx:579`: `DialogContent` sem `max-h` nem `flex flex-col`, body com `max-h-[60vh]` → soma `header(~22vh) + body(60vh) + footer(~10vh) ≈ 92vh` sem teto no container, footer caía fora em viewports ~700px. **Fix em 3 linhas:** (1) `DialogContent` ganhou `flex flex-col max-h-[90vh]`; (2) header e footer ganharam `shrink-0`; (3) body trocou `max-h-[60vh]` por `flex-1 min-h-0` (o `min-h-0` é obrigatório em flex-children scrolláveis senão o flexbox ignora o `overflow` por causa do `min-height: auto` default). Header e footer agora sempre visíveis, body rola dentro. **R-001/R-007/R-010:** OK — só CSS de modal.


- **Rev. 2150** — **NOVA FEATURE · Termos & Documentos Assinados (FCSign) no Raio-X do funcionário, com Visualizar + Baixar.** User: "O termo precisa estar no raio-x do funcionário tbm... precisa poder visualizar e fazer download". Backend já entregava `fcsignSessions` em `controleDocumentos.raioX` (linha 2032), mas o cliente só usava na timeline — sem botão pra abrir/baixar. **Mudanças em `client/src/components/RaioXFuncionario.tsx`:** (1) novo derivado `fcsignSessions`/`termosFcsign` (filtra status≠cancelado); (2) nova tab `value="termos_fcsign"` no grupo SST (ao lado de Integrações) com ícone FileSignature e count; (3) `<TabsContent>` com card branco + tabela colunas Documento/Tipo/Status (badge color-coded)/Emitido em/Concluído em/Por/Ações (Ver+Baixar); (4) "Ver" abre `finalDocumentUrl` em nova aba quando completo, fallback p/ `/assinar/{token}` se tiver token de signer pendente; "Baixar" usa `<a download>` direto pro HTML auto-contido; (5) labels amigáveis para tipos (termo_responsabilidade→"Termo de Recebimento", contrato_experiencia→"Contrato de Experiência"). **Backend:** zero mudanças. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2149** — **NOVA FEATURE · Multi-seleção + exclusão em lote no painel "Termo de Recebimento".** User: "quero tbm poder fazer multselcao para apagar tudo de uma vez". Antes era 1 clique/lixeira/confirm() por termo. **Mudanças em `client/src/components/controleDocumentos/TermosResponsabilidadePanel.tsx`:** (1) state `selectedIds: Set<number>` + helpers; (2) coluna nova de checkbox c/ "select all visíveis" no header (respeita filtros) + checkbox por linha + highlight `bg-indigo-50/40` na linha selecionada; (3) barra de ação em lote acima da tabela (só visível com seleção) c/ contador + Limpar + botão destrutivo "Excluir selecionados"; (4) `bulkDelete()` faz confirm() único, loop sequencial em `adminDelete.mutateAsync` (evita contention escrevendo em signatures+employee_documents), toast final com resumo ok/fail; gate `isAdminMaster`. **Backend:** nenhum procedure novo, reusa `signatures.adminDelete` (soft-cancel + soft-delete). **R-001/R-007/R-010:** OK.

### Revisões recentes (one-liners)

- ~~Rev. 2170~~ — DIAGNÓSTICO · `dbExecute` do Financeiro agora propaga causa real do PG (code/constraint/column/detail/hint) via try/catch + log `[dbExecute][PG ERROR]` + re-throw `Error("DB: <diag>")` com `.cause` preservada. Não é fix definitivo — instrumentação pra próxima retentativa da Lilian. Ver `shared/changelog.ts`.
- ~~Rev. 2169~~ — MELHORIA UX · Campo "Função" no cadastro de Colaboradores virou combobox pesquisável (FuncaoCombobox no final de Colaboradores.tsx, mesmo padrão do PlanoDeContaCombobox/Rev.2165). Setor NÃO convertido (escopo enxuto). Ver `shared/changelog.ts`.
- ~~Rev. 2168~~ — HOTFIX BLOQUEANTE · Cadastro de colaborador falhava com `Failed query: SELECT COALESCE(MAX(CAST(REGEXP_REPLACE("codigoInterno", ... AS INTEGER)) ... params: 60002` — `getMaxCodigoInternoNumero` em `server/db.ts:516` estourava INT4 (codigoInterno c/ 10+ dígitos). Fix: CAST AS BIGINT + WHERE LENGTH BETWEEN 1 AND 9 + NULLIF + try/catch fail-open. Ver `shared/changelog.ts`.
- ~~Rev. 2167~~ — HOTFIX iPad · Upload de NR-10 em Funcionários Terceiros falhava com toast "Arquivo muito grande (máx 10MB)" — novo `client/src/lib/imageCompress.ts` (canvas resize→1920px + JPEG q=0.82, HEIC funciona no Safari), `handleUpload`/`handlePickExtraFile` viraram async + cap 25MB. Ver `shared/changelog.ts`.
- ~~Rev. 2166~~ — MELHORIA UX + NOVA AÇÃO · Plano de Contas: ordenação natural por código (`cmpCodigo`), combobox "Conta Pai" + `suggestNextCode` (herda tipo/natureza/nivel do pai), botões Pencil/Trash2 inline, novo backend `deleteAccount` (soft-delete + check refs). Hotfix pós-review: campo Nível liberado em edição. Ver `shared/changelog.ts`.

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
