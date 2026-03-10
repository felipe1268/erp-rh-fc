import { describe, expect, it } from "vitest";

// Testar a lógica de números proibidos diretamente
const NUMEROS_PROIBIDOS = new Set([13, 17, 22, 24, 69, 171, 666]);

function proximoNumeroValido(num: number): number {
  while (NUMEROS_PROIBIDOS.has(num)) {
    num++;
  }
  return num;
}

describe("Números Proibidos - Lógica de Geração de Código Interno", () => {
  
  describe("proximoNumeroValido", () => {
    it("deve retornar o mesmo número se não for proibido", () => {
      expect(proximoNumeroValido(1)).toBe(1);
      expect(proximoNumeroValido(5)).toBe(5);
      expect(proximoNumeroValido(100)).toBe(100);
      expect(proximoNumeroValido(500)).toBe(500);
    });

    it("deve pular o número 13", () => {
      expect(proximoNumeroValido(13)).toBe(14);
    });

    it("deve pular o número 17", () => {
      expect(proximoNumeroValido(17)).toBe(18);
    });

    it("deve pular o número 22", () => {
      expect(proximoNumeroValido(22)).toBe(23);
    });

    it("deve pular o número 24", () => {
      expect(proximoNumeroValido(24)).toBe(25);
    });

    it("deve pular o número 69", () => {
      expect(proximoNumeroValido(69)).toBe(70);
    });

    it("deve pular o número 171", () => {
      expect(proximoNumeroValido(171)).toBe(172);
    });

    it("deve pular o número 666", () => {
      expect(proximoNumeroValido(666)).toBe(667);
    });

    it("não deve pular números normais próximos aos proibidos", () => {
      expect(proximoNumeroValido(12)).toBe(12);
      expect(proximoNumeroValido(14)).toBe(14);
      expect(proximoNumeroValido(16)).toBe(16);
      expect(proximoNumeroValido(18)).toBe(18);
      expect(proximoNumeroValido(21)).toBe(21);
      expect(proximoNumeroValido(23)).toBe(23);
      expect(proximoNumeroValido(25)).toBe(25);
      expect(proximoNumeroValido(68)).toBe(68);
      expect(proximoNumeroValido(70)).toBe(70);
      expect(proximoNumeroValido(170)).toBe(170);
      expect(proximoNumeroValido(172)).toBe(172);
      expect(proximoNumeroValido(665)).toBe(665);
      expect(proximoNumeroValido(667)).toBe(667);
    });
  });

  describe("NUMEROS_PROIBIDOS set", () => {
    it("deve conter exatamente 7 números proibidos", () => {
      expect(NUMEROS_PROIBIDOS.size).toBe(7);
    });

    it("deve conter todos os números especificados", () => {
      expect(NUMEROS_PROIBIDOS.has(13)).toBe(true);
      expect(NUMEROS_PROIBIDOS.has(17)).toBe(true);
      expect(NUMEROS_PROIBIDOS.has(22)).toBe(true);
      expect(NUMEROS_PROIBIDOS.has(24)).toBe(true);
      expect(NUMEROS_PROIBIDOS.has(69)).toBe(true);
      expect(NUMEROS_PROIBIDOS.has(171)).toBe(true);
      expect(NUMEROS_PROIBIDOS.has(666)).toBe(true);
    });

    it("não deve conter números que não são proibidos", () => {
      expect(NUMEROS_PROIBIDOS.has(1)).toBe(false);
      expect(NUMEROS_PROIBIDOS.has(100)).toBe(false);
      expect(NUMEROS_PROIBIDOS.has(999)).toBe(false);
    });
  });

  describe("Validação de edição manual", () => {
    function validarCodigoInterno(codigoInterno: string): boolean {
      const numPart = parseInt(String(codigoInterno).replace(/\D/g, ''));
      if (!isNaN(numPart) && NUMEROS_PROIBIDOS.has(numPart)) {
        return false; // número proibido
      }
      return true; // número válido
    }

    it("deve rejeitar códigos com números proibidos", () => {
      expect(validarCodigoInterno("JFC013")).toBe(false);
      expect(validarCodigoInterno("JFC017")).toBe(false);
      expect(validarCodigoInterno("JFC022")).toBe(false);
      expect(validarCodigoInterno("JFC024")).toBe(false);
      expect(validarCodigoInterno("JFC069")).toBe(false);
      expect(validarCodigoInterno("JFC171")).toBe(false);
      expect(validarCodigoInterno("JFC666")).toBe(false);
    });

    it("deve aceitar códigos com números válidos", () => {
      expect(validarCodigoInterno("JFC001")).toBe(true);
      expect(validarCodigoInterno("JFC012")).toBe(true);
      expect(validarCodigoInterno("JFC014")).toBe(true);
      expect(validarCodigoInterno("JFC100")).toBe(true);
      expect(validarCodigoInterno("JFC500")).toBe(true);
    });
  });

  describe("Sequência de geração", () => {
    it("deve gerar sequência correta pulando todos os proibidos", () => {
      const gerados: number[] = [];
      for (let i = 1; i <= 700; i++) {
        const valido = proximoNumeroValido(i);
        if (valido === i) {
          gerados.push(i);
        }
      }
      // Nenhum número proibido deve estar na sequência
      for (const proibido of [13, 17, 22, 24, 69, 171, 666]) {
        expect(gerados.includes(proibido)).toBe(false);
      }
      // Total deve ser 700 - 7 = 693
      expect(gerados.length).toBe(693);
    });
  });
});
