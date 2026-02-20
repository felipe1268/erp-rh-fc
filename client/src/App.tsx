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
import AuditoriaQualidade from "./pages/AuditoriaQualidade";
import Cipa from "./pages/Cipa";
// Dashboards
import DashboardIndex from "./pages/dashboards/DashboardIndex";
import DashColaboradores from "./pages/dashboards/DashColaboradores";
import DashPendentes from "./pages/dashboards/DashPendentes";
import DashTreinamentos from "./pages/dashboards/DashTreinamentos";
import DashEpi from "./pages/dashboards/DashEpi";
import DashAcidentes from "./pages/dashboards/DashAcidentes";
import DashAuditorias from "./pages/dashboards/DashAuditorias";
import Dash5w2h from "./pages/dashboards/Dash5w2h";
import DashRiscos from "./pages/dashboards/DashRiscos";
import DashExtintoresHidrantes from "./pages/dashboards/DashExtintoresHidrantes";
import DashDesvios from "./pages/dashboards/DashDesvios";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/empresas"} component={Empresas} />
      <Route path={"/colaboradores"} component={Colaboradores} />
      <Route path={"/usuarios"} component={Usuarios} />
      <Route path={"/auditoria"} component={Auditoria} />
      <Route path={"/sst"} component={SST} />
      <Route path={"/ponto-folha"} component={PontoFolha} />
      <Route path={"/ativos"} component={Ativos} />
      <Route path={"/auditoria-qualidade"} component={AuditoriaQualidade} />
      <Route path={"/cipa"} component={Cipa} />
      {/* Dashboards */}
      <Route path={"/dashboards"} component={DashboardIndex} />
      <Route path={"/dashboards/colaboradores"} component={DashColaboradores} />
      <Route path={"/dashboards/pendentes"} component={DashPendentes} />
      <Route path={"/dashboards/treinamentos"} component={DashTreinamentos} />
      <Route path={"/dashboards/epi"} component={DashEpi} />
      <Route path={"/dashboards/acidentes"} component={DashAcidentes} />
      <Route path={"/dashboards/auditorias"} component={DashAuditorias} />
      <Route path={"/dashboards/5w2h"} component={Dash5w2h} />
      <Route path={"/dashboards/riscos"} component={DashRiscos} />
      <Route path={"/dashboards/extintores-hidrantes"} component={DashExtintoresHidrantes} />
      <Route path={"/dashboards/desvios"} component={DashDesvios} />
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
