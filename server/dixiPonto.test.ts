import { describe, it, expect } from "vitest";

// We need to test the AFD parser logic. Since it's a private function inside the router,
// we'll replicate the parser logic here for unit testing.

interface AFDHeader {
  sn: string;
  cnpj: string;
  cno: string;
  razaoSocial: string;
  dataInicio: string;
  dataFim: string;
  totalRegistros: number;
}

interface AFDMarcacao {
  nsr: string;
  data: string;
  hora: string;
  cpf: string;
}

function parseAFD(content: string): { header: AFDHeader; marcacoes: AFDMarcacao[] } | null {
  try {
    const lines = content.split("\n").filter(l => l.trim().length > 0);
    if (lines.length < 2) return null;

    const headerLine = lines[0];
    let sn = "", cnpj = "", cno = "", razaoSocial = "";

    if (headerLine.length >= 140) {
      const tipoReg = headerLine.substring(9, 10);
      if (tipoReg === "1") {
        cnpj = headerLine.substring(11, 25).trim();
        cno = headerLine.substring(25, 39).trim();
        razaoSocial = headerLine.substring(39, 139).trim();
        sn = headerLine.substring(139, 156).trim();
      }
    }

    if (!sn) {
      const snMatch = headerLine.match(/REP\d{5,}/);
      if (snMatch) sn = snMatch[0];
    }

    if (!sn && headerLine.length > 139) {
      const possibleSn = headerLine.substring(139, 160).trim().replace(/\s+/g, '');
      if (possibleSn.length >= 5) sn = possibleSn;
    }

    const marcacoes: AFDMarcacao[] = [];
    let dataInicio = "", dataFim = "";

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 34) continue;

      const tipoReg = line.substring(9, 10);
      if (tipoReg === "3") {
        const nsr = line.substring(0, 9).trim();
        const dataRaw = line.substring(10, 18);
        const horaRaw = line.substring(18, 22);
        const cpfRaw = line.substring(22, 34).trim();

        const dia = dataRaw.substring(0, 2);
        const mes = dataRaw.substring(2, 4);
        const ano = dataRaw.substring(4, 8);
        const dataFormatada = `${ano}-${mes}-${dia}`;

        const horaFormatada = `${horaRaw.substring(0, 2)}:${horaRaw.substring(2, 4)}`;

        const dataLegivel = `${dia}/${mes}/${ano}`;
        if (!dataInicio) dataInicio = dataLegivel;
        dataFim = dataLegivel;

        const cpfLimpo = cpfRaw.replace(/^0+/, '').padStart(11, '0');

        marcacoes.push({
          nsr,
          data: dataFormatada,
          hora: horaFormatada,
          cpf: cpfLimpo,
        });
      }
    }

    const lastLine = lines[lines.length - 1];
    let totalRegistrosTrailer = 0;
    if (lastLine.length >= 35 && lastLine.substring(9, 10) === "9") {
      totalRegistrosTrailer = parseInt(lastLine.substring(26, 35).trim()) || 0;
    }

    return {
      header: {
        sn: sn || "DESCONHECIDO",
        cnpj, cno, razaoSocial,
        dataInicio, dataFim,
        totalRegistros: marcacoes.length,
      },
      marcacoes,
    };
  } catch {
    return null;
  }
}

function formatCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '').padStart(11, '0');
  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`;
}

// ============================================================
// TESTS
// ============================================================

describe("AFD Parser - Portaria 671", () => {
  // Build a realistic AFD file content
  // Type 1 header: positions 0-8 = NSR, 9 = tipo(1), 10 = tipo_id, 11-24 = CNPJ, 25-38 = CNO, 39-138 = razao social, 139+ = SN
  const buildHeader = (sn: string, cnpj: string, razao: string) => {
    const nsr = "000000001";
    const tipo = "1";
    const tipoId = "1";
    const cnpjPad = cnpj.padEnd(14, " ");
    const cnoPad = "".padEnd(14, " ");
    const razaoPad = razao.padEnd(100, " ");
    const snPad = sn.padEnd(17, " ");
    return nsr + tipo + tipoId + cnpjPad + cnoPad + razaoPad + snPad;
  };

  // Type 3 marcação: positions 0-8 = NSR, 9 = tipo(3), 10-17 = DDMMAAAA, 18-21 = HHMM, 22-33 = CPF
  const buildMarcacao = (nsr: string, data: string, hora: string, cpf: string) => {
    const nsrPad = nsr.padStart(9, "0");
    const tipo = "3";
    const cpfPad = cpf.padStart(12, "0");
    return nsrPad + tipo + data + hora + cpfPad;
  };

  // Type 9 trailer
  const buildTrailer = (total: number) => {
    const nsr = "999999999";
    const tipo = "9";
    const padding = "".padEnd(16, " ");
    const totalStr = total.toString().padStart(9, "0");
    return nsr + tipo + padding + totalStr;
  };

  it("should parse a valid AFD file with header, marcações and trailer", () => {
    const header = buildHeader("REP00123456789", "12345678000199", "FC ENGENHARIA CIVIL LTDA");
    const marc1 = buildMarcacao("000000002", "15012026", "0730", "12345678901");
    const marc2 = buildMarcacao("000000003", "15012026", "1200", "12345678901");
    const marc3 = buildMarcacao("000000004", "15012026", "1300", "98765432100");
    const marc4 = buildMarcacao("000000005", "16012026", "0800", "12345678901");
    const trailer = buildTrailer(4);

    const content = [header, marc1, marc2, marc3, marc4, trailer].join("\n");
    const result = parseAFD(content);

    expect(result).not.toBeNull();
    expect(result!.header.sn).toBe("REP00123456789");
    expect(result!.header.cnpj).toBe("12345678000199");
    expect(result!.header.razaoSocial).toBe("FC ENGENHARIA CIVIL LTDA");
    expect(result!.marcacoes).toHaveLength(4);
    expect(result!.header.totalRegistros).toBe(4);
  });

  it("should correctly parse date from DDMMAAAA to YYYY-MM-DD", () => {
    const header = buildHeader("REP00123456789", "12345678000199", "EMPRESA TESTE");
    const marc = buildMarcacao("000000002", "25022026", "0845", "12345678901");
    const trailer = buildTrailer(1);

    const content = [header, marc, trailer].join("\n");
    const result = parseAFD(content);

    expect(result).not.toBeNull();
    expect(result!.marcacoes[0].data).toBe("2026-02-25");
    expect(result!.marcacoes[0].hora).toBe("08:45");
  });

  it("should correctly parse CPF removing leading zeros and padding to 11 digits", () => {
    const header = buildHeader("REP00123456789", "12345678000199", "EMPRESA TESTE");
    // CPF with leading zeros in 12-char field
    const marc = buildMarcacao("000000002", "10012026", "0730", "00012345678");
    const trailer = buildTrailer(1);

    const content = [header, marc, trailer].join("\n");
    const result = parseAFD(content);

    expect(result).not.toBeNull();
    expect(result!.marcacoes[0].cpf).toBe("00012345678");
  });

  it("should detect data range (dataInicio and dataFim)", () => {
    const header = buildHeader("REP00123456789", "12345678000199", "EMPRESA TESTE");
    const marc1 = buildMarcacao("000000002", "01012026", "0730", "12345678901");
    const marc2 = buildMarcacao("000000003", "15012026", "0800", "12345678901");
    const marc3 = buildMarcacao("000000004", "31012026", "1700", "12345678901");
    const trailer = buildTrailer(3);

    const content = [header, marc1, marc2, marc3, trailer].join("\n");
    const result = parseAFD(content);

    expect(result).not.toBeNull();
    expect(result!.header.dataInicio).toBe("01/01/2026");
    expect(result!.header.dataFim).toBe("31/01/2026");
  });

  it("should return null for empty or too short content", () => {
    expect(parseAFD("")).toBeNull();
    expect(parseAFD("short")).toBeNull();
    expect(parseAFD("only one line")).toBeNull();
  });

  it("should skip lines that are not type 3 marcações", () => {
    const header = buildHeader("REP00123456789", "12345678000199", "EMPRESA TESTE");
    const marc = buildMarcacao("000000002", "10012026", "0730", "12345678901");
    // A type 2 line (not a marcação)
    const type2Line = "0000000032some other data that is not a marcacao and should be skipped";
    const trailer = buildTrailer(1);

    const content = [header, marc, type2Line, trailer].join("\n");
    const result = parseAFD(content);

    expect(result).not.toBeNull();
    expect(result!.marcacoes).toHaveLength(1);
  });

  it("should handle multiple employees in the same file", () => {
    const header = buildHeader("REP00123456789", "12345678000199", "EMPRESA TESTE");
    const marc1 = buildMarcacao("000000002", "10012026", "0730", "11111111111");
    const marc2 = buildMarcacao("000000003", "10012026", "0730", "22222222222");
    const marc3 = buildMarcacao("000000004", "10012026", "0730", "33333333333");
    const trailer = buildTrailer(3);

    const content = [header, marc1, marc2, marc3, trailer].join("\n");
    const result = parseAFD(content);

    expect(result).not.toBeNull();
    expect(result!.marcacoes).toHaveLength(3);
    const cpfs = result!.marcacoes.map(m => m.cpf);
    expect(cpfs).toContain("11111111111");
    expect(cpfs).toContain("22222222222");
    expect(cpfs).toContain("33333333333");
  });
});

describe("formatCPF", () => {
  it("should format 11-digit CPF correctly", () => {
    expect(formatCPF("12345678901")).toBe("123.456.789-01");
  });

  it("should pad short CPF with zeros", () => {
    expect(formatCPF("1234567")).toBe("000.012.345-67");
  });

  it("should handle CPF with dots and dashes (strip and reformat)", () => {
    expect(formatCPF("123.456.789-01")).toBe("123.456.789-01");
  });
});
