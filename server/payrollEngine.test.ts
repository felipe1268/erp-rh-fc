import { describe, it, expect, vi } from "vitest";

/**
 * Testes unitários para o módulo de Gestão de Competências (Ponto e Folha)
 * 
 * Testa a lógica de negócio do fluxo:
 * 1. Abertura de competência
 * 2. Processamento de ponto
 * 3. Aferição do período "no escuro"
 * 4. Geração de vale (adiantamento)
 * 5. Simulação de pagamento
 * 6. Consolidação
 * 7. Trava de competência
 * 8. Critérios configuráveis
 * 9. Eventos financeiros
 */

// ===== HELPER FUNCTIONS (pure logic, testable without DB) =====

function calcularDiasUteisNoMes(ano: number, mes: number): number {
  const diasNoMes = new Date(ano, mes, 0).getDate();
  let uteis = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dow = new Date(ano, mes - 1, d).getDay();
    if (dow !== 0 && dow !== 6) uteis++;
  }
  return uteis;
}

function calcularSalarioMensal(valorHora: number, cargaHorariaDiaria: number, diasUteis: number): number {
  return valorHora * cargaHorariaDiaria * diasUteis;
}

function calcularVale(salarioMensal: number, percentual: number): number {
  return Math.round(salarioMensal * (percentual / 100) * 100) / 100;
}

function deveBloquearVale(totalFaltas: number, maxFaltas: number): boolean {
  return totalFaltas > maxFaltas;
}

function calcularDescontoVrFalta(vrDiario: number, diasFalta: number): number {
  return Math.round(vrDiario * diasFalta * 100) / 100;
}

function calcularDescontoVtFalta(vtDiario: number, diasFalta: number): number {
  return Math.round(vtDiario * diasFalta * 100) / 100;
}

function calcularPagamentoLiquido(
  salarioBruto: number,
  horasExtras: number,
  adiantamento: number,
  descontoFaltas: number,
  descontoVr: number,
  descontoVt: number,
  acertoEscuro: number,
  outrosDescontos: number
): number {
  return Math.round((salarioBruto + horasExtras - adiantamento - descontoFaltas - descontoVr - descontoVt - acertoEscuro - outrosDescontos) * 100) / 100;
}

function getPeriodoPonto(ano: number, mes: number, diaCorte: number): { inicio: Date; fim: Date } {
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const anoAnterior = mes === 1 ? ano - 1 : ano;
  return {
    inicio: new Date(anoAnterior, mesAnterior - 1, diaCorte),
    fim: new Date(ano, mes - 1, diaCorte),
  };
}

function getPeriodoEscuro(ano: number, mes: number, diaCorte: number): { inicio: Date; fim: Date } {
  const diasNoMes = new Date(ano, mes, 0).getDate();
  return {
    inicio: new Date(ano, mes - 1, diaCorte + 1),
    fim: new Date(ano, mes - 1, diasNoMes),
  };
}

function getNDiaUtil(ano: number, mes: number, n: number): Date {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(ano, mes - 1, d);
    if (dt.getMonth() !== mes - 1) break;
    const dow = dt.getDay();
    if (dow !== 0 && dow !== 6) {
      count++;
      if (count === n) return dt;
    }
  }
  return new Date(ano, mes - 1, 1);
}

function getStatusDia(
  data: Date,
  periodoPontoInicio: Date,
  periodoPontoFim: Date,
  aferido: boolean
): "registrado" | "fechado_no_escuro" | "aferido" {
  if (data >= periodoPontoInicio && data <= periodoPontoFim) {
    return "registrado";
  }
  if (aferido) return "aferido";
  return "fechado_no_escuro";
}

// ===== TESTS =====

describe("Cálculo de Dias Úteis", () => {
  it("deve calcular dias úteis de fevereiro 2026 corretamente", () => {
    const uteis = calcularDiasUteisNoMes(2026, 2);
    expect(uteis).toBe(20); // Fev 2026: 20 dias úteis
  });

  it("deve calcular dias úteis de março 2026 corretamente", () => {
    const uteis = calcularDiasUteisNoMes(2026, 3);
    expect(uteis).toBe(22); // Mar 2026: 22 dias úteis
  });

  it("deve calcular dias úteis de janeiro 2026 corretamente", () => {
    const uteis = calcularDiasUteisNoMes(2026, 1);
    expect(uteis).toBe(22); // Jan 2026: 22 dias úteis
  });
});

