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


- **Rev. 2424** — **UX · PLANEJAMENTO/LISTA · `window.confirm` nativo substituído por AlertDialog estilizado ao excluir projeto.** Pedido user (25/05/2026, screenshot): o `confirm()` nativo no botão Trash da lista de projetos mostrava o cabeçalho cru do domínio Replit (`b41aedae-...picard.replit.dev diz`) e a mensagem técnica "Excluir este projeto e todos os seus dados?" — sem branding FC, sem nome do projeto, sem aviso real de destrutividade. Substituído por `<AlertDialog>` do shadcn (componente já existente em `client/src/components/ui/alert-dialog.tsx`). Arquivo único: `client/src/pages/planejamento/PlanejamentoLista.tsx` — (a) imports `AlertDialog*`; (b) novo state `confirmExclusao: { id, nome, cliente? } | null`; (c) onClick do Trash agora apenas `setConfirmExclusao({...})`; (d) modal renderizado no fim do JSX com header vermelho + `<AlertTriangle>`, descrição citando **nome + cliente entre aspas**, box vermelho explícito "remove permanentemente cronograma/curva S/REFIS · não pode ser desfeita", botões "Cancelar" (outline) e "Excluir projeto" (`bg-red-600` + Loader2 durante mutation); (e) `excluirMutation` ganhou `onError` que avisa + fecha modal, `onSuccess` também limpa `confirmExclusao`, `onOpenChange` ignora fechamento enquanto `isPending`. Zero backend, zero schema. Plano grande de auditoria do almoxarifado (senha+justificativa+log antes/depois) ficou reservado pra Rev. 2425+ como tarefa independente. Detalhe: `shared/changelog.ts`.
- **Rev. 2423** — **AVISO PRÉVIO · trabalhado volta a 30d fixos de cumprimento (caso Myriélle).** Pedido user (25/05/2026, screenshot Myriélle 2 anos mostrando "36 dias de aviso"): "o aviso é sempre 30 dias... o 6 dias a mais conta apenas para efeito do calculo de rescisao". Reverte parcialmente Rev. 1943/1965: **CUMPRIMENTO** (período trabalhado) = 30 fixos para qualquer `*_trabalhado`; **VERBA** (valor financeiro) segue íntegro o total 30+3·ano via `calcularDiasAvisoTotal` + `calcularRescisaoCompleta` (que já pagava `diasExtras` como avisoIndenizado complementar pra empregador_trabalhado — esse trecho intocado). Arquivos: (a) `server/utils/rescisaoCalc.ts` L260-271 — `calcularDiasAviso(anos, tipo)` agora retorna 30 para QUALQUER `*_trabalhado`; (b) `client/src/pages/AvisoPrevio.tsx` L538 (geração de documento) + L2715 (preview reativo do form) — `(isPedidoDemissao || isTrabalhado) ? 30 : total`; (c) painel "Base Legal" expandível L2252-2355 reescrito explicando distinção CUMPRIMENTO vs VERBA (tabela mostra "30 + N" no trabalhado vs "30+N total" no indenizado); (d) `server/routers/avisoPrevioFerias.ts` L944-951 — `diasAvisoTrab = 30` fixo no comparativo (antes total proporcional), `fatorPeriodoTrab=1`, observação textual atualizada; (e) `server/routers/dashboards.ts` L2530 — CDM (Custo de Demissão em Massa) trocou `calcularDiasAvisoTotal(anos)` por `calcularDiasAviso(anos, tipo)` p/ paridade com módulo oficial — captado pelo architect. Impacto: zero perda patrimonial pro empregado (continua recebendo total); FC economiza encargos patronais sobre os dias indenizados (que não incidem). R-001/R-007/R-010 OK (zero schema, zero migration). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2422** — INVENTÁRIO VISUAL DE BAIAS · "Desfazer aferição" com estorno automático do almox. ADD COLUMN `movimentacao_id` em `almoxarifado_baia_leituras` vincula leitura↔mov. Novo `baiaLeituraDeletar` (guard só última leitura, autor OU ADMIN, estorna mov entrada). Frontend: botão Trash vermelho + modal de confirmação. Ver `shared/changelog.ts`.
- **Rev. 2421** — INVENTÁRIO VISUAL DE BAIAS · 3 bugs (baixa não debitava → bloco pós-INSERT cria mov saída; card vira clicável p/ histórico; menu sumia em grupo → feature `almoxarifado-inventario-visual` em `shared/modules.ts`). Ver `shared/changelog.ts`.
- **Rev. 2420** — EQUIPAMENTOS LOCADOS/Picker "Devolver" · MULTI-SELEÇÃO + filtro de permissão de obra. `equipamentos.locadosListar` ganha `getEffectiveAllowedObraIds()`; picker vira toggle multi com sticky footer laranja; endpoint novo `locadoDevolverEmLote` (200 ids, sequencial, reusa lógica single). Ver `shared/changelog.ts`.
- **Rev. 2419** — ALMOXARIFADO/VALOR POR ALMOXARIFADO · Mostra TODAS as obras ativas, mesmo as zeradas. Removido `.filter(e => e.valor > 0)` em `almoxarifado/index.tsx` L1743-1768; zeradas com styling distinto (opacity-60). Ver `shared/changelog.ts`.
- **Rev. 2418** — ALMOXARIFADO/VALOR TOTAL DO ESTOQUE · Exclui locados por padrão + respeita filtros visíveis. Default `filtroEquip=todos` → locados EXCLUÍDOS + badge "X locado(s) excluído(s)"; `locado`/`vinculado` → inclui; demais filtros → reflete lista filtrada. 5 blocos no `almoxarifado/index.tsx` (consolidado + por obra + banners + tfoot). Zero backend. Ver `shared/changelog.ts`.

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
