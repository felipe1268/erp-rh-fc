/**
 * Rev. 1821 — Normalização canônica de códigos EAP/WBS.
 *
 * MOTIVO: o módulo Orçamento (planilha Excel) e o módulo Planejamento (XML do
 * MS Project) gravam o `eap_codigo` LITERAL como veio do arquivo. Resultado:
 * uma mesma EAP pode estar como "02.16.02.01" no orçamento e "2.16.2.1" no
 * cronograma → comparação string falha → atividade fica sem peso financeiro.
 *
 * SOLUÇÃO (decisão usuário 16/05/2026 — Rev. 1821): match normalizado
 * ON-THE-FLY, **sem persistir** uma nova coluna nem reescrever o `eap_codigo`
 * original. A UI continua mostrando exatamente o que veio do arquivo; só a
 * comparação interna usa a forma canônica.
 *
 * Forma canônica (escolhida pelo usuário):
 *   - Cada segmento separado por ponto vira número decimal (sem zero à
 *     esquerda).
 *   - Segmentos não numéricos (raro: ex. "1.A") são preservados em uppercase.
 *   - Espaços e pontos extras nas pontas são removidos.
 *
 * Exemplos:
 *   "02.16.02.01"   → "2.16.2.1"
 *   "3.5.1.3"       → "3.5.1.3"   (já canônico)
 *   "  02.07 "      → "2.7"
 *   "02.16.02.01."  → "2.16.2.1"
 *   ".3.5.1.3"      → "3.5.1.3"
 *   ""              → ""
 *   "1.A.2"         → "1.A.2"
 *
 * IDEMPOTENTE: `eapCanonico(eapCanonico(x)) === eapCanonico(x)`.
 * PURA: sem efeitos colaterais, sem dependências.
 */
export function eapCanonico(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const parts = s.split(".");
  const out: string[] = [];
  for (const p of parts) {
    const seg = p.trim();
    if (!seg) continue;
    if (/^\d+$/.test(seg)) {
      out.push(String(parseInt(seg, 10)));
    } else {
      out.push(seg.toUpperCase());
    }
  }
  return out.join(".");
}
