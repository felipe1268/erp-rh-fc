import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

export type ModuleId = "rh-dp" | "sst" | "juridico" | "avaliacao" | "terceiros" | "parceiros" | "orcamento" | "planejamento" | "cadastro" | "compras" | "almoxarifado" | "financeiro" | "all";

interface ModuleContextType {
  activeModule: ModuleId;
  setActiveModule: (mod: ModuleId) => void;
  moduleLabel: string;
}

const ModuleContext = createContext<ModuleContextType>({
  activeModule: "all",
  setActiveModule: () => {},
  moduleLabel: "Todos",
});

// Map routes to their primary module
const ROUTE_MODULE_MAP: Record<string, ModuleId> = {
  // RH & DP routes
  "/painel": "rh-dp",
  "/painel/rh": "rh-dp",
  "/painel/sst": "sst",
  "/painel/juridico": "juridico",
  "/colaboradores": "rh-dp",
  "/fechamento-ponto": "rh-dp",
  "/folha-pagamento": "rh-dp",
  "/controle-documentos": "rh-dp",
  "/vale-alimentacao": "rh-dp",
  "/relogios-ponto": "rh-dp",
  "/convencoes-coletivas": "rh-dp",
  "/aviso-previo": "rh-dp",
  "/ferias": "rh-dp",
  "/modulo-pj": "rh-dp",
  "/pj-medicoes": "rh-dp",
  "/solicitacao-he": "rh-dp",
  "/contas-bancarias": "rh-dp",
  "/dissidio": "rh-dp",
  "/feriados": "rh-dp",
  // SST routes
  "/epis": "sst",
  "/cipa": "sst",
  // Jurídico routes
  "/processos-trabalhistas": "juridico",
  // Avaliação routes
  "/avaliacao-desempenho": "avaliacao" as ModuleId,
  // Terceiros routes
  "/terceiros/painel": "terceiros" as ModuleId,
  "/terceiros/empresas": "terceiros" as ModuleId,
  "/terceiros/funcionarios": "terceiros" as ModuleId,
  "/terceiros/obrigacoes": "terceiros" as ModuleId,
  "/terceiros/conformidade": "terceiros" as ModuleId,
  "/terceiros/alertas": "terceiros" as ModuleId,
  "/terceiros/crachas": "terceiros" as ModuleId,
  "/terceiros/portal": "terceiros" as ModuleId,
  // Parceiros routes
  "/parceiros/painel": "parceiros" as ModuleId,
  "/parceiros/cadastro": "parceiros" as ModuleId,
  "/parceiros/lancamentos": "parceiros" as ModuleId,
  "/parceiros/aprovacoes": "parceiros" as ModuleId,
  "/parceiros/guia-descontos": "parceiros" as ModuleId,
  "/parceiros/pagamentos": "parceiros" as ModuleId,
  "/parceiros/portal": "parceiros" as ModuleId,
  "/terceiros/validacao-ia": "terceiros" as ModuleId,
  "/orcamento/painel":       "orcamento" as ModuleId,
  "/orcamento/lista":        "orcamento" as ModuleId,
  "/orcamento/importar":     "orcamento" as ModuleId,
  "/orcamento/composicoes":  "orcamento" as ModuleId,
  "/orcamento/insumos":      "orcamento" as ModuleId,
  "/orcamento/biblioteca":   "orcamento" as ModuleId,
  "/planejamento":           "planejamento" as ModuleId,
  "/comparativo-convencoes": "rh-dp" as ModuleId,
  "/compras/painel":           "compras" as ModuleId,
  "/compras/almoxarifado":     "almoxarifado" as ModuleId,
  "/almoxarifado":             "almoxarifado" as ModuleId,
  "/compras/solicitacoes":     "compras" as ModuleId,
  "/compras/cotacoes":         "compras" as ModuleId,
  "/compras/ordens":           "compras" as ModuleId,
  "/integracoes/mas-controle": "compras" as ModuleId,
  // Cadastro routes
  "/habilidades":            "cadastro" as ModuleId,
  "/compras/fornecedores":   "cadastro" as ModuleId,
  // Financeiro routes
  "/financeiro":                     "financeiro" as ModuleId,
  "/financeiro/lancamentos":          "financeiro" as ModuleId,
  "/financeiro/receitas":             "financeiro" as ModuleId,
  "/financeiro/contas-a-pagar":       "financeiro" as ModuleId,
  "/financeiro/contas-a-receber":     "financeiro" as ModuleId,
  "/financeiro/dre":                  "financeiro" as ModuleId,
  "/financeiro/fluxo-de-caixa":       "financeiro" as ModuleId,
  "/financeiro/obrigacoes-fiscais":   "financeiro" as ModuleId,
  "/financeiro/plano-de-contas":      "financeiro" as ModuleId,
  "/financeiro/centros-de-custo":     "financeiro" as ModuleId,
  "/financeiro/configuracoes":        "financeiro" as ModuleId,
  "/financeiro/conciliacao":          "financeiro" as ModuleId,
  // Shared routes (appear in all modules)
  "/empresas": "all",
  "/obras": "all",
  "/setores": "all",
  "/funcoes": "all",
  "/usuarios": "all",
  "/auditoria": "all",
  "/configuracoes": "all",
  "/lixeira": "all",
  "/revisoes": "all",
};

const MODULE_LABELS: Record<ModuleId, string> = {
  "rh-dp": "RH & DP",
  "sst": "SST",
  "juridico": "Jurídico",
  "avaliacao": "Avaliação",
  "terceiros": "Terceiros",
  "parceiros": "Parceiros",
  "orcamento": "Orçamento",
  "planejamento": "Planejamento",
  "cadastro": "Cadastro",
  "compras": "Compras",
  "almoxarifado": "Almoxarifado",
  "financeiro": "Financeiro",
  "all": "Todos os Módulos",
};

const STORAGE_KEY = "fc-active-module";

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [activeModule, setActiveModuleState] = useState<ModuleId>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === "rh-dp" || saved === "sst" || saved === "juridico" || saved === "avaliacao" || saved === "terceiros" || saved === "parceiros" || saved === "orcamento" || saved === "planejamento" || saved === "cadastro" || saved === "compras" || saved === "almoxarifado" || saved === "financeiro" || saved === "all")) {
      return saved as ModuleId;
    }
    return "rh-dp"; // Default to RH & DP
  });

  const setActiveModule = (mod: ModuleId) => {
    setActiveModuleState(mod);
    localStorage.setItem(STORAGE_KEY, mod);
  };

  // Auto-detect module from route if navigating to a module-specific page
  useEffect(() => {
    const routeModule = ROUTE_MODULE_MAP[location];
    if (routeModule && routeModule !== "all" && routeModule !== activeModule) {
      setActiveModule(routeModule);
    }
  }, [location]);

  return (
    <ModuleContext.Provider
      value={{
        activeModule,
        setActiveModule,
        moduleLabel: MODULE_LABELS[activeModule],
      }}
    >
      {children}
    </ModuleContext.Provider>
  );
}

export function useModule() {
  return useContext(ModuleContext);
}

export { MODULE_LABELS };
