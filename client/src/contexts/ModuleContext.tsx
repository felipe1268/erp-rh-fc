import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { useLocation } from "wouter";

export type ModuleId = "rh-dp" | "sst" | "juridico" | "juridico-trabalhista" | "juridico-tributario" | "juridico-civil" | "avaliacao" | "terceiros" | "parceiros" | "orcamento" | "planejamento" | "medicao" | "medicao-terceiros" | "cadastro" | "compras" | "almoxarifado" | "financeiro" | "gestao-documentos" | "operacional" | "frotas" | "comunicados-internos" | "curriculos" | "oraculo" | "portal-cliente" | "admin" | "all";

interface ModuleContextType {
  activeModule: ModuleId;
  setActiveModule: (mod: ModuleId) => void;
  moduleLabel: string;
  isSharedRoute: boolean;
}

const ModuleContext = createContext<ModuleContextType>({
  activeModule: "all",
  setActiveModule: () => {},
  moduleLabel: "Todos",
  isSharedRoute: false,
});

// Map routes to their primary module
const ROUTE_MODULE_MAP: Record<string, ModuleId> = {
  // RH & DP routes
  "/painel": "rh-dp",
  "/painel/rh": "rh-dp",
  "/painel/sst": "sst",
  "/painel/juridico": "juridico",
  "/painel/juridico-trabalhista": "juridico",
  "/painel/tributario": "juridico",
  "/painel/civil": "juridico",
  "/colaboradores": "rh-dp",
  "/recontratacoes-pendentes": "rh-dp",
  "/fechamento-ponto": "rh-dp",
  "/folha-pagamento": "rh-dp",
  "/controle-documentos": "rh-dp",
  "/vale-alimentacao": "rh-dp",
  "/relogios-ponto": "rh-dp",
  "/convencoes-coletivas": "rh-dp",
  "/aviso-previo": "rh-dp",
  "/ferias": "rh-dp",
  "/modulo-pj": "terceiros" as ModuleId,
  "/pj-medicoes": "medicao-terceiros" as ModuleId,
  "/terceiros/pj/conformidade": "terceiros" as ModuleId,
  "/solicitacao-he": "rh-dp",
  "/contas-bancarias": "rh-dp",
  "/dissidio": "rh-dp",
  "/feriados": "rh-dp",
  // SST routes
  "/epis": "sst",
  "/cipa": "sst",
  // Jurídico routes
  "/processos-trabalhistas": "juridico",
  "/processos-tributarios": "juridico",
  "/processos-civis": "juridico",
  "/dashboards/juridico": "juridico",
  "/dashboards/juridico-geral": "juridico",
  "/dashboards/tributario": "juridico",
  "/dashboards/civil": "juridico",
  // Avaliação routes
  "/avaliacao-desempenho": "avaliacao" as ModuleId,
  // Terceiros routes
  "/terceiros/painel": "terceiros" as ModuleId,
  "/terceiros/empresas": "terceiros" as ModuleId,
  "/terceiros/funcionarios": "terceiros" as ModuleId,
  "/terceiros/contratos": "terceiros" as ModuleId,
  "/terceiros/medicoes": "medicao-terceiros" as ModuleId,
  "/terceiros/previsao-caixa": "terceiros" as ModuleId,
  "/terceiros/obrigacoes": "terceiros" as ModuleId,
  "/terceiros/conformidade": "terceiros" as ModuleId,
  "/terceiros/alertas": "terceiros" as ModuleId,
  "/terceiros/crachas": "terceiros" as ModuleId,
  "/terceiros/portal": "terceiros" as ModuleId,
  "/integrasign": "terceiros" as ModuleId,
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
  "/orcamento/dash":         "orcamento" as ModuleId,
  "/orcamento/lista":        "orcamento" as ModuleId,
  "/orcamento/importar":     "orcamento" as ModuleId,
  "/orcamento/composicoes":  "orcamento" as ModuleId,
  "/orcamento/insumos":      "orcamento" as ModuleId,
  "/orcamento/encargos":     "orcamento" as ModuleId,
  "/orcamento/biblioteca":   "orcamento" as ModuleId,
  "/planejamento":           "planejamento" as ModuleId,
  "/medicao":                "medicao" as ModuleId,
  "/comparativo-convencoes": "rh-dp" as ModuleId,
  "/convencao-ia":           "rh-dp" as ModuleId,
  "/compras/painel":           "compras" as ModuleId,
  "/compras/dashboard-obra":   "compras" as ModuleId,
  "/compras/almoxarifado":     "almoxarifado" as ModuleId,
  "/almoxarifado":             "almoxarifado" as ModuleId,
  "/almoxarifado/movimentacoes": "almoxarifado" as ModuleId,
  "/almoxarifado/inventario":  "almoxarifado" as ModuleId,
  "/almoxarifado/categorias":  "almoxarifado" as ModuleId,
  // Equipamentos (Rev. 2258) — plugados no módulo Almoxarifado
  "/equipamentos":                  "almoxarifado" as ModuleId,
  "/equipamentos/proprios":         "almoxarifado" as ModuleId,
  "/equipamentos/locados":          "almoxarifado" as ModuleId,
  "/compras/solicitacoes":     "compras" as ModuleId,
  "/compras/cotacoes":         "compras" as ModuleId,
  "/compras/ordens":           "compras" as ModuleId,
  "/compras/recebimentos":     "compras" as ModuleId,
  "/compras/emergencial":      "compras" as ModuleId,
  "/compras/aprovacoes":       "compras" as ModuleId,
  "/compras/realocacao":       "compras" as ModuleId,
  "/compras/comissoes":        "compras" as ModuleId,
  "/compras/painel-fd":        "compras" as ModuleId,
  "/compras/configuracoes":    "compras" as ModuleId,
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
  "/financeiro/categorias":           "financeiro" as ModuleId,
  "/financeiro/centros-de-custo":     "financeiro" as ModuleId,
  "/financeiro/configuracoes":        "financeiro" as ModuleId,
  "/financeiro/conciliacao":          "financeiro" as ModuleId,
  "/financeiro/recorrentes":          "financeiro" as ModuleId,
  // Gestão de Documentos
  "/gestao-documentos":              "gestao-documentos" as ModuleId,
  // Operacional routes
  "/operacional/painel":             "operacional" as ModuleId,
  "/operacional/rdo":                "operacional" as ModuleId,
  "/operacional/checklists":         "operacional" as ModuleId,
  "/operacional/concretagem":        "operacional" as ModuleId,
  "/operacional/nc":                 "operacional" as ModuleId,
  "/operacional/fotos":              "operacional" as ModuleId,
  // Frotas routes
  "/frotas/painel":                  "frotas" as ModuleId,
  "/frotas/veiculos":                "frotas" as ModuleId,
  "/frotas/manutencoes":             "frotas" as ModuleId,
  "/frotas/combustivel":             "frotas" as ModuleId,
  "/frotas/rastreamento":            "frotas" as ModuleId,
  "/frotas/controle-km":             "frotas" as ModuleId,
  "/frotas/multas":                  "frotas" as ModuleId,
  "/frotas/ipva":                    "frotas" as ModuleId,
  "/frotas/licenciamento":           "frotas" as ModuleId,
  "/frotas/seguros":                 "frotas" as ModuleId,
  // Admin routes
  "/admin/telemetria":               "admin" as ModuleId,
  // Comunicados Internos
  "/comunicados-internos":           "comunicados-internos" as ModuleId,
  // Currículos
  "/curriculos":                     "curriculos" as ModuleId,
  // Oráculo (admin_master only)
  "/oraculo":                        "oraculo" as ModuleId,
  "/empresas": "cadastro",
  "/obras": "cadastro",
  "/setores": "cadastro",
  "/funcoes": "cadastro",
  "/usuarios": "cadastro",
  "/auditoria": "cadastro",
  "/configuracoes": "cadastro",
  "/lixeira": "cadastro",
  "/revisoes": "cadastro",
  "/clientes/portal": "portal-cliente",
};

