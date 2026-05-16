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

- **Rev. 1905**: **Planejamento · Programação Semanal LOTUS · PREVISTO (top azul) renderiza em TODAS as semanas até o último dia do projeto · cutoff vira "snapshot só do realizado"**. User (16/05/2026, screenshot UI Sem.3 [15-21/05] com header "Oficial 14/05" + grid 100% branco apesar das atividades terem previsto 04/05-22/05): "O PREVISTO DEVE APARECER TODAS AS SEMANAS DO CRONOGRAMA, ATÉ O ULTIMO DIA DO PROJETO". **Causa-raiz** (em `ProgramacaoSemanalLotus.tsx` L173-175 — `faixasCelula`): Rev. 1894 introduziu cutoff oficial (Padrão LOTUS/status-date PMBOK) mas o guard era agressivo demais — `if (ds > cutoff) return {null,null}` zerava AMBAS as faixas. Resultado: cutoff em 14/05 → Semana 3+ (15/05+) totalmente branca, sem nenhuma indicação de plano. Semântica errada: cutoff é "fotografia do REALIZADO até a data", não tem relação com o PLANEJAMENTO (que é fixo). **Mudança** (L176-190 + L266-270): removido early-return; flag `passouCutoff = ds > cutoff` calculada no início mas SEM bloquear. Lógica inteira de inPrev/inReal/passou/aderência roda normalmente — top recebe `bg-blue-800` para dia coberto pelo envelope mesmo se ds > cutoff. Post-process antes do return: `if (passouCutoff) bottom = null` — zera APENAS o realizado. version → 1905. **Resultado**: Semana 3+ mostra azul de previsto onde há envelope; plano LOTUS visível do início ao fim do projeto; cutoff continua restringindo realizado (PMBOK status-date OK). Sem cutoffIso, comportamento idêntico ao anterior. **Preservado**: Rev. 1894 cutoff semântica preservada p/ realizado; Rev. 1886 migração red→bottom intacta (antes do post-process); Rev. 1875/1893/1851 intactas; Rev. 1897/1904 reset BRANCO Excel intacto. Zero backend/DB/schema/cores. Reversível em 2 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1904**: **Planejamento · Programação Semanal LOTUS · Export Excel · FIX DEFINITIVO de azul previsto na 2ª célula + cutoff (template-bleed em r0+1/r0+2)**. User (16/05/2026, screenshot Excel cols J-O Sem.01 [01/05-07/05] pré-clipada a Mon-Thu): "O ERP AINDA NÃO TA RESPEITANDO A COR NA SEGUNDA CELULA EM AZUL DE PREVSITO.. E TBM NÃO ESTA RESPEITANDO A LINHA DE CORTE (CUTOFF).. RESOLVA ISSO EM DEFINITIVO..". **Causa-raiz** (em `ProgramacaoSemanalLotus.tsx` L1339-1456): convenção LOTUS Rev. 1897 = 4 céls/dia (r0=branco / r0+1=azul previsto / r0+2=status / r0+3=branco). Init L1206 usa `pattern:"none"` que NÃO REMOVE `fgColor` herdado do template em LibreOffice/Excel Online. Rev. 1897 cobriu APENAS r0/r0+3 com solid BRANCO — DEIXOU r0+1/r0+2 expostos ao vazamento. Nesta semana, `dias` clipada a 4 entradas (Mon-Thu, projetoStart=04/05); o `dias.forEach` pinta só cIdx 10-13. cIdx=14 (N=Sex sem data) ficou com cor residual em r0+1/r0+2 → (1) azul-fantasma em 2ª célula sem previsto real + (2) "paint vazando" além do cutoff visível. **Mudança** (L1404-1432, ANTES do dias.forEach): novo loop de RESET DEFINITIVO força `pattern:"solid"` + `fgColor:FFFFFFFF` em **TODAS as 4 linhas × cIdx 10-14** (Seg-Sex). O `dias.forEach` (intacto) só sobrescreve r0+1/r0+2 onde há corTop/corBot. REMOVIDO bloco defensivo Rev. 1897 pós-loop (redundante). Cols 15-16 (Sáb/Dom) preservadas pelo `pintaCinzaFds` Rev. 1893. version → 1904. **Resultado**: dias sem previsto = 100% brancos. Dias com previsto = azul (r0+1) + status (r0+2). Dias além do cutoff visível = 100% brancos. Convenção LOTUS 100% cross-viewer. **Preservado**: `faixasCelula` Rev. 1894 cutoff guard, migração Rev. 1886 red→bottom, cores Rev. 1895, init L1206, pintaCinzaFds Rev. 1893, diasExtras Rev. 1875/1893, reorder Rev. 1852. Zero backend/DB/schema. Reversível em 2 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1903**: **Planejamento · Atividades em Atraso · Impressão · ISOLAMENTO DEFINITIVO via display:none ancestor walk (REGRA DE OURO)**. User (16/05/2026, screenshot pág. 1 perfeita + pág. 2 com só "insumos conforme a NR-18" vazando no rodapé): "AJSUTE APRA CABER A INFORMAÇÃO DENTRO DA AREA DE IMPRESSÃO.. SEMPRE CENTRALIZADA, AJUSTADADA PARA EM TODOS OS PONTOS.. ARRUME ISSO DE FORMA DEFINITIVA.. É SUA REGRA DE OUTRO.. OK..". **Causa-raiz**: o isolamento Rev. 1899 era CSS-only com `visibility:hidden` no `body *` — `visibility:hidden` esconde mas MANTÉM as dimensões do layout. Resultado: modal fixed inset-0 + cards visíveis + sidebar + dashboard de fundo continuavam reservando altura no document body → `@page` A4 quebrava em pág. 2+ com texto residual aparecendo no rodapé. Centralização também falhava por causa do `position:absolute` (fora do flow). **Mudança** (em `PlanejamentoDetalhe.tsx` L2129+ rotina `dispararImpressao`): (A) CSS print reescrita: removidas as regras `visibility:hidden/visible`; `#atrasos-print-area` agora `position:static` + `display:block` + `margin:0 auto` (centraliza) + `width/max-width:100%` + `box-sizing:border-box`; `html, body { margin:0; padding:0; height:auto; overflow:visible }`. (B) JS de isolamento DEFINITIVO: walk de ancestrais a partir de #atrasos-print-area até <body>, em cada nível setando `display:none` inline em todos siblings (exceto SCRIPT/STYLE/LINK/META) e forçando ancestrais a `position:static / overflow:visible / height:auto / margin:0 / padding:0 / background:white`. Cada nó snapshotado via `getAttribute("style")` na `restoreList` (null quando sem style inline → `removeAttribute` no cleanup, sem `style=""` residual). Cleanup idempotente (flag `cleaned`), restaura ordem reversa, triggers `afterprint` once + safety 60s. version → 1903. **Resultado**: layout fora do print area é DELETADO → document body do tamanho exato do conteúdo → @page só quebra onde tem conteúdo real → zero página fantasma, zero vazamento, sempre centralizado. **Preservado**: densificação Rev. 1901 (grid 2-cols, paddings, fontes, DESVIO box), PrintHeader, rodapé, dedupe Rev. 1899, word-break, tela não-impressão idêntica (restauração 1:1). Zero backend/DB/schema. Reversível em 2 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1902**: **Planejamento · Cronograma · BUG FIX cascata de responsável em GRUPO com filhos denormalizados (EAP idêntico)**. User (16/05/2026, screenshot): pai "03.05 Mosaico" marcado como grupo + Input "JULIO FERRAZ" + 4 "Ajudante de pedreiro" abaixo também com EAP "03.05": "estou clicando na atividade MARCADA COM GRUPO, E AS ATIVIDADES ABAIXO DELA NÃO ESTÃO SENDO PREENCHIDAS COM O MESMO RESPONSAVEL QUE INDIQUEI NO GRUPO. VEJA QUE QANDO EU SALDO NÃO ACONTECE NADA.. ARRUME ISSO..". **Causa-raiz** (em `PlanejamentoDetalhe.tsx` L4296-4322 — onBlur do Input ciano `responsavelLotus`): detecção de descendentes estrita demais pra MSP "denormalizado" — L4306 guard de nivel quebra na 1ª linha (filhos herdam `nivel` do pai); L4308 `if (ceap === parentEap) continue` pula CADA filho com EAP idêntico ao do grupo. Resultado: `descIdxs.length === 0` → return → cascata nunca dispara. **Mudança** (L4324-4344): NOVO fallback ANTES do return — se `a.isGrupo && descIdxs.length === 0`, scan relaxado de `idx+1` empilhando TODAS as linhas até próximo `isGrupo` (fim do escopo) OU fim da lista (pula `disabled`). Semântica: "todas linhas abaixo do grupo, até o próximo grupo, são filhos lógicos". Depois cai no fluxo Rev. 1892 (auto-aplica via setLinhas + toast, sem modal). version → 1902. **Preservado**: detecção estrita Rev. 1865 (dotted+flat) intacta pro caso comum; fallback é específico de GRUPO — folhas com sub-itens seguem com modal Rev. 1860/1865 (3 opções) pra proteger contra mudança acidental; Input ciano Rev. 1823, Input âmbar Rev. 1641, badge Rev. 1898/1900 intactos. Zero backend/DB/schema/tRPC. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
- **Rev. 1901**: **Planejamento · Atividades em Atraso · Impressão DENSIFICADA (eliminar espaços em branco)**. User (16/05/2026, screenshot): "esta bagunçado muito espaço branco.. ajuste a tela para que tenha o minimo de espaços brancos.. quero a organização extremamemnte profissional". **Causa**: o CSS Rev. 1899 era conservador (1-col em retrato + padding 8-12px + DESVIO box 150-180px + barras 16px + space-y 12px); resultado: 4 pgs/10 cards = 2.5 cards/pg. **Mudança** (em `PlanejamentoDetalhe.tsx` L1949 + L2129-2238): (1) default `atrasosOrient`=`"landscape"` (era portrait); (2) `dispararImpressao` reescrita: grid 2-cols SEMPRE (retrato+paisagem), margens A4 8-10mm, font-base 9-9.5px, line-height 1.25, gap entre cards 4px, padding header 3x6px, padding body 4x6px, space entre barras 3px, altura barras 9px (era 16), DESVIO box min-w 56px (era 100) padding 3x6 número 14px (era 24), datas gap 10px, cascata de tamanhos (text-sm 9.5/text-xs 8.5/text-[11px] 8/text-[10px] 7.5/text-[9px] 7), badges header compactos. Resultado esperado: 4-6 cards/pg em paisagem, ~4 em retrato (era 2.5). version → 1901. **Preservado**: PrintHeader (REGRA DE OURO), conteúdo do relatório (datas/barras/% /desvio), tela não-impressão idêntica (tudo `@media print`), isolamento `visibility:hidden` Rev. 1899, refactor pós-architect (dispararImpressao local + dedupe + word-break). Zero backend/DB/schema. Reversível em 2 hunks + version bump. R-001/R-007/R-010 OK.
