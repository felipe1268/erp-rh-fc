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


- **Rev. 2431** — **ALMOXARIFADO · INVENTÁRIO VISUAL · preview visual da foto no modal "Registrar baixa da baia" (antes só mostrava o nome do arquivo).** Caso real (QIU 2 - FASE 4, baia "Item TESTE -areia"): após anexar foto, input mostrava só "✓ image.jpg" — sem confirmação visual de QUAL foto foi anexada (crítico em mobile com `capture="environment"`). **Arquivo único (zero backend):** `client/src/pages/almoxarifado/InventarioVisual.tsx` — (a) import: `+ useEffect`; (b) L121-125: estado `leituraFotoUrl` = `useMemo(URL.createObjectURL)` + `useEffect` cleanup (revoke no unmount/troca, sem memory leak); (c) L823-855: bloco da foto reescrito — quando há foto, renderiza `<img>` h-44 object-cover com 2 botões sobrepostos ("Trocar" reaproveitando o input file + "Remover" vermelho) + badge inferior "Foto pronta · NN KB"; quando vazio, mantém dropzone original h-20 dashed. Fluxo de compressão+upload no submit intocado. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
- **Rev. 2430** — **ALMOXARIFADO · INVENTÁRIO VISUAL · botão "Desfazer última" agora aparece DIRETO no card + card "Restante" com fallback pro saldo do sistema quando ainda não houve aferição visual.** Caso real reportado pelo user: baia "Item TESTE -areia" (ESCRITÓRIO CENTRAL) com card "Restante" em "—" e botão "Desfazer aferição" enterrado DENTRO do modal de Histórico — invisível. **Arquivo único (zero backend, zero migration):** `client/src/pages/almoxarifado/InventarioVisual.tsx` — (a) L380-384: linha "Saldo no sistema" sempre visível abaixo do nome (mesmo quando `qtdAtual === 0` — fica em slate-400 pra não competir; antes desaparecia, deixando user sem contexto); (b) L401-422: card "Restante" agora `volAtual ?? qtdAtual` (fallback pro saldo do sistema), com sufixo discreto "(sist.)" + tooltip explicando origem dos 3 estados (aferição visual / saldo sistema / sem nada); (c) L429-450: rodapé do card vira flex com 2 botões — "Ver histórico" à esquerda + "Desfazer última" vermelho à direita (só se `ult` existe), abrindo o MESMO modal de confirmação da Rev. 2422 (`setDesfazendoLeitura(ult)`). Reaproveita 100% o endpoint `warehouse.baiaLeituraDeletar` (guard "só última leitura" + estorno automático intocados — sem novos vetores de exclusão). R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2429** — ALMOXARIFADO · AUDITORIA · aprovadores delegados por obra (engenheiro responsável + delegados podem validar exclusões/ajustes de estoque). Nova tabela `obra_responsaveis_estoque` (N:N obra↔users, principal/delegado) + 4 endpoints CRUD + auditoriaValidar/PendenciasCount adaptados. Modal `ModalAprovadoresEstoque` na tela Obras. Ver `shared/changelog.ts`.
- **Rev. 2428** — UX · PLANEJAMENTO/LISTA · modal "Novo Projeto" redesenhado com identidade FC (faixa azul #1B2A4A) + shadcn Select/Textarea + fim do scroll horizontal (caso CONDOMÍNIO NOSSA SENHORA). `PlanejamentoLista.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2427** — PLANEJAMENTO · REGRA DE OURO DEFINITIVA · `% PREVISTO`=Texto6 puro + `% CONCLUÍDA`=PercentComplete puro para TODAS as obras. Mapeamento canônico XML HOTEL DO PAPA validado (paridade 100% XML × tela MSP). `ImportarCronograma.tsx` bloco L257-281. Ver `shared/changelog.ts`.
- **Rev. 2426** — ALMOXARIFADO · AUDITORIA · banner global de pendências acima do `<main>` do DashboardLayout + deep-link `?auditoria=1`. Query `compras.auditoriaPendenciasCount` refetch 60s; banner ambar dismissable com botão "Revisar agora". Ver `shared/changelog.ts`.
- **Rev. 2425** — PLANEJAMENTO · LEITURA PURA DO MSP · Texto9 na cadeia de fallback + revertido cálculo dinâmico `mspReadOnly`/`avancoPrevistoDia` (caso HOTEL DO PAPA). Texto9 depois removido na Rev. 2427. Ver `shared/changelog.ts`.

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
