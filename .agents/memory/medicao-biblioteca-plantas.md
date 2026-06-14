---
name: Biblioteca de plantas (Levantamento de Campo)
description: PDFs do levantamento vivem num medicao_campo "biblioteca" por (contrato, origem); find-or-create precisa de advisory lock.
---

A planta (PDF) do Levantamento de Campo é compartilhada por TODAS as medições do contrato via um `medicao_campo` dedicado: `status="biblioteca"`, `numero=0`, `medicaoId=NULL`, escopado por (companyId, contratoId, origem). PDFs + calibração vivem nele; contornos/fotos seguem por medição referenciando o `pdf.id` compartilhado.

**Regra:** a find-or-create da biblioteca (`resolverBibliotecaPlantas`) NÃO tem UNIQUE no schema (regra de ouro: zero ALTER). Sem serialização, duas abas criam 2 bibliotecas e o leitor (que pega a de menor id) "perde" PDFs gravados na outra.

**Why:** corrida real de concorrência num find-or-create sem unique constraint → duplicatas silenciosas + sumiço de plantas.

**How to apply:** serialize com `pg_advisory_xact_lock(companyId, contratoId*2 + origemBit)` dentro de uma transação (recheck após o lock). Qualquer outro find-or-create sem unique constraint neste projeto deve usar o mesmo padrão. `getCampo` virou read-path-que-escreve (roda a migração idempotente) → exige `assertCompanyAccess` explícito, não só `eq(companyId)`.
