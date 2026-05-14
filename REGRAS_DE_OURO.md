# 🏆 REGRAS DE OURO — ERP RH/DP FC Engenharia

> **Este arquivo é OBRIGATÓRIO de consulta antes de criar ou editar qualquer tela, modal, dashboard ou componente visual.**
> Ele é referenciado no `replit.md` e deve ser revisado a cada nova feature.
> Quando descobrir um padrão recorrente que vale como regra, **adicione aqui**.

---

## R-001 · Modais e telas full-screen (NÃO NEGOCIÁVEL)

**Toda tela nova OU antiga que abrir um modal de detalhe / análise / drilldown deve ocupar a tela inteira.**

- ✅ Mobile (`<sm`): `w-[100vw] h-[100dvh] rounded-none border-0` — **full bleed**, sem cantos arredondados, sem borda
- ✅ Desktop (`≥sm`): `w-[98vw] h-[96dvh] max-w-none rounded-lg border` — quase tela cheia, com cantos suaves
- ✅ **SEMPRE** passar `resizable={false}` no `<DialogContent>` da shadcn — caso contrário, ele injeta `style={{ width: 'min(512px, ...)' }}` inline e mata as classes Tailwind
- ✅ **SEMPRE** passar `showCloseButton={false}` quando o header já tem um botão X próprio (evita dois X visíveis)
- ✅ Usar `100dvh` (dynamic viewport) e NÃO `100vh` — respeita a barra de URL/notch dinâmica do iOS Safari/iPad
- ✅ Layout interno em **flex-col** com header `shrink-0`, body `flex-1 overflow-auto` e footer `shrink-0`

**Template de referência**:
```tsx
<DialogContent
  resizable={false}
  showCloseButton={false}
  className="w-[100vw] sm:w-[98vw] max-w-none h-[100dvh] sm:h-[96dvh] max-h-[100dvh] sm:max-h-[96dvh] p-0 gap-0 overflow-hidden flex flex-col rounded-none sm:rounded-lg border-0 sm:border"
>
  <div className="bg-gradient-to-r ... text-white p-4 sm:p-6 ... shrink-0">{/* header */}</div>
  <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5 bg-slate-50/40">{/* body scrollável */}</div>
  <div className="border-t bg-white px-4 sm:px-6 py-3 ... shrink-0">{/* footer */}</div>
</DialogContent>
```

**Componentes de referência (já corretos)**:
- `client/src/components/TabelaComparativaAnual.tsx` (Rev 1779b)
- `client/src/pages/dashboards/DashCartaoPonto.tsx` `IndicadorDetalheModal` (Rev 1780b)

---

## R-002 · Visual rico, nunca chapado

- ✅ **Header com gradient** colorido por contexto (azul=info, verde=ok, laranja=alerta, vermelho=crítico, roxo=especial)
- ✅ **Ícones grandes** (lucide-react) — `h-6 w-6` mínimo no header, `h-4 w-4` em badges/labels
- ✅ **Badges/chips** para status, contagens e filtros (não usar texto solto)
- ✅ **KPI cards** com borda + sombra leve + número grande tabular-nums
- ✅ **Linhas/cards clicáveis** com hover state visível e `focus-visible:ring` para navegação por teclado
- ❌ Evitar telas com fundo cinza chapado, texto solto, sem hierarquia visual

---

## R-003 · Tailwind JIT-safe (cores dinâmicas)

- ❌ NUNCA usar template literals para classes: `bg-${cor}-500` — Tailwind JIT não reconhece e a classe não vai pro CSS final
- ✅ SEMPRE usar lookup estático em `Record<string, ...>`:
  ```ts
  const COR_CLASSES: Record<string, { bg: string; text: string; gradient: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", gradient: "from-blue-500 to-blue-600" },
    red: { bg: "bg-red-50", text: "text-red-700", gradient: "from-red-500 to-red-600" },
    // ...
  };
  ```

---

## R-004 · Responsividade obrigatória

- ✅ Toda tabela `<md` deve virar **cards stacked**
- ✅ Toda toolbar deve quebrar em colunas no mobile (`flex-col sm:flex-row`)
- ✅ Modais full-screen em mobile (R-001)
- ✅ Texto e padding escalando: `text-sm sm:text-base`, `p-3 sm:p-5`
- ✅ Testar no iPad (768-1024px) — é o device principal do usuário

---

## R-005 · Acessibilidade básica

- ✅ Linhas/cards clicáveis: `tabIndex={0}`, `role="button"`, handler para Enter/Space
- ✅ `aria-label` em botões só com ícone
- ✅ `focus-visible:ring-2` em todos os elementos interativos
- ✅ `title=` em truncamentos para revelar texto completo no hover

---

## R-006 · pt-BR em toda comunicação

- ✅ Todas as labels, mensagens, toasts, modais, comentários de código em português brasileiro
- ✅ Datas formato `dd/MM/yyyy`, mês curto `Jan/26`, valores `Number.toLocaleString("pt-BR")`
- ✅ Moeda `R$ X.XXX,XX` (vírgula decimal)

---

## R-007 · Imports lucide-react sem duplicação

- ❌ NÃO ter dois `import { ... } from "lucide-react"` no mesmo arquivo — Babel reclama de duplicate declaration mesmo se nomes diferentes
- ✅ Consolidar TODOS os ícones em UM ÚNICO import por arquivo
- ✅ Verificar antes de adicionar novos ícones se já não estão importados em outro bloco

---

## R-008 · Gestão de revisões

- ✅ Bumpar `shared/version.ts` (`APP_VERSION`, `APP_VERSION_NUMBER`)
- ✅ Adicionar entry **completa** (com causa-raiz, arquivos, linhas, decisões) no fim do array em `shared/changelog.ts`
- ✅ Atualizar `replit.md` com versão **curta** (1-3 linhas) e remover a 6ª mais antiga
- ✅ Nunca duplicar conteúdo entre `replit.md` e `shared/changelog.ts`

---

## R-009 · Nunca expor secrets

- ❌ Nunca logar, ecoar ou exibir valores de variáveis de ambiente sensíveis
- ❌ Nunca fazer `console.log(process.env.X)` para tokens, senhas, keys
- ✅ Usar a skill `environment-secrets` para gerenciar; nunca tentar ler/escrever secrets manualmente

---

## R-010 · Defensive coding em SQL/Drizzle

- ✅ Sempre usar aspas duplas em colunas camelCase no `WHERE` SQL bruto: `WHERE "dataAdmissao" >= ...`
- ✅ Sempre filtrar `deleted_at IS NULL` em soft-deletes
- ✅ Sempre filtrar `companyId` (multi-tenant) — usar helper `companyWhere`
- ✅ Joins com `LEFT JOIN` quando o lado direito pode não existir (evita perda silenciosa de linhas)

---

## Checklist obrigatório antes de marcar uma tarefa como pronta

- [ ] Modal/tela é full-screen (R-001)?
- [ ] Visual rico, com gradient/badges/ícones (R-002)?
- [ ] Cores via lookup estático (R-003)?
- [ ] Responsivo no iPad e mobile (R-004)?
- [ ] Acessível por teclado (R-005)?
- [ ] Textos em pt-BR (R-006)?
- [ ] Sem imports lucide duplicados (R-007)?
- [ ] Version bumped + changelog + replit.md atualizados (R-008)?
- [ ] Sem exposição de secrets (R-009)?
- [ ] SQL com aspas em camelCase + soft-delete + companyId (R-010)?
