import { describe, it, expect } from "vitest";
import {
  createCompany, getCompanies, getCompanyById, updateCompany, deleteCompany,
  createEmployee, getEmployees, getEmployeeById, updateEmployee, deleteEmployee, getEmployeeStats,
  createEmployeeHistory, getEmployeeHistory,
  createAso, getAsos, updateAso, deleteAso,
  createTraining, getTrainings, updateTraining, deleteTraining,
  createEpi, getEpis, updateEpi, deleteEpi, createEpiDelivery, getEpiDeliveries,
  createAccident, getAccidents, updateAccident, deleteAccident,
  createWarning, getWarnings, updateWarning, deleteWarning,
  createRisk, getRisks, updateRisk, deleteRisk,
  createVehicle, getVehicles, updateVehicle, deleteVehicle,
  createEquipment, getEquipments, updateEquipment, deleteEquipment,
  createExtinguisher, getExtinguishers, updateExtinguisher, deleteExtinguisher,
  createHydrant, getHydrants, updateHydrant, deleteHydrant,
  createAudit, getAudits, updateAudit, deleteAudit,
  createDeviation, getDeviations, updateDeviation, deleteDeviation,
  createActionPlan, getActionPlans, updateActionPlan, deleteActionPlan,
  createDds, getDdsList, deleteDds,
} from "./db";

let testCompanyId: number;
let testEmployeeId: number;

