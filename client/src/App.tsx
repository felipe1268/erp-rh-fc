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

// Rev. 4041 — "/usuarios" agora também é acessível por admin e pelo novo perfil
// "Adm Cliente" (admin restrito às suas empresas vinculadas); apenas o backend
// (userManagement router) restringe o escopo do que cada perfil pode fazer lá dentro.
function UsuariosGuard({ component: Component }: { component: ComponentType }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const allowedRoles = ["admin_master", "admin", "adm_cliente"];
  useEffect(() => {
    if (loading) return;
    if (!user) { setLocation("/login"); return; }
    if (!allowedRoles.includes(user.role)) { setLocation("/"); }
  }, [user, loading, setLocation]);

  if (loading) return <PageLoader />;
  if (!user || !allowedRoles.includes(user.role)) return <PageLoader />;
  return <Component />;
}

// Rev. 4044 — "/minha-assinatura" (self-service lifecycle) é exclusivo do
// `adm_cliente` (dono da assinatura da empresa-cliente); admin/admin_master
// internos não têm assinatura própria.
function AdmClienteGuard({ component: Component }: { component: ComponentType }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (loading) return;
    if (!user) { setLocation("/login"); return; }
    if (user.role !== 'adm_cliente') { setLocation("/"); }
  }, [user, loading, setLocation]);

  if (loading) return <PageLoader />;
  if (!user || user.role !== 'adm_cliente') return <PageLoader />;
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

// Wrapper resiliente p/ lazy-load: trata "Importing a module script failed" /
// "Failed to fetch dynamically imported module" (chunk antigo sumiu após um
// novo deploy, ou rede instável no iPad). Estratégia:
//   1) retry transitório do mesmo import (rede instável) 1x;
//   2) se persistir, recarrega a página UMA vez (sessionStorage guard) p/ buscar
//      um index.html fresco com os novos hashes — durante o reload devolve uma
//      promise pendente, então o usuário vê o PageLoader (e NÃO a tela de erro).
// Só na exaustão deixa o erro subir p/ o ErrorBoundary.
function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    const isChunkErr = (err: any) => {
      const msg = String(err?.message || err || "");
      return (
        msg.includes("Failed to fetch dynamically imported module") ||
        msg.includes("Importing a module script failed") ||
        msg.includes("error loading dynamically imported module") ||
        msg.includes("Loading chunk") ||
        msg.includes("is not a valid JavaScript MIME type") ||
        msg.includes("text/html") ||
        msg === "Load failed" ||
        msg.toLowerCase().includes("load failed") ||
        err?.name === "ChunkLoadError"
      );
    };
    try {
      return await factory();
    } catch (err) {
      if (!isChunkErr(err)) throw err;
      // 1) retry transitório
      try {
        await new Promise((r) => setTimeout(r, 600));
        return await factory();
      } catch (err2) {
        if (!isChunkErr(err2)) throw err2;
      }
      // 2) chunk realmente sumiu (deploy novo): recarrega 1x
      try {
        const KEY = "__erp_chunk_reload";
        const now = Date.now();
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (!last || now - last > 10000) {
          sessionStorage.setItem(KEY, String(now));
          const rcb = (window as any).__reloadCacheBusting;
          if (typeof rcb === "function") rcb(now); else window.location.reload();
          // trava o render até a página recarregar (mostra o PageLoader)
          return await new Promise<{ default: T }>(() => {});
        }
      } catch { /* iOS modo privado: ignora e deixa o erro subir */ }
      throw err;
    }
  });
}

