---
name: QR Verificar Aptidão — live, não snapshot
description: Endpoint público do QR deve calcular aptidão ao vivo; employee_aptidao é snapshot manual defasado.
---

A tabela `employee_aptidao` é um SNAPSHOT populado apenas pelo recálculo manual
(sprint1Foundation.recalcAll) — na prática fica vazia/defasada. Qualquer leitor
de aptidão (QR público, dashboards) deve calcular AO VIVO de `asos`/`trainings`
(deletedAt IS NULL, companyId do funcionário, dataValidade >= hoje), com a
semântica canônica apto|inapto do recalcAll.

**Why:** o QR do crachá mostrava "PENDENTE" tudo-vermelho para funcionário com
documentação em dia porque lia a snapshot.

**How to apply:** ao adicionar novo consumidor de aptidão, espelhar as regras do
recalcAll, nunca ler a snapshot. Página pública é LGPD-sensível: só ASO +
treinamentos com validade; sem RG, CPF completo, nascimento ou atestados.
QR usa URL com ID numérico (design pré-existente, crachás já impressos) —
enumeração é risco conhecido; follow-up: token opaco no QR.
