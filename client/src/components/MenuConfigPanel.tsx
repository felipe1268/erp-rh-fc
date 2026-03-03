import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LayoutDashboard, Users, Building2, Landmark, Layers, Briefcase,
  Clock, Wallet, FolderOpen, UtensilsCrossed, Wifi, HardHat,
  Gavel, UserSearch, BarChart3, Lock, FileText, Settings, Star,
  ClipboardList, GripVertical, Eye, EyeOff,
  RotateCcw, Save, Loader2, ChevronDown, ChevronRight, Pencil, Check, X,
  CalendarDays, TrendingUp, FileSpreadsheet, CreditCard,
  Scale, AlertTriangle, Palmtree, FileSignature, ShieldCheck,
  ClipboardPlus, ShieldAlert, GitBranch, Trash2, BookOpen, Shield,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const ICON_MAP: Record<string, any> = {
  "Painel RH": LayoutDashboard, "Empresas": Building2, "Colaboradores": Users,
  "Obras": Landmark, "Efetivo por Obra": HardHat, "Setores": Layers, "Funções": Briefcase,
  "Relógios de Ponto": Wifi, "Convenções Coletivas": Scale,
  "Contas Bancárias": ClipboardList,
  "Fechamento de Ponto": Clock, "Folha de Pagamento": Wallet,
  "Controle de Documentos": FolderOpen, "Vale Alimentação": UtensilsCrossed,
  "Solicitação de Hora Extra": Clock, "Crachás": CreditCard,
  "Lançar Atestados": ClipboardPlus, "Advertências": ShieldAlert,
  "Aviso Prévio": AlertTriangle, "Férias": Palmtree,
  "Contratos PJ": FileSignature, "PJ Medições": FileSpreadsheet,
  "Raio-X do Funcionário": UserSearch,
  "Todos os Dashboards": BarChart3, "Funcionários": Users,
  "Cartão de Ponto": Clock, "Horas Extras": Clock,
  "Aviso Prévio (Dashboard)": AlertTriangle, "Férias (Dashboard)": Palmtree,
  "Efetivo por Obra (Dashboard)": Building2, "Perfil por Tempo de Casa": UserSearch,
  "Controle de Documentos (Dashboard)": ShieldCheck,
  "Feriados": CalendarDays, "Dissídio": TrendingUp,
  "Comparativo Convenções": Scale,
  "Processos Trabalhistas": Gavel, "Jurídico": Gavel,
  "EPIs": HardHat, "Controle de EPIs": HardHat, "CIPA": Shield,
  "Usuários e Permissões": Lock, "Grupos de Usuários": Users,
  "Auditoria do Sistema": FileText, "Configurações": Settings,
  "Revisões do Sistema": GitBranch, "Lixeira": Trash2,
  "Biblioteca de Conhecimento": BookOpen,
};

const PATH_ICON_MAP: Record<string, any> = {
  "/painel/rh": LayoutDashboard, "/empresas": Building2, "/colaboradores": Users,
  "/obras": Landmark, "/obras/efetivo": HardHat, "/setores": Layers, "/funcoes": Briefcase,
  "/relogios-ponto": Wifi, "/convencoes-coletivas": Scale,
  "/contas-bancarias": ClipboardList,
  "/fechamento-ponto": Clock, "/folha-pagamento": Wallet,
  "/controle-documentos": FolderOpen, "/vale-alimentacao": UtensilsCrossed,
  "/solicitacao-he": Clock, "/crachas": CreditCard,
  "/controle-documentos?tab=atestados": ClipboardPlus,
  "/controle-documentos?tab=advertencias": ShieldAlert,
  "/aviso-previo": AlertTriangle, "/ferias": Palmtree,
  "/modulo-pj": FileSignature, "/pj-medicoes": FileSpreadsheet,
  "/relatorios/raio-x": UserSearch,
  "/dashboards": BarChart3, "/dashboards/funcionarios": Users,
  "/dashboards/cartao-ponto": Clock, "/dashboards/folha-pagamento": Wallet,
  "/dashboards/horas-extras": Clock, "/dashboards/aviso-previo": AlertTriangle,
  "/dashboards/ferias": Palmtree, "/dashboards/efetivo-obra": Building2,
  "/dashboards/perfil-tempo-casa": UserSearch, "/dashboards/controle-documentos": ShieldCheck,
  "/feriados": CalendarDays, "/dissidio": TrendingUp,
  "/comparativo-convencoes": Scale,
  "/processos-trabalhistas": Gavel, "/dashboards/juridico": Gavel,
  "/epis": HardHat, "/cipa": Shield, "/dashboards/epis": HardHat,
  "/usuarios": Lock, "/grupos-usuarios": Users,
  "/auditoria": FileText, "/configuracoes": Settings,
  "/revisoes": GitBranch, "/lixeira": Trash2,
  "/ajuda": BookOpen,
};

