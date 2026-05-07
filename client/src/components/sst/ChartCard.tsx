import { useState, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Maximize2, Download } from "lucide-react";

export type ChartCardColumn<T = any> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => ReactNode;
  format?: (v: any) => string;
};

export type ChartCardDrillDown<T = any, R = any> = {
  getRows: (row: T) => R[];
  columns: ChartCardColumn<R>[];
  labelKey?: keyof T | ((row: T) => string);
  emptyMessage?: string;
  onRowClick?: (row: R) => void;
};

type Props<T = any> = {
  title: string;
  icon?: ReactNode;
  height?: number;
  fullscreenHeight?: number;
  emptyMessage?: string;
  isEmpty?: boolean;
  renderChart: (h: number) => ReactNode;
  tableData?: T[];
  tableColumns?: ChartCardColumn<T>[];
  description?: string;
  className?: string;
  drillDown?: ChartCardDrillDown<T>;
};

function downloadCSV(filename: string, columns: ChartCardColumn[], rows: any[]) {
  const head = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(";");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const raw = (r as any)[c.key];
          const v = c.format ? c.format(raw) : raw;
          const s = v == null ? "" : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(";"),
    )
    .join("\n");
  const csv = "\ufeff" + head + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ChartCard<T = any>({
  title,
  icon,
  height = 260,
  fullscreenHeight = 520,
  emptyMessage = "Sem dados.",
  isEmpty,
  renderChart,
  tableData,
  tableColumns,
  description,
  className,
  drillDown,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [drillRow, setDrillRow] = useState<T | null>(null);
  const empty = isEmpty ?? (Array.isArray(tableData) && tableData.length === 0);
  const drillRows = drillDown && drillRow ? drillDown.getRows(drillRow) : [];
  const drillLabel = drillDown && drillRow
    ? (typeof drillDown.labelKey === "function"
      ? (drillDown.labelKey as any)(drillRow)
      : (drillRow as any)[drillDown.labelKey ?? (tableColumns?.[0]?.key ?? "")] ?? "")
    : "";

  return (
    <>
      <Card
        className={`${className ?? ""} cursor-pointer transition-shadow hover:shadow-md hover:border-blue-300 group`}
        role="button"
        tabIndex={0}
        title="Clique para ampliar e ver detalhes"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2 min-w-0">
            {icon}
            <span className="truncate">{title}</span>
          </CardTitle>
          <span className="h-7 w-7 p-0 flex-shrink-0 text-gray-400 group-hover:text-blue-600 flex items-center justify-center" title="Expandir gráfico">
            <Maximize2 className="h-4 w-4" />
          </span>
        </CardHeader>
        <CardContent>
          {empty ? (
            <p className="text-sm text-gray-500 py-8 text-center">{emptyMessage}</p>
          ) : (
            <div className="w-full" style={{ height }}>
              {renderChart(height)}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setDrillRow(null); }}>
        <DialogContent resizable={false} className="max-w-none w-screen h-screen sm:w-[98vw] sm:h-[96vh] overflow-hidden flex flex-col bg-white sm:rounded-xl border-0 sm:border p-6">
          <DialogHeader className="flex flex-row items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2 text-lg">
              {icon}
              {title}
            </DialogTitle>
            {tableData && tableColumns && tableData.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-2"
                onClick={() => downloadCSV(title, tableColumns, tableData as any[])}
              >
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            )}
          </DialogHeader>
          {description && <p className="text-xs text-gray-500">{description}</p>}
          <div className="flex-1 overflow-y-auto space-y-4">
            {empty ? (
              <p className="text-sm text-gray-500 py-12 text-center">{emptyMessage}</p>
            ) : (
              <>
                <div className="w-full bg-white" style={{ height: fullscreenHeight }}>
                  {renderChart(fullscreenHeight)}
                </div>
                {tableData && tableColumns && tableData.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-xs uppercase font-semibold text-gray-600 border-b flex justify-between">
                      <span>Dados detalhados {drillDown && <span className="normal-case text-gray-500 font-normal">— clique numa linha para ver os colaboradores</span>}</span>
                      <span>{tableData.length} {tableData.length === 1 ? "registro" : "registros"}</span>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-700 sticky top-0">
                          <tr>
                            {tableColumns.map((c) => (
                              <th
                                key={c.key}
                                className={`px-3 py-2 font-semibold border-b ${
                                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                                }`}
                              >
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(tableData as any[]).map((row, i) => {
                            const isSel = drillDown && drillRow === row;
                            return (
                              <tr
                                key={i}
                                className={`${drillDown ? "cursor-pointer" : ""} ${isSel ? "bg-blue-50" : "hover:bg-gray-50"}`}
                                onClick={() => drillDown && setDrillRow(isSel ? null : row)}
                              >
                                {tableColumns.map((c) => {
                                  const raw = row[c.key];
                                  const content = c.render ? c.render(row) : c.format ? c.format(raw) : raw;
                                  return (
                                    <td
                                      key={c.key}
                                      className={`px-3 py-2 ${
                                        c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                                      }`}
                                    >
                                      {content as ReactNode}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {drillDown && drillRow && (
                  <div className="border-2 border-blue-300 rounded-lg overflow-hidden bg-blue-50/30">
                    <div className="bg-blue-100 px-3 py-2 text-xs uppercase font-semibold text-blue-900 border-b border-blue-200 flex justify-between items-center">
                      <span>Colaboradores em: <strong className="normal-case">{String(drillLabel)}</strong></span>
                      <div className="flex items-center gap-2">
                        <span>{drillRows.length} {drillRows.length === 1 ? "registro" : "registros"}</span>
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setDrillRow(null)}>Fechar</Button>
                      </div>
                    </div>
                    {drillRows.length === 0 ? (
                      <p className="text-sm text-gray-500 py-6 text-center">{drillDown.emptyMessage || "Sem registros."}</p>
                    ) : (
                      <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-sm">
                          <thead className="bg-blue-50 text-blue-900 sticky top-0">
                            <tr>
                              {drillDown.columns.map((c) => (
                                <th key={c.key} className={`px-3 py-2 font-semibold border-b border-blue-200 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>{c.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-100">
                            {drillRows.map((row: any, i: number) => (
                              <tr
                                key={i}
                                className={`${drillDown.onRowClick ? "cursor-pointer" : ""} hover:bg-blue-100/40`}
                                onClick={() => drillDown.onRowClick?.(row)}
                              >
                                {drillDown.columns.map((c) => {
                                  const raw = (row as any)[c.key];
                                  const content = c.render ? c.render(row) : c.format ? c.format(raw) : raw;
                                  return (
                                    <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`}>
                                      {content as ReactNode}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
