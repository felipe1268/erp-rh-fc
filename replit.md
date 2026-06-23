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

- **Rev. 3581** — **NF-e RECEBIDAS · BARRA DE PROGRESSO 0→100% AO SINCRONIZAR SEFAZ. 100% FRONTEND · ZERO BACKEND.** Curva exponencial 0→85% + salto 100% na conclusão, shimmer, banner indigo→verde. Detalhe: `shared/changelog.ts`.

- **Rev. 3580** — **CRONÔMETROS · "ÚLTIMA SYNC" AGORA EXIBE HORÁRIO DE BRASÍLIA. 100% FRONTEND · ZERO BACKEND.** Detalhe: `shared/changelog.ts`.

- **Rev. 3579** — **NF-e RECEBIDAS · TIMELINE COM LEGENDA + DOTS POR MÊS (MESMO PADRÃO DA ABA EMITIDAS). 100% FRONTEND · ZERO BACKEND.** Detalhe: `shared/changelog.ts`.

- **Rev. 3578** — **NFS-e EMITIDAS · DIALOG "NOVA NFS-e" REDESENHADO — SEM ABAS, SEÇÕES VISUAIS, VALOR LÍQUIDO DESTACADO. 100% FRONTEND · ZERO BACKEND.** Header gradiente indigo, 4 seções (Identificação, Tomador, Obra, Valores) + Avançado colapsível. Detalhe: `shared/changelog.ts`.

- **Rev. 3577** — **NFS-e EMITIDAS · CRONÔMETRO REGRESSIVO NA ABA EMITIDAS (MESMO PADRÃO). 100% FRONTEND · ZERO BACKEND.** Detalhe: `shared/changelog.ts`.

- **Rev. 3576** — **NF-e RECEBIDAS · CRONÔMETRO REGRESSIVO NA ABA RECEBIDAS. 100% FRONTEND · ZERO BACKEND.** Detalhe: `shared/changelog.ts`.

- **Rev. 3575** — **NFS-e EMITIDAS MUNICIPAIS · CRON HORÁRIO — MESMO PADRÃO DO SEFAZ. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3574** — **SEFAZ NF-e · UI CONFIG — TEXTO "TODO DIA 06:00" CORRIGIDO + NSU VISÍVEL + RATE LIMIT COMO INFORMATIVO. 100% FRONTEND · ZERO BACKEND.** Detalhe: `shared/changelog.ts`.

- **Rev. 3573** — **SEFAZ NF-e · SYNC AUTOMÁTICO HORÁRIO — HISTÓRICO COMPLETO SEM AÇÃO MANUAL. BACKEND PONTUAL + FRONTEND · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3566** — **NFS-e EMITIDAS MUNICIPAIS · "BAIXAR TUDO" — IMPORTAÇÃO HISTÓRICA EM LOTE + SELETOR DE PERÍODO POR CARD. BACKEND ADITIVO + FRONTEND · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3564** — **SEFAZ NF-e RECEBIDAS · HORÁRIO DE SINCRONIZAÇÃO CONFIGURÁVEL. BACKEND ADITIVO + FRONTEND · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3563** — **NFS-e EMITIDAS MUNICIPAIS · BUGFIX "(intermediate value) is not iterable" NO BOTÃO SINCRONIZAR. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** `executarSyncMunicipio` usava `const [x] = await db.$client.query<any>(...)` — `QueryResult` do driver `pg` NÃO é iterável (não tem `Symbol.iterator`); desestruturação de array lançava o TypeError. 3 ocorrências corrigidas para `const res = await ...; const x = res.rows[0]`. Detalhe: `shared/changelog.ts`.

- **Rev. 3562** — **NFS-e EMITIDAS MUNICIPAIS · BUGFIX DOIS ERROS DE ARRANQUE: INSERT SEED COM auth_type/descricao INEXISTENTES + for...of SEM Array.isArray. BACKEND PONTUAL + FRONTEND · ZERO ALTER/DROP/DELETE.** (1) INSERT em `getMunicipios`/`addMunicipio` referenciava colunas inexistentes → seção não carregava; (2) `for...of municipios` sem `Array.isArray` → toast `(intermediate value) is not iterable` no render transitório. Detalhe: `shared/changelog.ts`.

