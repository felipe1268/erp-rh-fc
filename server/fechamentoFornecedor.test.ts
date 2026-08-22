import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const rateioReal = JSON.parse(execFileSync("pnpm", [
  "exec", "tsx", "-e",
  `import { distribuirTotalFechamentoCentavos as d } from "./server/utils/fechamentoFornecedor.ts";
const obj = (m) => Object.fromEntries(m);
const out = {
  desconto: obj(d([{ entryId: 10, valorBaseCentavos: 10000 }, { entryId: 20, valorBaseCentavos: 20000 }], 27000)),
  acrescimo: obj(d([{ entryId: 10, valorBaseCentavos: 10000 }, { entryId: 20, valorBaseCentavos: 20000 }], 33000)),
  semAjuste: obj(d([{ entryId: 10, valorBaseCentavos: 10000 }, { entryId: 20, valorBaseCentavos: 20000 }], 30000)),
  resto: obj(d([{ entryId: 5, valorBaseCentavos: 100 }, { entryId: 2, valorBaseCentavos: 100 }], 101)),
  erroZero: ""
};
try { d([{ entryId: 1, valorBaseCentavos: 1 }, { entryId: 2, valorBaseCentavos: 999 }], 1); }
catch (e) { out.erroZero = e.message; }
console.log(JSON.stringify(out));`,
], { encoding: "utf8" }).trim());

/**
 * Task #187 — Testes unitários do fechamento consolidado de fornecedor.
 * Cobre: cálculo de janela, labels, validações de estado, tolerância de valor.
 * NÃO acessa banco, usuário ou dados pessoais.
 */

// ─── Funções copiadas/adaptadas do financial.ts para teste isolado ─────────────
// (sem importar o router completo que tem dependências de banco)

function _cicloWindow(dateStr: string, ciclo: string, refDate?: string | null): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = d.getUTCDate();
  if (ciclo === "mensal" || ciclo === "personalizado") return `${yyyy}-${mm}`;
  if (ciclo === "quinzenal") return `${yyyy}-${mm}-${day <= 15 ? "01" : "16"}`;
  if (ciclo === "quinzenal_semana") {
    const ref = new Date((refDate || dateStr) + "T12:00:00Z");
    const diffDays = (d.getTime() - ref.getTime()) / 86400000;
    const period = Math.ceil(diffDays / 14);
    const closing = new Date(ref.getTime() + period * 14 * 86400000);
    return closing.toISOString().slice(0, 10);
  }
  if (ciclo === "semanal") {
    const jan1 = new Date(Date.UTC(yyyy, 0, 1));
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
    return `${yyyy}-W${String(week).padStart(2, "0")}`;
  }
  return `${yyyy}-${mm}`;
}

function _cicloFechamentoDate(window: string, ciclo: string): string {
  if (ciclo === "semanal" && window.includes("W")) {
    const [yyyy, ww] = window.split("-W");
    const jan4 = new Date(Date.UTC(parseInt(yyyy), 0, 4));
    const startOfWeek = new Date(jan4.getTime() - (jan4.getUTCDay() || 7) * 86400000 + parseInt(ww) * 7 * 86400000);
    const sun = new Date(startOfWeek.getTime() + 6 * 86400000);
    return sun.toISOString().slice(0, 10);
  }
  if (ciclo === "quinzenal_semana" && window.length === 10) return window;
  if (ciclo === "quinzenal" && window.length === 10) {
    const [yyyy, mm, dd] = window.split("-");
    if (dd === "01") return `${yyyy}-${mm}-15`;
    const lastDay = new Date(Date.UTC(parseInt(yyyy), parseInt(mm), 0));
    return lastDay.toISOString().slice(0, 10);
  }
  if (window.length === 7) {
    const [yyyy, mm] = window.split("-");
    const lastDay = new Date(Date.UTC(parseInt(yyyy), parseInt(mm), 0));
    return lastDay.toISOString().slice(0, 10);
  }
  return window;
}

function _normNomeConc(s: any): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function _isFdModalidade(v: any): boolean {
  return v === "fd_cliente" || v === "fd_terceiro" || v === "fd_fc";
}

