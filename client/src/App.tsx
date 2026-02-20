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
