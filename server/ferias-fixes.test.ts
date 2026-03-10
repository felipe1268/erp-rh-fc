import { describe, it, expect } from "vitest";

/**
 * Testes para as correções do módulo de Férias:
 * 1. Filtro de busca de colaborador com removeAccents (corrigido bug de CPF vazio)
 * 2. Lógica de filtro de status "vencida" (status='vencida' OU vencida=1)
 * 3. Mapeamento de status para ações disponíveis
 */

const DIACRITICS_RE = /\p{Mn}/gu;
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();
}

describe("Busca de colaborador - removeAccents", () => {
  const employees = [
    { id: 1, nomeCompleto: "KELLEN LARISSA LOURENCO CLARO", cpf: "123.456.789-00" },
    { id: 2, nomeCompleto: "JOS\u00c9 ANT\u00d4NIO DA SILVA", cpf: "987.654.321-00" },
    { id: 3, nomeCompleto: "ACACIO LESCURA DE CAMARGO", cpf: "199.141.028-08" },
    { id: 4, nomeCompleto: "ADRIANO PAZ FERREIRA", cpf: "067.237.744-69" },
    { id: 5, nomeCompleto: "FRANCISCO EUDICE CARVALHO BIZERRA", cpf: "111.222.333-44" },
  ];

  // Replica exata da lógica corrigida do frontend
  function filterEmployees(search: string) {
    return employees.filter((e) => {
      if (!search) return true;
      const s = removeAccents(search);
      const sDigits = s.replace(/\D/g, "");
      return removeAccents(e.nomeCompleto || "").includes(s) || 
             (sDigits.length > 0 && (e.cpf || "").replace(/\D/g, "").includes(sDigits));
    });
  }

  it("removeAccents deve normalizar corretamente", () => {
    expect(removeAccents("JOS\u00c9")).toBe("jose");
    expect(removeAccents("ANT\u00d4NIO")).toBe("antonio");
    expect(removeAccents("KELLEN")).toBe("kellen");
    expect(removeAccents("a\u00e7\u00e3o")).toBe("acao");
  });

  it("deve filtrar por nome parcial sem acentos", () => {
    const result = filterEmployees("kell");
    expect(result).toHaveLength(1);
    expect(result[0].nomeCompleto).toContain("KELLEN");
  });

  it("deve filtrar por nome com acentos", () => {
    const result = filterEmployees("jos\u00e9");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("deve filtrar por nome sem acentos quando o nome tem acentos", () => {
    const result = filterEmployees("jose antonio");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("deve filtrar por CPF", () => {
    const result = filterEmployees("123456789");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("deve retornar todos quando busca est\u00e1 vazia", () => {
    const result = filterEmployees("");
    expect(result).toHaveLength(5);
  });

  it("deve retornar vazio quando n\u00e3o encontra nada", () => {
    const result = filterEmployees("zzzzxyz");
    expect(result).toHaveLength(0);
  });

  it("busca por texto n\u00e3o deve fazer match falso em CPF (bug corrigido)", () => {
    // Antes do fix: "kell".replace(/\\D/g,"") = "" e "".includes("") = true para todos
    const result = filterEmployees("kell");
    expect(result).toHaveLength(1); // S\u00f3 KELLEN, n\u00e3o todos
  });
});

describe("Filtro de status vencida", () => {
  const vacationPeriods = [
    { id: 1, status: "pendente", vencida: 0, employeeName: "Jo\u00e3o" },
    { id: 2, status: "vencida", vencida: 1, employeeName: "Maria" },
    { id: 3, status: "pendente", vencida: 1, employeeName: "Pedro" },
    { id: 4, status: "agendada", vencida: 0, employeeName: "Ana" },
    { id: 5, status: "em_gozo", vencida: 0, employeeName: "Carlos" },
    { id: 6, status: "concluida", vencida: 0, employeeName: "Lucia" },
  ];

  function filterByStatus(status: string) {
    if (status === "vencida") {
      return vacationPeriods.filter(v => v.status === "vencida" || v.vencida === 1);
    }
    return vacationPeriods.filter(v => v.status === status);
  }

  it("deve filtrar vencidas incluindo status='vencida' E vencida=1", () => {
    const result = filterByStatus("vencida");
    expect(result).toHaveLength(2);
    expect(result.map(r => r.employeeName)).toContain("Maria");
    expect(result.map(r => r.employeeName)).toContain("Pedro");
  });

  it("deve filtrar pendentes normalmente", () => {
    const result = filterByStatus("pendente");
    expect(result).toHaveLength(2);
  });

  it("deve filtrar agendadas normalmente", () => {
    const result = filterByStatus("agendada");
    expect(result).toHaveLength(1);
    expect(result[0].employeeName).toBe("Ana");
  });

  it("deve filtrar em_gozo normalmente", () => {
    const result = filterByStatus("em_gozo");
    expect(result).toHaveLength(1);
    expect(result[0].employeeName).toBe("Carlos");
  });
});

describe("A\u00e7\u00f5es dispon\u00edveis por status de f\u00e9rias", () => {
  function getAvailableActions(status: string) {
    const actions: string[] = [];
    if (status === "pendente" || status === "vencida") actions.push("definir_data");
    if (status === "agendada") actions.push("iniciar_gozo");
    if (status === "em_gozo") actions.push("concluir");
    actions.push("detalhes", "excluir");
    return actions;
  }

  it("f\u00e9rias pendentes devem ter: definir_data, detalhes, excluir", () => {
    const actions = getAvailableActions("pendente");
    expect(actions).toContain("definir_data");
    expect(actions).not.toContain("iniciar_gozo");
    expect(actions).not.toContain("concluir");
  });

  it("f\u00e9rias agendadas devem ter: iniciar_gozo, detalhes, excluir", () => {
    const actions = getAvailableActions("agendada");
    expect(actions).toContain("iniciar_gozo");
    expect(actions).not.toContain("definir_data");
    expect(actions).not.toContain("concluir");
  });

  it("f\u00e9rias em_gozo devem ter: concluir, detalhes, excluir", () => {
    const actions = getAvailableActions("em_gozo");
    expect(actions).toContain("concluir");
    expect(actions).not.toContain("iniciar_gozo");
    expect(actions).not.toContain("definir_data");
  });

  it("f\u00e9rias vencidas devem ter: definir_data, detalhes, excluir", () => {
    const actions = getAvailableActions("vencida");
    expect(actions).toContain("definir_data");
    expect(actions).not.toContain("iniciar_gozo");
  });
});
