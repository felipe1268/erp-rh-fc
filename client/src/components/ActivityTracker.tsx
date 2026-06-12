import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { useModule } from "@/contexts/ModuleContext";

const PAGE_LABELS: Record<string, string> = {
  "/": "Hub de Módulos",
  "/login": "Login",
  "/painel": "Painel RH",
  "/colaboradores": "Colaboradores",
  "/usuarios": "Usuários",
  "/empresas": "Empresas",
  "/obras": "Obras",
  "/clientes": "Clientes",
  "/folha-pagamento": "Folha de Pagamento",
  "/fechamento-ponto": "Fechamento de Ponto",
  "/espelho-ponto": "Espelho de Ponto",
  "/controle-documentos": "Controle de Documentos",
  "/vale-alimentacao": "Vale Alimentação",
  "/setores": "Setores",
  "/funcoes": "Funções",
  "/contas-bancarias": "Contas Bancárias",
  "/relogios-ponto": "Relógios de Ponto",
  "/convencoes-coletivas": "Convenções Coletivas",
  "/processos-trabalhistas": "Processos Trabalhistas",
  "/epis": "EPIs",
  "/aviso-previo": "Aviso Prévio",
  "/ferias": "Férias",
  "/cipa": "CIPA",
  "/modulo-pj": "Módulo PJ",
  "/solicitacao-he": "Solicitação HE",
  "/feriados": "Feriados",
  "/dissidio": "Dissídio",
  "/avaliacao-desempenho": "Avaliação de Desempenho",
  "/configuracoes": "Configurações",
  "/auditoria": "Auditoria",
  "/lixeira": "Lixeira",
  "/ajuda": "Biblioteca de Conhecimento",
  "/apontamentos-campo": "Apontamentos de Campo",
  "/financeiro": "Financeiro Dashboard",
  "/financeiro/lancamentos": "Financeiro Lançamentos",
  "/financeiro/receitas": "Financeiro Receitas",
  "/financeiro/contas-a-pagar": "Financeiro Contas a Pagar",
  "/financeiro/contas-a-receber": "Financeiro Previsão de Faturamento",
  "/financeiro/dre": "Financeiro DRE",
  "/financeiro/fluxo-de-caixa": "Financeiro Fluxo de Caixa",
  "/financeiro/obrigacoes-fiscais": "Financeiro Obrigações Fiscais",
  "/financeiro/plano-de-contas": "Financeiro Plano de Contas",
  "/financeiro/categorias": "Financeiro Categorias",
  "/financeiro/centros-de-custo": "Financeiro Centros de Custo",
  "/financeiro/configuracoes": "Financeiro Configurações",
  "/financeiro/conciliacao": "Financeiro Conciliação",
  "/financeiro/recorrentes": "Financeiro Recorrentes",
  "/orcamento": "Orçamento",
  "/planejamento": "Planejamento",
  "/medicao": "Medição",
  "/compras": "Compras",
  "/almoxarifado": "Almoxarifado",
  "/gestao-documentos": "Gestão de Documentos",
  "/admin/telemetria": "Telemetria (Admin)",
};

function getPageLabel(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  for (const [key, label] of Object.entries(PAGE_LABELS)) {
    if (path.startsWith(key) && key !== "/") return label;
  }
  return path;
}

const DEBOUNCE_MS = 500;
const MIN_DURATION_SECONDS = 3;

export function ActivityTracker() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { activeModule } = useModule();
  const trackMut = trpc.telemetria.trackPageVisit.useMutation();
  const leaveMut = trpc.telemetria.trackPageLeave.useMutation();
  const lastPage = useRef<string | null>(null);
  const enterTime = useRef<number>(Date.now());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companyId = selectedCompanyId
    ? parseInt(selectedCompanyId, 10) : 0;

  const sendLeave = useCallback((pagina: string, startTime: number) => {
    const duracao = Math.round((Date.now() - startTime) / 1000);
    if (duracao >= MIN_DURATION_SECONDS) {
      leaveMut.mutate({
        pagina: getPageLabel(pagina),
        duracao_segundos: Math.min(duracao, 86400),
        companyId,
      });
    }
  }, [companyId, leaveMut]);

  useEffect(() => {
    if (!user || companyId <= 0) return;
    if (location === "/login") return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      if (lastPage.current && lastPage.current !== location) {
        sendLeave(lastPage.current, enterTime.current);
      }

      lastPage.current = location;
      enterTime.current = Date.now();

      trackMut.mutate({
        pagina: getPageLabel(location),
        modulo: activeModule !== "all" ? activeModule : undefined,
        companyId,
      });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [location, user, companyId]);

  useEffect(() => {
    if (!user || companyId <= 0) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && lastPage.current) {
        sendLeave(lastPage.current, enterTime.current);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user, companyId, sendLeave]);

  return null;
}

export function trackAction(pagina: string, acao: string, detalhes?: string) {
  try {
    const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0", 10);
    if (companyId <= 0) return;

    fetch("/api/trpc/telemetria.trackAction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        json: { pagina, acao, detalhes, companyId },
      }),
    }).catch(() => {});
  } catch {}
}
