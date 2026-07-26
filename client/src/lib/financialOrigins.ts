// Rev. 1626 — Single source of truth para origens de lançamentos financeiros.
// Usado por FinanceiroContasAPagar, FinanceiroLancamentos, Dashboard, DRE, etc.
// Sempre que adicionar uma nova origem em server/services/* (financialIntegrationBridge,
// purchaseFinancialBridge, payroll, beneficios), espelhar aqui.
import {
  ShoppingCart, Users, Briefcase, Truck, Receipt, Scale, Package,
  Wallet, FileText, Banknote, Calendar, CreditCard, type LucideIcon
} from "lucide-react";

export type FinancialOrigin =
  | "compras" | "compra_oc"
  | "folha" | "folha_rh" | "folha_clt" | "payroll_agregado" | "fechamento_ponto"
  | "pj" | "pagamento_pj" | "pro_labore" | "medicao_pj"
  | "terceiros" | "terceiro_medicao" | "medicao_obra"
  | "pagamento_parceiro" | "parceiro_lancamento"
  | "frota" | "frota_abastecimento" | "frota_manutencao"
  | "beneficios" | "beneficio_va" | "beneficio_vr" | "beneficio_vt" | "seguro_vida"
  | "tributario" | "guia_tributaria"
  | "juridico" | "processo_trabalhista"
  | "almoxarifado" | "almoxarifado_saida"
  | "adiantamento" | "comissao_comprador"
  | "planejamento_medicao" | "planejamento_compra"
  | "cronograma_atividade" | "revenue"
  // Rev. 1630 — Projeção de Folha/Benefícios/13º/PJ (forecast antes do fato gerador)
  | "folha_projetada" | "encargos_projetado"
  | "beneficio_vr_projetado" | "beneficio_va_projetado"
  | "decimo_terceiro_projetado" | "pj_projetado"
  // Rev. 1636 — Projeções de Férias (CLT 145) e Rescisão de Aviso (CLT 477 §6º)
  | "ferias_projetada" | "rescisao_projetada"
  | "transferencia_estoque"
  | "manual" | "recorrente";

export const ORIGEM_LABELS: Record<string, string> = {
  // Compras
  compras: "Compras", compra_oc: "OC Compras", planejamento_compra: "Planejamento Compras",
  // Folha / RH
  folha: "Folha CLT", folha_rh: "Folha CLT", folha_clt: "Folha CLT",
  payroll_agregado: "Folha Consolidada", fechamento_ponto: "Fechamento Ponto",
  // PJ
  pj: "Contrato PJ", pagamento_pj: "Pagamento PJ", pro_labore: "Pró-labore", medicao_pj: "Medição PJ",
  // Terceiros / Medições
  terceiros: "Terceiros", terceiro_medicao: "Med. Terceiros",
  medicao_obra: "Medição Obra", planejamento_medicao: "Plan. Medição",
  // Parceiros
  pagamento_parceiro: "Parceiros", parceiro_lancamento: "Parceiros",
  // Frota
  frota: "Frota", frota_abastecimento: "Frota — Combustível", frota_manutencao: "Frota — Manutenção",
  // Benefícios
  beneficios: "Benefícios", beneficio_va: "Vale Alimentação",
  beneficio_vr: "Vale Refeição", beneficio_vt: "Vale Transporte",
  seguro_vida: "Seguro de Vida",
  // Tributário
  tributario: "Tributário", guia_tributaria: "Guia Tributária",
  // Jurídico
  juridico: "Jurídico", processo_trabalhista: "Proc. Trabalhista",
  // Almoxarifado
  almoxarifado: "Almoxarifado", almoxarifado_saida: "Saída Almox.",
  // Outras
  adiantamento: "Adiantamento", comissao_comprador: "Comissão",
  // Receitas
  cronograma_atividade: "Cronograma", revenue: "Receita Manual",
  // Projeções de Folha (Rev. 1630)
  folha_projetada: "Folha (Projeção)",
  encargos_projetado: "Encargos (Projeção)",
  beneficio_vr_projetado: "VR (Projeção)",
  beneficio_va_projetado: "VA (Projeção)",
  decimo_terceiro_projetado: "13º (Projeção)",
  pj_projetado: "PJ (Projeção)",
  ferias_projetada: "Férias (Projeção)",
  rescisao_projetada: "Rescisão (Projeção)",
  transferencia_estoque: "Transferência Estoque",
  // Cartão de crédito (Rev. 4594)
  cartao_fatura: "Fatura de Cartão",
  // Genéricos
  manual: "Manual", recorrente: "Recorrente",
};

