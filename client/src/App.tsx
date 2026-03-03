import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CompanyProvider } from "./contexts/CompanyContext";
import { ModuleProvider } from "./contexts/ModuleContext";
import { ModuleConfigProvider } from "./contexts/ModuleConfigContext";
import { PermissionsProvider } from "./contexts/PermissionsContext";
import ModuleHub from "./pages/ModuleHub";
import Home from "./pages/Home";
import Empresas from "./pages/Empresas";
import Colaboradores from "./pages/Colaboradores";
import Usuarios from "./pages/Usuarios";
import GruposUsuarios from "./pages/GruposUsuarios";
import Auditoria from "./pages/Auditoria";
import Login from "./pages/Login";
import Configuracoes from "./pages/Configuracoes";
import Obras from "./pages/Obras";
import ObraEfetivo from "./pages/ObraEfetivo";
import FechamentoPonto from "./pages/FechamentoPonto";
import FolhaPagamento from "./pages/FolhaPagamento";
import PayrollCompetencias from "./pages/PayrollCompetencias";
import ControleDocumentos from "./pages/ControleDocumentos";
import ValeAlimentacao from "./pages/ValeAlimentacao";
import Setores from "./pages/Setores";
import Funcoes from "./pages/Funcoes";
import ContasBancarias from "./pages/ContasBancarias";
import RelogiosPonto from "./pages/RelogiosPonto";
import ConvencoesColetivas from "./pages/ConvencoesColetivas";
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
import DashAvisoPrevio from "./pages/dashboards/DashAvisoPrevio";
import DashFerias from "./pages/dashboards/DashFerias";
import VisaoPanoramica from "./pages/dashboards/VisaoPanoramica";
import DashEfetivoObra from "./pages/dashboards/DashEfetivoObra";
import DashPerfilTempoCasa from "./pages/dashboards/DashPerfilTempoCasa";
import DashControleDocumentos from "./pages/dashboards/DashControleDocumentos";
import Lixeira from "./pages/Lixeira";
import AvisoPrevio from "./pages/AvisoPrevio";
import Ferias from "./pages/Ferias";
import CipaCompleta from "./pages/CipaCompleta";
import ModuloPJ from "./pages/ModuloPJ";
import ContratoPJView from "./pages/ContratoPJView";
import Revisoes from "./pages/Revisoes";
import SolicitacaoHE from "./pages/SolicitacaoHE";
import Feriados from "./pages/Feriados";
import Dissidio from "./pages/Dissidio";
import PJMedicoes from "./pages/PJMedicoes";
import PainelRH from "./pages/PainelRH";
import PainelSST from "./pages/PainelSST";
import PainelJuridico from "./pages/PainelJuridico";
import BibliotecaConhecimento from "./pages/BibliotecaConhecimento";
import AvaliacaoDesempenho from "./pages/AvaliacaoDesempenho";
import { PesquisaPublicaPage, ClimaPublicoPage } from "./pages/PesquisaPublica";
import AssistenteIAFloat from "./components/AssistenteIAFloat";
// Terceiros
import PainelTerceiros from "./pages/terceiros/PainelTerceiros";
import EmpresasTerceiras from "./pages/terceiros/EmpresasTerceiras";
import FuncionariosTerceiros from "./pages/terceiros/FuncionariosTerceiros";
import ObrigacoesMensais from "./pages/terceiros/ObrigacoesMensais";
import PainelConformidade from "./pages/terceiros/PainelConformidade";
import AlertasCobrancas from "./pages/terceiros/AlertasCobranças";
import PortalTerceiro from "./pages/terceiros/PortalTerceiro";
import Crachas from "./pages/terceiros/Crachas";
import AprovacaoPortal from "./pages/terceiros/AprovacaoPortal";
// Parceiros
import PainelParceiros from "./pages/parceiros/PainelParceiros";
import CadastroParceiros from "./pages/parceiros/CadastroParceiros";
import LancamentosParceiros from "./pages/parceiros/LancamentosParceiros";
import GuiaDescontos from "./pages/parceiros/GuiaDescontos";
import PagamentosParceiros from "./pages/parceiros/PagamentosParceiros";
import AprovacoesParceiros from "./pages/parceiros/AprovacoesParceiros";
import PortalParceiro from "./pages/parceiros/PortalParceiro";
// Sprint 6 - IA
import ValidacaoIA from "./pages/terceiros/ValidacaoIA";
import ComparativoConvencoes from "./pages/ComparativoConvencoes";
// Portal Externo
import PortalLogin from "./pages/portal/PortalLogin";
import VerificarAptidao from "./pages/VerificarAptidao";
import PortalTrocarSenha from "./pages/portal/PortalTrocarSenha";
import PortalDashboard from "./pages/portal/PortalDashboard";

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      {/* Hub de Módulos - Tela Inicial */}
      <Route path={"/"} component={ModuleHub} />
      {/* Painéis por Módulo */}
      <Route path={"/painel"} component={Home} />
      <Route path={"/painel/rh"} component={PainelRH} />
      <Route path={"/painel/sst"} component={PainelSST} />
      <Route path={"/painel/juridico"} component={PainelJuridico} />
      <Route path={"/empresas"} component={Empresas} />
      <Route path={"/colaboradores"} component={Colaboradores} />
      <Route path={"/obras"} component={Obras} />
      <Route path={"/obras/efetivo"} component={ObraEfetivo} />
      <Route path={"/setores"} component={Setores} />
      <Route path={"/funcoes"} component={Funcoes} />
      <Route path={"/contas-bancarias"} component={ContasBancarias} />
      <Route path={"/relogios-ponto"} component={RelogiosPonto} />
      <Route path={"/convencoes-coletivas"} component={ConvencoesColetivas} />
      <Route path={"/processos-trabalhistas"} component={ProcessosTrabalhistas} />
      <Route path={"/epis"} component={Epis} />
      <Route path={"/usuarios"} component={Usuarios} />
      <Route path={"/grupos-usuarios"} component={GruposUsuarios} />
      <Route path={"/auditoria"} component={Auditoria} />
      <Route path={"/fechamento-ponto"} component={FechamentoPonto} />
      <Route path={"/folha-pagamento"} component={FolhaPagamento} />
      <Route path={"/gestao-competencias"} component={PayrollCompetencias} />
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
      <Route path={"/solicitacao-he"} component={SolicitacaoHE} />
      <Route path={"/feriados"} component={Feriados} />
      <Route path={"/dissidio"} component={Dissidio} />
      <Route path={"/pj-medicoes"} component={PJMedicoes} />
      {/* Avaliação de Desempenho */}
      <Route path={"/avaliacao-desempenho"} component={AvaliacaoDesempenho} />
      {/* Biblioteca de Conhecimento */}
      <Route path={"/ajuda"} component={BibliotecaConhecimento} />
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
      <Route path={"/dashboards/aviso-previo"} component={DashAvisoPrevio} />
      <Route path={"/dashboards/ferias"} component={DashFerias} />
      <Route path={"/dashboards/efetivo-obra"} component={DashEfetivoObra} />
      <Route path={"/dashboards/visao-panoramica"} component={VisaoPanoramica} />
      <Route path={"/dashboards/perfil-tempo-casa"} component={DashPerfilTempoCasa} />
      <Route path={"/dashboards/controle-documentos"} component={DashControleDocumentos} />
      {/* Terceiros */}
      <Route path="/terceiros" component={PainelTerceiros} />
      <Route path="/terceiros/empresas" component={EmpresasTerceiras} />
      <Route path="/terceiros/funcionarios" component={FuncionariosTerceiros} />
      <Route path="/terceiros/obrigacoes-mensais" component={ObrigacoesMensais} />
      <Route path="/terceiros/obrigacoes" component={ObrigacoesMensais} />
      <Route path="/terceiros/conformidade" component={PainelConformidade} />
      <Route path="/terceiros/alertas" component={AlertasCobrancas} />
      <Route path="/terceiros/aprovacao" component={AprovacaoPortal} />
      <Route path="/terceiros/portal" component={PortalTerceiro} />
      <Route path="/terceiros/crachas" component={Crachas} />
      <Route path="/crachas" component={Crachas} />
      <Route path="/terceiros/validacao-ia" component={ValidacaoIA} />
      <Route path="/terceiros/painel" component={PainelTerceiros} />
      {/* Parceiros */}
      <Route path="/parceiros" component={PainelParceiros} />
      <Route path="/parceiros/cadastro" component={CadastroParceiros} />
      <Route path="/parceiros/lancamentos" component={LancamentosParceiros} />
      <Route path="/parceiros/guia-descontos" component={GuiaDescontos} />
      <Route path="/parceiros/pagamentos" component={PagamentosParceiros} />
      <Route path="/parceiros/aprovacoes" component={AprovacoesParceiros} />
      <Route path="/parceiros/portal" component={PortalParceiro} />
      <Route path="/parceiros/painel" component={PainelParceiros} />
      {/* Sprint 6 - IA */}
      <Route path="/comparativo-convencoes" component={ComparativoConvencoes} />
      <Route path="/pesquisa-publica/pesquisa/:token" component={PesquisaPublicaPage} />
      {/* Portal Externo (Terceiros/Parceiros) */}
      <Route path="/portal/login" component={PortalLogin} />
      <Route path="/portal/trocar-senha" component={PortalTrocarSenha} />
      <Route path="/portal/dashboard" component={PortalDashboard} />
      <Route path="/pesquisa-publica/clima/:token" component={ClimaPublicoPage} />
      {/* Verificação Pública de Aptidão (QR Code) */}
      <Route path="/verificar/clt/:id" component={VerificarAptidao} />
      <Route path="/verificar/pj/:id" component={VerificarAptidao} />
      <Route path="/verificar/terceiro/:id" component={VerificarAptidao} />
      <Route path={"404"} component={NotFound} />
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
            <ModuleConfigProvider>
              <PermissionsProvider>
                <ModuleProvider>
                  <Router />
                  <AssistenteIAFloat />
                </ModuleProvider>
              </PermissionsProvider>
            </ModuleConfigProvider>
          </CompanyProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
