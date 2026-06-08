import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CompanyProvider } from "./contexts/CompanyContext";
import { ModuleProvider } from "./contexts/ModuleContext";
import { ModuleConfigProvider } from "./contexts/ModuleConfigContext";
import { PermissionsProvider, usePermissions } from "./contexts/PermissionsContext";
import { lazy, Suspense, ComponentType, useEffect } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "./_core/hooks/useAuth";
import DashboardLayout from "./components/DashboardLayout";

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

function MasterOnlyGuard({ component: Component }: { component: ComponentType }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  // Redirecionar via useEffect — nunca durante o render (causa warning do React)
  useEffect(() => {
    if (loading) return;
    if (!user) { setLocation("/login"); return; }
    if (user.role !== 'admin_master') { setLocation("/"); }
  }, [user, loading, setLocation]);

  if (loading) return <PageLoader />;
  if (!user || user.role !== 'admin_master') return <PageLoader />;
  return <Component />;
}

function RouteGuard({ component: Component, route }: { component: ComponentType; route: string | string[] }) {
  const { isAdminMaster, hasGroup, groupCanAccessRoute, isLoading } = usePermissions();

  if (isLoading) {
    return <PageLoader />;
  }

  const routes = Array.isArray(route) ? route : [route];
  const canAccess = isAdminMaster || !hasGroup || routes.some(r => groupCanAccessRoute(r));

  if (!canAccess) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
          <div className="bg-red-50 p-4 rounded-full mb-4">
            <ShieldAlert className="h-10 w-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Acesso Restrito</h1>
          <p className="text-slate-600 max-w-md">
            Você não tem permissão para acessar esta página.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return <Component />;
}

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
const Oraculo = lazy(() => import("./pages/Oraculo"));
const Empresas = lazy(() => import("./pages/Empresas"));
const Colaboradores = lazy(() => import("./pages/Colaboradores"));
const ColetaCampo = lazy(() => import("./pages/ColetaCampo"));
const ColetaCampoPublica = lazy(() => import("./pages/portal/ColetaCampoPublica"));
const AvaliacaoPublica = lazy(() => import("./pages/portal/AvaliacaoPublica"));
const RecontratacoesPendentes = lazy(() => import("./pages/RecontratacoesPendentes"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const GruposUsuarios = lazy(() => import("./pages/GruposUsuarios"));
const Auditoria = lazy(() => import("./pages/Auditoria"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const MenuConfig = lazy(() => import("./pages/MenuConfig"));
const Migration = lazy(() => import("./pages/Migration"));
const Obras = lazy(() => import("./pages/Obras"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Gerenciadoras = lazy(() => import("./pages/Gerenciadoras"));
const ObraEfetivo = lazy(() => import("./pages/ObraEfetivo"));
const FechamentoPonto = lazy(() => import("./pages/FechamentoPonto"));
const EspelhoPonto = lazy(() => import("./pages/EspelhoPonto"));
const FolhaPagamento = lazy(() => import("./pages/FolhaPagamento"));
const EncargosSociais = lazy(() => import("./pages/EncargosSociais"));
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
const PedidoDemissao = lazy(() => import("./pages/PedidoDemissao"));
const Ferias = lazy(() => import("./pages/Ferias"));
const SeguroVida = lazy(() => import("./pages/SeguroVida"));
const CipaCompleta = lazy(() => import("./pages/CipaCompleta"));
const ModuloPJ = lazy(() => import("./pages/ModuloPJ"));
const ContratoPJView = lazy(() => import("./pages/ContratoPJView"));
const AditivoPJView = lazy(() => import("./pages/AditivoPJView"));
const Revisoes = lazy(() => import("./pages/Revisoes"));
const SolicitacaoHE = lazy(() => import("./pages/SolicitacaoHE"));
const BancoHoras = lazy(() => import("./pages/BancoHoras"));
const FinanceiroDashboard     = lazy(() => import("./pages/financeiro/FinanceiroDashboard"));
const FinanceiroLancamentos   = lazy(() => import("./pages/financeiro/FinanceiroLancamentos"));
const FinanceiroReceitas      = lazy(() => import("./pages/financeiro/FinanceiroReceitas"));
const FinanceiroContasAPagar  = lazy(() => import("./pages/financeiro/FinanceiroContasAPagar"));
const FinanceiroContasAReceber= lazy(() => import("./pages/financeiro/FinanceiroContasAReceber"));
const FinanceiroDRE           = lazy(() => import("./pages/financeiro/FinanceiroDRE"));
const FinanceiroFluxoCaixa    = lazy(() => import("./pages/financeiro/FinanceiroFluxoCaixa"));
const FinanceiroObrigacoesFiscais = lazy(() => import("./pages/financeiro/FinanceiroObrigacoesFiscais"));
const FinanceiroPlanoDeConta  = lazy(() => import("./pages/financeiro/FinanceiroPlanoDeConta"));
const FinanceiroCategorias    = lazy(() => import("./pages/financeiro/FinanceiroCategorias"));
const FinanceiroCentrosCusto  = lazy(() => import("./pages/financeiro/FinanceiroCentrosCusto"));
const FinanceiroConfiguracoes = lazy(() => import("./pages/financeiro/FinanceiroConfiguracoes"));
const FinanceiroConciliacao   = lazy(() => import("./pages/financeiro/FinanceiroConciliacao"));
const FinanceiroRecorrentes  = lazy(() => import("./pages/financeiro/FinanceiroRecorrentes"));
const FinanceiroCronograma   = lazy(() => import("./pages/financeiro/FinanceiroCronograma"));
const FinanceiroAnaliseCFO    = lazy(() => import("./pages/financeiro/FinanceiroAnaliseCFO"));
const FinanceiroCFOSuite      = lazy(() => import("./pages/financeiro/FinanceiroCFOSuite"));
const ApontamentosCampo = lazy(() => import("./pages/ApontamentosCampo"));
const Feriados = lazy(() => import("./pages/Feriados"));
const ComunicadosInternos = lazy(() => import("./pages/ComunicadosInternos"));
const Curriculos = lazy(() => import("./pages/Curriculos"));
const Dissidio = lazy(() => import("./pages/Dissidio"));
const ConvencaoColetivaIA = lazy(() => import("./pages/ConvencaoColetivaIA"));
const PJMedicoes = lazy(() => import("./pages/PJMedicoes"));
const ConformidadePJ = lazy(() => import("./pages/ConformidadePJ"));
const ConformidadePJDashboard = lazy(() => import("./pages/ConformidadePJDashboard"));
const PainelRH = lazy(() => import("./pages/PainelRH"));
const PainelSST = lazy(() => import("./pages/PainelSST"));
const ProgramasSST = lazy(() => import("./pages/ProgramasSST"));
const IntegracaoSST = lazy(() => import("./pages/sst/IntegracaoSST"));
const DDSGuia = lazy(() => import("./pages/sst/DDSGuia"));
const DDSDashboard = lazy(() => import("./pages/sst/DDSDashboard"));
const DashboardAtestadosAcidentes = lazy(() => import("./pages/sst/DashboardAtestadosAcidentes"));
const RegistroAcidentes = lazy(() => import("./pages/sst/RegistroAcidentes"));
const IntegracaoPublica = lazy(() => import("./pages/sst/IntegracaoPublica"));
const PainelJuridico = lazy(() => import("./pages/PainelJuridico"));
const PainelTrabalhista = lazy(() => import("./pages/PainelTrabalhista"));
const PainelTributario = lazy(() => import("./pages/PainelTributario"));
const PainelCivil = lazy(() => import("./pages/PainelCivil"));
const ProcessosTributarios = lazy(() => import("./pages/ProcessosTributarios"));
const ProcessosCivis = lazy(() => import("./pages/ProcessosCivis"));
const BibliotecaConhecimento = lazy(() => import("./pages/BibliotecaConhecimento"));
const AvaliacaoDesempenho = lazy(() => import("./pages/AvaliacaoDesempenho"));
const Telemetria = lazy(() => import("./pages/Telemetria"));
const ImportData = lazy(() => import("./pages/ImportData"));

// Relatórios
const RaioXPage = lazy(() => import("./pages/relatorios/RaioXPage"));
const RaioXDirectPage = lazy(() => import("./pages/relatorios/RaioXDirectPage"));
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
const DashJuridicoGeral = lazy(() => import("./pages/dashboards/DashJuridicoGeral"));
const DashTributario = lazy(() => import("./pages/dashboards/DashTributario"));
const DashCivil = lazy(() => import("./pages/dashboards/DashCivil"));
const DashAvisoPrevio = lazy(() => import("./pages/dashboards/DashAvisoPrevio"));
const DashAvaliacaoFuncionarios = lazy(() => import("./pages/dashboards/DashAvaliacaoFuncionarios"));
const DashFerias = lazy(() => import("./pages/dashboards/DashFerias"));
const VisaoPanoramica = lazy(() => import("./pages/dashboards/VisaoPanoramica"));
const DashEfetivoObra = lazy(() => import("./pages/dashboards/DashEfetivoObra"));
const Habilidades = lazy(() => import("./pages/Habilidades"));
const DashPerfilTempoCasa = lazy(() => import("./pages/dashboards/DashPerfilTempoCasa"));
const DashControleDocumentos = lazy(() => import("./pages/dashboards/DashControleDocumentos"));
const DashCompetencias = lazy(() => import("./pages/dashboards/DashCompetencias"));
const DashApontamentos = lazy(() => import("./pages/dashboards/DashApontamentos"));
const DashHabilidades = lazy(() => import("./pages/dashboards/DashHabilidades"));
const DashParceiros = lazy(() => import("./pages/dashboards/DashParceiros"));
const DashAlmoxarifadoEquipamentos = lazy(() => import("./pages/dashboards/DashAlmoxarifadoEquipamentos"));
const RelatorioHabilidadesObra = lazy(() => import("./pages/RelatorioHabilidadesObra"));
const ImportacaoHabilidades = lazy(() => import("./pages/ImportacaoHabilidades"));

// Terceiros
const PainelTerceiros = lazy(() => import("./pages/terceiros/PainelTerceiros"));
const EmpresasTerceiras = lazy(() => import("./pages/terceiros/EmpresasTerceiras"));
const TerceiroRaioX = lazy(() => import("./pages/terceiros/TerceiroRaioX"));
const FuncionariosTerceiros = lazy(() => import("./pages/terceiros/FuncionariosTerceiros"));
const ObrigacoesMensais = lazy(() => import("./pages/terceiros/ObrigacoesMensais"));
const PainelConformidade = lazy(() => import("./pages/terceiros/PainelConformidade"));
const AlertasCobrancas = lazy(() => import("./pages/terceiros/AlertasCobranças"));
const PortalTerceiro = lazy(() => import("./pages/terceiros/PortalTerceiro"));
const Crachas = lazy(() => import("./pages/terceiros/Crachas"));
const AprovacaoPortal = lazy(() => import("./pages/terceiros/AprovacaoPortal"));
const ValidacaoIA = lazy(() => import("./pages/terceiros/ValidacaoIA"));
const ContratosList = lazy(() => import("./pages/terceiros/contratos/ContratosList"));
const ContratoNovo = lazy(() => import("./pages/terceiros/contratos/ContratoNovo"));
const ContratoDetalhe = lazy(() => import("./pages/terceiros/contratos/ContratoDetalhe"));
const ContratoTemplate = lazy(() => import("./pages/terceiros/contratos/ContratoTemplate"));
const MedicoesTerceiros = lazy(() => import("./pages/terceiros/Medicoes"));
const PrevisaoCaixaTerceiros = lazy(() => import("./pages/terceiros/PrevisaoCaixa"));
const AdvertenciasTerceiros = lazy(() => import("./pages/terceiros/AdvertenciasTerceiros"));

// Parceiros
const PainelParceiros = lazy(() => import("./pages/parceiros/PainelParceiros"));
const CadastroParceiros = lazy(() => import("./pages/parceiros/CadastroParceiros"));
const LancamentosParceiros = lazy(() => import("./pages/parceiros/LancamentosParceiros"));
const GuiaDescontos = lazy(() => import("./pages/parceiros/GuiaDescontos"));
const PagamentosParceiros = lazy(() => import("./pages/parceiros/PagamentosParceiros"));
const AprovacoesParceiros = lazy(() => import("./pages/parceiros/AprovacoesParceiros"));
const PortalParceiro = lazy(() => import("./pages/parceiros/PortalParceiro"));

// Orçamento
const PainelOrcamento    = lazy(() => import("./pages/orcamento/PainelOrcamento"));
const OrcamentoLista     = lazy(() => import("./pages/orcamento/OrcamentoLista"));
const OrcamentoDetalhe   = lazy(() => import("./pages/orcamento/OrcamentoDetalhe"));
const OrcamentoImportar  = lazy(() => import("./pages/orcamento/OrcamentoImportar"));
const OrcamentoPrint     = lazy(() => import("./pages/orcamento/OrcamentoPrint"));
const BibliotecaOrcamento = lazy(() => import("./pages/orcamento/BibliotecaOrcamento"));
const OrcamentoDashPage  = lazy(() => import("./pages/orcamento/OrcamentoDashPage"));

// Planejamento
const PlanejamentoLista   = lazy(() => import("./pages/planejamento/PlanejamentoLista"));
const PlanejamentoDetalhe = lazy(() => import("./pages/planejamento/PlanejamentoDetalhe"));

// Gestão de Documentos
const GestaoDocumentos = lazy(() => import("./pages/gestaodocumentos/index"));

// Medição de Contratos
const MedicaoContratos = lazy(() => import("./pages/medicao/MedicaoContratos"));
const MedicaoDetalhe   = lazy(() => import("./pages/medicao/MedicaoDetalhe"));
const MedicaoLevantamento = lazy(() => import("./pages/medicao/MedicaoLevantamento"));

// Compras
const PainelCompras = lazy(() => import("./pages/compras/Painel"));
const Fornecedores = lazy(() => import("./pages/compras/Fornecedores"));
const Almoxarifado = lazy(() => import("./pages/compras/Almoxarifado"));
const AlmoxarifadoPage = lazy(() => import("./pages/almoxarifado/index"));
const AlmoxarifadoCategorias = lazy(() => import("./pages/almoxarifado/Categorias"));
const AlmoxarifadoMovimentacoes = lazy(() => import("./pages/almoxarifado/Movimentacoes"));
const AlmoxarifadoInventario = lazy(() => import("./pages/almoxarifado/Inventario"));
const AlmoxarifadoInventarioVisual = lazy(() => import("./pages/almoxarifado/InventarioVisual"));
const AlmoxarifadoHistoricoInventario = lazy(() => import("./pages/almoxarifado/HistoricoInventario")); // Rev. 2686
const FerramentasTerceiros = lazy(() => import("./pages/almoxarifado/FerramentasTerceiros"));
const AlmoxarifadoAuditoria = lazy(() => import("./pages/almoxarifado/Auditoria")); // Rev. 2450
// Equipamentos (Rev. 2258)
const EquipamentosHub = lazy(() => import("./pages/equipamentos/index"));
const EquipamentosProprios = lazy(() => import("./pages/equipamentos/Proprios"));
const EquipamentosLocados = lazy(() => import("./pages/equipamentos/Locados"));
const SolicitacaoMDO = lazy(() => import("./pages/SolicitacaoMDO"));
const Solicitacoes = lazy(() => import("./pages/compras/Solicitacoes"));
const Cotacoes = lazy(() => import("./pages/compras/Cotacoes"));
const Ordens = lazy(() => import("./pages/compras/Ordens"));
const ComprasEmergencial = lazy(() => import("./pages/compras/Emergencial"));
const ComprasAprovacoes = lazy(() => import("./pages/compras/Aprovacoes"));
const ComprasRecebimentos = lazy(() => import("./pages/compras/Recebimentos"));

const ComprasRealocacao = lazy(() => import("./pages/compras/Realocacao"));
const ComprasComissoes = lazy(() => import("./pages/compras/Comissoes"));
const ComprasConfiguracoes = lazy(() => import("./pages/compras/Configuracoes"));
const DashboardObra = lazy(() => import("./pages/compras/DashboardObra"));
const PainelFd = lazy(() => import("./pages/compras/PainelFd"));
const PortalCotacaoPage = lazy(() => import("./pages/PortalCotacao"));
const IntegraSignAssinar = lazy(() => import("./pages/IntegraSignAssinar"));
const IntegraSignDashboard = lazy(() => import("./pages/IntegraSignDashboard"));
const PortalServicoPage = lazy(() => import("./pages/PortalServico"));
const MedicoesServicoPage = lazy(() => import("./pages/compras/MedicoesServico"));
const DatabookPage = lazy(() => import("./pages/compras/Databook"));
const PortalOCEntregaPage = lazy(() => import("./pages/PortalOCEntrega"));

// Frotas
const PainelFrotas = lazy(() => import("./pages/frotas/PainelFrotas"));
const FrotasVeiculos = lazy(() => import("./pages/frotas/Veiculos"));
const FrotasManutencoes = lazy(() => import("./pages/frotas/Manutencoes"));
const FrotasCombustivel = lazy(() => import("./pages/frotas/Combustivel"));
const FrotasRastreamento = lazy(() => import("./pages/frotas/Rastreamento"));
const FrotasControleKm = lazy(() => import("./pages/frotas/ControleKm"));
const FrotasMultas = lazy(() => import("./pages/frotas/Multas"));
const FrotasIpva = lazy(() => import("./pages/frotas/Ipva"));
const FrotasLicenciamento = lazy(() => import("./pages/frotas/Licenciamento"));
const FrotasSeguros = lazy(() => import("./pages/frotas/Seguros"));
const FrotasAnalitico = lazy(() => import("./pages/frotas/FrotasAnalitico"));
const ManutencoesDashboard = lazy(() => import("./pages/frotas/ManutencoesDashboard"));
const CombustivelDashboard = lazy(() => import("./pages/frotas/CombustivelDashboard"));
const PedagiosDashboard = lazy(() => import("./pages/frotas/PedagiosDashboard"));
const PrecosCombustivel = lazy(() => import("./pages/frotas/PrecosCombustivel"));
const FrotasPedagios = lazy(() => import("./pages/frotas/Pedagios"));
const FrotasRaioX = lazy(() => import("./pages/frotas/RaioXVeiculo"));
const FrotasChecklist = lazy(() => import("./pages/frotas/ChecklistVeiculos"));

// Operacional
const PainelOperacional = lazy(() => import("./pages/operacional/PainelOperacional"));
const RDOPage = lazy(() => import("./pages/operacional/RDO"));
const ChecklistsPage = lazy(() => import("./pages/operacional/Checklists"));
const ConcratagemPage = lazy(() => import("./pages/operacional/Concretagem"));
const NaoConformidadesPage = lazy(() => import("./pages/operacional/NaoConformidades"));
const RegistroFotograficoPage = lazy(() => import("./pages/operacional/RegistroFotografico"));
const LiberacaoServicosPage = lazy(() => import("./pages/operacional/LiberacaoServicos"));
const DiarioObraPage = lazy(() => import("./pages/operacional/DiarioObra"));
const EnsaiosPage = lazy(() => import("./pages/operacional/Ensaios"));

// Integrações
const MasControle = lazy(() => import("./pages/integracoes/MasControle"));

// Sprint 6 - IA
const ComparativoConvencoes = lazy(() => import("./pages/ComparativoConvencoes"));

// Pesquisa Pública
const PesquisaPublicaPage = lazy(() => import("./pages/PesquisaPublica").then(m => ({ default: m.PesquisaPublicaPage })));
const ClimaPublicoPage = lazy(() => import("./pages/PesquisaPublica").then(m => ({ default: m.ClimaPublicoPage })));

// Portal Externo
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const PortalLoginCliente = lazy(() => import("./pages/portal/PortalLoginCliente"));
const PortalEsqueciSenha = lazy(() => import("./pages/portal/PortalEsqueciSenha"));
const PortalRedefinirSenha = lazy(() => import("./pages/portal/PortalRedefinirSenha"));
const PortalDashboardCliente = lazy(() => import("./pages/portal/PortalDashboardCliente"));
const PortalHubCliente = lazy(() => import("./pages/portal/PortalHubCliente"));
const PortalSelecionarObraCliente = lazy(() => import("./pages/portal/PortalSelecionarObraCliente"));
const PortalRhDocumentosCliente = lazy(() => import("./pages/portal/PortalRhDocumentosCliente"));
const PortalProjDocCliente = lazy(() => import("./pages/portal/PortalProjDocCliente"));
const PortalPlanejamentoCliente = lazy(() => import("./pages/portal/PortalPlanejamentoCliente"));
const ClientesPortalAdmin = lazy(() => import("./pages/ClientesPortalAdmin"));
const QuestionarioPortalAdmin = lazy(() => import("./pages/QuestionarioPortalAdmin"));
const VerificarAptidao = lazy(() => import("./pages/VerificarAptidao"));
const PortalTrocarSenha = lazy(() => import("./pages/portal/PortalTrocarSenha"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const AssinarDocumento = lazy(() => import("./pages/AssinarDocumento"));

// ============================================================
function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path={"/login"} component={Login} />
        {/* FCSign — rota PÚBLICA (sem auth) p/ signatários externos */}
        <Route path={"/assinar/:token"} component={AssinarDocumento} />
        {/* Hub de Módulos - Tela Inicial */}
        <Route path={"/"} component={ModuleHub} />
        {/* Painéis por Módulo (possuem checagem interna de permissão por widget) */}
        <Route path={"/painel"} component={Home} />
        <Route path={"/painel/rh"} component={PainelRH} />
        <Route path={"/painel/sst"} component={PainelSST} />
        <Route path={"/painel/juridico"} component={PainelJuridico} />
        <Route path={"/painel/juridico-trabalhista"} component={PainelTrabalhista} />
        <Route path={"/painel/tributario"} component={PainelTributario} />
        <Route path={"/painel/civil"} component={PainelCivil} />
        <Route path={"/empresas"} component={() => <RouteGuard component={Empresas} route="/empresas" />} />
        <Route path={"/colaboradores"} component={() => <RouteGuard component={Colaboradores} route="/colaboradores" />} />
        <Route path={"/coleta-campo"} component={() => <RouteGuard component={ColetaCampo} route="/coleta-campo" />} />
        <Route path={"/recontratacoes-pendentes"} component={() => <RouteGuard component={RecontratacoesPendentes} route="/recontratacoes-pendentes" />} />
        <Route path={"/clientes"} component={() => <RouteGuard component={Clientes} route="/empresas" />} />
        <Route path={"/gerenciadoras"} component={() => <RouteGuard component={Gerenciadoras} route="/empresas" />} />
        <Route path={"/obras"} component={() => <RouteGuard component={Obras} route="/obras" />} />
        <Route path={"/obras/efetivo"} component={() => <RouteGuard component={ObraEfetivo} route="/obras/efetivo" />} />
        <Route path={"/setores"} component={() => <RouteGuard component={Setores} route="/setores" />} />
        <Route path={"/funcoes"} component={() => <RouteGuard component={Funcoes} route="/funcoes" />} />
        <Route path={"/contas-bancarias"} component={() => <RouteGuard component={ContasBancarias} route="/contas-bancarias" />} />
        <Route path={"/relogios-ponto"} component={() => <RouteGuard component={RelogiosPonto} route="/relogios-ponto" />} />
        <Route path={"/convencoes-coletivas"} component={() => <RouteGuard component={ConvencoesColetivas} route="/convencoes-coletivas" />} />
        <Route path={"/processos-trabalhistas"} component={() => <RouteGuard component={ProcessosTrabalhistas} route="/processos-trabalhistas" />} />
        <Route path={"/processos-tributarios"} component={() => <RouteGuard component={ProcessosTributarios} route="/processos-tributarios" />} />
        <Route path={"/processos-civis"} component={() => <RouteGuard component={ProcessosCivis} route="/processos-civis" />} />
        <Route path={"/epis"} component={() => <RouteGuard component={Epis} route="/epis" />} />
        <Route path={"/oraculo"} component={() => <MasterOnlyGuard component={Oraculo} />} />
        <Route path={"/usuarios"} component={() => <MasterOnlyGuard component={Usuarios} />} />
        <Route path={"/grupos-usuarios"} component={() => <MasterOnlyGuard component={GruposUsuarios} />} />
        <Route path={"/auditoria"} component={() => <MasterOnlyGuard component={Auditoria} />} />
        <Route path={"/admin/telemetria"} component={() => <MasterOnlyGuard component={Telemetria} />} />
        <Route path={"/fechamento-ponto"} component={() => <RouteGuard component={FechamentoPonto} route="/fechamento-ponto" />} />
        <Route path={"/espelho-ponto"} component={() => <RouteGuard component={EspelhoPonto} route="/espelho-ponto" />} />
        <Route path={"/folha-pagamento"} component={() => <RouteGuard component={FolhaPagamento} route="/folha-pagamento" />} />
        <Route path={"/encargos-sociais"} component={() => <RouteGuard component={EncargosSociais} route="/folha-pagamento" />} />
        <Route path={"/gestao-competencias"} component={() => <RouteGuard component={PayrollCompetencias} route="/folha-pagamento" />} />
        <Route path={"/solicitacao-mdo"} component={() => <RouteGuard component={SolicitacaoMDO} route="/solicitacao-mdo" />} />
        <Route path={"/controle-documentos"} component={() => <RouteGuard component={ControleDocumentos} route="/controle-documentos" />} />
        <Route path={"/vale-alimentacao"} component={() => <RouteGuard component={ValeAlimentacao} route="/vale-alimentacao" />} />
        <Route path={"/configuracoes"} component={() => <MasterOnlyGuard component={Configuracoes} />} />
        <Route path={"/configuracoes/menu"} component={() => <MasterOnlyGuard component={MenuConfig} />} />
        <Route path={"/migracao"} component={() => <RouteGuard component={Migration} route="/colaboradores" />} />
        <Route path={"/lixeira"} component={() => <MasterOnlyGuard component={Lixeira} />} />
        <Route path={"/aviso-previo"} component={() => <RouteGuard component={AvisoPrevio} route="/aviso-previo" />} />
        <Route path={"/pedido-demissao"} component={() => <RouteGuard component={PedidoDemissao} route="/pedido-demissao" />} />
        <Route path={"/ferias"} component={() => <RouteGuard component={Ferias} route="/ferias" />} />
        <Route path={"/seguro-vida"} component={() => <RouteGuard component={SeguroVida} route="/seguro-vida" />} />
        <Route path={"/cipa"} component={() => <RouteGuard component={CipaCompleta} route="/cipa" />} />
        <Route path={"/programas-sst"} component={() => <RouteGuard component={ProgramasSST} route="/programas-sst" />} />
        <Route path={"/sst/integracao"} component={() => <RouteGuard component={IntegracaoSST} route="/sst/integracao" />} />
        <Route path={"/sst/dds"} component={() => <RouteGuard component={DDSGuia} route="/sst/dds" />} />
        <Route path={"/sst/dds-dashboard"} component={() => <RouteGuard component={DDSDashboard} route="/sst/dds-dashboard" />} />
        <Route path={"/sst/dashboard-atestados-acidentes"} component={() => <RouteGuard component={DashboardAtestadosAcidentes} route="/sst/dashboard-atestados-acidentes" />} />
        <Route path={"/sst/acidentes"} component={() => <RouteGuard component={RegistroAcidentes} route="/sst/acidentes" />} />
        <Route path={"/modulo-pj"} component={() => <RouteGuard component={ModuloPJ} route="/modulo-pj" />} />
        <Route path={"/contrato-pj/:id"} component={() => <RouteGuard component={ContratoPJView} route="/modulo-pj" />} />
        <Route path={"/contrato-pj/:contractId/aditivo/:aditivoId"} component={() => <RouteGuard component={AditivoPJView} route="/modulo-pj" />} />
        <Route path={"/revisoes"} component={() => <RouteGuard component={Revisoes} route="/colaboradores" />} />
        <Route path={"/solicitacao-he"} component={() => <RouteGuard component={SolicitacaoHE} route="/solicitacao-he" />} />
        <Route path={"/banco-horas"} component={() => <RouteGuard component={BancoHoras} route="/banco-horas" />} />
        <Route path="/financeiro" component={() => <RouteGuard component={FinanceiroDashboard} route="/financeiro" />} />
        <Route path="/financeiro/lancamentos" component={() => <RouteGuard component={FinanceiroLancamentos} route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/receitas" component={() => { window.location.replace("/financeiro/contas-a-receber"); return null; }} />
        <Route path="/financeiro/contas-a-pagar" component={() => <RouteGuard component={FinanceiroContasAPagar} route="/financeiro/contas-a-pagar" />} />
        <Route path="/financeiro/contas-a-receber" component={() => <RouteGuard component={FinanceiroContasAReceber} route="/financeiro/contas-a-receber" />} />
        <Route path="/financeiro/dre" component={() => <RouteGuard component={FinanceiroDRE} route="/financeiro/dre" />} />
        <Route path="/financeiro/fluxo-de-caixa" component={() => <RouteGuard component={FinanceiroFluxoCaixa} route="/financeiro/fluxo-de-caixa" />} />
        <Route path="/financeiro/obrigacoes-fiscais" component={() => <RouteGuard component={FinanceiroObrigacoesFiscais} route="/financeiro/obrigacoes-fiscais" />} />
        <Route path="/financeiro/plano-de-contas" component={() => <RouteGuard component={FinanceiroPlanoDeConta} route="/financeiro/plano-de-contas" />} />
        <Route path="/financeiro/categorias" component={() => <RouteGuard component={FinanceiroCategorias} route="/financeiro/categorias" />} />
        <Route path="/financeiro/centros-de-custo" component={() => <RouteGuard component={FinanceiroCentrosCusto} route="/financeiro/centros-de-custo" />} />
        <Route path="/financeiro/configuracoes" component={() => <RouteGuard component={FinanceiroConfiguracoes} route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/conciliacao" component={() => <RouteGuard component={FinanceiroConciliacao} route="/financeiro/conciliacao" />} />
        <Route path="/financeiro/analise-cfo" component={() => <RouteGuard component={FinanceiroAnaliseCFO} route="/financeiro/analise-cfo" />} />
        <Route path="/financeiro/cfo-suite" component={() => <RouteGuard component={FinanceiroCFOSuite} route="/financeiro/cfo-suite" />} />
        <Route path="/financeiro/recorrentes" component={() => <RouteGuard component={FinanceiroRecorrentes} route="/financeiro/recorrentes" />} />
        <Route path="/financeiro/cronograma" component={() => <RouteGuard component={FinanceiroCronograma} route="/financeiro/cronograma" />} />
        <Route path={"/apontamentos-campo"} component={() => <RouteGuard component={ApontamentosCampo} route="/apontamentos-campo" />} />
        <Route path={"/feriados"} component={() => <RouteGuard component={Feriados} route="/feriados" />} />
        <Route path={"/dissidio"} component={() => <RouteGuard component={Dissidio} route="/dissidio" />} />
        <Route path={"/convencao-ia"} component={() => <RouteGuard component={ConvencaoColetivaIA} route="/convencao-ia" />} />
        <Route path={"/pj-medicoes"} component={() => <RouteGuard component={PJMedicoes} route="/pj-medicoes" />} />
        <Route path={"/terceiros/pj/conformidade"} component={() => <RouteGuard component={ConformidadePJ} route="/terceiros/pj/conformidade" />} />
        <Route path={"/terceiros/pj/dashboard-conformidade"} component={() => <RouteGuard component={ConformidadePJDashboard} route="/terceiros/pj/dashboard-conformidade" />} />
        <Route path="/habilidades" component={() => <RouteGuard component={Habilidades} route="/habilidades" />} />
        <Route path="/habilidades/importacao" component={() => <RouteGuard component={ImportacaoHabilidades} route="/habilidades/importacao" />} />
        <Route path="/relatorios/habilidades-obra" component={() => <RouteGuard component={RelatorioHabilidadesObra} route="/habilidades" />} />
        {/* Avaliação de Desempenho */}
        <Route path={"/avaliacao-desempenho"} component={() => <RouteGuard component={AvaliacaoDesempenho} route="/avaliacao-desempenho" />} />
        {/* Biblioteca de Conhecimento */}
        <Route path={"/ajuda"} component={() => <RouteGuard component={BibliotecaConhecimento} route="/colaboradores" />} />
        {/* Relatórios */}
        <Route path={"/raio-x/:id"} component={() => <RouteGuard component={RaioXDirectPage} route="/relatorios/raio-x" />} />
        <Route path={"/relatorios/raio-x"} component={() => <RouteGuard component={RaioXPage} route="/relatorios/raio-x" />} />
        <Route path={"/relatorios/ponto"} component={() => <RouteGuard component={RelatorioPonto} route="/relatorios/ponto" />} />
        <Route path={"/relatorios/folha"} component={() => <RouteGuard component={RelatorioFolha} route="/relatorios/folha" />} />
        <Route path={"/relatorios/divergencias"} component={() => <RouteGuard component={RelatorioDivergencias} route="/relatorios/divergencias" />} />
        <Route path={"/relatorios/custo-obra"} component={() => <RouteGuard component={RelatorioCustoObra} route="/relatorios/custo-obra" />} />
        {/* Dashboards */}
        <Route path={"/dashboards"} component={() => <RouteGuard component={DashboardIndex} route="/dashboards" />} />
        <Route path={"/dashboards/funcionarios"} component={() => <RouteGuard component={DashFuncionarios} route="/dashboards/funcionarios" />} />
        <Route path={"/dashboards/cartao-ponto"} component={() => <RouteGuard component={DashCartaoPonto} route="/dashboards/cartao-ponto" />} />
        <Route path={"/dashboards/folha-pagamento"} component={() => <RouteGuard component={DashFolhaPagamento} route="/dashboards/folha-pagamento" />} />
        <Route path={"/dashboards/horas-extras"} component={() => <RouteGuard component={DashHorasExtras} route="/dashboards/horas-extras" />} />
        <Route path={"/dashboards/epis"} component={() => <RouteGuard component={DashEpis} route="/dashboards/epis" />} />
        <Route path={"/dashboards/juridico"} component={() => <RouteGuard component={DashJuridico} route="/dashboards/juridico" />} />
        <Route path={"/dashboards/juridico-geral"} component={() => <RouteGuard component={DashJuridicoGeral} route="/dashboards/juridico" />} />
        <Route path={"/dashboards/tributario"} component={() => <RouteGuard component={DashTributario} route="/dashboards/tributario" />} />
        <Route path={"/dashboards/civil"} component={() => <RouteGuard component={DashCivil} route="/dashboards/civil" />} />
        <Route path={"/dashboards/aviso-previo"} component={() => <RouteGuard component={DashAvisoPrevio} route="/dashboards/aviso-previo" />} />
        <Route path={"/dashboards/avaliacao-funcionarios"} component={() => <RouteGuard component={DashAvaliacaoFuncionarios} route="/dashboards/avaliacao-funcionarios" />} />
        <Route path={"/dashboards/ferias"} component={() => <RouteGuard component={DashFerias} route="/dashboards/ferias" />} />
        <Route path={"/dashboards/efetivo-obra"} component={() => <RouteGuard component={DashEfetivoObra} route="/dashboards/efetivo-obra" />} />
        <Route path={"/dashboards/visao-panoramica"} component={() => <RouteGuard component={VisaoPanoramica} route="/dashboards" />} />
        <Route path={"/dashboards/perfil-tempo-casa"} component={() => <RouteGuard component={DashPerfilTempoCasa} route="/dashboards/perfil-tempo-casa" />} />
        <Route path={"/dashboards/controle-documentos"} component={() => <RouteGuard component={DashControleDocumentos} route="/dashboards/controle-documentos" />} />
        <Route path={"/dashboards/competencias"} component={() => <RouteGuard component={DashCompetencias} route="/dashboards" />} />
        <Route path={"/dashboards/apontamentos"} component={() => <RouteGuard component={DashApontamentos} route="/dashboards/apontamentos" />} />
        <Route path={"/dashboards/habilidades"} component={() => <RouteGuard component={DashHabilidades} route="/dashboards/habilidades" />} />
        <Route path={"/dashboards/parceiros"} component={() => <RouteGuard component={DashParceiros} route="/dashboards/parceiros" />} />
        <Route path={"/dashboards/almoxarifado-equipamentos"} component={() => <RouteGuard component={DashAlmoxarifadoEquipamentos} route="/almoxarifado" />} />
        {/* Terceiros */}
        <Route path="/terceiros" component={() => <RouteGuard component={PainelTerceiros} route="/terceiros/painel" />} />
        <Route path="/terceiros/empresas" component={() => <RouteGuard component={EmpresasTerceiras} route="/terceiros/empresas" />} />
        <Route path="/terceiros/empresas/:id" component={() => <RouteGuard component={TerceiroRaioX} route="/terceiros/empresas" />} />
        <Route path="/terceiros/funcionarios" component={() => <RouteGuard component={FuncionariosTerceiros} route="/terceiros/funcionarios" />} />
        <Route path="/terceiros/obrigacoes-mensais" component={() => <RouteGuard component={ObrigacoesMensais} route="/terceiros/obrigacoes" />} />
        <Route path="/terceiros/obrigacoes" component={() => <RouteGuard component={ObrigacoesMensais} route="/terceiros/obrigacoes" />} />
        <Route path="/terceiros/conformidade" component={() => <RouteGuard component={PainelConformidade} route="/terceiros/conformidade" />} />
        <Route path="/terceiros/alertas" component={() => <RouteGuard component={AlertasCobrancas} route="/terceiros/alertas" />} />
        <Route path="/terceiros/aprovacao" component={() => <RouteGuard component={AprovacaoPortal} route="/terceiros/aprovacao" />} />
        <Route path="/terceiros/portal" component={() => <RouteGuard component={PortalTerceiro} route="/terceiros/portal" />} />
        <Route path="/terceiros/crachas" component={() => <RouteGuard component={Crachas} route="/terceiros/crachas" />} />
        <Route path="/crachas" component={() => <RouteGuard component={Crachas} route="/crachas" />} />
        <Route path="/terceiros/validacao-ia" component={() => <RouteGuard component={ValidacaoIA} route="/terceiros/validacao-ia" />} />
        <Route path="/terceiros/contratos" component={() => <RouteGuard component={ContratosList} route="/terceiros/painel" />} />
        <Route path="/terceiros/contratos/template" component={() => <RouteGuard component={ContratoTemplate} route="/terceiros/painel" />} />
        <Route path="/terceiros/contratos/novo" component={() => <RouteGuard component={ContratoNovo} route="/terceiros/painel" />} />
        <Route path="/terceiros/contratos/:id" component={() => <RouteGuard component={ContratoDetalhe} route="/terceiros/painel" />} />
        <Route path="/terceiros/medicoes" component={() => <RouteGuard component={MedicoesTerceiros} route="/terceiros/painel" />} />
        <Route path="/terceiros/previsao-caixa" component={() => <RouteGuard component={PrevisaoCaixaTerceiros} route="/terceiros/painel" />} />
        <Route path="/terceiros/advertencias" component={() => <RouteGuard component={AdvertenciasTerceiros} route="/terceiros/advertencias" />} />
        <Route path="/terceiros/painel" component={() => <RouteGuard component={PainelTerceiros} route="/terceiros/painel" />} />
        {/* Parceiros */}
        <Route path="/parceiros" component={() => <RouteGuard component={PainelParceiros} route="/parceiros/cadastro" />} />
        <Route path="/parceiros/cadastro" component={() => <RouteGuard component={CadastroParceiros} route="/parceiros/cadastro" />} />
        <Route path="/parceiros/lancamentos" component={() => <RouteGuard component={LancamentosParceiros} route="/parceiros/lancamentos" />} />
        <Route path="/parceiros/guia-descontos" component={() => <RouteGuard component={GuiaDescontos} route="/parceiros/guia-descontos" />} />
        <Route path="/parceiros/pagamentos" component={() => <RouteGuard component={PagamentosParceiros} route="/parceiros/pagamentos" />} />
        <Route path="/parceiros/aprovacoes" component={() => <RouteGuard component={AprovacoesParceiros} route="/parceiros/aprovacoes" />} />
        <Route path="/parceiros/portal" component={() => <RouteGuard component={PortalParceiro} route="/parceiros/portal" />} />
        <Route path="/parceiros/painel" component={() => <RouteGuard component={PainelParceiros} route="/parceiros/painel" />} />
        {/* Orçamento */}
        <Route path="/orcamento/painel"           component={() => <RouteGuard component={PainelOrcamento} route="/orcamento/painel" />} />
        <Route path="/orcamento/lista"            component={() => <RouteGuard component={OrcamentoLista} route="/orcamento/lista" />} />
        <Route path="/orcamento/importar"          component={() => <RouteGuard component={OrcamentoImportar} route="/orcamento/importar" />} />
        <Route path="/orcamento/biblioteca"       component={() => <RouteGuard component={BibliotecaOrcamento} route="/orcamento/lista" />} />
        <Route path="/orcamento/composicoes"      component={() => <RouteGuard component={BibliotecaOrcamento} route="/orcamento/lista" />} />
        <Route path="/orcamento/insumos"          component={() => <RouteGuard component={BibliotecaOrcamento} route="/orcamento/lista" />} />
        <Route path="/orcamento/encargos"         component={() => <RouteGuard component={BibliotecaOrcamento} route="/orcamento/lista" />} />
        <Route path="/orcamento/:id/print"        component={() => <RouteGuard component={OrcamentoPrint} route="/orcamento/lista" />} />
        <Route path="/orcamento/:id/dash"         component={() => <RouteGuard component={OrcamentoDashPage} route="/orcamento/lista" />} />
        <Route path="/orcamento/dash"             component={() => <RouteGuard component={OrcamentoDashPage} route="/orcamento/lista" />} />
        <Route path="/orcamento/:id"              component={() => <RouteGuard component={OrcamentoDetalhe} route="/orcamento/lista" />} />
        {/* Planejamento */}
        <Route path="/planejamento"              component={() => <RouteGuard component={PlanejamentoLista} route="/planejamento" />} />
        <Route path="/planejamento/:id"          component={() => <RouteGuard component={PlanejamentoDetalhe} route="/planejamento" />} />
        {/* Gestão de Documentos */}
        <Route path="/gestao-documentos"           component={() => <RouteGuard component={GestaoDocumentos} route="/gestao-documentos" />} />
        <Route path="/medicao"                   component={() => <RouteGuard component={MedicaoContratos} route="/medicao" />} />
        <Route path="/medicao/:id"               component={() => <RouteGuard component={MedicaoDetalhe} route="/medicao" />} />
        <Route path="/medicao/:contratoId/levantamento/:campoId" component={() => <RouteGuard component={MedicaoLevantamento} route="/medicao" />} />
        {/* Compras */}
        <Route path="/almoxarifado/categorias"     component={() => <RouteGuard component={AlmoxarifadoCategorias} route="/almoxarifado" />} />
        <Route path="/almoxarifado/movimentacoes" component={() => <RouteGuard component={AlmoxarifadoMovimentacoes} route="/almoxarifado/movimentacoes" />} />
        <Route path="/almoxarifado/inventario"    component={() => <RouteGuard component={AlmoxarifadoInventario} route="/almoxarifado/inventario" />} />
        <Route path="/almoxarifado/inventario-visual" component={() => <RouteGuard component={AlmoxarifadoInventarioVisual} route="/almoxarifado" />} />
        <Route path="/almoxarifado/historico-inventario" component={() => <RouteGuard component={AlmoxarifadoHistoricoInventario} route="/almoxarifado/historico-inventario" />} />
        <Route path="/almoxarifado/ferramentas-terceiros" component={() => <RouteGuard component={FerramentasTerceiros} route="/almoxarifado/ferramentas-terceiros" />} />
        <Route path="/almoxarifado/auditoria"     component={() => <RouteGuard component={AlmoxarifadoAuditoria} route="/almoxarifado" />} />
        <Route path="/almoxarifado"              component={() => <RouteGuard component={AlmoxarifadoPage} route="/almoxarifado" />} />
        {/* Equipamentos (Rev. 2258) */}
        <Route path="/equipamentos"                  component={() => <RouteGuard component={EquipamentosHub} route="/almoxarifado" />} />
        <Route path="/equipamentos/proprios"         component={() => <RouteGuard component={EquipamentosProprios} route="/almoxarifado" />} />
        <Route path="/equipamentos/locados"          component={() => <RouteGuard component={EquipamentosLocados} route="/almoxarifado" />} />
        <Route path="/compras/painel"            component={() => <RouteGuard component={PainelCompras} route="/compras/painel" />} />
        <Route path="/compras/fornecedores"      component={() => <RouteGuard component={Fornecedores} route="/compras/fornecedores" />} />
        <Route path="/compras/almoxarifado"      component={() => <RouteGuard component={Almoxarifado} route="/compras/painel" />} />
        <Route path="/compras/solicitacoes"      component={() => <RouteGuard component={Solicitacoes} route="/compras/solicitacoes" />} />
        <Route path="/compras/cotacoes"          component={() => <RouteGuard component={Cotacoes} route="/compras/cotacoes" />} />
        <Route path="/compras/ordens"            component={() => <RouteGuard component={Ordens} route="/compras/ordens" />} />
        <Route path="/compras/ordens-compra"     component={() => <RouteGuard component={Ordens} route="/compras/ordens" />} />
        <Route path="/compras/emergencial"       component={() => <RouteGuard component={ComprasEmergencial} route="/compras/emergencial" />} />
        <Route path="/compras/aprovacoes"        component={() => <RouteGuard component={ComprasAprovacoes} route="/compras/aprovacoes" />} />
        <Route path="/compras/recebimentos"      component={() => <RouteGuard component={ComprasRecebimentos} route="/compras/recebimentos" />} />
        <Route path="/compras/realocacao"        component={() => <RouteGuard component={ComprasRealocacao} route="/compras/realocacao" />} />
        <Route path="/compras/comissoes"         component={() => <RouteGuard component={ComprasComissoes} route="/compras/comissoes" />} />
        <Route path="/compras/configuracoes"     component={() => <RouteGuard component={ComprasConfiguracoes} route="/compras/configuracoes" />} />
        <Route path="/compras/dashboard-obra"    component={() => <RouteGuard component={DashboardObra} route="/compras/painel" />} />
        <Route path="/compras/painel-fd"         component={() => <RouteGuard component={PainelFd} route="/compras/painel" />} />
        <Route path="/integrasign" component={() => <RouteGuard component={IntegraSignDashboard} route={["/compras/painel", "/terceiros/painel", "/terceiros/advertencias", "/terceiros/contratos"]} />} />
        <Route path="/integrasign/assinar/:token" component={IntegraSignAssinar} />
        <Route path="/integracao/:token" component={IntegracaoPublica} />
        <Route path="/portal/cotacao/:token"     component={PortalCotacaoPage} />
        <Route path="/portal/servico/:token"    component={PortalServicoPage} />
        <Route path="/compras/medicoes-servico" component={() => <RouteGuard component={MedicoesServicoPage} route="/compras/painel" />} />
        <Route path="/compras/databook"          component={() => <RouteGuard component={DatabookPage} route="/compras/painel" />} />
        <Route path="/portal/oc-entrega/:token"  component={PortalOCEntregaPage} />
        {/* Frotas */}
        <Route path="/frotas/painel" component={() => <RouteGuard component={PainelFrotas} route="/frotas/painel" />} />
        <Route path="/frotas/veiculos" component={() => <RouteGuard component={FrotasVeiculos} route="/frotas/veiculos" />} />
        <Route path="/frotas/manutencoes" component={() => <RouteGuard component={FrotasManutencoes} route="/frotas/manutencoes" />} />
        <Route path="/frotas/combustivel" component={() => <RouteGuard component={FrotasCombustivel} route="/frotas/combustivel" />} />
        <Route path="/frotas/rastreamento" component={() => <RouteGuard component={FrotasRastreamento} route="/frotas/rastreamento" />} />
        <Route path="/frotas/controle-km" component={() => <RouteGuard component={FrotasControleKm} route="/frotas/painel" />} />
        <Route path="/frotas/multas" component={() => <RouteGuard component={FrotasMultas} route="/frotas/multas" />} />
        <Route path="/frotas/ipva" component={() => <RouteGuard component={FrotasIpva} route="/frotas/ipva" />} />
        <Route path="/frotas/licenciamento" component={() => <RouteGuard component={FrotasLicenciamento} route="/frotas/licenciamento" />} />
        <Route path="/frotas/seguros" component={() => <RouteGuard component={FrotasSeguros} route="/frotas/seguros" />} />
        <Route path="/frotas/pedagios" component={() => <RouteGuard component={FrotasPedagios} route="/frotas/painel" />} />
        <Route path="/frotas/analitico" component={() => <RouteGuard component={FrotasAnalitico} route="/frotas/analitico" />} />
        <Route path="/frotas/manutencoes-dashboard" component={() => <RouteGuard component={ManutencoesDashboard} route="/frotas/manutencoes" />} />
        <Route path="/frotas/combustivel-dashboard" component={() => <RouteGuard component={CombustivelDashboard} route="/frotas/combustivel" />} />
        <Route path="/frotas/pedagios-dashboard" component={() => <RouteGuard component={PedagiosDashboard} route="/frotas/pedagios" />} />
        <Route path="/frotas/precos-combustivel" component={() => <RouteGuard component={PrecosCombustivel} route="/frotas/combustivel" />} />
        <Route path="/frotas/raio-x" component={() => <RouteGuard component={FrotasRaioX} route="/frotas/painel" />} />
        <Route path="/frotas/checklist" component={() => <RouteGuard component={FrotasChecklist} route="/frotas/painel" />} />
        {/* Operacional */}
        <Route path="/operacional/painel" component={() => <RouteGuard component={PainelOperacional} route="/operacional/painel" />} />
        <Route path="/operacional/rdo" component={() => <RouteGuard component={RDOPage} route="/operacional/rdo" />} />
        <Route path="/operacional/checklists" component={() => <RouteGuard component={ChecklistsPage} route="/operacional/checklists" />} />
        <Route path="/operacional/concretagem" component={() => <RouteGuard component={ConcratagemPage} route="/operacional/concretagem" />} />
        <Route path="/operacional/nc" component={() => <RouteGuard component={NaoConformidadesPage} route="/operacional/nc" />} />
        <Route path="/operacional/fotos" component={() => <RouteGuard component={RegistroFotograficoPage} route="/operacional/fotos" />} />
        <Route path="/operacional/liberacao-servicos" component={() => <RouteGuard component={LiberacaoServicosPage} route="/operacional/painel" />} />
        <Route path="/operacional/diario-obra" component={() => <RouteGuard component={DiarioObraPage} route="/operacional/painel" />} />
        <Route path="/operacional/ensaios" component={() => <RouteGuard component={EnsaiosPage} route="/operacional/painel" />} />
        {/* Integrações */}
        <Route path="/integracoes/mas-controle"  component={() => <RouteGuard component={MasControle} route="/colaboradores" />} />
        {/* Sprint 6 - IA */}
        <Route path="/comparativo-convencoes" component={() => <RouteGuard component={ComparativoConvencoes} route="/comparativo-convencoes" />} />
        <Route path="/pesquisa-publica/pesquisa/:token" component={PesquisaPublicaPage} />
        {/* Coleta de Campo (RH) — link externo por obra, sem login */}
        <Route path="/portal/coleta-rh/:token" component={ColetaCampoPublica} />
        {/* Avaliação (NPS) — link público enviado ao cliente, sem login */}
        <Route path="/portal/avaliacao/:token" component={AvaliacaoPublica} />
        {/* Portal Externo (Terceiros/Parceiros) */}
        <Route path="/portal/login" component={PortalLogin} />
        <Route path="/portal/cliente/login" component={PortalLoginCliente} />
        <Route path="/portal/cliente" component={PortalLoginCliente} />
        <Route path="/portal/esqueci-senha" component={PortalEsqueciSenha} />
        <Route path="/portal/redefinir-senha/:token" component={PortalRedefinirSenha} />
        <Route path="/portal/trocar-senha" component={PortalTrocarSenha} />
        <Route path="/portal/dashboard" component={PortalDashboard} />
        <Route path="/portal/cliente/dashboard" component={PortalDashboardCliente} />
        <Route path="/portal/cliente/hub" component={PortalHubCliente} />
        <Route path="/portal/cliente/modulo/:moduloId" component={PortalSelecionarObraCliente} />
        <Route path="/portal/cliente/obra/:obraId" component={PortalPlanejamentoCliente} />
        <Route path="/portal/cliente/rh/:obraId" component={PortalRhDocumentosCliente} />
        <Route path="/portal/cliente/projdoc/:obraId" component={PortalProjDocCliente} />
        <Route path="/clientes/portal" component={ClientesPortalAdmin} />
        <Route path="/clientes/portal/questionario" component={QuestionarioPortalAdmin} />
        <Route path="/pesquisa-publica/clima/:token" component={ClimaPublicoPage} />
        {/* Verificação Pública de Aptidão (QR Code) */}
        <Route path="/verificar/clt/:id" component={VerificarAptidao} />
        <Route path="/verificar/pj/:id" component={VerificarAptidao} />
        <Route path="/verificar/terceiro/:id" component={VerificarAptidao} />
        {/* Importação de Dados */}
        <Route path="/import-data" component={() => <RouteGuard component={ImportData} route="/colaboradores" />} />
        <Route path="/comunicados-internos" component={() => <RouteGuard component={ComunicadosInternos} route="/comunicados-internos" />} />
        <Route path="/curriculos" component={() => <RouteGuard component={Curriculos} route="/curriculos" />} />
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
