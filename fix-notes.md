# Correções aplicadas

## Bug: Título "Órgão" no diálogo de edição
- Causa: Radix Dialog sem DialogDescription pegava o primeiro texto visível como aria-label
- Fix: Adicionado DialogDescription com classe sr-only em todos os 3 diálogos (edição, visualização, importação)

## Bug: Erro SQL ao atualizar colaborador
- Causa: Campos extras (empresa, listaNegra como string, obraAtualId como string) sendo enviados na query
- Fix: updateEmployee no db.ts agora valida campos contra whitelist, converte booleanos e inteiros

## Melhoria: Jornada de Trabalho separada
- Antes: campo texto livre "08:00 às 17:00"
- Depois: dois Selects (Entrada e Saída) com horários comuns pré-definidos
- O valor continua sendo salvo como "HH:MM às HH:MM" no campo jornadaTrabalho

## Melhoria: Campo Cargo removido
- O campo "Cargo" foi removido do formulário de edição (ficou apenas "Função")
- Adicionado Função e Setor na ficha de visualização
