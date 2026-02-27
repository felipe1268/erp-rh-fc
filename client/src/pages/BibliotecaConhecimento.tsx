import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Search, BookOpen, ArrowLeft, ChevronRight,
  Rocket, Database, Clock, Users, Shield, Gavel,
  BarChart3, Calculator, Settings, BookA,
  LayoutDashboard, LogIn, Grid2X2, Building2, Layers,
  Landmark, Wallet, UtensilsCrossed, FolderOpen,
  AlertTriangle, Palmtree, FileSignature, HardHat,
  Lock, UserSearch, MessageCircle, X, Star, HelpCircle,
  Heart, Printer, FileDown,
} from "lucide-react";
import {
  CATEGORIAS, ARTIGOS, getArtigosByCategoria, getArtigoById, buscarArtigos,
  type ArtigoCategoria, type Artigo,
} from "@/data/bibliotecaConteudo";
import { Streamdown } from "@/components/LazyStreamdown";

// Mapa de ícones por nome
const ICON_MAP: Record<string, any> = {
  Rocket, Database, Clock, Users, Shield, Gavel,
  BarChart3, Calculator, Settings, BookA,
  LayoutDashboard, LogIn, Grid2X2, Building2, Layers,
  Landmark, Wallet, UtensilsCrossed, FolderOpen,
  AlertTriangle, Palmtree, FileSignature, HardHat,
  Lock, UserSearch, BookOpen, MessageCircle, Star, HelpCircle,
};

// Cores por categoria
const COR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  green: "bg-green-100 text-green-700 border-green-200",
  red: "bg-red-100 text-red-700 border-red-200",
  cyan: "bg-cyan-100 text-cyan-700 border-cyan-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
  pink: "bg-pink-100 text-pink-700 border-pink-200",
};

const COR_BG_MAP: Record<string, string> = {
  blue: "from-blue-500 to-blue-600",
  emerald: "from-emerald-500 to-emerald-600",
  amber: "from-amber-500 to-amber-600",
  purple: "from-purple-500 to-purple-600",
  green: "from-green-500 to-green-600",
  red: "from-red-500 to-red-600",
  cyan: "from-cyan-500 to-cyan-600",
  orange: "from-orange-500 to-orange-600",
  slate: "from-slate-500 to-slate-600",
  indigo: "from-indigo-500 to-indigo-600",
  yellow: "from-yellow-500 to-yellow-600",
  pink: "from-pink-500 to-pink-600",
};

const COR_ICON_BG: Record<string, string> = {
  blue: "bg-blue-500/10",
  emerald: "bg-emerald-500/10",
  amber: "bg-amber-500/10",
  purple: "bg-purple-500/10",
  green: "bg-green-500/10",
  red: "bg-red-500/10",
  cyan: "bg-cyan-500/10",
  orange: "bg-orange-500/10",
  slate: "bg-slate-500/10",
  indigo: "bg-indigo-500/10",
  yellow: "bg-yellow-500/10",
  pink: "bg-pink-500/10",
};

const COR_ICON_TEXT: Record<string, string> = {
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  purple: "text-purple-600",
  green: "text-green-600",
  red: "text-red-600",
  cyan: "text-cyan-600",
  orange: "text-orange-600",
  slate: "text-slate-600",
  indigo: "text-indigo-600",
  yellow: "text-yellow-600",
  pink: "text-pink-600",
};

export default function BibliotecaConhecimento() {
  return (
    <DashboardLayout>
      <BibliotecaContent />
    </DashboardLayout>
  );
}

