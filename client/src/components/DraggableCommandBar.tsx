import React, { useState, useRef } from "react";
import { GripVertical } from "lucide-react";

export interface CommandBarItem {
  id: string;
  node: React.ReactNode;
}

interface DraggableCommandBarProps {
  barId: string;
  items: CommandBarItem[];
  className?: string;
}

export function DraggableCommandBar({ barId, items, className }: DraggableCommandBarProps) {
  const storageKey = `cmdbar-${barId}`;

  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]") as string[];
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return items.map(i => i.id);
  });

  const dragging = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const orderedItems = (() => {
    const allIds = items.map(i => i.id);
    const savedIds = order.filter(id => allIds.includes(id));
    const newIds = allIds.filter(id => !savedIds.includes(id));
    const finalOrder = [...savedIds, ...newIds];
    return finalOrder.map(id => items.find(i => i.id === id)).filter(Boolean) as CommandBarItem[];
  })();

  function handleDragStart(id: string) {
    dragging.current = id;
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOver(id);
  }

  function handleDrop(toId: string) {
    const fromId = dragging.current;
    if (!fromId || fromId === toId) { dragging.current = null; setDragOver(null); return; }

    const currentOrder = orderedItems.map(i => i.id);
    const fromIdx = currentOrder.indexOf(fromId);
    const toIdx = currentOrder.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) { dragging.current = null; setDragOver(null); return; }

    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, fromId);

    setOrder(newOrder);
    localStorage.setItem(storageKey, JSON.stringify(newOrder));
    dragging.current = null;
    setDragOver(null);
  }

  function handleDragEnd() {
    dragging.current = null;
    setDragOver(null);
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ""}`}>
      {orderedItems.map(item => (
        <div
          key={item.id}
          draggable
          onDragStart={() => handleDragStart(item.id)}
          onDragOver={e => handleDragOver(e, item.id)}
          onDrop={() => handleDrop(item.id)}
          onDragEnd={handleDragEnd}
          title="Arraste para reordenar"
          className={`group relative flex items-center transition-all select-none ${
            dragOver === item.id
              ? "ring-2 ring-primary/40 rounded-md scale-95 opacity-60"
              : dragging.current === item.id
              ? "opacity-40"
              : ""
          }`}
          style={{ cursor: "grab" }}
        >
          <GripVertical className="absolute -left-4 h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          {item.node}
        </div>
      ))}
    </div>
  );
}
