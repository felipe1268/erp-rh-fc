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

## Conclusão / auto-close do link (Rev. 2902+)

Link conclui (badge "Concluído" + auto `ativo=0`) quando 100% dos funcionários ATIVOS alocados na obra já têm resposta. O universo "alocados" = `obra_funcionarios.is_active=1 ∩ employees.status='Ativo'`.

**Why:** contar "coletados" como qualquer resposta `pendente/aprovada` da sessão fecha o link cedo demais — resposta de quem saiu da obra ou foi desligado entra no numerador e infla a contagem acima do universo correto.
**How to apply:** "coletados" SEMPRE = respostas (`pendente`/`aprovada`, `deleted_at IS NULL`) **INTERSECTADAS** com o conjunto de ativos-alocados; nunca o count cru de respostas. Vale nos DOIS pontos: `listarSessoes` (badge) e `enviarResposta` (auto-close best-effort em try/catch). `rejeitada` não conta; `total=0` nunca conclui.
