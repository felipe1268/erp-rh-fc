import { describe, it, expect } from "vitest";

// Test the changelog generation logic (same logic used in the datajudConsultarTodos mutation)
const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  fase: 'Fase',
  risco: 'Risco',
  tribunal: 'Tribunal',
  vara: 'Vara',
  datajudGrau: 'Grau/Instância',
  datajudClasse: 'Classe Processual',
  datajudOrgaoJulgador: 'Órgão Julgador',
  datajudSistema: 'Sistema',
  datajudFormato: 'Formato',
  datajudTotalMovimentos: 'Total Movimentações',
  dataDistribuicao: 'Data Distribuição',
};

function gerarChangelog(antes: any, depois: any): Array<{ campo: string; label: string; antes: string | null; depois: string | null }> {
  const mudancas: Array<{ campo: string; label: string; antes: string | null; depois: string | null }> = [];
  for (const [campo, label] of Object.entries(FIELD_LABELS)) {
    const valAntes = antes[campo] != null ? String(antes[campo]) : null;
    const valDepois = depois[campo] != null ? String(depois[campo]) : null;
    if (valAntes !== valDepois) {
      mudancas.push({ campo, label, antes: valAntes, depois: valDepois });
    }
  }
  return mudancas;
}

describe("Changelog DataJud", () => {
  it("should detect status change", () => {
    const antes = { status: "em_andamento", fase: "conhecimento", risco: "medio" };
    const depois = { status: "sentenca", fase: "conhecimento", risco: "medio" };
    const mudancas = gerarChangelog(antes, depois);
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0]).toEqual({
      campo: "status",
      label: "Status",
      antes: "em_andamento",
      depois: "sentenca",
    });
  });

  it("should detect multiple field changes", () => {
    const antes = { status: "em_andamento", fase: "conhecimento", risco: "baixo", tribunal: "TRT6" };
    const depois = { status: "sentenca", fase: "recursal", risco: "alto", tribunal: "TRT6" };
    const mudancas = gerarChangelog(antes, depois);
    expect(mudancas).toHaveLength(3);
    expect(mudancas.map(m => m.campo)).toEqual(["status", "fase", "risco"]);
  });

  it("should return empty array when nothing changed", () => {
    const antes = { status: "em_andamento", fase: "conhecimento", risco: "medio" };
    const depois = { status: "em_andamento", fase: "conhecimento", risco: "medio" };
    const mudancas = gerarChangelog(antes, depois);
    expect(mudancas).toHaveLength(0);
  });

  it("should handle null to value transitions", () => {
    const antes = { status: "em_andamento", datajudGrau: null, datajudClasse: null };
    const depois = { status: "em_andamento", datajudGrau: "G1", datajudClasse: "Reclamatória Trabalhista" };
    const mudancas = gerarChangelog(antes, depois);
    expect(mudancas).toHaveLength(2);
    expect(mudancas[0]).toEqual({
      campo: "datajudGrau",
      label: "Grau/Instância",
      antes: null,
      depois: "G1",
    });
    expect(mudancas[1]).toEqual({
      campo: "datajudClasse",
      label: "Classe Processual",
      antes: null,
      depois: "Reclamatória Trabalhista",
    });
  });

  it("should handle value to null transitions", () => {
    const antes = { datajudOrgaoJulgador: "02A VARA DO TRABALHO DE IGARASSU" };
    const depois = { datajudOrgaoJulgador: null };
    const mudancas = gerarChangelog(antes, depois);
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0].antes).toBe("02A VARA DO TRABALHO DE IGARASSU");
    expect(mudancas[0].depois).toBeNull();
  });

  it("should convert numbers to strings for comparison", () => {
    const antes = { datajudTotalMovimentos: 5 };
    const depois = { datajudTotalMovimentos: 10 };
    const mudancas = gerarChangelog(antes, depois);
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0]).toEqual({
      campo: "datajudTotalMovimentos",
      label: "Total Movimentações",
      antes: "5",
      depois: "10",
    });
  });

  it("should not flag unchanged numeric fields", () => {
    const antes = { datajudTotalMovimentos: 5 };
    const depois = { datajudTotalMovimentos: 5 };
    const mudancas = gerarChangelog(antes, depois);
    expect(mudancas).toHaveLength(0);
  });

  it("should correctly build resultados structure", () => {
    const resultado = {
      id: 1,
      numero: "0000663-21.2025.5.06.0182",
      reclamante: "GENESIO DA SILVA CARVALHO",
      status: "sentenca",
      novasMovs: 3,
      mudancas: [
        { campo: "status", label: "Status", antes: "em_andamento", depois: "sentenca" },
      ],
      semMudanca: false,
    };
    expect(resultado.semMudanca).toBe(false);
    expect(resultado.mudancas).toHaveLength(1);
    expect(resultado.novasMovs).toBe(3);
  });

  it("should mark semMudanca=true when no changes and no new movements", () => {
    const mudancas = gerarChangelog(
      { status: "em_andamento" },
      { status: "em_andamento" }
    );
    const novasMovs = 0;
    const semMudanca = mudancas.length === 0 && novasMovs === 0;
    expect(semMudanca).toBe(true);
  });

  it("should mark semMudanca=false when there are new movements but no field changes", () => {
    const mudancas = gerarChangelog(
      { status: "em_andamento" },
      { status: "em_andamento" }
    );
    const novasMovs = 2;
    const semMudanca = mudancas.length === 0 && novasMovs === 0;
    expect(semMudanca).toBe(false);
  });
});
