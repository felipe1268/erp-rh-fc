import { describe, expect, it } from "vitest";
import {
  BANCO_HORAS_DATA_INICIO,
  bancoHorasEstaVigente,
  bancoHorasMesTemDiasVigentes,
} from "./bancoHorasData";

describe("marco inicial do Banco de Horas", () => {
  it("mantém o histórico anterior somente para auditoria", () => {
    expect(bancoHorasEstaVigente("2026-05-14")).toBe(false);
    expect(bancoHorasEstaVigente("2026-04-30")).toBe(false);
  });

  it("inclui o primeiro dia ativo e os movimentos posteriores", () => {
    expect(BANCO_HORAS_DATA_INICIO).toBe("2026-05-15");
    expect(bancoHorasEstaVigente("2026-05-15")).toBe(true);
    expect(bancoHorasEstaVigente("2026-05-31")).toBe(true);
    expect(bancoHorasEstaVigente("2026-06-01")).toBe(true);
  });

  it("reconhece maio como competência parcialmente ativa", () => {
    expect(bancoHorasMesTemDiasVigentes("2026-04")).toBe(false);
    expect(bancoHorasMesTemDiasVigentes("2026-05")).toBe(true);
    expect(bancoHorasMesTemDiasVigentes("2026-06")).toBe(true);
  });
});