---
name: Folha Complementar (complemento "por fora")
description: Regras da folha complementar — separada da folha oficial; título único; ajustes por competência.
---
- A folha OFICIAL NÃO soma `valorComplemento` (as somas em financial.ts/dashboards/bridge são só projeções e rescisão complementar — manter).
- Folha Complementar (Rev. 4894/4895): card próprio na tela Folha de Pagamento; lista `recebeComplemento=1` + `valorComplemento>0`, CLT, status não-terminal; Afastado = excluído com nota.
- Proporcional: admissão no meio do mês (dias reais do mês) + faltas a /30 (Súmula 431); faltas de `timecard_daily` statusDia='registrado'.
- Ajuste manual por competência em `folha_complementar_ajustes` (UNIQUE companyId+mes+employee) — decisão de RH sobrevive à regeneração.
- Título ÚNICO no Contas a Pagar: origem_modulo='folha_complementar', origem_descricao='Folha Complementar MM/AAAA'; dedup atômico via índice único parcial `uq_fin_entries_folha_compl` + ON CONFLICT DO NOTHING; título com baixa = intocável.
- Tenant guard: `assertFolhaComplAccess` (getCompaniesForUser) em todas as procedures.
