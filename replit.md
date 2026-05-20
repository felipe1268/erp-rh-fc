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

- **Rev. 2181** — **MELHORIA UX · Botão Memorial de Cálculo agora aparece em TODAS as linhas do Relatório de Períodos HE (não só na 1ª do grupo do funcionário).** Lilian: "COLOQUE O BOTAO DE MEMORIAL DE CALCULO NAS HORAS SEM SOLICITAÇÃO TAMBEM". Na Rev. 2179 (split por origem em até 2 linhas), o ícone Memorial ficou gateado por `isFirst` — só renderizava na linha "Aprovada" (1ª do grupo). Resultado: funcionários com horas mistas tinham botão na linha Aprovada mas não na Sem solicitação, mesmo o memorial cobrindo o funcionário inteiro (não filtra por origem). **Fix em `client/src/pages/FolhaPagamento.tsx:4804`:** removido `{isFirst && (...)}` ao redor do `<button>` Memorial — agora cada linha exibe o ícone roxo, abrindo o mesmo dialog (memorial lista TODOS os dias do funcionário no período, independente da origem). **Backend:** zero mudanças. **R-001/R-007/R-010:** OK.
- **Rev. 2180** — **HOTFIX BLOQUEANTE · "Calcular Vale" mostrava o resultado e ao recarregar a tela o vale "sumia" (etapa 1 voltava pra 0%, sem `valeGeradoEm`).** Lilian: vale de Maio/2026 não persistia. **Causa em `server/routers/payrollEngine.ts:2510` (gerarVale):** após inserir `payroll_advances` (OK), o `UPDATE payroll_periods SET ..., "valeResultJson"=...` falhava com `column "valeResultJson" does not exist` porque o DB Neon (dev/staging/clones antigos) estava sem 13 colunas que o `payrollEngine.ts` já escreve há tempos: `valeResultJson`/`pagamentoResultJson`/`afericaoResultJson` (text), `aplicarDsrFalta`/`aplicarDsrAtraso` (smallint), e os 4 pares `*ConsolidadoEm`/`*ConsolidadoPor` (vale/he/afericao/pagamento). O try/catch externo (L2521) jogava TRPCError, mas o tRPC já tinha respondido o cliente — então o vale "aparecia" uma vez e sumia (porque `valeGeradoEm` ficava NULL e `valeResultJson` também). **Fix:** (1) `ALTER TABLE ADD COLUMN IF NOT EXISTS` aplicado direto pras 13 colunas faltantes (aditivo, R-001 OK); (2) bootstrap `[SyncSchema+] Rev. 2180` em `server/_core/index.ts` (try/catch idempotente, padrão dos outros ADD COLUMN do startup) garante qualquer ambiente (prod/staging/dev limpo/branch clone) no próximo boot; (3) `drizzle/schema.ts:4255` atualizado pros 11 campos faltantes em `payrollPeriods`. **R-001/R-007/R-010:** OK — só ADD COLUMN aditivo + defaults coerentes com o que o código já assumia.


- **Rev. 2150** — **NOVA FEATURE · Termos & Documentos Assinados (FCSign) no Raio-X do funcionário, com Visualizar + Baixar.** User: "O termo precisa estar no raio-x do funcionário tbm... precisa poder visualizar e fazer download". Backend já entregava `fcsignSessions` em `controleDocumentos.raioX` (linha 2032), mas o cliente só usava na timeline — sem botão pra abrir/baixar. **Mudanças em `client/src/components/RaioXFuncionario.tsx`:** (1) novo derivado `fcsignSessions`/`termosFcsign` (filtra status≠cancelado); (2) nova tab `value="termos_fcsign"` no grupo SST (ao lado de Integrações) com ícone FileSignature e count; (3) `<TabsContent>` com card branco + tabela colunas Documento/Tipo/Status (badge color-coded)/Emitido em/Concluído em/Por/Ações (Ver+Baixar); (4) "Ver" abre `finalDocumentUrl` em nova aba quando completo, fallback p/ `/assinar/{token}` se tiver token de signer pendente; "Baixar" usa `<a download>` direto pro HTML auto-contido; (5) labels amigáveis para tipos (termo_responsabilidade→"Termo de Recebimento", contrato_experiencia→"Contrato de Experiência"). **Backend:** zero mudanças. **R-001/R-007/R-010:** OK — só client-side.
- **Rev. 2149** — **NOVA FEATURE · Multi-seleção + exclusão em lote no painel "Termo de Recebimento".** User: "quero tbm poder fazer multselcao para apagar tudo de uma vez". Antes era 1 clique/lixeira/confirm() por termo. **Mudanças em `client/src/components/controleDocumentos/TermosResponsabilidadePanel.tsx`:** (1) state `selectedIds: Set<number>` + helpers; (2) coluna nova de checkbox c/ "select all visíveis" no header (respeita filtros) + checkbox por linha + highlight `bg-indigo-50/40` na linha selecionada; (3) barra de ação em lote acima da tabela (só visível com seleção) c/ contador + Limpar + botão destrutivo "Excluir selecionados"; (4) `bulkDelete()` faz confirm() único, loop sequencial em `adminDelete.mutateAsync` (evita contention escrevendo em signatures+employee_documents), toast final com resumo ok/fail; gate `isAdminMaster`. **Backend:** nenhum procedure novo, reusa `signatures.adminDelete` (soft-cancel + soft-delete). **R-001/R-007/R-010:** OK.

### Revisões recentes (one-liners)

- ~~Rev. 2179~~ — NOVA FEATURE · Relatório de Períodos HE ganhou coluna "Solicitação" (✅ Aprovada / ⚠️ Sem solicitação) + quebra funcionário em até 2 linhas com Pagar/Banco independente por origem. Schema `he_period_employees.origem` + `computeHEForPeriod` classifica por dia. Ver `shared/changelog.ts`.
- ~~Rev. 2178~~ — HOTFIX BLOQUEANTE · Adiantamento (vale) saía sobre salário INTEGRAL pra colaboradores admitidos no meio do mês — `gerarVale` em `payrollEngine.ts:2316` ignorava `diasAntesAdmissao`; fix unifica férias+aviso+admissão via flag `temProporcional`. Ver `shared/changelog.ts`.
- ~~Rev. 2177~~ — MELHORIA MOBILE · Scroll horizontal automático em QUALQUER tabela do ERP que estourar a viewport — fix global via CSS `:has()` em `client/src/index.css` `@media (max-width: 767px)`, zero edição de páginas. Ver `shared/changelog.ts`.
- ~~Rev. 2176~~ — HOTFIX BLOQUEANTE · Criar conta no Plano de Contas com mesmo nome de uma Categoria existente "criava" silenciosamente sem aparecer em lugar nenhum. Dedup `SELECT ... WHERE ativo=1` ignorava escopo; fix passa a checar `codigo LIKE 'AUTO-%'` e devolve TRPCError apontando Categoria conflitante. Ver `shared/changelog.ts`.
- ~~Rev. 2175~~ — MELHORIA UX · Mensagem de conflito de nome no Plano de Contas agora diz onde está a conta conflitante (Plano vs Categorias / código). SELECT extra no catch 23505 da Rev. 2174 classifica pelo prefixo do código (`AUTO-*` = Categorias). Ver `shared/changelog.ts`.

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
