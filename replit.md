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

- **Rev. 2371** — **FEATURE · "Receber Locação na Obra" agora lista as OCs de locação pendentes de recebimento no topo do modal — almoxarife clica e dá entrada com 1 clique (em vez de digitar tudo na mão).** Pedido user (24/05/2026, IMG_1171): "Quando tiver ordem de compra para equipamentos locados deve aparecer aqui, para que o almoxarife dê a entrada". **Backend** (`server/routers/equipamentos.ts`): novo `equipamentos.ocsLocacaoPendentes` (query), lista OCs com `is_locacao=true`, `status IN ('pendente','aprovada','parcial')` (mesmo conjunto usado em warehouse para recebimento) e que AINDA NÃO foram recebidas (`NOT EXISTS` em `equipamentos_locados.ordem_compra_id`). Retorna metadados + itens via batch query (zero N+1). **Frontend** (`client/src/pages/equipamentos/Locados.tsx`): query nova + state `ocSelecionada` + handler `receberDaOC(oc)` que pré-preenche descricao (1º item), fornecedor, dataInicio/Fim (locacaoData*), valorDiario (precoUnitario do item) e valorMensal (`total/dias*30`). Nova seção `tint="violet"` no TOPO do modal: loading mostra spinner; vazio + sem seleção esconde a seção inteira (preserva fluxo manual); com seleção mostra banner verde "Recebendo OC NNN" + botão "Trocar OC"; com OCs mostra cards clicáveis com badge OC + status, total emerald, descrição truncada, fornecedor + período + duração. `salvar()` envia `ordemCompraId` — backend `locadoCriar` já persistia o campo, só faltava o front mandar. Após sucesso invalida `ocsLocacaoPendentes` (OC some da lista pelo NOT EXISTS). `Section` ganhou suporte ao tint `violet`. **R-001/R-007/R-010:** zero DDL, novo endpoint read-only, mutation existente ganhou campo opcional backward-compatible.
- **Rev. 2370** — **UX/BUGFIX · Barra de busca de Equipamentos Locados promovida pra linha própria full-width (no iPad colapsava em ~100px mostrando só o ícone, sem placeholder visível) + botão limpar (X).** Pedido user (24/05/2026, IMG_1169): "Cadê a barra para pesquisa ?". **Diagnóstico:** o `<input value={busca}>` SEMPRE existiu (Locados.tsx ~linha 1262, wired ao state e ao query server-side `locadosListar({busca})`), mas a row usava `md:grid-cols-[1fr_minmax(220px,auto)_minmax(220px,auto)]` — os 2 selects (Obra + Categoria) consumiam ≥220px cada, deixando o `1fr` da busca com ~100px líquidos no iPad portrait. Só sobrava espaço pro ícone Search com `pl-10`, placeholder "Buscar por descrição, fornecedor, patrimônio…" cortado/invisível. Para o user a barra simplesmente NÃO EXISTIA. **Implementação** (`client/src/pages/equipamentos/Locados.tsx` linhas 1262-1284): row reescrita em 2 níveis — (1) busca em linha PRÓPRIA full-width, `border-2`, ícone Search emerald-500 (não mais slate-400), quando preenchida ganha `border-emerald-400 bg-emerald-50/40` (mesmo padrão dos selects ativos = feedback "filtro ligado"); (2) botão limpar (X) circular à direita só quando há texto, `aria-label="Limpar busca"`, padding direito vira `pr-10` pra não colidir; (3) selects Obra + Categoria migraram pra row separada abaixo com `md:grid-cols-2`. **Backend / state / wiring:** ZERO alteração — `busca` state, `locadosListar` ILIKE, chips de filtros ativos, tudo preservado. **R-001/R-007/R-010:** UI-only, zero backend, zero DDL, idempotente.

### Revisões recentes (one-liners)

- **Rev. 2369** — FEATURE/UX · "Trocar foto com outro termo": modal de rebusca com query customizada + preview antes de aplicar. Backend `queryOverride`+`dryRun` em `locadosBuscarFotoWebPorDescricao` e `fotosCanonicasBuscarWebUpsert`. Ver `shared/changelog.ts`.
- **Rev. 2368** — UX · Lightbox de foto na Biblioteca: clicar no thumbnail amplia em fullscreen (ESC ou click fora fecha). Aplicado em 4 lugares (modal Biblioteca, cards de grupo, cards de unidade, modal Eventos). Ver `shared/changelog.ts`.
- **Rev. 2367** — FEATURE/UX · Extensão do "Buscar na web" (Rev. 2366) pra dentro do modal Biblioteca de fotos — DDG → baixa o arquivo → storagePut → upsert em `equipamentos_fotos_canonicas` → propaga pras unidades. SSRF guard em 3 camadas no download. Ver `shared/changelog.ts`.
- **Rev. 2366** — FEATURE/UX · Busca de foto "como usuário normal faria" em `/equipamentos/locados`: descrição → DuckDuckGo Images → 1º resultado → UPDATE em todas as unidades. ZERO LLM. Botão hero, thumbnails interativos, widget de progresso. Ver `shared/changelog.ts`.
- **Rev. 2365** — UX/REORG + KPI · Análise IA "Comprar vs Continuar Alugando" migrada de `/equipamentos/locados` pra Dashboard Almoxarifado aba "Equip. Locados", agora com KPI 0-100% em anel SVG. Ver `shared/changelog.ts`.

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
