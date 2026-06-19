---
name: Vale snapshot stale para não-CLT
description: Por que PJ/Sócio recontratado ainda aparecia no card de Vale e como o ERP sanitiza
---

# Snapshot de Vale fica congelado e ignora mudança de contrato

`payroll_periods.valeResultJson` é um SNAPSHOT (coluna text) gerado em "Gerar Vale" e
IMUTÁVEL até a próxima geração. Se um funcionário muda de CLT→PJ/Sócio (recontratação)
DEPOIS da geração, o snapshot continua listando ele com adiantamento — `gerarVale`
filtra `tipoContrato='CLT'` só NO momento da geração, nada reconfere entre gerações.

**Regra de negócio:** PJ/Sócio/excluído NUNCA recebe vale, nem se forçado.

**How to apply:** Ao mexer em qualquer leitura/decisão de vale:
- Leitura: `getPeriod` sanitiza o snapshot na hora (READ-ONLY, recalcula
  totalFuncionarios/totalAlertas/totalVale; soma `valorLiquido` de `status==='calculado'`).
- Elegibilidade ATUAL vem de `getIdsInelegiveisVale(db, ids)` (lê `tipoContrato`/`deletedAt`
  correntes). Inelegível = PJ | Socio | deletedAt.
- **TODO caminho que promove um vale a `status='calculado'` E insere `financial_events`
  precisa da guarda dura**, não só um endpoint. São DOIS: `decidirVale` (pagar:true) e
  `reverterVale`. Ambos: inelegível → `rejeitado`+`bloqueado=1`, sem evento financeiro.
- Linha órfã em `payroll_advances` se auto-higieniza no próximo "Gerar Vale" (DELETE do
  mês + reinsert) — não precisa DELETE manual.

**Why:** o fix inicial só cobriu `decidirVale`; code review achou que `reverterVale` era
bypass (revertia um rejeitado p/ calculado e recriava o evento). Lição: garantia de
negócio sobre dinheiro saindo tem que cobrir TODOS os sinks, não o endpoint "óbvio".