// Todas as outras páginas são lazy-loaded
const Home = lazyWithRetry(() => import("./pages/Home"));
const Oraculo = lazyWithRetry(() => import("./pages/Oraculo"));
const Empresas = lazyWithRetry(() => import("./pages/Empresas"));
const Colaboradores = lazyWithRetry(() => import("./pages/Colaboradores"));
const ColetaCampo = lazyWithRetry(() => import("./pages/ColetaCampo"));
const ColetaCampoPublica = lazyWithRetry(() => import("./pages/portal/ColetaCampoPublica"));
const AvaliacaoPublica = lazyWithRetry(() => import("./pages/portal/AvaliacaoPublica"));
const AvaliacaoPublicaCurta = lazyWithRetry(() => import("./pages/portal/AvaliacaoPublicaCurta"));
const RecontratacoesPendentes = lazyWithRetry(() => import("./pages/RecontratacoesPendentes"));
const Usuarios = lazyWithRetry(() => import("./pages/Usuarios"));
const GruposUsuarios = lazyWithRetry(() => import("./pages/GruposUsuarios"));
const Auditoria = lazyWithRetry(() => import("./pages/Auditoria"));
const Configuracoes = lazyWithRetry(() => import("./pages/Configuracoes"));
const MenuConfig = lazyWithRetry(() => import("./pages/MenuConfig"));
const Migration = lazyWithRetry(() => import("./pages/Migration"));
const Obras = lazyWithRetry(() => import("./pages/Obras"));
const Clientes = lazyWithRetry(() => import("./pages/Clientes"));
const Gerenciadoras = lazyWithRetry(() => import("./pages/Gerenciadoras"));
const ObraEfetivo = lazyWithRetry(() => import("./pages/ObraEfetivo"));
const FechamentoPonto = lazyWithRetry(() => import("./pages/FechamentoPonto"));
const EspelhoPonto = lazyWithRetry(() => import("./pages/EspelhoPonto"));
const FolhaPagamento = lazyWithRetry(() => import("./pages/FolhaPagamento"));
const EncargosSociais = lazyWithRetry(() => import("./pages/EncargosSociais"));
const PayrollCompetencias = lazyWithRetry(() => import("./pages/PayrollCompetencias"));
const ControleDocumentos = lazyWithRetry(() => import("./pages/ControleDocumentos"));
const ValeAlimentacao = lazyWithRetry(() => import("./pages/ValeAlimentacao"));
const Setores = lazyWithRetry(() => import("./pages/Setores"));
const Funcoes = lazyWithRetry(() => import("./pages/Funcoes"));
const ContasBancarias = lazyWithRetry(() => import("./pages/ContasBancarias"));
const RelogiosPonto = lazyWithRetry(() => import("./pages/RelogiosPonto"));
const ConvencoesColetivas = lazyWithRetry(() => import("./pages/ConvencoesColetivas"));
const ProcessosTrabalhistas = lazyWithRetry(() => import("./pages/ProcessosTrabalhistas"));
const Epis = lazyWithRetry(() => import("./pages/Epis"));
const Lixeira = lazyWithRetry(() => import("./pages/Lixeira"));
const AvisoPrevio = lazyWithRetry(() => import("./pages/AvisoPrevio"));
const PedidoDemissao = lazyWithRetry(() => import("./pages/PedidoDemissao"));
const Ferias = lazyWithRetry(() => import("./pages/Ferias"));
const SeguroVida = lazyWithRetry(() => import("./pages/SeguroVida"));
const CipaCompleta = lazyWithRetry(() => import("./pages/CipaCompleta"));
const CipaVotacao = lazyWithRetry(() => import("./pages/CipaVotacao"));
const ModuloPJ = lazyWithRetry(() => import("./pages/ModuloPJ"));
const ContratoPJView = lazyWithRetry(() => import("./pages/ContratoPJView"));
const AditivoPJView = lazyWithRetry(() => import("./pages/AditivoPJView"));
const Revisoes = lazyWithRetry(() => import("./pages/Revisoes"));
const SolicitacaoHE = lazyWithRetry(() => import("./pages/SolicitacaoHE"));
const BancoHoras = lazyWithRetry(() => import("./pages/BancoHoras"));
const FinanceiroDashboard     = lazyWithRetry(() => import("./pages/financeiro/FinanceiroDashboard"));
const FinanceiroLancamentos   = lazyWithRetry(() => import("./pages/financeiro/FinanceiroLancamentos"));
const FinanceiroReceitas      = lazyWithRetry(() => import("./pages/financeiro/FinanceiroReceitas"));
const FinanceiroContasAPagar  = lazyWithRetry(() => import("./pages/financeiro/FinanceiroContasAPagar"));
const FinanceiroContasAReceber= lazyWithRetry(() => import("./pages/financeiro/FinanceiroContasAReceber"));
const FinanceiroContasAReceberTitulos = lazyWithRetry(() => import("./pages/financeiro/FinanceiroContasAReceberTitulos"));
const FinanceiroDRE           = lazyWithRetry(() => import("./pages/financeiro/FinanceiroDRE"));
const FinanceiroDFC           = lazyWithRetry(() => import("./pages/financeiro/FinanceiroDFC"));
const FinanceiroDREAnalise    = lazyWithRetry(() => import("./pages/financeiro/FinanceiroDREAnalise"));
const FinanceiroFluxoCaixa    = lazyWithRetry(() => import("./pages/financeiro/FinanceiroFluxoCaixa"));
const FinanceiroObrigacoesFiscais = lazyWithRetry(() => import("./pages/financeiro/FinanceiroObrigacoesFiscais"));
const FinanceiroPlanoDeConta  = lazyWithRetry(() => import("./pages/financeiro/FinanceiroPlanoDeConta"));
const FinanceiroCategorias    = lazyWithRetry(() => import("./pages/financeiro/FinanceiroCategorias"));
const FinanceiroCentrosCusto  = lazyWithRetry(() => import("./pages/financeiro/FinanceiroCentrosCusto"));
const FinanceiroConfiguracoes = lazyWithRetry(() => import("./pages/financeiro/FinanceiroConfiguracoes"));
const FinanceiroConciliacao   = lazyWithRetry(() => import("./pages/financeiro/FinanceiroConciliacao"));
const FinanceiroCheques          = lazyWithRetry(() => import("./pages/financeiro/FinanceiroCheques"));
const FinanceiroChequesRecebidos = lazyWithRetry(() => import("./pages/financeiro/FinanceiroChequesRecebidos"));
const FinanceiroCartaoCredito    = lazyWithRetry(() => import("./pages/financeiro/FinanceiroCartaoCredito"));
const FinanceiroConciliacaoWorkspace = lazyWithRetry(() => import("./pages/financeiro/FinanceiroConciliacaoWorkspace"));
const FinanceiroNotasFiscais  = lazyWithRetry(() => import("./pages/financeiro/FinanceiroNotasFiscais"));
const FinanceiroRecorrentes  = lazyWithRetry(() => import("./pages/financeiro/FinanceiroRecorrentes"));
const FinanceiroCronograma   = lazyWithRetry(() => import("./pages/financeiro/FinanceiroCronograma"));
const FinanceiroAnaliseCFO    = lazyWithRetry(() => import("./pages/financeiro/FinanceiroAnaliseCFO"));
const FinanceiroAnaliseCustos = lazyWithRetry(() => import("./pages/financeiro/FinanceiroAnaliseCustos"));
const FinanceiroAnaliseCustosDetalhe = lazyWithRetry(() => import("./pages/financeiro/FinanceiroAnaliseCustosDetalhe"));
const FinanceiroCFOSuite      = lazyWithRetry(() => import("./pages/financeiro/FinanceiroCFOSuite"));
const FinanceiroContabilidade = lazyWithRetry(() => import("./pages/financeiro/FinanceiroContabilidade"));
const EfdIcmsIpi        = lazyWithRetry(() => import("./pages/fiscal/EfdIcmsIpi"));
const EfdContribuicoes  = lazyWithRetry(() => import("./pages/fiscal/EfdContribuicoes"));
const SpedEcf           = lazyWithRetry(() => import("./pages/fiscal/SpedEcf"));
const SpedEcd           = lazyWithRetry(() => import("./pages/fiscal/SpedEcd"));
const DashReceber             = lazyWithRetry(() => import("./pages/financeiro/dashboards/DashReceber"));
const DashPagar               = lazyWithRetry(() => import("./pages/financeiro/dashboards/DashPagar"));
const DashConciliacao         = lazyWithRetry(() => import("./pages/financeiro/dashboards/DashConciliacao"));
const DashCheques             = lazyWithRetry(() => import("./pages/financeiro/dashboards/DashCheques"));
const DashCartao              = lazyWithRetry(() => import("./pages/financeiro/dashboards/DashCartao"));
const DashNotasFiscais        = lazyWithRetry(() => import("./pages/financeiro/dashboards/DashNotasFiscais"));
const ApontamentosCampo = lazyWithRetry(() => import("./pages/ApontamentosCampo"));
const Feriados = lazyWithRetry(() => import("./pages/Feriados"));
const ComunicadosInternos = lazyWithRetry(() => import("./pages/ComunicadosInternos"));
const Curriculos = lazyWithRetry(() => import("./pages/Curriculos"));
const Dissidio = lazyWithRetry(() => import("./pages/Dissidio"));
const ConvencaoColetivaIA = lazyWithRetry(() => import("./pages/ConvencaoColetivaIA"));
const PJMedicoes = lazyWithRetry(() => import("./pages/PJMedicoes"));
const ConformidadePJ = lazyWithRetry(() => import("./pages/ConformidadePJ"));
const ConformidadePJDashboard = lazyWithRetry(() => import("./pages/ConformidadePJDashboard"));
const PainelRH = lazyWithRetry(() => import("./pages/PainelRH"));
const PainelSST = lazyWithRetry(() => import("./pages/PainelSST"));
const ProgramasSST = lazyWithRetry(() => import("./pages/ProgramasSST"));
const IntegracaoSST = lazyWithRetry(() => import("./pages/sst/IntegracaoSST"));
const DDSGuia = lazyWithRetry(() => import("./pages/sst/DDSGuia"));
const PermissaoTrabalho = lazyWithRetry(() => import("./pages/sst/PermissaoTrabalho"));
const AprAnalise        = lazyWithRetry(() => import("./pages/sst/AprAnalise"));
const DDSDashboard = lazyWithRetry(() => import("./pages/sst/DDSDashboard"));
const DashboardAtestadosAcidentes = lazyWithRetry(() => import("./pages/sst/DashboardAtestadosAcidentes"));
const DashboardAprAnalise = lazyWithRetry(() => import("./pages/sst/DashboardAprAnalise"));
const DashboardPermissaoTrabalho = lazyWithRetry(() => import("./pages/sst/DashboardPermissaoTrabalho"));
const RegistroAcidentes = lazyWithRetry(() => import("./pages/sst/RegistroAcidentes"));
const IntegracaoPublica = lazyWithRetry(() => import("./pages/sst/IntegracaoPublica"));
const GestorSSTPorObra = lazyWithRetry(() => import("./pages/sst/GestorSSTPorObra"));
const PainelJuridico = lazyWithRetry(() => import("./pages/PainelJuridico"));
const PainelTrabalhista = lazyWithRetry(() => import("./pages/PainelTrabalhista"));
const PainelTributario = lazyWithRetry(() => import("./pages/PainelTributario"));
const PainelCivil = lazyWithRetry(() => import("./pages/PainelCivil"));
const ProcessosTributarios = lazyWithRetry(() => import("./pages/ProcessosTributarios"));
const ProcessosCivis = lazyWithRetry(() => import("./pages/ProcessosCivis"));
const BibliotecaConhecimento = lazyWithRetry(() => import("./pages/BibliotecaConhecimento"));
const AvaliacaoDesempenho = lazyWithRetry(() => import("./pages/AvaliacaoDesempenho"));
const Telemetria = lazyWithRetry(() => import("./pages/Telemetria"));
const SaasAdminPanel = lazyWithRetry(() => import("./pages/SaasAdminPanel"));
const AdminPrecos = lazyWithRetry(() => import("./pages/AdminPrecos"));
const MinhaAssinatura = lazyWithRetry(() => import("./pages/MinhaAssinatura"));
const ImportData = lazyWithRetry(() => import("./pages/ImportData"));

