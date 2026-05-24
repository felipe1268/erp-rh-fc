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

- **Rev. 2378** — **UX · Substituído `window.confirm()` por modal customizado no fluxo "Buscar fotos da web" do Almoxarifado.** Pedido user (IMG_1179, 24/05/2026): "Melhore a tela". Print do iPad mostrava o nativo do Safari com o domínio Replit (`b41aedae-6288-4323-...replit.dev diz`) ocupando 3 linhas no título — visual quebrado e nada profissional. **Implementação** (`client/src/pages/almoxarifado/index.tsx`, UI-only): novo state `confirmBuscaFotos: { nomes: string[] } | null`; `buscarFotosWebTodas()` agora só coleta nomes e abre o modal; nova `executarBuscaFotosWebTodas(nomes)` roda o loop (lógica preservada). Modal: header gradient sky/blue com ícone Globe + título "Buscar fotos na internet" + subtítulo "{N} itens sem foto"; corpo com bullets (1 busca/nome, só preenche sem foto, tempo estimado, pode interromper); footer com Cancelar + Buscar agora; backdrop bg-black/50 clicável; z-[110] acima do widget de progresso. **R-001/R-007/R-010 OK:** UI-only.
- **Rev. 2377** — **FEATURE · "Buscar fotos da web" no Almoxarifado (mesma abordagem da Rev. 2366 dos Locados): DuckDuckGo Images, 1 chamada por nome, UPDATE em lote nos itens SEM foto.** Pedido user (IMG_1178, 24/05/2026): "Quero ter a opção de colocar fotos aqui tbm, vamos usar a mesma abordagem que usamos da última vez, procura na internet como se fosse um usuário humano e cola foto nos que ainda não tem". **Backend** (`server/routers/compras.ts` novo `buscarFotoWebPorNome`): cópia do `equipamentos.locadosBuscarFotoWebPorDescricao` adaptado pra `almoxarifado_itens.nome` — pega vqd da DDG HTML → chama `i.js` → 1ª foto válida (HTTPS + .jpg/.png/.webp + ≤1000 chars) → UPDATE `almoxarifado_itens` SET foto_url=$1 WHERE company_id=$2 AND nome=$3 AND ativo=TRUE AND (foto_url IS NULL OR ''). Suporta `sobrescrever`, `queryOverride`, `dryRun`; tenant guard via `getCompaniesForUser`. **Frontend** (`client/src/pages/almoxarifado/index.tsx`): (a) toolbar com botão sky "Fotos da web" ao lado do "Foto IA" → `buscarFotosWebTodas()` coleta nomes distintos SEM foto da lista filtrada, confirm() com estimativa, loop sequencial 250ms, widget flutuante bottom-right (Globe pulsando + barra + ok/falhas/itens + botão Parar); (b) card sem foto ganha botão sky "Buscar na web" no bottom do thumbnail → `buscarFotoWebUm(item.nome)` com loader. Invalida `compras.listarItens` + `listarItensConsolidado`. **R-001/R-007/R-010 OK:** só INSERT/UPDATE escopado, zero ALTER/DROP.

### Revisões recentes (one-liners)

- **Rev. 2376** — UX/ALERTA · Botão ENTRADA do Almoxarifado pisca com badge vermelho mostrando quantas OCs de MATERIAL estão pendentes (complementa Rev. 2375 que tratou só LOCAÇÃO). Nova `warehouse.listPendingOCs.useQuery` com refetch 60s. UI-only. Ver `shared/changelog.ts`.
- **Rev. 2375** — UX/ALERTA · Botão "RECEBER LOCAÇÃO" do Almoxarifado pisca com badge vermelho da qtd. de equipamentos pra chegar (OCs de locação pendentes). Reusa `equipamentos.ocsLocacaoPendentes` (Rev. 2371) com refetch 60s. UI-only. Ver `shared/changelog.ts`.
- **Rev. 2374** — FEATURE · Classificar equipamentos do Almoxarifado como Próprio FC ou Alugado em LOTE — múltipla seleção visual + sticky bar com 2 botões; fila em sessionStorage (com companyId guard) leva pros forms de Próprios/Locados pré-preenchidos. Ver `shared/changelog.ts`.
- **Rev. 2373** — FEATURE · Controle de insumos a granel (areia/pedra/lajota): (A) toggle MANUAL "insumo a granel = aplicação direta" no cadastro; (B) nova tela "Inventário Visual (Baias)" mobile-first com 5 botões grandes (VAZIA / 1/4 / METADE / 3/4 / CHEIA), foto opcional, histórico c/ tendência. Ver `shared/changelog.ts`.
- **Rev. 2372** — UX · "DEVOLVER LOCAÇÃO" do Almoxarifado agora abre PICKER VISUAL com cards grandes (foto + descrição + obra + fornecedor) dos equipamentos em uso — operador de 4ª série escolhe e devolve em 2 cliques. Ver `shared/changelog.ts`.

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
