---
name: Fluxo de Caixa — baldes por plano de contas
description: Classificação das Saídas na matriz usa origem_modulo + fallback CONTA_RULES sobre conta_nome
---
Regra: `bucketDespesa(origem, contaNome)` no Fluxo de Caixa classifica primeiro por `origem_modulo` (BUCKET_MAP); se não mapear, cai no fallback `CONTA_RULES` — lista ORDENADA de regex sobre `conta_nome` normalizado (sem acento, uppercase).

**Why:** milhões/ano em despesas criadas pela conciliação do extrato têm `origem_modulo` NULL, mas o usuário classifica tudo no plano de contas. Sem o fallback, Folha/Benefícios ficavam vazios e "Outros" concentrava ~R$ 2,4 mi/mês.

**How to apply:** ao mexer nos baldes, preserve a ordem específico→genérico ("SEGURO DE VIDA"→benefícios antes de "SEGURO"→recorrente; "MATERIAIS PARA OBRA"→compras antes de "OBRA"→obras; "MEDICAO PJ"→terceiros antes de "MEDICAO"→obras). Novas contas de alto valor que caírem em "outros" → adicionar regra específica, nunca relaxar as genéricas.
