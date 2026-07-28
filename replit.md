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

- **Rev. 4701** — Portal do Parceiro nas cores FC (azul-marinho + amarelo): tela de boas-vindas dedicada (instruções de cadastro, datas/fechamento e fluxo de pagamento + "Acessar Sistema") separada da tela de lançamentos.
- **Rev. 4700** — Tela Portal Externo redesenhada: hero gradiente com mini-stats, cards de parceiro em grid com credenciais copiáveis (login CNPJ + senha padrão em 1 toque; "definida pelo parceiro" após a troca).
- **Rev. 4699** — Botão "Portal do Parceiro" no header da tela Portal Externo (abre /portal/login em nova aba).
- **Rev. 4698** — Portal do Parceiro repaginado: 2 páginas touch-first (boas-vindas com hero FC + KPIs; lançamento com galeria de fotos dos colaboradores, anexo de qualquer arquivo e confirmação poka-yoke); fotoUrl no buscarFuncionarios; guard de ownership no uploadNotaFiscal.
- **Rev. 4697** — Portal do Parceiro: convite de boas-vindas por e-mail (cadastra responsável, cria acesso com senha padrão se faltar, passo a passo + link) e botão Copiar Link do Portal.
- **Rev. 4696** — Portal Externo do Parceiro: senha padrão configurável por empresa (default mudar123, troca obrigatória no 1º acesso), reset com confirmação, botão Editar acesso (nome/e-mail) e tenant guard no gerarAcesso.
- **Rev. 4695** — Dashboard Parceiros: KPIs, gráficos e drill-down agora agrupam pela competência do ciclo de desconto (16→15), igual à tela de Lançamentos; antes agrupava por mês-calendário e os números divergiam. Auditoria confirmou dados 100% corretos no banco.
- **Rev. 4694** — Dashboard Parceiros: redesign responsivo para tablet/celular — KPIs em blocos legíveis sem truncamento de valores/títulos, seletor de período com alvos de toque maiores; lógica e drill-downs intactos.
- **Rev. 4693** — Cheques: matcher cheque×extrato reconhece os formatos reais dos bancos ("CHEQUE EMITIDO/DEBITADO" e "COMPENSACAO INTERNA DE CHEQUE" do Santander, "CHEQUE COMPENSADO · Doc" da Caixa); 51 cheques pendentes da FC Engenharia com compensação confirmada foram marcados compensados/conciliados conforme o extrato.
- **Rev. 4692** — Conciliação: extrato Santander "Consolidado Inteligente" com página de marketing (cita "Internet Banking Empresarial") voltou a importar pelo parser determinístico (gate corrigido nos parsers Consolidado e IBPJ); rodapé jurídico não vaza mais na descrição; importação em chunks não perde mais duplicatas legítimas partidas entre blocos (client envia dupKeyTotais do arquivo inteiro).
- **Rev. 4691** — Folha: decisões "Pagar/Não Pagar" do card de aviso prévio encerrando no mês não reaparecem mais ao reabrir a tela (getPeriod aplica as decisões gravadas na leitura do snapshot).
- **Rev. 4690** — Botão "Reprovar" no Apontamento de Campo (não grava ponto e desfaz o marcador da abertura) e alerta in-app ao criador quando apontamento é reprovado ou HE é rejeitada (tabela user_alerts + pop-up global "Ciente"/"Ver registro").
- **Rev. 4689** — Enviar ao Financeiro gera 2 lançamentos quando há multa FGTS (RESCISÃO sem a multa + FGTS separado, 40%/20% acordo); ambos editáveis no modal; aviso só conclui/desliga quando os DOIS forem quitados; reversão cancela os dois.
- **Rev. 4688** — Alertas do dia (pop-ups estilo lembrete de férias): contratos de experiência vencendo, avisos prévios no prazo final de pagamento (RH + Financeiro) e aniversariantes; antecipação de fim de semana/feriado (último dia útil anterior; aniversário também no 1º dia útil posterior); alerta de férias agora também no Financeiro (informativo).
- **Rev. 4687** — Aviso Prévio: botão "Dar Baixa" removido (baixa da rescisão vem SEMPRE do Financeiro via Contas a Pagar); "Enviar ao Financeiro" agora abre modal com valor editável (previsão do sistema como sugestão; edição registrada em observações + audit log).
- **Rev. 4686** — Aviso Prévio: novos tipos Justa Causa (Art. 482, sem aviso, só saldo + férias vencidas), Rescisão Indireta (Art. 483, verbas plenas) e Acordo Mútuo (Art. 484-A, aviso metade + multa 20%); motivo legal obrigatório (inciso + descrição); bloqueio server de dispensa empregador_* p/ cipeiro estável (Súmula 379 TST).
- **Rev. 4685** — Fix Aviso Prévio: "Enviar ao Financeiro" dava "Sem acesso a esta empresa" p/ todos (guard comparava objetos com número e faltava o role).
- **Rev. 4684** — Fix publicação: heap do vite build 3840→4608MB (build estourava memória e a publicação falhava).
- **Rev. 4683** — Fix permissão: rota /documentos-colaborador registrada no módulo RH & DP (usuário RH comum caía em "Acesso Restrito").
- **Rev. 4682** — Poka-yoke 2/6: Central de Divergências (Financeiro › Dashboards) — 9 cruzamentos só-leitura entre módulos (aviso×status, desligado×obra/EPI/seguro, cheque×título, medição dupla, OC×financeiro, férias×ponto).
- **Rev. 4681** — Poka-yoke 1/6 (falhas silenciosas): erro interno vira aviso na tela (banners de dados parciais no Scorecard Segurança e Custo de Demissão; importação financeira reporta fontes que falharam; erro ≠ "sem dados" no Dash de Orçamentos).
- **Rev. 4680** — Botão Voltar agora usa pilha de navegação interna do app: volta exatamente uma tela (fix Safari/iPad que pulava pra tela inicial).
- **Rev. 4679** — Poka-yoke documental: Férias, Aviso Prévio, Advertência, Dissídio, Seguro de Vida e Admissão geram automaticamente os documentos no dossiê p/ assinatura.
- **Rev. 4678** — Documentos do Colaborador: moldura ISO (logo + código + revisão + emissão) e rodapé LGPD em todos os documentos.
- **Rev. 4677** — Checklist Geral de Documentos: checkbox por funcionário + "Gerar selecionados"/"Gerar todos" em lote com progresso 0–100%.
- **Rev. 4676** — Locações a Vencer: cards Total/Vencidas/A vencer viram filtros clicáveis da lista.
- **Rev. 4675** — Documentos do Colaborador: olhinho de pré-visualização (documento preenchido, sem salvar) em cada item do checklist/eventuais e no dialog de campos extras.
- **Rev. 4674** — Documentos do Colaborador: menu lateral fixo (DashboardLayout) + botão Voltar.
- **Rev. 4673** — **Documentos do Colaborador: layout moderno** (fotos + % de completude por funcionário; geração em lote com checkbox e progresso 0–100%; assinatura via FCSign igual à ficha de EPI).
- **Rev. 4672** — **Documentos do Colaborador Fases 2–4** (Ficha com foto; Contrato CLT; férias/folha/aditivo assináveis com campos extras; termos de benefícios; dependentes completos no dossiê; aba PDI & Feedback na Avaliação).
- **Rev. 4671** — **Controle de Documentos: aba Checklist** (matriz funcionário × documento com todos os modelos de RH + ASO/OS/treinamentos/anexos; gera documento faltante direto na célula; link p/ dossiê com pré-seleção).
- **Rev. 4670** — **Controle de Documentos: fotos dos funcionários** (avatares nas listas Validade, Sem ASO e Documentos — demais abas já tinham).
- **Rev. 4669** — **Documentos do Colaborador (Fase 1)** (página nova RH/DP: 8 modelos ISO FC-RH-008…015, geração por funcionário, assinatura digital auditável, checklist documental, PDF timbrado e dossiê ZIP).
- **Rev. 4668** — **OS Digital: ajustes do code review** (salvarAssinatura valida tipo × deliveryId; dialog com estado de erro).
- **Rev. 4667** — **OS (NR-01) Digital**: gerada por colaborador (texto da função + EPIs c/ CA + treinamentos), assinatura digital (epi_assinaturas tipo ordem_servico), botão "OS (NR-01)" na Ficha de EPI, PDF via /api/download/ordem-servico-pdf e automática no Dossiê ZIP (001.4).
- **Rev. 4666** — **Dossiê ZIP: subpastas numeradas** (001.1 Identificação, 001.2 Registro, 001.3 Outros, 001.4 OS; 004.1 Integração FC, 004.2 Integração Cliente).
- **Rev. 4665** — **Dossiê ZIP reestruturado**: 001 - DOCUMENTOS PESSOAIS com subpastas (Identificação/Registro/Outros/OS - Ordem de Serviço); NR-01 sai de Treinamentos; 004 separa Integração FC × Integração Cliente.
- **Rev. 4664** — **SEGURANÇA: tenant guard em createDelivery/updateDelivery/deleteDelivery** (empresa/funcionário/EPI no escopo do user; delete devolve estoque com valores do banco, não do cliente).
- **Rev. 4663** — **Ficha de EPI: alterar/excluir entrega antes da assinatura** (botões na linha sem assinatura; update ajusta estoque, delete devolve ao estoque; assinada segue intocável).
- **Rev. 4662** — **Ficha de EPI: foto do EPI nos itens da busca de entrega** (miniatura ?w=128, fallback "EPI").
- **Rev. 4661** — **Ficha de EPI: busca digitável de EPI (combobox, texto completo) + fix GLOBAL do maximizar** (dialog com `style` próprio anulava o sizeStyle).
- **Rev. 4660** — **Alocar Funcionários: foto dos funcionários** na lista de seleção e no painel "Selecionados" (miniatura ?w=128, fallback inicial).
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