const DEFAULT_MENU = [
  { title: "Principal", items: [
    { label: "Painel RH", path: "/painel/rh", visible: true },
  ]},
  { title: "Cadastro", items: [
    { label: "Empresas", path: "/empresas", visible: true },
    { label: "Colaboradores", path: "/colaboradores", visible: true },
    { label: "Obras", path: "/obras", visible: true },
    { label: "Efetivo por Obra", path: "/obras/efetivo", visible: true },
    { label: "Setores", path: "/setores", visible: true },
    { label: "Funções", path: "/funcoes", visible: true },
    { label: "Relógios de Ponto", path: "/relogios-ponto", visible: true },
    { label: "Convenções Coletivas", path: "/convencoes-coletivas", visible: true },
  ]},
  { title: "Financeiro", items: [
    { label: "Contas Bancárias", path: "/contas-bancarias", visible: true },
  ]},
  { title: "Operacional", items: [
    { label: "Gestão de Competências", path: "/gestao-competencias", visible: true },
    { label: "Controle de Documentos", path: "/controle-documentos", visible: true },
    { label: "Vale Alimentação", path: "/vale-alimentacao", visible: true },
    { label: "Solicitação de Hora Extra", path: "/solicitacao-he", visible: true },
    { label: "Crachás", path: "/crachas", visible: true },
    { label: "Lançar Atestados", path: "/controle-documentos?tab=atestados", visible: true },
    { label: "Advertências", path: "/controle-documentos?tab=advertencias", visible: true },
  ]},
  { title: "Gestão de Pessoas", items: [
    { label: "Aviso Prévio", path: "/aviso-previo", visible: true },
    { label: "Férias", path: "/ferias", visible: true },
    { label: "Contratos PJ", path: "/modulo-pj", visible: true },
    { label: "PJ Medições", path: "/pj-medicoes", visible: true },
  ]},
  { title: "Relatórios", items: [
    { label: "Raio-X do Funcionário", path: "/relatorios/raio-x", visible: true },
    { label: "Relatório de Ponto", path: "/relatorios/ponto", visible: true },
    { label: "Relatório de Folha", path: "/relatorios/folha", visible: true },
    { label: "Relatório de Divergências", path: "/relatorios/divergencias", visible: true },
    { label: "Custo por Obra", path: "/relatorios/custo-obra", visible: true },
  ]},
  { title: "Dashboards", items: [
    { label: "Todos os Dashboards", path: "/dashboards", visible: true },
    { label: "Funcionários", path: "/dashboards/funcionarios", visible: true },
    { label: "Cartão de Ponto", path: "/dashboards/cartao-ponto", visible: true },
    { label: "Folha de Pagamento", path: "/dashboards/folha-pagamento", visible: true },
    { label: "Horas Extras", path: "/dashboards/horas-extras", visible: true },
    { label: "Aviso Prévio", path: "/dashboards/aviso-previo", visible: true },
    { label: "Férias", path: "/dashboards/ferias", visible: true },
    { label: "Efetivo por Obra", path: "/dashboards/efetivo-obra", visible: true },
    { label: "Perfil por Tempo de Casa", path: "/dashboards/perfil-tempo-casa", visible: true },
    { label: "Controle de Documentos", path: "/dashboards/controle-documentos", visible: true },
  ]},
  { title: "Tabelas e Configurações", items: [
    { label: "Feriados", path: "/feriados", visible: true },
    { label: "Dissídio", path: "/dissidio", visible: true },
  ]},
  { title: "Inteligência Artificial", items: [
    { label: "Comparativo Convenções", path: "/comparativo-convencoes", visible: true },
  ]},
  { title: "Administração", items: [
    { label: "Usuários e Permissões", path: "/usuarios", visible: true },
    { label: "Grupos de Usuários", path: "/grupos-usuarios", visible: true },
    { label: "Auditoria do Sistema", path: "/auditoria", visible: true },
    { label: "Configurações", path: "/configuracoes", visible: true },
    { label: "Revisões do Sistema", path: "/revisoes", visible: true },
    { label: "Lixeira", path: "/lixeira", visible: true },
  ]},
  { title: "Ajuda", items: [
    { label: "Biblioteca de Conhecimento", path: "/ajuda", visible: true },
  ]},
];

