---
name: Fluxo de Caixa — conferência de duplicidades
description: Padrão da detecção de despesas duplicadas e das origens excluídas das Saídas.
---

- Detecção de pares duplicados por valor+janela SOZINHA é ruidosa (519 pares/1,9 mi); exigir também token de texto normalizado (12 primeiras letras, sem dígitos/símbolos) reduz a ~67 pares reais. Recorrências legítimas (aluguel etc.) ainda passam — por isso o humano confirma um a um.
- Pares descartados são marcados com tag `[dup-ok:<idPar>]` em `financial_entries.observacoes` (sem coluna nova); a query de pares exclui via NOT LIKE nos dois sentidos.
- Cancelamento por duplicidade é reversível: `status='cancelado'` + motivo com id do par; nada é apagado.
- Origens EXCLUÍDAS das Saídas do Fluxo de Caixa (e contadas na linha azul "outras movimentações"): `aplicacao_financeira` (Rev. 4580) e `transferencia_interna` (Rev. 4581 — PIX/TED ao próprio grupo). Qualquer nova tela de custo/saída deve considerar essas 2 origens.
**Why:** aplicação e transferência interna não são gasto — o dinheiro continua no grupo; somá-las cria déficit fantasma.
**How to apply:** ao mexer em buckets/splits de despesa ou criar relatórios de saída, filtrar essas origens; ao afrouxar/apertar o detector de duplicidade, manter o token de texto.
