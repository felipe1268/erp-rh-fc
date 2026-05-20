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

- **Rev. 2198** — **HOTFIX UX · Mês SELECIONADO no calendário da Folha agora respeita a cor da legenda (Com lançamento azul / Consolidado verde) em vez de virar branco.** Lilian (logo após Rev. 2197): "a legenda ainda não esta correta precisa ajustar isso quero que respeite". **Causa:** ternário de classe priorizava `isSelected` no primeiro ramo, descartando todas as classes de fundo de status (`bg-green-100`, `bg-blue-100`). **Fix (`client/src/pages/FolhaPagamento.tsx:5738-5752`):** Separou em duas variáveis ortogonais — `statusClasses` (SEMPRE aplicada: bg+text de consolidado/completo/sem-dados) + `borderClasses` (prioriza seleção: `border-[#1B2A4A] ring-2 ring-[#1B2A4A]/30 shadow-md`, senão borda da cor de status). Resultado: mês selecionado mantém fundo verde/azul + ganha ring azul-escuro. Ícones `Lock`/`FileText` intactos. **R-001/R-007/R-010:** OK — só client.
- **Rev. 2197** — **HOTFIX · Calendário da Folha de Pagamento volta a pintar meses calculados pelo Cálculo Interno (Rev. 2180+).** Lilian: "abril tem lançamentos, todos na empresa FC tem lançamento, arrume isso". Calendário no topo de `/folha-pagamento` mostrava TODOS os meses cinza ("Sem dados") mesmo com Abr 2026 FC totalmente consolidado no Cálculo Interno. **Causa:** `folha.listarMesesComLancamentos` (`server/routers/folhaPagamento.ts:2057`) só lia `folha_lancamentos` (legacy, populada via upload de PDF). A partir da Rev. 2180 o Cálculo Interno usa `payroll_periods` — quem não importa PDF ficava todo cinza. Confirmado no Neon: `folha_lancamentos` 2026 = 0 linhas, `payroll_periods` = 5 linhas com vale/pag/consol corretos. **Fix:** query adicional a `payroll_periods` (mesmo `companyFilter` + ano), merge no mesmo objeto `meses` mapeando timestamps→status: `valeConsolidadoEm`/`status='travada'`→consolidado; `valeGeradoEm`→calculado; idem pagamento. Legacy tem prioridade (só preenche se `null`). Import `payrollPeriods` adicionado. **R-001/R-007/R-010:** OK — leitura adicional, zero schema/migration.

### Revisões recentes (one-liners)

- ~~Rev. 2196~~ — MELHORIA UX · Avatar 32px do colaborador no Relatório de Períodos HE virou clicável: abre lightbox com foto ampliada (max-h 70vh, fundo preto). Fallback iniciais não ganha click. Ver `shared/changelog.ts`.
- ~~Rev. 2195~~ — NOVA FEATURE · Tela "Encargos Sociais sobre Folha" (RH&DP > Operacional) p/ upload DCTFWeb + FGTS Digital. Nova tabela `encargos_sociais_documentos` (bootstrap isolado L1779-1807), router `encargosSociais.ts` (parsers + `assertCompanyAccess`), página `EncargosSociais.tsx`, Route + nav. Ver `shared/changelog.ts`.
- ~~Rev. 2194~~ — REMOÇÃO DE FEATURE · Bloco "Conferência com Contabilidade" removido da aba Folha de Pagamento (Card colapsável + Dialog de alerta + states `showConferencia`/`conferenciaDialog`). Server intacto. Ver `shared/changelog.ts`.
- ~~Rev. 2193~~ — MELHORIA UX · Layout da Ficha de Entrega de EPI reorganizado em documento ÚNICO: tabela de EPIs → política → declaração → obrigações → assinaturas → fotos (no final como evidência). Ver `shared/changelog.ts`.
- ~~Rev. 2192~~ — MELHORIA UX · Nome do funcionário e do responsável aparecem em destaque abaixo de cada assinatura na Ficha de Entrega de EPI. Schema aditivo `epi_deliveries.assinatura_responsavel_{nome,em}` (bootstrap isolado L1762-1772). Server grava `ctx.user.name` no `salvarAssinatura` quando `tipoAssinante==='responsavel'`. Ver `shared/changelog.ts`.

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
