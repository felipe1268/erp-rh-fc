---
name: Confirm-combo dual-state data loss
description: "Autocomplete combos that split typed-text vs confirmed-value silently drop free-typed input at save; fall back to the display text."
---

# Confirm-combo (LancCombo etc.) dual-state silently drops typed input

Several forms (ex.: Conciliação Caixa Interno em `FinanceiroConciliacao.tsx`) usam um combobox de
autocomplete que mantém DOIS estados:
- um texto VISÍVEL digitado (ex.: `lancFornDisplay`, `detEditFornDisplay`)
- um valor CONFIRMADO, preenchido só quando o usuário CLICA num item do dropdown
  (ex.: `lancForm.fornecedorNome`, `detEditForm.fornecedorNome`)

**Bug recorrente:** o save grava só o valor confirmado (`confirmado.trim() || undefined/null`). Se o
usuário só DIGITA um nome (não existe no cadastro, ou não clica no item), o valor confirmado fica
vazio e o texto digitado é descartado → coluna grava NULL → o registro perde o dado (ex.: lista cai
no fallback "Lançamento #id").

**Why:** confirmar no dropdown serve para LIGAR ao cadastro (FK/qualidade), mas a coluna de destino
costuma ser TEXTO livre (ex.: `fornecedor_nome` não tem FK). Exigir confirmação para PERSISTIR
transforma um "nice to have" em perda de dado silenciosa.

**How to apply:** no save, use o texto digitado como FALLBACK quando não há confirmação:
`confirmado.trim() || display.trim()` (→ undefined/null só quando AMBOS vazios, preservando o
"limpar"). Aplicar em TODO caminho de escrita do mesmo form (criar E editar — eles costumam vir aos
pares). Confirmar no dropdown continua opcional, só para vincular ao cadastro.
