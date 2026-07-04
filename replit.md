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

- **Rev. 4013** — **COMPRAS: REGIME DE CUSTO/RISCO (BDI) NA EQUALIZAÇÃO DE COTAÇÃO PARA OBRAS "FORNECIMENTO DE MDO" (Item 1 dos ~20 ajustes do docx).** Em obras "Fornecimento de MDO", nem todo material comprado é custo/risco da FC. Na tela de "Selecionar Vencedor" (equalização), novo seletor de 3 opções por item + balão informativo: 🔵 Cliente paga direto (reaproveita FD existente); 🟡 Empresa paga, sem risco (NOVO — repasse, não entra no BDI/orçamento, nunca trava OC por estouro); 🟢 Empresa paga, com risco (default, comportamento atual). Novo campo `regime_custo` em `compras_cotacoes`/`compras_ordens` (OC herda da cotação), ortogonal ao `modalidade_fd` existente. `criarOrdemDeCotacao` pula o bloco de travamento/aprovação por estouro quando regime é sem-risco/cliente. **Achado colateral corrigido:** o bloco `[ColFix]` principal roda ~60 ALTER dentro de 1 único `DO $$...EXCEPTION WHEN OTHERS THEN NULL$$` — falha em qualquer statement faz rollback silencioso de TODOS, mesmo marcando `colfix_version` como aplicado; `regime_custo` foi isolado em bloco próprio com try/catch dedicado (padrão a seguir daqui pra frente). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4012** — **ALMOXARIFADO: (1) 2 ITENS COM EMPRESA ERRADA CORRIGIDOS, (2) 11 ITENS DUPLICADOS ("Bacia com Caixa Acoplada Ravena") UNIFICADOS EM 1, (3) FORMATO DE QUANTIDADE CORRIGIDO PARA PADRÃO BRASILEIRO.** Usuário reportou lista "bagunçada". (1) ids 3719/3720 estavam em CF Hotelaria (60004) sem nenhuma referência em histórico — reatribuídos a FC Engenharia (60002) com códigos novos MAT-2637/2638; (2) análise por nome normalizado + similaridade (pg_trgm) sobre os 1685 itens `tipo_controle='estoque'` (excluídos os 951 vinculados a equipamento, risco Rev.4008/4009) achou só 1 grupo 100% seguro — 11 "Bacia..." que diferiam SÓ por código de localização entre colchetes, mesmo `obra_id` (NULL) e unidade; unificados no id mais antigo (MAT-0007), soma qtd=393, histórico repontado (inclusive merge de 2 respostas de cotação que colidiam por causa de constraint única). Outros ~5 pares "parecidos" (Aditivo colante, Pulverizador/Burrifador, Brita 1, Prego 17x21/18x30) foram DELIBERADAMENTE NÃO unificados por terem `obra_id` e/ou `unidade` diferentes (itens em canteiros distintos ou medidos diferente, ex. Brita em m³ vs m²) — reportados ao usuário para decisão manual; (3) novo helper `fmtQtd()` (Intl.NumberFormat pt-BR) em `client/src/pages/almoxarifado/index.tsx` substitui ~18 pontos de exibição cru (`n()`/`.toFixed()`), corrigindo "37.0000"→"37" e "1000"→"1.000". Backup completo em tabelas `*_backup_rev4012` antes de qualquer escrita. ZERO DELETE fora do grupo auditado · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4011** — **ALMOXARIFADO: OS 3 ITENS PENDENTES DA AUDITORIA "CORREÇÕES E MELHORIAS ERP - ALMOXARIFADO" (12/15 já implementados em revisões anteriores).** Usuário confirmou "Sim" para os 3 restantes: campo `especificacao` separado do `nome`; assinatura digital OPCIONAL na devolução de ferramenta emprestada; rename "Devolução de Ferramentas" já não se aplicava. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4010** — **ALMOXARIFADO: PADRONIZAÇÃO AUTOMÁTICA DO NOME DE MATERIAL (1ª LETRA MAIÚSCULA + RESTANTE MINÚSCULO).** Função SQL única `padronizar_nome_material(text)` reusada em todos os pontos de escrita (criação manual/import/OC/sync de equipamento). Backfill nos 2.638 itens existentes — 100% padronizados. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4009** — **ALMOXARIFADO: CORREÇÃO DE BUG CRÍTICO DA REV. 4008 — FUSÃO POR "NOME IDÊNTICO" ATINGIU ITENS QUE ERAM 1-REGISTRO-POR-UNIDADE-FÍSICA DE EQUIPAMENTO.** ~806 itens vinculados a equipamento (locado/próprio) foram mesclados/apagados indevidamente; recriados via auto-recuperação + códigos `MAT-1837`...`MAT-2636` reatribuídos; os 3 INSERTs de `almoxEquipamentoSync.ts` agora sempre geram código. **Perda irreversível** do histórico granular de movimentação desse subconjunto (~806 itens); estado final funcionalmente correto (2.638 itens, 0 duplicados, 0 órfãos).

- **Rev. 4008** — **ALMOXARIFADO: UNIFICAÇÃO DOS 985 ITENS COM NOME IDÊNTICO (165 GRUPOS), MAIS RENUMERAÇÃO SEQUENCIAL.** Usuário, ao ver a lista de materiais: "se tem o mesmo nome, pode unificar pra não ter dúvidas". Os 165 grupos (nome idêntico após normalizar só espaços) tinham 100% `tipo_controle='estoque'` — critério que se revelou insuficiente (ver Rev. 4009: não excluiu itens vinculados a equipamento). Backup completo antes da operação (posteriormente limpo do ambiente); migração em 1 transação: soma de `quantidade_atual` no item mais antigo de cada grupo (canônico), histórico repontado em 7 tabelas antes de apagar os 985 duplicados. Resultado imediato: 2.823 → 1.838 itens — corrigido na Rev. 4009 após descoberta do efeito colateral.

- **Rev. 4007** — **ALMOXARIFADO: FORMATO DO CÓDIGO DE MATERIAL AJUSTADO PARA `MAT-NNNN`.** Usuário pediu logo após a Rev. 4006: "MAT-0001 quero neste formato". Re-migrados os mesmos 2.823 materiais no Neon de `MATNNNNNN` para `MAT-0001`... Helper `criarItemAlmoxarifadoComCodigo` ajustado. ZERO DELETE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4002 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
