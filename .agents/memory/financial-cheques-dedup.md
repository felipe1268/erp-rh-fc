---
name: Controle de Cheques — dedup natural
description: Chave de deduplicação do importador de cheques e por que o mês entra nela.
---

# Dedup do importador de Controle de Cheques

A chave de dedup natural do importador de cheques (`financial_cheques`) é
`(company, numero_cheque, valor_centavos, ano_ref, mes_ref)` — o **mês entra na chave**.

**Why:** dois cheques DISTINTOS podem ter o mesmo nº + valor em meses diferentes do
mesmo ano (talões/contas bancárias diferentes reusam numeração). Sem `mes_ref` na chave,
o segundo seria descartado como "já existe" (falso-positivo) e o controle perderia o cheque.
Incluir o mês não quebra a idempotência do re-upload porque cada cheque vive em UMA única
aba mensal da planilha.

**How to apply:** qualquer mudança em `carregarExistentes`/`chaveDedup` (server/routers/cheques.ts)
deve manter `mes_ref` na chave dos DOIS lados (existentes do banco + linhas parseadas).

## Layout da planilha (validado empiricamente — 2026: 492 cheques, R$ 3.374.599,61)
- Abas mensais JAN..DEZ; aba consolidada "Cheques" é template vazio → ignorada.
- Header na linha 1 (0-idx); **dados a partir do índice 3** (linhas 0–2 são header/espaço).
  O parser começa em `i=3` — isso é correto pelos números validados, NÃO um off-by-one.
- Valor/data lidos como SERIAL do Excel (raw), nunca pelo texto (evita troca dia/mês US M/D/YY).
- Cheque NÃO vira lançamento (Opção A): é só registro de controle/consulta.
