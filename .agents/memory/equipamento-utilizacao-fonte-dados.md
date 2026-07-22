---
name: Equipamento utilização fonte de dados
description: A fonte real de utilização diária de equipamentos (próprios e locados) é warehouse_loans, não equipamento_locado_eventos.
---

## Regra

A tabela `equipamento_locado_eventos` (com tipos SAIDA_ALMOX / RETORNO_ALMOX) **nunca é populada** pelo fluxo normal do almoxarifado. O sistema de entrega/devolução de ferramentas grava em `warehouse_loans`.

## Link de join

```
warehouse_loans.item_id
  → almoxarifado_itens.id
      WHERE equipamento_vinculado_tipo IN ('locado', 'proprio')
      AND   equipamento_vinculado_id   = <equipamento.id>
```

`almoxarifado_itens.equipamento_vinculado_tipo` é setado quando o item é "marcado como equipamento" (Rev. 2404).

## Campos relevantes de warehouse_loans

- `data_emprestimo` (VARCHAR YYYY-MM-DD) — data da saída
- `hora_emprestimo` (VARCHAR HH:MM) — hora da saída
- `data_devolucao`  (VARCHAR YYYY-MM-DD, nullable) — data do retorno
- `hora_devolucao`  (VARCHAR HH:MM, nullable)
- `status` — `'emprestado'` (aberto) | `'devolvido'` | `'perdido'`
- `funcionario_nome` / `funcionario_id`
- `obra_id`
- `almoxarife_nome`

## Queries corrigidas (Rev. 4517)

- **`locadosUtilizacao`** — cycleRaw / idleRaw / emCampoRaw reescritos para JOIN warehouse_loans
- **`proprioRaioX`** — "Quem mais utiliza" via wlUsageRaw (GROUP BY funcionario_nome)
- **`locadoRaioX`** — wlRows incluídos na timeline e responsáveis

**Why:** Antes de Rev. 4517 todos os dashboards mostravam 0 em campo / "Sem movimentações" porque liam a tabela errada. O "Fechar Dia — Pendências de Devolução" (que mostra 60+ itens abertos) lê de warehouse_loans — essa é a fonte canônica.

**How to apply:** Qualquer nova query de utilização/histórico de equipamento deve fazer o JOIN via almoxarifado_itens.equipamento_vinculado_id, não via equipamento_locado_eventos.