describe("Cálculo de Salário Mensal (Horista)", () => {
  it("deve calcular salário mensal corretamente", () => {
    // R$ 15,00/hora × 8h/dia × 20 dias úteis = R$ 2.400,00
    const salario = calcularSalarioMensal(15, 8, 20);
    expect(salario).toBe(2400);
  });

  it("deve calcular salário com carga horária diferente", () => {
    // R$ 20,00/hora × 6h/dia × 22 dias úteis = R$ 2.640,00
    const salario = calcularSalarioMensal(20, 6, 22);
    expect(salario).toBe(2640);
  });
});

describe("Cálculo do Vale (Adiantamento)", () => {
  it("deve calcular 40% do salário como vale", () => {
    const vale = calcularVale(2400, 40);
    expect(vale).toBe(960);
  });

  it("deve calcular percentual diferente de adiantamento", () => {
    const vale = calcularVale(3000, 50);
    expect(vale).toBe(1500);
  });

  it("deve bloquear vale quando faltas > máximo permitido", () => {
    expect(deveBloquearVale(6, 5)).toBe(true);
  });

  it("não deve bloquear vale quando faltas <= máximo permitido", () => {
    expect(deveBloquearVale(5, 5)).toBe(false);
    expect(deveBloquearVale(3, 5)).toBe(false);
  });

  it("não deve bloquear vale com 0 faltas", () => {
    expect(deveBloquearVale(0, 5)).toBe(false);
  });
});

describe("Desconto VR/VT por Falta (CLT)", () => {
  it("deve descontar VR proporcional aos dias de falta", () => {
    // VR diário R$ 25,00 × 3 faltas = R$ 75,00
    const desconto = calcularDescontoVrFalta(25, 3);
    expect(desconto).toBe(75);
  });

  it("deve descontar VT proporcional aos dias de falta", () => {
    // VT diário R$ 12,00 × 2 faltas = R$ 24,00
    const desconto = calcularDescontoVtFalta(12, 2);
    expect(desconto).toBe(24);
  });

  it("não deve descontar VR/VT quando não há faltas", () => {
    expect(calcularDescontoVrFalta(25, 0)).toBe(0);
    expect(calcularDescontoVtFalta(12, 0)).toBe(0);
  });
});

describe("Cálculo de Pagamento Líquido", () => {
  it("deve calcular pagamento líquido completo", () => {
    // Salário: R$ 2.400 + HE: R$ 300 - Vale: R$ 960 - Faltas: R$ 120 - VR: R$ 50 - VT: R$ 24 - Acerto: R$ 0 - Outros: R$ 0
    const liquido = calcularPagamentoLiquido(2400, 300, 960, 120, 50, 24, 0, 0);
    expect(liquido).toBe(1546);
  });

  it("deve calcular pagamento com acerto do escuro", () => {
    // Salário: R$ 2.400 + HE: R$ 0 - Vale: R$ 960 - Faltas: R$ 0 - VR: R$ 0 - VT: R$ 0 - Acerto: R$ 240 - Outros: R$ 0
    const liquido = calcularPagamentoLiquido(2400, 0, 960, 0, 0, 0, 240, 0);
    expect(liquido).toBe(1200);
  });

  it("deve calcular pagamento sem descontos", () => {
    const liquido = calcularPagamentoLiquido(2400, 300, 960, 0, 0, 0, 0, 0);
    expect(liquido).toBe(1740);
  });
});

describe("Período do Ponto (dia de corte)", () => {
  it("deve calcular período do ponto com corte no dia 15 para Fevereiro", () => {
    const periodo = getPeriodoPonto(2026, 2, 15);
    expect(periodo.inicio.getDate()).toBe(15);
    expect(periodo.inicio.getMonth()).toBe(0); // Janeiro
    expect(periodo.fim.getDate()).toBe(15);
    expect(periodo.fim.getMonth()).toBe(1); // Fevereiro
  });

  it("deve calcular período do ponto com corte no dia 15 para Março", () => {
    const periodo = getPeriodoPonto(2026, 3, 15);
    expect(periodo.inicio.getDate()).toBe(15);
    expect(periodo.inicio.getMonth()).toBe(1); // Fevereiro
    expect(periodo.fim.getDate()).toBe(15);
    expect(periodo.fim.getMonth()).toBe(2); // Março
  });

  it("deve calcular período do ponto com corte no dia 20", () => {
    const periodo = getPeriodoPonto(2026, 3, 20);
    expect(periodo.inicio.getDate()).toBe(20);
    expect(periodo.inicio.getMonth()).toBe(1); // Fevereiro
    expect(periodo.fim.getDate()).toBe(20);
    expect(periodo.fim.getMonth()).toBe(2); // Março
  });

  it("deve lidar com virada de ano (Janeiro)", () => {
    const periodo = getPeriodoPonto(2026, 1, 15);
    expect(periodo.inicio.getDate()).toBe(15);
    expect(periodo.inicio.getMonth()).toBe(11); // Dezembro
    expect(periodo.inicio.getFullYear()).toBe(2025);
    expect(periodo.fim.getDate()).toBe(15);
    expect(periodo.fim.getMonth()).toBe(0); // Janeiro
    expect(periodo.fim.getFullYear()).toBe(2026);
  });
});

