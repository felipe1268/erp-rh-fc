---
name: DialogContent style prop vs maximize/resize
description: Passing a custom `style` to DialogContent used to wipe the internal sizeStyle (maximize/resize); now merged in ui/dialog.tsx — keep the merge order.
---

Regra: em `client/src/components/ui/dialog.tsx`, o `style` externo passado por um dialog é MESCLADO com o `sizeStyle`/`dragStyle` internos (maximizado: sizeStyle prevalece; normal: style externo prevalece).

**Why:** o spread `{...props}` vinha depois do atributo `style`, então qualquer dialog que passasse `style` (ex.: FichaEpiDialog com background branco) apagava o sizeStyle inteiro — o botão maximizar alternava o estado mas o tamanho não mudava ("não acontece nada" no iPad).

**How to apply:** ao mexer em DialogContent, preserve a desestruturação `const { style: styleProp, ...restProps } = props` e a ordem de merge condicional por `maximized`. Nunca reintroduzir `{...props}` cru depois de `style=`.

Bônus relacionado (iPad/Safari): Radix Select dentro de dialog rolável cortava o texto dos itens; padrão preferido do usuário = combobox digitável inline (Input + lista filtrada com break-words), como na Ficha de EPI.
