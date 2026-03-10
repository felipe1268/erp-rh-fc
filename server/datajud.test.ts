import { describe, expect, it } from "vitest";
import {
  cleanProcessNumber,
  extractTRTFromProcessNumber,
  getDatajudEndpoint,
  inferirSituacao,
  calcularRisco,
  detectarNovasMovimentacoes,
  getUltimasMovimentacoes,
  parseDatajudDate,
  formatProcessNumber,
} from "./datajud";

describe("DataJud Integration Module", () => {
  describe("cleanProcessNumber", () => {
    it("should remove dots, dashes, and spaces from process number", () => {
      const result = cleanProcessNumber("0001356-73.2023.5.06.0182");
      expect(result).toBe("00013567320235060182");
    });

    it("should handle already clean numbers", () => {
      const result = cleanProcessNumber("00013567320235060182");
      expect(result).toBe("00013567320235060182");
    });
  });

  describe("formatProcessNumber", () => {
    it("should format a clean number into standard CNJ format", () => {
      const result = formatProcessNumber("00013567320235060182");
      expect(result).toContain("-");
      expect(result).toContain(".");
    });
  });

  describe("extractTRTFromProcessNumber", () => {
    it("should extract TRT6 from process number with 06 segment", () => {
      const result = extractTRTFromProcessNumber("0001356-73.2023.5.06.0182");
      expect(result).toBe(6);
    });

    it("should extract TRT2 from process number with 02 segment", () => {
      const result = extractTRTFromProcessNumber("0000123-45.2023.5.02.0001");
      expect(result).toBe(2);
    });

    it("should return null for invalid/short numbers", () => {
      const result = extractTRTFromProcessNumber("invalid");
      expect(result).toBeNull();
    });
  });

  describe("getDatajudEndpoint", () => {
    it("should return TRT6 endpoint for PE process", () => {
      const result = getDatajudEndpoint("0001356-73.2023.5.06.0182");
      expect(result).toContain("trt6");
    });

    it("should return null for invalid process number", () => {
      const result = getDatajudEndpoint("invalid");
      expect(result).toBeNull();
    });
  });

  describe("inferirSituacao", () => {
    it("should detect 'arquivado' from movements containing 'Baixa'", () => {
      const movimentos = [
        { codigo: 1, nome: "Baixa Definitiva", dataHora: "2024-01-01T00:00:00" },
      ];
      const result = inferirSituacao(movimentos);
      expect(result.status).toBe("arquivado");
    });

    it("should detect 'arquivado' from movements containing 'Arquivamento'", () => {
      const movimentos = [
        { codigo: 2, nome: "Arquivamento Definitivo", dataHora: "2024-01-01T00:00:00" },
      ];
      const result = inferirSituacao(movimentos);
      expect(result.status).toBe("arquivado");
    });

    it("should return 'em_andamento' when no special movement found", () => {
      const movimentos = [
        { codigo: 4, nome: "Juntada de Petição", dataHora: "2024-01-01T00:00:00" },
      ];
      const result = inferirSituacao(movimentos);
      expect(result.status).toBe("em_andamento");
    });

    it("should return ultimaMovimentacao as the most recent one", () => {
      const movimentos = [
        { codigo: 1, nome: "Mov Old", dataHora: "2023-01-01T00:00:00" },
        { codigo: 2, nome: "Mov New", dataHora: "2024-06-01T00:00:00" },
      ];
      const result = inferirSituacao(movimentos);
      expect(result.ultimaMovimentacao?.nome).toBe("Mov New");
    });

    it("should return em_andamento for empty array", () => {
      const result = inferirSituacao([]);
      expect(result.status).toBe("em_andamento");
      expect(result.ultimaMovimentacao).toBeNull();
    });
  });

  describe("calcularRisco", () => {
    it("should return 'critico' for high value + critical subject", () => {
      // 500001 = score 4 + assunto 2 = 6 => critico
      expect(calcularRisco("500001", [{ nome: "Danos Morais", codigo: 1 }])).toBe("critico");
    });

    it("should return 'alto' for value >50000 + critical subject", () => {
      // 55000 = score 2 + assunto 2 = 4 => alto
      expect(calcularRisco("55000", [{ nome: "Insalubridade", codigo: 5 }])).toBe("alto");
    });

    it("should return 'medio' for value >50000 alone", () => {
      // 55000 = score 2 => medio
      expect(calcularRisco("55000", [])).toBe("medio");
    });

    it("should return 'baixo' for low values without risk factors", () => {
      // 10000 = score 0 (<=10000) => baixo
      expect(calcularRisco("10000", [])).toBe("baixo");
    });

    it("should return 'baixo' for null value and no subjects", () => {
      expect(calcularRisco(null, [])).toBe("baixo");
    });
  });

  describe("parseDatajudDate", () => {
    it("should parse ISO date string to YYYY-MM-DD", () => {
      const result = parseDatajudDate("2024-06-15T14:30:00.000Z");
      expect(result).toBe("2024-06-15");
    });

    it("should return null for empty string", () => {
      expect(parseDatajudDate("")).toBeNull();
    });

    it("should parse compact date format (14 digits)", () => {
      const result = parseDatajudDate("20231213173542");
      expect(result).toBe("2023-12-13");
    });
  });

  describe("detectarNovasMovimentacoes", () => {
    it("should detect new movements not in old list", () => {
      const antigas = [
        { codigo: 1, nome: "Mov 1", dataHora: "2024-01-01T00:00:00" },
      ];
      const novas = [
        { codigo: 1, nome: "Mov 1", dataHora: "2024-01-01T00:00:00" },
        { codigo: 2, nome: "Mov 2", dataHora: "2024-02-01T00:00:00" },
      ];
      const result = detectarNovasMovimentacoes(antigas, novas);
      expect(result.length).toBe(1);
      expect(result[0].nome).toBe("Mov 2");
    });

    it("should return empty array when no new movements", () => {
      const antigas = [
        { codigo: 1, nome: "Mov 1", dataHora: "2024-01-01T00:00:00" },
      ];
      const result = detectarNovasMovimentacoes(antigas, antigas);
      expect(result.length).toBe(0);
    });

    it("should return all movements when old list is null", () => {
      const novas = [
        { codigo: 1, nome: "Mov 1", dataHora: "2024-01-01T00:00:00" },
      ];
      const result = detectarNovasMovimentacoes(null, novas);
      expect(result.length).toBe(1);
    });
  });

  describe("getUltimasMovimentacoes", () => {
    it("should return last N movements sorted by date desc", () => {
      const movimentos = [
        { codigo: 1, nome: "Old", dataHora: "2023-01-01T00:00:00" },
        { codigo: 2, nome: "New", dataHora: "2024-06-01T00:00:00" },
        { codigo: 3, nome: "Mid", dataHora: "2024-01-01T00:00:00" },
      ];
      const result = getUltimasMovimentacoes(movimentos, 2);
      expect(result.length).toBe(2);
      expect(result[0].nome).toBe("New");
      expect(result[1].nome).toBe("Mid");
    });

    it("should return all if less than limit", () => {
      const movimentos = [
        { codigo: 1, nome: "Only", dataHora: "2024-01-01T00:00:00" },
      ];
      const result = getUltimasMovimentacoes(movimentos, 50);
      expect(result.length).toBe(1);
    });
  });
});
