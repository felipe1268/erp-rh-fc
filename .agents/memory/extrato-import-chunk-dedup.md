---
name: Importação de extrato — dedup × chunks
description: Contrato do dedup na importação de extrato bancário em 2 fases (chunks de 40) e como duplicatas legítimas sobrevivem
---

A importação de extrato em 2 fases envia linhas em chunks de 40 para `insertBankStatementBatch`. O dedup do server é por chave `data|descricao|valor|saldo??""`.

**Regras (Rev. 4692/4692b):**
1. Duplicatas legítimas (2× PIX mesmo dia/valor/descrição) partidas entre chunks eram perdidas: o chunk seguinte via a 1ª já no banco e pulava a 2ª. Fix: client envia `dupKeyTotais` (total por chave no ARQUIVO INTEIRO) e o server usa `batchTotal = max(chunkCount, fileTotal)`.
2. **O total deve ser contado sobre TODAS as linhas do arquivo (`data.linhas`/`fg.linhas`), nunca sobre `normalLinhas`**: a fase de checagem (`checkStatementDuplicates`) já desconta ocorrências existentes no banco; contando só as sobreviventes o server vê `db >= total` e pula a reimportação da faltante.
3. Server valida `dupKeyTotais` (inteiro, 2..500) — client forjado não infla o teto.

**Why:** extrato do hotel (Santander jan/2026) importou 455/458 e fev 314/317; o usuário exige 100% de fidelidade ao PDF — repetições de mesmo valor/CPF são movimento real.

**How to apply:** qualquer novo caminho de importação de extrato (novo formato, nova tela) que faça chunking precisa propagar `dupKeyTotais` do arquivo inteiro; verificação fim-a-fim = parser × `bank_statement_lines` por chave com contagem (multiset), não por COUNT simples.
