import { describe, it, expect } from "vitest";

// Replicar as funções de cálculo do backend para testar isoladamente
function calcularAnosServico(dataAdmissao: string, dataRef?: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const ref = dataRef ? new Date(dataRef + 'T00:00:00') : new Date();
  let anos = ref.getFullYear() - admissao.getFullYear();
  const mesRef = ref.getMonth();
  const mesAdm = admissao.getMonth();
  if (mesRef < mesAdm || (mesRef === mesAdm && ref.getDate() < admissao.getDate())) {
    anos--;
  }
  return Math.max(0, anos);
}

function calcularMesesServico(dataAdmissao: string, dataRef?: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const ref = dataRef ? new Date(dataRef + 'T00:00:00') : new Date();
  let meses = (ref.getFullYear() - admissao.getFullYear()) * 12 + (ref.getMonth() - admissao.getMonth());
  if (ref.getDate() < admissao.getDate()) {
    meses--;
  }
  return Math.max(0, meses);
}

function calcularMeses13o(dataAdmissao: string, dataDesligamento: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const deslig = new Date(dataDesligamento + 'T00:00:00');
  const anoDeslig = deslig.getFullYear();
  const mesInicio = admissao.getFullYear() === anoDeslig ? admissao.getMonth() : 0;
  const mesFim = deslig.getMonth();
  let meses = mesFim - mesInicio + 1;
  if (admissao.getFullYear() === anoDeslig && admissao.getMonth() === mesInicio) {
    const diasNoMesAdmissao = new Date(anoDeslig, mesInicio + 1, 0).getDate() - admissao.getDate() + 1;
    if (diasNoMesAdmissao < 15) {
      meses--;
    }
  }
  if (deslig.getDate() < 15) {
    meses--;
  }
  return Math.max(0, Math.min(12, meses));
}

function calcularDiasAviso(anosServico: number): number {
  return Math.min(30 + (anosServico * 3), 90);
}

function calcularDiasExtrasAviso(anosServico: number): number {
  return Math.min(anosServico * 3, 60);
}

function calcularMesesFeriasProporcionais(dataAdmissao: string, dataDesligamento: string): number {
  const mesesTotais = calcularMesesServico(dataAdmissao, dataDesligamento);
  const mesesProporcionais = mesesTotais % 12;
  return mesesProporcionais === 0 && mesesTotais > 0 ? 12 : mesesProporcionais;
}

