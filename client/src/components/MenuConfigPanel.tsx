import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, Building2, Landmark, Layers, Briefcase,
  Clock, Wallet, FolderOpen, UtensilsCrossed, Wifi, HardHat,
  Gavel, UserSearch, BarChart3, Lock, FileText, Settings, Star,
  ClipboardList, GripVertical, ArrowUp, ArrowDown, Eye, EyeOff,
  RotateCcw, Save, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";

// Mapa de ícones por label para renderização
const ICON_MAP: Record<string, any> = {
  "Painel": LayoutDashboard,
  "Empresas": Building2,
  "Colaboradores": Users,
  "Obras": Landmark,
  "Setores": Layers,
  "Funções": Briefcase,
  "Relógios de Ponto": Wifi,
  "Contas Bancárias": ClipboardList,
  "Fechamento de Ponto": Clock,
  "Folha de Pagamento": Wallet,
  "Controle de Documentos": FolderOpen,
  "Vale Alimentação": UtensilsCrossed,
  "Controle de EPIs": HardHat,
  "Processos Trabalhistas": Gavel,
  "Raio-X do Funcionário": UserSearch,
  "Todos os Dashboards": BarChart3,
  "Funcionários": Users,
  "Cartão de Ponto": Clock,
  "Horas Extras": Clock,
  "EPIs": HardHat,
  "Jurídico": Gavel,
  "Usuários e Permissões": Lock,
  "Auditoria do Sistema": FileText,
  "Configurações": Settings,
  "Avaliação de Desempenho": Star,
};

// Configuração padrão do menu (espelha o DashboardLayout)
const DEFAULT_MENU = [
  {
    title: "Principal",
    items: [
      { label: "Painel", path: "/", visible: true },
    ],
  },
  {
    title: "Cadastro",
    items: [
      { label: "Empresas", path: "/empresas", visible: true },
      { label: "Colaboradores", path: "/colaboradores", visible: true },
      { label: "Obras", path: "/obras", visible: true },
      { label: "Setores", path: "/setores", visible: true },
      { label: "Funções", path: "/funcoes", visible: true },
      { label: "Relógios de Ponto", path: "/relogios-ponto", visible: true },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { label: "Contas Bancárias", path: "/contas-bancarias", visible: true },
    ],
  },
  {
    title: "Operacional",
    items: [
      { label: "Fechamento de Ponto", path: "/fechamento-ponto", visible: true },
      { label: "Folha de Pagamento", path: "/folha-pagamento", visible: true },
      { label: "Controle de Documentos", path: "/controle-documentos", visible: true },
      { label: "Vale Alimentação", path: "/vale-alimentacao", visible: true },
      { label: "Controle de EPIs", path: "/epis", visible: true },
    ],
  },
  {
    title: "Jurídico",
    items: [
      { label: "Processos Trabalhistas", path: "/processos-trabalhistas", visible: true },
    ],
  },
  {
    title: "Relatórios",
    items: [
      { label: "Raio-X do Funcionário", path: "/relatorios/raio-x", visible: true },
    ],
  },
  {
    title: "Dashboards",
    items: [
      { label: "Todos os Dashboards", path: "/dashboards", visible: true },
      { label: "Funcionários", path: "/dashboards/funcionarios", visible: true },
      { label: "Cartão de Ponto", path: "/dashboards/cartao-ponto", visible: true },
      { label: "Folha de Pagamento", path: "/dashboards/folha-pagamento", visible: true },
      { label: "Horas Extras", path: "/dashboards/horas-extras", visible: true },
      { label: "EPIs", path: "/dashboards/epis", visible: true },
      { label: "Jurídico", path: "/dashboards/juridico", visible: true },
    ],
  },
  {
    title: "Administração",
    items: [
      { label: "Usuários e Permissões", path: "/usuarios", visible: true },
      { label: "Auditoria do Sistema", path: "/auditoria", visible: true },
      { label: "Configurações", path: "/configuracoes", visible: true },
    ],
  },
  {
    title: "Em Breve",
    items: [
      { label: "Avaliação de Desempenho", path: "/avaliacao", visible: true },
    ],
  },
];

type MenuItem = { label: string; path: string; visible: boolean };
type MenuSection = { title: string; items: MenuItem[] };

