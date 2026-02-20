import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Empresas from "./pages/Empresas";
import Colaboradores from "./pages/Colaboradores";
import Usuarios from "./pages/Usuarios";
import Auditoria from "./pages/Auditoria";
import SST from "./pages/SST";
import PontoFolha from "./pages/PontoFolha";
import Ativos from "./pages/Ativos";
import Cipa from "./pages/Cipa";
import Login from "./pages/Login";
import Configuracoes from "./pages/Configuracoes";
// Dashboards
import DashboardIndex from "./pages/dashboards/DashboardIndex";
import DashColaboradores from "./pages/dashboards/DashColaboradores";
import DashPendentes from "./pages/dashboards/DashPendentes";
import DashTreinamentos from "./pages/dashboards/DashTreinamentos";
import DashEpi from "./pages/dashboards/DashEpi";
import DashAcidentes from "./pages/dashboards/DashAcidentes";
import DashRiscos from "./pages/dashboards/DashRiscos";
import DashHorasExtras from "./pages/dashboards/DashHorasExtras";

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/"} component={Home} />
      <Route path={"/empresas"} component={Empresas} />
      <Route path={"/colaboradores"} component={Colaboradores} />
      <Route path={"/usuarios"} component={Usuarios} />
      <Route path={"/auditoria"} component={Auditoria} />
      <Route path={"/sst"} component={SST} />
      <Route path={"/ponto-folha"} component={PontoFolha} />
      <Route path={"/ativos"} component={Ativos} />
      <Route path={"/cipa"} component={Cipa} />
      <Route path={"/configuracoes"} component={Configuracoes} />
      {/* Dashboards */}
      <Route path={"/dashboards"} component={DashboardIndex} />
      <Route path={"/dashboards/colaboradores"} component={DashColaboradores} />
      <Route path={"/dashboards/pendentes"} component={DashPendentes} />
      <Route path={"/dashboards/treinamentos"} component={DashTreinamentos} />
      <Route path={"/dashboards/epi"} component={DashEpi} />
      <Route path={"/dashboards/acidentes"} component={DashAcidentes} />
      <Route path={"/dashboards/riscos"} component={DashRiscos} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
