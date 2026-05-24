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

- **Rev. 2357** — **HOTFIX/UX · Modal drill-down de "Locações mês a mês" ganha botão "Fechar" no rodapé + altura usa `dvh` em vez de `vh` pra respeitar a URL bar dinâmica do iOS Safari.** Pedido user (24/05/2026, IMG_1153): "Preciso de um botão de fechar para voltar a tela normal". **Causa raiz**: o modal usava `max-h-[90vh]` + `flex items-center`. No iOS Safari `vh` é calculado pelo viewport máximo (URL bar colapsada) — quando a barra está expandida (como no print), 90vh excede o visível e o topo do modal (com o X) escapa pra cima da tela. **Fix em 2 camadas** (`client/src/pages/dashboards/DashAlmoxarifadoEquipamentos.tsx`): (1) `max-h-[88vh] max-h-[88dvh]` — `dvh` (dynamic viewport height) respeita a chrome ATUAL do browser; `vh` fica como fallback pra browsers antigos. (2) Botão **"Fechar"** preto no rodapé além do X do header — footer está sempre visível porque é flex-column bottom-anchored. Redundância proposital. **Por que NÃO sticky header**: container tem `overflow-hidden` + `max-h` com scroll interno; sticky não funciona. Fix da altura corrige o root cause; botão extra é defense-in-depth. **R-001/R-007/R-010:** N/A — só UI client-side.
- **Rev. 2356** — **UX/REDESIGN · Hub de Equipamentos (`/equipamentos`) ganha layout 100% renovado com foco em ILUSTRAÇÃO DOS DADOS.** Pedido user (24/05/2026, IMG_1152): "Quero um layout 100 renovado e moderno de forma que os dados sejam melhor ilustrados". O print mostrava ~30 linhas IDÊNTICAS de "SAPATAS AJUSTÁVEIS" na seção de locações vencendo — ruído puro, zero insight. **Solução** (`client/src/pages/equipamentos/index.tsx`, reescrito ~120 → ~280 linhas): (1) **Agrupamento client-side** por `(descricao + obraNome + fornecedorNome + dataFimPrevista)` com soma de `valorMensal`, ordenado por dias-até-vencer ASC e desempate por valor DESC. (2) **Faixa de 4 KPIs** (Unidades+grupos, Valor mensal em risco, Mais urgente com badge, Obras impactadas distintas). (3) **Cards de grupo** com thumbnail 56×56 (foto da Biblioteca Rev. 2355 ou ícone Package fallback), badge "×N" quando qtd>1, badge de urgência semaforizado (vermelho ≤7d / laranja ≤15d / âmbar ≤30d / verde >30d / vermelho "Vencido há Nd"), barra de progresso da janela de 30d consumida e linha "total/mês: R$ X (R$ Y/un)". Mostra 8 grupos + botão "Mostrar mais N". **Cards do hub** também repaginados: `rounded-xl` + `hover:-translate-y-0.5`, layout 2 colunas (número grande + KPI secundário), barras de progresso (azul % em obra; bicolor emerald/cinza em uso vs devolvidos), `tabular-nums`. **Por que NÃO chart**: dataset pequeno (~30 grupos), o que importa é ranking por urgência — cards semaforizados são mais acionáveis. **Por que NÃO agrupar no backend**: O(n) trivial no client e procedure `locadosListar` continua única pras outras telas. **R-001/R-007/R-010:** N/A — só UI client-side, zero DDL e zero mutations novas.
- **Rev. 2355** — **FEATURE/SOLUÇÃO DEFINITIVA · Biblioteca CURADA de fotos de equipamentos locados por descrição canônica. Substitui de vez a "busca de fotos com IA" (revs 2340-2350) que falhou em 9 rounds por limitação estrutural dos provedores (Google CSE bloqueado no GCP, OV/WM ~só EN). User sobe 1 foto por descrição (PAINEL NR18 1,5X1,0, DIAGONA 1,50M, etc) → ERP propaga pra TODAS as unidades (atuais via UPDATE em lote + futuras via hook no import PDF). Determinístico, nunca erra.** Pedido user (24/05/2026, IMG_1147 — 1.220 unidades com fotos genéricas erradas): "Foto tudo errado,... quero que isso seja resolvido em definitivo". Apresentei 4 opções, user escolheu A (biblioteca curada). **Arquitetura** (3 partes): (1) **Tabela `equipamentos_fotos_canonicas`** (`drizzle/schema.ts` + SyncSchema+ em `server/_core/index.ts`): `(id, company_id, descricao_normalizada UNIQUE per company, descricao_original, foto_url, ...)` — `CREATE TABLE IF NOT EXISTS` (R-001 OK). Normalização: NFD + remove diacríticos + uppercase + collapse spaces + trim. (2) **3 procedures tRPC** (`server/routers/equipamentos.ts`): `fotosCanonicasListar` (agrupa descrições + LEFT JOIN canônica), `fotosCanonicasUpsert` (storagePut → upsert → bulk UPDATE em chunks de 1000), `fotosCanonicasRemover` (DELETE + opcional clear das unidades cujo `foto_url === canonica`). (3) **Hook no `importarContratosLocacaoLote`**: pré-INSERT, SELECT canônicas por descricao_normalizada IN (...) e preenche `r.fotoUrl` — novas importações já nascem com foto certa. **Frontend** (`client/src/pages/equipamentos/Locados.tsx`): botão indigo "Biblioteca de fotos" sempre visível no header; antigo "Buscar fotos com IA" rebatizado pra "Tentar IA" (compacto, secundário, preservado pra fluxo legado); modal com grid 2-col, thumbnail clicável (file input + `compressImageIfNeeded`), filtro busca, indicador "X/N c/ foto". `mutation.onSuccess` invalida `bibliotecaQuery` + `locadosListar`. **Por que NÃO mexer nas fotos já erradas existentes**: o upsert SOBRESCREVE `foto_url` de TODAS as unidades dessa descrição (inclusive as da IA antiga) — efeito colateral é positivo (corrige). **R-001/R-007/R-010:** OK — só CREATE TABLE/INDEX IF NOT EXISTS no DDL; INSERT/UPDATE/DELETE no DML são CRUD escopado por user-action + companyId allowed-check (não é DELETE adhoc em massa). Hardening extra aplicado após review: whitelist MIME em `fotosCanonicasUpsert` + allowed-check em `importarContratosLocacaoLote` (que estava ausente desde Rev. 2333).
- **Rev. 2354** — **UX · Inputs de dinheiro no preview do import PDF de locação passam a usar formato BRL "R$ X.XXX,XX" (ponto de milhar + vírgula decimal).** Pedido user (24/05/2026, IMG_1151): "Coloca o valor em dinheiro no formato de dinheiro com ponto e vírgula". **Antes**: "Valor total" do contrato e "Subtotal" do item eram `<input type="number">` cru — exibiam "1641" pra R$ 1.641,00. **Depois** (`client/src/pages/equipamentos/Locados.tsx`, ~2066 e ~2113): `<input type="text" inputMode="numeric">` com padrão centavos — display via `toLocaleString("pt-BR", {minimumFractionDigits:2})`, onChange faz `replace(/\D/g,"") / 100`. Ao digitar "164100" vira R$ 1.641,00 (padrão fintech BR). Classes `text-right tabular-nums` pra alinhamento financeiro. **Por que NÃO componente compartilhado**: só 2 inputs em 1 tela — extrair quando aparecer 3º uso. **Preservado**: tipo do state interno (`number`) e schema Zod inalterados — só representação visual mudou. **R-001/R-007/R-010:** N/A — só UI client-side, zero DDL.

