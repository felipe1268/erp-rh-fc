---
name: CIPA module tenant guards
description: IDOR/race pitfalls when adding write endpoints to the CIPA (NR-5) module
---

# CIPA (NR-5) write-path guards

The CIPA sub-routers (`candidatos`, `eleicaoDigital`, `planosAcao`) follow the module-wide
`companyFilter(col, input)` convention as their tenant guard (not the legacy strict compare).

**Rule:** every create/update/delete must validate the target (and any referenced parent —
election/employee/mandate) belongs to the caller's accessible company via `companyFilter`
BEFORE writing. `*.update`/`*.delete` that take only `id` are IDOR holes; they need
`companyId`/`companyIds` in input + a guarded SELECT, and EVERY frontend caller must pass
`companyId`/`companyIds` or the now-required field breaks the mutation.

**Why:** initial Rev. 3041 shipped `candidatos.create/update/delete` and `planosAcao.create`
writing by raw id/input companyId with no tenant check — cross-tenant manipulation.

**abrirVotacao race:** "select existing → insert missing" is not atomic. Voter generation
relies on a UNIQUE index `(election_id, employee_id)` on `cipa_voters` +
`onConflictDoNothing({ target: [electionId, employeeId] })` so concurrent calls don't
duplicate tokens. The unique index lives in `[SyncSchema+]` self-heal.

**Voto secreto:** `cipa_votes` has NO link to the voter; `registrarVoto` is an atomic claim
`UPDATE cipa_voters ... WHERE jaVotou=0 RETURNING` = 1 vote per link, anonymous.

**Membro VÁLIDO (vigência/estabilidade):** ao derivar status CIPA de um funcionário
(ativa vs estável), filtre SEMPRE `cipaMembers.statusMembro != 'Encerrado'` (régua do
módulo `checkEstabilidade`). "Ativa" = membro de election com `mandatoFim >= hoje`;
senão "estável (anterior)" = `fimEstabilidade >= hoje`. Datas são `date({mode:'string'})`
YYYY-MM-DD → comparação lexicográfica de string é válida. Ativa tem prioridade sobre estável.
