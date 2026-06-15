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

## Conclusão / auto-close do link

Link conclui (badge "Concluído" + auto `ativo=0`) quando 100% dos funcionários ATIVOS alocados na obra já têm resposta. O universo "alocados" = `obra_funcionarios.is_active=1 ∩ employees.status='Ativo'`.

**Why:** contar "coletados" como qualquer resposta `pendente/aprovada` da sessão fecha o link cedo demais — resposta de quem saiu da obra ou foi desligado entra no numerador e infla a contagem acima do universo correto.
**How to apply:** "coletados" SEMPRE = respostas (`pendente`/`aprovada`, `deleted_at IS NULL`) **INTERSECTADAS** com o conjunto de ativos-alocados; nunca o count cru de respostas. Vale nos DOIS pontos: `listarSessoes` (badge) e `enviarResposta` (auto-close best-effort em try/catch). `rejeitada` não conta; `total=0` nunca conclui.

## Auto-finalização também no `listarSessoes` (não só no envio)

O `enviarResposta` só fecha o link (`ativo=0`) no ÚLTIMO ENVIO público. Mas `concluida` é DERIVADA do universo ativos-alocados, que pode ENCOLHER sem novo envio (funcionário desalocado/desligado) — aí o badge vira "Concluído" mas o link ficava ATIVO. Por isso `listarSessoes` também AUTO-FINALIZA.

**Why:** a conclusão pode acontecer por mudança de roster (universo encolhe), caminho que nunca passa por `enviarResposta`; sem self-heal na listagem o link concluído nunca fecha.
**How to apply:** no `listarSessoes`, faça o write ANTES de montar o payload e reflita `ativo:0` SÓ para os IDs que o `UPDATE ... AND ativo=1 RETURNING id` confirmou — assim o payload nunca diverge do banco se o write (best-effort try/catch) falhar. NUNCA devolva `ativo:0` otimista antes da escrita confirmada.
