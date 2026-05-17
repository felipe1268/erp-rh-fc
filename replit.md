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

> **Convenção OBRIGATÓRIA (não negociável)** — este arquivo guarda APENAS as últimas **5 revisões** em formato detalhado (o quê + por quê + arquivos tocados). As 10 revisões seguintes aparecem como one-liner com título curto. Demais revisões vão para `replit-history.md`.
>
> **Ao criar uma nova revisão**:
> 1. Adicionar o bloco detalhado da NOVA revisão no TOPO.
> 2. Pegar o bloco mais ANTIGO dos 5 detalhados e converter pra one-liner curto na seção "Revisões recentes".
> 3. Se a seção "Revisões recentes" passar de 10 itens, mover o mais antigo pra `replit-history.md`.
> 4. NUNCA deletar parcialmente um bloco. Linhas órfãs sem prefixo `- ` são bug.
> 5. NUNCA usar marcadores HTML do tipo `<!-- DETALHES -->` (banidos na Rev. 1958).
>
> O histórico completo (causa-raiz, stack traces, arquivos tocados, comentários longos) vive em `shared/changelog.ts`. Esta convenção é validada visualmente: cada linha do bloco deve começar com `- ` (hífen+espaço).

### Top 5 detalhadas

- **Rev. 2046**: **SST · Integração de Segurança · Configurações · botão "Carregar Regras de Ouro" + 12 perguntas-padrão semeadas no único módulo existente.** Pedido direto do usuário (img IMG_0893 + vídeo INTEGRAÇÃO FC ENGENHARIA): "Faça as perguntas, conforme o vídeo, quero perguntas simples para um servente responder... mas as regras de ouro devem ter perguntas". A tela pública mostrava "Questionário · Nota mínima: 70% · 0/0 respondidas" e o botão "Enviar Respostas" ficava sempre desabilitado porque o módulo "Integração FC ENGENHARIA" estava com ZERO perguntas. **Solução em 3 partes**: (A) Server `server/routers/integracaoSST.ts` — constante `PERGUNTAS_REGRAS_OURO` com 12 perguntas em linguagem simples (servente, baixa escolaridade), 3 alternativas cada (1 correta), cobrindo NR-6 (EPI), NR-35 (altura/cinto/ancoragem), NR-33 (espaço confinado), NR-10 (elétrica), NR-18 (escavação), NR-11/12 (içamento/bloqueio LOTO), álcool/drogas, sinalização (fita zebrada), quase-acidente e comportamento (brincadeira). Novo handler `semearPerguntasPadrao({companyId, moduloId})` idempotente (TRPCError CONFLICT se módulo já tem perguntas), cross-tenant (`assertCompanyAccess` + WHERE no `sstIntegracaoModulos.companyId`), try/catch com INTERNAL_SERVER_ERROR genérico. (B) Client `client/src/pages/sst/IntegracaoSST.tsx` — botão "🎯 Carregar Regras de Ouro" (border emerald, outline) aparece no card do módulo APENAS quando `mod.perguntas?.length === 0`; tooltip explica as 12 perguntas-padrão; Loader2 durante mutation; toast com contagem em sucesso. (C) SQL DML (INSERT — não destrutivo, R-001/R-007/R-010 OK) executado direto no único módulo existente (company_id=60002, modulo_id=1) para resolver o caso do print: 12 perguntas + 36 alternativas inseridas via CTE com `UNNEST WITH ORDINALITY` (preserva ordem das alternativas). + `shared/version.ts` → 2046. **R-001/R-007/R-010 OK**: ZERO ALTER/DROP/DELETE; só INSERT (reversível via DELETE WHERE modulo_id=1). Multi-tenant validado em todos os handlers. Sem schema change. Sem novas deps. **Preservado**: Rev. 2045 (AlertDialog) INTACTA; Rev. 2044 (excluir/editar/multi-seleção) INTACTA; handler `salvarPerguntas` original INTACTO (continua editando perguntas existentes); UI de edição manual INTACTA — botão só adiciona forma rápida pra módulos vazios. **Follow-up**: (1) variações por função (eletricista, soldador, operador de máquina); (2) imagens/ícones por alternativa (NR-1.7 capacitação de semi-alfabetizados); (3) banco de perguntas reutilizável mantido pelo admin_master; (4) embaralhar ordem das alternativas na tela pública pra evitar cola.
- **Rev. 2045**: **SST · Integração de Segurança · aba Histórico · confirmação de exclusão via AlertDialog (substitui window.confirm).** Pedido direto do usuário (img IMG_0892): "Arrume a mensagem". O `window.confirm` nativo mostrava o domínio completo do Replit (`b41aedae-...-1frshksuex6ym.picard.replit.dev diz`) antes da mensagem — feio, dominava o popup no iPad e quebrava em 3 linhas. Já era o follow-up #1 da Rev. 2044. **Solução**: AlertDialog do shadcn (já existia em `client/src/components/ui/alert-dialog.tsx`) controlado por estado local `confirmExcluir: {ids, titulo, descricao} | null`. Ambos os fluxos (excluir 1 / excluir N) abrem o mesmo dialog passando `ids[]` + textos contextuais. **Mudança** em 2 arquivos (~40L, ZERO servidor): (A) `client/src/pages/sst/IntegracaoSST.tsx` — imports `AlertDialog*` adicionados; novo state `confirmExcluir`; `excluirSelecionados`/`excluirUm` só setam o state (não chamam mutate direto) com pluralização correta ("1 registro" vs "N registros", "O colaborador volta" vs "Os colaboradores voltam"); novo `<AlertDialog>` controlado com AlertDialogAction vermelho disparando `mutate` + `onSettled` (fecha em sucesso E em erro); `onOpenChange` bloqueado enquanto pending; Cancel/Action `disabled` + spinner Loader2; 2 `window.confirm` removidos. (B) `shared/version.ts` → 2045. **R-001/R-007/R-010 OK**: ZERO mudança server-side, ZERO SQL/schema, ZERO mudança de contrato tRPC. Sem novas deps (AlertDialog já estava instalado). **Preservado**: Rev. 2044 (excluir + editar + multi-seleção) INTACTA — só a CAMADA de confirmação mudou; handlers server `excluirRegistros`/`atualizarRegistro` INTACTOS; soft-delete + reaparição em Pendentes INTACTOS; Dialog de edição de obra INTACTO. **Follow-up**: (1) fatiar `ids` em lotes ≤500 no client pra alinhar com Zod (pendente da Rev. 2044); (2) restaurar soft-deleted dos últimos 30d com botão undo; (3) botão "Refazer agora" direto na linha (delete + abre tela pública num clique).
- **Rev. 2044**: **SST · Integração de Segurança · aba Histórico · editar/apagar registros + múltipla seleção; ao excluir, colaborador volta automaticamente para "Pendentes".** Pedido direto do usuário (img IMG_0891): "Quero poder editar, apagar e múltipla seleção, e quando eu apagar o usuário, volta a ficar pendente. Para refazer a integração". A aba Histórico mostrava só leitura. **Solução em 2 camadas**: (A) Server `server/routers/integracaoSST.ts` — 2 handlers novos: `excluirRegistros({companyId, ids[]<=500})` faz soft-delete via `deletedAt=NOW()` com guard `assertCompanyAccess` + filtro `isNull(deletedAt)` no WHERE pra ON CONFLICT em já-deletados; `atualizarRegistro({companyId, id, obraId|null})` edita só `obraId` (status/nota/respostas imutáveis pelo cliente — pra "refazer" exclui) validando que a obra ∈ mesma company (defesa cross-tenant). Try/catch com `console.error` + INTERNAL_SERVER_ERROR genérico (sem vazar err.message — lição Rev. 2042 follow-up #4). (B) Client `IntegracaoSST.tsx` HistoricoTab reescrito (~150L) — coluna de checkbox + master no header com `indeterminate` via ref; botão "Excluir N selecionado(s)" (variant destructive, aparece com seleção); botão Trash2 + Edit por linha; Dialog de edição com Select de obras (`trpc.obras.listActive`) + opção "— Sem obra —"; `window.confirm` antes de excluir avisando que volta pra Pendentes; toast de sucesso explica o mesmo; linha selecionada ganha highlight `bg-emerald-50/60`; tabela ganha `overflow-x-auto` (iPad). + `shared/version.ts` → 2044. **"Volta a ficar pendente"**: zero código novo — `listarPendentesAuto` (Rev. 2034) já filtra `isNull(deletedAt)`, então soft-delete faz o colaborador reaparecer automaticamente. **Mudança** em 3 arquivos (~230L). **R-001/R-007/R-010 OK**: ZERO ALTER/DROP/DELETE físico — "excluir" é soft-delete (UPDATE deletedAt=NOW), reversível via `UPDATE ... SET deleted_at = NULL`. Multi-tenant: assertCompanyAccess em ambos os handlers + WHERE com companyId. **Preservado**: Rev. 2043/2042/2041/2040/2039/2038/2034 INTACTAS; `listarRegistros` INTACTO (já filtrava soft-deleted, registros excluídos somem da UI). **Follow-up**: (1) AlertDialog shadcn em vez de `window.confirm` (Safari iPad às vezes bloqueia); (2) "Restaurar" registros excluídos nos últimos 30d com botão undo; (3) editar mais campos (observação, origem, data) com auditoria; (4) botão "Refazer agora" direto na linha (delete + abre tela pública).
- **Rev. 2043**: **SST · Integração de Segurança · "Iniciar agora" · pula passo de identificação por CPF quando RH já selecionou o colaborador.** Pedido direto do usuário (img IMG_0890): "Se eu já cliquei no nome do funcionário não precisa pedir os dados de novo, pq o ERP já deveria saber". Após Rev. 2042 corrigir o servidor, a tela pública abria no step "1/5 · Identificação · Digite seu CPF" — redundante quando o RH iniciou pelo botão da aba Pendentes (já sabia o CPF do registro criado). **Solução** (sem nova rota / sem mudar contrato público): o link agora vira `/integracao/{token}?cpf={cpf}&auto=1` quando vem do "Iniciar agora" (escopo: só `pendingWindowRef` ativa — RH iniciou); a tela pública detecta `?cpf=` no mount via `URLSearchParams`, abre já em "boasvindas" e dispara `buscarPorCpf.refetch()` num `useEffect` com ref-guard de single-fire; cobre 3 retornos (`pronto` → fica em boasvindas; `ja_aprovado` → pula pra resultado; `sem_config` → volta pro step cpf com erro inline); em caso de exceção, graceful degradation pro step cpf com toast da msg real. **Mudança** em 3 arquivos (~50L em 3 hunks): `client/src/pages/sst/IntegracaoSST.tsx` (~7L — link condicional com `?cpf=...&auto=1`), `client/src/pages/sst/IntegracaoPublica.tsx` (~40L — parse URL, estado inicial autodetect, useEffect com ref-guard), `shared/version.ts` → 2043. **R-001/R-007/R-010 OK**: ZERO ALTER/DROP/DELETE, ZERO mudança de schema, ZERO mudança de contrato server (`buscarPorCpf` continua exigindo CPF — só passamos automaticamente). **Preservado**: Rev. 2042 INTACTA; Rev. 2041/2040/2039/2038 INTACTAS; fluxo "colaborador recebe link via WhatsApp" INTACTO (continua exigindo CPF — defesa contra link compartilhado pra pessoa errada); validação CPF↔token no servidor INTACTA. **Segurança**: CPF vaza no histórico do navegador do RH + logs de proxy; aceitável porque (a) RH já vê CPF na tela; (b) link é one-shot pra esta integração; (c) token continua sendo a chave secreta. **Follow-up**: (1) `window.history.replaceState` logo após mount pra limpar `?cpf=` da barra; (2) avaliar endpoint `obterPorToken` sem CPF pra origem="manual" do RH; (3) QR Code com esse link auto-iniciado no modal pra escanear no celular do colaborador.
- **Rev. 2042**: **SST · Integração de Segurança · "Iniciar agora" · CAUSA-RAIZ encontrada: SELECT usava coluna inexistente `employees.nome` (correto é `employees.nomeCompleto`).** Pedido direto do usuário (img IMG_0889 — graças à tela de erro inline da Rev. 2041 ficou visível): "Não foi possível iniciar a integração — Cannot convert undefined or null to object". **Causa-raiz** (1 letra de diferença que custou 3 revisões): o handler `criarRegistro` em `server/routers/integracaoSST.ts` tinha `nome: employees.nome` no SELECT, mas a coluna real do schema é `nomeCompleto`. Como `employees.nome` retorna `undefined` no objeto drizzle, ao construir `{id, nome: undefined, cpf, funcao}` o `db.select({...})` lançava "Cannot convert undefined or null to object" internamente. A `listarPendentesAuto` (Rev. 2034) já usava `employees.nomeCompleto` certo — só o `criarRegistro` ficou com o nome errado desde a versão original. **Mudança** em 1 arquivo (`server/routers/integracaoSST.ts`, ~32L em 3 hunks): SELECT em `criarRegistro` (L505) `employees.nome` → `employees.nomeCompleto` (FIX da causa-raiz); MESMO FIX em `criarRegistrosEmLote` (L563) e `listarRegistrosParaLote` (L790) — 2 bugs latentes flagrados pelo code-review/architect (iam explodir o lote inteiro/o registro avulso com o mesmo erro); wrap em try/catch com `console.error("[criarRegistro] FAIL", {input, userId, err, stack})` pra debug futuro; TRPCErrors re-throwed (preserva código), outros viram INTERNAL_SERVER_ERROR com mensagem real (intencional pra debug temporário — ver follow-up #4); coerção explícita de tipos no `values` do insert (Number/String/?? null) como defesa em profundidade. + `shared/version.ts` → 2042. **R-001/R-007/R-010 OK**: ZERO ALTER TABLE / DROP / DELETE. 1 arquivo server-side. Sem novas deps. **Preservado**: Rev. 2041 (tela de erro inline) INTACTA — graças a ela achamos a causa; Rev. 2040/2039/2038 INTACTAS; esquema do banco INTACTO. **Follow-up**: (1) ✅ auditoria global feita — só restavam 2 ocorrências no próprio `integracaoSST.ts`, ambas corrigidas nesta rev; (2) renomear `nomeCompleto` → `nome` no schema com migration OU adicionar alias `nome` no drizzle pra fechar a porta de vez; (3) tipagem TS estrita no campo (drizzle aceita qualquer chave indexada, undefined passa silenciosamente); (4) **segurança**: trocar `INTERNAL_SERVER_ERROR` com `err.message` cru por mensagem genérica + ID de correlação (architect flagou OWASP A03 — pg pode vazar nomes de coluna/FK pro cliente).
### Revisões recentes (one-liners)

- ~~Rev. 2041~~ — SST Integração "Iniciar agora": BUGFIX "abre e fecha sozinho" — janela de splash agora mostra mensagem de erro DENTRO dela em vez de fechar. Ver `shared/changelog.ts`.
- ~~Rev. 2040~~ — SST Integração "Iniciar agora": hardening try/catch + console.error pra capturar "Cannot convert undefined or null to object" no iniciarAgora. Ver `shared/changelog.ts`.
- ~~Rev. 2039~~ — SST Integração "Iniciar agora": BUGFIX pop-up blocker Safari/iPad — window.open síncrono + splash inline + redirect no onSuccess. Ver `shared/changelog.ts`.
- ~~Rev. 2038~~ — SST Integração aba Pendentes: botão "Iniciar agora" inicia direto (cria registro + abre tela pública) + nova tela de Boas-vindas antes dos vídeos. Ver `shared/changelog.ts`.
- ~~Rev. 2037~~ — DP Biblioteca: NOVO artigo "Memorial de Cálculo — DSR". Ver `shared/changelog.ts`.
- ~~Rev. 2036~~ — SST Integração aba Pendentes (Rev. 2034) agora filtra "funcionários fantasma" — exclui soft-delete, lista negra e demitidos com status inconsistente. Ver `shared/changelog.ts`.
- ~~Rev. 2035~~ — SST Integração: pontuação vai pro Raio-X do Funcionário + certificado de aprovação em PDF (público e re-emissão no Raio-X). Ver `shared/changelog.ts`.
- ~~Rev. 2034~~ — SST Integração aba Pendentes: novo bloco "Sem integração válida" listando TODOS CLT/PJ/Terceiros que precisam fazer/renovar (24 meses). Ver `shared/changelog.ts`.
> Revisões anteriores à 2031: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (ver convenção acima — Top-5 detalhado + 10 recentes em one-liner).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