export default function MenuConfigPanel() {
  const [menuConfig, setMenuConfig] = useState<MenuSection[]>(DEFAULT_MENU);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const configQuery = trpc.menuConfig.get.useQuery();
  const saveMut = trpc.menuConfig.save.useMutation({
    onSuccess: () => {
      toast.success("Configuração do menu salva com sucesso!");
      setHasChanges(false);
      configQuery.refetch();
    },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });
  const resetMut = trpc.menuConfig.reset.useMutation({
    onSuccess: () => {
      setMenuConfig(DEFAULT_MENU);
      setHasChanges(false);
      toast.success("Menu restaurado ao padrão!");
      configQuery.refetch();
    },
    onError: (e) => toast.error("Erro ao restaurar: " + e.message),
  });

  useEffect(() => {
    if (configQuery.data) {
      setMenuConfig(configQuery.data);
    }
  }, [configQuery.data]);

  const moveSection = useCallback((sectionIdx: number, direction: "up" | "down") => {
    setMenuConfig(prev => {
      const arr = [...prev];
      const targetIdx = direction === "up" ? sectionIdx - 1 : sectionIdx + 1;
      if (targetIdx < 0 || targetIdx >= arr.length) return prev;
      [arr[sectionIdx], arr[targetIdx]] = [arr[targetIdx], arr[sectionIdx]];
      return arr;
    });
    setHasChanges(true);
  }, []);

  const moveItem = useCallback((sectionIdx: number, itemIdx: number, direction: "up" | "down") => {
    setMenuConfig(prev => {
      const arr = prev.map(s => ({ ...s, items: [...s.items] }));
      const items = arr[sectionIdx].items;
      const targetIdx = direction === "up" ? itemIdx - 1 : itemIdx + 1;
      if (targetIdx < 0 || targetIdx >= items.length) return prev;
      [items[itemIdx], items[targetIdx]] = [items[targetIdx], items[itemIdx]];
      return arr;
    });
    setHasChanges(true);
  }, []);

  const toggleItemVisibility = useCallback((sectionIdx: number, itemIdx: number) => {
    setMenuConfig(prev => {
      const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
      arr[sectionIdx].items[itemIdx].visible = !arr[sectionIdx].items[itemIdx].visible;
      return arr;
    });
    setHasChanges(true);
  }, []);

  const moveItemToSection = useCallback((fromSectionIdx: number, itemIdx: number, toSectionIdx: number) => {
    setMenuConfig(prev => {
      const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
      const [item] = arr[fromSectionIdx].items.splice(itemIdx, 1);
      arr[toSectionIdx].items.push(item);
      return arr;
    });
    setHasChanges(true);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Painel de Controle</h2>
          <p className="text-sm text-gray-500">
            Personalize a organização do menu lateral. Mova itens entre seções, reordene e oculte o que não precisar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              if (confirm("Restaurar o menu ao padrão original?")) {
                resetMut.mutate();
              }
            }}
            disabled={resetMut.isPending}
          >
            <RotateCcw className="h-4 w-4" />
            Restaurar Padrão
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => saveMut.mutate({ config: menuConfig })}
            disabled={!hasChanges || saveMut.isPending}
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Configuração
          </Button>
        </div>
      </div>

      {hasChanges && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
          Você tem alterações não salvas. Clique em "Salvar Configuração" para aplicar.
        </div>
      )}

      <div className="space-y-3">
        {menuConfig.map((section, sIdx) => (
          <Card key={section.title} className="border">
            <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setExpandedSection(expandedSection === section.title ? null : section.title)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-600">
                    {section.title}
                  </CardTitle>
                  <span className="text-xs text-gray-400">
                    {section.items.filter(i => i.visible).length}/{section.items.length} visíveis
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); moveSection(sIdx, "up"); }}
                    disabled={sIdx === 0}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); moveSection(sIdx, "down"); }}
                    disabled={sIdx === menuConfig.length - 1}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  {expandedSection === section.title ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </div>
            </CardHeader>
            {expandedSection === section.title && (
              <CardContent className="pt-0 px-4 pb-3">
                <div className="space-y-1">
                  {section.items.map((item, iIdx) => {
                    const IconComp = ICON_MAP[item.label] || LayoutDashboard;
                    return (
                      <div
                        key={item.path}
                        className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                          item.visible ? "bg-gray-50" : "bg-gray-100 opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <GripVertical className="h-3.5 w-3.5 text-gray-300" />
                          <IconComp className={`h-4 w-4 ${item.visible ? "text-gray-600" : "text-gray-400"}`} />
                          <span className={`text-sm ${item.visible ? "text-gray-800" : "text-gray-400 line-through"}`}>
                            {item.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Mover para outra seção */}
                          <select
                            className="text-xs border rounded px-1 py-0.5 bg-white text-gray-600 h-7"
                            value=""
                            onChange={(e) => {
                              const targetIdx = parseInt(e.target.value);
                              if (!isNaN(targetIdx)) {
                                moveItemToSection(sIdx, iIdx, targetIdx);
                              }
                            }}
                          >
                            <option value="">Mover para...</option>
                            {menuConfig.map((s, idx) => idx !== sIdx ? (
                              <option key={s.title} value={idx}>{s.title}</option>
                            ) : null)}
                          </select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveItem(sIdx, iIdx, "up")}
                            disabled={iIdx === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveItem(sIdx, iIdx, "down")}
                            disabled={iIdx === section.items.length - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleItemVisibility(sIdx, iIdx)}
                            title={item.visible ? "Ocultar" : "Mostrar"}
                          >
                            {item.visible ? (
                              <Eye className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5 text-gray-400" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
