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

- **Rev. 4028** — **MEDIÇÃO DE CONTRATOS: OLHINHO NA LISTA DE BOLETINS + REDESIGN MOBILE DO CABEÇALHO DO DIÁLOGO "ITENS DO BOLETIM" + ENCAMINHAR VIA WHATSAPP.** Usuário mandou prints do celular mostrando o cabeçalho do diálogo quebrado no mobile (botões Imprimir/Gerar PDF ilegíveis, em cima do X de fechar) e pediu um ícone de olho na lista de boletins + opção de encaminhar via WhatsApp. Lista de boletins: novo botão `Eye` antes do lápis de editar, chamando `abrirItens(b)`. Cabeçalho do diálogo reestruturado em 2 linhas: título isolado no `DialogTitle`; botões de ação (status/Imprimir/Gerar PDF/WhatsApp) movidos para uma linha própria abaixo, fora do título, sem `ml-auto` (eliminando a colisão com o X), sempre ícone+texto, `flex-wrap` p/ quebrar em várias linhas no mobile. Novo `compartilharBoletimMedicaoWhatsApp` em `boletimMedicaoPdf.ts`: tenta `navigator.share({files:[pdf]})` (Web Share API nível 2, abre a folha nativa com WhatsApp como opção); sem suporte (desktop), baixa o PDF e abre `wa.me` com mensagem pronta pedindo para anexar. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4027** — **MEDIÇÃO DE CONTRATOS: RASTREABILIDADE DO "ORIGEM: CRONOGRAMA" + BOTÕES DE FLUXO/IMPRESSÃO/PDF NO DIÁLOGO "ITENS DO BOLETIM".** Usuário pediu que, ao clicar na origem "Cronograma" de um item, ficasse claro DE QUAL semana do Avanço Semanal (Planejamento) veio o % usado na medição; e que o diálogo ganhasse botões de Aprovar/Enviar Medição, Imprimir e Gerar PDF para o boletim poder ser entregue ao cliente validar. Backend: nova query `medicao.getHistoricoAvancoAtividade({atividadeId, contratoId, companyId})` valida contrato↔company e atividade↔projeto do contrato (anti-IDOR), lista o histórico semanal de `planejamento_avancos` da atividade (mesma revisão) ordenado por semana. Frontend: badge "Cronograma" virou botão com Popover (`OrigemBadge`/`HistoricoAvancoContent`) mostrando as semanas lançadas e destacando a última (a "usada"); cabeçalho do diálogo ganhou botão de avanço de status (reaproveita `PROXIMOS_STATUS`/`avancarStatusMutation` já existentes), "Imprimir" e "Gerar PDF". Novo `client/src/lib/boletimMedicaoPdf.ts` (jsPDF manual, mesmo padrão visual de `dfcPdf.ts`) monta documento formal com identificação do contrato, cards de totais, tabela de itens e linhas de assinatura Contratada×Cliente; "Imprimir" abre o PDF numa nova aba e dispara `print()` (não imprime o Dialog `position:fixed` diretamente). ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4026** — **MEDIÇÃO DE CONTRATOS: REDESIGN DO DIÁLOGO "ITENS DO BOLETIM" + INTEGRAÇÃO COM COMPRAS PARA DETECTAR OCs DE FD E TRAZER O VALOR AUTOMATICAMENTE.** Diálogo reconstruído com cards de resumo, coluna "Origem" por linha e botão "Vincular FD de Compras" que cria o registro de FD e insere a linha automaticamente. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4025** — **MEDIÇÃO DE CONTRATOS: "IMPORTAR DO ORÇAMENTO (COM AVANÇO FÍSICO)" NÃO TRAZIA NENHUM ITEM — PASSA A IMPORTAR DIRETO DO CRONOGRAMA.** Casamento por `eap_codigo` colapsava dezenas de atividades numa chave vazia; importação passa a iterar atividades-folha do Cronograma direto, casando avanço por `atividade_id` (211/211 validado, antes 15/148). Botão renomeado para "Importar do Cronograma (avanço físico)". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4023** — **MEDIÇÃO DE CONTRATOS: DROPDOWN "PROJETO / OBRA" CORTAVA NOMES LONGOS NO DIÁLOGO "NOVO CONTRATO DE MEDIÇÃO".** Fix escopado em `MedicaoContratos.tsx`: `SelectContent` ganhou `max-w-[min(28rem,calc(100vw-2rem))]`, `SelectItem` ganhou `whitespace-normal break-words leading-snug py-2`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4022** — **FINANCEIRO/DRE: OPÇÃO DE CONSOLIDAR O MÊS MANUALMENTE.** Nova tabela `financial_dre_consolidacoes`; procedures `getDREConsolidacaoStatus`/`consolidarDRE`/`desconsolidarDRE` (admin/admin_master); tela DRE ganha botão "Consolidar Mês" e selo de consolidação manual. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4021** — **FINANCEIRO/SEFAZ: DANFE MOSTRANDO "XML COMPLETO NÃO DISPONÍVEL" — CAUSA-RAIZ E BOTÃO MANUAL "DAR CIÊNCIA DA OPERAÇÃO E BUSCAR XML COMPLETO".** Causa-raiz: nota chegou via SEFAZ só como resumo (`resNFe`) — o XML completo (`nfeProc`) não é liberado ao destinatário em boa parte das UFs até que ele registre o evento "Ciência da Operação" (tpEvento 210210, ato neutro). Nova função `buscarXmlPorChave` + mutation `sefaz.darCienciaEBuscarXml`, disparado manualmente por nota. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4019 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