// Relatórios
const RaioXPage = lazyWithRetry(() => import("./pages/relatorios/RaioXPage"));
const RaioXDirectPage = lazyWithRetry(() => import("./pages/relatorios/RaioXDirectPage"));
const RelatorioPonto = lazyWithRetry(() => import("./pages/relatorios/RelatorioPonto"));
const RelatorioFolha = lazyWithRetry(() => import("./pages/relatorios/RelatorioFolha"));
const RelatorioDivergencias = lazyWithRetry(() => import("./pages/relatorios/RelatorioDivergencias"));
const RelatorioCustoObra = lazyWithRetry(() => import("./pages/relatorios/RelatorioCustoObra"));

// Dashboards
const DashboardIndex = lazyWithRetry(() => import("./pages/dashboards/DashboardIndex"));
const DashFuncionarios = lazyWithRetry(() => import("./pages/dashboards/DashFuncionarios"));
const DashCartaoPonto = lazyWithRetry(() => import("./pages/dashboards/DashCartaoPonto"));
const DashFolhaPagamento = lazyWithRetry(() => import("./pages/dashboards/DashFolhaPagamento"));
const DashHorasExtras = lazyWithRetry(() => import("./pages/dashboards/DashHorasExtras"));
const DashEpis = lazyWithRetry(() => import("./pages/dashboards/DashEpis"));
const DashJuridico = lazyWithRetry(() => import("./pages/dashboards/DashJuridico"));
const DashJuridicoGeral = lazyWithRetry(() => import("./pages/dashboards/DashJuridicoGeral"));
const DashTributario = lazyWithRetry(() => import("./pages/dashboards/DashTributario"));
const DashCivil = lazyWithRetry(() => import("./pages/dashboards/DashCivil"));
const DashAvisoPrevio = lazyWithRetry(() => import("./pages/dashboards/DashAvisoPrevio"));
const DashAvaliacaoFuncionarios = lazyWithRetry(() => import("./pages/dashboards/DashAvaliacaoFuncionarios"));
const DashFerias = lazyWithRetry(() => import("./pages/dashboards/DashFerias"));
const VisaoPanoramica = lazyWithRetry(() => import("./pages/dashboards/VisaoPanoramica"));
const DashEfetivoObra = lazyWithRetry(() => import("./pages/dashboards/DashEfetivoObra"));
const Habilidades = lazyWithRetry(() => import("./pages/Habilidades"));
const DashPerfilTempoCasa = lazyWithRetry(() => import("./pages/dashboards/DashPerfilTempoCasa"));
const DashControleDocumentos = lazyWithRetry(() => import("./pages/dashboards/DashControleDocumentos"));
const DashCompetencias = lazyWithRetry(() => import("./pages/dashboards/DashCompetencias"));
const DashApontamentos = lazyWithRetry(() => import("./pages/dashboards/DashApontamentos"));
const DashHabilidades = lazyWithRetry(() => import("./pages/dashboards/DashHabilidades"));
const DashParceiros = lazyWithRetry(() => import("./pages/dashboards/DashParceiros"));
// Rev. 4039 — Dashboard Almoxarifado & Equipamentos dividido em 6 páginas
// próprias (antes 1 arquivo único de 1851 linhas com abas por querystring).
const DashAlmoxVisaoGeral = lazyWithRetry(() => import("./pages/dashboards/almoxarifado/VisaoGeral"));
const DashAlmoxEstoque = lazyWithRetry(() => import("./pages/dashboards/almoxarifado/Estoque"));
const DashAlmoxMovimentacoes = lazyWithRetry(() => import("./pages/dashboards/almoxarifado/Movimentacoes"));
const DashAlmoxFerramentasTerceiros = lazyWithRetry(() => import("./pages/dashboards/almoxarifado/FerramentasTerceiros"));
const DashAlmoxEquipProprios = lazyWithRetry(() => import("./pages/dashboards/almoxarifado/EquipProprios"));
const DashAlmoxEquipLocados = lazyWithRetry(() => import("./pages/dashboards/almoxarifado/EquipLocados"));
const RelatorioHabilidadesObra = lazyWithRetry(() => import("./pages/RelatorioHabilidadesObra"));
const ImportacaoHabilidades = lazyWithRetry(() => import("./pages/ImportacaoHabilidades"));

