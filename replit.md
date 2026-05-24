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

- **Rev. 2327** — **UX · Cada aba do Dashboard Almox & Equip. vira item próprio na sidebar + tabela mês a mês (12 meses) em cada tela.** Pedido user (23/05/2026, 2 screenshots iPad): "quero que todos esses dash fique, na barra de comando lateral da forma que está ok e quero uma tabela em cada tela, comparando mês a mês". **Implementação 0-server, 0-schema** (1) `DashboardLayout.tsx` (seção "Análise" L478): 1 item virou 6, todos apontando pra mesma rota `/dashboards/almoxarifado-equipamentos` com `?tab=visao|estoque|movs|ferramentas|proprios|locados`; ícones distintos (Package/ArrowLeftRight/Wrench/HardHat/Truck). Active-state já suportado nativamente via `sidebarActiveParam` (L1170/L1784) — cada sub-item destaca em dourado quando ativo. (2) `DashAlmoxarifadoEquipamentos.tsx`: `useLocation()` + parse de `window.location.search` → `tabAtual`; `<Tabs>` agora CONTROLADO (`value={tabAtual} onValueChange={setTab}`) navegando pra `?tab=X` (deep-link da sidebar funciona, back/forward do nav também). Set `TABS_VALIDOS` valida fallback "visao". (3) **Comparativo mês a mês (12m)** novo em CADA tab: utils `monthKey()` (YYYY-MM UTC) + `lastNMonths(12)` (mmm/aa pt); `monthlyAgg` useMemo único bucketiza `movsEntradas/Saidas/Count` (exclui estornadas), `propriosNovos/Valor` (dataAquisicao), `locadosIniciados/CustoIniciado` (dataInicio), `locadosDevolvidos` (dataDevolucao), `ferramentasReg` (data_hora/criado_em), `itensCadastrados` (criadoEm). Tabela em Visão Geral consolida 8 cols; Estoque mostra novos + acumulado; Movs mostra Entradas/Saídas/Saldo (verde/vermelho); Ferramentas mostra Registros; Próprios mostra Equipamentos + Valor BRL; Locados mostra Iniciadas/Devolvidas/Saldo/Custo BRL. Todas headers padronizadas com ícone CalendarRange. **Por que mesma rota + querystring** (não 6 rotas): mantém as 10 queries tRPC em UMA instância — troca de tab instantânea, sem re-fetch. **Por que client-side**: `listMovements limit:2000` + listas já cobrem 12 meses; bucketing O(n) roda <10ms. **R-001/R-007/R-010:** N/A — leitura pura.
- **Rev. 2326** — **FEATURE · Importação PDF de locação cruza endereço com obras em andamento e sugere vínculo automático.** Pedido user (23/05/2026, PDF F051/R051 com 84+ contratos de 2 endereços: "RUA JOAO MARCELINO CAVALHEIRO Nº336 JARDIM DO VALE ll, GUARATINGUETA/SP" e "AVENIDA GETULIO VARGAS, 995 SANTA RITA APARECIDA HOTEL DO PAPA"): "Quero q o ERP cruze o endereço de entrega, nome da obra com as obras em andamento para que seja importando no local correto". Causa raiz: desde Rev. 2308 a IA salvava `localObra` só em `observacoes` (texto livre), todos os itens ficavam "Sem obra vinculada" → user vinculava na mão (multi-seleção da Rev. 2323 + chunking da Rev. 2325 eram workarounds). **Implementação** (1) **Server** `server/routers/avaliacao.ts` procedure `obras.listActive`: adicionado `endereco` + `cidade` ao SELECT (não-breaking, 7 telas usam mas só leem campos conhecidos). Procedure `importarContratosLocacaoLote` já aceitava `obraId` por contrato desde 2308. (2) **Client** `Locados.tsx`: util `normalize()` (NFD strip acentos + remove `Nº336` + pontuação), `tokenize()` (4+ chars, filtra 25 stop-tokens pt: rua, avenida, jardim, sp, sao, hotel, casa, etc), `matchObra()` (score = tokens da PDF presentes em `nome + endereco + cidade` da obra; exige >=2 em comum; desempate por contagem absoluta depois proporção). No polling `done`: auto-match em cada contrato, popula `c.obraId + obraMatchAuto + obraMatchScore`; toast "X/N auto-vinculados". **UI preview**: linha com endereço PDF + select de obras (cidade visível), borda verde (auto) / azul (manual) / âmbar (sem); badge `✓ auto` com tooltip de %. Banner verde no topo mostrando "X auto-vinculados · Y manuais · Z sem obra". `confirmarImport` envia `obraId` por contrato. **R-001/R-007/R-010:** N/A — zero DDL (só SELECT estendido), sem UPDATE/DELETE adhoc. Multi-tenant herdado de `listActive`.
- **Rev. 2325 (demovida)** — **HOTFIX/UX · Exclusão/vinculação em lote de equipamentos locados — chunking de 500 + modais bonitos.** Pedido user (23/05/2026, 2 screenshots do iPad): "Precisa arrumar o erro, e corrigir o layout da mensagem". Screenshots mostravam (1) toast vazando do canto inferior esquerdo com ZodError cru `"Too big: expected array to have <=500 items"`, ilegível e cortado; (2) `window.confirm` nativo do iPad sem aviso de que vai falhar. **Diagnóstico**: na Rev. 2323 o server limitou `ids: z.array(z.number()).min(1).max(500)` em `locadosExcluirLote`/`locadosVincularObraLote` (limite legítimo pra evitar timeout em transação Postgres com 1200+ UPDATEs/DELETEs); o user selecionou 1218 cards visíveis (cenário comum pós-import Rev. 2308) e o client mandava tudo num único call → ZodError + toast cortado. **Implementação** (`client/src/pages/equipamentos/Locados.tsx`, 0 server, 0 schema): (1) `CHUNK=500` + util `chunkIds(arr, size)`; `confirmarVincular`/`executarExcluir` agora rodam `for` sequencial chamando `mutateAsync` por chunk, acumulando `vinculados`/`excluidos`. (2) Estado `loteProgresso` + modal z-60 com barra de progresso (azul/vermelho) e "Lote X de Y · N de M processados" — fica aberto durante toda a operação, impede clique duplo. (3) Estado `confirmExcluir: number | null` substitui `window.confirm`: modal vermelho próprio com box amarelo ("histórico será removido") + box azul informativo SE total > 500 ("dividida em N etapas — limite do servidor"). (4) Estado `loteErro` + modal de erro persistente (z-60) substitui `toast.error`; parseia ZodError JSON via `formatTrpcError` (espelha o da Rev. 2322), mostra até 5 issues como `• path: message` em `<pre>`. (5) `excluirLote.isPending` substituído por `!!loteProgresso` no `disabled` (cobre chunks em série). **Por que NÃO subir `.max(500)` no server**: transação Postgres com 1200+ UPDATEs+DELETEs+INSERT de eventos pode estourar timeout/lock. Manter limite + paginar client = melhor dos dois mundos. **R-001/R-007/R-010:** N/A — DELETE via mutation iniciada pelo user, escopo por `companyId` + `id` + transação atômica por chunk.
### Revisões recentes (one-liners)

- ~~Rev. 2325~~ — HOTFIX/UX · Exclusão/vinculação em lote de equipamentos locados — chunking 500 + modais bonitos. Ver `shared/changelog.ts`.
- ~~Rev. 2324~~ — FEATURE · Dashboard consolidada Almoxarifado & Equipamentos (6 tabs). Ver `shared/changelog.ts`.
- ~~Rev. 2323~~ — FEATURE · Equipamentos Locados — vínculo de obra visível + multi-seleção (limite 500 IDs). Ver `shared/changelog.ts`.
- ~~Rev. 2322~~ — HOTFIX/UX · Botão "Confirmar e cadastrar" da importação PDF — diálogo de erro substitui toast invisível. Ver `shared/changelog.ts`.
- ~~Rev. 2321~~ — HOTFIX/INFRA · Importação PDF migrada pra polling; proxy Replit matava em 60s. Ver `shared/changelog.ts`.

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
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