- **Rev. 3561** — **NFS-e EMITIDAS MUNICIPAIS · NOVO MÓDULO: CONSULTA AUTOMÁTICA NAS PREFEITURAS (SIAP GEO, SIL, GIAP, TINUS). BACKEND ADITIVO + FRONTEND · ZERO ALTER/DROP/DELETE.** Só Guaratinguetá-SP SIAP GEO auto-semeada. Login = Inscrição Municipal; Senha = senha do portal. Cards em Configurações → Financeiro; NFS-e importadas em `fiscal_notes` com `origem='nfse_mun_<ibge>'`. Detalhe: `shared/changelog.ts`.

- **Rev. 3557** — **SEFAZ · BUGFIX soap:Sender — FALTAVA soap12:Header COM nfeCabecMsg. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** Todos os WS SEFAZ exigem `<nfeCabecMsg>` no `<soap12:Header>` com `<cUF>` e `<versaoDados>`. Sem ele → `soap:Sender`. `buildSoapEnvelope` não incluía o Header — adicionado. Detalhe: `shared/changelog.ts`.

- **Rev. 3556** — **SEFAZ · BUGFIX soap:Sender HTTP 500 — FALTAVA action NO Content-Type + rejectUnauthorized. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** SOAP 1.2 exige `action="...nfeDistDFeInt"` embutido no Content-Type. Sem ela, SEFAZ retorna `soap:Sender`. Fix: action no Content-Type, `byteLength` no Content-Length, `rejectUnauthorized:false` (cadeia ICP-Brasil não está no bundle de CAs do Node). Detalhe: `shared/changelog.ts`.

- **Rev. 3555** — **SEFAZ · BUGFIX "Unsupported PKCS12 PFX data" — NODE 20/OPENSSL 3.0 REJEITA RC2-40-CBC DOS CERTS A1 ICP-BRASIL. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** `https.Agent({ pfx })` falha no Node 18+/OpenSSL 3.0 com certificados brasileiros (RC2-40-CBC). Fix: `pfxToPem()` via `node-forge` extrai cert+key como PEM sem depender do OpenSSL nativo. `node-forge@1.4.0` adicionado. Detalhe: `shared/changelog.ts`.

- **Rev. 3554** — **SEFAZ · BUGFIX "db.execute is not a function" — getDb() É ASYNC, FALTAVA await. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** `getDb()` é async — retorna Promise. Todos os 7 sites em sefaz.ts faziam `const db = getDb()` sem await → db era Promise → `.execute` inexistente. Fix: `await getDb()` em todos. Detalhe: `shared/changelog.ts`.

- **Rev. 3552** — **NOTAS FISCAIS · DUAS SUB-ABAS: "NFS-e EMITIDAS" + "NF-e RECEBIDAS (SEFAZ)". BACKEND ADITIVO + FRONTEND · ZERO ALTER/DROP/DELETE.** A tela `/financeiro/notas-fiscais` ganhou seletor de abas: "📤 NFS-e Emitidas" (conteúdo original intacto) e "📥 NF-e Recebidas (SEFAZ)" (NF-e importadas via integração SEFAZ da Rev. 3550, `origem='sefaz_nfe'`). Aba recebidas: 4 KPI cards, timeline ano/mês, filtro busca+status, tabela emitente/CNPJ/valor/chave. Novo endpoint `sefaz.listNFeRecebidas`. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3558** — **SEFAZ · BUGFIX OPERAÇÃO RENOMEADA: nfeDistDFeInt → nfeDistDFeInteresse. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3551** — **CONCILIAÇÃO · PAINEL "IA LEU NOS DEMONSTRATIVOS" — BOTÃO MINIMIZAR/EXPANDIR. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3550** — **INTEGRAÇÃO SEFAZ NFeDistribuicaoDFe — CONSULTA AUTOMÁTICA DE NF-e RECEBIDAS. BACKEND ADITIVO + FRONTEND · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3549** — **NOTAS FISCAIS (NFS-e) · DIALOG DE LOTE REDESENHADO — LAYOUT MODERNO SEM SCROLL HORIZONTAL + FASES 0→100%. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3548** — **NOTAS FISCAIS (NFS-e) · IMPORTAÇÃO DE MÚLTIPLOS PDFs EM LOTE. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3547** — **NOTAS FISCAIS (NFS-e) · IMPORTAÇÃO DE PDF (DANFSe) COM EXTRAÇÃO AUTOMÁTICA VIA IA. BACKEND ADITIVO + FRONTEND · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3543** — **NOTAS FISCAIS (NFS-e) · NOVO MÓDULO "CONTROLE DE NOTAS FISCAIS" NA ABA MOVIMENTAÇÕES. BACKEND ADITIVO + FRONTEND · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3542** — **DESLIGAMENTO NA EXPERIÊNCIA · BUGFIX FGTS 40% INDEVIDO NO TÉRMINO NO PRAZO. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3541** — **DESLIGAMENTO NA EXPERIÊNCIA · 4 TIPOS DE ENCERRAMENTO + ART. 479/480 + AVISO EM "AVISOS PRÉVIOS". BACKEND ADITIVO + FRONTEND · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3540** — **FERIADOS · BOTÃO APAGAR SEMPRE VISÍVEL + ALERTDIALOG DE CONFIRMAÇÃO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3539** — **FERIADOS · BUGFIX DUPLICATA NA LISTA — GLOBAL + EMPRESA APARECIAM JUNTOS. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3537** — **FERIADOS · BUGFIX `RIGHT()` EM COLUNA DATE — BAIXAR FERIADOS FALHAVA. BACKEND PONTUAL · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3532** — **CONCILIAÇÃO · BUGFIX TOLERÂNCIA DE DATA NA SUGESTÃO AUTOMÁTICA. BACKEND + FRONTEND · ZERO ALTER/DROP/DELETE.** `toleranciaDias` estava inicializado com `diasDoMes` (ex: 31) e re-sincronizado a cada troca de mês via useEffect — sistema enviava `tol=31` ao backend aceitando pares com até 31 dias de diferença. Fix: default → 0 (mesmo dia) em ambas as telas + localStorage cap 7d + backend fallback 0 + confiança "alta" agora exige `delta===0` (antes `<=1`). Detalhe: `shared/changelog.ts`.