// Hook para gerenciar favoritos com localStorage
function useFavoritos() {
  const [favoritos, setFavoritos] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("biblioteca-favoritos");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const toggleFavorito = useCallback((id: string) => {
    setFavoritos(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
      localStorage.setItem("biblioteca-favoritos", JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorito = useCallback((id: string) => favoritos.includes(id), [favoritos]);

  return { favoritos, toggleFavorito, isFavorito };
}

function BibliotecaContent() {
  const [view, setView] = useState<"home" | "categoria" | "artigo" | "favoritos">("home");
  const [categoriaAtiva, setCategoriaAtiva] = useState<ArtigoCategoria | null>(null);
  const [artigoAtivo, setArtigoAtivo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState<Artigo[]>([]);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { favoritos, toggleFavorito, isFavorito } = useFavoritos();

  // Scroll to top on view change
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [view, artigoAtivo, categoriaAtiva]);

  const handleBusca = (termo: string) => {
    setBusca(termo);
    if (termo.length >= 2) {
      setResultadosBusca(buscarArtigos(termo));
      setBuscaAberta(true);
    } else {
      setResultadosBusca([]);
      setBuscaAberta(false);
    }
  };

  const abrirCategoria = (cat: ArtigoCategoria) => {
    setCategoriaAtiva(cat);
    setView("categoria");
    setBusca("");
    setBuscaAberta(false);
  };

  const abrirArtigo = (id: string) => {
    const artigo = getArtigoById(id);
    if (artigo) {
      setArtigoAtivo(id);
      setCategoriaAtiva(artigo.categoria);
      setView("artigo");
      setBusca("");
      setBuscaAberta(false);
    }
  };

  const voltarHome = () => {
    setView("home");
    setCategoriaAtiva(null);
    setArtigoAtivo(null);
  };

  const voltarCategoria = () => {
    setView("categoria");
    setArtigoAtivo(null);
  };

  const categorias = Object.entries(CATEGORIAS) as [ArtigoCategoria, typeof CATEGORIAS[ArtigoCategoria]][];

  return (
    <div className="max-w-6xl mx-auto" ref={contentRef}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          {view !== "home" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={view === "artigo" ? voltarCategoria : voltarHome}
              className="h-8 w-8 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-foreground">Biblioteca de Conhecimento</h1>
            </div>
            {view === "home" && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Manual completo do sistema — guias, memoriais de cálculo e glossário
              </p>
            )}
          </div>
        </div>

        {/* Breadcrumb */}
        {view !== "home" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2 ml-11">
            <button onClick={voltarHome} className="hover:text-foreground transition-colors">Início</button>
            {categoriaAtiva && (
              <>
                <ChevronRight className="h-3 w-3" />
                <button
                  onClick={voltarCategoria}
                  className="hover:text-foreground transition-colors"
                >
                  {CATEGORIAS[categoriaAtiva].label}
                </button>
              </>
            )}
            {artigoAtivo && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className="text-foreground font-medium">
                  {getArtigoById(artigoAtivo)?.titulo}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={buscaRef}
            value={busca}
            onChange={(e) => handleBusca(e.target.value)}
            placeholder="Buscar na biblioteca... (ex: rescisão, férias, EPI, FGTS)"
            className="pl-10 pr-10 h-11 bg-card border-border"
          />
          {busca && (
            <button
              onClick={() => { setBusca(""); setBuscaAberta(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {buscaAberta && resultadosBusca.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-auto">
            <div className="p-2">
              <p className="text-xs text-muted-foreground px-2 py-1">
                {resultadosBusca.length} resultado{resultadosBusca.length !== 1 ? "s" : ""} encontrado{resultadosBusca.length !== 1 ? "s" : ""}
              </p>
              {resultadosBusca.map((artigo) => {
                const cat = CATEGORIAS[artigo.categoria];
                const Icon = ICON_MAP[artigo.icone] || BookOpen;
                return (
                  <button
                    key={artigo.id}
                    onClick={() => abrirArtigo(artigo.id)}
                    className="w-full text-left px-3 py-2.5 rounded-md hover:bg-accent transition-colors flex items-start gap-3"
                  >
                    <div className={`h-8 w-8 rounded-md ${COR_ICON_BG[cat.cor]} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon className={`h-4 w-4 ${COR_ICON_TEXT[cat.cor]}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{artigo.titulo}</p>
                      <p className="text-xs text-muted-foreground truncate">{artigo.resumo}</p>
                      <Badge variant="outline" className={`mt-1 text-[10px] px-1.5 py-0 ${COR_MAP[cat.cor]}`}>
                        {cat.label}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {buscaAberta && busca.length >= 2 && resultadosBusca.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 p-6 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum resultado encontrado para "{busca}"</p>
            <p className="text-xs text-muted-foreground mt-1">Tente termos como: rescisão, férias, EPI, ponto, folha</p>
          </div>
        )}
      </div>

      {/* Favoritos Tab */}
      {view === "home" && favoritos.length > 0 && (
        <div className="flex gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView("favoritos")}
            className="text-xs gap-1.5"
          >
            <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
            Meus Favoritos ({favoritos.length})
          </Button>
        </div>
      )}

      {/* Content */}
      {view === "home" && <HomeView categorias={categorias} onSelectCategoria={abrirCategoria} onSelectArtigo={abrirArtigo} />}
      {view === "categoria" && categoriaAtiva && <CategoriaView categoria={categoriaAtiva} onSelectArtigo={abrirArtigo} />}
      {view === "artigo" && artigoAtivo && <ArtigoView artigoId={artigoAtivo} onSelectArtigo={abrirArtigo} toggleFavorito={toggleFavorito} isFavorito={isFavorito} />}
      {view === "favoritos" && <FavoritosView favoritos={favoritos} onSelectArtigo={abrirArtigo} toggleFavorito={toggleFavorito} />}
    </div>
  );
}

// ============================================================
// HOME VIEW - Grid de categorias
// ============================================================
function HomeView({
  categorias,
  onSelectCategoria,
  onSelectArtigo,
}: {
  categorias: [ArtigoCategoria, typeof CATEGORIAS[ArtigoCategoria]][];
  onSelectCategoria: (cat: ArtigoCategoria) => void;
  onSelectArtigo: (id: string) => void;
}) {
  return (
    <div>
      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-primary">{ARTIGOS.length}</p>
          <p className="text-xs text-muted-foreground">Artigos</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-primary">{Object.keys(CATEGORIAS).length}</p>
          <p className="text-xs text-muted-foreground">Categorias</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-primary">{ARTIGOS.filter(a => a.categoria === "memoriais").length}</p>
          <p className="text-xs text-muted-foreground">Memoriais</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-primary">
            {new Set(ARTIGOS.flatMap(a => a.tags)).size}
          </p>
          <p className="text-xs text-muted-foreground">Tags</p>
        </div>
      </div>

      {/* Categories Grid */}
      <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">Categorias</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {categorias.map(([key, cat]) => {
          const Icon = ICON_MAP[cat.icone] || BookOpen;
          const artigos = getArtigosByCategoria(key);
          return (
            <button
              key={key}
              onClick={() => onSelectCategoria(key)}
              className="bg-card border border-border rounded-lg p-4 text-left hover:border-primary/30 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${COR_BG_MAP[cat.cor]} flex items-center justify-center shrink-0`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                    {cat.label}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{cat.descricao}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                    {artigos.length} artigo{artigos.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Popular Articles */}
      <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">Artigos Populares</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {["memorial-rescisao", "fechamento-ponto", "cadastro-colaboradores", "memorial-faltas", "controle-epis", "avaliacao-visao-geral"].map(id => {
          const artigo = getArtigoById(id);
          if (!artigo) return null;
          const cat = CATEGORIAS[artigo.categoria];
          const Icon = ICON_MAP[artigo.icone] || BookOpen;
          return (
            <button
              key={id}
              onClick={() => onSelectArtigo(id)}
              className="bg-card border border-border rounded-lg p-3 text-left hover:border-primary/30 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-md ${COR_ICON_BG[cat.cor]} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-4 w-4 ${COR_ICON_TEXT[cat.cor]}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {artigo.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{artigo.resumo}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// CATEGORIA VIEW - Lista de artigos da categoria
// ============================================================
function CategoriaView({
  categoria,
  onSelectArtigo,
}: {
  categoria: ArtigoCategoria;
  onSelectArtigo: (id: string) => void;
}) {
  const cat = CATEGORIAS[categoria];
  const artigos = getArtigosByCategoria(categoria);
  const Icon = ICON_MAP[cat.icone] || BookOpen;

  return (
    <div>
      {/* Category Header */}
      <div className={`bg-gradient-to-r ${COR_BG_MAP[cat.cor]} rounded-lg p-5 mb-6 text-white`}>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center">
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{cat.label}</h2>
            <p className="text-sm text-white/80">{cat.descricao}</p>
            <p className="text-xs text-white/60 mt-1">{artigos.length} artigo{artigos.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* Articles List */}
      <div className="space-y-2">
        {artigos.map((artigo, idx) => {
          const ArtIcon = ICON_MAP[artigo.icone] || BookOpen;
          return (
            <button
              key={artigo.id}
              onClick={() => onSelectArtigo(artigo.id)}
              className="w-full bg-card border border-border rounded-lg p-4 text-left hover:border-primary/30 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                    {artigo.titulo}
                  </h3>
                  {artigo.subtitulo && (
                    <p className="text-xs text-muted-foreground mt-0.5">{artigo.subtitulo}</p>
                  )}
                  <p className="text-xs text-muted-foreground/80 mt-1">{artigo.resumo}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {artigo.tags.slice(0, 4).map(tag => (
                      <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// ARTIGO VIEW - Conteúdo completo do artigo
// ============================================================
// ============================================================
// FAVORITOS VIEW
// ============================================================
function FavoritosView({
  favoritos,
  onSelectArtigo,
  toggleFavorito,
}: {
  favoritos: string[];
  onSelectArtigo: (id: string) => void;
  toggleFavorito: (id: string) => void;
}) {
  const artigosFavoritos = favoritos.map(id => getArtigoById(id)).filter(Boolean) as Artigo[];

  return (
    <div>
      <div className="bg-gradient-to-r from-red-500 to-pink-500 rounded-lg p-5 mb-6 text-white">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center">
            <Heart className="h-6 w-6 text-white fill-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Meus Favoritos</h2>
            <p className="text-sm text-white/80">{artigosFavoritos.length} artigo{artigosFavoritos.length !== 1 ? "s" : ""} salvo{artigosFavoritos.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {artigosFavoritos.length === 0 ? (
        <div className="text-center py-12">
          <Heart className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum artigo favoritado ainda</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Clique no coração nos artigos para salvá-los aqui</p>
        </div>
      ) : (
        <div className="space-y-2">
          {artigosFavoritos.map((artigo) => {
            const cat = CATEGORIAS[artigo.categoria];
            const ArtIcon = ICON_MAP[artigo.icone] || BookOpen;
            return (
              <div key={artigo.id} className="bg-card border border-border rounded-lg p-4 flex items-start gap-4 group">
                <button onClick={() => onSelectArtigo(artigo.id)} className="flex items-start gap-4 flex-1 text-left">
                  <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${COR_BG_MAP[cat.cor]} flex items-center justify-center shrink-0`}>
                    <ArtIcon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mb-1 ${COR_MAP[cat.cor]}`}>{cat.label}</Badge>
                    <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{artigo.titulo}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{artigo.resumo}</p>
                  </div>
                </button>
                <button
                  onClick={() => toggleFavorito(artigo.id)}
                  className="h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center shrink-0"
                  title="Remover dos favoritos"
                >
                  <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ARTIGO VIEW - Conteúdo completo do artigo
// ============================================================
function ArtigoView({
  artigoId,
  onSelectArtigo,
  toggleFavorito,
  isFavorito,
}: {
  artigoId: string;
  onSelectArtigo: (id: string) => void;
  toggleFavorito: (id: string) => void;
  isFavorito: (id: string) => boolean;
}) {
  const artigo = getArtigoById(artigoId);
  if (!artigo) return <p>Artigo não encontrado.</p>;

  const cat = CATEGORIAS[artigo.categoria];
  const Icon = ICON_MAP[artigo.icone] || BookOpen;

  // Related articles (same category, excluding current)
  const relacionados = getArtigosByCategoria(artigo.categoria)
    .filter(a => a.id !== artigoId)
    .slice(0, 3);

  return (
    <div>
      {/* Article Header */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className={`h-12 w-12 rounded-lg bg-gradient-to-br ${COR_BG_MAP[cat.cor]} flex items-center justify-center shrink-0`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mb-2 ${COR_MAP[cat.cor]}`}>
              {cat.label}
            </Badge>
            <h1 className="text-lg font-bold text-foreground">{artigo.titulo}</h1>
            {artigo.subtitulo && (
              <p className="text-sm text-muted-foreground mt-0.5">{artigo.subtitulo}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-2">
              {artigo.tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => toggleFavorito(artigoId)}
              className="h-9 w-9 rounded-md hover:bg-accent flex items-center justify-center transition-colors"
              title={isFavorito(artigoId) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            >
              <Heart className={`h-4 w-4 ${isFavorito(artigoId) ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
            </button>
            <button
              onClick={() => window.print()}
              className="h-9 w-9 rounded-md hover:bg-accent flex items-center justify-center transition-colors"
              title="Imprimir artigo"
            >
              <Printer className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* Article Content */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <div className="prose prose-sm max-w-none
          prose-headings:text-foreground prose-headings:font-bold
          prose-h2:text-base prose-h2:mt-6 prose-h2:mb-3 prose-h2:border-b prose-h2:border-border prose-h2:pb-2
          prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-2
          prose-p:text-foreground/80 prose-p:text-sm prose-p:leading-relaxed
          prose-strong:text-foreground
          prose-table:text-sm
          prose-th:bg-muted prose-th:text-foreground prose-th:font-semibold prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-border
          prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-border prose-td:text-foreground/80
          prose-blockquote:border-l-primary prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:text-sm prose-blockquote:not-italic prose-blockquote:text-foreground/80
          prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:text-foreground
          prose-hr:border-border
          prose-li:text-sm prose-li:text-foreground/80
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        ">
          <Streamdown>{artigo.conteudo}</Streamdown>
        </div>
      </div>

      {/* Related Articles */}
      {relacionados.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
            Artigos Relacionados
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {relacionados.map(rel => {
              const RelIcon = ICON_MAP[rel.icone] || BookOpen;
              return (
                <button
                  key={rel.id}
                  onClick={() => onSelectArtigo(rel.id)}
                  className="bg-card border border-border rounded-lg p-3 text-left hover:border-primary/30 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <RelIcon className={`h-4 w-4 ${COR_ICON_TEXT[cat.cor]}`} />
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {rel.titulo}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{rel.resumo}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
