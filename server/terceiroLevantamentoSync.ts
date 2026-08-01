// Rev. 4792 — Levantamento de Campo → Medição de TERCEIROS (rascunho): os
// quantitativos consolidados do levantamento alimentam AUTOMATICAMENTE os
// itens da medição vinculada (terceiro_medicoes.levantamento_campo_id).
//
// Regras:
// - Só medições em RASCUNHO (aprovada/paga são intocáveis).
// - Item editado MANUALMENTE no módulo de Medições nunca é sobrescrito
//   (poka-yoke: decisão humana vence a automação).
// - Itens SEM linha no consolidado ficam como estão (não zera nada).
// - Mesma matemática do editarMedicaoItem (percentual clampado ao saldo).
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  medicaoCampoContornos,
  medicaoLevantamentoServicos,
  terceiroContratoItens,
  terceiroContratos,
  terceiroMedicaoItens,
  terceiroMedicoes,
} from "../drizzle/schema";
import { consolidarContornos } from "../shared/levantamentoConsolidado";

const n = (v: any): number => {
  const x = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export async function aplicarLevantamentoNaMedicaoTerceiro(db: any, campoId: number): Promise<void> {
  const medicoes = await db.select().from(terceiroMedicoes)
    .where(and(eq(terceiroMedicoes.levantamentoCampoId, campoId), eq(terceiroMedicoes.status, "rascunho")));
  if (!medicoes.length) return;

  const contornos = await db.select().from(medicaoCampoContornos)
    .where(and(eq(medicaoCampoContornos.medicaoCampoId, campoId), isNull(medicaoCampoContornos.deletedAt)));
  const servicos = await db.select().from(medicaoLevantamentoServicos)
    .where(eq(medicaoLevantamentoServicos.medicaoCampoId, campoId));

  for (const med of medicoes) {
    const itensContrato = await db.select().from(terceiroContratoItens)
      .where(and(eq(terceiroContratoItens.contratoId, med.contratoId), eq(terceiroContratoItens.companyId, med.companyId)));
    if (!itensContrato.length) continue;

    // Mesmo mapeamento que a tela do levantamento usa p/ terceiros
    const itensConsolidaveis = itensContrato.map((it: any) => ({
      id: it.id,
      eapCodigo: it.eapCodigo,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      vendaUnitTotal: it.valorUnitario,
      vendaTotal: it.valorTotal,
    }));
    const consolidado = consolidarContornos(contornos as any, itensConsolidaveis as any, servicos as any);
    const porItem = new Map<number, { quantidade: number; valorTotal: number }>();
    for (const l of consolidado.linhas) {
      if (l.orcamentoItemId != null) porItem.set(Number(l.orcamentoItemId), { quantidade: n(l.quantidade), valorTotal: n(l.valorTotal) });
    }
    if (!porItem.size) continue;

    const itensMed = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, med.id));
    const ciById = new Map(itensContrato.map((c: any) => [c.id, c]));
    let mudou = false;
    for (const item of itensMed) {
      if (item.editadoManualmente) continue; // decisão manual vence
      const ci: any = ciById.get(item.contratoItemId);
      const linha = ci ? porItem.get(ci.id) : undefined;
      if (!ci || linha === undefined) continue; // sem levantamento p/ este item → não mexe
      const qtdContratada = n(ci.quantidade);
      const valorTotalItem = n(ci.valorTotal);
      const valorUnit = n(ci.valorUnitario);
      const anterior = n(item.percentualAcumuladoAnterior);
      // Rev. 4800 — RESPEITA O QUANTITATIVO do levantamento: o valor do período
      // é qtd medida × preço unitário (exato), e o % é derivado do valor —
      // nunca o contrário (o % arredondado distorcia centavos do quantitativo).
      const valorBrutoPeriodo = qtdContratada > 0 && valorUnit > 0
        ? linha.quantidade * valorUnit
        : (qtdContratada > 0 && valorTotalItem > 0
          ? (linha.quantidade / qtdContratada) * valorTotalItem
          : n(linha.valorTotal));
      const saldoValor = Math.max(0, ((100 - anterior) / 100) * valorTotalItem);
      const valorPeriodo = Math.max(0, Math.min(saldoValor, valorBrutoPeriodo));
      const percPeriodo = valorTotalItem > 0 ? (valorPeriodo / valorTotalItem) * 100 : 0;
      // Rev. 4802 — quantidade medida ALÉM do saldo do contrato: fica registrada
      // no item da medição (fora do valor a pagar) e alimenta o fluxo de Aditivo.
      const saldoQtd = Math.max(0, ((100 - anterior) / 100) * qtdContratada);
      const qtdExcedente = Math.max(0, Math.round((linha.quantidade - saldoQtd) * 10000) / 10000);
      if (Math.abs(valorPeriodo - n(item.valorMedidoPeriodo)) < 0.005
        && Math.abs(percPeriodo - n(item.percentualMedidoPeriodo)) < 0.0005
        && Math.abs(qtdExcedente - n((item as any).quantidadeExcedente)) < 0.0005) continue; // já reflete
      const percFisico = anterior + percPeriodo;
      await db.update(terceiroMedicaoItens).set({
        percentualMedidoPeriodo: String(percPeriodo),
        percentualAvancoFisico: String(percFisico),
        valorMedidoPeriodo: String(valorPeriodo),
        valorAcumulado: String((anterior / 100) * valorTotalItem + valorPeriodo),
        valorMatPeriodo: String((percPeriodo / 100) * n(ci.vlrMat ?? "0")),
        valorMdoPeriodo: String((percPeriodo / 100) * n(ci.vlrMdo ?? "0")),
        valorMatAcumulado: String((percFisico / 100) * n(ci.vlrMat ?? "0")),
        valorMdoAcumulado: String((percFisico / 100) * n(ci.vlrMdo ?? "0")),
        quantidadeExcedente: String(qtdExcedente),
        editadoManualmente: false,
      } as any).where(eq(terceiroMedicaoItens.id, item.id));
      mudou = true;
    }
    if (!mudou) continue;

    // Rollups da medição (mesma fórmula do editarMedicaoItem)
    const todosItens = await db.select().from(terceiroMedicaoItens).where(eq(terceiroMedicaoItens.medicaoId, med.id));
    const valorMedido = todosItens.reduce((s: number, i: any) => s + n(i.valorMedidoPeriodo), 0);
    const aprovadas = await db.select().from(terceiroMedicoes)
      .where(and(eq(terceiroMedicoes.contratoId, med.contratoId), eq(terceiroMedicoes.companyId, med.companyId), inArray(terceiroMedicoes.status, ["aprovada", "paga"])));
    const acumulado = aprovadas.reduce((s: number, m: any) => s + (m.id === med.id ? 0 : n(m.valorMedido)), 0) + valorMedido;
    const [contrato] = await db.select().from(terceiroContratos)
      .where(and(eq(terceiroContratos.id, med.contratoId), eq(terceiroContratos.companyId, med.companyId)));
    const percGlobal = n(contrato?.valorTotal) > 0 ? (acumulado / n(contrato.valorTotal)) * 100 : 0;
    await db.update(terceiroMedicoes).set({
      valorMedido: String(valorMedido),
      valorAcumulado: String(acumulado),
      percentualGlobal: String(percGlobal),
      atualizadoEm: new Date().toISOString(),
    } as any).where(eq(terceiroMedicoes.id, med.id));
  }
}