- **Rev. 3531** — **PONTO DIXI · BUGFIX BATIDAS DIXI IGNORADAS QUANDO EXISTE APONTAMENTO DE CAMPO. BACKEND PONTUAL · ZERO ALTER/DROP.** Importador usava Set "empId_data": qualquer registro existente bloqueava o dia inteiro. Fix: Set→Map com fonte+batidas; fonte='campo' → MERGE (une+ordena+reatribui slots+recalcula totais); fonte=manual → proteção total mantida. Detalhe: `shared/changelog.ts`.

- **Rev. 3530** — **FORNECEDORES · BUGFIX CICLO/REGRAS SUMINDO AO SALVAR. BACKEND PONTUAL · ZERO ALTER/DROP.** `atualizarFornecedor` fazia só UPDATE em `empresasTerceiras`; sem linha vinculada → dados sumiam. Fix: upsert (SELECT→UPDATE ou INSERT). Detalhe: `shared/changelog.ts`.

- **Rev. 3529** — **FINANCEIRO · NOVA CATEGORIA "IMPOSTOS E TAXAS" (AUTO-0137). NEON · ZERO ALTER/DROP.** SyncSchema+ insere a categoria (despesa/devedora, nível 1) para toda empresa sem ela. Cobre retenções de contrato público, ISS, IOF operacional. Detalhe: `shared/changelog.ts`.

- **Rev. 3528** — **CONCILIAÇÃO · BOTÃO "É MOVIMENTAÇÃO INTERNA" NO DIALOG DE LANÇAMENTO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Botão ghost indigo no footer esquerdo do dialog Lançar — disponível mesmo sem detecção automática; chama `confirmarMovimentacaoInterna` e fecha sem gerar lançamento. Detalhe: `shared/changelog.ts`.

- **Rev. 3526** — **CONCILIAÇÃO · CATEGORIA COM BUSCA POR TEXTO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Campo "Conta (Categoria)" no dialog de edição trocado de Select simples para `SearchableSelect` (busca com normalização NFD). Detalhe: `shared/changelog.ts`.

- **Rev. 3523** — **OBRAS · BUGFIX TIPO "PROJETOS" — ZOD ENUM NO BACKEND. BACKEND PONTUAL · ZERO ALTER/DROP.** `z.enum` nos 2 endpoints de criar/editar obra (server/routers.ts) não incluía `"projeto"` → erro ao salvar. Corrigido. Detalhe: `shared/changelog.ts`.

- **Rev. 3522** — **OBRAS · RENOMEAR TIPO "APENAS PROJETO" → "PROJETOS". 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Label do chip renomeado; valor no banco (`projeto`) inalterado. Detalhe: `shared/changelog.ts`.

