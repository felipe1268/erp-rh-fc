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

- **Rev. 2360** — **UX/REDESIGN · Aba "Movimentações" do Dashboard Almoxarifado completamente refeita pra análise mais profunda + TODAS as datas dos charts padronizadas em formato BR (DD/MM).** Pedido user (24/05/2026, IMG_1156): "Refaça o layout para que possamos ter uma análise melhor, todas as datas devem ser feitas no padrão brasileiro". **Problema 1**: eixo X mostrava `04-25` (MM-DD) porque `Object.keys(porDia).map(k => k.slice(5))` cortava só o ano. **Problema 2**: 4 KPIs sem média/dia nem delta, gráfico fixo em 30d, doughnut por-tipo redundante, tabela sem obra/responsável — análise rasa. **Fix em 1 arquivo** (`client/src/pages/dashboards/DashAlmoxarifadoEquipamentos.tsx`): (1) Helper `fmtDayBR` (YYYY-MM-DD→DD/MM) aplicado nos 2 charts diários (Visão Geral + Movs); chart da Visão Geral usa memo SEPARADO `visaoGeralMovs` (fixo 30d) pra não ser contaminado pelo filtro da aba Movs. (2) State `movsPeriodoDias` (7/30/90) com pill segmented no topo da tab — afeta SÓ a tab Movs (independente do `periodoMeses` global). (3) `movAgg` reescrito: além do diário+por-tipo, agora calcula `mediaDia*`, período anterior (`entAnt`/`saiAnt`/`movsAnt`) pros deltas, `porDiaSemana`, `topItens` (top 10 com split entrada/saída), `topObras` (top 8). (4) UI: header com filtro + sub "comparado com N dias anteriores"; 4 KPIs com `sub` via componente `DeltaSub` ("X,X/dia · ↑12% vs N" com seta+cor); gráfico principal em DD/MM; grid 3-col (Top 10 itens como lista visual com barra split verde/vermelho + doughnut por-tipo compacto + mini-bar Dom-Sáb com fim-de-semana em cinza); card Top 8 obras destino; tabela últimas 15 ampliada (+colunas Obra/Responsável, badge colorida por tipo, qtd com sinal ±N colorido). **Decisões**: Top itens como LISTA VISUAL (CSS) em vez de horizontal bar — mais limpo com 10 itens e mostra split sem stacked chart; doughnut por-tipo mantido pq são 2-4 categorias; comparação "imediatamente anterior" da mesma duração (não same-period-last-month). **R-001/R-007/R-010:** N/A — 100% client-side, zero DDL/SQL/mutations.
- **Rev. 2359** — **UX/OBSERVABILIDADE · Parse de PDF de locação ganha painel de diagnóstico em tempo real (fase atual + timer mm:ss + contador de checagens + heartbeat verde) pra eliminar a percepção de "travado em 99%". Após 90s aparece botão "Cancelar parse e trocar arquivo".** Pedido user (24/05/2026, IMG_1155 — JALVES.pdf 259KB): "Está travado em 99% quero ver o que está acontecendo com alertas pq não posso e pensar que esta travado". **Causa raiz da percepção**: o cliente faz creep 0→95% em 35s e 95→99% em ~60s por design (Rev. 2310/2318) e trava em 99 até onSuccess. Quando Gemini leva 80-120s em PDFs grandes, user vê barra ESTÁTICA + texto único "PDF extenso detectado…" — zero indicador de vida. **Fix em 2 camadas** (`server/routers/equipamentos.ts` + `client/src/pages/equipamentos/Locados.tsx`): (1) Server: novo `ParsePhase` enum + helper `setParsePhase(jobId, phase)` chamado em 4 pontos (`calling_ai` antes do invokeGeminiVision, `parsing_json` após retorno, `repairing_json` no catch, `normalizing_dates` após reparo). `parsearContratoLocacaoPdfStatus` agora devolve `elapsedMs`/`phase`/`phaseElapsedMs` em todos os status. (2) Client: state `parseDiag` atualizado a cada poll (2.5s); card indigo abaixo da barra com ícone+label pt-BR da fase ("🤖 Chamando Gemini Vision"), 3 chips (Tempo total · Checagens · Próxima em ~Xs), heartbeat verde "Conexão ativa — processamento NÃO travado". Após 90s aparece botão Cancelar. **Por que NÃO barra "real"**: Gemini é single-shot sem stream — barra cumpre função psicológica; painel é o indicador de saúde real. **R-001/R-007/R-010**: N/A — zero DDL, zero mutations novas, só UI + 4 writes in-memory no Map já existente.

### Revisões recentes (one-liners)

- **Rev. 2358** — FEATURE/UX · Import PDF de locação ganha campo "Fornecedor (locadora) deste PDF" + botão "Aplicar a todos" pra padronizar o fornecedor em todos os contratos do mesmo PDF de uma vez. Ver `shared/changelog.ts`.
- **Rev. 2357** — HOTFIX/UX · Modal drill-down de "Locações mês a mês" ganha botão "Fechar" no rodapé + altura usa `dvh` em vez de `vh` pra respeitar a URL bar dinâmica do iOS Safari. Ver `shared/changelog.ts`.
- **Rev. 2356** — UX/REDESIGN · Hub de Equipamentos (`/equipamentos`) ganha layout 100% renovado: agrupamento client-side por (descricao+obra+fornecedor+fim), 4 KPIs, cards com badge urgência semaforizado e barra de progresso. Ver `shared/changelog.ts`.
- **Rev. 2355** — FEATURE/SOLUÇÃO DEFINITIVA · Biblioteca CURADA de fotos de equipamentos locados por descrição canônica. Substitui de vez a "busca de fotos com IA" (revs 2340-2350). User sobe 1 foto por descrição → ERP propaga pra TODAS as unidades atuais + futuras. Ver `shared/changelog.ts`.
- **Rev. 2354** — UX · Inputs de dinheiro no preview do import PDF de locação passam a usar formato BRL "R$ X.XXX,XX" (ponto de milhar + vírgula decimal). Ver `shared/changelog.ts`.

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
