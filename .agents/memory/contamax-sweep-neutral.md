---
name: CONTAMAX é sweep de liquidez diária
description: Aplicação automática do banco (aplica saldo à meia-noite, devolve no dia seguinte) — nunca tratar como reserva, aporte ou investimento.
---

Regra: linhas "APLICACAO CONTAMAX" / "RESGATE CONTAMAX AUTOMATICO" / "CANCELAMENTO RESGATE CONTAMAX" são sweep — o MESMO dinheiro indo e voltando diariamente. Devem ficar fora de Saídas, fora da linha azul "Outras movimentações" e fora de qualquer narrativa de "reserva/resgates cobrindo déficit".

**Why:** o vai-e-vem (aplicado ≈ resgatado, ~3,4 mi/ano cada; rendimento ~R$ 11) inflava despesas e a linha azul, criando déficit fantasma e a falsa ideia de dinheiro guardado. Usuário confirmou o mecanismo (25/07/2026).

**How to apply:**
- Classificador de sweep no extrato deve exigir `%CONTAMAX%` + (APLIC|RESGAT) — filtro só por APLIC/RESGAT captura CDB/fundos REAIS (investimento de verdade, não sweep) de anos anteriores.
- Títulos gerados por conciliação dessas linhas devem ter `origem_modulo='aplicacao_financeira'` — e o backfill precisa cobrir TODAS as empresas do grupo (60002 e 60004), não só uma.
