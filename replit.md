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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1832**: **Planejamento · Toggle 'Peso Financeiro ↔ Duração (MSP)' — paridade ABSOLUTA com a coluna '% concluída' do MS Project**. User (15/05/2026, screenshots da tabela MSP do REVTE-CIVIL com raiz='1%'): "quero paridade absoluta — o projeto não apresenta estes valores, o valor está aparecendo 1%". **Causa pré-existente**: `PlanejamentoDetalhe.tsx` L250 era `const usarPesoPorDuracao = false` desde Rev. 1343 — toda a árvore (avancoAtual, AvancoSemanal, Refis, pvPonderado) ponderava por `pesoFinanceiro` (EVM clássico). MSP nativo faz rollup por DURAÇÃO em working time: `% Complete = Σ AD_leaf / Σ Duration_leaf`. Para REVTE-CIVIL, folhas caras (Tapumes/Mobilização ~28% peso × ~28% pct) inflavam → 2,12% por custo vs ~1% por duração. **Fix (1 arquivo, 2 hunks)**: (1) L250 vira **state** persistido em `localStorage[planejamentoPesoBase:${projetoId}]` ('financeiro'|'duracao'), default 'financeiro' (preserva histórico). (2) L911-933 banner 'Avanço Físico' troca badge estático por **toggle 2-botões** (mesmo design do Live/Oficial Rev. 1637): 💰 Peso Financeiro (amber) ↔ 📐 Duração (MSP) (azul). **Por que é seguro**: árvore inteira já recebia `usarPesoPorDuracao` como prop (L1034/1071/1090/1103) — constante false só desativava caminho 'duracao' que JÁ EXISTIA. Reativar via state recompõe avanço físico topo + AvancoSemanal cards + Refis. **Previsto LIVE intocado** — usa `pctRaizMSP` (Rev. 1825), puramente temporal sobre envelope raiz. Toggle muda principalmente REALIZADO. **Esperado REVTE-CIVIL SEMANA 1**: 💰 → 2,12% (EVM); 📐 → ~1% (paridade MSP). Zero schema/migration/DELETE. Reversível em 2 edits. R-001/R-007/R-010 OK.
- **Rev. 1831**: **Aviso Prévio · modal 'Dar Baixa' redimensionado — sem barra de rolagem global**. User (15/05/2026, screenshot c/ scrollbar vertical no modal de Multa FGTS): "redistribua o tamanho dessa tela para que não precise da barra de rolagem". **Causa**: `client/src/pages/AvisoPrevio.tsx` L3120 — DialogContent em `max-w-xl` (576px) + conteúdo grande (BAIXAS REGISTRADAS + 3 cards Tipo da Baixa + valor + obs + checkbox + footer) excedia `max-h-[85vh]` default do shadcn → scroll global, footer fora da viewport. **Fix (1 edit, 2 hunks)**: DialogContent vira `sm:max-w-3xl max-h-[92dvh] flex flex-col p-0 gap-0`; DialogHeader ganha padding próprio + `border-b shrink-0`; div body interno vira `flex-1 overflow-y-auto min-h-0` (scroll APENAS no body); DialogFooter `px-6 py-4 border-t shrink-0 bg-white`. **Resultado**: ≥768px cabe sem scroll; telas menores rolam só o miolo, footer/header sempre visíveis. Lógica intocada (handleConfirmarBaixa, darBaixa mutation, darBaixaForm). R-001 OK.
- **Rev. 1830**: **Planejamento · Importer MSP — snapshot semanal usa `StatusDate` do XML (não data de hoje)**. User (15/05/2026, anexou SEMANA 1 + CONTRATUAL do REVTE-CIVIL): "evolução da primeira semana incorreta". **Causa**: `salvarAtividades` L1342-1346 + `importarAvancosDoArquivo` L1675-1679 computavam `semanaIso` via `new Date()` (hoje=15/05 → Monday 11/05) em vez do `StatusDate` do XML (07/05 → Monday 04/05). Snapshot da SEMANA 1 caía na semana errada → semana 04/05 zerada. **Fix (4 edits)**: (1+2) ambas as procedures ganham `semanaIso?: z.string().regex(...)` no zod top-level e o body troca `const hoje = new Date()` por `const ref = input.semanaIso ? new Date(input.semanaIso + 'T12:00:00Z') : new Date()` — cálculo Monday idêntico, fallback legado preservado. (3+4) `ImportarCronograma.tsx` passa `semanaIso: metadadosMSP?.statusDate || undefined` em `importarAvancosMutation` (L745-752, modo mesclar) e `salvarMutation` (L934-936, modo substituir). `metadadosMSP.statusDate` já era extraído pelo parser desde Rev. 1642 — só não era propagado pro snapshot. **Premissas preservadas**: avanços legados intactos (UPDATE só na janela `semanaIso` passada via UID/EAP — Rev. 1829), baseline congelado, calendário MSP intocado, XMLs sem StatusDate caem no fallback Monday-de-hoje (= comportamento pré-1830). **Ação user**: reimportar XML SEMANA 1 em modo 'mesclar' — snapshot vai pra semana 04/05 e o card "Avanço Semanal" da semana 04/05 mostra os 10 leaves c/ pct>0. Reversível em 4 edits. Zero schema/migration/DELETE/contrato novo. R-007/R-008/R-010 OK.
- **Rev. 1829**: **Planejamento · Auditoria MSP — UID nativo do MS Project como chave única + distribuição diária do peso**. User (15/05/2026, após auditoria contra regras MSP): pediu (1) substituir matching por `eap_codigo`+fallback nome pelo `<UID>` nativo do MSP (única chave estável em rename/move) e (2) habilitar distribuição diária do peso (curva S dia-a-dia, regras MSP). **Implementação UID**: nova coluna `mspUid VARCHAR(20)` em `planejamento_atividades` (drizzle/schema.ts L5288), NULLABLE (legados caem no fallback `eap_codigo` até reimportarem); SyncSchema+ INCONDICIONAL (server/_core/index.ts L515-520) com `ALTER TABLE ADD COLUMN IF NOT EXISTS` + index composto `(revisao_id, msp_uid)` — mesmo padrão Rev. 1824; importer (ImportarCronograma.tsx L26 interface, L476 parser push, L738/L905/L944 maps) propaga UID; backend `salvarAtividades`/`importarComModo`/`importarAvancosDoArquivo` zod+rows+UPDATE CASE+lookup substituídos por `(uid && uidToId.get(uid)) ?? eapToId.get(eap)` — **fallback nome ELIMINADO** (renomear no MSP não quebra mais histórico). XLSX legado fica c/ `mspUid=''` → backend cai pra `eapCodigo`. **Implementação distribuição diária**: helpers puros em shared/planejamentoMath.ts L47-130 (`listarDiasUteis`/`distribuirPesoDiario`/`curvaSDiaria`) usando `ehDiaUtil` da Rev. 1824 (calendário MSP); distribuição linear (PMI Practice Standard for EVM §3.2); soma diária = valor original (erro <1e-9); folhas contábeis + pesagem unificada (regras de ouro #3/#4 já existentes). Helpers só — sem endpoint tRPC nem refactor de consumidores (curva S semanal intacta), ficam prontos pra Fase 2 ('Curva S Diária', 'Histograma de Cargas', KPI 'Aderência Diária' Last Planner). **Premissas auditadas preservadas**: ERP não recalcula datas/duração/vínculos (helpers só LEEM); baseline congelado (Texto6/7/10/11 intactos); snapshots semanais imutáveis (`planejamento_avancos` não tocado); MSP continua fonte oficial. **Hardening pós-code-review**: (i) **IDOR** — `salvarAtividades`/`importarComModo`/`importarAvancosDoArquivo` ganharam guard multi-tenant no início (planejamento.ts L1080+/L1505+/L1657+): valida `revisaoId↔projetoId` e `projeto.companyId === ctx.user.companyId` (admin atravessa) — bloqueia escrita cross-tenant por enumeração de IDs. (ii) **UNIQUE** — index `(revisao_id, msp_uid)` virou `CREATE UNIQUE INDEX uniq_planej_ativ_msp_uid ... WHERE msp_uid IS NOT NULL` (server/_core/index.ts L520-534) — partial preserva legados c/ NULL; dropa o index não-unique antigo se existir; fallback p/ não-unique apenas se duplicatas pré-existentes (não deve acontecer). **Ação user pós-deploy**: reimportar XML dos projetos ativos em modo 'mesclar' — `resolveId` casa por `eap_codigo` e back-fila `msp_uid` via UPDATE. Zero schema destrutivo, zero DELETE. R-007/R-008/R-010 OK.
- **Rev. 1828**: **Controle de Documentos · ASO — Periódico/Retorno/Mudança de Função agora SUBSTITUI Admissional anterior (cross-tipo, sem depender de vencimento)**. User (15/05/2026, screenshot PAULO HENRIQUE LIMA GUIMARAES com 2 linhas: Admissional 16/05/2025 '2 DIAS PARA VENCER' + Periódico 11/05/2026 VÁLIDO): "aso admissional não foi substituído pelo aso periódico". **Causa**: `asos.list` L459 só marcava SUBSTITUÍDO se `status==='VENCIDO'` E `!isLatestOfType` (que agrupa por tipo, então Admissional sempre é latest do próprio tipo). ASO em '2 dias pra vencer' não é VENCIDO → não entrava na branch. **Fix**: (1) L457-489 novo `TIPOS_SUBSTITUTIVOS={Admissional,Periodico,Retorno,Mudanca_Funcao}` (Demissional fora, é terminal); para cada ASO varre `byEmployee` e se existir QUALQUER ASO mais novo de tipo substitutivo com `dataValidade>=hoje` → retorna `{status:'SUBSTITUÍDO', isHistorico:true}` independente do status atual. (2) L1214-1235 contador `asosAVencer` no `resumo` virou SQL bruta com `NOT EXISTS` (mesmo padrão do `asosVencidos` L1194 já tinha) — sem isso, KPI 'ASOs A Vencer' do PainelSST continuaria contando o Admissional substituído. (3) Frontend INTOCADO — já aplicava `opacity-60` pra `isHistorico` (L2391). homeData.ts L169-198 já usava `bestValidAso` como referência por funcionário, comportamento correto preservado. Schema INTOCADO. Reversível em 2 edits. R-007/R-010 OK.
