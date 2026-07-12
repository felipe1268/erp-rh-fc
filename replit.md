# ERP Gestão Integrada — FC Engenharia

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

- **Rev. 4173** — **COMPRAS/FINANCEIRO: REDESIGN DO MINI-DIALOG DE DETALHE DA OC.** Novo backend com `criado_por_nome`, `aprovador_nome`, datas formatadas, SC via 2 caminhos (cotação + direto). Novo layout: cabeçalho compacto, seção Rastreabilidade (SC→OC→Aprovação com nomes/datas), grid Detalhes, Observações, tabela de Itens com preço unit., composição do total. Corpo com `max-h-[70vh]` elimina espaço vazio. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4172** — **COMPRAS/FINANCEIRO: OC CLICÁVEL NA TABELA DE OCORRÊNCIAS DA ANÁLISE DE FORNECEDOR.** `ordem_id` adicionado ao `ocorrRes`; `OcMiniDialog` exportado de `ItemCatalogo.tsx`; célula Nº OC virou `<button>` que abre o mini-dialog com todos os detalhes da OC. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4171** — **COMPRAS/FINANCEIRO: UNIDADE NAS CÉLULAS DE PREÇO DA ANÁLISE DE FORNECEDOR.** Sufixo `/un`, `/sc`, `/m³` etc. abaixo do valor nas colunas Preço mín. e Preço máx.; itens de unidade mista não exibem sufixo (sem unidade canônica). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4170** — **COMPRAS/FINANCEIRO: REVERTE FILTRO FINANCEIRO POR OBRA (CARDS ZERADOS).** Rev. 4169 zerava cards financeiros para obras sem `obra_id` em `financial_entries`; removido o filtro de `rows` — top cards voltam a mostrar total do fornecedor/ano; cards de OCs (aba Itens & Preços) já filtravam corretamente via backend (Rev. 4168). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4169** — **COMPRAS/FINANCEIRO: FILTRO DE OBRA SINCRONIZA CARDS FINANCEIROS.** `rows` useMemo inclui `obraIdFiltro` como dep; filtra `r.obraId === obraIdFiltro` quando ativo → cards Pago/Em aberto/Vencido/Lançamentos refletem a obra selecionada. Sem mudança de backend. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4168** — **COMPRAS/FINANCEIRO: FILTRO DE OBRA NA ANÁLISE DE FORNECEDOR.** `obraId?: number` no input de `getAnaliseFornecedor`; aplicado nas 3 queries de itens/ocorrências/pagamento (query de obras fica sem filtro para popular o seletor); `resumo.obrasAtendidas` migrado para `{ id, nome }[]`; seletor de obra (Select) aparece acima da tabela quando ≥2 obras; card lateral "Obras Atendidas" virou lista clicável para ativar/limpar filtro diretamente. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4167** — **COMPRAS/FINANCEIRO: DIAGNÓSTICO DE OSCILAÇÃO DE PREÇOS NA ANÁLISE DE FORNECEDOR.** `variacaoPct` zerado quando unidades são diferentes (evita +750% sem sentido); `variacaoReason` ('unidade_mista'|'preco_zero'|'variacao_real'|'ok'); `mesesSpan`; badge roxo "unid. mista" no lugar do %; chips de diagnóstico na linha expandida; R$0,00 destacado em laranja. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4166** — **COMPRAS: CATÁLOGO — OC CLICÁVEL COM MINI-DIALOG DE DETALHE.** Número da OC no Catálogo virou botão. `OcMiniDialog` com quem pediu/quando/fornecedor/entrega/itens. `getOrdemMiniDetalhe`. Fix `[UnitFix Rev.4165]` db→getDb(). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4165** — **COMPRAS: NORMALIZAÇÃO DE UNIDADES + AUTO-PADRONIZAÇÃO DE ITENS EM LOTE.** `[UnitFix]` startup; `normItemDesc` expandido; `autoNormalizarItens`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4163** — **COMPRAS: CATÁLOGO — AUDITORIA REAL 1753 DESCRIÇÕES → CORREÇÃO ALGORITMO DE GRUPOS.** FAM=TIGRE fix; remoção de preposições DE/DA/DO/DAS/DOS; `_BRAND_FIRST` Set. 507 famílias. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4162** — **COMPRAS: CATÁLOGO DE ITENS — VISÃO HIERÁRQUICA FAMÍLIA → VARIANTE → OCs POR OBRA.** `getItemFamilia` extrai 1ª palavra significativa; `getItensFamilias` agrupa; `getItemOcDetalhes` lazy-load OCs. Novo `ItemCatalogo.tsx` (3 níveis, search, KPIs). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4160** — **COMPRAS: AUDITORIA DE ITENS — NORMALIZAÇÃO DE NOMES E AUTOCOMPLETE NA SC/OC.** 3 procedures: `auditarItens`, `padronizarItens`, `getItemSugestoes`. Novo `ItemDescricaoInput`. Aba "Itens" na Auditoria. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4159** — **COMPRAS: AUDITORIA DE FORNECEDORES — DUPLICATAS, VARIANTES DE NOME E MESCLAGEM.** 4 procedures + tela `/compras/auditoria-fornecedores`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4158** — **FINANCEIRO: ANÁLISE APROFUNDADA POR FORNECEDOR — ITENS & PREÇOS (OCs).** Novo `compras.getAnaliseFornecedor` (4 queries). `FinanceiroAnaliseCustosDetalhe`: 2 abas, KPI cards, tabela expand/collapse com badge variação preço, mini LineChart, formas pgto. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4151** — **FROTA: CONTROLE DE VIAGENS — MÓDULO COMPLETO.** 2 tabelas novas (`fleet_trips`, `fleet_trip_expenses`); 10 procedures tRPC; fluxo pendente→autorizada→em_andamento→concluída; km inicial/final com foto; despesas + reembolso PIX/TED. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4150** — **FROTA: PEDÁGIOS — CATEGORIA sem_parar CORRIGIDA EM LOTE + IMPORTADOR FIXADO.** 2558 registros `pedagio` → `sem_parar`; tipoUsoToCategoria corrigida; 317 praças duplicadas unificadas. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4149** — **FROTA: FILTRO MENSAL NOS 3 DASHBOARDS (Combustível, Manutenção, Pedágios).** Backend aceita `mes` opcional; white-card com "Ano todo" + Jan–Dez com badges de contagem; cores temáticas por tela; trocar ano reseta o mês. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4148** — **NFS-e: #30 VALOR LÍQUIDO CORRIGIDO (120.694,65 → 119.469,32).** Fórmula subtraía só IRRF, não retencao_csll; correção direta por id=929 alinhando ao DANFSe. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4146** — **NFS-e: BATCH DANFSes #38, #41, #42 — ISS RETIDO + VALOR LÍQUIDO CORRIGIDOS.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4145** — **NFS-e: BATCH DANFSes #29–#40 — ISS RETIDO + VALOR LÍQUIDO CORRIGIDOS, 10 NOTAS.** ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4143 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