- **Rev. 3521** — **OBRAS · NOVO TIPO DE CONTRATO "APENAS PROJETO". 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** 4ª opção verde no chip "Tipo de Contrato" do formulário Nova Obra. Schema `varchar(30)` aceita o valor "projeto" sem ALTER TABLE. Detalhe: `shared/changelog.ts`.

- **Rev. 3520** — **CONCILIAÇÃO · SELEÇÃO MÚLTIPLA EM "JÁ CONCILIADOS" PARA DESFAZER EM LOTE. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Checkbox por linha + "Selecionar todos" no header; botão âmbar "Desfazer N selecionado(s)"; AlertDialog de confirmação; execução sequencial silenciosa com toast final. Detalhe: `shared/changelog.ts`.

- **Rev. 3519** — **FORNECEDORES · BUGFIX LAYOUT MODAL — BOTÃO "SALVAR ALTERAÇÕES" CORTADO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `DialogContent` → `flex flex-col`; corpo scroll `flex-1`; footer `shrink-0` fora do scroll. Botão sempre visível independente do conteúdo. Detalhe: `shared/changelog.ts`.

- **Rev. 3511** — **CONCILIAÇÃO · SHEET DE DETALHE AO DUPLO-CLIQUE/DUPLO-TOQUE EM AMBAS AS LISTAS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Duplo-clique em extrato → Sheet lateral (valor, saldo, descrição completa, cheque/fatura/IA/vínculo, ações Lançar/Apagar). Duplo-clique no ERP → abre dialog detalhe existente (👁). Detalhe: `shared/changelog.ts`.

- **Rev. 3510** — **CONCILIAÇÃO · SALDO COLORIDO: VERMELHO SE NEGATIVO, VERDE SE POSITIVO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `saldoApos` nas linhas do extrato: `<0 → text-red-500`, `≥0 → text-emerald-600`. Detalhe: `shared/changelog.ts`.

- **Rev. 3509** — **CONCILIAÇÃO · BUGFIX MOVIMENTAÇÃO INTERNA: ITEM PERMANECIA NA LISTA APÓS CONFIRMAR. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `onSuccess` agora adiciona `lineId` ao `dismissedStmtIds` + chama `refetchReport()`. Detalhe: `shared/changelog.ts`.

- **Rev. 3508** — **PLANO DE CONTAS · COLAPSO/EXPANSÃO TODOS OS NÍVEIS + FECHAR/EXPANDIR TUDO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Botões "Fechar tudo"/"Expandir tudo" no header; chevron em qualquer nível com filhos; visual recolhido=destaque cinza. Detalhe: `shared/changelog.ts`.

- **Rev. 3506** — **CONCILIAÇÃO · LAYOUT HEADERS SEM SOBREPOSIÇÃO (2 LINHAS). 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Título em linha 1 (full-width); filtros+ações em linha 2 (justify-between). Resolve sobreposição no mobile/tablet nos cards "No extrato" e "No ERP". Detalhe: `shared/changelog.ts`.

- **Rev. 3505** — **CONCILIAÇÃO · FILTRO ENTRADA/SAÍDA EM "NO ERP, SEM EXTRATO" E "JÁ CONCILIADOS". 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `filterLanTipo`/`filterConcTipo` + `repConcView`; botões nas 2 seções e na visão expandida. Detalhe: `shared/changelog.ts`.

- **Rev. 3504** — **CONCILIAÇÃO · FILTRO ENTRADA/SAÍDA NA LISTA "NO EXTRATO, SEM LANÇAMENTO". 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Segmented-control "Todos/Entrada/Saída" no header da seção e na visão expandida; contador exibe N/Total quando filtro ativo. Detalhe: `shared/changelog.ts`.

- **Rev. 3503** — **CONCILIAÇÃO · REPORT REFETCH AUTOMÁTICO APÓS CONCILIAR/LANÇAR. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `refetchReport()` adicionado no `onSuccess` de 5 mutations (conciliar, grupo, semConta, PIX, lançar+conciliar) — "Já conciliados" atualiza sozinho sem clicar "Atualizar". Detalhe: `shared/changelog.ts`.

- **Rev. 3502** — **CATEGORIAS · BUSCA SEM ACENTO (NORMALIZE NFD). 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Busca não normalizava acentos: "Mutuo" não achava "MÚTUO". `norm()` aplica NFD+strip em query e nome. Detalhe: `shared/changelog.ts`.

