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

- **Rev. 4026** — **MEDIÇÃO DE CONTRATOS: REDESIGN DO DIÁLOGO "ITENS DO BOLETIM" + INTEGRAÇÃO COM COMPRAS PARA DETECTAR OCs DE FD E TRAZER O VALOR AUTOMATICAMENTE.** Usuário pediu redesign moderno do diálogo (estava confuso) e integração com Compras para achar OCs de Faturamento Direto (FD) da obra/contrato e puxar o valor sem digitação manual. Diálogo reconstruído: cards de resumo (Bruto/FD/Líquido) fixos no topo, banner de procedência dos dados, coluna "Origem" por linha (Cronograma vs FD Compras), zebra striping, botão de excluir linha na edição. Novo botão "Vincular FD de Compras" abre lista de OCs de FD disponíveis (`medicao.listarOcsFdDisponiveis`, filtra `modalidadeFd IN (fd_cliente/fd_terceiro/fd_fc)`, status ≠ cancelada, `valorEfetivo` = fdValor>0 ? fdValor : total, marca `jaVinculada`); "Selecionar" cria o registro de FD e insere linha `isFd:true` automaticamente no boletim (mesmo cálculo de `deducaoFd` já existente, sem lógica nova). Backend: `criarFdRegistro` ganhou `origem: "compra"` + `compraId` opcional, reaproveitando coluna `compraId` que já existia sem uso em `medicao_fd_registros`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4025** — **MEDIÇÃO DE CONTRATOS: "IMPORTAR DO ORÇAMENTO (COM AVANÇO FÍSICO)" NÃO TRAZIA NENHUM ITEM — PASSA A IMPORTAR DIRETO DO CRONOGRAMA.** Usuário reportou zero itens importados; esclareceu depois que o objetivo real é o avanço semanal do Planejamento fluir automaticamente para a Medição casado com a atividade certa do Cronograma, não do Orçamento. Causa-raiz em duas camadas: (1) Orçamento e Cronograma têm EAP com granularidade/numeração diferentes por natureza (casamento por código quase nunca encontra par); (2) mesmo trocando a fonte pro Cronograma, `eap_codigo` em `planejamento_atividades` só vem preenchido numa fração das atividades reais (ex.: 11 de ~230 no projeto validado) — o resto vem `''` (não NULL), e a query antiga colapsava dezenas de atividades diferentes numa única chave vazia. Fix: importação agora itera as atividades-folha do Cronograma direto, valor contratual = `pesoFinanceiro% × valorTotalContrato` (mesma lógica de "Crono. Financeiro"); `getAvancosParaMedicao`/`getAtividadesProjeto` casam avanço físico/medido por `atividade_id` (chave primária real, 1:1) em vez de `eap_codigo`, e usam sempre a mesma revisão aprovada do projeto. Validado: 211/211 atividades com avanço casam corretamente (antes: 15/148). Botão renomeado para "Importar do Cronograma (avanço físico)". ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4023** — **MEDIÇÃO DE CONTRATOS: DROPDOWN "PROJETO / OBRA" CORTAVA NOMES LONGOS NO DIÁLOGO "NOVO CONTRATO DE MEDIÇÃO".** Fix escopado em `MedicaoContratos.tsx`: `SelectContent` ganhou `max-w-[min(28rem,calc(100vw-2rem))]`, `SelectItem` ganhou `whitespace-normal break-words leading-snug py-2`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4022** — **FINANCEIRO/DRE: OPÇÃO DE CONSOLIDAR O MÊS MANUALMENTE.** Nova tabela `financial_dre_consolidacoes`; procedures `getDREConsolidacaoStatus`/`consolidarDRE`/`desconsolidarDRE` (admin/admin_master); tela DRE ganha botão "Consolidar Mês" e selo de consolidação manual. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4021** — **FINANCEIRO/SEFAZ: DANFE MOSTRANDO "XML COMPLETO NÃO DISPONÍVEL" — CAUSA-RAIZ E BOTÃO MANUAL "DAR CIÊNCIA DA OPERAÇÃO E BUSCAR XML COMPLETO".** Causa-raiz: nota chegou via SEFAZ só como resumo (`resNFe`) — o XML completo (`nfeProc`) não é liberado ao destinatário em boa parte das UFs até que ele registre o evento "Ciência da Operação" (tpEvento 210210, ato neutro, não confirma nem recusa a compra); o sistema só suportava Confirmação/Recusa/Desconhecimento. Nova função `buscarXmlPorChave` reaproveita o SOAP builder `buildSoapEnvelopeByChave` (existia mas nunca era chamado) pra consultar a NF-e específica pela chave (consChNFe) e salvar o XML se liberado. Nova mutation `sefaz.darCienciaEBuscarXml` envia a Ciência e, na sequência, tenta puxar o XML completo. Botão "Dar Ciência da Operação e buscar XML completo" no aviso âmbar de "Financeiro > Notas Fiscais > Recebidas", disparado manualmente por nota (nunca automático em lote — é um ato oficial junto ao governo). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4019** — **COMPRAS: SUGESTÃO AUTOMÁTICA DE CARTÃO DE CRÉDITO NA COTAÇÃO/OC + VÍNCULO AUTOMÁTICO OC↔FATURA DO CARTÃO PARA CONCILIAÇÃO.** Novo campo `escopo` em `financial_cartoes` ("fc" = titularidade da empresa | "local" = obra/particular) — só cartões "fc" entram na sugestão de Compras. `cartao.resumoParaCompra` ranqueia cartões elegíveis por ciclo de fatura + limite disponível estimado; `CartaoDisponivelCard` exibido em Cotação/OC ao selecionar "Cartão" (sugestivo, usuário pode trocar). Campo `cartaoId` em `compras_cotacoes`/`compras_ordens`/`compras_cotacao_fornecedores`, herdado automaticamente Cotação→OC. Vínculo automático: `compra_oc_id`/`compra_oc_numero` em `financial_cartao_itens`, casado por valor+janela de data na importação da fatura (`importarConfirmar`); tela "Financeiro > Cartão de Crédito" ganhou seletor de Escopo no cadastro + coluna "OC vinculada" na lista de itens. "SOS" do pedido original confirmado como typo de "OS ou OC". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4018** — **COMPRAS: BUG DE CASA DECIMAL "MUDANDO SOZINHA" NA QUANTIDADE — CAUSA-RAIZ E FIX (Item 6) + FECHAMENTO DOS ITENS 1 (BDI) E 4 (UPLOAD IA NO CADASTRO DE ITEM) DOS ~20 AJUSTES DO DOCX.** Causa-raiz: `Solicitacoes.tsx` consolidava itens duplicados da SC somando quantidade em ponto flutuante puro, gerando artefatos tipo `0.30000000000000004`; corrigido com `Math.round(x*1000)/1000`. Itens 1 e 4 fechados sem mudança de código (já cobertos). ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4015 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