// Terceiros
const PainelTerceiros = lazyWithRetry(() => import("./pages/terceiros/PainelTerceiros"));
const EmpresasTerceiras = lazyWithRetry(() => import("./pages/terceiros/EmpresasTerceiras"));
const TerceiroRaioX = lazyWithRetry(() => import("./pages/terceiros/TerceiroRaioX"));
const FuncionariosTerceiros = lazyWithRetry(() => import("./pages/terceiros/FuncionariosTerceiros"));
const ObrigacoesMensais = lazyWithRetry(() => import("./pages/terceiros/ObrigacoesMensais"));
const PainelConformidade = lazyWithRetry(() => import("./pages/terceiros/PainelConformidade"));
const AlertasCobrancas = lazyWithRetry(() => import("./pages/terceiros/AlertasCobranças"));
const PortalTerceiro = lazyWithRetry(() => import("./pages/terceiros/PortalTerceiro"));
const Crachas = lazyWithRetry(() => import("./pages/terceiros/Crachas"));
const AprovacaoPortal = lazyWithRetry(() => import("./pages/terceiros/AprovacaoPortal"));
const ValidacaoIA = lazyWithRetry(() => import("./pages/terceiros/ValidacaoIA"));
const ContratosList = lazyWithRetry(() => import("./pages/terceiros/contratos/ContratosList"));
const ContratoNovo = lazyWithRetry(() => import("./pages/terceiros/contratos/ContratoNovo"));
const ContratoDetalhe = lazyWithRetry(() => import("./pages/terceiros/contratos/ContratoDetalhe"));
const ContratoTemplate = lazyWithRetry(() => import("./pages/terceiros/contratos/ContratoTemplate"));
const MedicoesTerceiros = lazyWithRetry(() => import("./pages/terceiros/Medicoes"));
const PrevisaoCaixaTerceiros = lazyWithRetry(() => import("./pages/terceiros/PrevisaoCaixa"));
const AdvertenciasTerceiros = lazyWithRetry(() => import("./pages/terceiros/AdvertenciasTerceiros"));

// Parceiros
const PainelParceiros = lazyWithRetry(() => import("./pages/parceiros/PainelParceiros"));
const CadastroParceiros = lazyWithRetry(() => import("./pages/parceiros/CadastroParceiros"));
const LancamentosParceiros = lazyWithRetry(() => import("./pages/parceiros/LancamentosParceiros"));
const GuiaDescontos = lazyWithRetry(() => import("./pages/parceiros/GuiaDescontos"));
const PagamentosParceiros = lazyWithRetry(() => import("./pages/parceiros/PagamentosParceiros"));
const AprovacoesParceiros = lazyWithRetry(() => import("./pages/parceiros/AprovacoesParceiros"));
const PortalParceiro = lazyWithRetry(() => import("./pages/parceiros/PortalParceiro"));