- **Rev. 3501** — **CONCILIAÇÃO · REMOÇÃO OTIMISTA DE "JÁ CONCILIADOS" APÓS DESCONCILIAR. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `dismissedConcIds` Set remove o item de `repConc` imediatamente; ID capturado via `variables.linhaId` no onSuccess; `useEffect([report])` zera ambos os sets no próximo "Atualizar". Detalhe: `shared/changelog.ts`.

- **Rev. 3500** — **CONCILIAÇÃO · REMOÇÃO OTIMISTA DA LISTA "NO EXTRATO, SEM LANÇAMENTO" APÓS LANÇAR. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `dismissedStmtIds` Set remove o item imediatamente após sucesso; contador do header atualiza junto; `useEffect([report])` limpa o set no próximo "Atualizar". Detalhe: `shared/changelog.ts`.

- **Rev. 3499** — **MÚTUOS INTERCOMPANY · 4 CATEGORIAS AUTO-0132…0135 + SUBGRUPOS 10.4 E 8.4 NO PLANO. NEON · ZERO ALTER/DROP.** Fundamento: art. 464 RIR/2018 (mútuo entre coligadas exige contrato+juros SELIC). AUTO-0132 MÚTUO CONCEDIDO (despesa/CC PASSIVOS); AUTO-0133 MÚTUO RECEBIDO (receita/CC PASSIVOS); AUTO-0134 JUROS PAGOS (despesa/CC FINANCEIRO); AUTO-0135 JUROS RECEBIDOS (receita/CC FINANCEIRO). Detalhe: `shared/changelog.ts`.

- **Rev. 3498** — **CONCILIAÇÃO · BUGFIX DROPDOWN CATEGORIAS: ESCOPO + TIPO + DUPLICATA. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** escopo:"categoria" exclui nós do plano; filtro por tipo receita/despesa; duplicata "Sem categoria" eliminada. Detalhe: `shared/changelog.ts`.

- **Rev. 3497** — **CATEGORIAS · MESCLA MÃO DE OBRA TERCEIRIZADA + SUBEMPREITEIRO. NEON · ZERO ALTER/DROP.** AUTO-0022 renomeado para "MÃO DE OBRA TERCEIRIZADA / SUBEMPREITEIRO"; AUTO-0131 inativado. Detalhe: `shared/changelog.ts`.

- **Rev. 3496** — **PLANO GRUPO 3 · MÃO DE OBRA PJ E SUBEMPREITEIRO. NEON · ZERO ALTER/DROP.** AUTO-0130 MÃO DE OBRA PJ (3.1.3) e AUTO-0131 SUBEMPREITEIRO - MÃO DE OBRA (3.4.1). Distinção: CLT direto × PJ × Terceirizada × Subempreiteiro. Detalhe: `shared/changelog.ts`.

- **Rev. 3495** — **CATEGORIAS RECEITA · 7 NOVAS AUTO-0123…AUTO-0129 COM CC VINCULADO. NEON · ZERO ALTER/DROP.** Medição de Obra, Aditivo, Consultoria, Receitas Diversas, Rendimento, Juros, Desconto. Os 3 sistemas cobrem receitas e despesas simetricamente. Detalhe: `shared/changelog.ts`.

- **Rev. 3494** — **CENTROS DE CUSTO · REFATORAÇÃO + MAPEAMENTO COMPLETO CATEGORIAS↔CC. NEON · ZERO ALTER/DROP.** 6 CCs renomeados; CC-0010 inativado (duplicata); 2 novos (PASSIVOS E DÍVIDAS, JURÍDICO); 106 categorias mapeadas para CCs coerentes com o plano. Detalhe: `shared/changelog.ts`.

- **Rev. 3493** — **PLANO DE CONTAS · GRUPO 10 — PASSIVOS E DÍVIDAS. NEON · ZERO ALTER/DROP.** Novo grupo raiz para medir alavancagem: 3 subgrupos (Tributárias, Bancárias, Fornecedores), 8 folhas, 9 categorias AUTO. Categorias existentes redirecionadas. Detalhe: `shared/changelog.ts`.

- **Rev. 3492** — **CATEGORIAS FINANCEIRAS · PADRONIZAÇÃO DE NOMES. NEON · ZERO ALTER/DROP.** 3 inativações (duplicatas), 22 renomeações (acentos, prefixos DESPESA COM removidos, nomes alinhados ao plano). Detalhe: `shared/changelog.ts`.

