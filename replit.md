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


- **Rev. 2617** — **PLANEJAMENTO · CAMINHO B · O % PREVISTO PASSA A TER PARIDADE EXATA (CRAVADA) COM A COLUNA "% CONCLUÍDA" DO MS PROJECT — NO PLN_816 R04 A CURVA DA RAIZ BATE 2/9/15/20 (ANTES O ERP CALCULAVA 2/9/16/22, DIVERGINDO DUAS SEMANAS).** Pedido (usuário, APROVADO): PREVISTO gerado da MESMA coluna lida no avanço semanal (`PercentComplete` / "% Concluída"), com paridade matemática absoluta. Fluxo: cadastro = UM arquivo baseline → ERP CALCULA a curva semana-a-semana; toda semana = upload lê "% Concluída" como REALIZADO. Causa-raiz da divergência: o gerador (Rev. 2603) lia a baseline em DATE-ONLY (perde a hora; o MSP mede fração em TEMPO ÚTIL com precisão de MINUTO) e o motor era DAY-GRANULAR (ignorava que Sex = 480min < Seg–Qui 540min). Fix ADITIVO (ZERO ALTER/DROP/DELETE; R-001/R-007/R-010): `shared/diasUteis.ts` ganha `weekDayIntervals?: number[][][]` + `minutosUteisEntre`/`fracaoMinutos` (motor minuto-a-minuto, fallback day-granular); `drizzle/schema.ts` + self-heal `[SyncSchema+]` ganham colunas `baseline_start_ts`/`baseline_finish_ts` (TEXT, ISO COM HORA, `ADD COLUMN IF NOT EXISTS`); `ImportarCronograma.tsx` lê `<WorkingTime>` → intervalos e baseline COM HORA; `planejamento.ts` (`regenerarPrevistoSemanasCaminhoB`) RAIZ = `round(Σ min úteis decorridos ÷ Σ min úteis totais × 100)` ponderado por minutos, por atividade = `round(elapsed/total×100)`, `salvarAtividades`/`importarComModo` aceitam/gravam os TS. Validado: motor REAL contra o XML PLN_816 R04 (1042 folhas) → 2/9/15/20 CRAVADO; esbuild client+server+schema (exit 0); tsc sem erros. Detalhe: `shared/changelog.ts`.
- **Rev. 2616** — **PLANEJAMENTO · MODAL "NOVO PROJETO DE PLANEJAMENTO" · O NOME DA OBRA PASSA A APARECER POR INTEIRO NO DROPDOWN "SELECIONAR OBRA" — ANTES NOMES LONGOS ESTOURAVAM/ERAM CORTADOS NA BORDA DIREITA DO CAMPO.** Pedido (usuário, screenshot Novo Projeto): "MELHORE A TELA, PARA QUE O NOME DA OBRA APAREÇA CORRETAMENTE". Causa-raiz: o `SelectItem` (shadcn) embrulha o texto num `<span>` flex (`*:[span]:last:flex items-center`); o span interno usava `truncate` mas, sem `min-w-0`, não encolhia → o texto VAZAVA pra fora do dropdown em vez de truncar. Fix (SÓ CLIENT — `client/src/pages/planejamento/PlanejamentoLista.tsx`; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE; lógica/handlers intactos): span interno passa a QUEBRAR LINHA (`block min-w-0 whitespace-normal break-words leading-snug`); nome em `font-medium` + cliente em `text-muted-foreground`; `SelectContent` ganha `max-w-[min(28rem,var(--radix-select-content-available-width))]` e `SelectItem` ganha `items-start`; gatilho fechado segue `truncate`. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2615** — ORÇAMENTO (DETALHE) · TELA MAIS MODERNA E SEM BARRA DE ROLAGEM HORIZONTAL — O CABEÇALHO COM OS 5 BOTÕES DE AÇÃO ESTOURAVA A LARGURA NO IPAD/TELAS MENORES. Fix (SÓ CLIENT — `OrcamentoDetalhe.tsx`): container `md:p-6 max-w-full overflow-x-hidden`; cabeçalho `flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between`; botões `flex flex-wrap gap-2 lg:justify-end lg:shrink-0`; nav de abas `flex-wrap gap-1.5`, título `text-2xl`. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2614** — ORÇAMENTOS · A LISTA PASSA A EXIBIR O NOME DA OBRA VINCULADA (CADASTRO) EM CADA CARD — ANTES SÓ MOSTRAVA CÓDIGO, DESCRIÇÃO, CLIENTE E LOCAL. Fix (SÓ CLIENT — `OrcamentoLista.tsx`): novo `useMemo` `obraNomeById` (Map `String(obra.id) → obra.nome`, fallback `codigo`); card ganha chip azul (ícone `Building2`) com o nome da obra ANTES de "Cliente"/"Local"; busca passa a casar pelo nome da obra. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2613** — RECRUTAMENTO/CURRÍCULOS · LAYOUT NOVO, MODERNO E MINIMALISTA (MAIS ESPAÇO EM BRANCO, FÁCIL UTILIZAÇÃO) — SÓ VISUAL, TODA A LÓGICA/HANDLERS/tRPC/DIALOGS PRESERVADOS. Fix (SÓ CLIENT — `Curriculos.tsx`): fundo `bg-slate-50`, header com botões no canto sup. direito, sidebar em cards `rounded-2xl`, busca slim `h-12 rounded-xl`, tabela com mais respiro + avatares, modal "Upload com IA" `overflow-x-hidden max-w-2xl`. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2612** — COLABORADORES · O CARD "NA EMPRESA" PASSA A SER CLICÁVEL E FILTRA A LISTA (TODOS COM VÍNCULO = TOTAL − DESLIGADOS − BLACKLIST) — ANTES NÃO ACONTECIA NADA AO CLICAR. Causa: card (Rev. 2608) com `filter: null` → `onClick` no-op. Fix (SÓ CLIENT — `Colaboradores.tsx`): card ganha `filter: "NaEmpresa"`; `serverStatus` trata como `undefined`; `displayEmployees` aplica `list.filter(e => !isInativo(e))`; dropdown ganha `<SelectItem value="NaEmpresa">`. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.

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
- **REGRA DE OURO — CAMINHO B (Rev. 2617+, substitui Rev. 2533/2603).** FONTE ÚNICA = coluna `PercentComplete` ("% Concluída") do MS Project, lida nos dois momentos com a MESMA régua → paridade EXATA (PLN_816 R04 = 2/9/15/20 CRAVADO):
  - **% PREVISTO** (raiz e atividades) = fração de duração da baseline em **TEMPO ÚTIL MINUTO-A-MINUTO** (motor `minutosUteisEntre`/`fracaoMinutos` de `shared/diasUteis`, varrendo dia a dia e clipando aos intervalos de trabalho `weekDayIntervals` do calendário do XML). RAIZ = `round(Σ minutos úteis DECORRIDOS de cada folha ÷ Σ minutos úteis TOTAIS × 100)` (ponderado por minutos úteis, NÃO por contagem de atividades); POR ATIVIDADE = `round(fracaoMinutos(BL_Start, semana, BL_Finish, cal) × 100)`. `round` (não `floor`) porque a coluna "% Concluída" do MSP é arredondada.
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora capturada no import). Date-only diverge (PLN_816 daria 2/9/16/22). Sem `weekDayIntervals` no calendário OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal segue fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` + chamada pós-transaction em `salvarAtividades`; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
