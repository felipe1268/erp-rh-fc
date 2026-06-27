---
name: Cheque devolvido — cobertura por identidade
description: vínculo cheque devolvido ↔ PIX/TED não pode ancorar no id da linha do extrato (volátil); casar por identidade do cheque.
---

# Cobertura de cheque devolvido ↔ PIX/TED

Vínculos em `bank_cheque_vinculos.debito_line_id` NÃO podem usar o id da linha do
extrato (`bank_statement_lines.id`) como âncora de cobertura/dedup.

**Why:** re-imports de extrato recriam as linhas com NOVOS ids e soft-deletam as
antigas (rotação massiva). A linha-âncora de um vínculo vira órfã; o report passa
a escolher outro `debitoId` p/ o mesmo cheque e a cobertura lê 0 ("Vinculado
R$ 0,00" apesar de o vínculo existir).

**How to apply:** casar vínculos pela linha de débito EXATA OU pela IDENTIDADE do
cheque = valor absoluto igual + (mesmo `doc` OU mesmo `cheque_numero`, parseados
via `parseDocNumero`/`parseChequeNumero` da DESCRIÇÃO da linha de débito do
vínculo, lida por LEFT JOIN). Helpers `_coberturaChequeDevolvido` /
`_mesmoChequeDevolvido` em `server/routers/financial.ts`. Usar em registrar
(dup + saldo), estornar (re-cobertura) e `getChequeDevolvidoVinculacao` (query
traz TODOS os vínculos ativos da empresa, sem filtro `debito_line_id IN`).
Frontend: o `chq` do diálogo é REF CONGELADA na abertura; resolver o cheque VIVO
em `repDevol` (match por valorCents + doc/nº) antes de ler `vincMap`, senão a key
congelada some do mapa após refetch. Vincular segue READ-ONLY (nunca cria/altera
linha do extrato). `parseDocNumero` normaliza zeros à esquerda ("001063"→"1063").