- **Rev. 3491** — **CATEGORIAS FINANCEIRAS · DIAGNÓSTICO E AJUSTE COMPLETO. NEON · ZERO ALTER/DROP.** 18 conta_pai_id corrigidos, 1 inativação (Transferência Bancária), 2 correções no plano, 11 novas categorias criadas (AUTO-0102…AUTO-0113). Detalhe: `shared/changelog.ts`.

- **Rev. 3490** — **PLANO DE CONTAS · MODAL SCROLL CORRIGIDO NO MOBILE/TABLET. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** DialogContent flex-col; corpo scroll independente (flex-1 overflow-y-auto); footer fixo (shrink-0); altura 92svh. Detalhe: `shared/changelog.ts`.

- **Rev. 3489** — **PLANO DE CONTAS · CAMPO CÓDIGO READ-ONLY. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Código gerado automaticamente pelo sistema; usuário não edita. Badge "auto" verde. Exibe "—" sem pai selecionado. Detalhe: `shared/changelog.ts`.

- **Rev. 3488** — **PLANO DE CONTAS · MODAL REDESENHADO — LAYOUT MODERNO RESPONSIVO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Cabeçalho colorido por Tipo. Seletor de Tipo → chips coloridos em grid 2×4. Inputs maiores (h-12 rounded-xl). Footer empilhado no mobile. Detalhe: `shared/changelog.ts`.

- **Rev. 3487** — **PLANO DE CONTAS · MODAL "NOVA CONTA" SIMPLIFICADO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Campo "Natureza" removido — derivado automático do Tipo. Removidos textos verbosos de Código, Nome e descrição do grupo pai. Detalhe: `shared/changelog.ts`.

- **Rev. 3486** — **PLANO DE CONTAS · CONTAS IMP REMOVIDAS: LANÇAMENTOS MIGRADOS + CONTAS RECODIFICADAS. NEON · ZERO ALTER/DROP/DELETE.** 8 IMP com equivalente → lançamentos migrados + ativo=0 (Comissão→5.1, Manut.Veículos→5.7, Pgto Empréstimo→7.1, Transporte→3.5, Assessoria Jur→6.1, Custas→6.2, Marketing/Com.Visual→5.2). 7 IMP recodificadas sem migração (5.9 Hospedagem, 5.10 Seguro Veículos, 4.11 Guias FGTS, 3.11 Topografia, 4.12 Telefone Celular, 5.11 Compra Terreno, 7.3 Invest.Financeiros). Detalhe: `shared/changelog.ts`.

- **Rev. 3485** — **PLANO DE CONTAS · CONTAS IMP-001…IMP-015 RECLASSIFICADAS. UPDATE NO NEON · ZERO ALTER/DROP/DELETE.** Todas tinham lançamentos → não excluídas. Movidas para grupos: Despesas Variáveis (8 contas), Despesas Administrativas (2), Custos de Obra (1), Despesas Financeiras (2), Despesas Jurídicas (2). nivel=2, tipo e natureza corrigidos. Detalhe: `shared/changelog.ts`.

- **Rev. 3484** — **PLANO DE CONTAS · BOTÃO "CARREGAR PADRÃO FC" DEFINITIVAMENTE REMOVIDO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Usuário quer só criação manual via "+ Nova Conta". Removidos: Sprout, confirmSeed, seedMut, botão, AlertDialog. Detalhe: `shared/changelog.ts`.

- **Rev. 3483** — **PLANO DE CONTAS · CHECKBOXES PARA SELEÇÃO MÚLTIPLA + EXCLUSÃO EM LOTE + BOTÕES SEMPRE VISÍVEIS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Checkbox em cada linha + "Selecionar todas" no topo. Barra vermelha aparece ao marcar itens com botão "Excluir N selecionada(s)". AlertDialog de confirmação antes de excluir. Exclusão sequencial com relatório ok/fail. Botões +Subconta/Editar/Excluir agora sempre visíveis (sem hover-only). Linha selecionada com fundo azul. Detalhe: `shared/changelog.ts`.

