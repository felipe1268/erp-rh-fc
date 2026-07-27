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

- **Rev. 4659** — **FICHA DE EPI: registrar entrega direto da ficha** — botão "Nova entrega" no dialog (EPI + qtd + data → epis.createDelivery, estoque central); depois é só coletar a assinatura na linha.
- **Rev. 4658** — **SEGURANÇA: tenant guard no fallback de foto por CPF (3 pontos) + SSRF eliminado no fetchFileBuffer do Dossiê ZIP** (só /uploads via dbRetrieve).
- **Rev. 4657** — **FICHA DE EPI: lista 100% do efetivo** — base agora é employees (todo CLT não-desligado, mesmo sem entrega) + quem tem entrega; novo KPI/filtro "Sem ficha" e badge no card.
- **Rev. 4656** — **DOSSIÊ ZIP: "004 - INTEGRAÇÕES" com acento** (pedido do usuário; ZIP em UTF-8).
- **Rev. 4655** — **DOSSIÊ ZIP: pastas numeradas em maiúsculas** — 001 - DOCUMENTOS, 002 - ASO, 003 - TREINAMENTOS, 004 - INTEGRACOES, 005 - EPI (aprovado pelo usuário).
- **Rev. 4654** — **FICHA DE EPI: selo "✓ Assinado digitalmente" p/ assinaturas antigas com arquivo de imagem perdido** (48 no banco, pré-persistência em uploaded_files); flag assinaturaArquivoOk na procedure; vale p/ tela, print e PDF do Dossiê.
- **Rev. 4653** — **CRACHÁ: nome não invade mais a listra laranja** — recuo do bloco nome+função aumentado de 40px p/ 68px simétrico (na altura do nome a tarja avança até ~65px).
- **Rev. 4652** — **CRACHÁ: removido "ID: XXX-N" do verso** (abaixo do QR) a pedido do usuário — informação desnecessária; QR já autentica.
- **Rev. 4651** — **FICHA DE EPI: obra no card + filtro por obra.** fichaEpiResumo retorna obra atual (obra_funcionarios isActive=1 LATERAL); card mostra obra com ícone HardHat; Select de obras ao lado da busca (inclui "Sem obra alocada"); busca textual também acha por obra.
- **Rev. 4650** — **FICHA DE EPI: fallback de foto do cadastro irmão (mesmo CPF).** fichaEpiResumo (LATERAL), fichaEpiFuncionario e fichaEpiPdf buscam a foto de outro cadastro do mesmo CPF quando o local está sem foto (duplicação cross-empresa do grupo).
- **Rev. 4649** — **FICHA DE EPI DIGITAL NO DOSSIÊ ZIP.** Novo `server/services/fichaEpiPdf.ts` (PDF server-side via puppeteer, imagens em data URI, lote com 1 Chromium); `downloadDossie.ts` inclui `<Nome>/EPI/Ficha_de_EPI_Digital.pdf` p/ cada funcionário com entregas. Ficha antiga (upload) mantida.
- **Rev. 4648** — **FICHA DE EPI: layout moderno em cards + foto ampliável.** /epis/ficha em grid de cards responsivo com KPIs-filtro no header navy, barra de progresso de assinaturas; clique na foto (card e ficha) abre lightbox grande. Arquivos: `client/src/pages/EpiFichaFuncionario.tsx`, `client/src/components/FichaEpiDialog.tsx`.
- **Rev. 4647** — **FICHA DE EPI: logo formatado no cabeçalho.** Faixa navy em flex 3 colunas (logo em caixa branca contida, título centralizado); fim do vazamento sobre os dados. Arquivo: `client/src/components/FichaEpiDialog.tsx`.
- **Rev. 4646** — **FICHA DE EPI: coleta de assinatura pendente + logo da empresa + foto do colaborador (tela e impressão).** Botão "Coletar assinatura" nas entregas sem assinatura (fluxo oficial EpiAssinatura), logo no cabeçalho, foto 3x4 grande no header e no PDF. Arquivo: `client/src/components/FichaEpiDialog.tsx`.
- **Rev. 4645** — **FICHA DE EPI: GUARD ANTI-IDOR.** fichaEpiResumo/fichaEpiFuncionario intersectam companyIds com as empresas do usuário (FORBIDDEN se vazio). Arquivo: `server/routers/epis.ts`.
- **Rev. 4644** — **FICHA DE EPI POR FUNCIONÁRIO (NR-06/CLT), 100% INTEGRADA.** Novo `<FichaEpiDialog>` (todas as entregas + assinatura digital autenticada com data/IP/hash SHA-256, Termo de Compromisso, Imprimir/PDF) acessível por: aba lateral SST "Ficha de EPI" (/epis/ficha), Raio-X e Ficha Documental. Backend: `epis.fichaEpiResumo`/`fichaEpiFuncionario`. Arquivos: `client/src/components/FichaEpiDialog.tsx`, `client/src/pages/EpiFichaFuncionario.tsx`, `server/routers/epis.ts`.
- **Rev. 4643** — **SEVERIDADE DE VENCIMENTO: ≤30d VERMELHO, 31–60d AMARELO.** Pop-up de treinamentos, TreinChip e Ficha Documental corrigidos (antes ≤30d ficava amarelo). Arquivo: `client/src/pages/ControleDocumentos.tsx`.
- **Rev. 4642** — **FICHA DOCUMENTAL: MULTI-EMPRESA + FALLBACK RAIO-X.** Query habilita com companyIds (companyId 0); colaborador fora do painel (desligado) abre Raio-X direto. Arquivo: `client/src/pages/ControleDocumentos.tsx`.
- **Rev. 4641** — **FICHA DOCUMENTAL NO CLIQUE DO NOME (Controle de Documentos).** Clique no nome abre ficha-resumo (pendências em destaque + checklist ASO/treinamentos/integrações/documentos com selos EM DIA/A VENCER/PENDENTE); Raio-X via botão dentro da ficha. Client-only, reusa painelDossie. Arquivo: `client/src/pages/ControleDocumentos.tsx`.
- **Rev. 4640** — **DOSSIÊ: CHIP DE TREINAMENTOS CLICÁVEL + POP-UP.** Clique no "⚠ N" abre Dialog com resumo do alerta e cada treinamento (badge VENCIDO/Vence em Xd/Válido, datas, certificado), vencidos primeiro. Client-only. Arquivo: `client/src/pages/ControleDocumentos.tsx`.
- **Rev. 4639** — **INTEGRAÇÕES: FOTO DO COLABORADOR NA LISTAGEM.** integracoes.listar devolve fotoUrl; PersonPhoto sm ao lado do nome. PersonPhoto agora usa miniatura ?w=128 + lazy no avatar (lightbox mantém original) — vale p/ todas as listas. Arquivos: `server/routers/integracoes.ts`, `client/src/pages/ControleDocumentos.tsx`, `client/src/components/PersonPhoto.tsx`.
- **Rev. 4638** — **VERIFICAR APTIDÃO: HARDENING LGPD + PARSE DE DATA.** dataAdmissao não sai mais na rota pública (só tempoEmpresa derivado, server-side); vigência de integração com parseDia robusto (ISO/timestamp/DD-MM-YYYY). Arquivos: `server/routers/portalExterno.ts`, `client/src/pages/VerificarAptidao.tsx`.
- **Rev. 4637** — **VERIFICAR APTIDÃO: INTEGRAÇÕES DE CLIENTE.** QR mostra integrações (employee_integrations): cliente, realização, vencimento e pill Vigente/VENCIDA. Arquivos: `server/routers/portalExterno.ts`, `client/src/pages/VerificarAptidao.tsx`.
- **Rev. 4636** — **VERIFICAR APTIDÃO: TEMPO DE EMPRESA.** Endpoints públicos devolvem dataAdmissao; tile "Tempo de Empresa" (X anos e Y meses) com parse manual iOS-safe. Arquivos: `server/routers/portalExterno.ts`, `client/src/pages/VerificarAptidao.tsx`.
- **Rev. 4635** — **VERIFICAR APTIDÃO: CORES DA MARCA + Nº INTERNO (SEM CPF).** CPF removido da rota pública; numeroInterno no lugar (mesma fonte do crachá). Header navy #0A1E3C com listras laranja #EE9803, status em selo colorido, foto com anel laranja. Arquivos: `server/routers/portalExterno.ts`, `client/src/pages/VerificarAptidao.tsx`.
- **Rev. 4634** — **VERIFICAR APTIDÃO (QR): LAYOUT MODERNIZADO + LOGO DA EMPRESA.** Endpoints públicos devolvem logoEmpresa (companies.logoUrl); página com logo em pill branca, foto sobreposta ao header (crachá digital), tiles de info e fundo com tint do status. Lógica de aptidão/LGPD intocada. Arquivos: `server/routers/portalExterno.ts`, `client/src/pages/VerificarAptidao.tsx`.
- **Rev. 4633** — **CRACHÁ: TARJA VERMELHA MAIS ESTREITA.** Faixa "Restrição de Atividade" passa de ml-40/mr-34 para ml-70/mr-64 — não cobre mais a listra laranja diagonal. Arquivo: `client/src/pages/terceiros/Crachas.tsx` (client-only). ZERO schema change.
- **Rev. 4632** — **EMISSÃO DE CRACHÁS: LISTAGEM MODERNIZADA.** Barra única de controles (abas com contagem+cor, busca larga com ✕, filtros de documentação) num só card; cards brancos com filete lateral colorido, foto 56px, nome sem corte (line-clamp-2), pill do tipo e rodapé "Ver Crachá". Arquivo: `client/src/pages/terceiros/Crachas.tsx` (client-only). ZERO schema change.
- **Rev. 4631** — **CRACHÁ: NOME/FUNÇÃO NÃO INVADEM AS LISTRAS DIAGONAIS.** Bloco nome+função passa de px-6 para ml-[40px] mr-[34px] (mesmo recuo das linhas de dados/faixa de restrição) — texto fica só na área branca. Arquivo: `client/src/pages/terceiros/Crachas.tsx` (client-only). ZERO schema change.
- **Rev. 4630** — **LOG SEFAZ: "RODANDO" ETERNO VIRA "INTERROMPIDO".** Sync das 20:12 de 26/07 funcionou (29 notas, NSU 9.842, rate-limit zerado). Linhas 'rodando' órfãs (restart no meio) agora são marcadas 'interrompido' via sweep no `sefaz.syncLog` (>30min) + badge "⏹ Interrompido" no client. Arquivos: `server/routers/sefaz.ts`, `client/src/pages/financeiro/FinanceiroNotasFiscais.tsx`. ZERO schema change.
- **Rev. 4629** — **CRACHÁ: NOME DO FUNCIONÁRIO MENOR.** nomePx 21/18/16 → 17/15/13.5 (normal/compact/denso) na frente do crachá. Arquivo: `client/src/pages/terceiros/Crachas.tsx` (client-only). ZERO schema change.
- **Rev. 4628** — **CRACHÁS: EMPRESA/OBRA/FUNÇÃO SEM CORTE + CÓDIGO INTERNO DO TERCEIRO.** Valores das linhas da frente (EMPRESA/OBRA) deixam de truncar com "..." e quebram em até 2 linhas (fonte reduz p/ valores >26 chars); função entre traços idem (line-clamp-2). Crachás de terceiros ganham linha "Nº INTERNO" com `funcionarios_terceiros.numero_interno` (ex. FEL-00054) — o list já devolvia; faltava mapear `matricula`. Arquivo: `client/src/pages/terceiros/Crachas.tsx` (client-only). ZERO schema change.
- **Rev. 4627** — **CRACHÁS: FILTRO DOCUMENTAÇÃO OK/PENDENTE NA ABA TERCEIROS.** Terceiros ganham docStatus calculado do cadastro (ASO ausente/vencido + ≥1 treinamento NR vigente; integração/ficha EPI não bloqueiam — quase não preenchidos na base, zerariam o "OK"). Filtro OK/pendente habilitado nas 2 abas; tag + selos/pills NR nos cards de terceiros; validades Date→toISOString (nunca String(Date)). Arquivo: `client/src/pages/terceiros/Crachas.tsx` (client-only). ZERO schema change.
- **Rev. 4626** — **MINIATURAS DE FOTOS (?w=NN) — FIX FOTOS QUEBRADAS NOS CRACHÁS.** Fotos de cadastro são originais (~865KB méd., até 5.7MB); ~80 de uma vez derrubava o Safari/iPad (ícone "?"). Nova rota: `/uploads/...?w=NN` (32–512) redimensiona com sharp → webp, cache em `uploads/.thumbs/<w>/`; fonte disco→fallback DB; falha cai no original. Grade de crachás usa `?w=128` + lazy. 179 miniaturas pré-geradas (méd. 2.4KB). Arquivos: `server/_core/index.ts`, `client/src/pages/terceiros/Crachas.tsx`. Dep nova: sharp. ZERO schema change.
- **Rev. 4625** — **ENVIO DA CÓPIA DO CÓDIGO EM BACKGROUND (FIX "FETCH IS ABORTED").** Safari/iPad aborta fetch longo; `backup.pushCodeSnapshot` agora dispara `startCodeSnapshotAsync` e retorna na hora; conclusão/erro viaja pelo `snapshotProgress` (agora com `resultado`/`erro`); trava single-flight marcada sincronamente antes do async. Validado com envio real (~106s, commit gravado). Arquivos: `server/services/codeSyncService.ts`, `server/routers/backup.ts`, `client/src/pages/Configuracoes.tsx`. ZERO schema change.
- **Rev. 4624** — **CRACHÁS: ABA PJ ELIMINADA — PJ UNIFICADO COM TERCEIROS.** Aba "PJ" removida da Emissão de Crachás; aba "Terceiros" lista terceiros + PJ juntos (ordenados por nome). PJ usa visual de TERCEIRO (cor/rótulo) via `displayTipo()`; tipo interno "pj" mantido só no QR (`/verificar/pj/:id`). Legenda e Personalizar Cores só CLT + Terceiros; filtro de documentação só na aba CLT. Corrigido comentário JSX inválido da 4623. Arquivo: `client/src/pages/terceiros/Crachas.tsx`. ZERO schema change.
- **Rev. 4623** — **CRACHÁ: FAIXA DE RESTRIÇÃO CENTRALIZADA NA ÁREA BRANCA.** A faixa "RESTRIÇÃO DE ATIVIDADE" usava `mx-[10px]` e invadia as listras diagonais; agora usa o mesmo recuo das linhas de dados (`ml-[40px] mr-[34px]`). Arquivo: `client/src/pages/terceiros/Crachas.tsx`. ZERO schema change.
- **Rev. 4622** — **ASO: RESTRIÇÕES OPERACIONAIS ESTRUTURADAS (CHECKBOXES DO RH).** Continuação da 4620: card "Restrições Operacionais" no formulário de ASO (Controle de Documentos) com 12 checkboxes do dicionário canônico `shared/restricoesOperacionais.ts`; nova coluna `asos."restricoesOperacionais"` (JSON array de keys, self-heal ADD COLUMN). Server valida keys contra o dicionário (deny-by-default). QR público dá PRIORIDADE às checkboxes sobre a detecção por texto; flag `restricaoAtividade` também as considera. Validado ponta a ponta (Neon + rota pública; dado de teste revertido). Arquivos: `shared/restricoesOperacionais.ts`, `drizzle/schema.ts`, `server/_core/index.ts`, `server/routers/controleDocumentos.ts`, `server/routers/portalExterno.ts`, `client/src/pages/ControleDocumentos.tsx`.
- **Rev. 4621** — **SINCRONIZAÇÃO DE CÓDIGO: PERCENTUAL 0–100% NO ENVIO.** `pushCodeSnapshotToGitHub` reporta progresso em memória (compactação 2% → partes 10–85% proporcional → manifesto 86% → GitHub 90% → 100%; erro zera). Novo endpoint `backup.snapshotProgress` (admin) devolve `{ativo, pct, etapa}`; botão "Enviando..." consulta a cada 1s e mostra o % real. Validado com envio real (23MB, 6 partes, commit 6333c2c). Arquivos: `server/services/codeSyncService.ts`, `server/routers/backup.ts`, `client/src/pages/Configuracoes.tsx`. ZERO schema change.
- **Rev. 4619** — **FIX: SINCRONIZAÇÃO DE CÓDIGO (GITHUB) RECONECTADA + SNAPSHOT PARTICIONADO.** O painel mostrava "GitHub não conectado": o vínculo da integração com o ambiente tinha expirado e o endpoint legado de connectors passou a devolver lista vazia. Usuário reconectou e `server/services/githubClient.ts` migrou para o `@replit/connectors-sdk` (proxy autenticado, refresh de token automático — nunca cachear). Segundo problema: o envio da cópia do código (.zip ~22MB) falhava com 413 porque o proxy limita o corpo a ~5MB — `pushCodeSnapshotToGitHub` agora fatia o zip em partes de 4MB (`erp-source-latest.zip.partNNN`) + README.md com SHA-256 e instruções (`cat *.part* > zip`). Validado: snapshot 23MB na branch `erp-code-snapshots`. Pendente: push do git main (8.188 commits atrás desde março) bloqueado por trava da plataforma (INDEX_LOCKED) — usar o painel Git. Arquivos: `server/services/githubClient.ts`, `server/services/codeSyncService.ts`. ZERO schema change.
- **Rev. 4618** — **FIX: BACKUP DIÁRIO EM STREAMING — FIM DO OOM QUE DERRUBAVA O SERVIDOR.** `executarBackup` montava exportData{} com TODAS as 500+ tabelas em memória antes do gzipSync → heap 1GB estourava ("JavaScript heap out of memory" após "[Backup] 526 tabelas") e o Safari mostrava "The string did not match the expected pattern" (HTML no lugar de JSON). Agora: leitura por lotes de 2.000 linhas com keyset por ctid + escrita incremental num stream gzip em /tmp; só o arquivo COMPRIMIDO volta pra memória (S3 + snapshot Neon inalterados); uploaded_files segue só com metadata. Arquivo: `server/services/backupService.ts`. ZERO schema change.
### 5 one-liners