const MODULE_LABELS: Record<ModuleId, string> = {
  "rh-dp": "RH & DP",
  "sst": "SST",
  "juridico": "Jurídico",
  "juridico-trabalhista": "Trabalhista",
  "juridico-tributario": "Tributário",
  "juridico-civil": "Civil",
  "avaliacao": "Avaliação",
  "terceiros": "Terceiros",
  "parceiros": "Parceiros",
  "orcamento": "Orçamento",
  "planejamento": "Planejamento",
  "medicao": "Medição",
  "medicao-terceiros": "Medição Terceiros",
  "cadastro": "Cadastro",
  "compras": "Compras",
  "almoxarifado": "Almoxarifado",
  "financeiro": "Financeiro",
  "gestao-documentos": "Proj./Doc. Técnicos",
  "operacional": "Operacional",
  "frotas": "Frotas",
  "comunicados-internos": "Comunicados Internos",
  "curriculos": "Currículos",
  "oraculo": "Oráculo",
  "portal-cliente": "Portal do Cliente",
  "admin": "Administração",
  "all": "Todos os Módulos",
};

const STORAGE_KEY = "fc-active-module";

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [activeModule, setActiveModuleState] = useState<ModuleId>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === "rh-dp" || saved === "sst" || saved === "juridico" || saved === "juridico-trabalhista" || saved === "juridico-tributario" || saved === "juridico-civil" || saved === "avaliacao" || saved === "terceiros" || saved === "parceiros" || saved === "orcamento" || saved === "planejamento" || saved === "medicao" || saved === "medicao-terceiros" || saved === "cadastro" || saved === "compras" || saved === "almoxarifado" || saved === "financeiro" || saved === "gestao-documentos" || saved === "operacional" || saved === "frotas" || saved === "comunicados-internos" || saved === "curriculos" || saved === "oraculo" || saved === "portal-cliente" || saved === "all")) {
      return saved as ModuleId;
    }
    return "rh-dp";
  });
  const setActiveModule = (mod: ModuleId) => {
    setActiveModuleState(mod);
    localStorage.setItem(STORAGE_KEY, mod);
  };

  const isSharedRoute = useMemo(() => {
    const sharedPaths = ["/empresas", "/obras", "/setores", "/funcoes", "/usuarios", "/auditoria", "/configuracoes", "/lixeira", "/revisoes"];
    return sharedPaths.some(p => location === p || location.startsWith(p + "/"));
  }, [location]);

  useEffect(() => {
    let routeModule = ROUTE_MODULE_MAP[location] as ModuleId | undefined;

    if (!routeModule) {
      let bestLen = 0;
      for (const [route, mod] of Object.entries(ROUTE_MODULE_MAP)) {
        if (location.startsWith(route + "/") || location === route) {
          if (route.length > bestLen) { bestLen = route.length; routeModule = mod as ModuleId; }
        }
      }
    }

    // Rev. 3087 — Rotas AMBÍGUAS (pertencem a mais de um módulo). A tela de detalhe do
    // contrato de terceiros (`/terceiros/contratos/:id`) é alcançada tanto pelo módulo
    // "Terceiros" quanto pelo "Medição Terceiros" (botão "Medir"). Quando o usuário JÁ
    // está no módulo de medições, NÃO trocamos o menu pra "terceiros" — o painel fica
    // fixo no módulo de origem.
    const STICKY_AMBIGUOUS: { prefix: string; keepIf: ModuleId[] }[] = [
      { prefix: "/terceiros/contratos", keepIf: ["medicao-terceiros"] },
      // Rev. 3376 — "Contas Bancárias" aparece nos menus de Financeiro, Cadastro e RH&DP
      // (mesma rota/tela compartilhada). Quando o usuário JÁ está num desses módulos,
      // NÃO trocamos a barra lateral — fica fixa no módulo de origem.
      { prefix: "/contas-bancarias", keepIf: ["financeiro", "cadastro", "rh-dp"] },
      // Rev. 4455 — "Contratos PJ" (/modulo-pj) aparece tanto no menu RH & DP quanto no
      // menu Terceiros. Quando o usuário já está em "rh-dp", a barra lateral permanece RH.
      { prefix: "/modulo-pj",       keepIf: ["rh-dp"] },
      { prefix: "/contrato-pj",     keepIf: ["rh-dp"] },
    ];
    const sticky = STICKY_AMBIGUOUS.find(
      s => (location === s.prefix || location.startsWith(s.prefix + "/")) && s.keepIf.includes(activeModule),
    );
    if (sticky) return;

    if (routeModule && routeModule !== activeModule) {
      setActiveModule(routeModule);
    }
  }, [location]);

  return (
    <ModuleContext.Provider
      value={{
        activeModule,
        setActiveModule,
        moduleLabel: MODULE_LABELS[activeModule],
        isSharedRoute,
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
