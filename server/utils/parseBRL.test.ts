import { describe, it, expect } from "vitest";
import { parseBRL } from "./parseBRL";

describe("parseBRL", () => {
  it("converte formato brasileiro com milhar e decimal", () => {
    expect(parseBRL("2.774,20")).toBe(2774.20);
  });

  it("converte formato brasileiro sem milhar", () => {
    expect(parseBRL("492,00")).toBe(492);
  });

  it("converte formato brasileiro com milhões", () => {
    expect(parseBRL("1.234.567,89")).toBe(1234567.89);
  });

  it("converte formato decimal americano", () => {
    expect(parseBRL("2774.20")).toBe(2774.20);
  });

  it("converte número inteiro como string", () => {
    expect(parseBRL("1500")).toBe(1500);
  });

  it("converte número puro", () => {
    expect(parseBRL(2774.20)).toBe(2774.20);
  });

  it("retorna 0 para null", () => {
    expect(parseBRL(null)).toBe(0);
  });

  it("retorna 0 para undefined", () => {
    expect(parseBRL(undefined)).toBe(0);
  });

  it("retorna 0 para string vazia", () => {
    expect(parseBRL("")).toBe(0);
  });

  it("retorna 0 para texto inválido", () => {
    expect(parseBRL("abc")).toBe(0);
  });

  it("converte valor com espaços", () => {
    expect(parseBRL("  2.189,00  ")).toBe(2189);
  });

  it("converte centavos brasileiros", () => {
    expect(parseBRL("11,36")).toBe(11.36);
  });

  it("converte zero", () => {
    expect(parseBRL("0")).toBe(0);
    expect(parseBRL(0)).toBe(0);
  });
});