// Orçamento
const PainelOrcamento    = lazyWithRetry(() => import("./pages/orcamento/PainelOrcamento"));
const OrcamentoLista     = lazyWithRetry(() => import("./pages/orcamento/OrcamentoLista"));
const OrcamentoDetalhe   = lazyWithRetry(() => import("./pages/orcamento/OrcamentoDetalhe"));
const OrcamentoImportar  = lazyWithRetry(() => import("./pages/orcamento/OrcamentoImportar"));
const OrcamentoPrint     = lazyWithRetry(() => import("./pages/orcamento/OrcamentoPrint"));
const BibliotecaOrcamento = lazyWithRetry(() => import("./pages/orcamento/BibliotecaOrcamento"));
const OrcamentoDashPage  = lazyWithRetry(() => import("./pages/orcamento/OrcamentoDashPage"));

// Planejamento
const PlanejamentoLista   = lazyWithRetry(() => import("./pages/planejamento/PlanejamentoLista"));
const PlanejamentoDetalhe = lazyWithRetry(() => import("./pages/planejamento/PlanejamentoDetalhe"));

// Gestão de Documentos
const GestaoDocumentos = lazyWithRetry(() => import("./pages/gestaodocumentos/index"));

// Medição de Contratos
const MedicaoContratos = lazyWithRetry(() => import("./pages/medicao/MedicaoContratos"));
const MedicaoDetalhe   = lazyWithRetry(() => import("./pages/medicao/MedicaoDetalhe"));
const MedicaoLevantamento = lazyWithRetry(() => import("./pages/medicao/MedicaoLevantamento"));

// Compras
const PainelCompras = lazyWithRetry(() => import("./pages/compras/Painel"));
const Fornecedores = lazyWithRetry(() => import("./pages/compras/Fornecedores"));
const FornecedorFicha = lazyWithRetry(() => import("./pages/compras/FornecedorFicha"));
const Almoxarifado = lazyWithRetry(() => import("./pages/compras/Almoxarifado"));
const AlmoxarifadoPage = lazyWithRetry(() => import("./pages/almoxarifado/index"));
const AlmoxarifadoCategorias = lazyWithRetry(() => import("./pages/almoxarifado/Categorias"));
const AlmoxarifadoMovimentacoes = lazyWithRetry(() => import("./pages/almoxarifado/Movimentacoes"));
const AlmoxarifadoInventario = lazyWithRetry(() => import("./pages/almoxarifado/Inventario"));
const AlmoxarifadoInventarioVisual = lazyWithRetry(() => import("./pages/almoxarifado/InventarioVisual"));
const AlmoxarifadoHistoricoInventario = lazyWithRetry(() => import("./pages/almoxarifado/HistoricoInventario")); // Rev. 2686
const FerramentasTerceiros = lazyWithRetry(() => import("./pages/almoxarifado/FerramentasTerceiros"));
const AlmoxarifadoAuditoria = lazyWithRetry(() => import("./pages/almoxarifado/Auditoria")); // Rev. 2450
// Equipamentos (Rev. 2258)
const EquipamentosHub = lazyWithRetry(() => import("./pages/equipamentos/index"));
const EquipamentosProprios = lazyWithRetry(() => import("./pages/equipamentos/Proprios"));
const EquipamentosLocados   = lazyWithRetry(() => import("./pages/equipamentos/Locados"));
const EntregasAlmox         = lazyWithRetry(() => import("./pages/equipamentos/EntregasAlmox"));
const LocadosUtilizacao     = lazyWithRetry(() => import("./pages/equipamentos/LocadosUtilizacao"));
const PropriosUtilizacao    = lazyWithRetry(() => import("./pages/equipamentos/PropriosUtilizacao"));
const SolicitacaoMDO = lazyWithRetry(() => import("./pages/SolicitacaoMDO"));
const Solicitacoes = lazyWithRetry(() => import("./pages/compras/Solicitacoes"));
const Cotacoes = lazyWithRetry(() => import("./pages/compras/Cotacoes"));
const Ordens = lazyWithRetry(() => import("./pages/compras/Ordens"));
const ComprasEmergencial = lazyWithRetry(() => import("./pages/compras/Emergencial"));
const ComprasAprovacoes = lazyWithRetry(() => import("./pages/compras/Aprovacoes"));
const ComprasRecebimentos = lazyWithRetry(() => import("./pages/compras/Recebimentos"));

const ComprasRealocacao = lazyWithRetry(() => import("./pages/compras/Realocacao"));
const ComprasComissoes = lazyWithRetry(() => import("./pages/compras/Comissoes"));
const ComprasConfiguracoes = lazyWithRetry(() => import("./pages/compras/Configuracoes"));
const DashboardObra = lazyWithRetry(() => import("./pages/compras/DashboardObra"));
const PainelFd = lazyWithRetry(() => import("./pages/compras/PainelFd"));
const PortalCotacaoPage = lazyWithRetry(() => import("./pages/PortalCotacao"));
const IntegraSignAssinar = lazyWithRetry(() => import("./pages/IntegraSignAssinar"));
const IntegraSignDashboard = lazyWithRetry(() => import("./pages/IntegraSignDashboard"));
const PortalServicoPage = lazyWithRetry(() => import("./pages/PortalServico"));
const MedicoesServicoPage = lazyWithRetry(() => import("./pages/compras/MedicoesServico"));
const DatabookPage = lazyWithRetry(() => import("./pages/compras/Databook"));
const PortalOCEntregaPage = lazyWithRetry(() => import("./pages/PortalOCEntrega"));
const ComprasAuditoriaFornecedores = lazyWithRetry(() => import("./pages/compras/AuditoriaFornecedores"));

