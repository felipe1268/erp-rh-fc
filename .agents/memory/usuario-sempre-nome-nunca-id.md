---
name: Usuário sempre por NOME, nunca por #ID
description: Regra de ouro do usuário — qualquer tela/relatório que mostra pessoa deve resolver o nome pelo cadastro, nunca exibir "Usuário #ID".
---

**Regra:** toda superfície de UI (dashboards, rankings, relatórios, PDFs, alertas) que exibe uma pessoa deve mostrar o NOME resolvido, nunca um fallback tipo "Usuário #73668".

**Why:** registros antigos (ex.: SCs de compras) foram gravados só com o id, sem nome desnormalizado. O fallback "#ID" fez o usuário achar que havia usuário fantasma no sistema ("o número eu não sei como saber"). Ele declarou isso regra de ouro em 30/07/2026.

**How to apply:** quando um campo desnormalizado de nome vier vazio, buscar o nome em `users` (batch via `inArray(users.id, ids)`), como feito no getDashboardGerencial (helper `nomeSolicitante`). Só cair para "—" se o usuário não existir mais no cadastro; nunca exibir o id numérico como rótulo.
