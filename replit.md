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

- **Rev. 2179** — **NOVA FEATURE · Relatório de Períodos HE (Folha de Pagamento) agora tem coluna "Solicitação" (✅ Aprovada verde / ⚠️ Sem solicitação âmbar) e quebra o funcionário em até 2 linhas quando tem horas mistas, com botão Pagar/Banco INDEPENDENTE por origem.** Lilian: replicar tags que já existem em outras telas + permitir Pagar a parte aprovada e mandar a Sem solicitação pro Banco no mesmo período. **Schema (`drizzle/schema.ts:1810` + bootstrap `server/_core/index.ts`):** nova coluna `origem text DEFAULT 'sem_solicitacao'` em `he_period_employees` (`ALTER TABLE ADD COLUMN IF NOT EXISTS` aditivo, autorizado pelo user com ciência da R-001). `[SyncSchema+] Rev. 2179` garante a coluna em qualquer ambiente no próximo boot. **Backend (`server/routers/horasExtras.ts`):** `computeHEForPeriod` pré-carrega Set de `(empId, data)` cobertos por `heSolicitacoes.status='aprovada'`, classifica cada DIA de HE por origem (regra "dia inteiro" — solicitação libera o dia, não tem qtd horária), acumula gross por origem; netting de atrasos rateado proporcional ao gross de cada origem (`splitProporcional`); `calcularHE` emite até 2 rows por funcionário em `he_period_employees`; `totalFuncionarios` agora usa `Set<empId>.size` (únicos, não rows); `getDetalhe` ORDER BY adiciona `CASE origem='aprovada' THEN 0 ELSE 1` (Aprovada sempre antes do Sem solicitação no agrupamento). `setDestinacao`/`aprovarEProcessar` SEM mudança (já operam por id da row, cada bucket independente). **Frontend (`FolhaPagamento.tsx:4733+`):** tabela reconstruída — agrupa por employeeId, "Funcionário"+"Saldo Banco"+ícone Memorial com rowSpan na 1ª linha do grupo (align-top, border-r discreto); nova coluna "Solicitação" com Badge color-coded; "HE Úteis"/"HE Fim Sem."/"Total HE"/"Valor HE"/"Destinação" por linha; `colSpan` do tfoot TOTAL bumpado 4→5. **Compatibilidade:** períodos `aprovado`/`pago` NÃO recalculam (regra existente), mantêm `origem` default e aparecem como "Sem solicitação" — sem regressão visual; só novos cálculos ou recálculos de `calculado` entram no formato split. **R-001/R-007/R-010:** ADD COLUMN aditivo (sem perda de dado, autorizado) + resto em memória/SELECT/INSERT.
- **Rev. 2178** — **HOTFIX BLOQUEANTE · Adiantamento (vale) saía sobre o salário INTEGRAL para colaboradores admitidos no meio do mês — agora calcula proporcional aos dias efetivamente trabalhados.** Lilian: Fabio Kelly admitido 04/05/2026 puxava R$ 904,79 (40% sobre mês cheio R$ 2.262) em vez do proporcional aos 28 dias trabalhados; 5 colaboradores no mesmo mês na mesma situação. **Causa em `server/routers/payrollEngine.ts:2316` (gerarVale):** `diasTrabalhados = diasNoMes - diasFeriasNoMes - diasAusentesAviso` ignorava dias ANTES da admissão; horista virava `9,95 × (220 × 31/30) = 2.262` e mensalista ficava em `salBase` puro. **Fix:** novo `diasAntesAdmissao = max(0, admDate.day - 1)` quando admitido no mês de referência, subtrai de `diasTrabalhados`; flag `temProporcional` unifica férias+aviso+admissão (mensalista agora aplica `salBase × (diasTrabalhados/diasNoMes)` em qualquer uma das 3); motivo do alerta passa a dizer "vale proporcional a X/Y dias trabalhados" (substitui o impreciso "menos de 10 dias"). "Retorno de férias" já era tratado via `feriasMesMap` (overlap de qualquer período de férias com o mês). Card "Decisão Necessária" da imagem 1 mantido — RH ainda decide Pagar/Não Pagar, mas com valor já proporcional. Afastamento INSS: out of scope (sem mapa agregado e regras 15d empresa / >15d INSS exigem caso concreto). **R-001/R-007/R-010:** OK — só lógica em memória.