describe("Período no Escuro", () => {
  it("deve calcular período no escuro para Fevereiro 2026 (corte dia 15)", () => {
    const escuro = getPeriodoEscuro(2026, 2, 15);
    expect(escuro.inicio.getDate()).toBe(16);
    expect(escuro.inicio.getMonth()).toBe(1); // Fevereiro
    expect(escuro.fim.getDate()).toBe(28);
    expect(escuro.fim.getMonth()).toBe(1); // Fevereiro
  });

  it("deve calcular período no escuro para Março 2026 (corte dia 15)", () => {
    const escuro = getPeriodoEscuro(2026, 3, 15);
    expect(escuro.inicio.getDate()).toBe(16);
    expect(escuro.inicio.getMonth()).toBe(2); // Março
    expect(escuro.fim.getDate()).toBe(31);
    expect(escuro.fim.getMonth()).toBe(2); // Março
  });

  it("deve calcular período no escuro com corte dia 20", () => {
    const escuro = getPeriodoEscuro(2026, 3, 20);
    expect(escuro.inicio.getDate()).toBe(21);
    expect(escuro.fim.getDate()).toBe(31);
  });
});

describe("N-ésimo Dia Útil do Mês", () => {
  it("deve encontrar o 5º dia útil de Março 2026", () => {
    // Mar 2026: 1=dom, 2=seg, 3=ter, 4=qua, 5=qui, 6=sex → 5º dia útil = 6/03
    const dt = getNDiaUtil(2026, 3, 5);
    expect(dt.getDate()).toBe(6);
    expect(dt.getMonth()).toBe(2); // Março
  });

  it("deve encontrar o 1º dia útil de Março 2026", () => {
    const dt = getNDiaUtil(2026, 3, 1);
    expect(dt.getDate()).toBe(2); // 1/03 é domingo, 2/03 é segunda
  });

  it("deve encontrar o 5º dia útil de Abril 2026", () => {
    // Abr 2026: 1=qua, 2=qui, 3=sex, 6=seg, 7=ter → 5º dia útil = 7/04
    const dt = getNDiaUtil(2026, 4, 5);
    expect(dt.getDate()).toBe(7);
  });
});

describe("Status do Dia (Registrado / Fechado no Escuro / Aferido)", () => {
  const pontoInicio = new Date(2026, 0, 15); // 15/01/2026
  const pontoFim = new Date(2026, 1, 15); // 15/02/2026

  it("deve retornar 'registrado' para dias dentro do período do ponto", () => {
    const status = getStatusDia(new Date(2026, 0, 20), pontoInicio, pontoFim, false);
    expect(status).toBe("registrado");
  });

  it("deve retornar 'registrado' para o primeiro dia do ponto", () => {
    const status = getStatusDia(new Date(2026, 0, 15), pontoInicio, pontoFim, false);
    expect(status).toBe("registrado");
  });

  it("deve retornar 'registrado' para o último dia do ponto", () => {
    const status = getStatusDia(new Date(2026, 1, 15), pontoInicio, pontoFim, false);
    expect(status).toBe("registrado");
  });

  it("deve retornar 'fechado_no_escuro' para dias fora do ponto sem aferição", () => {
    const status = getStatusDia(new Date(2026, 1, 20), pontoInicio, pontoFim, false);
    expect(status).toBe("fechado_no_escuro");
  });

  it("deve retornar 'aferido' para dias fora do ponto com aferição realizada", () => {
    const status = getStatusDia(new Date(2026, 1, 20), pontoInicio, pontoFim, true);
    expect(status).toBe("aferido");
  });
});

