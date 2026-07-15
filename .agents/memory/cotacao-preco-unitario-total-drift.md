---
name: Cotacao preco_unitario vs total drift
description: preco_unitario (4dp) × qty ≠ resp.total salvo; recomputar de preco*qty causa drift; usar resp.total para itens não-alterados.
---

## Regra

Nunca recomputar `preco_unitario × quantidade` para itens que o usuário não alterou. O `total` armazenado em `compras_cotacao_respostas` é o valor correto; o `preco_unitario` com 4 casas decimais é um arredondamento do preço original, então `preco_unitario * qty ≠ total` salvo.

## Por que

Exemplo real (cotação 691, forn 895, item 7096): `preco_unitario = "1481.03"` (arredondado de ~1481.0278 no momento do salvamento), `quantidade = 18`. Recomputar: `1481.03 × 18 = 26658.54`. Total salvo: `"26658.49"`. Diferença = 5 centavos. Somando 812 itens, o drift acumulado resulta em +R$ 0,05 exibido no dialog.

## Como aplicar

No branch de **edição** do `fornTotal` (dialog Condições de Pagamento em Cotacoes.tsx):

```ts
// Sem alteração → fonte autoritativa
if (curPreco === origPreco && curQty === origQty && origResp?.total) {
  return acc + Math.round(parseFloat(origResp.total) * 100);
}
// Com alteração → recomputa do novo preço
const preco = parseFloat(curPreco) || 0;
const qty   = parseFloat(curQty) > 0 ? parseFloat(curQty) : parseFloat(it.quantidade);
return acc + Math.round(preco * qty * 100);
```

No branch de **não-edição**: usar `parseFloat(fornP.totalOrcado)` diretamente.

No backend (`totaisPorFornecedor`): acumular `Math.round(n(r.total) * 100)` em centavos inteiros — nunca somar floats diretamente.
