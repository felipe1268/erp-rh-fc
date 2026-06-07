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

## Reservas ÓRFÃS (cotação excluída)

Segunda fonte de reserva-lixo além da OC-gerada: a cotação foi **excluída** mas a reserva ficou presa em "ativa" (criadas antes dos ganchos de liberação por exclusão, ou por caminho de exclusão que não as soltou). O LEFT JOIN não acha a cotação → a tela mostra o fallback `#<cotacaoId>`.

**Regra:** reserva só faz sentido enquanto a cotação **existe** E está aberta sem OC. Cotação inexistente = órfã → liberar (status "liberada", NUNCA deletar; histórico fica auditável).

**Como detectar/curar** (`_autoLiberarReservasOrfas(companyId)`): pega cotacaoIds distintos das reservas "ativa", consulta `comprasCotacoes` (inArray+companyId) e libera as que não retornarem. `compras_cotacoes.id` é serial PK global e NÃO tem soft-delete (`deletedAt`), então "não existe = órfã" está correto; ainda assim filtre por companyId.

**Wrapper `_autoSanearReservas(companyId)`** roda as DUAS auto-baixas (OC-gerada + órfãs) em try/catch e é o que os 3 self-heals (`_statusTravamentoCompras`, `getSaldosRealocacaoGeral`, `listarReservasAtivas`) chamam. Idempotente (só toca "ativa" em ambas as camadas: scanner e liberador).
