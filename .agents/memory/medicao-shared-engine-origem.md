---
name: Medição shared engine — origem + tenant guard
description: A engine de levantamento (medicao_campo) é compartilhada entre Medição de Cliente e Terceiros; regras de isolamento por origem e de tenancy.
---

# Engine de levantamento compartilhada (cliente × terceiro)

A engine `medicao_campo` (PDF/plantas + escala + contornos + fotos + memória) serve
DOIS módulos: Medição de Cliente (`medicao_contratos`) e Medição de Terceiros
(`terceiro_contratos`). Os IDs de contrato COLIDEM entre as duas tabelas, então a
coluna `medicao_campo.origem` ("terceiro" vs NULL/"cliente") é a chave de
desambiguação. Ambos os contratos têm `orcamentoId`, por isso a engine é reusável.

**Regra de isolamento (origem):** o fluxo de terceiros SEMPRE passa `origem:"terceiro"`.
Toda query escopada por contrato (`listarCampos`, `getHistoricoQuantidades`, numeração
em `criarCampo`) deve, na AUSÊNCIA de `origem`, defaultar para escopo CLIENTE
(`origem IS DISTINCT FROM 'terceiro'`) — NUNCA cair em filtro aberto (`sql\`true\``),
senão contratos homônimos de módulos distintos se misturam na mesma empresa.

**Why:** o caller legado de cliente (`MedicaoDetalhe.tsx`) não passa `origem`; se o
default fosse `true`, ele listaria/numeraria campos de um contrato-terceiro de mesmo ID.

**Regra de tenancy:** validar que o contrato∈empresa NÃO basta — um usuário pode forjar
`companyId` de outra empresa e achar um contratoId real dela, passando no check de
recurso. Toda procedure que recebe `companyId` precisa de `assertCompanyAccess(ctx.user,
companyId)` (verifica que o CHAMADOR tem acesso à empresa), além do check de recurso.

**How to apply:** ao tocar qualquer procedure de `server/routers/medicao.ts` que receba
`companyId`, garanta `assertCompanyAccess` no início; e em queries por contrato, escope
por origem com default-cliente.
