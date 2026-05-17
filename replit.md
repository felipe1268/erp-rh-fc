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

- **Rev. 2044**: **SST · Integração de Segurança · aba Histórico · editar/apagar registros + múltipla seleção; ao excluir, colaborador volta automaticamente para "Pendentes".** Pedido direto do usuário (img IMG_0891): "Quero poder editar, apagar e múltipla seleção, e quando eu apagar o usuário, volta a ficar pendente. Para refazer a integração". A aba Histórico mostrava só leitura. **Solução em 2 camadas**: (A) Server `server/routers/integracaoSST.ts` — 2 handlers novos: `excluirRegistros({companyId, ids[]<=500})` faz soft-delete via `deletedAt=NOW()` com guard `assertCompanyAccess` + filtro `isNull(deletedAt)` no WHERE pra ON CONFLICT em já-deletados; `atualizarRegistro({companyId, id, obraId|null})` edita só `obraId` (status/nota/respostas imutáveis pelo cliente — pra "refazer" exclui) validando que a obra ∈ mesma company (defesa cross-tenant). Try/catch com `console.error` + INTERNAL_SERVER_ERROR genérico (sem vazar err.message — lição Rev. 2042 follow-up #4). (B) Client `IntegracaoSST.tsx` HistoricoTab reescrito (~150L) — coluna de checkbox + master no header com `indeterminate` via ref; botão "Excluir N selecionado(s)" (variant destructive, aparece com seleção); botão Trash2 + Edit por linha; Dialog de edição com Select de obras (`trpc.obras.listActive`) + opção "— Sem obra —"; `window.confirm` antes de excluir avisando que volta pra Pendentes; toast de sucesso explica o mesmo; linha selecionada ganha highlight `bg-emerald-50/60`; tabela ganha `overflow-x-auto` (iPad). + `shared/version.ts` → 2044. **"Volta a ficar pendente"**: zero código novo — `listarPendentesAuto` (Rev. 2034) já filtra `isNull(deletedAt)`, então soft-delete faz o colaborador reaparecer automaticamente. **Mudança** em 3 arquivos (~230L). **R-001/R-007/R-010 OK**: ZERO ALTER/DROP/DELETE físico — "excluir" é soft-delete (UPDATE deletedAt=NOW), reversível via `UPDATE ... SET deleted_at = NULL`. Multi-tenant: assertCompanyAccess em ambos os handlers + WHERE com companyId. **Preservado**: Rev. 2043/2042/2041/2040/2039/2038/2034 INTACTAS; `listarRegistros` INTACTO (já filtrava soft-deleted, registros excluídos somem da UI). **Follow-up**: (1) AlertDialog shadcn em vez de `window.confirm` (Safari iPad às vezes bloqueia); (2) "Restaurar" registros excluídos nos últimos 30d com botão undo; (3) editar mais campos (observação, origem, data) com auditoria; (4) botão "Refazer agora" direto na linha (delete + abre tela pública).
- **Rev. 2043**: **SST · Integração de Segurança · "Iniciar agora" · pula passo de identificação por CPF quando RH já selecionou o colaborador.** Pedido direto do usuário (img IMG_0890): "Se eu já cliquei no nome do funcionário não precisa pedir os dados de novo, pq o ERP já deveria saber". Após Rev. 2042 corrigir o servidor, a tela pública abria no step "1/5 · Identificação · Digite seu CPF" — redundante quando o RH iniciou pelo botão da aba Pendentes (já sabia o CPF do registro criado). **Solução** (sem nova rota / sem mudar contrato público): o link agora vira `/integracao/{token}?cpf={cpf}&auto=1` quando vem do "Iniciar agora" (escopo: só `pendingWindowRef` ativa — RH iniciou); a tela pública detecta `?cpf=` no mount via `URLSearchParams`, abre já em "boasvindas" e dispara `buscarPorCpf.refetch()` num `useEffect` com ref-guard de single-fire; cobre 3 retornos (`pronto` → fica em boasvindas; `ja_aprovado` → pula pra resultado; `sem_config` → volta pro step cpf com erro inline); em caso de exceção, graceful degradation pro step cpf com toast da msg real. **Mudança** em 3 arquivos (~50L em 3 hunks): `client/src/pages/sst/IntegracaoSST.tsx` (~7L — link condicional com `?cpf=...&auto=1`), `client/src/pages/sst/IntegracaoPublica.tsx` (~40L — parse URL, estado inicial autodetect, useEffect com ref-guard), `shared/version.ts` → 2043. **R-001/R-007/R-010 OK**: ZERO ALTER/DROP/DELETE, ZERO mudança de schema, ZERO mudança de contrato server (`buscarPorCpf` continua exigindo CPF — só passamos automaticamente). **Preservado**: Rev. 2042 INTACTA; Rev. 2041/2040/2039/2038 INTACTAS; fluxo "colaborador recebe link via WhatsApp" INTACTO (continua exigindo CPF — defesa contra link compartilhado pra pessoa errada); validação CPF↔token no servidor INTACTA. **Segurança**: CPF vaza no histórico do navegador do RH + logs de proxy; aceitável porque (a) RH já vê CPF na tela; (b) link é one-shot pra esta integração; (c) token continua sendo a chave secreta. **Follow-up**: (1) `window.history.replaceState` logo após mount pra limpar `?cpf=` da barra; (2) avaliar endpoint `obterPorToken` sem CPF pra origem="manual" do RH; (3) QR Code com esse link auto-iniciado no modal pra escanear no celular do colaborador.
- **Rev. 2042**: **SST · Integração de Segurança · "Iniciar agora" · CAUSA-RAIZ encontrada: SELECT usava coluna inexistente `employees.nome` (correto é `employees.nomeCompleto`).** Pedido direto do usuário (img IMG_0889 — graças à tela de erro inline da Rev. 2041 ficou visível): "Não foi possível iniciar a integração — Cannot convert undefined or null to object". **Causa-raiz** (1 letra de diferença que custou 3 revisões): o handler `criarRegistro` em `server/routers/integracaoSST.ts` tinha `nome: employees.nome` no SELECT, mas a coluna real do schema é `nomeCompleto`. Como `employees.nome` retorna `undefined` no objeto drizzle, ao construir `{id, nome: undefined, cpf, funcao}` o `db.select({...})` lançava "Cannot convert undefined or null to object" internamente. A `listarPendentesAuto` (Rev. 2034) já usava `employees.nomeCompleto` certo — só o `criarRegistro` ficou com o nome errado desde a versão original. **Mudança** em 1 arquivo (`server/routers/integracaoSST.ts`, ~32L em 3 hunks): SELECT em `criarRegistro` (L505) `employees.nome` → `employees.nomeCompleto` (FIX da causa-raiz); MESMO FIX em `criarRegistrosEmLote` (L563) e `listarRegistrosParaLote` (L790) — 2 bugs latentes flagrados pelo code-review/architect (iam explodir o lote inteiro/o registro avulso com o mesmo erro); wrap em try/catch com `console.error("[criarRegistro] FAIL", {input, userId, err, stack})` pra debug futuro; TRPCErrors re-throwed (preserva código), outros viram INTERNAL_SERVER_ERROR com mensagem real (intencional pra debug temporário — ver follow-up #4); coerção explícita de tipos no `values` do insert (Number/String/?? null) como defesa em profundidade. + `shared/version.ts` → 2042. **R-001/R-007/R-010 OK**: ZERO ALTER TABLE / DROP / DELETE. 1 arquivo server-side. Sem novas deps. **Preservado**: Rev. 2041 (tela de erro inline) INTACTA — graças a ela achamos a causa; Rev. 2040/2039/2038 INTACTAS; esquema do banco INTACTO. **Follow-up**: (1) ✅ auditoria global feita — só restavam 2 ocorrências no próprio `integracaoSST.ts`, ambas corrigidas nesta rev; (2) renomear `nomeCompleto` → `nome` no schema com migration OU adicionar alias `nome` no drizzle pra fechar a porta de vez; (3) tipagem TS estrita no campo (drizzle aceita qualquer chave indexada, undefined passa silenciosamente); (4) **segurança**: trocar `INTERNAL_SERVER_ERROR` com `err.message` cru por mensagem genérica + ID de correlação (architect flagou OWASP A03 — pg pode vazar nomes de coluna/FK pro cliente).
- **Rev. 2041**: **SST · Integração de Segurança · "Iniciar agora" · BUGFIX "abre e fecha sozinho": janela de splash agora mostra mensagem de erro DENTRO dela em vez de fechar.** Pedido direto do usuário (img IMG_0888): após Rev. 2040, ao clicar "Iniciar agora" a janela abria com splash "Preparando a integracao de ANA…" e fechava sozinha em ~1-2s sem o usuário ver o motivo. **Causa-raiz**: o `onError` do `criarRegistro.useMutation` chamava `w.close()` na janela pendente, deixando o usuário sem feedback visível (toast de erro fica na aba ORIGINAL, mas o usuário tá olhando pra aba NOVA que fechou — parece bug aleatório). **Mudança** em 1 arquivo (`client/src/pages/sst/IntegracaoSST.tsx`, ~25L em 1 hunk): `onError` reescrito — em vez de `w.close()`, faz `w.document.open()` + `write` com tela de ERRO inline (caixa branca, ícone ⚠️, mensagem REAL do servidor, botão "Fechar" `window.close()`); `msg` extraído de `err.message || err.data.message || fallback`; `console.error("[criarRegistro] erro:", err)` adicionado; sanitização `[<>&]` na mensagem; try/catch no document.write (loga warning se janela morreu); toast.error continua disparando na aba original (defesa em profundidade). + `shared/version.ts` → 2041. **R-001/R-007/R-010 OK**: ZERO SQL/schema/router. 1 arquivo client-side. Sem novas deps. **Preservado**: Rev. 2040 (hardening try/catch no iniciarAgora) INTACTA; Rev. 2039 (open-blank-then-redirect) INTACTA; Rev. 2038 (boas-vindas + atalho) INTACTA; `onSuccess` INTACTO (segue navegando `w.location.href`); modal "Iniciar Integração" do header INTACTO. **Follow-up**: (1) capturar o `err.message` real (provavelmente "Colaborador não encontrado nesta empresa" — ANA pode estar em outra company que não a selecionada); (2) pré-validar companyId/employeeId no client antes de mutar; (3) botão "Reportar problema" na tela de erro que envia o stack pro RH.
- **Rev. 2040**: **SST · Integração de Segurança · "Iniciar agora" · BUGFIX hardening: erro genérico "Cannot convert undefined or null to object" silencioso.** Pedido do usuário (img IMG_0887): toast "Cannot convert undefined or null to object" ao clicar "Iniciar agora". Mensagem genérica do JS engine sem stack — provavelmente em algum item de `pendentesAuto` com campo nulo ou no `emp.nome.split(" ")[0]` quando nome é null. **Mudança** em 1 arquivo (`client/src/pages/sst/IntegracaoSST.tsx`, ~25L em 1 hunk): tipo de `iniciarAgora` afrouxado (aceita `nome: string|null` e o próprio `emp` `null|undefined`); try/catch GERAL com `console.error` + stack + `toast.error` com mensagem real (em vez do toast genérico) + fecha janela pendente; early-return `toast.error("Colaborador inválido")` se `!emp || !emp.id`; `nome` normalizado via `String(emp.nome || "Colaborador").trim()`; `primeiroNome` com fallback + sanitização `[<>&"]` removida pra não quebrar `document.write`; `window.open` em try/catch separado; `document.write` em try/catch separado; aspas tipográficas (… → ..., "integração" → "integracao") removidas do splash pra evitar problemas de charset em about:blank antes do `<meta charset>` ser parseado. + `shared/version.ts` → 2040. **R-001/R-007/R-010 OK**: ZERO SQL/schema/router. 1 arquivo client-side. Sem novas deps. **Preservado**: Rev. 2039 (open-blank-then-redirect) INTACTA — só blindada; Rev. 2038 (boas-vindas + atalho) INTACTA; Rev. 2037 INTACTA; Modal "Iniciar Integração" do header INTACTO; `criarRegistro` server-side INTACTO. **Follow-up**: (1) investigar item específico de `pendentesAuto` que causou o erro (provavelmente CPF de teste "TESTE" ou colaborador com `nome IS NULL` no SELECT); (2) Sentry/log centralizado pra capturar console.error desses guards; (3) validar Zod no client antes do mutate pra mensagem de erro amigável.
### Revisões recentes (one-liners)

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
