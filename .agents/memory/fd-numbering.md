---
name: Numeração de FD (Painel FD)
description: Como o número FD-001 do Painel FD é gerado e por que é derivado, não persistido.
---

# Número de FD (FD-001, FD-002…) é DERIVADO, não persistido

O "Nº FD" exibido nos Lançamentos do Painel FD NÃO é uma coluna no banco. É calculado em runtime: as OCs FD (modalidade IN fd_cliente/fd_terceiro/fd_fc, status != cancelada) de UMA obra são ordenadas por `data`/`criadoEm` asc (desempate por `id`) e numeradas 1,2,3… com zero-pad 3 (`FD-001`).

**Onde:** `getSaldoFd` (obra específica) e `getSaldoFdTodasObras` (consolidado, agrupa por obraId) em `server/routers/compras.ts`. A regra é IDÊNTICA nos dois → o mesmo lançamento recebe o MESMO nº de FD nas duas visões. Qualquer novo writer/listagem de OCs FD que exiba "Nº FD" deve repetir essa regra (por obra, mesma ordenação) ou os números divergem.

**Why:** o usuário pediu "FDs numeradas começando por 001". Optou-se por derivar (sem ALTER/coluna nova — regra de ouro FC proíbe ALTER/DROP/DELETE).

**Ressalva (consequência aceita):** por ser posicional, cancelar uma OC FD (sai da lista) REINDEXA os FDs posteriores daquela obra (FD-003 vira FD-002). Se algum dia precisar de nº IMUTÁVEL por lançamento, exige coluna persistida (ADD COLUMN via self-heal `[SyncSchema+]`) + atribuição no momento da criação da OC FD.