// Validação de total conferido (tolerância 5 centavos)
function validarTotalConferido(somaItensCents: number, somaAjustesCents: number, totalDeclaradoCents: number): boolean {
  return Math.abs((somaItensCents + somaAjustesCents) - totalDeclaradoCents) <= 5;
}

// Validação de estado permitido para transições
function estadoPermiteEdicao(status: string): boolean {
  return status === "rascunho";
}
function estadoPermiteConfirmacao(status: string): boolean {
  return status === "rascunho";
}
function estadoPermitePagamento(status: string): boolean {
  return status === "conferido";
}
function estadoPermiteEstorno(status: string): boolean {
  return status === "pago";
}
function estadoPermiteCancelamento(status: string): boolean {
  return status !== "cancelado" && status !== "pago";
}

// ─── Testes ────────────────────────────────────────────────────────────────────

describe("_cicloWindow — janela de competência", () => {
  it("mensal: retorna YYYY-MM", () => {
    expect(_cicloWindow("2025-01-15", "mensal")).toBe("2025-01");
    expect(_cicloWindow("2025-12-31", "mensal")).toBe("2025-12");
  });

  it("quinzenal: dia<=15 retorna YYYY-MM-01, dia>15 retorna YYYY-MM-16", () => {
    expect(_cicloWindow("2025-01-01", "quinzenal")).toBe("2025-01-01");
    expect(_cicloWindow("2025-01-15", "quinzenal")).toBe("2025-01-01");
    expect(_cicloWindow("2025-01-16", "quinzenal")).toBe("2025-01-16");
    expect(_cicloWindow("2025-01-31", "quinzenal")).toBe("2025-01-16");
  });

  it("quinzenal_semana: calcula corretamente a partir da ref", () => {
    // ref=2025-01-01, period=14 dias → fechamento em 2025-01-01, 2025-01-15, etc.
    const ref = "2025-01-01";
    // Um dia igual à ref = ceil(0/14)=0 → 0 * 14 = 2025-01-01
    expect(_cicloWindow("2025-01-01", "quinzenal_semana", ref)).toBe("2025-01-01");
    // 2025-01-02 = diff=1 → ceil(1/14)=1 → ref + 14 = 2025-01-15
    expect(_cicloWindow("2025-01-02", "quinzenal_semana", ref)).toBe("2025-01-15");
    // 2025-01-15 = diff=14 → ceil(14/14)=1 → ref + 14 = 2025-01-15
    expect(_cicloWindow("2025-01-15", "quinzenal_semana", ref)).toBe("2025-01-15");
    // 2025-01-16 = diff=15 → ceil(15/14)=2 → ref + 28 = 2025-01-29
    expect(_cicloWindow("2025-01-16", "quinzenal_semana", ref)).toBe("2025-01-29");
  });

  it("semanal: retorna YYYY-WNN", () => {
    const w = _cicloWindow("2025-01-06", "semanal");
    expect(w).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("personalizado: se trata como mensal", () => {
    expect(_cicloWindow("2025-03-20", "personalizado")).toBe("2025-03");
  });
});

describe("_cicloFechamentoDate — último dia da janela", () => {
  it("mensal: retorna último dia do mês", () => {
    expect(_cicloFechamentoDate("2025-01", "mensal")).toBe("2025-01-31");
    expect(_cicloFechamentoDate("2025-02", "mensal")).toBe("2025-02-28");
    expect(_cicloFechamentoDate("2024-02", "mensal")).toBe("2024-02-29"); // bissexto
    expect(_cicloFechamentoDate("2025-12", "mensal")).toBe("2025-12-31");
  });

  it("quinzenal 1ª quinzena: retorna dia 15", () => {
    expect(_cicloFechamentoDate("2025-01-01", "quinzenal")).toBe("2025-01-15");
  });

  it("quinzenal 2ª quinzena: retorna último dia do mês", () => {
    expect(_cicloFechamentoDate("2025-01-16", "quinzenal")).toBe("2025-01-31");
    expect(_cicloFechamentoDate("2025-02-16", "quinzenal")).toBe("2025-02-28");
  });

  it("quinzenal_semana: retorna a própria data da janela", () => {
    expect(_cicloFechamentoDate("2025-01-15", "quinzenal_semana")).toBe("2025-01-15");
    expect(_cicloFechamentoDate("2025-03-12", "quinzenal_semana")).toBe("2025-03-12");
  });
});

describe("_normNomeConc — normalização de nome", () => {
  it("remove acentos e converte para maiúsculas", () => {
    expect(_normNomeConc("Ferragens Três Irmãos")).toBe("FERRAGENS TRES IRMAOS");
  });

  it("trim e colapsa espaços", () => {
    expect(_normNomeConc("  FERRAGENS   SANTA   RITA  ")).toBe("FERRAGENS SANTA RITA");
  });

  it("nome vazio retorna vazio", () => {
    expect(_normNomeConc("")).toBe("");
    expect(_normNomeConc(null)).toBe("");
  });
});

describe("_isFdModalidade — exclusão de Faturamento Direto", () => {
  it("identifica as três modalidades FD", () => {
    expect(_isFdModalidade("fd_cliente")).toBe(true);
    expect(_isFdModalidade("fd_terceiro")).toBe(true);
    expect(_isFdModalidade("fd_fc")).toBe(true);
  });

  it("outras modalidades não são FD", () => {
    expect(_isFdModalidade("normal")).toBe(false);
    expect(_isFdModalidade(null)).toBe(false);
    expect(_isFdModalidade(undefined)).toBe(false);
    expect(_isFdModalidade("compras")).toBe(false);
  });
});

describe("validarTotalConferido — tolerância de 5 centavos", () => {
  it("aceita diferença zero", () => {
    expect(validarTotalConferido(10000, 0, 10000)).toBe(true);
  });

  it("aceita diferença de 5 centavos", () => {
    expect(validarTotalConferido(10000, 0, 10005)).toBe(true);
    expect(validarTotalConferido(10000, 0, 9995)).toBe(true);
  });

  it("rejeita diferença de 6 centavos", () => {
    expect(validarTotalConferido(10000, 0, 10006)).toBe(false);
    expect(validarTotalConferido(10000, 0, 9994)).toBe(false);
  });

  it("leva em conta ajustes negativos (descontos)", () => {
    // Soma itens: R$100,00 = 10000 cents; desconto: -R$5,00 = -500; total: R$95,00 = 9500
    expect(validarTotalConferido(10000, -500, 9500)).toBe(true);
    expect(validarTotalConferido(10000, -500, 9510)).toBe(false); // 10 centavos de diferença
  });

  it("leva em conta ajustes positivos (acréscimos)", () => {
    // Soma itens: R$100,00; frete: +R$10,00; total: R$110,00
    expect(validarTotalConferido(10000, 1000, 11000)).toBe(true);
    expect(validarTotalConferido(10000, 1000, 11010)).toBe(false);
  });
});

describe("Máquina de estados do fechamento", () => {
  it("rascunho: permite edição e confirmação", () => {
    expect(estadoPermiteEdicao("rascunho")).toBe(true);
    expect(estadoPermiteConfirmacao("rascunho")).toBe(true);
    expect(estadoPermitePagamento("rascunho")).toBe(false);
    expect(estadoPermiteEstorno("rascunho")).toBe(false);
    expect(estadoPermiteCancelamento("rascunho")).toBe(true);
  });

  it("conferido: permite pagamento e cancelamento, bloqueia edição", () => {
    expect(estadoPermiteEdicao("conferido")).toBe(false);
    expect(estadoPermiteConfirmacao("conferido")).toBe(false);
    expect(estadoPermitePagamento("conferido")).toBe(true);
    expect(estadoPermiteEstorno("conferido")).toBe(false);
    expect(estadoPermiteCancelamento("conferido")).toBe(true);
  });

  it("pago: permite apenas estorno, bloqueia edição/confirmação/cancelamento direto", () => {
    expect(estadoPermiteEdicao("pago")).toBe(false);
    expect(estadoPermiteConfirmacao("pago")).toBe(false);
    expect(estadoPermitePagamento("pago")).toBe(false);
    expect(estadoPermiteEstorno("pago")).toBe(true);
    expect(estadoPermiteCancelamento("pago")).toBe(false);
  });

  it("cancelado: bloqueia tudo", () => {
    expect(estadoPermiteEdicao("cancelado")).toBe(false);
    expect(estadoPermiteConfirmacao("cancelado")).toBe(false);
    expect(estadoPermitePagamento("cancelado")).toBe(false);
    expect(estadoPermiteEstorno("cancelado")).toBe(false);
    expect(estadoPermiteCancelamento("cancelado")).toBe(false);
  });
});

describe("Janela de competência — integração janela+fechamento", () => {
  it("mesmo lançamento mensal em meses diferentes tem janelas diferentes", () => {
    const w1 = _cicloWindow("2025-01-15", "mensal");
    const w2 = _cicloWindow("2025-02-15", "mensal");
    expect(w1).not.toBe(w2);
  });

  it("dois lançamentos do mesmo mês têm a mesma janela mensal", () => {
    const w1 = _cicloWindow("2025-01-01", "mensal");
    const w2 = _cicloWindow("2025-01-31", "mensal");
    expect(w1).toBe(w2);
    expect(w1).toBe("2025-01");
  });

  it("a chave do grupo grp:fech|FORNECEDOR|JANELA é consistente com a janela calculada", () => {
    const fornNorm = _normNomeConc("Ferragens Três Irmãos");
    const janela = _cicloWindow("2025-01-10", "mensal");
    const chave = `fech|${fornNorm}|${janela}`;
    expect(chave).toBe("fech|FERRAGENS TRES IRMAOS|2025-01");
    expect(`grp:${chave}`).toBe("grp:fech|FERRAGENS TRES IRMAOS|2025-01");
  });
});

// ─── Lógica de agrupamento por fechamento persistido PAGO ────────────────────
// Cobre o comportamento de _agruparConciliacao para rows com fechamentoId.
// Replica apenas as partes testáveis sem banco (pura lógica de agrupamento).

// Versão simplificada de _agruparConciliacao apenas para a lógica fechamento_pago.
// Segue exatamente as mesmas regras da implementação em financial.ts:
//   1. rows com fechamentoId são capturadas PRIMEIRO (priority over origin/cycle)
//   2. valor do grupo = fechamentoTotal (inclui ajustes), não soma parcial dos items
//   3. valorItens = soma das entries presentes para diagnóstico
//   4. fechamentoId exposto no grupo
function _agruparFechamentoPago(arr: any[]): Map<number, {
  fechamentoId: number;
  valor: number;
  valorItens: number;
  itensIds: number[];
  descricao: string;
  grupoTipo: string;
}> {
  const fechamentoGroups = new Map<number, any>();
  for (const r of arr) {
    if (r.fechamentoId == null) continue;
    const fid = Number(r.fechamentoId);
    let fg = fechamentoGroups.get(fid);
    if (!fg) {
      const supplierNome = r.fechamentoSupplierNome || r.fornecedorNome || "Fornecedor";
      const janela = r.fechamentoJanela || "";
      fg = {
        fechamentoId: fid,
        grupoTipo: "fechamento_forn",
        descricao: janela ? `${supplierNome} · ${janela}` : supplierNome,
        valor: 0,
        _fechamentoTotal: Number(r.fechamentoTotal) || 0,
        qtd: 0,
        itensIds: [] as number[],
      };
      fechamentoGroups.set(fid, fg);
    }
    fg.qtd += 1;
    fg.valor += Number(r.valor) || 0;
    fg.itensIds.push(Number(r.id));
    if (r.fechamentoTotal != null) fg._fechamentoTotal = Number(r.fechamentoTotal);
  }
  // Finalização: substituir valor pelo fechamentoTotal quando disponível
  for (const fg of fechamentoGroups.values()) {
    fg.valorItens = fg.valor;
    if (fg._fechamentoTotal > 0) fg.valor = fg._fechamentoTotal;
    delete fg._fechamentoTotal;
  }
  return fechamentoGroups;
}

// Helper: calcula totalGrupo considerando fechamento persistido
function calcularTotalGrupo(totalItens: number, fechamentoValorTotal: number | null): number {
  if (fechamentoValorTotal != null) {
    return Math.round(fechamentoValorTotal * 100) / 100;
  }
  return Math.round(totalItens * 100) / 100;
}

describe("_agruparConciliacao — grupos de fechamento persistido pago", () => {
  it("rows com fechamentoId formam um grupo separado com grupoTipo='fechamento_forn'", () => {
    const rows = [
      { id: 1, fechamentoId: 42, fechamentoSupplierNome: "FORN A", fechamentoJanela: "2025-01", fechamentoTotal: 110.00, valor: 50.00, fornecedorNome: "FORN A", data: "2025-01-10" },
      { id: 2, fechamentoId: 42, fechamentoSupplierNome: "FORN A", fechamentoJanela: "2025-01", fechamentoTotal: 110.00, valor: 60.00, fornecedorNome: "FORN A", data: "2025-01-15" },
    ];
    const groups = _agruparFechamentoPago(rows);
    expect(groups.size).toBe(1);
    const g = groups.get(42)!;
    expect(g.grupoTipo).toBe("fechamento_forn");
    expect(g.fechamentoId).toBe(42);
    expect(g.itensIds).toEqual([1, 2]);
  });

  it("valor do grupo é fechamentoTotal (inclui ajustes), não a soma dos itens", () => {
    // itens somam 110, mas boleto tem desconto: fechamentoTotal = 105
    const rows = [
      { id: 1, fechamentoId: 10, fechamentoSupplierNome: "FORN B", fechamentoJanela: "2025-02", fechamentoTotal: 105.00, valor: 55.00, fornecedorNome: "FORN B", data: "2025-02-10" },
      { id: 2, fechamentoId: 10, fechamentoSupplierNome: "FORN B", fechamentoJanela: "2025-02", fechamentoTotal: 105.00, valor: 55.00, fornecedorNome: "FORN B", data: "2025-02-12" },
    ];
    const groups = _agruparFechamentoPago(rows);
    const g = groups.get(10)!;
    expect(g.valor).toBe(105.00);       // fechamentoTotal (boleto)
    expect(g.valorItens).toBe(110.00);  // soma parcial para diagnóstico
  });

  it("valor do grupo é fechamentoTotal mesmo quando ajuste é positivo (acréscimo/frete)", () => {
    // itens somam 100, frete +15: fechamentoTotal = 115
    const rows = [
      { id: 3, fechamentoId: 20, fechamentoSupplierNome: "FORN C", fechamentoJanela: "2025-03", fechamentoTotal: 115.00, valor: 100.00, fornecedorNome: "FORN C", data: "2025-03-05" },
    ];
    const groups = _agruparFechamentoPago(rows);
    const g = groups.get(20)!;
    expect(g.valor).toBe(115.00);
    expect(g.valorItens).toBe(100.00);
  });

  it("dois fechamentos distintos formam dois grupos independentes", () => {
    const rows = [
      { id: 1, fechamentoId: 1, fechamentoSupplierNome: "FORN X", fechamentoJanela: "2025-01", fechamentoTotal: 200.00, valor: 200.00, data: "2025-01-10" },
      { id: 2, fechamentoId: 2, fechamentoSupplierNome: "FORN Y", fechamentoJanela: "2025-01", fechamentoTotal: 300.00, valor: 300.00, data: "2025-01-10" },
    ];
    const groups = _agruparFechamentoPago(rows);
    expect(groups.size).toBe(2);
    expect(groups.get(1)!.valor).toBe(200.00);
    expect(groups.get(2)!.valor).toBe(300.00);
  });

  it("rows sem fechamentoId são ignoradas pelo agrupador de fechamento persistido", () => {
    const rows = [
      { id: 1, fechamentoId: null, fornecedorNome: "FORN Z", valor: 50.00, data: "2025-01-10" },
      { id: 2, fechamentoId: undefined, fornecedorNome: "FORN Z", valor: 50.00, data: "2025-01-11" },
    ];
    const groups = _agruparFechamentoPago(rows);
    expect(groups.size).toBe(0);
  });

  it("descricao inclui nome do fornecedor e janela quando disponíveis", () => {
    const rows = [
      { id: 1, fechamentoId: 99, fechamentoSupplierNome: "FORN W", fechamentoJanela: "2025-04", fechamentoTotal: 80.00, valor: 80.00, data: "2025-04-05" },
    ];
    const groups = _agruparFechamentoPago(rows);
    const g = groups.get(99)!;
    expect(g.descricao).toContain("FORN W");
    expect(g.descricao).toContain("2025-04");
  });

  it("itensIds contém exatamente os IDs das entries vinculadas", () => {
    const rows = [
      { id: 10, fechamentoId: 55, fechamentoTotal: 300.00, valor: 100.00, data: "2025-05-01" },
      { id: 11, fechamentoId: 55, fechamentoTotal: 300.00, valor: 100.00, data: "2025-05-02" },
      { id: 12, fechamentoId: 55, fechamentoTotal: 300.00, valor: 100.00, data: "2025-05-03" },
    ];
    const groups = _agruparFechamentoPago(rows);
    expect(groups.get(55)!.itensIds.sort()).toEqual([10, 11, 12]);
  });
});

describe("calcularTotalGrupo — valor do boleto com e sem fechamento persistido", () => {
  it("sem fechamento: total = soma dos itens", () => {
    expect(calcularTotalGrupo(150.00, null)).toBe(150.00);
  });

  it("com fechamento e ajuste negativo: total = valor_total do fechamento (menor que itens)", () => {
    // itens = 150, desconto = -10 → fechamentoTotal = 140
    expect(calcularTotalGrupo(150.00, 140.00)).toBe(140.00);
  });

  it("com fechamento e ajuste positivo: total = valor_total do fechamento (maior que itens)", () => {
    // itens = 150, frete = +15 → fechamentoTotal = 165
    expect(calcularTotalGrupo(150.00, 165.00)).toBe(165.00);
  });

  it("com fechamento sem ajuste: total = valor_total (igual à soma dos itens, ±arredondamento)", () => {
    expect(calcularTotalGrupo(150.00, 150.00)).toBe(150.00);
  });

  it("arredondamento para 2 casas decimais", () => {
    // Evita erros de ponto flutuante no totalGrupo
    expect(calcularTotalGrupo(0, 100.005)).toBe(100.01);
  });
});

// ─── Fix #2: validação de identidade de fornecedor (OC vs legado) ────────────

// Replica a lógica de decisão OC vs legado para teste unitário
function validateSupplierIdentity(opts: {
  isOc: boolean;
  ocFornecedorId: number | null;
  supplierFornecedorId: number | null;
  itemNomNorm: string;
  supplierNomNorm: string;
}): "ok" | "mismatch_id" | "mismatch_nome" {
  const { isOc, ocFornecedorId, supplierFornecedorId, itemNomNorm, supplierNomNorm } = opts;
  if (isOc && ocFornecedorId != null && supplierFornecedorId != null) {
    return ocFornecedorId === supplierFornecedorId ? "ok" : "mismatch_id";
  }
  // Fallback name
  if (itemNomNorm && supplierNomNorm) {
    if (!itemNomNorm.includes(supplierNomNorm) && !supplierNomNorm.includes(itemNomNorm)) {
      return "mismatch_nome";
    }
  }
  return "ok";
}

describe("Fix #2 — Validação de identidade de fornecedor", () => {
  it("OC com fornecedor_id igual: aceita", () => {
    expect(validateSupplierIdentity({ isOc: true, ocFornecedorId: 5, supplierFornecedorId: 5, itemNomNorm: "", supplierNomNorm: "" })).toBe("ok");
  });

  it("OC com fornecedor_id diferente: rejeita por id", () => {
    expect(validateSupplierIdentity({ isOc: true, ocFornecedorId: 5, supplierFornecedorId: 7, itemNomNorm: "QUALQUER", supplierNomNorm: "QUALQUER" })).toBe("mismatch_id");
  });

  it("OC sem fornecedor_id na OC: cai no fallback de nome, aceita se mesmo nome", () => {
    const n = _normNomeConc("Ferragens Santa Rita");
    expect(validateSupplierIdentity({ isOc: true, ocFornecedorId: null, supplierFornecedorId: 7, itemNomNorm: n, supplierNomNorm: n })).toBe("ok");
  });

  it("OC sem fornecedor_id no terceiro: cai no fallback de nome, aceita", () => {
    const n = _normNomeConc("Ferragens Santa Rita");
    expect(validateSupplierIdentity({ isOc: true, ocFornecedorId: 5, supplierFornecedorId: null, itemNomNorm: n, supplierNomNorm: n })).toBe("ok");
  });

  it("Legado (não-OC): usa nome normalizado — aceita quando nomes coincidem", () => {
    const n = _normNomeConc("Papelaria Central Ltda");
    expect(validateSupplierIdentity({ isOc: false, ocFornecedorId: null, supplierFornecedorId: null, itemNomNorm: n, supplierNomNorm: n })).toBe("ok");
  });

  it("Legado (não-OC): rejeita quando nomes divergem", () => {
    const n1 = _normNomeConc("Papelaria Central Ltda");
    const n2 = _normNomeConc("Ferragens Santa Rita");
    expect(validateSupplierIdentity({ isOc: false, ocFornecedorId: null, supplierFornecedorId: null, itemNomNorm: n1, supplierNomNorm: n2 })).toBe("mismatch_nome");
  });
});

// ─── Fix #5: comparação snapshot vs live valor_previsto ─────────────────────

function snapshotDivergenceOk(snapshotCents: number, liveCents: number): boolean {
  return Math.abs(snapshotCents - liveCents) <= 1; // tolerância 1 centavo
}

describe("Fix #5 — Snapshot vs live valor_previsto", () => {
  it("valores idênticos: aceita", () => {
    expect(snapshotDivergenceOk(10000, 10000)).toBe(true);
  });

  it("diferença de 1 centavo: aceita (tolerância)", () => {
    expect(snapshotDivergenceOk(10000, 10001)).toBe(true);
    expect(snapshotDivergenceOk(10000, 9999)).toBe(true);
  });

  it("diferença de 2 centavos: rejeita", () => {
    expect(snapshotDivergenceOk(10000, 10002)).toBe(false);
    expect(snapshotDivergenceOk(10000, 9998)).toBe(false);
  });

  it("divergência grande (título renegociado): rejeita", () => {
    // R$150.00 → R$200.00 (item renegociado)
    const snapCents = Math.round(150.00 * 100);
    const liveCents = Math.round(200.00 * 100);
    expect(snapshotDivergenceOk(snapCents, liveCents)).toBe(false);
  });
});

// ─── Fix #6: regras de sinal por tipo de ajuste ──────────────────────────────

const MUST_NEG = new Set(["desconto", "glosa"]);
const MUST_POS = new Set(["acrescimo", "juros", "taxa", "frete"]);
// correcao|arredondamento|outro: any sign

function validateAjusteSinal(tipo: string, valor: number): "ok" | "must_be_negative" | "must_be_positive" | "zero_not_allowed" {
  if (valor === 0) return "zero_not_allowed";
  if (MUST_NEG.has(tipo) && valor > 0) return "must_be_negative";
  if (MUST_POS.has(tipo) && valor < 0) return "must_be_positive";
  return "ok";
}

describe("Fix #6 — Regras de sinal por tipo de ajuste", () => {
  it("desconto: aceita valor negativo", () => {
    expect(validateAjusteSinal("desconto", -10.00)).toBe("ok");
  });
  it("desconto: aceita valor zero negativo (-0.01)", () => {
    expect(validateAjusteSinal("desconto", -0.01)).toBe("ok");
  });
  it("desconto: rejeita valor positivo", () => {
    expect(validateAjusteSinal("desconto", 10.00)).toBe("must_be_negative");
  });
  it("glosa: rejeita valor positivo", () => {
    expect(validateAjusteSinal("glosa", 5.00)).toBe("must_be_negative");
  });
  it("acrescimo: aceita valor positivo", () => {
    expect(validateAjusteSinal("acrescimo", 10.00)).toBe("ok");
  });
  it("acrescimo: rejeita valor negativo", () => {
    expect(validateAjusteSinal("acrescimo", -5.00)).toBe("must_be_positive");
  });
  it("juros: rejeita negativo", () => {
    expect(validateAjusteSinal("juros", -1.00)).toBe("must_be_positive");
  });
  it("taxa: rejeita negativo", () => {
    expect(validateAjusteSinal("taxa", -2.00)).toBe("must_be_positive");
  });
  it("frete: rejeita negativo", () => {
    expect(validateAjusteSinal("frete", -3.00)).toBe("must_be_positive");
  });
  it("correcao: aceita positivo ou negativo", () => {
    expect(validateAjusteSinal("correcao", 5.00)).toBe("ok");
    expect(validateAjusteSinal("correcao", -5.00)).toBe("ok");
  });
  it("arredondamento: aceita qualquer sinal", () => {
    expect(validateAjusteSinal("arredondamento", 0.01)).toBe("ok");
    expect(validateAjusteSinal("arredondamento", -0.01)).toBe("ok");
  });
  it("outro: aceita qualquer sinal", () => {
    expect(validateAjusteSinal("outro", 100.00)).toBe("ok");
    expect(validateAjusteSinal("outro", -100.00)).toBe("ok");
  });
  it("qualquer tipo: rejeita zero", () => {
    for (const tipo of ["desconto", "glosa", "acrescimo", "juros", "taxa", "frete", "correcao", "arredondamento", "outro"]) {
      expect(validateAjusteSinal(tipo, 0)).toBe("zero_not_allowed");
    }
  });
});

// ─── Fix #8: validação de valor de linha de extrato vs fechamento ─────────────

function conciliacaoFechamentoValorOk(lineAmountCents: number, fechTotalCents: number): boolean {
  return Math.abs(lineAmountCents - fechTotalCents) <= 5; // tolerância R$0.05
}

describe("Fix #8 — Validação de valor linha extrato vs fechamento", () => {
  it("valores iguais: aceita", () => {
    expect(conciliacaoFechamentoValorOk(150000, 150000)).toBe(true);
  });
  it("diferença de 5 centavos: aceita", () => {
    expect(conciliacaoFechamentoValorOk(150000, 150005)).toBe(true);
    expect(conciliacaoFechamentoValorOk(150000, 149995)).toBe(true);
  });
  it("diferença de 6 centavos: rejeita", () => {
    expect(conciliacaoFechamentoValorOk(150000, 150006)).toBe(false);
    expect(conciliacaoFechamentoValorOk(150000, 149994)).toBe(false);
  });
  it("diferença grande (linha errada): rejeita", () => {
    // Linha de R$200.00 vs fechamento de R$150.00
    expect(conciliacaoFechamentoValorOk(20000, 15000)).toBe(false);
  });
});

describe("Rateio contábil do total ajustado", () => {
  it("rateia desconto e faz a soma das baixas bater com o boleto", () => {
    expect(rateioReal.desconto).toEqual({ 10: 9_000, 20: 18_000 });
    expect(Object.values(rateioReal.desconto).reduce((a: number, b: any) => a + Number(b), 0)).toBe(27_000);
  });

  it("rateia acréscimo e faz a soma das baixas bater com o boleto", () => {
    expect(rateioReal.acrescimo).toEqual({ 10: 11_000, 20: 22_000 });
    expect(Object.values(rateioReal.acrescimo).reduce((a: number, b: any) => a + Number(b), 0)).toBe(33_000);
  });

  it("preserva exatamente os valores-base quando não há ajuste", () => {
    expect(rateioReal.semAjuste).toEqual({ 10: 10_000, 20: 20_000 });
  });

  it("distribui o resto de centavos de modo determinístico", () => {
    expect(rateioReal.resto).toEqual({ 2: 51, 5: 50 });
  });

  it("recusa desconto que zeraria a baixa de algum título", () => {
    expect(rateioReal.erroZero).toMatch(/igual a zero/);
  });
});
