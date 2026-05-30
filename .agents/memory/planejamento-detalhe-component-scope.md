---
name: PlanejamentoDetalhe component scope
description: Sibling (not nested) components in PlanejamentoDetalhe.tsx do NOT share scope — pass shared memos as props
---

Em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` os blocos de tela
(`PlanejamentoDetalheInner` = main, `AvancoSemanal`, `Refis`, `CurvaS`,
`VisaoGeral`, etc.) são funções IRMÃS top-level, NÃO componentes aninhados.
Logo NÃO compartilham escopo léxico.

**Regra:** um `useMemo`/var definido no main e referenciado dentro de
`AvancoSemanal` (ou qualquer irmã) resolve para uma global inexistente em
runtime → `ReferenceError: Can't find variable: X`, derrubando a tela inteira.

**Por quê:** o esbuild (transform isolado, usado pra validar porque o tsc dá OOM)
NÃO pega esse erro — é escopo em runtime, não sintaxe. Só aparece ao abrir a tela.

**Como aplicar:** ao compartilhar um valor entre o main e uma sub-tela, defina-o
UMA vez no main e PASSE como prop (ex.: `previstoCurva={previstoCurva}` →
desestruturar na assinatura de `AvancoSemanal`). Nunca referencie var do main
direto dentro de uma irmã. Vale também pro inverso (ex.: `pvMacro` foi replicado
no main justamente porque a versão vivia em `AvancoSemanal` e `Refis` precisava).
