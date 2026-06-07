---
name: Fornecedor / Empresa Terceira write paths
description: Where supplier/company names are actually persisted — multiple endpoints despite shared UI naming
---

# Onde nomes de fornecedor/empresa terceira são salvos

A tela **Fornecedores** (`client/src/pages/compras/Fornecedores.tsx`, rota
`/compras/fornecedores`, menu rotulado "Fornecedores" desde Rev. 2874) salva na
tabela MESTRE `fornecedores` via `compras.criarFornecedor` / `compras.atualizarFornecedor`
— **NÃO** via `terceiros.empresas.*`.

A tela **Empresas Terceiras** (`client/src/pages/terceiros/EmpresasTerceiras.tsx`,
rota `/terceiros/empresas`) salva em `empresas_terceiras` via
`terceiros.empresas.create` / `update`.

Além desses CRUDs, `empresas_terceiras` recebe escritas INDIRETAS (auto-criação a
partir do fornecedor): `terceiros.empresas.ensureFromFornecedor`, `compras.ts`
(geração de contrato/OS — insert drizzle + SQL raw) e `terceiroContratos.ts`.

**Why:** qualquer regra que precise valer para "todo nome de empresa salvo" (ex.:
normalização Title Case na Rev. 2881) tem que cobrir TODOS esses pontos; cobrir só
`terceiros.empresas.create/update` deixa de fora a tela que o usuário mais usa.

**How to apply:** ao mexer em validação/normalização de nome de fornecedor/empresa,
grep por `insert(fornecedores`, `update(fornecedores`, `insert(empresasTerceiras`,
`INSERT INTO empresas_terceiras` em server/routers/{compras,terceiros,terceiroContratos}.ts.
