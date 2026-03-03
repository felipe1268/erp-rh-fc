import { useState, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  "Painel": LayoutDashboard, "Empresas": Building2, "Colaboradores": Users,
  "Obras": Landmark, "Setores": Layers, "Funções": Briefcase,
  "Relógios de Ponto": Wifi, "Contas Bancárias": ClipboardList,
  "Fechamento de Ponto": Clock, "Folha de Pagamento": Wallet,
  "Controle de Documentos": FolderOpen, "Vale Alimentação": UtensilsCrossed,
  "Controle de EPIs": HardHat, "Processos Trabalhistas": Gavel,
  "Raio-X do Funcionário": UserSearch, "Todos os Dashboards": BarChart3,
  "Funcionários": Users, "Cartão de Ponto": Clock, "Horas Extras": Clock,
  "EPIs": HardHat, "Jurídico": Gavel, "Usuários e Permissões": Lock,
  "Auditoria do Sistema": FileText, "Configurações": Settings,
  "Avaliação de Desempenho": Star,
  "Solicitação de Hora Extra": Clock,
  "Crachás": CreditCard,
  "Feriados": CalendarDays,
  "Dissídio": TrendingUp,
  "PJ Medições": FileSpreadsheet,
};

const PATH_ICON_MAP: Record<string, any> = {
  "/": LayoutDashboard, "/empresas": Building2, "/colaboradores": Users,
  "/obras": Landmark, "/setores": Layers, "/funcoes": Briefcase,
  "/relogios-ponto": Wifi, "/contas-bancarias": ClipboardList,
  "/fechamento-ponto": Clock, "/folha-pagamento": Wallet,
  "/controle-documentos": FolderOpen, "/vale-alimentacao": UtensilsCrossed,
  "/epis": HardHat, "/processos-trabalhistas": Gavel,
  "/relatorios/raio-x": UserSearch, "/dashboards": BarChart3,
  "/dashboards/funcionarios": Users, "/dashboards/cartao-ponto": Clock,
  "/dashboards/folha-pagamento": Wallet, "/dashboards/horas-extras": Clock,
  "/dashboards/epis": HardHat, "/dashboards/juridico": Gavel,
  "/usuarios": Lock, "/auditoria": FileText, "/configuracoes": Settings,
  "/avaliacao": Star,
  "/solicitacao-he": Clock,
  "/feriados": CalendarDays,
  "/dissidio": TrendingUp,
  "/pj-medicoes": FileSpreadsheet,
};

const DEFAULT_MENU = [
  { title: "Principal", items: [{ label: "Painel", path: "/", visible: true }] },
  { title: "Cadastro", items: [
    { label: "Empresas", path: "/empresas", visible: true },
    { label: "Colaboradores", path: "/colaboradores", visible: true },
    { label: "Obras", path: "/obras", visible: true },
    { label: "Setores", path: "/setores", visible: true },
    { label: "Funções", path: "/funcoes", visible: true },
    { label: "Relógios de Ponto", path: "/relogios-ponto", visible: true },
  ]},
  { title: "Financeiro", items: [{ label: "Contas Bancárias", path: "/contas-bancarias", visible: true }] },
  { title: "Operacional", items: [
    { label: "Fechamento de Ponto", path: "/fechamento-ponto", visible: true },
    { label: "Folha de Pagamento", path: "/folha-pagamento", visible: true },
    { label: "Controle de Documentos", path: "/controle-documentos", visible: true },
    { label: "Vale Alimentação", path: "/vale-alimentacao", visible: true },
    { label: "Controle de EPIs", path: "/epis", visible: true },
    { label: "Solicitação de Hora Extra", path: "/solicitacao-he", visible: true },
    { label: "Crachás", path: "/terceiros/crachas", visible: true },
  ]},
  { title: "Gestão de Pessoas", items: [
    { label: "Aviso Prévio", path: "/aviso-previo", visible: true },
    { label: "Férias", path: "/ferias", visible: true },
    { label: "CIPA", path: "/cipa", visible: true },
    { label: "Contratos PJ", path: "/modulo-pj", visible: true },
    { label: "PJ Medições", path: "/pj-medicoes", visible: true },
  ]},
  { title: "Tabelas e Configurações", items: [
    { label: "Feriados", path: "/feriados", visible: true },
    { label: "Dissídio", path: "/dissidio", visible: true },
  ]},
  { title: "Jurídico", items: [{ label: "Processos Trabalhistas", path: "/processos-trabalhistas", visible: true }] },
  { title: "Relatórios", items: [{ label: "Raio-X do Funcionário", path: "/relatorios/raio-x", visible: true }] },
  { title: "Dashboards", items: [
    { label: "Todos os Dashboards", path: "/dashboards", visible: true },
    { label: "Funcionários", path: "/dashboards/funcionarios", visible: true },
    { label: "Cartão de Ponto", path: "/dashboards/cartao-ponto", visible: true },
    { label: "Folha de Pagamento", path: "/dashboards/folha-pagamento", visible: true },
    { label: "Horas Extras", path: "/dashboards/horas-extras", visible: true },
    { label: "EPIs", path: "/dashboards/epis", visible: true },
    { label: "Jurídico", path: "/dashboards/juridico", visible: true },
  ]},
  { title: "Administração", items: [
    { label: "Usuários e Permissões", path: "/usuarios", visible: true },
    { label: "Auditoria do Sistema", path: "/auditoria", visible: true },
    { label: "Configurações", path: "/configuracoes", visible: true },
  ]},
];

