---
name: Levantamento offline sync — corridas da fila
description: Regras para não perder edições/fotos na fila offline do levantamento (sincronizarLote)
---

Regras (Rev. 4812):

1. **Op editada em voo nunca é apagada pelo ack.** O processQueue envia um payload; se a op for editada (merge de vínculo, medida) enquanto o lote viaja, o ack é do payload antigo. Antes de qualquer deleteOp/putOp pós-resposta (ok/conflito/erro/catch), reler a op atual e, se `atualizadoEm` mudou, mantê-la `pending` para reenvio — nunca sobrescrever com a versão pré-voo.
2. **Foto referencia contorno por UUID, não só id.** Contorno recém-desenhado tem id temporário NEGATIVO (hash determinístico do uuid: `h=(h*31+code)|0; -abs(h)-1`). A op de foto leva `contornoUuid`; o servidor resolve via mapa uuid→serverId do mesmo lote, lookup por uuid no banco, ou fallback recalculando o hash (ops legadas).
3. **Ordem de dependência no lote:** contornos → pdf → fotos → deletes.
4. `sincronizarLote` precisa de `assertCompanyAccess`; contornoId positivo vindo do client deve ter ownership validada (mesma empresa + campo).

**Why:** usuário perdia foto E vínculo "do nada" após tirar foto e vincular item durante sync automática.
**How to apply:** qualquer novo tipo de op na fila do levantamento segue as 4 regras; qualquer novo campo referenciando entidade pendente deve carregar o uuid junto.