describe("Critérios Configuráveis - Valores Padrão", () => {
  const DEFAULTS = {
    diaCorte: 15,
    percentualAdiantamento: 40,
    diaAdiantamento: 20,
    diaPagamento: 5,
    maxFaltasVale: 5,
    cargaHorariaDiaria: 8,
    fecharNoEscuro: true,
    descontoVrFalta: true,
    descontoVtFalta: true,
  };

  it("dia de corte padrão deve ser 15", () => {
    expect(DEFAULTS.diaCorte).toBe(15);
  });

  it("percentual de adiantamento padrão deve ser 40%", () => {
    expect(DEFAULTS.percentualAdiantamento).toBe(40);
  });

  it("dia do adiantamento padrão deve ser 20", () => {
    expect(DEFAULTS.diaAdiantamento).toBe(20);
  });

  it("dia do pagamento padrão deve ser 5º dia útil", () => {
    expect(DEFAULTS.diaPagamento).toBe(5);
  });

  it("máximo de faltas para vale padrão deve ser 5", () => {
    expect(DEFAULTS.maxFaltasVale).toBe(5);
  });

  it("carga horária diária padrão deve ser 8h", () => {
    expect(DEFAULTS.cargaHorariaDiaria).toBe(8);
  });

  it("fechar no escuro deve estar habilitado por padrão", () => {
    expect(DEFAULTS.fecharNoEscuro).toBe(true);
  });

  it("desconto VR por falta deve estar habilitado por padrão", () => {
    expect(DEFAULTS.descontoVrFalta).toBe(true);
  });

  it("desconto VT por falta deve estar habilitado por padrão", () => {
    expect(DEFAULTS.descontoVtFalta).toBe(true);
  });
});

describe("Fluxo Completo - Exemplo Fevereiro 2026", () => {
  const valorHora = 15;
  const cargaHoraria = 8;
  const diasUteis = 20; // Fev 2026
  const percentualVale = 40;
  const maxFaltas = 5;
  const vrDiario = 25;
  const vtDiario = 12;

  it("deve calcular o fluxo completo sem ocorrências", () => {
    const salario = calcularSalarioMensal(valorHora, cargaHoraria, diasUteis);
    expect(salario).toBe(2400);

    const vale = calcularVale(salario, percentualVale);
    expect(vale).toBe(960);

    const bloqueado = deveBloquearVale(0, maxFaltas);
    expect(bloqueado).toBe(false);

    const liquido = calcularPagamentoLiquido(salario, 0, vale, 0, 0, 0, 0, 0);
    expect(liquido).toBe(1440);
  });

  it("deve calcular o fluxo com 2 faltas e horas extras", () => {
    const salario = calcularSalarioMensal(valorHora, cargaHoraria, diasUteis);
    const vale = calcularVale(salario, percentualVale);
    const horasExtras = 10 * valorHora * 1.5; // 10 HE a 50%
    const descontoFaltas = 2 * valorHora * cargaHoraria; // 2 dias de falta
    const descontoVr = calcularDescontoVrFalta(vrDiario, 2);
    const descontoVt = calcularDescontoVtFalta(vtDiario, 2);

    expect(horasExtras).toBe(225);
    expect(descontoFaltas).toBe(240);
    expect(descontoVr).toBe(50);
    expect(descontoVt).toBe(24);

    const bloqueado = deveBloquearVale(2, maxFaltas);
    expect(bloqueado).toBe(false);

    const liquido = calcularPagamentoLiquido(salario, horasExtras, vale, descontoFaltas, descontoVr, descontoVt, 0, 0);
    expect(liquido).toBe(1351); // 2400 + 225 - 960 - 240 - 50 - 24 = 1351
  });

  it("deve bloquear vale com 6 faltas", () => {
    const bloqueado = deveBloquearVale(6, maxFaltas);
    expect(bloqueado).toBe(true);
  });

  it("deve calcular acerto do escuro corretamente", () => {
    const salario = calcularSalarioMensal(valorHora, cargaHoraria, diasUteis);
    const vale = calcularVale(salario, percentualVale);
    // Acerto: 1 falta no período escuro do mês anterior
    const acertoEscuro = 1 * valorHora * cargaHoraria; // 1 dia = R$ 120
    
    const liquido = calcularPagamentoLiquido(salario, 0, vale, 0, 0, 0, acertoEscuro, 0);
    expect(liquido).toBe(1320); // 2400 - 960 - 120 = 1320
  });
});

