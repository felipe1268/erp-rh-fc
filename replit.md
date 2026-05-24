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

- **Rev. 2373** — **FEATURE · "AB" (resposta do user IMG_1173) para controlar insumos a granel (areia, pedra, lajota): (A) toggle MANUAL no cadastro do item pra marcar como "insumo a granel = aplicação direta" sem depender da IA; (B) nova tela "Inventário Visual (Baias)" mobile-first com 5 botões grandes (VAZIA / 1/4 / METADE / 3/4 / CHEIA) — foto opcional, histórico com tendência.** Pedido user: "tem insumos que não dá para controlar no almoxarifado, tipo areia, pedra, lajota, como podemos controlar isso?" — propus 3 opções, user escolheu **A+B**. **PARTE A — Toggle manual** (`server/routers/compras.ts:1621` `definirTipoControleManual` + `client/src/pages/compras/Almoxarifado.tsx:80,696`): mutation que aceita `tipoControle: "estoque" | "aplicacao_direta"` com guards tenant + obra (mesma proteção do reclassificarIA — bloqueia virar AD se há saldo > 0 pra não sumir estoque real). Botão no modal de editar item com `window.confirm()` explicando o impacto, cor âmbar (granel) / verde (estoque). **PARTE B — Inventário Visual de Baias** (NOVA TELA): 2 tabelas novas em `drizzle/schema.ts:5903` (`almoxarifado_baias` + `almoxarifado_baia_leituras`), migration idempotente `CREATE TABLE/INDEX IF NOT EXISTS` em `server/_core/index.ts:1990` (padrão SyncSchema+, R-001 OK), 6 endpoints em `server/routers/warehouse.ts:2013` (`baiaListar` com DISTINCT ON pra última leitura + ROW_NUMBER pra penúltima [tendência], `baiaCriar/Editar/Desativar`, `baiaLeiturasListar`, `baiaLeituraRegistrar` validando `percentual ∈ {0,25,50,75,100}`), nova página `client/src/pages/almoxarifado/InventarioVisual.tsx` (380 linhas) com grid de cards (foto + nome + material + barra colorida + 5 botões grandes coloridos por nível + link histórico), modais de Nova/Editar baia (datalist 11 sugestões: areia/brita/pedrisco/lajota/tijolo/bloco/argamassa/cimento), Confirmar leitura (header colorido pelo nível, upload `capture="environment"`, obs), Histórico (timeline com thumbnail), Remover (soft delete). Rota `/almoxarifado/inventario-visual` em `App.tsx:525` + sidebar em `DashboardLayout.tsx:438` ("Inventário Visual (Baias)" entre "Inventário Semanal" e "Ferramentas de Terceiros"). **R-001/R-007/R-010 OK:** zero ALTER/DROP/DELETE; tenant + obra isolation em TODAS as queries/mutations; reusa `compressImageIfNeeded` + `storagePut`.
- **Rev. 2372** — **UX · "DEVOLVER LOCAÇÃO" do Almoxarifado agora abre um PICKER VISUAL com cards grandes (foto + descrição + obra + fornecedor) dos equipamentos em uso — operador de 4ª série escolhe e devolve em 2 cliques (escolher + confirmar).** Pedido user (24/05/2026, IMG_1172): "Quero que quando eu clicar em devolver o equipamento eu possa ver o que está locado.. quero facilidade... lembre-se quem opera é alguém que só tem a quarta série, pouco conhecimento. Tem que ser com poucos cliques". **Antes:** o botão laranja do Almoxarifado navegava pra `?action=devolver` e o handler só fazia `setFiltroStatus("em_uso")` + toast pedindo pra rolar a tabela e achar o botão "Devolver" minúsculo na linha — operador não entendia. **Implementação** (`client/src/pages/equipamentos/Locados.tsx`): novo state `pickerDevolver` + `pickerDevolverBusca`; deep-link `?action=devolver` agora abre o picker; botão hero "Devolver locação" laranja adicionado no header da página (badge `stats.ativos`, só aparece quando há equipamento em uso). Picker é um modal z-50 max-w-5xl full-screen no mobile com header gradient laranja-500→600 ("Qual equipamento vai devolver? Toque no equipamento certo. Depois é só tirar a foto e confirmar."), busca opcional (só com >6 equipamentos), grid 1col/2col de cards GRANDES ordenados por `dataFimPrevista ASC` (atrasados primeiro). Cada card: foto 28-32px quadrada, badge vermelho ATRASADO / âmbar VENCE EM BREVE / verde EM USO, descrição font-bold lg line-clamp-2, obra (MapPin emerald) ou "Sem obra" (italic amber), fornecedor, patrimônio/n°série em mono, dias na obra + data fim. Todo o card é `<button>` clicável (`active:scale-[0.98]` pra feedback tátil), footer laranja "DEVOLVER ESTE" + RotateCcw. Clique chama `escolher(l)`: fecha picker + `setModalDev(l)` + reset dev*. Fluxo de devolução (data + observação + fotos obrigatórias) continua sendo o `modalDev` existente. **R-001/R-007/R-010:** UI-only, zero backend, zero DDL, zero novas tRPC routes. Reusa `dataAll` (mesma query `locadosListar`) e a mutation `locadoDevolver` existente.

### Revisões recentes (one-liners)

- **Rev. 2371** — FEATURE · "Receber Locação na Obra" lista OCs de locação pendentes no topo do modal (almoxarife dá entrada com 1 clique). Backend `equipamentos.ocsLocacaoPendentes` com companyFilter, frontend pré-preenche dados. Ver `shared/changelog.ts`.
- **Rev. 2370** — UX/BUGFIX · Barra de busca de Equipamentos Locados promovida pra linha própria full-width (no iPad colapsava em ~100px mostrando só o ícone) + botão limpar (X). Selects Obra+Categoria migrados pra row abaixo. Ver `shared/changelog.ts`.
- **Rev. 2369** — FEATURE/UX · "Trocar foto com outro termo": modal de rebusca com query customizada + preview antes de aplicar. Backend `queryOverride`+`dryRun` em `locadosBuscarFotoWebPorDescricao` e `fotosCanonicasBuscarWebUpsert`. Ver `shared/changelog.ts`.
- **Rev. 2368** — UX · Lightbox de foto na Biblioteca: clicar no thumbnail amplia em fullscreen (ESC ou click fora fecha). Aplicado em 4 lugares (modal Biblioteca, cards de grupo, cards de unidade, modal Eventos). Ver `shared/changelog.ts`.
- **Rev. 2367** — FEATURE/UX · Extensão do "Buscar na web" (Rev. 2366) pra dentro do modal Biblioteca de fotos — DDG → baixa o arquivo → storagePut → upsert em `equipamentos_fotos_canonicas` → propaga pras unidades. SSRF guard em 3 camadas no download. Ver `shared/changelog.ts`.

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
