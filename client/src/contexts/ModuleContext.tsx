import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

export type ModuleId = "rh-dp" | "sst" | "juridico" | "avaliacao" | "terceiros" | "parceiros" | "all";

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
  "/comparativo-convencoes": "rh-dp" as ModuleId,
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
  "all": "Todos os Módulos",
};

const STORAGE_KEY = "fc-active-module";

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [activeModule, setActiveModuleState] = useState<ModuleId>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === "rh-dp" || saved === "sst" || saved === "juridico" || saved === "avaliacao" || saved === "terceiros" || saved === "parceiros" || saved === "all")) {
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
