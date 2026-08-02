---
name: Medição de terceiros paga é imutável
description: Regra LGPD/ISO 9001 — medição com baixa ativa no título não pode ser alterada/excluída; só admin master com senha destrava (volta completa)
---

Regra (pedido do usuário, LGPD/ISO 9001): medição de terceiros com PAGAMENTO baixado (baixa ativa em `financial_entry_baixas` do título origem `terceiro_medicao`) é IMUTÁVEL — não pode ser editada, cancelada nem excluída. O status da medição pode continuar "aprovada" mesmo paga (a pill "Paga" é derivada do título), então **checar baixa ativa, não o status**.

**Como aplicar:** todo write path novo de medição deve chamar `_assertMedicaoSemBaixaAtiva(db, medicaoId, companyId)` (terceiroContratos.ts). Única exceção: `cancelarAprovacao` com `senhaMaster` (validada por `_assertMasterComSenha` — admin_master + bcrypt) → o servidor faz a volta completa ATÔMICA (transação + advisory lock 478001): soft-estorna baixas → deleta título → desaprova (gera REV). Nunca abrir atalho que apague direto.

**Why:** apagar medição paga sem desfazer o financeiro gera caos (título/baixa órfãos) e fere auditoria; o caminho inverso preserva o histórico do estorno.

Gotcha: `registrarPagamento` (terceiroContratos) era endpoint legado sem tenancy — hardened com companyId + assertCompanyAccess; não reintroduzir versão sem guard.