export const ORIGEM_ICONS: Record<string, LucideIcon> = {
  compras: ShoppingCart, compra_oc: ShoppingCart, planejamento_compra: ShoppingCart,
  folha: Users, folha_rh: Users, folha_clt: Users, payroll_agregado: Users, fechamento_ponto: Users,
  pj: Briefcase, pagamento_pj: Briefcase, pro_labore: Briefcase, medicao_pj: Briefcase,
  terceiros: Users, terceiro_medicao: Users, medicao_obra: Users, planejamento_medicao: Calendar,
  pagamento_parceiro: Users, parceiro_lancamento: Users,
  frota: Truck, frota_abastecimento: Truck, frota_manutencao: Truck,
  beneficios: Receipt, beneficio_va: Receipt, beneficio_vr: Receipt, beneficio_vt: Receipt, seguro_vida: Receipt,
  tributario: Scale, guia_tributaria: Scale,
  juridico: Scale, processo_trabalhista: Scale,
  almoxarifado: Package, almoxarifado_saida: Package,
  adiantamento: Wallet, comissao_comprador: Wallet,
  cronograma_atividade: Calendar, revenue: Banknote,
  folha_projetada: Users, encargos_projetado: Receipt,
  beneficio_vr_projetado: Receipt, beneficio_va_projetado: Receipt,
  decimo_terceiro_projetado: Calendar, pj_projetado: Briefcase,
  ferias_projetada: Calendar, rescisao_projetada: FileText,
  transferencia_estoque: Package,
  cartao_fatura: CreditCard,
  manual: Wallet, recorrente: Wallet,
};

export const ORIGEM_COLORS: Record<string, string> = {
  compras: "bg-blue-50 text-blue-700 border-blue-200",
  compra_oc: "bg-blue-50 text-blue-700 border-blue-200",
  planejamento_compra: "bg-blue-50 text-blue-700 border-blue-200",
  folha: "bg-purple-50 text-purple-700 border-purple-200",
  folha_rh: "bg-purple-50 text-purple-700 border-purple-200",
  folha_clt: "bg-purple-50 text-purple-700 border-purple-200",
  payroll_agregado: "bg-purple-50 text-purple-700 border-purple-200",
  fechamento_ponto: "bg-purple-50 text-purple-700 border-purple-200",
  pj: "bg-indigo-50 text-indigo-700 border-indigo-200",
  pagamento_pj: "bg-indigo-50 text-indigo-700 border-indigo-200",
  pro_labore: "bg-indigo-50 text-indigo-700 border-indigo-200",
  medicao_pj: "bg-indigo-50 text-indigo-700 border-indigo-200",
  terceiros: "bg-cyan-50 text-cyan-700 border-cyan-200",
  terceiro_medicao: "bg-cyan-50 text-cyan-700 border-cyan-200",
  medicao_obra: "bg-cyan-50 text-cyan-700 border-cyan-200",
  planejamento_medicao: "bg-cyan-50 text-cyan-700 border-cyan-200",
  pagamento_parceiro: "bg-cyan-50 text-cyan-700 border-cyan-200",
  parceiro_lancamento: "bg-cyan-50 text-cyan-700 border-cyan-200",
  frota: "bg-amber-50 text-amber-700 border-amber-200",
  frota_abastecimento: "bg-amber-50 text-amber-700 border-amber-200",
  frota_manutencao: "bg-amber-50 text-amber-700 border-amber-200",
  beneficios: "bg-pink-50 text-pink-700 border-pink-200",
  beneficio_va: "bg-pink-50 text-pink-700 border-pink-200",
  beneficio_vr: "bg-pink-50 text-pink-700 border-pink-200",
  beneficio_vt: "bg-pink-50 text-pink-700 border-pink-200",
  seguro_vida: "bg-pink-50 text-pink-700 border-pink-200",
  tributario: "bg-red-50 text-red-700 border-red-200",
  guia_tributaria: "bg-red-50 text-red-700 border-red-200",
  juridico: "bg-rose-50 text-rose-700 border-rose-200",
  processo_trabalhista: "bg-rose-50 text-rose-700 border-rose-200",
  almoxarifado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  almoxarifado_saida: "bg-emerald-50 text-emerald-700 border-emerald-200",
  transferencia_estoque: "bg-violet-50 text-violet-700 border-violet-200",
  adiantamento: "bg-gray-50 text-gray-700 border-gray-200",
  comissao_comprador: "bg-gray-50 text-gray-700 border-gray-200",
  cronograma_atividade: "bg-green-50 text-green-700 border-green-200",
  revenue: "bg-green-50 text-green-700 border-green-200",
  // Projeções RH/Folha (Rev. 1630) — paleta violet pra reforçar "forecast"
  folha_projetada: "bg-violet-50 text-violet-700 border-violet-200",
  encargos_projetado: "bg-violet-50 text-violet-700 border-violet-200",
  beneficio_vr_projetado: "bg-violet-50 text-violet-700 border-violet-200",
  beneficio_va_projetado: "bg-violet-50 text-violet-700 border-violet-200",
  decimo_terceiro_projetado: "bg-violet-50 text-violet-700 border-violet-200",
  pj_projetado: "bg-violet-50 text-violet-700 border-violet-200",
  ferias_projetada: "bg-violet-50 text-violet-700 border-violet-200",
  rescisao_projetada: "bg-violet-50 text-violet-700 border-violet-200",
  cartao_fatura: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  manual: "bg-gray-50 text-gray-700 border-gray-200",
  recorrente: "bg-violet-50 text-violet-700 border-violet-200",
};

