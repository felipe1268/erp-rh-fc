---
name: Banco de Horas — múltiplos tipos de débito discriminados
description: convenção para adicionar novos tipos de débito automatizado ao ledger banco_horas_lancamentos sem quebrar totais existentes
---

`banco_horas_lancamentos.tipo` é `text()` livre (sem CHECK constraint no schema), então novos valores
de `tipo` (ex: `'debito_atraso_falta'`, `'debito_dsr'`) não exigem migration — mas TODO consumidor que
filtra por `tipo === "debito"` estritamente (telas, totalizadores, relatórios) precisa ser revisado ao
adicionar um novo tipo automatizado, senão o valor some dos totais "Débito" mesmo debitando o saldo
corretamente.

**Padrão para novo tipo de débito automatizado (mirror de Rev. 3977/3983):**
1. Batch array próprio acumulado durante o loop de folha (não reusar o array de outro tipo).
2. Bloco de reversão idempotente ANTES do recálculo, chaveado por `tipo='<novo_tipo>'` +
   `descricao LIKE 'Marcador ${mesReferencia}%'` (mesma competência = idempotente entre reruns).
3. Bloco de INSERT em `banco_horas_saldo` (upsert do saldo) + `banco_horas_lancamentos` (histórico),
   após o loop principal, com a MESMA condição de elegibilidade (empresa usa banco de horas E
   funcionário sem exceção `banco_horas_excecao`).
4. Frontend: filtros de total (`tipo === "debito"`) devem virar `tipo !== "credito"` para não perder
   os tipos redirecionados; badges/cores dedicados por tipo ajudam o usuário a discriminar a origem.

**Why:** o DSR perdido (Lei 605/49) tem regra de QUANDO se perde (1/semana com falta, calculada em
`pontoDescontos.ts`) totalmente separada de QUANTO vale (440min fixos = 220h/30d) e de PARA ONDE vai o
valor (dinheiro vs. banco de horas). Ao redirecionar um novo tipo de desconto pro banco de horas,
mude só o destino — nunca a regra de elegibilidade/quantidade, que mora em outro arquivo.
