---
name: CPF stored in mixed formats
description: employees.cpf (and recontratacao_solicitacoes.cpf) may be stored FORMATTED or digits-only; equality checks must normalize both sides.
---

# CPF é gravado em formatos MISTOS no banco

A coluna `employees.cpf` (e `recontratacao_solicitacoes.cpf`) NÃO tem formato
canônico: alguns registros estão FORMATADOS ("362.506.888-54"), outros só com
dígitos. O cliente normalmente envia o CPF LIMPO (só dígitos).

**Regra:** qualquer comparação de igualdade de CPF deve NORMALIZAR OS DOIS LADOS
pelos dígitos, nunca `eq(cpf, raw) OR eq(cpf, clean)`:
```
sql`regexp_replace(${table.cpf}, '[^0-9]', '', 'g') = ${cleanCpf}`
```

**Why:** `or(eq(cpf, input.cpf), eq(cpf, cleanCpf))` só casa quando o valor no
banco está cru OU já limpo; um CPF formatado no banco escapa de TODAS as
igualdades → query vazia → falso "CPF livre" / duplicata não detectada
(sintoma real do Felipe: funcionário ATIVO aparecia como "Novo colaborador").

**How to apply:** ao adicionar/editar qualquer match de CPF (verificarCpf,
checkDuplicateCpf, detecção de solicitação pendente, dedupe), use o helper
`regexp_replace`. O mesmo padrão já era usado na busca textual de `server/db.ts`.
Custo: o `regexp_replace(col, ...)` impede uso de índice plano em cpf, mas os
filtros de `companyId`/`deletedAt`/grupo mantêm a seletividade; aceitável nessa
escala. Se escalar, índice funcional sobre o CPF normalizado.