- **Rev. 2150** — **NOVA FEATURE · Termos & Documentos Assinados (FCSign) no Raio-X do funcionário, com Visualizar + Baixar.** User: "O termo precisa estar no raio-x do funcionário tbm... precisa poder visualizar e fazer download". Backend já entregava `fcsignSessions` em `controleDocumentos.raioX` (linha 2032), mas o cliente só usava na timeline — sem botão pra abrir/baixar. **Mudanças em `client/src/components/RaioXFuncionario.tsx`:** (1) novo derivado `fcsignSessions`/`termosFcsign` (filtra status≠cancelado); (2) nova tab `value="termos_fcsign"` no grupo SST (ao lado de Integrações) com ícone FileSignature e count; (3) `<TabsContent>` com card branco + tabela colunas Documento/Tipo/Status (badge color-coded)/Emitido em/Concluído em/Por/Ações (Ver+Baixar); (4) "Ver" abre `finalDocumentUrl` em nova aba quando completo, fallback p/ `/assinar/{token}` se tiver token de signer pendente; "Baixar" usa `<a download>` direto pro HTML auto-contido; (5) labels amigáveis para tipos (termo_responsabilidade→"Termo de Recebimento", contrato_experiencia→"Contrato de Experiência"). **Backend:** zero mudanças. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2149** — **NOVA FEATURE · Multi-seleção + exclusão em lote no painel "Termo de Recebimento".** User: "quero tbm poder fazer multselcao para apagar tudo de uma vez". Antes era 1 clique/lixeira/confirm() por termo. **Mudanças em `client/src/components/controleDocumentos/TermosResponsabilidadePanel.tsx`:** (1) state `selectedIds: Set<number>` + helpers; (2) coluna nova de checkbox c/ "select all visíveis" no header (respeita filtros) + checkbox por linha + highlight `bg-indigo-50/40` na linha selecionada; (3) barra de ação em lote acima da tabela (só visível com seleção) c/ contador + Limpar + botão destrutivo "Excluir selecionados"; (4) `bulkDelete()` faz confirm() único, loop sequencial em `adminDelete.mutateAsync` (evita contention escrevendo em signatures+employee_documents), toast final com resumo ok/fail; gate `isAdminMaster`. **Backend:** nenhum procedure novo, reusa `signatures.adminDelete` (soft-cancel + soft-delete). **R-001/R-007/R-010:** OK.

### Revisões recentes (one-liners)

- ~~Rev. 2177~~ — MELHORIA MOBILE · Scroll horizontal automático em QUALQUER tabela do ERP que estourar a viewport — fix global via CSS `:has()` em `client/src/index.css` `@media (max-width: 767px)`, zero edição de páginas. Ver `shared/changelog.ts`.
- ~~Rev. 2176~~ — HOTFIX BLOQUEANTE · Criar conta no Plano de Contas com mesmo nome de uma Categoria existente "criava" silenciosamente sem aparecer em lugar nenhum. Dedup `SELECT ... WHERE ativo=1` ignorava escopo; fix passa a checar `codigo LIKE 'AUTO-%'` e devolve TRPCError apontando Categoria conflitante. Ver `shared/changelog.ts`.
- ~~Rev. 2175~~ — MELHORIA UX · Mensagem de conflito de nome no Plano de Contas agora diz onde está a conta conflitante (Plano vs Categorias / código). SELECT extra no catch 23505 da Rev. 2174 classifica pelo prefixo do código (`AUTO-*` = Categorias). Ver `shared/changelog.ts`.
- ~~Rev. 2174~~ — HOTFIX UX · Erro PG 23505 cru no toast ao editar conta do Plano de Contas — traduzido pra mensagem amigável em `updateAccount` (try/catch detecta code/constraint/msg, TRPCError BAD_REQUEST). Ver `shared/changelog.ts`.
- ~~Rev. 2173~~ — HOTFIX BLOQUEANTE · Edição de código contábil no Plano de Contas era silenciosamente ignorada (zod do `updateAccount` não aceitava `codigo`; cliente também não enviava em edição). Fix: backend aceita `codigo` c/ validação do create; `onPickParent` sempre sugere próximo; `handleSave` envia. Ver `shared/changelog.ts`.

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
