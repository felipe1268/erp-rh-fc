---
name: Client-driven AI batching (Gerar preços)
description: Stateless batched LLM loops driven from the client need a stall guard when the cursor doesn't advance, or they spin to MAX_ITER with a false "done".
---

# Client-driven stateless LLM batching — stall guard

Long AI jobs (e.g. "Gerar preços" em EQUIPAMENTOS PRÓPRIOS) são feitos por LOTE,
100% stateless: o cliente roda um loop de `mutateAsync`, cada call processa um lote
e devolve `totalCombos`/`combosAnalisados`/`itensAtualizados`/`haMaisLotes`/`proximoOffset`.

**Regra:** quando a paginação NÃO avança o cursor (modo "só sem valor" fica em
`offset=0` e depende do conjunto encolher só quando a IA grava), um lote CHEIO que
grava ZERO (`itensAtualizados===0`) com `haMaisLotes` ainda true vai re-buscar os
MESMOS itens do topo na próxima iteração → loop até o cap (`MAX_ITER`) e barra de
progresso em 100% FALSO.

**Why:** o `haMaisLotes = totalCombos > lote.length` continua true enquanto houver
itens não-precificáveis no topo; sem cursor avançando, não há saída natural.

**How to apply:** todo loop client-driven com cursor que SÓ avança via efeito
colateral (gravação) precisa de um guard de estagnação: detectar "lote cheio sem
progresso real" e encerrar cedo com aviso/toast warning, não com "concluído". No
modo em que o offset AVANÇA sempre (sobrescrever), o loop termina sozinho — guard
não é necessário lá.
