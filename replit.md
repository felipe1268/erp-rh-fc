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

- **Rev. 2390** — **ALMOXARIFADO/UX · Transferência em LOTE no sticky bar do modo seleção (N itens → 1 destino comum, qtd editável por linha).** Pedido user (IMG_1195, 24/05/2026, 20:07): sticky bar já tinha "Alterar categoria" + "Unificar duplicatas" + "Cancelar"; user pediu pra adicionar tb "Transferir". **Backend** (`server/routers/warehouse.ts` L1327-1454): novo endpoint `createTransferenciaLote` recebe `{companyId, itens:[{itemIdOrigem, quantidade}], destinoTipo, destinoObraId?, destinoObraNome?, motivo?}` — itera linha-a-linha reusando exatamente a mesma lógica do `createTransferencia` single (busca item, valida companyId+estoque, débita origem, upsert no destino pelo `nome+obraId`, registra em `almoxarifado_transferencias`). Origem (tipo+obraId+obraNome) é INFERIDA do próprio item de origem (não vem do client → log fidedigno + IDOR-safe). Pula com `falhas.push(...)` quando: item inexistente / outra empresa / origem==destino / estoque insuficiente / exceção. NÃO usa transação multi-item — registro auditável linha-a-linha em `almoxarifado_transferencias` já cobre rollback contábil. Retorna `{sucessos, falhas, total}`. **Frontend** (`client/src/pages/almoxarifado/index.tsx`): novo state `modalTransfLote`, helpers `abrirTransfLote()` (filtra `lista` pelos IDs do Set `selecionados`, default qtd=estoque atual) e `aplicarTransfLote()` (valida qtd≤estoque com tol. 1e-9, invalida `listarItens`/`listarItensConsolidado`). Botão "Transferir" (roxo, ArrowLeftRight) entre "Unificar" e "Cancelar" ~L4066. Modal max-w-2xl com header roxo→indigo: select destino + motivo + lista scroll com input qtd por linha + botão "Preencher tudo" + X p/ remover do lote + painel de resultado parcial (sucessos/falhas com motivo). Toast verde + fecha quando 100% OK; amarelo + mantém modal quando há falhas parciais. R-001/R-007/R-010 OK.
- **Rev. 2389** — **GOVERNANÇA/COMPRAS · Guarda determinística impede que OCs de SERVIÇO / ADMINISTRATIVO / TRIBUTO virem item de Almoxarifado.** Pedido user (IMG_1192, 24/05/2026): print mostrava lixo no almoxarifado — Internet, Mensalidade Ponto Facial, Papel Timbrado, Serviço de Manutenção, Pistola de Pólvora — que entraram via `atualizarStatusOrdem` quando OCs tipo=`compra` continham itens administrativos misturados (o filtro antigo só bloqueava OC inteira tipo=`servico|pacote`). User vai limpar manualmente, mas pediu pra NUNCA MAIS acontecer. **Backend** (`server/routers/compras.ts` L42): nova função pura `classificarNaturezaItemAlmox(descricao, unidade)` com regex word-boundary cobrindo serviço/mensalidade/assinatura/internet/manutenção/consultoria/honorário/hora técnica/mão-de-obra/taxa/imposto/multa/tarifa/pedágio/seguro/correios/papel timbrado/ponto facial/TI/SaaS/licença de software/frete/ensaio/treinamento + unidades de tempo (`h, hora, mês, ano, vb, verba, serv`). Aplicada em 2 pontos: (1) `atualizarStatusOrdem` ~L8077 — se a OC tem `solicitacaoId` e a SC tem `tipo!='material'` (já existe na coluna), pula a OC inteira; depois, per-item, se a heurística rejeita, atualiza só `quantidadeEntregue` da linha OC + `quantidadeAtendida` da SC vinculada (pra fechar o ciclo) e PULA criação no almoxarifado, devolvendo `itensIgnorados[]` no response. (2) `warehouse.registerSmartEntry` L1771 — `itemNovo: true` cuja descrição cai na heurística agora lança `TRPCError BAD_REQUEST` com mensagem orientando o user a lançar como Despesa/Serviço no Financeiro/Compras. Helper exportado e importado dinamicamente em `warehouse.ts` pra evitar ciclo. ZERO mudança de schema (R-001/R-007/R-010 OK), zero impacto em itens existentes.

### Revisões recentes (one-liners)

- **Rev. 2388** — SEGURANÇA · Controle rígido de auditoria no Almoxarifado: excluir item/unidade + alterar qtd manualmente → senha (se user local) + justificativa; log com snapshot antes/depois; tela de admin pra validar/rejeitar. Nova tabela `almoxarifado_auditoria` (CREATE IF NOT EXISTS). Ver `shared/changelog.ts`.
- **Rev. 2387** — UX · Substituídos os 2 `window.confirm()` nativos que sobravam no Almoxarifado por modais customizados (header red→rose + Trash2). Print iPad mostrava confirm nativo do Safari com URL Replit ocupando 3 linhas + opção "Bloquear caixas". Ver `shared/changelog.ts`.
- **Rev. 2386** — FEATURE · IA sugere categorias para itens "Sem categoria" no Almoxarifado (em lote, com modal de revisão); vocabulário fechado (`almoxarifado_categorias`); apply POR IDS via `atualizarCategoriaEmLote`. Ver `shared/changelog.ts`.
- **Rev. 2385** — UX · Filtro "⚠️ Sem categoria" no dropdown de categorias do Almoxarifado (view por obra E consolidado). `<option value="__sem__">` + filtro em `lista`/`consFinal`. Ver `shared/changelog.ts`.
- **Rev. 2384** — FIX/UX · Badges "X pra receber" do ENTRADA e RECEBER LOCAÇÃO contam só OCs da obra em contexto (ou das obras permitidas); `obraId` opcional + `getEffectiveAllowedObraIds` + FORBIDDEN se fora do allowed (IDOR). Ver `shared/changelog.ts`.

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
