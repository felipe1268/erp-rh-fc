---
name: Alertas pessoais in-app (user_alerts)
description: Sistema de pop-up por usuário para avisar criador de registro reprovado/rejeitado
---

- Tabela `user_alerts` (user_id, tipo, titulo, mensagem, link_url, lido_em). Helper `criarUserAlert` em `server/db.ts` (engole erros por design — alerta nunca pode quebrar a mutation principal).
- Leitura/baixa: `notifications.meusAlertas` (só não-lidos do ctx.user.id) + `marcarAlertasLidos` (escopado ao próprio usuário). Pop-up global `UserAlertsPrompt` no DashboardLayout (poll 120s, "Ciente"/"Ver registro").
- Usos: reprovação de apontamento de campo (`fieldNotes.resolve` status `reprovado`) e rejeição de HE (`heSolicitacoes.reject`).
- **Why:** não existe central de notificações/sino; o padrão do produto é pop-up ao entrar (FeriasGozoPrompt/AlertasDia). Usuário pediu alerta ao criador na reprovação (27/07/2026).
- **How to apply:** novo fluxo de rejeição que precise avisar o solicitante → `criarUserAlert` com `tipo` próprio e `linkUrl` da tela; NÃO criar mecanismos paralelos.
- Gotcha: `field_notes.solicitanteId` guarda openId OU e-mail (varchar) — resolver usuário por openId primeiro, e-mail como fallback. HE usa `solicitadoPorId` (int, direto).
- Reprovar apontamento: NÃO grava ponto e desfaz o marcador `[Apontamento #id -` criado na abertura (deleta linha se fonte='apontamento'; em linha compartilhada dixi/manual só limpa o texto — nunca zerar faltas de linha compartilhada, pode ser falta legítima do DIXI).
