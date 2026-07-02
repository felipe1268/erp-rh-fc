---
name: VR/VT desconto de falta não entra misturado em FALTAS
description: Regra de negócio confirmada pelo usuário sobre onde VR/VT de dias de falta pode/não pode aparecer na Folha de Pagamento.
---

Regra confirmada (Rev. 3987): funcionário que falta perde VR e VT normalmente
(isso não muda, mesmo com banco de horas ativo). Porém:
- VT de falta ENTRA na Folha de Pagamento, mas na coluna VT (nunca em FALTAS).
- VR/VA de falta NUNCA entra na Folha — é calculado à parte, no módulo Vale
  Alimentação (que já tem seu próprio fluxo de alertas de falta).

**Why:** somar VR (e antes também VT) dentro da coluna "FALTAS" cria a falsa
impressão de desconto salarial/DSR quando na verdade `descontoFaltas`
(salário/DSR) pode estar zerado (ex.: banco de horas ativo redireciona
DSR/atraso/falta pra débito de horas, Rev. 3977/3983).

**How to apply:** qualquer superfície que exiba "Faltas"/"Descontos" da Folha
(tabela principal, memorial de cálculo, comprovante/contracheque, relatórios)
deve manter VR fora do total e do rótulo de Faltas, e mostrar VT-de-falta só
dentro do bloco/coluna de VT. Ver `server/routers/payrollEngine.ts`
(`calcFaltas`/`calcVt`) e `client/src/pages/FolhaPagamento.tsx` (memorial +
recomputo local) para o padrão já implementado.
