import { describe, expect, it } from "vitest";
import { gerarTextoNotificacao, mapStatusToTipoMovimentacao, getMotivoAfastamento } from "./services/emailNotification";

describe("Email Notification Templates", () => {
  const companyData = {
    razaoSocial: "FC ENGENHARIA PROJETOS E OBRAS LTDA",
    nomeFantasia: "FC Engenharia",
    cnpj: "12.345.678/0001-99",
    logoUrl: "",
    email: "dp@fcengenharia.com.br",
    telefone: "(11) 1234-5678",
  };

  const dadosFuncionario = {
    nome: "ADAM FRANCISCO MARTINS ORESTES",
    cpf: "12345678900",
    funcao: "Servente",
    setor: "Obra",
    empresa: "FC Engenharia",
  };

  describe("gerarTextoNotificacao - Demissão (foco seguro de vida)", () => {
    it("deve incluir nome da empresa no título", () => {
      const { titulo } = gerarTextoNotificacao("demissao", {
        ...dadosFuncionario,
        dataDesligamento: "2026-02-22",
      }, companyData);
      
      expect(titulo).toContain("FC ENGENHARIA");
      expect(titulo).toContain("ADAM FRANCISCO MARTINS ORESTES");
      expect(titulo).toContain("Seguro de Vida");
      expect(titulo).not.toContain("Manus");
    });

    it("deve incluir cabeçalho com razão social e CNPJ no corpo", () => {
      const { corpo } = gerarTextoNotificacao("demissao", {
        ...dadosFuncionario,
        dataDesligamento: "2026-02-22",
      }, companyData);
      
      expect(corpo).toContain("FC ENGENHARIA PROJETOS E OBRAS LTDA");
      expect(corpo).toContain("12.345.678/0001-99");
      expect(corpo).not.toContain("Manus");
      expect(corpo).not.toContain("Sistema ERP RH");
    });

    it("deve mencionar BAIXA NO SEGURO DE VIDA como ação urgente", () => {
      const { corpo } = gerarTextoNotificacao("demissao", {
        ...dadosFuncionario,
        dataDesligamento: "2026-02-22",
      }, companyData);
      
      expect(corpo).toContain("BAIXA NO SEGURO DE VIDA");
      expect(corpo).toContain("URGÊNCIA");
    });

    it("deve incluir rodapé com Departamento Pessoal e dados da empresa", () => {
      const { corpo } = gerarTextoNotificacao("demissao", {
        ...dadosFuncionario,
        dataDesligamento: "2026-02-22",
      }, companyData);
      
      expect(corpo).toContain("Departamento Pessoal");
      expect(corpo).toContain("dp@fcengenharia.com.br");
      expect(corpo).toContain("(11) 1234-5678");
    });

    it("deve formatar CPF corretamente", () => {
      const { corpo } = gerarTextoNotificacao("demissao", {
        ...dadosFuncionario,
        cpf: "12345678900",
        dataDesligamento: "2026-02-22",
      }, companyData);
      
      expect(corpo).toContain("123.456.789-00");
    });
  });

  describe("gerarTextoNotificacao - Contratação", () => {
    it("deve incluir nome da empresa no título", () => {
      const { titulo } = gerarTextoNotificacao("contratacao", {
        ...dadosFuncionario,
        dataAdmissao: "2026-02-22",
      }, companyData);
      
      expect(titulo).toContain("FC ENGENHARIA");
      expect(titulo).toContain("Contratação");
      expect(titulo).not.toContain("Manus");
    });

    it("deve incluir cabeçalho da empresa no corpo", () => {
      const { corpo } = gerarTextoNotificacao("contratacao", {
        ...dadosFuncionario,
        dataAdmissao: "2026-02-22",
      }, companyData);
      
      expect(corpo).toContain("FC ENGENHARIA PROJETOS E OBRAS LTDA");
      expect(corpo).toContain("CNPJ");
    });
  });

  describe("gerarTextoNotificacao - Transferência", () => {
    it("deve incluir nome da empresa no título", () => {
      const { titulo } = gerarTextoNotificacao("transferencia", {
        ...dadosFuncionario,
        obraAnterior: "Obra A",
        obraNova: "Obra B",
      }, companyData);
      
      expect(titulo).toContain("FC ENGENHARIA");
      expect(titulo).toContain("Transferência");
    });
  });

  describe("gerarTextoNotificacao - Afastamento", () => {
    it("deve incluir nome da empresa no título", () => {
      const { titulo } = gerarTextoNotificacao("afastamento", {
        ...dadosFuncionario,
        motivoAfastamento: "Afastamento (doença/acidente)",
      }, companyData);
      
      expect(titulo).toContain("FC ENGENHARIA");
      expect(titulo).toContain("Afastamento");
    });
  });

  describe("gerarTextoNotificacao - Sem companyData (fallback)", () => {
    it("deve usar dados.empresa como fallback quando companyData é null", () => {
      const { titulo, corpo } = gerarTextoNotificacao("demissao", {
        ...dadosFuncionario,
        empresa: "FC Engenharia",
        dataDesligamento: "2026-02-22",
      });
      
      expect(titulo).toContain("FC ENGENHARIA");
      expect(corpo).toContain("Departamento Pessoal");
    });
  });

  describe("mapStatusToTipoMovimentacao", () => {
    it("deve retornar contratacao para novo funcionário Ativo", () => {
      expect(mapStatusToTipoMovimentacao(null, "Ativo")).toBe("contratacao");
    });

    it("deve retornar demissao para mudança para Desligado", () => {
      expect(mapStatusToTipoMovimentacao("Ativo", "Desligado")).toBe("demissao");
    });

    it("deve retornar afastamento para mudança para Afastado", () => {
      expect(mapStatusToTipoMovimentacao("Ativo", "Afastado")).toBe("afastamento");
    });

    it("deve retornar null para mesma situação", () => {
      expect(mapStatusToTipoMovimentacao("Ativo", "Ativo")).toBeNull();
    });
  });

  describe("getMotivoAfastamento", () => {
    it("deve retornar motivo legível para Afastado", () => {
      expect(getMotivoAfastamento("Afastado")).toBe("Afastamento (doença/acidente)");
    });

    it("deve retornar motivo legível para Licenca", () => {
      expect(getMotivoAfastamento("Licenca")).toBe("Licença");
    });

    it("deve retornar motivo legível para Recluso", () => {
      expect(getMotivoAfastamento("Recluso")).toBe("Reclusão");
    });
  });
});