- **Rev. 3482** — **PLANO DE CONTAS · BOTÃO "CARREGAR PADRÃO FC" REMOVIDO A PEDIDO DO USUÁRIO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Usuário quer montar o plano do zero. Removidos: botão, state `confirmSeed`, AlertDialog de confirmação, import `Sprout`, mutation `seedMut`. Estado vazio agora diz "Clique em + Nova Conta para começar." Detalhe: `shared/changelog.ts`.

- **Rev. 3481** — **PLANO DE CONTAS · LEGENDAS COMPLETAS + CONFIRMAÇÃO "CARREGAR PADRÃO" + DESCRIÇÕES EM TODOS OS CAMPOS DO FORMULÁRIO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Painel colapsível "Como funciona o Plano de Contas?" explica hierarquia (3 níveis), todos os 8 tipos com descrição prática, Credora × Devedora e os 3 botões de ação. "Carregar Padrão FC" agora abre AlertDialog de confirmação explicando o que será criado e oferecendo alternativa "criar do zero". Formulário: todos os campos com subtexto explicativo; Tipo e Natureza com descrição em cada opção do Select; hint abaixo do Tipo repete a descrição do tipo selecionado. Detalhe: `shared/changelog.ts`.

- **Rev. 3480** — **PLANO DE CONTAS · NOVO LAYOUT: CHIPS DE TIPO, BARRA COLORIDA LATERAL POR TIPO, BOTÃO "+ SUBCONTA" INLINE NO HOVER, FORMULÁRIO REORGANIZADO COM CAMPOS AVANÇADOS COLAPSÍVEIS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Lista: barra colorida 1px na raiz (cor por tipo), ícone `ChevronRight` nas filhas, fundo diferenciado nas raízes, botão `+` no hover abre formulário pré-preenchido com aquela conta como pai. Filtros: Select de tipo substituído por chips pill horizontais com contagem. Formulário: "Conta Pai" renomeado para "Dentro de qual grupo?" + subtexto explicativo; "Sem pai (conta raiz)" virou "Grupo principal (sem pai)" com ícone; campo "Nível" removido (era derivado, confundia); DRE/Ordem movidos para seção "Configurações avançadas" colapsível; Código+Nome lado a lado. Detalhe: `shared/changelog.ts`.

