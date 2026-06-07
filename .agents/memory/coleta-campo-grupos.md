---
name: Coleta de Campo — seleção de grupos
description: Como o link público de Coleta de Campo (RH) decide quais seções coletar
---

# Coleta de Campo (RH) — grupos coletáveis

A escolha do que o auxiliar coleta é por GRUPO (não campo a campo): `foto`, `epi`, `contato`, `emergencia`, `endereco`. Fonte única em `shared/coletaCampos.ts`.

- Persistência: `coleta_rh_sessoes.campos_json` (JSON array de chaves de grupo). `NULL`/ausente = TODOS os grupos (backward compat de links antigos).
- `serializeGruposColeta`: vazio OU igual-a-todos → `null` (idempotente). Qualquer writer novo deve usar esse helper, nunca gravar o array cru.
- `enviarResposta` aplica whitelist por grupo server-side (`camposHabilitados`) + gate explícito da foto — não confie só na UI.

**Why:** "Gerar todos" reaproveita link ativo existente; é fácil esquecer de propagar a seleção atual e o reaproveitado fica com grupos antigos.
**How to apply:** Em `criarSessoesTodas`, ao reaproveitar sessão ativa, SEMPRE `UPDATE campos_json` para a seleção atual — senão a escolha de grupos não vale uniformemente.
