---
name: Dedup de extrato é case-insensitive
description: Chave de dedup da importação de extrato normaliza descrição (UPPER/TRIM) em server E client
---

Regra: as chaves de dedup da importação de extrato (3 builders em financial.ts + consultas COUNT com `UPPER(TRIM(descricao))=$4`) e os 2 builders de `dupKeyTotais` no client normalizam a descrição com trim().toUpperCase(). As chaves client/server PRECISAM casar.

**Why:** o mesmo extrato Santander reimportado veio ora "Cheque Emitido/debitado" ora "CHEQUE EMITIDO/DEBITADO"; a comparação exata deixou passar duplicatas que viraram linhas órfãs em "No extrato, sem lançamento".

**How to apply:** qualquer novo caminho de importação/dedup de bank_statement_lines deve usar a MESMA normalização nos dois lados; nunca comparar descrição crua. O INSERT continua gravando o texto original.
