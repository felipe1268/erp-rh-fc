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


- **Rev. 2429** — **ALMOXARIFADO · AUDITORIA · aprovadores delegados por obra (engenheiro responsável + delegados podem validar exclusões/ajustes de estoque — antes era só admin/admin_master, que virou gargalo).** Nova tabela `obra_responsaveis_estoque` (N:N obra↔users, tipo `principal`|`delegado`, unique em (obra_id,user_id)) — aponta pra `users.id` (quem loga), não pra `employees.id`. **Arquivos:** (a) `drizzle/schema.ts` L8875-8895 (tabela nova); (b) `server/_core/index.ts` L594-613 (SyncSchema+ CREATE TABLE IF NOT EXISTS + 3 índices); (c) `server/routers/compras.ts` L119-123 (import) + L13518-13700+ (4 endpoints CRUD novos: `responsaveisAuditoriaListar/Adicionar/Remover/Candidatos` — só admin OU principal da obra gerencia; `auditoriaPendenciasCount` adaptado pra admin enxergar tudo das obras permitidas + sem-obra e não-admin enxergar SÓ obras onde é aprovador; `auditoriaValidar` adaptado pra autorizar admin OU aprovador da obra — auditoria sem obraId segue só admin); (d) `client/src/components/obras/ModalAprovadoresEstoque.tsx` NOVO (~250 linhas, faixa azul #1B2A4A, principal destacado em âmbar/coroa, delegados em slate, busca de candidatos, 2 botões Delegado/Principal — este só se obra ainda não tem principal, confirmação separada pra remover); (e) `client/src/pages/Obras.tsx` L17-18 (imports `ShieldCheck` + componente) + L110-112 (estado `aprovadoresModal`) + L805-825 (botão "Aprovadores de auditoria" no header do campo Engenheiro/Responsável, só aparece se `editingId`) + L1326-1333 (render do componente). Não há auto-seed automático do responsavelId porque o schema não vincula employees↔users (FK ausente) — quem adiciona é manual via UI. SyncSchema+ confirmou criação da tabela no boot. R-001/R-007/R-010 OK (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS, zero ALTER/DROP/DELETE). Detalhe: `shared/changelog.ts`.
- **Rev. 2428** — **UX · PLANEJAMENTO/LISTA · modal "Novo Projeto" redesenhado com identidade FC (faixa azul #1B2A4A no header) + shadcn Select/Textarea + fim do scroll horizontal.** Modal anterior usava `<select>` e `<textarea>` HTML nativos, sem identidade visual, com scrollbar horizontal aparecendo quando nomes de obra eram longos (caso "CONDOMÍNIO RESIDENCIAL DE NOSSA SENHORA DA CONCEIÇÃO APARECIDA") e botão "Criar Projeto" azul-genérico (`bg-blue-600`) que parecia desabilitado mesmo habilitado. **Arquivo único (zero backend):** `client/src/pages/planejamento/PlanejamentoLista.tsx` — (a) imports L13-29: + `Select/SelectContent/SelectItem/SelectTrigger/SelectValue` shadcn, + `Textarea` shadcn, + `DialogFooter`, + ícones `FolderPlus/FileText/CheckCircle`; (b) modal L505-695 reescrito: `DialogContent` com `p-0 gap-0 overflow-hidden max-w-lg`, header novo com gradient `linear-gradient(135deg, #1B2A4A 0%, #243456 100%)` + `printColorAdjust:exact` + ícone `<FolderPlus>` branco em pill `bg-white/10` + título branco + subtítulo "Cronograma · Curva S · REFIS · Controle de Avanço" em white/60; (c) body `max-h-[70vh] overflow-y-auto` com `space-y-4`; (d) `<Select>` shadcn pra Obra (com `SelectValue` truncado + `SelectContent` clampado em `--radix-select-trigger-width`) e Status; (e) preview da obra com gradient slate, ícones em `#1B2A4A`, divider antes do valor do contrato; (f) Orçamento vinculado virou card com ícone `<CheckCircle>`/`<FileText>` + texto truncado; (g) `<Textarea>` shadcn substitui `<textarea>` nativo; (h) `DialogFooter` separado com `border-t bg-slate-50/60`, botão "Criar Projeto" agora `bg-[#1B2A4A] hover:bg-[#243456]` com ícone `<FolderPlus>` + estado loading "Criando..."; (i) **`min-w-0` estratégico** em todos os containers de seleção/grid — mata definitivamente o scroll horizontal causado por strings longas no `<SelectItem>`. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2427** — PLANEJAMENTO · REGRA DE OURO DEFINITIVA · `% PREVISTO`=Texto6 puro + `% CONCLUÍDA`=PercentComplete puro para TODAS as obras. Mapeamento canônico XML HOTEL DO PAPA validado (paridade 100% XML × tela MSP). `ImportarCronograma.tsx` bloco L257-281. Ver `shared/changelog.ts`.
- **Rev. 2426** — ALMOXARIFADO · AUDITORIA · banner global de pendências acima do `<main>` do DashboardLayout + deep-link `?auditoria=1`. Query `compras.auditoriaPendenciasCount` refetch 60s; banner ambar dismissable com botão "Revisar agora". Ver `shared/changelog.ts`.
- **Rev. 2425** — PLANEJAMENTO · LEITURA PURA DO MSP · Texto9 na cadeia de fallback + revertido cálculo dinâmico `mspReadOnly`/`avancoPrevistoDia` (caso HOTEL DO PAPA). Texto9 depois removido na Rev. 2427. Ver `shared/changelog.ts`.
- **Rev. 2424** — UX · PLANEJAMENTO/LISTA · `window.confirm` nativo substituído por AlertDialog estilizado ao excluir projeto (com nome+cliente, aviso destrutivo, Loader2). `PlanejamentoLista.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2423** — AVISO PRÉVIO · trabalhado volta a 30d fixos de CUMPRIMENTO (caso Myriélle 2 anos); VERBA segue 30+3·ano. `calcularDiasAviso(anos,tipo)→30` p/ qualquer `*_trabalhado`. AvisoPrevio.tsx + rescisaoCalc.ts + avisoPrevioFerias.ts + dashboards.ts (CDM). Ver `shared/changelog.ts`.

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

> Revisões anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **REGRA DE OURO — Leitura do XML do MS Project (Rev. 2427+, vale pra TODAS as obras).** Fonte ÚNICA pra cronograma e avanços semanais. Validada com paridade 100% no XML HOTEL DO PAPA (BL 25/05/2026). Conventions canônicas:
  - **% PREVISTO** (raiz e atividades) = `Texto6` (FieldID 188743746) puro do XML. O MSP calcula via fórmula `Int(((StatusDate − BL_Start)/(BL_Finish − BL_Start))*100)` sobre as datas da BASELINE — não precisa ler `<Baseline>` separado. Fallback compatível: Texto10 (188743750) → Texto11 (188743997).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` nativo do MSP. ZERO heurística (Texto7, AD/(AD+RD), Texto9, Texto12, PhysicalPercentComplete ficaram fora — não são a coluna que o engenheiro vê na tela).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
  - Implementação: `client/src/pages/planejamento/ImportarCronograma.tsx` (bloco "REGRA DE OURO" L257-281).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
