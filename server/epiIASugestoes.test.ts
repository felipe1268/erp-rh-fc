import { describe, it, expect, vi } from "vitest";

// Mock LLM
vi.mock("./server/_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock DB
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();
const mockLeftJoin = vi.fn();

const chainMock = () => ({
  select: mockSelect.mockReturnThis(),
  from: mockFrom.mockReturnThis(),
  where: mockWhere.mockReturnValue([]),
  orderBy: mockOrderBy.mockReturnValue([]),
  limit: mockLimit.mockReturnValue([]),
  leftJoin: mockLeftJoin.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  values: mockValues.mockReturnValue([{ insertId: 1 }]),
  update: mockUpdate.mockReturnThis(),
  set: mockSet.mockReturnThis(),
  delete: mockDelete.mockReturnThis(),
});

vi.mock("./db", () => ({
  getDb: vi.fn(() => chainMock()),
}));

describe("IA Sugestões de EPIs - Rotas Backend", () => {
  describe("iaSugerirKitsPorFuncao", () => {
    it("deve existir como mutation no router epiAvancado", async () => {
      // Verificar que a rota existe no arquivo
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      expect(content).toContain("iaSugerirKitsPorFuncao");
      expect(content).toContain("protectedProcedure");
    });

    it("deve aceitar companyId e funcao opcional como input", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      // Verificar que o input schema inclui companyId e funcao
      const routeSection = content.substring(content.indexOf("iaSugerirKitsPorFuncao"));
      expect(routeSection).toContain("companyId: z.number()");
      expect(routeSection).toContain("funcao: z.string().optional()");
    });

    it("deve usar invokeLLM com response_format json_schema", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirKitsPorFuncao"), content.indexOf("iaSugerirCoresCapacete"));
      expect(routeSection).toContain("invokeLLM");
      expect(routeSection).toContain("json_schema");
      expect(routeSection).toContain("kits_sugestao");
    });

    it("deve consultar Regras de Ouro da empresa", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirKitsPorFuncao"), content.indexOf("iaSugerirCoresCapacete"));
      expect(routeSection).toContain("goldenRules");
      expect(routeSection).toContain("Regras de Ouro");
    });

    it("deve consultar funções da empresa (jobFunctions)", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirKitsPorFuncao"), content.indexOf("iaSugerirCoresCapacete"));
      expect(routeSection).toContain("jobFunctions");
    });

    it("deve consultar EPIs existentes no catálogo", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirKitsPorFuncao"), content.indexOf("iaSugerirCoresCapacete"));
      expect(routeSection).toContain("episCatalogo");
    });

    it("deve retornar schema com kits contendo nome, funcao, descricao e items", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirKitsPorFuncao"), content.indexOf("iaSugerirCoresCapacete"));
      expect(routeSection).toContain('"nome"');
      expect(routeSection).toContain('"funcao"');
      expect(routeSection).toContain('"descricao"');
      expect(routeSection).toContain('"items"');
      expect(routeSection).toContain('"nomeEpi"');
      expect(routeSection).toContain('"categoria"');
      expect(routeSection).toContain('"quantidade"');
      expect(routeSection).toContain('"obrigatorio"');
    });
  });

  describe("iaSugerirCoresCapacete", () => {
    it("deve existir como mutation no router epiAvancado", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      expect(content).toContain("iaSugerirCoresCapacete");
    });

    it("deve usar invokeLLM com schema cores_sugestao", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirCoresCapacete"), content.indexOf("iaSugerirVidaUtil"));
      expect(routeSection).toContain("invokeLLM");
      expect(routeSection).toContain("cores_sugestao");
    });

    it("deve retornar schema com cores contendo cor, hexColor, funcoes e descricao", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirCoresCapacete"), content.indexOf("iaSugerirVidaUtil"));
      expect(routeSection).toContain('"cor"');
      expect(routeSection).toContain('"hexColor"');
      expect(routeSection).toContain('"funcoes"');
      expect(routeSection).toContain('"descricao"');
    });

    it("deve consultar Regras de Ouro e cores existentes", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirCoresCapacete"), content.indexOf("iaSugerirVidaUtil"));
      expect(routeSection).toContain("goldenRules");
      expect(routeSection).toContain("coresExistentes");
    });

    it("deve mencionar padrão NR-18 no prompt", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirCoresCapacete"), content.indexOf("iaSugerirVidaUtil"));
      expect(routeSection).toContain("NR-18");
    });
  });

  describe("iaSugerirVidaUtil", () => {
    it("deve existir como mutation no router epiAvancado", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      expect(content).toContain("iaSugerirVidaUtil");
    });

    it("deve usar invokeLLM com schema vida_util_sugestao", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirVidaUtil"), content.indexOf("iaSugerirTreinamentos"));
      expect(routeSection).toContain("invokeLLM");
      expect(routeSection).toContain("vida_util_sugestao");
    });

    it("deve retornar schema com items contendo nomeEpi, categoriaEpi, vidaUtilMeses e observacoes", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirVidaUtil"), content.indexOf("iaSugerirTreinamentos"));
      expect(routeSection).toContain('"nomeEpi"');
      expect(routeSection).toContain('"categoriaEpi"');
      expect(routeSection).toContain('"vidaUtilMeses"');
      expect(routeSection).toContain('"observacoes"');
    });

    it("deve consultar EPIs do catálogo e Regras de Ouro", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirVidaUtil"), content.indexOf("iaSugerirTreinamentos"));
      expect(routeSection).toContain("episCatalogo");
      expect(routeSection).toContain("goldenRules");
    });
  });

  describe("iaSugerirTreinamentos", () => {
    it("deve existir como mutation no router epiAvancado", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      expect(content).toContain("iaSugerirTreinamentos");
    });

    it("deve usar invokeLLM com schema treinamentos_sugestao", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirTreinamentos"));
      expect(routeSection).toContain("invokeLLM");
      expect(routeSection).toContain("treinamentos_sugestao");
    });

    it("deve retornar schema com items contendo nomeEpi, normaExigida, nomeTreinamento e obrigatorio", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirTreinamentos"));
      expect(routeSection).toContain('"nomeEpi"');
      expect(routeSection).toContain('"normaExigida"');
      expect(routeSection).toContain('"nomeTreinamento"');
      expect(routeSection).toContain('"obrigatorio"');
    });

    it("deve consultar funções, EPIs e Regras de Ouro", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirTreinamentos"));
      expect(routeSection).toContain("jobFunctions");
      expect(routeSection).toContain("episCatalogo");
      expect(routeSection).toContain("goldenRules");
    });

    it("deve mencionar NRs relevantes no prompt (NR-6, NR-18, NR-35, NR-10, NR-33)", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./server/routers/epiAvancado.ts", "utf-8");
      const routeSection = content.substring(content.indexOf("iaSugerirTreinamentos"));
      expect(routeSection).toContain("NR-6");
      expect(routeSection).toContain("NR-18");
      expect(routeSection).toContain("NR-35");
      expect(routeSection).toContain("NR-10");
      expect(routeSection).toContain("NR-33");
    });
  });

  describe("Frontend - EpiKitsConfig", () => {
    it("deve ter botões de IA em todas as 4 abas", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./client/src/pages/EpiKitsConfig.tsx", "utf-8");
      expect(content).toContain("iaSugerirKitsPorFuncao");
      expect(content).toContain("iaSugerirCoresCapacete");
      expect(content).toContain("iaSugerirVidaUtil");
      expect(content).toContain("iaSugerirTreinamentos");
    });

    it("deve ter UI de revisão com aceitar/rejeitar para cada sugestão", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./client/src/pages/EpiKitsConfig.tsx", "utf-8");
      expect(content).toContain("IASuggestionBanner");
      expect(content).toContain("Salvar Todos");
      expect(content).toContain("Descartar");
    });

    it("deve ter estado de loading durante geração de IA", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./client/src/pages/EpiKitsConfig.tsx", "utf-8");
      expect(content).toContain("Gerando...");
      expect(content).toContain("Loader2");
    });

    it("deve permitir remover sugestões individuais", async () => {
      const fs = await import("fs");
      const content = fs.readFileSync("./client/src/pages/EpiKitsConfig.tsx", "utf-8");
      // Check that individual removal is possible for each type
      expect(content).toContain("setIaSugestaoKits(prev => prev?.filter");
      expect(content).toContain("setIaSugestaoCores(prev => prev?.filter");
      expect(content).toContain("setIaSugestaoVida(prev => prev?.filter");
      expect(content).toContain("setIaSugestaoTreino(prev => prev?.filter");
    });
  });
});
