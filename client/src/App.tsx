import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CompanyProvider } from "./contexts/CompanyContext";
import Home from "./pages/Home";
import Empresas from "./pages/Empresas";
import Colaboradores from "./pages/Colaboradores";
import Usuarios from "./pages/Usuarios";
import Auditoria from "./pages/Auditoria";
import Login from "./pages/Login";
import Configuracoes from "./pages/Configuracoes";
import Obras from "./pages/Obras";
import FechamentoPonto from "./pages/FechamentoPonto";
import FolhaPagamento from "./pages/FolhaPagamento";
import ControleDocumentos from "./pages/ControleDocumentos";
import ValeAlimentacao from "./pages/ValeAlimentacao";
import Setores from "./pages/Setores";
import Funcoes from "./pages/Funcoes";
import ContasBancarias from "./pages/ContasBancarias";
import RelogiosPonto from "./pages/RelogiosPonto";
import ProcessosTrabalhistas from "./pages/ProcessosTrabalhistas";
// Relatórios
import RaioXPage from "./pages/relatorios/RaioXPage";
// Dashboards
import DashboardIndex from "./pages/dashboards/DashboardIndex";
import DashColaboradores from "./pages/dashboards/DashColaboradores";
import DashHorasExtras from "./pages/dashboards/DashHorasExtras";

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/"} component={Home} />
      <Route path={"/empresas"} component={Empresas} />
      <Route path={"/colaboradores"} component={Colaboradores} />
      <Route path={"/obras"} component={Obras} />
      <Route path={"/setores"} component={Setores} />
      <Route path={"/funcoes"} component={Funcoes} />
      <Route path={"/contas-bancarias"} component={ContasBancarias} />
      <Route path={"/relogios-ponto"} component={RelogiosPonto} />
      <Route path={"/processos-trabalhistas"} component={ProcessosTrabalhistas} />
      <Route path={"/usuarios"} component={Usuarios} />
      <Route path={"/auditoria"} component={Auditoria} />
      <Route path={"/fechamento-ponto"} component={FechamentoPonto} />
      <Route path={"/folha-pagamento"} component={FolhaPagamento} />
      <Route path={"/controle-documentos"} component={ControleDocumentos} />
      <Route path={"/vale-alimentacao"} component={ValeAlimentacao} />
      <Route path={"/configuracoes"} component={Configuracoes} />
      {/* Relatórios */}
      <Route path={"/relatorios/raio-x"} component={RaioXPage} />
      {/* Dashboards */}
      <Route path={"/dashboards"} component={DashboardIndex} />
      <Route path={"/dashboards/colaboradores"} component={DashColaboradores} />
      <Route path={"/dashboards/horas-extras"} component={DashHorasExtras} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <CompanyProvider>
            <Router />
          </CompanyProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