### Revisões recentes (one-liners)

- **Rev. 2355** — FEATURE/SOLUÇÃO DEFINITIVA · Biblioteca CURADA de fotos de equipamentos locados por descrição canônica. Substitui de vez a "busca de fotos com IA" (revs 2340-2350). User sobe 1 foto por descrição → ERP propaga pra TODAS as unidades atuais + futuras. Ver `shared/changelog.ts`.
- **Rev. 2354** — UX · Inputs de dinheiro no preview do import PDF de locação passam a usar formato BRL "R$ X.XXX,XX" (ponto de milhar + vírgula decimal). Ver `shared/changelog.ts`.
- **Rev. 2353** — FEATURE/REGRA · Import PDF de locação EXIGE obra vinculada por contrato antes de cadastrar (client bloqueia botão + server recusa BAD_REQUEST + banner vermelho + agrupamento por descricao+obra). Ver `shared/changelog.ts`.
- **Rev. 2352** — CLEANUP/UX · Removida a subpágina "Parâmetros CAPEX" da UI (sidebar + card no hub + rota + page + mapeamento de módulo); backend procedures e tabela DB preservados. Ver `shared/changelog.ts`.
- **Rev. 2351** — HOTFIX/FEATURE · Extração de PERÍODO DE LOCAÇÃO por contrato no import PDF reforçada (prompt Gemini com 8 regras + 3 exemplos F051/R051; `toIso` aceita D/M/AAAA, DD-MM, DD.MM; fallback fim = início + 30 dias). Ver `shared/changelog.ts`.

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
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