type MenuItem = { label: string; path: string; visible: boolean; originalLabel?: string };
type MenuSection = { title: string; items: MenuItem[] };

// Drag data types
type DragItem = { type: "item"; sectionIdx: number; itemIdx: number };
type DragSection = { type: "section"; sectionIdx: number };
type DragData = DragItem | DragSection;

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

  // ===================== DRAG STATE =====================
  const dragDataRef = useRef<DragData | null>(null);
  const [dragType, setDragType] = useState<"item" | "section" | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    type: "item" | "section" | "section-zone";
    sectionIdx: number;
    itemIdx?: number;
    position: "before" | "after" | "inside";
  } | null>(null);

  const configQuery = trpc.menuConfig.get.useQuery();
  const saveMut = trpc.menuConfig.save.useMutation({
    onSuccess: () => { toast.success("Configuração do menu salva!"); setHasChanges(false); configQuery.refetch(); },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });
  const resetMut = trpc.menuConfig.reset.useMutation({
    onSuccess: () => { setMenuConfig(DEFAULT_MENU); setHasChanges(false); toast.success("Menu restaurado!"); configQuery.refetch(); },
    onError: (e) => toast.error("Erro: " + e.message),
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

  // ===================== DRAG & DROP HANDLERS =====================

  // --- ITEM DRAG ---
  const handleItemDragStart = (e: React.DragEvent, sectionIdx: number, itemIdx: number) => {
    e.stopPropagation();
    const data: DragItem = { type: "item", sectionIdx, itemIdx };
    dragDataRef.current = data;
    setDragType("item");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(data));
    const el = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => el.style.opacity = "0.4");
  };

  const handleItemDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "";
    dragDataRef.current = null;
    setDragType(null);
    setDropTarget(null);
  };

  // --- SECTION DRAG (only from grip handle) ---
  const handleSectionGripDragStart = (e: React.DragEvent, sectionIdx: number) => {
    e.stopPropagation();
    const data: DragSection = { type: "section", sectionIdx };
    dragDataRef.current = data;
    setDragType("section");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(data));
    // Find the section container (parent of the grip)
    const sectionEl = (e.currentTarget as HTMLElement).closest("[data-section-idx]") as HTMLElement;
    if (sectionEl) requestAnimationFrame(() => sectionEl.style.opacity = "0.4");
  };

  const handleSectionDragEnd = (e: React.DragEvent) => {
    // Restore opacity on the section container
    const sectionEl = (e.currentTarget as HTMLElement).closest("[data-section-idx]") as HTMLElement;
    if (sectionEl) sectionEl.style.opacity = "";
    // Also try the current target itself
    (e.currentTarget as HTMLElement).style.opacity = "";
    dragDataRef.current = null;
    setDragType(null);
    setDropTarget(null);
  };

  // Section header drag over (for both section reorder and item-to-section drop)
  const handleSectionHeaderDragOver = (e: React.DragEvent, sectionIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const dd = dragDataRef.current;
    if (!dd) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const midpoint = rect.height / 2;

    if (dd.type === "section") {
      setDropTarget({
        type: "section",
        sectionIdx,
        position: y < midpoint ? "before" : "after",
      });
    } else if (dd.type === "item") {
      // Dropping item onto a section header = move to end of that section
      setDropTarget({
        type: "section-zone",
        sectionIdx,
        position: "inside",
      });
    }
  };

  // Item drag over
  const handleItemDragOver = (e: React.DragEvent, sectionIdx: number, itemIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const dd = dragDataRef.current;
    if (!dd || dd.type !== "item") return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const midpoint = rect.height / 2;

    setDropTarget({
      type: "item",
      sectionIdx,
      itemIdx,
      position: y < midpoint ? "before" : "after",
    });
  };

  // Empty zone drag over (bottom of expanded section)
  const handleZoneDragOver = (e: React.DragEvent, sectionIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget({ type: "section-zone", sectionIdx, position: "inside" });
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dd = dragDataRef.current;
    if (!dd || !dropTarget) {
      dragDataRef.current = null;
      setDragType(null);
      setDropTarget(null);
      return;
    }

    if (dd.type === "section" && dropTarget.type === "section") {
      const fromIdx = dd.sectionIdx;
      let toIdx = dropTarget.sectionIdx;
      if (dropTarget.position === "after") toIdx++;
      if (fromIdx === toIdx || fromIdx + 1 === toIdx) {
        dragDataRef.current = null; setDragType(null); setDropTarget(null); return;
      }
      setMenuConfig(prev => {
        const arr = [...prev];
        const [moved] = arr.splice(fromIdx, 1);
        const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
        arr.splice(insertIdx, 0, moved);
        return arr;
      });
      setHasChanges(true);
    } else if (dd.type === "item") {
      const fromSection = dd.sectionIdx;
      const fromItem = dd.itemIdx;

      if (dropTarget.type === "item" && dropTarget.itemIdx !== undefined) {
        let toSection = dropTarget.sectionIdx;
        let toItem = dropTarget.itemIdx;
        if (dropTarget.position === "after") toItem++;

        if (fromSection === toSection && (fromItem === toItem || fromItem + 1 === toItem)) {
          dragDataRef.current = null; setDragType(null); setDropTarget(null); return;
        }

        setMenuConfig(prev => {
          const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
          const [item] = arr[fromSection].items.splice(fromItem, 1);
          const adjustedToItem = fromSection === toSection && fromItem < toItem ? toItem - 1 : toItem;
          arr[toSection].items.splice(adjustedToItem, 0, item);
          return arr;
        });
        setHasChanges(true);
      } else if (dropTarget.type === "section-zone") {
        const toSection = dropTarget.sectionIdx;

        setMenuConfig(prev => {
          const arr = prev.map(s => ({ ...s, items: [...s.items.map(i => ({ ...i }))] }));
          const [item] = arr[fromSection].items.splice(fromItem, 1);
          arr[toSection].items.push(item);
          return arr;
        });
        setHasChanges(true);
        // Auto-expand the target section
        setExpandedSections(prev => {
          const next = new Set(prev);
          next.add(menuConfig[toSection].title);
          return next;
        });
      }
    }

    dragDataRef.current = null;
    setDragType(null);
    setDropTarget(null);
  };

  const isDropTargetSection = (sIdx: number, pos: "before" | "after") =>
    dropTarget?.type === "section" && dropTarget.sectionIdx === sIdx && dropTarget.position === pos;

  const isDropTargetSectionZone = (sIdx: number) =>
    dropTarget?.type === "section-zone" && dropTarget.sectionIdx === sIdx;

  const isDropTargetItem = (sIdx: number, iIdx: number, pos: "before" | "after") =>
    dropTarget?.type === "item" && dropTarget.sectionIdx === sIdx && dropTarget.itemIdx === iIdx && dropTarget.position === pos;

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
      {!dragType && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span><strong>Dica:</strong> Segure o ícone <GripVertical className="h-3 w-3 inline" /> e arraste para mover categorias ou itens. Solte sobre outra categoria para mover entre elas.</span>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-2" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        {menuConfig.map((section, sIdx) => {
          const isExpanded = expandedSections.has(section.title);
          const visibleCount = section.items.filter(i => i.visible).length;
          const isDraggingSection = dragType === "section";
          const isDraggingItem = dragType === "item";
          const isSectionDropZone = isDropTargetSectionZone(sIdx);
          const isSectionBeingDragged = isDraggingSection && dragDataRef.current?.type === "section" && dragDataRef.current.sectionIdx === sIdx;

          return (
            <div key={section.title + sIdx}>
              {/* Drop indicator BEFORE section */}
              {isDropTargetSection(sIdx, "before") && (
                <div className="h-1 bg-blue-500 rounded-full mx-2 mb-1 transition-all" />
              )}

              <div
                data-section-idx={sIdx}
                className={`border rounded-xl transition-all duration-200 ${
                  isSectionDropZone
                    ? "border-blue-400 bg-blue-50/80 shadow-md ring-2 ring-blue-200"
                    : isSectionBeingDragged
                    ? "opacity-40"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                {/* Section Header */}
                <div
                  className="flex items-center justify-between py-3 px-4 cursor-pointer select-none"
                  onClick={() => { if (!isDraggingItem && !isDraggingSection) toggleSection(section.title); }}
                  onDragOver={(e) => handleSectionHeaderDragOver(e, sIdx)}
                  onDrop={(e) => { e.stopPropagation(); handleDrop(e); }}
                >
                  <div className="flex items-center gap-3">
                    {/* Section grip handle - ONLY this is draggable for sections */}
                    <div
                      className="cursor-grab active:cursor-grabbing p-1 -m-1 rounded hover:bg-gray-100"
                      draggable={true}
                      onDragStart={(e) => handleSectionGripDragStart(e, sIdx)}
                      onDragEnd={handleSectionDragEnd}
                      onClick={(e) => e.stopPropagation()}
                    >
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
                        <button onClick={confirmEditSection} className="p-0.5 rounded hover:bg-green-100 text-green-600"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={cancelEditSection} className="p-0.5 rounded hover:bg-red-100 text-red-600"><X className="h-3.5 w-3.5" /></button>
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
                    {isSectionDropZone && isDraggingItem && (
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
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Section Items */}
                {isExpanded && (
                  <div className="px-4 pb-3 space-y-0.5">
                    {section.items.length === 0 && (
                      <div
                        className={`py-6 text-center text-sm rounded-lg border-2 border-dashed transition-all ${
                          isSectionDropZone ? "border-blue-400 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"
                        }`}
                        onDragOver={(e) => handleZoneDragOver(e, sIdx)}
                        onDrop={(e) => { e.stopPropagation(); handleDrop(e); }}
                      >
                        {isSectionDropZone ? "Solte o item aqui" : "Categoria vazia — arraste itens para cá"}
                      </div>
                    )}
                    {section.items.map((item, iIdx) => {
                      const IconComp = ICON_MAP[item.label] || ICON_MAP[item.originalLabel || ""] || PATH_ICON_MAP[item.path] || LayoutDashboard;
                      const isDraggingThis = isDraggingItem && dragDataRef.current?.type === "item" && dragDataRef.current.sectionIdx === sIdx && dragDataRef.current.itemIdx === iIdx;

                      return (
                        <div key={item.path + iIdx}>
                          {/* Drop indicator BEFORE item */}
                          {isDropTargetItem(sIdx, iIdx, "before") && (
                            <div className="h-0.5 bg-blue-500 rounded-full mx-6 transition-all" />
                          )}

                          <div
                            className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition-all duration-150 ${
                              isDraggingThis
                                ? "opacity-30 scale-95"
                                : item.visible !== false
                                ? "bg-gray-50 hover:bg-gray-100"
                                : "bg-gray-50/50 opacity-50"
                            }`}
                            draggable={true}
                            onDragStart={(e) => handleItemDragStart(e, sIdx, iIdx)}
                            onDragEnd={handleItemDragEnd}
                            onDragOver={(e) => handleItemDragOver(e, sIdx, iIdx)}
                            onDrop={(e) => { e.stopPropagation(); handleDrop(e); }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-gray-200">
                                <GripVertical className="h-3.5 w-3.5 text-gray-300" />
                              </div>
                              <IconComp className={`h-4 w-4 ${item.visible !== false ? "text-gray-600" : "text-gray-400"}`} />
                              {editingItem?.sectionIdx === sIdx && editingItem?.itemIdx === iIdx ? (
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
                                  onDoubleClick={(e) => { e.stopPropagation(); startEditItem(sIdx, iIdx); }}
                                  title={isMaster ? "Duplo clique para renomear" : ""}
                                >
                                  {item.label}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5">
                              {isMaster && !(editingItem?.sectionIdx === sIdx && editingItem?.itemIdx === iIdx) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 flex-shrink-0"
                                  onClick={(e) => { e.stopPropagation(); startEditItem(sIdx, iIdx); }}
                                  title="Renomear"
                                >
                                  <Pencil className="h-3 w-3 text-gray-400 hover:text-blue-500" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 flex-shrink-0"
                                onClick={(e) => { e.stopPropagation(); toggleItemVisibility(sIdx, iIdx); }}
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

                          {/* Drop indicator AFTER item */}
                          {isDropTargetItem(sIdx, iIdx, "after") && (
                            <div className="h-0.5 bg-blue-500 rounded-full mx-6 transition-all" />
                          )}
                        </div>
                      );
                    })}

                    {/* Empty drop zone at bottom of section when dragging items */}
                    {isDraggingItem && section.items.length > 0 && (
                      <div
                        className={`py-3 mt-1 text-center text-xs rounded-lg border-2 border-dashed transition-all ${
                          isSectionDropZone ? "border-blue-400 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"
                        }`}
                        onDragOver={(e) => handleZoneDragOver(e, sIdx)}
                        onDrop={(e) => { e.stopPropagation(); handleDrop(e); }}
                      >
                        {isSectionDropZone ? "Solte aqui para adicionar" : "Solte aqui"}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Drop indicator AFTER section */}
              {isDropTargetSection(sIdx, "after") && (
                <div className="h-1 bg-blue-500 rounded-full mx-2 mt-1 transition-all" />
              )}
            </div>
          );
        })}
      </div>

      {/* Dragging overlay hint */}
      {dragType && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none animate-in fade-in">
          {dragType === "section" ? "Arrastando categoria..." : "Arrastando item... Solte sobre outra categoria para mover"}
        </div>
      )}
    </div>
  );
}