// Replicate the corrected calcularRescisaoCompleta
function calcularRescisaoCompleta(params: {
  salarioBase: number;
  dataAdmissao: string;
  dataDesligamento: string;
  dataFimAviso?: string;
  tipo: string;
  vrDiario: number;
  diasTrabalhadosMes: number;
}) {
  const { salarioBase, dataAdmissao, dataDesligamento, tipo, vrDiario, diasTrabalhadosMes } = params;
  const dataFimAviso = params.dataFimAviso || dataDesligamento;
  const dtFimAviso = new Date(dataFimAviso + 'T00:00:00');
  const dtDataSaida = new Date(dtFimAviso);
  dtDataSaida.setDate(dtDataSaida.getDate() + 1);
  const dataSaida = dtDataSaida.toISOString().split('T')[0];
  const DIVISOR_CLT = 30;
  const salarioDia = salarioBase / DIVISOR_CLT;
  const anosServico = calcularAnosServico(dataAdmissao, dataSaida);
  const diasAvisoTotal = calcularDiasAviso(anosServico);
  const diasExtrasAviso = calcularDiasExtrasAviso(anosServico);
  const saldoSalario = salarioDia * diasTrabalhadosMes;
  const mesesFerias = calcularMesesFeriasProporcionais(dataAdmissao, dataSaida);
  const feriasProporcional = (salarioBase * mesesFerias) / 12;
  const tercoConstitucional = feriasProporcional / 3;
  const totalFerias = feriasProporcional + tercoConstitucional;
  const meses13o = calcularMeses13o(dataAdmissao, dataSaida);
  const decimoTerceiroProporcional = (salarioBase * meses13o) / 12;
  let avisoPrevioIndenizado = 0;
  if (tipo === 'empregador_indenizado') avisoPrevioIndenizado = salarioDia * diasAvisoTotal;
  else if (tipo === 'empregador_trabalhado') avisoPrevioIndenizado = salarioDia * diasExtrasAviso;
  const vrProporcional = vrDiario * diasTrabalhadosMes;
  const mesesTotais = calcularMesesServico(dataAdmissao, dataSaida);
  const fgtsEstimado = salarioBase * 0.08 * mesesTotais;
  const multaFGTS = (tipo.includes('empregador')) ? fgtsEstimado * 0.4 : 0;
  const total = saldoSalario + totalFerias + decimoTerceiroProporcional + avisoPrevioIndenizado + vrProporcional;
  return {
    salarioBase: salarioBase.toFixed(2), salarioDia: salarioDia.toFixed(2),
    diasReaisMes: DIVISOR_CLT, anosServico, diasAvisoTotal, diasExtrasAviso,
    diasTrabalhadosMes, mesesFerias, meses13o, dataSaida,
    saldoSalario: saldoSalario.toFixed(2), feriasProporcional: feriasProporcional.toFixed(2),
    tercoConstitucional: tercoConstitucional.toFixed(2), totalFerias: totalFerias.toFixed(2),
    decimoTerceiroProporcional: decimoTerceiroProporcional.toFixed(2),
    avisoPrevioIndenizado: avisoPrevioIndenizado.toFixed(2),
    vrProporcional: vrProporcional.toFixed(2), vrDiario: vrDiario.toFixed(2),
    fgtsEstimado: fgtsEstimado.toFixed(2), multaFGTS: multaFGTS.toFixed(2),
    total: total.toFixed(2), mesesTotais,
  };
}

