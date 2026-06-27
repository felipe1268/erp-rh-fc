---
name: Diálogo de conciliação lê mapa de LOTE que zera
description: Cabeçalho de diálogo (cheque devolvido↔PIX/TED) lia um vincMap de lote sem placeholderData → "Vinculado R$ 0,00" enquanto o registrar (cobertura fresca) via o vínculo.
---

Em FinanceiroConciliacao.tsx o cabeçalho do diálogo "Vincular cheque devolvido a PIX/TED"
lia `vincMap`, um `getChequeDevolvidoVinculacao` em LOTE (chaveado por TODOS os cheques do
período). Esse lote zera `data` no 1º load e a cada refetch do report (refreshAposVinculo →
refetchReport → repDevol/vincItens mudam → lote refetcha), exibindo "Vinculado R$ 0,00".
Já o caminho de REGISTRAR usa cobertura FRESCA por linha → enxergava o vínculo → barrava com
"já vinculada". Contradição clássica: header lê fonte de lote volátil, write lê fonte fresca.

**Regra:** um cabeçalho/decisão de diálogo NÃO deve ler de uma query de LOTE chaveada por
muitos itens (volátil). Crie uma query DEDICADA chaveada só pelo item aberto e use-a como
fonte autoritativa (`info = dedicada ?? lote[id]`).

**Pegadinha placeholderData (RQ v5):** `placeholderData:(prev)=>prev` na query DEDICADA causa
stale cross-item ao TROCAR de item no diálogo (mostra números do item anterior até resolver,
e como `info` fica truthy o fallback por identidade nem roda). Solução: placeholderData SÓ no
LOTE (cobre o gap durante a troca); na dedicada NÃO (na troca de chave ela zera → cai pro
lote do item certo). Refetch da MESMA chave preserva `data` por padrão no RQ v5, então não
pisca 0 no fluxo normal.