type MenuItem = { label: string; path: string; visible: boolean; originalLabel?: string };
type MenuSection = { title: string; items: MenuItem[] };

// Unique ID helpers: sections use "sec-{idx}", items use "item-{sectionIdx}-{itemIdx}"
function secId(idx: number) { return `sec-${idx}`; }
function itemId(sIdx: number, iIdx: number) { return `item-${sIdx}-${iIdx}`; }
function parseItemId(id: string): { sIdx: number; iIdx: number } | null {
  const m = id.match(/^item-(\d+)-(\d+)$/);
  return m ? { sIdx: parseInt(m[1]), iIdx: parseInt(m[2]) } : null;
}
function parseSecId(id: string): number | null {
  const m = id.match(/^sec-(\d+)$/);
  return m ? parseInt(m[1]) : null;
}

// ======================== SORTABLE ITEM ========================
function SortableItem({
  id, item, sIdx, iIdx, isMaster,
  editingItem, editingLabel, setEditingLabel, editInputRef,
  startEditItem, confirmEditItem, cancelEditItem,
  toggleItemVisibility,
}: {
  id: string; item: MenuItem; sIdx: number; iIdx: number; isMaster: boolean;
  editingItem: { sectionIdx: number; itemIdx: number } | null;
  editingLabel: string; setEditingLabel: (v: string) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  startEditItem: (s: number, i: number) => void;
  confirmEditItem: () => void; cancelEditItem: () => void;
  toggleItemVisibility: (s: number, i: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: "item", sIdx, iIdx },
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const IconComp = ICON_MAP[item.label] || ICON_MAP[item.originalLabel || ""] || PATH_ICON_MAP[item.path] || LayoutDashboard;
  const isEditing = editingItem?.sectionIdx === sIdx && editingItem?.itemIdx === iIdx;

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors ${
      item.visible !== false ? "bg-gray-50 hover:bg-gray-100" : "bg-gray-50/50 opacity-50"
    }`}>
      <div className="flex items-center gap-3">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-gray-200 touch-none">
          <GripVertical className="h-3.5 w-3.5 text-gray-300" />
        </div>
        <IconComp className={`h-4 w-4 ${item.visible !== false ? "text-gray-600" : "text-gray-400"}`} />
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              ref={editInputRef}
              className="text-sm font-medium text-gray-800 bg-white border border-blue-300 rounded px-2 py-0.5 w-40 focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={editingLabel}
              onChange={(e) => setEditingLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmEditItem(); if (e.key === "Escape") cancelEditItem(); }}
            />
            <button onClick={confirmEditItem} className="p-0.5 rounded hover:bg-green-100 text-green-600"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={cancelEditItem} className="p-0.5 rounded hover:bg-red-100 text-red-600"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <span
            className={`text-sm ${item.visible !== false ? "text-gray-800 font-medium" : "text-gray-400 line-through"} ${isMaster ? "cursor-pointer hover:text-blue-600" : ""}`}
            onDoubleClick={() => startEditItem(sIdx, iIdx)}
            title={isMaster ? "Duplo clique para renomear" : ""}
          >
            {item.label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        {isMaster && !isEditing && (
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
            onClick={() => startEditItem(sIdx, iIdx)} title="Renomear">
            <Pencil className="h-3 w-3 text-gray-400 hover:text-blue-500" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
          onClick={() => toggleItemVisibility(sIdx, iIdx)}
          title={item.visible ? "Ocultar" : "Mostrar"}>
          {item.visible ? <Eye className="h-3.5 w-3.5 text-green-600" /> : <EyeOff className="h-3.5 w-3.5 text-gray-400" />}
        </Button>
      </div>
    </div>
  );
}

// ======================== DROPPABLE SECTION ========================
function DroppableSection({
  id, section, sIdx, isExpanded, isMaster, isDraggingItem,
  toggleSection,
  editingSection, editingSectionTitle, setEditingSectionTitle, editInputRef,
  startEditSection, confirmEditSection, cancelEditSection,
  editingItem, editingLabel, setEditingLabel,
  startEditItem, confirmEditItem, cancelEditItem,
  toggleItemVisibility, isOverThis,
}: {
  id: string; section: MenuSection; sIdx: number; isExpanded: boolean; isMaster: boolean;
  isDraggingItem: boolean;
  toggleSection: (title: string) => void;
  editingSection: number | null; editingSectionTitle: string;
  setEditingSectionTitle: (v: string) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  startEditSection: (s: number) => void;
  confirmEditSection: () => void; cancelEditSection: () => void;
  editingItem: { sectionIdx: number; itemIdx: number } | null;
  editingLabel: string; setEditingLabel: (v: string) => void;
  startEditItem: (s: number, i: number) => void;
  confirmEditItem: () => void; cancelEditItem: () => void;
  toggleItemVisibility: (s: number, i: number) => void;
  isOverThis: boolean;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${sIdx}`,
    data: { type: "section-drop", sIdx },
  });

  const visibleCount = section.items.filter(i => i.visible).length;
  const itemIds = section.items.map((_, iIdx) => itemId(sIdx, iIdx));
  const showHighlight = isOverThis || isOver;

  return (
    <div className={`border rounded-xl transition-all duration-200 ${
      showHighlight && isDraggingItem
        ? "border-blue-400 bg-blue-50/80 shadow-md ring-2 ring-blue-200"
        : "border-gray-200 bg-white hover:border-gray-300"
    }`}>
      {/* Section Header */}
      <div
        className="flex items-center justify-between py-3 px-4 cursor-pointer select-none"
        onClick={() => toggleSection(section.title)}
      >
        <div className="flex items-center gap-3">
          <div className="p-1 -m-1 rounded hover:bg-gray-100">
            <GripVertical className="h-4 w-4 text-gray-400" />
          </div>
          {editingSection === sIdx ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                ref={editInputRef}
                className="text-sm font-bold uppercase tracking-wider text-gray-800 bg-white border border-blue-300 rounded px-2 py-0.5 w-40 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={editingSectionTitle}
                onChange={(e) => setEditingSectionTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") confirmEditSection(); if (e.key === "Escape") cancelEditSection(); }}
              />
              <button onClick={(e) => { e.stopPropagation(); confirmEditSection(); }} className="p-0.5 rounded hover:bg-green-100 text-green-600"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={(e) => { e.stopPropagation(); cancelEditSection(); }} className="p-0.5 rounded hover:bg-red-100 text-red-600"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <span
              className={`text-sm font-bold uppercase tracking-wider text-gray-600 ${isMaster ? "cursor-pointer hover:text-blue-600" : ""}`}
              onDoubleClick={(e) => { e.stopPropagation(); startEditSection(sIdx); }}
              title={isMaster ? "Duplo clique para renomear" : ""}
            >
              {section.title}
            </span>
          )}
          <span className="text-xs text-gray-400 font-normal">
            {visibleCount}/{section.items.length} visíveis
          </span>
        </div>
        <div className="flex items-center gap-1">
          {showHighlight && isDraggingItem && (
            <span className="text-xs text-blue-600 font-medium mr-2 animate-pulse">Solte aqui</span>
          )}
          {isMaster && editingSection !== sIdx && (
            <button
              onClick={(e) => { e.stopPropagation(); startEditSection(sIdx); }}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500"
              title="Renomear categoria"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {/* Section Items */}
      {isExpanded && (
        <div ref={setDropRef} className="px-4 pb-3 space-y-0.5" style={{ minHeight: isDraggingItem ? 40 : undefined }}>
          {section.items.length === 0 && (
            <div className={`py-6 text-center text-sm rounded-lg border-2 border-dashed transition-all ${
              showHighlight ? "border-blue-400 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"
            }`}>
              {showHighlight ? "Solte o item aqui" : "Categoria vazia — arraste itens para cá"}
            </div>
          )}
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {section.items.map((item, iIdx) => (
              <SortableItem
                key={itemId(sIdx, iIdx)}
                id={itemId(sIdx, iIdx)}
                item={item}
                sIdx={sIdx}
                iIdx={iIdx}
                isMaster={isMaster}
                editingItem={editingItem}
                editingLabel={editingLabel}
                setEditingLabel={setEditingLabel}
                editInputRef={editInputRef}
                startEditItem={startEditItem}
                confirmEditItem={confirmEditItem}
                cancelEditItem={cancelEditItem}
                toggleItemVisibility={toggleItemVisibility}
              />
            ))}
          </SortableContext>
          {/* Drop zone at bottom */}
          {isDraggingItem && section.items.length > 0 && (
            <div className={`py-3 mt-1 text-center text-xs rounded-lg border-2 border-dashed transition-all ${
              showHighlight ? "border-blue-400 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"
            }`}>
              {showHighlight ? "Solte aqui para adicionar" : "Solte aqui"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ======================== MAIN COMPONENT ========================
export default function MenuConfigPanel() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const [menuConfig, setMenuConfig] = useState<MenuSection[]>(DEFAULT_MENU);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<{ sectionIdx: number; itemIdx: number } | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Active drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<{ type: "item"; item: MenuItem } | null>(null);
  const [overSectionIdx, setOverSectionIdx] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const startEditItem = (sectionIdx: number, itemIdx: number) => {
    if (!isMaster) return;
    setEditingItem({ sectionIdx, itemIdx });
    setEditingLabel(menuConfig[sectionIdx].items[itemIdx].label);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const confirmEditItem = () => {
    if (!editingItem || !editingLabel.trim()) { setEditingItem(null); return; }
    setMenuConfig(prev => {
      const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
      arr[editingItem.sectionIdx].items[editingItem.itemIdx].label = editingLabel.trim();
      return arr;
    });
    setHasChanges(true);
    setEditingItem(null);
  };

  const cancelEditItem = () => setEditingItem(null);

  const startEditSection = (sectionIdx: number) => {
    if (!isMaster) return;
    setEditingSection(sectionIdx);
    setEditingSectionTitle(menuConfig[sectionIdx].title);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const confirmEditSection = () => {
    if (editingSection === null || !editingSectionTitle.trim()) { setEditingSection(null); return; }
    setMenuConfig(prev => {
      const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
      arr[editingSection].title = editingSectionTitle.trim();
      return arr;
    });
    setHasChanges(true);
    setEditingSection(null);
  };

  const cancelEditSection = () => setEditingSection(null);

  const configQuery = trpc.menuConfig.get.useQuery();
  const utils = trpc.useUtils();
  const saveMut = trpc.menuConfig.save.useMutation({
    onSuccess: () => { toast.success("Configuração do menu salva!"); setHasChanges(false); configQuery.refetch(); utils.menuConfig.get.invalidate(); },
    onError: (e: any) => toast.error("Erro ao salvar: " + e.message),
  });
  const resetMut = trpc.menuConfig.reset.useMutation({
    onSuccess: () => { setMenuConfig(DEFAULT_MENU); setHasChanges(false); toast.success("Menu restaurado!"); configQuery.refetch(); utils.menuConfig.get.invalidate(); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  useEffect(() => {
    if (configQuery.data) {
      const saved = configQuery.data as MenuSection[];
      const allSavedPaths = new Set(saved.flatMap(s => s.items.map(i => i.path)));
      const merged = saved.map(s => ({ ...s, items: [...s.items] }));
      for (const defSection of DEFAULT_MENU) {
        const existingSection = merged.find(s => s.title === defSection.title);
        for (const defItem of defSection.items) {
          if (!allSavedPaths.has(defItem.path)) {
            if (existingSection) {
              existingSection.items.push({ ...defItem });
            } else {
              merged.push({ title: defSection.title, items: defSection.items.map(i => ({ ...i })) });
              break;
            }
            allSavedPaths.add(defItem.path);
          }
        }
      }
      for (const defSection of DEFAULT_MENU) {
        if (!merged.find(s => s.title === defSection.title)) {
          merged.push({ title: defSection.title, items: defSection.items.map(i => ({ ...i })) });
        }
      }
      setMenuConfig(merged);
    }
  }, [configQuery.data]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  };

  const toggleItemVisibility = useCallback((sectionIdx: number, itemIdx: number) => {
    setMenuConfig(prev => {
      const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
      arr[sectionIdx].items[itemIdx].visible = !arr[sectionIdx].items[itemIdx].visible;
      return arr;
    });
    setHasChanges(true);
  }, []);

  // =================== DND-KIT HANDLERS ===================

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = active.id as string;
    setActiveId(id);

    const parsed = parseItemId(id);
    if (parsed) {
      const item = menuConfig[parsed.sIdx]?.items[parsed.iIdx];
      if (item) {
        setActiveData({ type: "item", item: { ...item } });
        // Auto-expand all sections so user can drop anywhere
        setExpandedSections(new Set(menuConfig.map(s => s.title)));
      }
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) { setOverSectionIdx(null); return; }

    const overId = over.id as string;

    // Check if over a droppable section zone
    if (overId.startsWith("drop-")) {
      const sIdx = parseInt(overId.replace("drop-", ""));
      setOverSectionIdx(sIdx);
      return;
    }

    // Check if over an item
    const parsedOver = parseItemId(overId);
    if (parsedOver) {
      setOverSectionIdx(parsedOver.sIdx);
      return;
    }

    setOverSectionIdx(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveData(null);
    setOverSectionIdx(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    const parsedActive = parseItemId(activeIdStr);
    if (!parsedActive) return; // Only items are draggable for now

    const fromSIdx = parsedActive.sIdx;
    const fromIIdx = parsedActive.iIdx;

    // Dropped on a section drop zone
    if (overIdStr.startsWith("drop-")) {
      const toSIdx = parseInt(overIdStr.replace("drop-", ""));
      if (fromSIdx === toSIdx) return; // Same section, no move needed

      setMenuConfig(prev => {
        const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
        const [movedItem] = arr[fromSIdx].items.splice(fromIIdx, 1);
        arr[toSIdx].items.push(movedItem);
        return arr;
      });
      setHasChanges(true);
      toast.success(`Movido para ${menuConfig[toSIdx].title}`);
      return;
    }

    // Dropped on another item
    const parsedOver = parseItemId(overIdStr);
    if (!parsedOver) return;

    const toSIdx = parsedOver.sIdx;
    const toIIdx = parsedOver.iIdx;

    if (fromSIdx === toSIdx) {
      // Same section: reorder
      if (fromIIdx === toIIdx) return;
      setMenuConfig(prev => {
        const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
        arr[fromSIdx].items = arrayMove(arr[fromSIdx].items, fromIIdx, toIIdx);
        return arr;
      });
      setHasChanges(true);
    } else {
      // Different section: move item
      setMenuConfig(prev => {
        const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
        const [movedItem] = arr[fromSIdx].items.splice(fromIIdx, 1);
        arr[toSIdx].items.splice(toIIdx, 0, movedItem);
        return arr;
      });
      setHasChanges(true);
      toast.success(`Movido para ${menuConfig[toSIdx].title}`);
    }
  };

  const isDraggingItem = activeId !== null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Painel de Controle do Menu</h2>
          <p className="text-sm text-gray-500">
            Arraste e solte para reorganizar. Mova itens entre categorias livremente.{isMaster && " Duplo clique ou clique no lápis para renomear."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2"
            onClick={() => { if (confirm("Restaurar o menu ao padrão original?")) resetMut.mutate(); }}
            disabled={resetMut.isPending}>
            <RotateCcw className="h-4 w-4" /> Restaurar Padrão
          </Button>
          <Button size="sm" className="gap-2"
            onClick={() => saveMut.mutate({ config: menuConfig })}
            disabled={!hasChanges || saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {hasChanges && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          Alterações não salvas. Clique em "Salvar" para aplicar.
        </div>
      )}

      {/* Dica de uso */}
      {!isDraggingItem && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span><strong>Dica:</strong> Segure o ícone <GripVertical className="h-3 w-3 inline" /> e arraste para mover itens. Solte sobre outra categoria para mover entre elas.</span>
        </div>
      )}

      {/* Sections with DndContext */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-2">
          {menuConfig.map((section, sIdx) => {
            const isExpanded = expandedSections.has(section.title);

            return (
              <DroppableSection
                key={section.title + sIdx}
                id={secId(sIdx)}
                section={section}
                sIdx={sIdx}
                isExpanded={isExpanded}
                isMaster={isMaster}
                isDraggingItem={isDraggingItem}
                toggleSection={toggleSection}
                editingSection={editingSection}
                editingSectionTitle={editingSectionTitle}
                setEditingSectionTitle={setEditingSectionTitle}
                editInputRef={editInputRef}
                startEditSection={startEditSection}
                confirmEditSection={confirmEditSection}
                cancelEditSection={cancelEditSection}
                editingItem={editingItem}
                editingLabel={editingLabel}
                setEditingLabel={setEditingLabel}
                startEditItem={startEditItem}
                confirmEditItem={confirmEditItem}
                cancelEditItem={cancelEditItem}
                toggleItemVisibility={toggleItemVisibility}
                isOverThis={overSectionIdx === sIdx}
              />
            );
          })}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeData?.type === "item" && activeData.item && (
            <div className="flex items-center gap-3 py-2.5 px-4 rounded-lg bg-white border-2 border-blue-400 shadow-xl">
              <GripVertical className="h-3.5 w-3.5 text-blue-400" />
              {(() => {
                const IconComp = ICON_MAP[activeData.item.label] || PATH_ICON_MAP[activeData.item.path] || LayoutDashboard;
                return <IconComp className="h-4 w-4 text-blue-600" />;
              })()}
              <span className="text-sm font-medium text-gray-800">{activeData.item.label}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Dragging hint */}
      {isDraggingItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none">
          Arrastando item... Solte sobre outra categoria para mover
        </div>
      )}
    </div>
  );
}
