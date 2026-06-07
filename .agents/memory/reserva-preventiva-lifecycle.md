---
name: Reserva Preventiva — ciclo de baixa
description: Quando/como a reserva preventiva de Compras deve ser liberada (consumida) e a regra de negócio por trás.
---

# Reserva Preventiva (Realocação de Verba) — ciclo de baixa

A reserva preventiva (`compras_reservas_saldo`, status "ativa") só faz sentido **enquanto a cotação deficitária está em aberto**. Assim que QUALQUER OC é gerada para a cotação, a reserva deve ser liberada (baixa "consumida") — o saldo volta. Reservas "ativa" vencem em 7 dias (`RESERVA_PRAZO_DIAS`) e, se órfãs, entopem a tela de Realocação como "VENCIDA" e **travam novas OCs deficitárias** (via `_statusTravamentoCompras`/verificarTravamento).

**Regra (decisão do usuário):** liberar na GERAÇÃO da OC, não na entrega.

**Onde a baixa acontece** (`server/routers/compras.ts`): a função central é `_liberarReservasDaCotacao`. Ela é disparada em: cotação excluída/cancelada, última OC excluída, déficit coberto na Realocação (debitarDoRisco/confirmarRealocacao), OC com aprovação extra aprovada, e — desde a auto-baixa — diretamente nas rotas que GERAM OC (`criarOrdemDeCotacao` + `criarOCsParciais`) e via self-heal `_autoLiberarReservasComOcGerada` nos pontos de leitura/travamento.

**Why:** as rotas de criação de OC originalmente só BLOQUEAVAM (verificarTravamento) e nunca liberavam → gerar OC "saudável" deixava reserva órfã. Self-heal nos reads cura o backlog histórico (inclui resíduos de R$ 1,00).

**How to apply:** qualquer novo caminho que crie/finalize OC a partir de cotação deve liberar a reserva da cotação. `_liberarReservasDaCotacao` aceita `companyId` opcional — SEMPRE passe-o em chamadas novas (guarda de tenant: reserva é baixada por cotacaoId, que sem filtro de empresa abre risco cross-tenant, pois criarOrdemDeCotacao carrega a cotação só por id).
