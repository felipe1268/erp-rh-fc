import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CompanyProvider } from "./contexts/CompanyContext";
import { ModuleProvider } from "./contexts/ModuleContext";
import { ModuleConfigProvider } from "./contexts/ModuleConfigContext";
import { PermissionsProvider } from "./contexts/PermissionsContext";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// ============================================================
// LAZY LOADING - Cada página é carregada sob demanda
// Isso reduz o bundle inicial de ~6MB para ~200KB
// ============================================================

// Páginas essenciais (carregadas imediatamente - usadas no primeiro acesso)
import ModuleHub from "./pages/ModuleHub";
import Login from "./pages/Login";
import NotFound from "@/pages/NotFound";

// Todas as outras páginas são lazy-loaded
const Home = lazy(() => import("./pages/Home"));
const Empresas = lazy(() => import("./pages/Empresas"));
const Colaboradores = lazy(() => import("./pages/Colaboradores"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const GruposUsuarios = lazy(() => import("./pages/GruposUsuarios"));
const Auditoria = lazy(() => import("./pages/Auditoria"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Obras = lazy(() => import("./pages/Obras"));
const ObraEfetivo = lazy(() => import("./pages/ObraEfetivo"));
const FechamentoPonto = lazy(() => import("./pages/FechamentoPonto"));
const FolhaPagamento = lazy(() => import("./pages/FolhaPagamento"));
const PayrollCompetencias = lazy(() => import("./pages/PayrollCompetencias"));
const ControleDocumentos = lazy(() => import("./pages/ControleDocumentos"));
const ValeAlimentacao = lazy(() => import("./pages/ValeAlimentacao"));
const Setores = lazy(() => import("./pages/Setores"));
const Funcoes = lazy(() => import("./pages/Funcoes"));
const ContasBancarias = lazy(() => import("./pages/ContasBancarias"));
const RelogiosPonto = lazy(() => import("./pages/RelogiosPonto"));
const ConvencoesColetivas = lazy(() => import("./pages/ConvencoesColetivas"));
const ProcessosTrabalhistas = lazy(() => import("./pages/ProcessosTrabalhistas"));
const Epis = lazy(() => import("./pages/Epis"));
const Lixeira = lazy(() => import("./pages/Lixeira"));
const AvisoPrevio = lazy(() => import("./pages/AvisoPrevio"));
const Ferias = lazy(() => import("./pages/Ferias"));
const CipaCompleta = lazy(() => import("./pages/CipaCompleta"));
const ModuloPJ = lazy(() => import("./pages/ModuloPJ"));
const ContratoPJView = lazy(() => import("./pages/ContratoPJView"));
const Revisoes = lazy(() => import("./pages/Revisoes"));
const SolicitacaoHE = lazy(() => import("./pages/SolicitacaoHE"));
const ApontamentosCampo = lazy(() => import("./pages/ApontamentosCampo"));
const Feriados = lazy(() => import("./pages/Feriados"));
const Dissidio = lazy(() => import("./pages/Dissidio"));
const PJMedicoes = lazy(() => import("./pages/PJMedicoes"));
const PainelRH = lazy(() => import("./pages/PainelRH"));
const PainelSST = lazy(() => import("./pages/PainelSST"));
const PainelJuridico = lazy(() => import("./pages/PainelJuridico"));
const BibliotecaConhecimento = lazy(() => import("./pages/BibliotecaConhecimento"));
const AvaliacaoDesempenho = lazy(() => import("./pages/AvaliacaoDesempenho"));
const AssistenteIAFloat = lazy(() => import("./components/AssistenteIAFloat"));

// Relatórios
const RaioXPage = lazy(() => import("./pages/relatorios/RaioXPage"));
const RelatorioPonto = lazy(() => import("./pages/relatorios/RelatorioPonto"));
const RelatorioFolha = lazy(() => import("./pages/relatorios/RelatorioFolha"));
const RelatorioDivergencias = lazy(() => import("./pages/relatorios/RelatorioDivergencias"));
const RelatorioCustoObra = lazy(() => import("./pages/relatorios/RelatorioCustoObra"));

// Dashboards
const DashboardIndex = lazy(() => import("./pages/dashboards/DashboardIndex"));
const DashFuncionarios = lazy(() => import("./pages/dashboards/DashFuncionarios"));
const DashCartaoPonto = lazy(() => import("./pages/dashboards/DashCartaoPonto"));
const DashFolhaPagamento = lazy(() => import("./pages/dashboards/DashFolhaPagamento"));
const DashHorasExtras = lazy(() => import("./pages/dashboards/DashHorasExtras"));
const DashEpis = lazy(() => import("./pages/dashboards/DashEpis"));
const DashJuridico = lazy(() => import("./pages/dashboards/DashJuridico"));
const DashAvisoPrevio = lazy(() => import("./pages/dashboards/DashAvisoPrevio"));
const DashFerias = lazy(() => import("./pages/dashboards/DashFerias"));
const VisaoPanoramica = lazy(() => import("./pages/dashboards/VisaoPanoramica"));
const DashEfetivoObra = lazy(() => import("./pages/dashboards/DashEfetivoObra"));
const DashPerfilTempoCasa = lazy(() => import("./pages/dashboards/DashPerfilTempoCasa"));
const DashControleDocumentos = lazy(() => import("./pages/dashboards/DashControleDocumentos"));
const DashCompetencias = lazy(() => import("./pages/dashboards/DashCompetencias"));
const DashApontamentos = lazy(() => import("./pages/dashboards/DashApontamentos"));

// Terceiros
const PainelTerceiros = lazy(() => import("./pages/terceiros/PainelTerceiros"));
const EmpresasTerceiras = lazy(() => import("./pages/terceiros/EmpresasTerceiras"));
const FuncionariosTerceiros = lazy(() => import("./pages/terceiros/FuncionariosTerceiros"));
const ObrigacoesMensais = lazy(() => import("./pages/terceiros/ObrigacoesMensais"));
const PainelConformidade = lazy(() => import("./pages/terceiros/PainelConformidade"));
const AlertasCobrancas = lazy(() => import("./pages/terceiros/AlertasCobranças"));
const PortalTerceiro = lazy(() => import("./pages/terceiros/PortalTerceiro"));
const Crachas = lazy(() => import("./pages/terceiros/Crachas"));
const AprovacaoPortal = lazy(() => import("./pages/terceiros/AprovacaoPortal"));
const ValidacaoIA = lazy(() => import("./pages/terceiros/ValidacaoIA"));

// Parceiros
const PainelParceiros = lazy(() => import("./pages/parceiros/PainelParceiros"));
const CadastroParceiros = lazy(() => import("./pages/parceiros/CadastroParceiros"));
const LancamentosParceiros = lazy(() => import("./pages/parceiros/LancamentosParceiros"));
const GuiaDescontos = lazy(() => import("./pages/parceiros/GuiaDescontos"));
const PagamentosParceiros = lazy(() => import("./pages/parceiros/PagamentosParceiros"));
const AprovacoesParceiros = lazy(() => import("./pages/parceiros/AprovacoesParceiros"));
const PortalParceiro = lazy(() => import("./pages/parceiros/PortalParceiro"));

// Sprint 6 - IA
const ComparativoConvencoes = lazy(() => import("./pages/ComparativoConvencoes"));

// Pesquisa Pública
const PesquisaPublicaPage = lazy(() => import("./pages/PesquisaPublica").then(m => ({ default: m.PesquisaPublicaPage })));
const ClimaPublicoPage = lazy(() => import("./pages/PesquisaPublica").then(m => ({ default: m.ClimaPublicoPage })));

// Portal Externo
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const VerificarAptidao = lazy(() => import("./pages/VerificarAptidao"));
const PortalTrocarSenha = lazy(() => import("./pages/portal/PortalTrocarSenha"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));

// ============================================================
// LOADING FALLBACK - Exibido enquanto a página carrega
// ============================================================
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
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
        <Route path={"/apontamentos-campo"} component={ApontamentosCampo} />
        <Route path={"/feriados"} component={Feriados} />
        <Route path={"/dissidio"} component={Dissidio} />
        <Route path={"/pj-medicoes"} component={PJMedicoes} />
        {/* Avaliação de Desempenho */}
        <Route path={"/avaliacao-desempenho"} component={AvaliacaoDesempenho} />
        {/* Biblioteca de Conhecimento */}
        <Route path={"/ajuda"} component={BibliotecaConhecimento} />
        {/* Relatórios */}
        <Route path={"/relatorios/raio-x"} component={RaioXPage} />
        <Route path={"/relatorios/ponto"} component={RelatorioPonto} />
        <Route path={"/relatorios/folha"} component={RelatorioFolha} />
        <Route path={"/relatorios/divergencias"} component={RelatorioDivergencias} />
        <Route path={"/relatorios/custo-obra"} component={RelatorioCustoObra} />
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
        <Route path={"/dashboards/competencias"} component={DashCompetencias} />
        <Route path={"/dashboards/apontamentos"} component={DashApontamentos} />
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
    </Suspense>
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
                  <Suspense fallback={null}>
                    <AssistenteIAFloat />
                  </Suspense>
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