describe("CRUD Completo - Todos os Módulos", () => {
  // ============================================================
  // EMPRESA
  // ============================================================
  describe("Empresas", () => {
    it("deve criar uma empresa com todos os campos", async () => {
      const result = await createCompany({
        cnpj: "99.999.999/0001-99",
        razaoSocial: "Empresa Teste CRUD",
        nomeFantasia: "Teste CRUD",
        endereco: "Rua Teste, 123",
        cidade: "São Paulo",
        estado: "SP",
        cep: "01234-567",
        telefone: "(11) 3456-7890",
        email: "teste@crud.com",
      });
      expect(result.id).toBeGreaterThan(0);
      testCompanyId = result.id;
    });

    it("deve listar empresas", async () => {
      const list = await getCompanies();
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve buscar empresa por ID", async () => {
      const company = await getCompanyById(testCompanyId);
      expect(company).toBeDefined();
      expect(company!.razaoSocial).toBe("Empresa Teste CRUD");
    });

    it("deve atualizar empresa", async () => {
      await updateCompany(testCompanyId, { nomeFantasia: "Teste CRUD Atualizado" });
      const company = await getCompanyById(testCompanyId);
      expect(company!.nomeFantasia).toBe("Teste CRUD Atualizado");
    });
  });

  // ============================================================
  // COLABORADOR - TODOS OS CAMPOS
  // ============================================================
  describe("Colaboradores - Todos os Campos", () => {
    it("deve criar colaborador com TODOS os campos preenchidos", async () => {
      const result = await createEmployee({
        companyId: testCompanyId,
        matricula: "TST001",
        nomeCompleto: "João Carlos da Silva Teste",
        cpf: "123.456.789-09",
        rg: "12.345.678-9",
        orgaoEmissor: "SSP/SP",
        dataNascimento: "1990-05-15",
        sexo: "M",
        estadoCivil: "Casado",
        nacionalidade: "Brasileiro",
        naturalidade: "São Paulo/SP",
        nomeMae: "Maria da Silva",
        nomePai: "José da Silva",
        ctps: "12345",
        serieCtps: "001",
        pis: "123.45678.90-1",
        tituloEleitor: "1234 5678 9012",
        certificadoReservista: "123456789012",
        cnh: "12345678901",
        categoriaCnh: "AB",
        validadeCnh: "2027-12-31",
        logradouro: "Rua das Flores",
        numero: "123",
        complemento: "Apto 4",
        bairro: "Centro",
        cidade: "São Paulo",
        estado: "SP",
        cep: "01234-567",
        telefone: "(11) 3456-7890",
        celular: "(11) 91234-5678",
        email: "joao.teste@email.com",
        contatoEmergencia: "Maria - Esposa",
        telefoneEmergencia: "(11) 91234-5678",
        cargo: "Engenheiro Civil",
        funcao: "Engenheiro de Obras",
        setor: "Engenharia",
        dataAdmissao: "2024-01-15",
        salarioBase: "8500.00",
        horasMensais: "220",
        tipoContrato: "CLT",
        jornadaTrabalho: "08:00 às 17:00",
        banco: "Bradesco",
        agencia: "1234",
        conta: "12345-6",
        tipoConta: "Corrente",
        chavePix: "123.456.789-09",
        status: "Ativo",
        observacoes: "Colaborador de teste com todos os campos preenchidos",
      });
      expect(result.id).toBeGreaterThan(0);
      testEmployeeId = result.id;
    });

    it("deve buscar colaborador e verificar TODOS os campos", async () => {
      const emp = await getEmployeeById(testEmployeeId, testCompanyId);
      expect(emp).toBeDefined();
      expect(emp!.nomeCompleto).toBe("João Carlos da Silva Teste");
      expect(emp!.cpf).toBe("123.456.789-09");
      expect(emp!.rg).toBe("12.345.678-9");
      expect(emp!.orgaoEmissor).toBe("SSP/SP");
      // date fields return as Date objects from Drizzle
      const toDateStr = (d: any) => d instanceof Date ? d.toISOString().substring(0, 10) : String(d).substring(0, 10);
      expect(toDateStr(emp!.dataNascimento)).toBe("1990-05-15");
      expect(emp!.sexo).toBe("M");
      expect(emp!.estadoCivil).toBe("Casado");
      expect(emp!.nacionalidade).toBe("Brasileiro");
      expect(emp!.naturalidade).toBe("São Paulo/SP");
      expect(emp!.nomeMae).toBe("Maria da Silva");
      expect(emp!.nomePai).toBe("José da Silva");
      expect(emp!.ctps).toBe("12345");
      expect(emp!.serieCtps).toBe("001");
      expect(emp!.pis).toBe("123.45678.90-1");
      expect(emp!.tituloEleitor).toBe("1234 5678 9012");
      expect(emp!.certificadoReservista).toBe("123456789012");
      expect(emp!.cnh).toBe("12345678901");
      expect(emp!.categoriaCnh).toBe("AB");
      expect(toDateStr(emp!.validadeCnh)).toBe("2027-12-31");
      expect(emp!.logradouro).toBe("Rua das Flores");
      expect(emp!.numero).toBe("123");
      expect(emp!.complemento).toBe("Apto 4");
      expect(emp!.bairro).toBe("Centro");
      expect(emp!.cidade).toBe("São Paulo");
      expect(emp!.estado).toBe("SP");
      expect(emp!.cep).toBe("01234-567");
      expect(emp!.telefone).toBe("(11) 3456-7890");
      expect(emp!.celular).toBe("(11) 91234-5678");
      expect(emp!.email).toBe("joao.teste@email.com");
      expect(emp!.contatoEmergencia).toBe("Maria - Esposa");
      expect(emp!.telefoneEmergencia).toBe("(11) 91234-5678");
      expect(emp!.matricula).toBe("TST001");
      expect(emp!.cargo).toBe("Engenheiro Civil");
      expect(emp!.funcao).toBe("Engenheiro de Obras");
      expect(emp!.setor).toBe("Engenharia");
      expect(toDateStr(emp!.dataAdmissao)).toBe("2024-01-15");
      expect(emp!.salarioBase).toBe("8500.00");
      expect(emp!.horasMensais).toBe("220");
      expect(emp!.tipoContrato).toBe("CLT");
      expect(emp!.jornadaTrabalho).toBe("08:00 às 17:00");
      expect(emp!.banco).toBe("Bradesco");
      expect(emp!.agencia).toBe("1234");
      expect(emp!.conta).toBe("12345-6");
      expect(emp!.tipoConta).toBe("Corrente");
      expect(emp!.chavePix).toBe("123.456.789-09");
      expect(emp!.status).toBe("Ativo");
      expect(emp!.observacoes).toBe("Colaborador de teste com todos os campos preenchidos");
    });

    it("deve atualizar campos individuais do colaborador", async () => {
      await updateEmployee(testEmployeeId, testCompanyId, { cargo: "Engenheiro Sênior", salarioBase: "12000.00" });
      const emp = await getEmployeeById(testEmployeeId, testCompanyId);
      expect(emp!.cargo).toBe("Engenheiro Sênior");
      expect(emp!.salarioBase).toBe("12000.00");
    });

    it("deve listar colaboradores com filtro de busca", async () => {
      const list = await getEmployees(testCompanyId, "João");
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve listar colaboradores com filtro de status", async () => {
      const list = await getEmployees(testCompanyId, undefined, "Ativo");
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve retornar estatísticas de colaboradores", async () => {
      const stats = await getEmployeeStats(testCompanyId);
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.ativos).toBeGreaterThan(0);
    });

    it("deve criar colaborador com campos mínimos (apenas obrigatórios)", async () => {
      const result = await createEmployee({
        companyId: testCompanyId,
        nomeCompleto: "Colaborador Mínimo",
        cpf: "987.654.321-00",
        status: "Ativo",
      });
      expect(result.id).toBeGreaterThan(0);
      await deleteEmployee(result.id, testCompanyId);
    });
  });

  // ============================================================
  // HISTÓRICO FUNCIONAL
  // ============================================================
  describe("Histórico Funcional", () => {
    it("deve criar registro de histórico", async () => {
      await createEmployeeHistory({
        employeeId: testEmployeeId,
        companyId: testCompanyId,
        tipo: "Promocao",
        descricao: "Promovido a Engenheiro Sênior",
        valorAnterior: "Engenheiro Civil",
        valorNovo: "Engenheiro Sênior",
        dataEvento: "2025-06-01",
        registradoPor: 1,
      });
    });

    it("deve listar histórico do colaborador", async () => {
      const history = await getEmployeeHistory(testEmployeeId, testCompanyId);
      expect(history.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // ASOs - campos corretos: medico, crm (não medicoNome, medicoCRM)
  // ============================================================
  describe("ASOs", () => {
    let asoId: number;
    it("deve criar ASO com todos os campos", async () => {
      const result = await createAso({
        companyId: testCompanyId,
        employeeId: testEmployeeId,
        tipo: "Admissional",
        dataExame: "2024-01-10",
        dataValidade: "2025-01-10",
        resultado: "Apto",
        clinica: "Clínica Saúde Total",
        medico: "Dr. Carlos Souza",
        crm: "CRM/SP 12345",
        observacoes: "Exame admissional completo",
      });
      expect(result.id).toBeGreaterThan(0);
      asoId = result.id;
    });

    it("deve listar ASOs por empresa", async () => {
      const list = await getAsos(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve listar ASOs por funcionário", async () => {
      const list = await getAsos(testCompanyId, testEmployeeId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve atualizar ASO", async () => {
      await updateAso(asoId, { resultado: "Inapto" });
      const list = await getAsos(testCompanyId);
      const aso = list.find((a: any) => a.id === asoId);
      expect(aso.resultado).toBe("Inapto");
    });

    it("deve excluir ASO", async () => {
      await deleteAso(asoId);
      const list = await getAsos(testCompanyId);
      expect(list.find((a: any) => a.id === asoId)).toBeUndefined();
    });
  });

  // ============================================================
  // TREINAMENTOS - campos corretos: norma (não normaRegulamentadora)
  // ============================================================
  describe("Treinamentos", () => {
    let trainingId: number;
    it("deve criar treinamento", async () => {
      const result = await createTraining({
        companyId: testCompanyId,
        employeeId: testEmployeeId,
        nome: "NR-35 Trabalho em Altura",
        norma: "NR-35",
        dataRealizacao: "2024-03-15",
        dataValidade: "2026-03-15",
        cargaHoraria: "8",
        instrutor: "José Instrutor",
        statusTreinamento: "Valido",
      });
      expect(result.id).toBeGreaterThan(0);
      trainingId = result.id;
    });

    it("deve listar treinamentos", async () => {
      const list = await getTrainings(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve atualizar treinamento", async () => {
      await updateTraining(trainingId, { statusTreinamento: "Vencido" } as any);
    });

    it("deve excluir treinamento", async () => {
      await deleteTraining(trainingId);
    });
  });

  // ============================================================
  // EPIs - campos corretos: validadeCA (não validade)
  // ============================================================
  describe("EPIs", () => {
    let epiId: number;
    it("deve criar EPI", async () => {
      const result = await createEpi({
        companyId: testCompanyId,
        nome: "Capacete de Segurança",
        ca: "CA-12345",
        fabricante: "3M",
        validadeCA: "2027-12-31",
        quantidadeEstoque: 50,
      });
      expect(result.id).toBeGreaterThan(0);
      epiId = result.id;
    });

    it("deve listar EPIs", async () => {
      const list = await getEpis(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve criar entrega de EPI", async () => {
      const result = await createEpiDelivery({
        companyId: testCompanyId,
        employeeId: testEmployeeId,
        epiId: epiId,
        quantidade: 1,
        dataEntrega: "2024-03-15",
      });
      expect(result.id).toBeGreaterThan(0);
    });

    it("deve listar entregas de EPI", async () => {
      const list = await getEpiDeliveries(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir EPI", async () => {
      await deleteEpi(epiId);
    });
  });

  // ============================================================
  // ACIDENTES - campos corretos do schema: tipoAcidente enum
  // ============================================================
  describe("Acidentes", () => {
    let accidentId: number;
    it("deve criar acidente com todos os campos", async () => {
      const result = await createAccident({
        companyId: testCompanyId,
        employeeId: testEmployeeId,
        dataAcidente: "2024-06-10",
        horaAcidente: "14:30",
        tipo: "Tipico",
        gravidade: "Moderado",
        localAcidente: "Canteiro de Obras - Bloco A",
        descricao: "Queda de material sobre o pé esquerdo",
        parteCorpoAtingida: "Pé Esquerdo",
        catNumero: "CAT-2024-001",
        catData: "2024-06-10",
        diasAfastamento: 15,
        testemunhas: "Pedro Oliveira, Maria Santos",
        acaoCorretiva: "Reforço no uso de EPIs e sinalização",
      });
      expect(result.id).toBeGreaterThan(0);
      accidentId = result.id;
    });

    it("deve listar acidentes", async () => {
      const list = await getAccidents(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve atualizar acidente", async () => {
      await updateAccident(accidentId, { diasAfastamento: 20 });
    });

    it("deve excluir acidente", async () => {
      await deleteAccident(accidentId);
    });
  });

  // ============================================================
  // ADVERTÊNCIAS - campos corretos: tipoAdvertencia enum
  // ============================================================
  describe("Advertências", () => {
    let warningId: number;
    it("deve criar advertência", async () => {
      const result = await createWarning({
        companyId: testCompanyId,
        employeeId: testEmployeeId,
        tipo: "Escrita",
        dataOcorrencia: "2024-07-01",
        motivo: "Atraso reincidente",
        descricao: "Terceiro atraso no mês sem justificativa",
        testemunhas: "Carlos Supervisor",
      });
      expect(result.id).toBeGreaterThan(0);
      warningId = result.id;
    });

    it("deve listar advertências", async () => {
      const list = await getWarnings(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir advertência", async () => {
      await deleteWarning(warningId);
    });
  });

  // ============================================================
  // RISCOS - campos corretos: agenteRisco, tipoRisco, fonteGeradora, medidasControle
  // ============================================================
  describe("Riscos", () => {
    let riskId: number;
    it("deve criar risco", async () => {
      const result = await createRisk({
        companyId: testCompanyId,
        setor: "Engenharia",
        agenteRisco: "Ruído acima de 85dB",
        tipoRisco: "Fisico",
        fonteGeradora: "Máquinas e equipamentos",
        grauRisco: "Alto",
        medidasControle: "Uso obrigatório de protetor auricular",
      });
      expect(result.id).toBeGreaterThan(0);
      riskId = result.id;
    });

    it("deve listar riscos", async () => {
      const list = await getRisks(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir risco", async () => {
      await deleteRisk(riskId);
    });
  });

  // ============================================================
  // VEÍCULOS - campos corretos: tipoVeiculo enum, anoFabricacao
  // ============================================================
  describe("Veículos", () => {
    let vehicleId: number;
    it("deve criar veículo", async () => {
      const result = await createVehicle({
        companyId: testCompanyId,
        placa: "ABC-1234",
        modelo: "Toyota Hilux",
        anoFabricacao: "2023",
        tipo: "Caminhao",
        status: "Ativo",
      });
      expect(result.id).toBeGreaterThan(0);
      vehicleId = result.id;
    });

    it("deve listar veículos", async () => {
      const list = await getVehicles(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir veículo", async () => {
      await deleteVehicle(vehicleId);
    });
  });

  // ============================================================
  // EQUIPAMENTOS - campos corretos: tipoEquipamento via tipo
  // ============================================================
  describe("Equipamentos", () => {
    let equipmentId: number;
    it("deve criar equipamento", async () => {
      const result = await createEquipment({
        companyId: testCompanyId,
        nome: "Betoneira 400L",
        patrimonio: "PAT-001",
        tipo: "Betoneira",
        status: "Ativo",
      });
      expect(result.id).toBeGreaterThan(0);
      equipmentId = result.id;
    });

    it("deve listar equipamentos", async () => {
      const list = await getEquipments(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir equipamento", async () => {
      await deleteEquipment(equipmentId);
    });
  });

  // ============================================================
  // EXTINTORES - campos corretos: validadeRecarga (não dataValidade), tipoExtintor enum
  // ============================================================
  describe("Extintores", () => {
    let extId: number;
    it("deve criar extintor", async () => {
      const result = await createExtinguisher({
        companyId: testCompanyId,
        numero: "EXT-001",
        tipo: "PQS",
        capacidade: "6kg",
        localizacao: "Almoxarifado",
        validadeRecarga: "2027-06-30",
        dataRecarga: "2024-06-30",
        status: "OK",
      });
      expect(result.id).toBeGreaterThan(0);
      extId = result.id;
    });

    it("deve listar extintores", async () => {
      const list = await getExtinguishers(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir extintor", async () => {
      await deleteExtinguisher(extId);
    });
  });

  // ============================================================
  // HIDRANTES - campos corretos: ultimaInspecao (não dataInspecao), tipoHidrante via tipo, statusHidrante
  // ============================================================
  describe("Hidrantes", () => {
    let hydrantId: number;
    it("deve criar hidrante", async () => {
      const result = await createHydrant({
        companyId: testCompanyId,
        numero: "HID-001",
        tipo: "Coluna",
        localizacao: "Entrada Principal",
        ultimaInspecao: "2024-06-15",
        proximaInspecao: "2025-06-15",
        status: "OK",
      });
      expect(result.id).toBeGreaterThan(0);
      hydrantId = result.id;
    });

    it("deve listar hidrantes", async () => {
      const list = await getHydrants(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir hidrante", async () => {
      await deleteHydrant(hydrantId);
    });
  });

  // ============================================================
  // AUDITORIAS - campos corretos: resultado enum (não status), tipoAuditoria enum
  // ============================================================
  describe("Auditorias", () => {
    let auditId: number;
    it("deve criar auditoria", async () => {
      const result = await createAudit({
        companyId: testCompanyId,
        titulo: "Auditoria NR-18",
        tipo: "Interna",
        dataAuditoria: "2024-08-15",
        auditor: "Carlos Auditor",
        setor: "Obras",
        resultado: "Conforme",
        descricao: "Auditoria de rotina",
      });
      expect(result.id).toBeGreaterThan(0);
      auditId = result.id;
    });

    it("deve listar auditorias", async () => {
      const list = await getAudits(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir auditoria", async () => {
      await deleteAudit(auditId);
    });
  });

  // ============================================================
  // DESVIOS - campos corretos: titulo (notNull), tipo enum, statusDesvio enum
  // ============================================================
  describe("Desvios", () => {
    let deviationId: number;
    it("deve criar desvio", async () => {
      const result = await createDeviation({
        companyId: testCompanyId,
        titulo: "Desvio de Segurança - Capacete",
        tipo: "NC_Menor",
        setor: "Obras",
        descricao: "Funcionário sem capacete na área de obras",
        status: "Aberto",
        responsavel: "Carlos Supervisor",
      });
      expect(result.id).toBeGreaterThan(0);
      deviationId = result.id;
    });

    it("deve listar desvios", async () => {
      const list = await getDeviations(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir desvio", async () => {
      await deleteDeviation(deviationId);
    });
  });

  // ============================================================
  // PLANOS DE AÇÃO (5W2H) - campos corretos: oQue (notNull), porQue, statusPlano enum
  // ============================================================
  describe("Planos de Ação (5W2H)", () => {
    let actionId: number;
    it("deve criar plano de ação", async () => {
      const result = await createActionPlan({
        companyId: testCompanyId,
        oQue: "Instalar placas de sinalização",
        porQue: "Reduzir acidentes",
        onde: "Canteiro de Obras",
        quando: "2024-09-01",
        quem: "Equipe SST",
        como: "Comprar e instalar placas",
        quantoCusta: "R$ 5.000,00",
        status: "Em_Andamento",
      });
      expect(result.id).toBeGreaterThan(0);
      actionId = result.id;
    });

    it("deve listar planos de ação", async () => {
      const list = await getActionPlans(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir plano de ação", async () => {
      await deleteActionPlan(actionId);
    });
  });

  // ============================================================
  // DDS - campos corretos: participantes é text (não int)
  // ============================================================
  describe("DDS", () => {
    let ddsId: number;
    it("deve criar DDS", async () => {
      const result = await createDds({
        companyId: testCompanyId,
        tema: "Uso correto de EPIs",
        dataRealizacao: "2024-09-15",
        responsavel: "Carlos SST",
        participantes: "João, Maria, Pedro, Ana (25 participantes)",
        descricao: "Palestra sobre importância dos EPIs",
      });
      expect(result.id).toBeGreaterThan(0);
      ddsId = result.id;
    });

    it("deve listar DDS", async () => {
      const list = await getDdsList(testCompanyId);
      expect(list.length).toBeGreaterThan(0);
    });

    it("deve excluir DDS", async () => {
      await deleteDds(ddsId);
    });
  });

  // ============================================================
  // CLEANUP
  // ============================================================
  describe("Cleanup", () => {
    it("deve excluir colaborador de teste", async () => {
      await deleteEmployee(testEmployeeId, testCompanyId);
      const emp = await getEmployeeById(testEmployeeId, testCompanyId);
      expect(emp).toBeUndefined();
    });

    it("deve excluir empresa de teste", async () => {
      await deleteCompany(testCompanyId);
    });
  });
});
