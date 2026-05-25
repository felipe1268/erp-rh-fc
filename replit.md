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


- **Rev. 2427** — **PLANEJAMENTO · REGRA DE OURO DEFINITIVA · `% PREVISTO`=Texto6 puro + `% CONCLUÍDA`=PercentComplete puro, para TODAS as obras (presentes e futuras).** Após mapeamento canônico do XML HOTEL DO PAPA (PLN_783_01_2026_R01 BL, StatusDate 25/05/2026) com 6 amostras cruzadas (raiz 79/79, 02 80/75, 02.09 100/100, 02.10 75/79, 02.19 19/0, 02.22 46/23) provando paridade 100% XML × tela MSP: a **coluna "% PREVISTO" do MSP = `Texto6` (FieldID 188743746)** puro (fórmula `Int(((StatusDate−BL_Start)/(BL_Finish−BL_Start))*100)` já usa as datas da BASELINE — não precisa ler `<Baseline>` separado) e a **coluna "% concluída" = `PercentComplete` nativo** (não é Texto7/AD-RD/Texto9). **Arquivo único (zero backend, zero migration):** `client/src/pages/planejamento/ImportarCronograma.tsx` — (a) bloco "REGRA DE OURO" L257-281 (documentação canônica); (b) raiz L305-309: cadeia `Texto6 → Texto10 → Texto11` (Texto6 PREFERENCIAL, Texto9 REMOVIDO — era override manual instável); (c) raiz L313-315: `realizadoMspRaiz = <PercentComplete>` puro, substituindo a heurística AD/(AD+RD) da Rev. 1675; (d) atividade L429-458: `realizadoMsp = <PercentComplete>` puro + `previstoMsp = Texto6 → Texto10 → Texto11` (sem Texto7, sem Texto9, sem fallback calculado). Hooks `mspReadOnly`/`avancoPrevistoDia` (Rev. 2425) já em leitura pura — sem mudança. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
- **Rev. 2426** — **ALMOXARIFADO · AUDITORIA · banner global de pendências acima do `<main>` do DashboardLayout + deep-link `?auditoria=1`.** Rev. 2388 já tinha entregue o ciclo completo de controle rígido (schema `almoxarifado_auditoria` L8845, mutations `compras.excluirItem`/`excluirUnidade`/`atualizarItem` exigindo senha+justificativa, endpoints `auditoriaListar`/`auditoriaPendenciasCount`/`auditoriaValidar`, modal de validação dentro de `almoxarifado/index.tsx`) — mas o **alerta global** ficou pendente: admins só viam pendências entrando no Almoxarifado. **Arquivos (2, zero backend):** (a) `client/src/components/DashboardLayout.tsx` L1001-1012 — nova query `compras.auditoriaPendenciasCount` (refetch 60s; endpoint já filtra por role+obras permitidas no servidor, retorna 0 pra não-validadores); + state `auditoriaBannerOpen` p/ dispensar; + banner ambar L1972-1997 renderizado entre `<CompanyHeader>` e `<main>` quando `count>0 && !location.startsWith("/almoxarifado")` (esconde se já estamos na tela com o modal), com `<ShieldAlert>`, mensagem, botão laranja "Revisar agora" → `setLocation("/almoxarifado?auditoria=1")` e botão X p/ dispensar; (b) `client/src/pages/almoxarifado/index.tsx` L116-128 — `useEffect` único no mount detecta `?auditoria=1`, abre `setModalAuditoriaList(true)` e limpa o param via `history.replaceState`. Rota dedicada `/almoxarifado/auditoria` descartada — modal viewer da 2388 já é full-screen com filtros + cards expansíveis. R-001/R-007/R-010 OK. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2425** — PLANEJAMENTO · LEITURA PURA DO MSP · Texto9 na cadeia de fallback + revertido cálculo dinâmico `mspReadOnly`/`avancoPrevistoDia` (caso HOTEL DO PAPA). Texto9 depois removido na Rev. 2427. Ver `shared/changelog.ts`.
- **Rev. 2424** — UX · PLANEJAMENTO/LISTA · `window.confirm` nativo substituído por AlertDialog estilizado ao excluir projeto (com nome+cliente, aviso destrutivo, Loader2). `PlanejamentoLista.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2423** — AVISO PRÉVIO · trabalhado volta a 30d fixos de CUMPRIMENTO (caso Myriélle 2 anos); VERBA segue 30+3·ano. `calcularDiasAviso(anos,tipo)→30` p/ qualquer `*_trabalhado`. AvisoPrevio.tsx + rescisaoCalc.ts + avisoPrevioFerias.ts + dashboards.ts (CDM). Ver `shared/changelog.ts`.
- **Rev. 2422** — INVENTÁRIO VISUAL DE BAIAS · "Desfazer aferição" com estorno automático do almox. ADD COLUMN `movimentacao_id` em `almoxarifado_baia_leituras` vincula leitura↔mov. Novo `baiaLeituraDeletar` (guard só última leitura, autor OU ADMIN, estorna mov entrada). Frontend: botão Trash vermelho + modal de confirmação. Ver `shared/changelog.ts`.
- **Rev. 2421** — INVENTÁRIO VISUAL DE BAIAS · 3 bugs (baixa não debitava → bloco pós-INSERT cria mov saída; card vira clicável p/ histórico; menu sumia em grupo → feature `almoxarifado-inventario-visual` em `shared/modules.ts`). Ver `shared/changelog.ts`.

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
