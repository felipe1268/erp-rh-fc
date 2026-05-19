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

- **Rev. 2169** — **MELHORIA UX · Campo "Função" no cadastro de Colaboradores (aba Pessoal) virou combobox pesquisável.** User: "NAS FUNÇÕES PRECISO QUE A BARRA FIQUE ABERTA PARA DIGITAR, FACILITANDO A PESQUISA DAS FUNCÇOES" (print: dropdown enorme sem busca). Lista de funções é grande (AJUDANTE DE BOMBA DE CONCRETO, ALMOXARIFE, ANALISTA DE DADOS, ARMADOR, ARQUITETO URBANISTA, etc.) e o `<Select>` nativo do shadcn obrigava scroll cego. **Frontend** (`client/src/pages/Colaboradores.tsx`): novo componente local `FuncaoCombobox` no final do arquivo — mesmo padrão do `PlanoDeContaCombobox` (Rev. 2165): Popover + `Command`/`CommandInput`/`CommandList`/`CommandItem`; `Command.filter` normaliza acentos via NFD + regex `\u0300-\u036f`; largura via `w-[var(--radix-popover-trigger-width)]`; trigger custom mostra a função + "×" inline pra limpar; item "— Selecione a função —" no topo desseleciona; sort `localeCompare("pt-BR")`. Imports novos: `Popover*`, `Command*`, `ChevronsUpDown`, `Check`, `cn`. Escopo enxuto: Setor NÃO foi convertido (user pediu só Função; se reclamar vira follow-up rápido). **Backend:** zero. **R-001/R-007/R-010:** OK.
- **Rev. 2168** — **HOTFIX BLOQUEANTE · Cadastro de colaborador (Pessoal → Salvar) falhava com toast vermelho `Failed query: SELECT COALESCE(MAX(CAST(REGEXP_REPLACE("codigoInterno", '\D', '', 'g') AS INTEGER)), 0) AS max_num ... params: 60002`.** Print do user (LILIAN OLIVEIRA VELOSO DO AMARAL, companyId=60002): toast ao salvar. Causa-raiz: `getMaxCodigoInternoNumero` em `server/db.ts:516` (introduzido na Rev. 2118) faz `CAST AS INTEGER` no dígito do `codigoInterno` pra ressincronizar `companies.nextCodigoInterno`. Algum employee dessa empresa tinha código com 10+ dígitos (provavelmente CPF/telefone colado por engano no passado), estourando INT_MAX (2.147.483.647). Como o helper roda DENTRO do `createEmployee` antes do INSERT, falha bloqueia o cadastro inteiro. **Fix (3+1 camadas):** (1) `CAST AS BIGINT` no lugar de `INTEGER` (suporta 9.2 × 10^18); (2) WHERE extra `LENGTH(REGEXP_REPLACE(...)) BETWEEN 1 AND 9` ignora códigos lixo com 10+ dígitos; (3) `NULLIF(..., '')` blindando contra `CAST('' AS BIGINT)`; (4) try/catch fail-open ao redor da query → retorna 0 + warn no log se algo ainda explodir (counter `nextCodigoInterno` continua funcionando sozinho). **Frontend:** zero mudanças (toast era propagação do erro do Postgres via tRPC). **R-001/R-007/R-010:** OK — só mudou SQL de leitura.


- **Rev. 2150** — **NOVA FEATURE · Termos & Documentos Assinados (FCSign) no Raio-X do funcionário, com Visualizar + Baixar.** User: "O termo precisa estar no raio-x do funcionário tbm... precisa poder visualizar e fazer download". Backend já entregava `fcsignSessions` em `controleDocumentos.raioX` (linha 2032), mas o cliente só usava na timeline — sem botão pra abrir/baixar. **Mudanças em `client/src/components/RaioXFuncionario.tsx`:** (1) novo derivado `fcsignSessions`/`termosFcsign` (filtra status≠cancelado); (2) nova tab `value="termos_fcsign"` no grupo SST (ao lado de Integrações) com ícone FileSignature e count; (3) `<TabsContent>` com card branco + tabela colunas Documento/Tipo/Status (badge color-coded)/Emitido em/Concluído em/Por/Ações (Ver+Baixar); (4) "Ver" abre `finalDocumentUrl` em nova aba quando completo, fallback p/ `/assinar/{token}` se tiver token de signer pendente; "Baixar" usa `<a download>` direto pro HTML auto-contido; (5) labels amigáveis para tipos (termo_responsabilidade→"Termo de Recebimento", contrato_experiencia→"Contrato de Experiência"). **Backend:** zero mudanças. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2149** — **NOVA FEATURE · Multi-seleção + exclusão em lote no painel "Termo de Recebimento".** User: "quero tbm poder fazer multselcao para apagar tudo de uma vez". Antes era 1 clique/lixeira/confirm() por termo. **Mudanças em `client/src/components/controleDocumentos/TermosResponsabilidadePanel.tsx`:** (1) state `selectedIds: Set<number>` + helpers; (2) coluna nova de checkbox c/ "select all visíveis" no header (respeita filtros) + checkbox por linha + highlight `bg-indigo-50/40` na linha selecionada; (3) barra de ação em lote acima da tabela (só visível com seleção) c/ contador + Limpar + botão destrutivo "Excluir selecionados"; (4) `bulkDelete()` faz confirm() único, loop sequencial em `adminDelete.mutateAsync` (evita contention escrevendo em signatures+employee_documents), toast final com resumo ok/fail; gate `isAdminMaster`. **Backend:** nenhum procedure novo, reusa `signatures.adminDelete` (soft-cancel + soft-delete). **R-001/R-007/R-010:** OK.

### Revisões recentes (one-liners)

- ~~Rev. 2167~~ — HOTFIX iPad · Upload de NR-10 em Funcionários Terceiros falhava com toast "Arquivo muito grande (máx 10MB)" — novo `client/src/lib/imageCompress.ts` (canvas resize→1920px + JPEG q=0.82, HEIC funciona no Safari), `handleUpload`/`handlePickExtraFile` viraram async + cap 25MB. Ver `shared/changelog.ts`.
- ~~Rev. 2166~~ — MELHORIA UX + NOVA AÇÃO · Plano de Contas: ordenação natural por código (`cmpCodigo`), combobox "Conta Pai" + `suggestNextCode` (herda tipo/natureza/nivel do pai), botões Pencil/Trash2 inline, novo backend `deleteAccount` (soft-delete + check refs). Hotfix pós-review: campo Nível liberado em edição. Ver `shared/changelog.ts`.
- ~~Rev. 2165~~ — MELHORIA UX · Campo "Plano de Contas (opcional)" no dialog de Categoria virou combobox pesquisável (Popover + cmdk) — novo `PlanoDeContaCombobox` em `FinanceiroCategorias.tsx`, busca por código OU nome, case/acento-insensitive. Ver `shared/changelog.ts`.
- ~~Rev. 2164~~ — MELHORIA UX · AlertDialog de excluir Centro de Custo mostra vínculos detalhados (novo procedure `getCostCenterLinks` + componente `DeleteCostCenterDialog` com tabela das categorias vinculadas; bloqueia exclusão se houver refs). Ver `shared/changelog.ts`.
- ~~Rev. 2163~~ — HOTFIX · "Excluir Centro de Custo" devolvia `Unexpected end of JSON input` — `financial_recurring_entries.centro_custo_id` não existia; cada SELECT do `deleteCostCenter` agora em try/catch próprio (coluna ausente vira warn + 0 refs). Ver `shared/changelog.ts`.

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