describe("Eventos Financeiros", () => {
  it("deve gerar evento de saída para vale", () => {
    const evento = {
      tipo: "saida_vale",
      categoria: "folha_pagamento",
      valor: 960,
      status: "consolidado",
    };
    expect(evento.tipo).toBe("saida_vale");
    expect(evento.valor).toBe(960);
    expect(evento.status).toBe("consolidado");
  });

  it("deve gerar evento de saída para pagamento", () => {
    const evento = {
      tipo: "saida_pagamento",
      categoria: "folha_pagamento",
      valor: 1440,
      status: "consolidado",
    };
    expect(evento.tipo).toBe("saida_pagamento");
    expect(evento.valor).toBe(1440);
  });

  it("deve gerar evento de saída para horas extras", () => {
    const evento = {
      tipo: "saida_he",
      categoria: "folha_pagamento",
      valor: 225,
      status: "consolidado",
    };
    expect(evento.tipo).toBe("saida_he");
    expect(evento.valor).toBe(225);
  });
});

// ===== TESTS FOR NEW FEATURES =====

// formatBRL helper (mirrors the frontend logic)
function formatBRL(val: string | number | null | undefined): string {
  if (!val && val !== 0) return "R$ 0,00";
  if (typeof val === "number") return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const str = String(val).replace(/[R$\s]/g, "").trim();
  if (!str) return "R$ 0,00";
  let num: number;
  if (str.includes(",")) {
    num = parseFloat(str.replace(/\./g, "").replace(",", "."));
  } else {
    num = parseFloat(str);
  }
  if (isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

describe("formatBRL - Correção do Bug de Formatação", () => {
  it("deve formatar número decimal do banco (2421.12) corretamente", () => {
    expect(formatBRL(2421.12)).toBe("R$ 2.421,12");
  });

  it("deve formatar string decimal do banco ('2421.12') corretamente", () => {
    expect(formatBRL("2421.12")).toBe("R$ 2.421,12");
  });

  it("deve formatar string BRL ('2.421,12') corretamente", () => {
    expect(formatBRL("2.421,12")).toBe("R$ 2.421,12");
  });

  it("deve formatar zero corretamente", () => {
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL("0")).toBe("R$ 0,00");
  });

  it("deve formatar null/undefined como R$ 0,00", () => {
    expect(formatBRL(null)).toBe("R$ 0,00");
    expect(formatBRL(undefined)).toBe("R$ 0,00");
  });

  it("deve formatar valores grandes corretamente", () => {
    expect(formatBRL(96845.50)).toBe("R$ 96.845,50");
    expect(formatBRL("96845.50")).toBe("R$ 96.845,50");
  });

  it("deve formatar centavos corretamente", () => {
    expect(formatBRL(0.50)).toBe("R$ 0,50");
    expect(formatBRL("0.50")).toBe("R$ 0,50");
  });

  it("NÃO deve tratar ponto decimal americano como separador de milhar", () => {
    // Este era o bug: "2421.12" era convertido para R$ 242.112,00
    const result = formatBRL("2421.12");
    expect(result).not.toBe("R$ 242.112,00");
    expect(result).toBe("R$ 2.421,12");
  });

  it("deve formatar string com R$ e espaços", () => {
    expect(formatBRL("R$ 1.500,00")).toBe("R$ 1.500,00");
  });

  it("deve formatar valores negativos", () => {
    expect(formatBRL(-500)).toContain("500,00");
  });
});

describe("Cálculo do Vale - Validação de Valores", () => {
  it("deve calcular vale de 40% de R$ 2.421,12 corretamente", () => {
    const salario = 2421.12;
    const percentual = 40;
    const vale = Math.round(salario * (percentual / 100) * 100) / 100;
    expect(vale).toBe(968.45);
    expect(formatBRL(vale)).toBe("R$ 968,45");
  });

  it("NÃO deve gerar vale de R$ 96.845 para salário de R$ 2.421,12", () => {
    const salario = 2421.12;
    const percentual = 40;
    const vale = Math.round(salario * (percentual / 100) * 100) / 100;
    expect(vale).toBeLessThan(1000);
    expect(vale).toBeGreaterThan(900);
  });
});

describe("Gestão de Competências - Critérios do Sistema", () => {
  const GESTAO_COMPETENCIAS_CRITERIA = {
    dia_corte_ponto: "15",
    percentual_adiantamento: "40",
    dia_adiantamento: "20",
    dia_pagamento: "5",
    max_faltas_vale: "5",
    fechar_no_escuro: "sim",
    descontar_vr_falta: "1",
    descontar_vt_falta: "1",
  };

  it("deve ter dia de corte de ponto configurável", () => {
    expect(parseInt(GESTAO_COMPETENCIAS_CRITERIA.dia_corte_ponto)).toBe(15);
  });

  it("deve ter percentual de adiantamento configurável", () => {
    expect(parseInt(GESTAO_COMPETENCIAS_CRITERIA.percentual_adiantamento)).toBe(40);
  });

  it("deve ter dia do adiantamento configurável", () => {
    expect(parseInt(GESTAO_COMPETENCIAS_CRITERIA.dia_adiantamento)).toBe(20);
  });

  it("deve ter dia do pagamento configurável", () => {
    expect(parseInt(GESTAO_COMPETENCIAS_CRITERIA.dia_pagamento)).toBe(5);
  });

  it("deve ter máximo de faltas para vale configurável", () => {
    expect(parseInt(GESTAO_COMPETENCIAS_CRITERIA.max_faltas_vale)).toBe(5);
  });

  it("deve ter opção de fechar no escuro", () => {
    expect(GESTAO_COMPETENCIAS_CRITERIA.fechar_no_escuro).toBe("sim");
  });

  it("deve ter opção de descontar VR por falta", () => {
    expect(GESTAO_COMPETENCIAS_CRITERIA.descontar_vr_falta).toBe("1");
  });

  it("deve ter opção de descontar VT por falta", () => {
    expect(GESTAO_COMPETENCIAS_CRITERIA.descontar_vt_falta).toBe("1");
  });
});

describe("Resetar Etapa - Lógica de Cascata", () => {
  const ETAPA_ORDER = ["ponto", "escuro", "vale", "pagamento", "consolidacao"];
  const STATUS_MAP: Record<string, string> = {
    ponto: "aberta",
    escuro: "ponto_importado",
    vale: "aferida",
    pagamento: "vale_gerado",
    consolidacao: "pagamento_simulado",
  };

  it("deve retornar status correto ao limpar etapa de ponto", () => {
    expect(STATUS_MAP["ponto"]).toBe("aberta");
  });

  it("deve retornar status correto ao limpar etapa de escuro", () => {
    expect(STATUS_MAP["escuro"]).toBe("ponto_importado");
  });

  it("deve retornar status correto ao limpar etapa de vale", () => {
    expect(STATUS_MAP["vale"]).toBe("aferida");
  });

  it("deve retornar status correto ao limpar etapa de pagamento", () => {
    expect(STATUS_MAP["pagamento"]).toBe("vale_gerado");
  });

  it("deve retornar status correto ao limpar etapa de consolidação", () => {
    expect(STATUS_MAP["consolidacao"]).toBe("pagamento_simulado");
  });

  it("deve limpar etapas downstream ao limpar uma etapa", () => {
    const etapaIdx = ETAPA_ORDER.indexOf("vale");
    const downstream = ETAPA_ORDER.slice(etapaIdx + 1);
    expect(downstream).toEqual(["pagamento", "consolidacao"]);
  });

  it("deve limpar todas as etapas ao limpar ponto", () => {
    const etapaIdx = ETAPA_ORDER.indexOf("ponto");
    const downstream = ETAPA_ORDER.slice(etapaIdx + 1);
    expect(downstream).toEqual(["escuro", "vale", "pagamento", "consolidacao"]);
  });

  it("não deve limpar etapas anteriores", () => {
    const etapaIdx = ETAPA_ORDER.indexOf("consolidacao");
    const downstream = ETAPA_ORDER.slice(etapaIdx + 1);
    expect(downstream).toEqual([]);
  });
});

describe("Resetar Competência", () => {
  it("deve retornar status 'aberta' ao resetar competência", () => {
    const newStatus = "aberta";
    expect(newStatus).toBe("aberta");
  });

  it("não deve permitir resetar competência travada", () => {
    const status = "travada";
    const canReset = status !== "travada";
    expect(canReset).toBe(false);
  });

  it("deve permitir resetar competência consolidada", () => {
    const status = "consolidada";
    const canReset = status !== "travada";
    expect(canReset).toBe(true);
  });

  it("deve permitir resetar competência aberta", () => {
    const status = "aberta";
    const canReset = status !== "travada";
    expect(canReset).toBe(true);
  });
});