- **Rev. 4617** — **FIX: CRACHÁS — PILLS COM TODOS OS TREINAMENTOS FEITOS (REGRA DE OURO).** Pills sem filtro de vigência (histórico de formação); selos NR e pendências continuam só vigentes. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4616** — **FEAT: DOSSIÊ — SAI ADVERTÊNCIA (INTERNA), ENTRAM DOCUMENTOS PESSOAIS.** Dossiê = pacote completo de integração (ASO+Treinamentos+Integrações+Documentos pessoais); internos FORA no servidor (painel e ZIP); +guard de tenancy (resolveCompanyIdsGuard) no painelDossie. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4615** — **FEAT: DOSSIÊ — SAI ATESTADO (INTERNO), ENTRA INTEGRAÇÃO (TELA + ZIP).** painelDossie troca atestados por integracoes + integracaoVigente; pendências "Sem integração"/"Integração vencida"; ZIP com pasta Integracoes (só /uploads interno, anti-SSRF). Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4614** — **FEAT: CRACHÁS — TODOS OS TREINAMENTOS VIGENTES NA FRENTE (PILLS SUTIS).** `badgeStatus` devolve treinamentos vigentes (dedup canônico Rev. 4613, rótulo "NR-XX"); frente do crachá e lista ganham pills navy-outline (cap 8/4 + "+N"); vale p/ o PNG. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4613** — **FIX: CONTROLE DE DOCUMENTOS/DOSSIÊ — STATUS FIDEDIGNO + FILTRO "FALTA DOCUMENTO" + ZIP SÓ COM DOCS ATUAIS.** painelDossie dedup por tipo canônico (NR-18 == NR 18): só versão vigente conta; pills "Todos / ❌ / ✓"; ZIP só com docs atuais. Detalhe em `shared/changelog.ts`. ZERO schema change.
### Histórico completo

Ver `replit-history.md` para revisões Rev. 4612 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — POKA-YOKE EM TODA REVISÃO (25/07/2026):** Toda nova revisão/feature deve aplicar o princípio Poka-Yoke (à prova de erros): preferir SEMPRE o nível mais forte viável — (3) prevenção pelo design (máscara/select/campo que só aceita valor válido) > (2) bloqueio (validação que impede salvar dado inconsistente, ex.: data no passado, valor zero, duplicidade) > (1) aviso (alerta visual). Ao revisar um fluxo existente, identificar e propor Poka-Yokes faltantes na área tocada.

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
