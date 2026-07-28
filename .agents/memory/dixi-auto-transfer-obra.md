---
name: DIXI — transferência automática de obra pelo ponto
description: batida do relógio vale mais que a alocação; import DIXI transfere alocação automaticamente
---

Regra de negócio (usuário, 28/07/2026): a marcação do ponto é SEMPRE mais relevante que a obra de alocação. O import DIXI (dixiPonto.ts, bloco Rev. 4712) transfere o funcionário automaticamente para a obra do relógio via `allocateEmployeeToObra` (dataInicio = batida mais recente do arquivo).

**Why:** encarregados esquecem a transferência manual; ida e volta seguem o ponto.
**How to apply:**
- Batida atrasada NÃO desfaz alocação manual mais nova (compare dataInicio da alocação vs maxData, strings YYYY-MM-DD).
- 2 obras no MESMO dia: transfere mesmo assim, mas o alerta obra_ponto_inconsistencies fica PENDENTE p/ RH; sem conflito, resolve como 'transferido' (scoped por companyId+employee+obra+dataPonto — nunca bulk).
- Falha na transferência nunca derruba o import.
