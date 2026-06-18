---
name: Cronograma Financeiro = projeção live do orçamento × cronograma
description: Como a tela "Cronograma Financeiro" (Financeiro) deve calcular receita/custo previstos e por que NÃO ler o ledger.
---

A tela **Cronograma Financeiro** (previsão de faturamento × custo × resultado por obra) calcula AO VIVO em `getCronogramaFinanceiro` (server/routers/financial.ts), NÃO lê `financial_entries`.

- **Receita Prevista = VENDA do orçamento** (`COALESCE(NULLIF(valor_contrato,0), orc.valor_negociado, orc."totalVenda", … orçamento mais recente da obra via LATERAL)`).
- **Custo Previsto = CUSTO do orçamento** (`orc."totalCusto"`).
- Ambos distribuídos pelas atividades-folha da revisão (mais recente aprovada→senão a última): `frac = peso/Σpeso`, repartido igualmente entre os meses `data_inicio→data_fim`.
- **Realizado**: receita = `planejamento_medicoes.valor_medido`; custo = despesas pagas EXCLUINDO `origem_modulo='cronograma_atividade'`.

**Por que NÃO ler o ledger:** as entradas `financial_entries` com `origem_modulo='cronograma_atividade'` são a PROJEÇÃO do contrato = a **VENDA** distribuída gravada como `tipo='despesa'` (ver `cronograma-atividade-projecao-custos.md`). Ler isso fazia o "Custo Previsto" mostrar a venda e a receita ficar R$ 0,00.

**GOTCHA — peso_financeiro NÃO soma exatamente 100% por revisão** (visto: 99,9979% / 99,9999%). Qualquer distribuição financeira a partir do cronograma DEVE:
1. **Normalizar** por `peso/Σpeso` (não `peso/100`), senão o total fica abaixo do orçamento (perde milhares).
2. **Carregar o resto de arredondamento no ÚLTIMO mês** de cada projeto/obra, senão a soma dos meses arredondados não bate o orçamento à vírgula.

**Why:** pedido do piloto FC exigia "nenhum centavo de diferença" entre a tela e o orçamento. Validado contra o Neon: diff R$ 0,00.

**How to apply:** ao mexer em qualquer agregado financeiro derivado do cronograma físico-financeiro (Curva S, REFIS, projeções), use Σpeso real como denominador + remainder no último período. Tenant-guard `_assertFinanceiroCompanyAccess(ctx.user, input.companyId)` é obrigatório em todo endpoint do router financeiro.