describe("Cálculo de Rescisão CLT", () => {
  // ============================================================
  // CASO ANTONIO RENATO DE SANTANA - Correção de bugs
  // Admissão: 2025-05-12 | Salário: R$ 6.199,60 | Tipo: empregador_trabalhado
  // Início aviso: 14/02/2026 | Término: 15/03/2026 | Data saída: 16/03/2026
  // ============================================================
  
  describe("Caso ANTONIO RENATO - Cálculo corrigido", () => {
    const resultado = calcularRescisaoCompleta({
      salarioBase: 6199.60,
      dataAdmissao: '2025-05-12',
      dataDesligamento: '2026-02-14',
      dataFimAviso: '2026-03-15',
      tipo: 'empregador_trabalhado',
      vrDiario: 0,
      diasTrabalhadosMes: 16, // Mar 1-16 (data saída = 16/03)
    });
    
    it('data de saída = 16/03/2026 (dia seguinte ao término)', () => {
      expect(resultado.dataSaida).toBe('2026-03-16');
    });
    
    it('saldo de salário: 16 dias, divisor 30 (CLT)', () => {
      expect(resultado.diasTrabalhadosMes).toBe(16);
      expect(resultado.diasReaisMes).toBe(30);
      // 6199.60 / 30 * 16 = 3306.45
      expect(resultado.saldoSalario).toBe('3306.45');
    });
    
    it('férias proporcionais: 10 meses (admissão até data saída)', () => {
      expect(resultado.mesesFerias).toBe(10);
      // 6199.60 * 10 / 12 = 5166.33
      expect(resultado.feriasProporcional).toBe('5166.33');
    });
    
    it('1/3 constitucional correto', () => {
      // 5166.33 / 3 = 1722.11
      expect(resultado.tercoConstitucional).toBe('1722.11');
    });
    
    it('13º proporcional: 3 meses (jan, fev, mar 2026)', () => {
      expect(resultado.meses13o).toBe(3);
      // 6199.60 * 3 / 12 = 1549.90
      expect(resultado.decimoTerceiroProporcional).toBe('1549.90');
    });
    
    it('FGTS: 10 meses de serviço até data saída', () => {
      expect(resultado.mesesTotais).toBe(10);
      // 6199.60 * 0.08 * 10 = 4959.68
      expect(resultado.fgtsEstimado).toBe('4959.68');
    });
    
    it('multa 40% FGTS correta', () => {
      // 4959.68 * 0.4 = 1983.872 → 1983.87
      expect(resultado.multaFGTS).toBe('1983.87');
    });
    
    it('aviso prévio indenizado = 0 (trabalhado, 0 anos)', () => {
      expect(resultado.avisoPrevioIndenizado).toBe('0.00');
    });
  });
  
  // ============================================================
  // CASO ISABELA - Referência do usuário
  // Salário: R$ 1.643,00 | Admissão: 02/04/2025 | Desligamento: ~28/03/2026
  // ============================================================
  
  describe("Caso Isabela (referência do usuário)", () => {
    const salario = 1643.00;
    const dataAdmissao = "2025-04-02";
    const dataDesligamento = "2026-03-28";
    
    it("deve calcular anos de serviço corretamente", () => {
      // Admissão 02/04/2025, desligamento 28/03/2026 = 0 anos completos (faltam 5 dias para completar 1 ano)
      expect(calcularAnosServico(dataAdmissao, dataDesligamento)).toBe(0);
    });
    
    it("deve calcular meses de serviço corretamente", () => {
      // 02/04/2025 a 28/03/2026 = 11 meses
      expect(calcularMesesServico(dataAdmissao, dataDesligamento)).toBe(11);
    });
    
    it("deve calcular férias proporcionais (11 meses) + 1/3", () => {
      const mesesFerias = calcularMesesFeriasProporcionais(dataAdmissao, dataDesligamento);
      expect(mesesFerias).toBe(11);
      
      const feriasProp = (salario * mesesFerias) / 12;
      const terco = feriasProp / 3;
      const total = feriasProp + terco;
      
      // User disse R$ 2.008,11 - verificar com tolerância de arredondamento
      expect(total).toBeCloseTo(2008.11, 0);
    });
    
    it("deve calcular 13º proporcional (3 meses no ano 2026)", () => {
      const meses13o = calcularMeses13o(dataAdmissao, dataDesligamento);
      // Jan, Fev, Mar 2026 = 3 meses (28 dias em março > 14 dias)
      expect(meses13o).toBe(3);
      
      const decimo = (salario * meses13o) / 12;
      // User disse R$ 410,75
      expect(decimo).toBeCloseTo(410.75, 2);
    });
    
    it("deve calcular saldo de salário com divisor CLT = 30", () => {
      const diasTrabalhados = 28;
      // CLT Art. 64: divisor = 30 (padrão para mensalistas)
      const saldo = (salario / 30) * diasTrabalhados;
      expect(saldo).toBeCloseTo(1533.47, 0);
    });
    
    it("deve calcular aviso prévio proporcional (Lei 12.506)", () => {
      // 0 anos completos = 30 dias base + 0 extras = 30 dias
      const anosServico = calcularAnosServico(dataAdmissao, dataDesligamento);
      expect(anosServico).toBe(0);
      
      const diasAviso = calcularDiasAviso(anosServico);
      expect(diasAviso).toBe(30);
      
      const diasExtras = calcularDiasExtrasAviso(anosServico);
      expect(diasExtras).toBe(0);
    });
  });
  
  // ============================================================
  // TESTES GERAIS DA LEI 12.506/2011
  // ============================================================
  
  describe("Lei 12.506/2011 - Aviso Prévio Proporcional", () => {
    it("deve calcular 30 dias para menos de 1 ano", () => {
      expect(calcularDiasAviso(0)).toBe(30);
    });
    
    it("deve calcular 33 dias para 1 ano", () => {
      expect(calcularDiasAviso(1)).toBe(33);
    });
    
    it("deve calcular 36 dias para 2 anos", () => {
      expect(calcularDiasAviso(2)).toBe(36);
    });
    
    it("deve calcular 60 dias para 10 anos", () => {
      expect(calcularDiasAviso(10)).toBe(60);
    });
    
    it("deve limitar a 90 dias máximo", () => {
      expect(calcularDiasAviso(20)).toBe(90);
      expect(calcularDiasAviso(30)).toBe(90);
    });
    
    it("deve calcular dias extras corretamente", () => {
      expect(calcularDiasExtrasAviso(0)).toBe(0);
      expect(calcularDiasExtrasAviso(1)).toBe(3);
      expect(calcularDiasExtrasAviso(5)).toBe(15);
      expect(calcularDiasExtrasAviso(20)).toBe(60);
      expect(calcularDiasExtrasAviso(25)).toBe(60); // máximo 60
    });
  });
  
  // ============================================================
  // TESTES DE ANOS DE SERVIÇO
  // ============================================================
  
  describe("Cálculo de anos de serviço", () => {
    it("deve retornar 0 para menos de 1 ano", () => {
      expect(calcularAnosServico("2025-06-01", "2026-01-15")).toBe(0);
    });
    
    it("deve retornar 1 para exatamente 1 ano", () => {
      expect(calcularAnosServico("2024-03-01", "2025-03-01")).toBe(1);
    });
    
    it("deve retornar 2 para 2 anos e meio", () => {
      expect(calcularAnosServico("2023-01-15", "2025-07-20")).toBe(2);
    });
    
    it("deve retornar 0 para data futura de admissão", () => {
      expect(calcularAnosServico("2027-01-01", "2026-01-01")).toBe(0);
    });
  });
  
  // ============================================================
  // TESTES DE 13º PROPORCIONAL
  // ============================================================
  
  describe("Cálculo de 13º proporcional", () => {
    it("deve contar meses trabalhados no ano corrente", () => {
      // Admitido em 2024, desligado em março 2026 = 3 meses (jan, fev, mar)
      expect(calcularMeses13o("2024-01-15", "2026-03-28")).toBe(3);
    });
    
    it("não deve contar mês com menos de 15 dias", () => {
      // Desligado dia 10 = menos de 15 dias no mês
      expect(calcularMeses13o("2024-01-15", "2026-03-10")).toBe(2);
    });
    
    it("deve contar mês com 15+ dias", () => {
      // Desligado dia 15 = exatamente 15 dias
      expect(calcularMeses13o("2024-01-15", "2026-03-15")).toBe(3);
    });
    
    it("deve limitar a 12 meses", () => {
      expect(calcularMeses13o("2025-01-01", "2025-12-31")).toBe(12);
    });
  });
  
  // ============================================================
  // TESTES DE FÉRIAS PROPORCIONAIS
  // ============================================================
  
  describe("Cálculo de férias proporcionais", () => {
    it("deve calcular meses proporcionais no primeiro ano", () => {
      // 6 meses de serviço = 6 meses de férias proporcionais
      expect(calcularMesesFeriasProporcionais("2025-06-01", "2025-12-15")).toBe(6);
    });
    
    it("deve calcular 12 meses quando completa exatamente 1 ano", () => {
      // Exatamente 12 meses = 12 (período completo)
      expect(calcularMesesFeriasProporcionais("2024-06-01", "2025-06-01")).toBe(12);
    });
    
    it("deve calcular meses do segundo período aquisitivo", () => {
      // 15 meses = 1 ano + 3 meses = 3 meses proporcionais
      expect(calcularMesesFeriasProporcionais("2024-01-01", "2025-04-01")).toBe(3);
    });
  });
});