export function originLabel(o: string | null | undefined): string {
  if (!o) return "Manual";
  return ORIGEM_LABELS[o] ?? o;
}
export function originIcon(o: string | null | undefined): LucideIcon {
  if (!o) return FileText;
  return ORIGEM_ICONS[o] ?? FileText;
}
export function originColor(o: string | null | undefined): string {
  if (!o) return "bg-gray-50 text-gray-700 border-gray-200";
  return ORIGEM_COLORS[o] ?? "bg-gray-50 text-gray-700 border-gray-200";
}

// ─────────────────────────────────────────────────────────────────
// Consolidação visual (Contas a Pagar / Receber)
// Retorna { sub, label, origemBase } para entries que devem agrupar
// em uma única linha mensal; null para entries individuais.
// ─────────────────────────────────────────────────────────────────
export type ConsolidateSubtype = { sub: string; label: string; origemBase: string };

export function consolidateSubtype(c: any): ConsolidateSubtype | null {
  const o = (c?.origemModulo ?? "").toString();
  // Folha
  if (o === "folha" || o === "folha_rh" || o === "folha_clt" || o === "payroll_agregado" || o === "fechamento_ponto")
    return { sub: "folha", label: "Folha de Pagamento", origemBase: "folha_rh" };
  // Benefícios — origens dedicadas
  if (o === "beneficio_va") return { sub: "VA", label: "Vale Alimentação", origemBase: "beneficio_va" };
  if (o === "beneficio_vr") return { sub: "VR", label: "Vale Refeição", origemBase: "beneficio_vr" };
  if (o === "beneficio_vt") return { sub: "VT", label: "Vale Transporte", origemBase: "beneficio_vt" };
  if (o === "seguro_vida") return { sub: "seguro", label: "Seguro de Vida", origemBase: "seguro_vida" };
  // Benefícios legado (origemModulo = "beneficios")
  if (o === "beneficios") {
    const txt = `${c.descricao ?? ""} ${c.origemDescricao ?? ""} ${c.contaNome ?? ""}`
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    // Refeição PRIMEIRO porque "Vale Refeição / Alimentação" matcha ambas
    if (/refei/.test(txt) || /\bvr\b/.test(txt)) return { sub: "VR", label: "Vale Refeição", origemBase: "beneficio_vr" };
    if (/alimenta/.test(txt) || /\bva\b/.test(txt)) return { sub: "VA", label: "Vale Alimentação", origemBase: "beneficio_va" };
    if (/transp|\bvt\b/.test(txt)) return { sub: "VT", label: "Vale Transporte", origemBase: "beneficio_vt" };
    if (/saude|odonto|plano/.test(txt)) return { sub: "saude", label: "Saúde/Odonto", origemBase: "beneficios" };
    return { sub: "outros", label: "Outros Benefícios", origemBase: "beneficios" };
  }
  // PJ
  if (o === "pj" || o === "pagamento_pj" || o === "pro_labore" || o === "medicao_pj")
    return { sub: "pj", label: "Pagamentos PJ", origemBase: "pagamento_pj" };
  // Frota
  if (o === "frota" || o === "frota_abastecimento")
    return { sub: "frota_comb", label: "Frota — Combustível", origemBase: "frota_abastecimento" };
  if (o === "frota_manutencao")
    return { sub: "frota_man", label: "Frota — Manutenção", origemBase: "frota_manutencao" };
  // Terceiros / Parceiros
  if (o === "terceiros" || o === "terceiro_medicao" || o === "medicao_obra" || o === "planejamento_medicao")
    return { sub: "med", label: "Medições Terceiros", origemBase: "terceiro_medicao" };
  if (o === "pagamento_parceiro" || o === "parceiro_lancamento")
    return { sub: "parc", label: "Pagamentos Parceiros", origemBase: "parceiro_lancamento" };
  // Tributário
  if (o === "tributario" || o === "guia_tributaria")
    return { sub: "trib", label: "Guias Tributárias", origemBase: "guia_tributaria" };
  return null;
}

// Rótulo para o contador na linha consolidada (funcionário/veículo/contrato/registro)
export function unitLabelFor(origemBase: string, count: number): string {
  const plural = count === 1 ? "" : "(s)";
  if (/^(folha|beneficio_|seguro_vida)/.test(origemBase)) return `funcionário${plural}`;
  if (/^(pj|pagamento_pj|pro_labore|medicao_pj)/.test(origemBase)) return `prestador${count === 1 ? "" : "es"}`;
  if (/^frota/.test(origemBase)) return `veículo${plural}`;
  if (/^(terceiro|medicao_obra|planejamento_medicao|pagamento_parceiro|parceiro_lancamento)/.test(origemBase)) return `contrato${plural}`;
  return `registro${plural}`;
}