// Frotas
const PainelFrotas = lazyWithRetry(() => import("./pages/frotas/PainelFrotas"));
const FrotasVeiculos = lazyWithRetry(() => import("./pages/frotas/Veiculos"));
const FrotasManutencoes = lazyWithRetry(() => import("./pages/frotas/Manutencoes"));
const FrotasCombustivel = lazyWithRetry(() => import("./pages/frotas/Combustivel"));
const FrotasRastreamento = lazyWithRetry(() => import("./pages/frotas/Rastreamento"));
const FrotasControleKm = lazyWithRetry(() => import("./pages/frotas/ControleKm"));
const FrotasMultas = lazyWithRetry(() => import("./pages/frotas/Multas"));
const FrotasIpva = lazyWithRetry(() => import("./pages/frotas/Ipva"));
const FrotasLicenciamento = lazyWithRetry(() => import("./pages/frotas/Licenciamento"));
const FrotasSeguros = lazyWithRetry(() => import("./pages/frotas/Seguros"));
const FrotasAnalitico = lazyWithRetry(() => import("./pages/frotas/FrotasAnalitico"));
const ManutencoesDashboard = lazyWithRetry(() => import("./pages/frotas/ManutencoesDashboard"));
const CombustivelDashboard = lazyWithRetry(() => import("./pages/frotas/CombustivelDashboard"));
const PedagiosDashboard = lazyWithRetry(() => import("./pages/frotas/PedagiosDashboard"));
const PrecosCombustivel = lazyWithRetry(() => import("./pages/frotas/PrecosCombustivel"));
const FrotasPedagios = lazyWithRetry(() => import("./pages/frotas/Pedagios"));
const FrotasRaioX = lazyWithRetry(() => import("./pages/frotas/RaioXVeiculo"));
const FrotasChecklist = lazyWithRetry(() => import("./pages/frotas/ChecklistVeiculos"));
const FrotasViagens = lazyWithRetry(() => import("./pages/frotas/ViagensFrotas"));

// Operacional
const PainelOperacional = lazyWithRetry(() => import("./pages/operacional/PainelOperacional"));
const RDOPage = lazyWithRetry(() => import("./pages/operacional/RDO"));
const ChecklistsPage = lazyWithRetry(() => import("./pages/operacional/Checklists"));
const ConcratagemPage = lazyWithRetry(() => import("./pages/operacional/Concretagem"));
const NaoConformidadesPage = lazyWithRetry(() => import("./pages/operacional/NaoConformidades"));
const RegistroFotograficoPage = lazyWithRetry(() => import("./pages/operacional/RegistroFotografico"));
const LiberacaoServicosPage = lazyWithRetry(() => import("./pages/operacional/LiberacaoServicos"));
const DiarioObraPage = lazyWithRetry(() => import("./pages/operacional/DiarioObra"));
const EnsaiosPage = lazyWithRetry(() => import("./pages/operacional/Ensaios"));

// Integrações
const MasControle = lazyWithRetry(() => import("./pages/integracoes/MasControle"));

// Sprint 6 - IA
const ComparativoConvencoes = lazyWithRetry(() => import("./pages/ComparativoConvencoes"));

// Pesquisa Pública
const PesquisaPublicaPage = lazyWithRetry(() => import("./pages/PesquisaPublica").then(m => ({ default: m.PesquisaPublicaPage })));
const ClimaPublicoPage = lazyWithRetry(() => import("./pages/PesquisaPublica").then(m => ({ default: m.ClimaPublicoPage })));

// Portal Externo
const PortalLogin = lazyWithRetry(() => import("./pages/portal/PortalLogin"));
const ContratarPlano = lazyWithRetry(() => import("./pages/portal/ContratarPlano"));
const SiteVendas = lazyWithRetry(() => import("./pages/portal/SiteVendas"));
const ModuloDetalhe = lazyWithRetry(() => import("./pages/portal/ModuloDetalhe"));
const ContratarSucesso = lazyWithRetry(() => import("./pages/portal/ContratarSucesso"));
const PortalLoginCliente = lazyWithRetry(() => import("./pages/portal/PortalLoginCliente"));
const PortalEsqueciSenha = lazyWithRetry(() => import("./pages/portal/PortalEsqueciSenha"));
const PortalRedefinirSenha = lazyWithRetry(() => import("./pages/portal/PortalRedefinirSenha"));
const PortalDashboardCliente = lazyWithRetry(() => import("./pages/portal/PortalDashboardCliente"));
const PortalHubCliente = lazyWithRetry(() => import("./pages/portal/PortalHubCliente"));
const PortalSelecionarObraCliente = lazyWithRetry(() => import("./pages/portal/PortalSelecionarObraCliente"));
const PortalRhDocumentosCliente = lazyWithRetry(() => import("./pages/portal/PortalRhDocumentosCliente"));
const PortalProjDocCliente = lazyWithRetry(() => import("./pages/portal/PortalProjDocCliente"));
const PortalPlanejamentoCliente = lazyWithRetry(() => import("./pages/portal/PortalPlanejamentoCliente"));
const ClientesPortalAdmin = lazyWithRetry(() => import("./pages/ClientesPortalAdmin"));
const QuestionarioPortalAdmin = lazyWithRetry(() => import("./pages/QuestionarioPortalAdmin"));
const VerificarAptidao = lazyWithRetry(() => import("./pages/VerificarAptidao"));
const PortalTrocarSenha = lazyWithRetry(() => import("./pages/portal/PortalTrocarSenha"));
const PortalDashboard = lazyWithRetry(() => import("./pages/portal/PortalDashboard"));
const AssinarDocumento = lazyWithRetry(() => import("./pages/AssinarDocumento"));

