---
name: Motor de crédito do convênio de parceiros
description: Regras fail-safe de limite mensal por colaborador nos parceiros conveniados e onde aplicá-las
---

Motor em `server/utils/creditoConvenio.ts`; regras ativas SÓ quando `parceiros_conveniados.limite_mensal_por_colaborador > 0` (vazio = parceiro fora do motor).

Regras (ordem): situação (DESLIGADOS + Afastado bloqueiam; Férias libera), carência por dataAdmissao (sem data = bloqueado; default 30d em `carencia_dias`), débito anterior (`travar_debito_anterior=1`: consumo APROVADO na competência anterior em QUALQUER parceiro + folha anterior sem `payroll_periods.pagamentoConsolidadoEm` = bloqueado), limite (pendente+aprovado do parceiro na competência).

**Why:** decisão do usuário (jul/2026) — modelo de crédito consignado; poka-yoke: QUALQUER erro na avaliação = bloqueado, nunca libera na dúvida.

**How to apply:** todo NOVO caminho de escrita em `lancamentos_parceiros` (create/edit, portal ou interno) deve chamar `avaliarCreditoColaborador` e gravar `competenciaDesconto` (regra 16→15). Em EDIÇÃO, só descontar o valor do próprio lançamento se colaborador E competência permanecem os mesmos (senão vira bypass por troca de data). Lançamento manual interno também dispara `criarUserAlert` para todos os `admin_master` (informativo, não bloqueante).