- **Rev. 3479** — **DASHBOARD CONCILIAÇÃO BANCÁRIA · EXPANSÃO MASSIVA DE KPIs E GRÁFICOS: TOP FORNECEDORES, POR CATEGORIA, POR BANCO, SALDO ACUMULADO, % CONCILIAÇÃO POR MÊS. BACKEND ADITIVO + FRONTEND · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Nova procedure `getConciliacaoDashExtra` (5 queries: top fornecedores/categorias despesa/receita/obras/extremos do extrato). No frontend: +6 KPI cards (ticket médio, maior entrada/saída, contas ativas, fornecedores únicos, descrições únicas), +10 novos gráficos (entradas×saídas/mês, % conciliado/mês via ComposedChart, saldo acumulado AreaChart, saídas/entradas/comparativo por banco, ranking fornecedores com minibar + horizontal bar, donut+ranking categorias despesa, bar+ranking categorias receita, stacked bar obras+ranking), +4 DetailDialogs de detalhe. Componentes auxiliares `SectionTitle`/`MiniBar`/`TopListCard` adicionados no próprio arquivo. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3480** — **PLANO DE CONTAS · NOVO LAYOUT: CHIPS DE TIPO, BARRA COLORIDA LATERAL, BOTÃO "+ SUBCONTA" INLINE, CAMPO "NÍVEL" REMOVIDO, DRE/ORDEM COLAPSÍVEIS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3478** — **CONCILIAÇÃO BANCÁRIA · RELATÓRIO NÃO RECARREGA AUTOMATICAMENTE A CADA AÇÃO — USUÁRIO CONTROLA VIA BOTÃO "ATUALIZAR". 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3477** — **CONCILIAÇÃO BANCÁRIA · (1) ERRO "THE STRING DID NOT MATCH THE EXPECTED PATTERN" MAPEADO PARA MENSAGEM AMIGÁVEL + (2) BUGFIX `getOcsPorMes` "operator does not exist: date ~ unknown". BACKEND PONTUAL + FRONTEND · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3476** — **FORNECEDORES · BUGFIX: BOTÃO "BUSCAR CNPJ" BLOQUEADO NO MODO EDIÇÃO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3475** — **EMPRESAS TERCEIRAS · AUTO-PREENCHIMENTO DA FICHA AO DIGITAR O CNPJ (14 DÍGITOS). 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.


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
- **Moeda SEMPRE em formato BRL pt-BR (`R$ 100.000,00` — ponto p/ milhar, vírgula p/ centavos).** Tanto na EXIBIÇÃO (usar `formatBRL`) quanto em INPUTS de digitação de valor (usar máscara `maskBRL`/`parseMaskBRL`). Nunca exibir/aceitar o formato cru anglo `100000.00`.
- **REGRA DE OURO — CAMINHO B (Rev. 2646+, substitui Rev. 2644/2617/2533/2603).** O "% PREVISTO" é a réplica da coluna **"% PREVISTO" (Texto10) do MS Project** — "verdade absoluta". O "% CONCLUÍDA" segue a coluna `PercentComplete`. As duas régua são alinhadas às fórmulas do MSP:
  - **% PREVISTO — FÓRMULA-FONTE (Texto10):** a coluna "% PREVISTO" do MSP é `Int(Num Dur(Prev)[188743983] ÷ PESO DUR(BL)[188743982] × 100 + 0.5)` = fração de duração da baseline DECORRIDA até o StatusDate, ponderada por DURAÇÃO das folhas, **ARREDONDADA** (`+0.5` antes do `Int` = `round`, NÃO trunca).
  - **% PREVISTO — RÉGUA NO ERP (projeção p/ TODAS as semanas):** motor de **TEMPO ÚTIL MINUTO-A-MINUTO** da baseline (`unitsElapsed`/`unitsTotal` sobre `shared/diasUteis`, clipando aos `weekDayIntervals` do calendário). **RAIZ = ROLLUP** = `round(Σ minutos úteis DECORRIDOS das folhas ÷ Σ minutos úteis TOTAIS das folhas × 100)` — soma das DURAÇÕES das folhas, **NÃO** o vão início→fim do projeto (corrigido na Rev. 2644). POR ATIVIDADE = `round(elapsed/total × 100)`. `round` (não `trunc`) p/ espelhar o `+0.5` do Texto10.
  - **% PREVISTO — LEITURA DO VALOR-SNAPSHOT (cliente) (Rev. 2647+, substitui Rev. 2644):** `client/.../ImportarCronograma.tsx` lê SEMPRE a MESMA coluna FIXA `Texto10 (188743750)` via const `FID_PREVISTO_TEXTO10`, em TODOS os projetos (presentes e futuros). **ACABARAM a detecção por `<Alias>` (`detectarFidPorAlias` removida) e as reservas Texto6/Texto11.** Se Texto10 faltar no XML, o valor fica `null` → a tela mostra "—" (jamais lê outra coluna; Texto6 em templates LOTUS é lixo sem alias/fórmula). Vale pra RAIZ (`parseMSProjectFull`) e pra cada ATIVIDADE (`parseMSProjectTasksFromDoc`).
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora). Sem `weekDayIntervals` OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal = fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **PADRÃO ATUAL (Rev. 2646): o snapshot "% Previsto" REGENERA EM TODO UPLOAD DO XML — inclusive o SEMANAL — usando o calendário do XML como verdade absoluta.** Acontece em `salvarAtividades` (cadastro/substituir) E em `salvarMetadadosMSProject` (que roda em todo import e regrava o `calendarioJson` limpo). Como a baseline é imutável dentro da revisão, re-rodar é IDEMPOTENTE (mesma curva), mas garante que projetos ANTIGOS se AUTO-CUREM no próximo upload semanal (ex.: a curva ~1% baixa por feriado injetado pré-Rev. 2645 some sozinha). REVOGA a regra anterior "snapshot regenerado SÓ no salvarAtividades / avanço semanal NÃO regenera". RESSALVA: projetos dormentes (sem novos uploads) só corrigem com reimport do cronograma inicial.
  - **RESSALVA DE PARIDADE NUMÉRICA:** o XML de referência (PLN_816 R04) tem StatusDate < StartDate → Texto10 = 0% em tudo, então a curva numérica NÃO foi cravada empiricamente nesta revisão. A régua matemática está alinhada à fórmula; falta re-validar com XML de status-date no meio do projeto.
  - Implementação: `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB` — rollup das folhas + round; chamada pós-transaction em `salvarAtividades` E em `salvarMetadadosMSProject` — Rev. 2646, que roda em TODO upload e resolve a revisão ativa + respeita a fonte; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (`detectarFidPorAlias` + parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