// ============================================================
function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path={"/login"} component={Login} />
        {/* FCSign — rota PÚBLICA (sem auth) p/ signatários externos */}
        <Route path={"/assinar/:token"} component={AssinarDocumento} />
        {/* CIPA — cédula PÚBLICA de votação por link/token */}
        <Route path={"/cipa/votar/:token"} component={CipaVotacao} />
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
        <Route path={"/usuarios"} component={() => <UsuariosGuard component={Usuarios} />} />
        <Route path={"/grupos-usuarios"} component={() => <MasterOnlyGuard component={GruposUsuarios} />} />
        <Route path={"/auditoria"} component={() => <MasterOnlyGuard component={Auditoria} />} />
        <Route path={"/admin/telemetria"} component={() => <MasterOnlyGuard component={Telemetria} />} />
        <Route path={"/admin/saas"} component={() => <MasterOnlyGuard component={SaasAdminPanel} />} />
        <Route path={"/admin/saas/precos"} component={() => <MasterOnlyGuard component={AdminPrecos} />} />
        <Route path={"/minha-assinatura"} component={() => <AdmClienteGuard component={MinhaAssinatura} />} />
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
        <Route path={"/sst/pt"} component={() => <RouteGuard component={PermissaoTrabalho} route="/sst/pt" />} />
        <Route path={"/sst/apr"} component={() => <RouteGuard component={AprAnalise} route="/sst/apr" />} />
        <Route path={"/sst/dds"} component={() => <RouteGuard component={DDSGuia} route="/sst/dds" />} />
        <Route path={"/sst/dds-dashboard"} component={() => <RouteGuard component={DDSDashboard} route="/sst/dds-dashboard" />} />
        <Route path={"/sst/dashboard-atestados-acidentes"} component={() => <RouteGuard component={DashboardAtestadosAcidentes} route="/sst/dashboard-atestados-acidentes" />} />
        <Route path={"/sst/dashboard-apr"} component={() => <RouteGuard component={DashboardAprAnalise} route="/sst/dashboard-apr" />} />
        <Route path={"/sst/dashboard-pt"} component={() => <RouteGuard component={DashboardPermissaoTrabalho} route="/sst/dashboard-pt" />} />
        <Route path={"/sst/acidentes"} component={() => <RouteGuard component={RegistroAcidentes} route="/sst/acidentes" />} />
        <Route path={"/sst/gestor-por-obra"} component={() => <RouteGuard component={GestorSSTPorObra} route="/sst/gestor-por-obra" />} />
        <Route path={"/modulo-pj"} component={() => <RouteGuard component={ModuloPJ} route="/modulo-pj" />} />
        <Route path={"/contrato-pj/:id"} component={() => <RouteGuard component={ContratoPJView} route="/modulo-pj" />} />
        <Route path={"/contrato-pj/:contractId/aditivo/:aditivoId"} component={() => <RouteGuard component={AditivoPJView} route="/modulo-pj" />} />
        <Route path={"/revisoes"} component={() => <RouteGuard component={Revisoes} route="/colaboradores" />} />
        <Route path={"/solicitacao-he"} component={() => <RouteGuard component={SolicitacaoHE} route="/solicitacao-he" />} />
        <Route path={"/banco-horas"} component={() => <RouteGuard component={BancoHoras} route="/banco-horas" />} />
        <Route path="/financeiro" component={() => <RouteGuard component={FinanceiroDashboard} route="/financeiro" />} />
        <Route path="/financeiro/dashboards/receber" component={() => <RouteGuard component={DashReceber} route="/financeiro/contas-a-receber-titulos" />} />
        <Route path="/financeiro/dashboards/pagar" component={() => <RouteGuard component={DashPagar} route="/financeiro/contas-a-pagar" />} />
        <Route path="/financeiro/dashboards/conciliacao" component={() => <RouteGuard component={DashConciliacao} route="/financeiro/conciliacao" />} />
        <Route path="/financeiro/dashboards/cheques" component={() => <RouteGuard component={DashCheques} route="/financeiro/cheques" />} />
        <Route path="/financeiro/dashboards/cartao" component={() => <RouteGuard component={DashCartao} route="/financeiro/cartao" />} />
        <Route path="/financeiro/dashboards/notas-fiscais" component={() => <RouteGuard component={DashNotasFiscais} route="/financeiro/notas-fiscais" />} />
        <Route path="/financeiro/lancamentos" component={() => <RouteGuard component={FinanceiroLancamentos} route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/receitas" component={() => { window.location.replace("/financeiro/contas-a-receber"); return null; }} />
        <Route path="/financeiro/contas-a-pagar" component={() => <RouteGuard component={FinanceiroContasAPagar} route="/financeiro/contas-a-pagar" />} />
        <Route path="/financeiro/contas-a-receber" component={() => <RouteGuard component={FinanceiroContasAReceber} route="/financeiro/contas-a-receber" />} />
        <Route path="/financeiro/contas-a-receber-titulos" component={() => <RouteGuard component={FinanceiroContasAReceberTitulos} route="/financeiro/contas-a-receber-titulos" />} />
        <Route path="/financeiro/dre" component={() => <RouteGuard component={FinanceiroDRE} route="/financeiro/dre" />} />
        <Route path="/financeiro/dfc" component={() => <RouteGuard component={FinanceiroDFC} route="/financeiro/dre" />} />
        <Route path="/financeiro/dre-analise" component={() => <RouteGuard component={FinanceiroDREAnalise} route="/financeiro/dre" />} />
        <Route path="/financeiro/fluxo-de-caixa" component={() => <RouteGuard component={FinanceiroFluxoCaixa} route="/financeiro/fluxo-de-caixa" />} />
        <Route path="/financeiro/obrigacoes-fiscais" component={() => <RouteGuard component={FinanceiroObrigacoesFiscais} route="/financeiro/obrigacoes-fiscais" />} />
        <Route path="/financeiro/plano-de-contas" component={() => <RouteGuard component={FinanceiroPlanoDeConta} route="/financeiro/plano-de-contas" />} />
        <Route path="/financeiro/categorias" component={() => <RouteGuard component={FinanceiroCategorias} route="/financeiro/categorias" />} />
        <Route path="/financeiro/centros-de-custo" component={() => <RouteGuard component={FinanceiroCentrosCusto} route="/financeiro/centros-de-custo" />} />
        <Route path="/financeiro/configuracoes" component={() => <RouteGuard component={FinanceiroConfiguracoes} route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/notas-fiscais" component={() => <RouteGuard component={FinanceiroNotasFiscais} route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/contabilidade" component={() => <RouteGuard component={FinanceiroContabilidade} route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/efd-icms-ipi"       component={() => <RouteGuard component={EfdIcmsIpi}       route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/efd-contribuicoes"  component={() => <RouteGuard component={EfdContribuicoes} route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/sped-ecf"           component={() => <RouteGuard component={SpedEcf}          route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/sped-ecd"           component={() => <RouteGuard component={SpedEcd}          route="/financeiro/lancamentos" />} />
        <Route path="/financeiro/conciliacao/workspace" component={() => <RouteGuard component={FinanceiroConciliacaoWorkspace} route="/financeiro/conciliacao" />} />
        <Route path="/financeiro/conciliacao" component={() => <RouteGuard component={FinanceiroConciliacao} route="/financeiro/conciliacao" />} />
        <Route path="/financeiro/cheques" component={() => <RouteGuard component={FinanceiroCheques} route="/financeiro/cheques" />} />
        <Route path="/financeiro/cheques-recebidos" component={() => <RouteGuard component={FinanceiroChequesRecebidos} route="/financeiro/cheques" />} />
        <Route path="/financeiro/cartao" component={() => <RouteGuard component={FinanceiroCartaoCredito} route="/financeiro/cartao" />} />
        <Route path="/financeiro/analise-cfo" component={() => <RouteGuard component={FinanceiroAnaliseCFO} route="/financeiro/analise-cfo" />} />
        <Route path="/financeiro/analise-custos/detalhe" component={() => <RouteGuard component={FinanceiroAnaliseCustosDetalhe} route="/financeiro/analise-custos" />} />
        <Route path="/financeiro/analise-custos" component={() => <RouteGuard component={FinanceiroAnaliseCustos} route="/financeiro/analise-custos" />} />
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
        {/* Rev. 4039 — 6 páginas próprias (antes 1 arquivo único com abas). */}
        <Route path={"/dashboards/almoxarifado-equipamentos"} component={() => <RouteGuard component={DashAlmoxVisaoGeral} route="/almoxarifado" />} />
        <Route path={"/dashboards/almoxarifado/visao-geral"} component={() => <RouteGuard component={DashAlmoxVisaoGeral} route="/almoxarifado" />} />
        <Route path={"/dashboards/almoxarifado/estoque"} component={() => <RouteGuard component={DashAlmoxEstoque} route="/almoxarifado" />} />
        <Route path={"/dashboards/almoxarifado/movimentacoes"} component={() => <RouteGuard component={DashAlmoxMovimentacoes} route="/almoxarifado" />} />
        <Route path={"/dashboards/almoxarifado/ferramentas-terceiros"} component={() => <RouteGuard component={DashAlmoxFerramentasTerceiros} route="/almoxarifado" />} />
        <Route path={"/dashboards/almoxarifado/equip-proprios"} component={() => <RouteGuard component={DashAlmoxEquipProprios} route="/almoxarifado" />} />
        <Route path={"/dashboards/almoxarifado/equip-locados"} component={() => <RouteGuard component={DashAlmoxEquipLocados} route="/almoxarifado" />} />
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
        {/* Rev. 3127 — Levantamento é engine COMPARTILHADA cliente×terceiro (?origem=cliente|terceiro).
            Guard ampliado: libera p/ quem tem o módulo de Medição (cliente, "/medicao") OU o de
            Terceiros ("/terceiros/medicoes"). Antes só "/medicao" travava usuários terceiros-only
            (ex.: tela "Acesso Restrito" em /medicao/:id/levantamento?origem=terceiro). Os dados seguem
            protegidos pelos guards de tenancy no backend (terceiroContratos.ts / medicao). */}
        <Route path="/medicao/:contratoId/levantamento/:campoId" component={() => <RouteGuard component={MedicaoLevantamento} route={["/medicao", "/terceiros/medicoes"]} />} />
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
        <Route path="/equipamentos/locados"          component={() => <RouteGuard component={EquipamentosLocados}  route="/almoxarifado" />} />
        <Route path="/equipamentos/entregas"         component={() => <RouteGuard component={EntregasAlmox}        route="/almoxarifado" />} />
        <Route path="/equipamentos/locados-utilizacao"  component={() => <RouteGuard component={LocadosUtilizacao}   route="/almoxarifado" />} />
        <Route path="/equipamentos/proprios-utilizacao" component={() => <RouteGuard component={PropriosUtilizacao} route="/almoxarifado" />} />
        <Route path="/compras/painel"            component={() => <RouteGuard component={PainelCompras} route="/compras/painel" />} />
        <Route path="/compras/fornecedores/:id"   component={() => <RouteGuard component={FornecedorFicha} route="/compras/fornecedores" />} />
        <Route path="/compras/fornecedores"      component={() => <RouteGuard component={Fornecedores} route="/compras/fornecedores" />} />
        <Route path="/compras/auditoria-fornecedores" component={() => <RouteGuard component={ComprasAuditoriaFornecedores} route="/compras/fornecedores" />} />
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
        <Route path="/frotas/viagens" component={() => <RouteGuard component={FrotasViagens} route="/frotas/painel" />} />
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
        <Route path="/a/:codigo" component={AvaliacaoPublicaCurta} />
        {/* Portal Externo (Terceiros/Parceiros) */}
        <Route path="/portal/login" component={PortalLogin} />
        <Route path="/planos" component={SiteVendas} />
        <Route path="/planos/modulos/:id" component={ModuloDetalhe} />
        <Route path="/contratar" component={ContratarPlano} />
        <Route path="/contratar/sucesso" component={ContratarSucesso} />
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
