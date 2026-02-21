# Bug de Concatenação dos Selects

## Causa raiz
O `SelectTrigger` na linha 43 envolve `{children}` em `<span className="truncate">`.
O `SelectValue` do Radix renderiza o placeholder como texto interno do componente.
Quando `value` é passado como `undefined` (via `form.sexo || undefined`), o Radix mostra o placeholder.
Mas quando o valor existe no form mas NÃO corresponde a nenhum SelectItem, o Radix renderiza o valor bruto + placeholder juntos.

## Solução
O problema real é que os dados no banco têm valores como "masculino" (minúsculo) mas os SelectItem usam "M".
Ou "Solteiro(a)" mas o SelectItem usa "Solteiro".
Quando o valor não bate com nenhum SelectItem, o Radix mostra o valor bruto concatenado com o placeholder.

Preciso:
1. Normalizar os valores ao carregar no openEdit (mapear valores antigos para novos)
2. Garantir que `value` nunca seja um valor que não existe nos SelectItems
