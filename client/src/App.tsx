import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CompanyProvider } from "./contexts/CompanyContext";
import { ModuleProvider } from "./contexts/ModuleContext";
import ModuleHub from "./pages/ModuleHub";
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
import Epis from "./pages/Epis";
// Relatórios
import RaioXPage from "./pages/relatorios/RaioXPage";
// Dashboards
import DashboardIndex from "./pages/dashboards/DashboardIndex";
import DashFuncionarios from "./pages/dashboards/DashFuncionarios";
import DashCartaoPonto from "./pages/dashboards/DashCartaoPonto";
import DashFolhaPagamento from "./pages/dashboards/DashFolhaPagamento";
import DashHorasExtras from "./pages/dashboards/DashHorasExtras";
import DashEpis from "./pages/dashboards/DashEpis";
import DashJuridico from "./pages/dashboards/DashJuridico";
import Lixeira from "./pages/Lixeira";
import AvisoPrevio from "./pages/AvisoPrevio";
import Ferias from "./pages/Ferias";
import CipaCompleta from "./pages/CipaCompleta";
import ModuloPJ from "./pages/ModuloPJ";
import ContratoPJView from "./pages/ContratoPJView";
import Revisoes from "./pages/Revisoes";
import DixiPonto from "./pages/DixiPonto";
import SolicitacaoHE from "./pages/SolicitacaoHE";
import Feriados from "./pages/Feriados";
import Dissidio from "./pages/Dissidio";
import PJMedicoes from "./pages/PJMedicoes";

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      {/* Hub de Módulos - Tela Inicial */}
      <Route path={"/"} component={ModuleHub} />
      {/* Painel Principal (antigo Home) */}
      <Route path={"/painel"} component={Home} />
      <Route path={"/empresas"} component={Empresas} />
      <Route path={"/colaboradores"} component={Colaboradores} />
      <Route path={"/obras"} component={Obras} />
      <Route path={"/setores"} component={Setores} />
      <Route path={"/funcoes"} component={Funcoes} />
      <Route path={"/contas-bancarias"} component={ContasBancarias} />
      <Route path={"/relogios-ponto"} component={RelogiosPonto} />
      <Route path={"/processos-trabalhistas"} component={ProcessosTrabalhistas} />
      <Route path={"/epis"} component={Epis} />
      <Route path={"/usuarios"} component={Usuarios} />
      <Route path={"/auditoria"} component={Auditoria} />
      <Route path={"/fechamento-ponto"} component={FechamentoPonto} />
      <Route path={"/folha-pagamento"} component={FolhaPagamento} />
      <Route path={"/controle-documentos"} component={ControleDocumentos} />
      <Route path={"/vale-alimentacao"} component={ValeAlimentacao} />
      <Route path={"/configuracoes"} component={Configuracoes} />
      <Route path={"/lixeira"} component={Lixeira} />
      <Route path={"/aviso-previo"} component={AvisoPrevio} />
      <Route path={"/ferias"} component={Ferias} />
      <Route path={"/cipa"} component={CipaCompleta} />
      <Route path={"/modulo-pj"} component={ModuloPJ} />
      <Route path={"/contrato-pj/:id"} component={ContratoPJView} />
      <Route path={"/revisoes"} component={Revisoes} />
      <Route path={"/dixi-ponto"} component={DixiPonto} />
      <Route path={"/solicitacao-he"} component={SolicitacaoHE} />
      <Route path={"/feriados"} component={Feriados} />
      <Route path={"/dissidio"} component={Dissidio} />
      <Route path={"/pj-medicoes"} component={PJMedicoes} />
      {/* Relatórios */}
      <Route path={"/relatorios/raio-x"} component={RaioXPage} />
      {/* Dashboards */}
      <Route path={"/dashboards"} component={DashboardIndex} />
      <Route path={"/dashboards/funcionarios"} component={DashFuncionarios} />
      <Route path={"/dashboards/cartao-ponto"} component={DashCartaoPonto} />
      <Route path={"/dashboards/folha-pagamento"} component={DashFolhaPagamento} />
      <Route path={"/dashboards/horas-extras"} component={DashHorasExtras} />
      <Route path={"/dashboards/epis"} component={DashEpis} />
      <Route path={"/dashboards/juridico"} component={DashJuridico} />
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
          <Toaster position="bottom-left" />
          <CompanyProvider>
            <ModuleProvider>
              <Router />
            </ModuleProvider>
          </CompanyProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
