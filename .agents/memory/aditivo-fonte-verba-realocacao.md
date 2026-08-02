---
name: Aditivo — fonte de verba via Realocação
description: Integração aditivo de terceiros ↔ pote de Realocação de Verba (Compras); marcadores e locks.
---
- Pote de saldo: `calcularSaldosRealocacaoGeral` exportado no fim de compras.ts (o procedure só delega). Soma créditos `origem_eap_item_nome LIKE 'Economia Contrato:%'` e desconta consumos `LIKE 'Saldo de Realocação (aditivo)%'` além de `Economia OC:%`.
- **Marcadores em budget_reallocations são contrato de dados**: crédito de encerramento = `Economia Contrato: <numeroContrato || id>` (chave SIMÉTRICA — reabrir via aditivo aprovado DELETA por essa mesma chave); consumo de aditivo = origem `Saldo de Realocação (aditivo)`. Mudar o texto quebra o saldo.
- **Locks**: 478005+contratoId (aditivo), 478006+companyId serializa leitura-de-saldo+consumo entre aprovações E encerramentos (sem ele, 2 sócios gastam o mesmo saldo 2×).
- Nunca bloquear: sem saldo o aditivo sobe; sócio aprova; `valor_coberto = min(saldo, valorTotal)`; descoberto = prejuízo consciente (badge vermelho/âmbar no card).
- `encerrarContrato` exige medições/aditivos pendentes resolvidos; sobra = valorTotal − Σ itens.valorMedidoAcumulado; idempotente (checa crédito existente). `gerarMedicao` bloqueia encerrado/cancelado/suspenso.
- **Why:** dinheiro não pode existir 2× (teto reaberto + crédito no pote) nem ser consumido 2× em corrida.
