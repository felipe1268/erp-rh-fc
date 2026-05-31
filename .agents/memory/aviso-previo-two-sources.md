---
name: "Aviso Prévio" tem DUAS fontes
description: Quem está "em aviso prévio" vem de duas fontes desconexas — unir sempre.
---

No ERP, "estar em aviso prévio" pode vir de DUAS fontes que NÃO se sincronizam:

1. **Cadastro do colaborador** — campo `status === "Aviso"` (constante
   `EMPLOYEE_STATUS` em `shared/modules.ts`, label "Aviso Prévio"). É a fonte
   canônica do RH, gerenciada na tela Colaboradores.
2. **Módulo Aviso Prévio** — registros de `avisoPrevio.avisoPrevio.list` com
   `status === "em_andamento"`.

**Regra:** qualquer contagem/filtro/destaque de "Aviso Prévio" deve usar a
**UNIÃO deduplicada** das duas fontes (Set por employeeId), nunca uma só.

**Why:** a tela Raio-X derivava só do módulo (mostrava 3) e perdia os marcados
como `status="Aviso"` no cadastro (eram 7) — usuário reclamou que "perdia gente".

**How to apply:** ao tocar qualquer agregado de aviso prévio, montar
`Set<number>` com `employees.status==="Aviso"` + módulo `em_andamento`
(`Number(employeeId)`), e derivar o contador da lista visível
(`allEmployees.filter(e => set.has(e.id)).length`) pra paridade contador × lista.
