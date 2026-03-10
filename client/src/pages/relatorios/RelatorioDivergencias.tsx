import DashboardLayout from "@/components/DashboardLayout";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Search, CheckCircle, XCircle, Clock, FileWarning } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  batida_impar: { label: "Batida Ímpar", color: "bg-red-100 text-red-700" },
  sobreposicao_horario: { label: "Sobreposição", color: "bg-purple-100 text-purple-700" },
  entrada_faltando: { label: "Entrada Faltando", color: "bg-amber-100 text-amber-700" },
  saida_faltando: { label: "Saída Faltando", color: "bg-orange-100 text-orange-700" },
  falta: { label: "Falta", color: "bg-red-100 text-red-700" },
  atraso: { label: "Atraso", color: "bg-yellow-100 text-yellow-700" },
  saida_antecipada: { label: "Saída Antecipada", color: "bg-blue-100 text-blue-700" },
};

export default function RelatorioDivergencias() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;

  const inconsistencias = trpc.payrollEngine.listarInconsistencias.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const divergencias = trpc.payrollEngine.relatorioDivergencias.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const resumoIncon = trpc.payrollEngine.resumoInconsistencias.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const incon = (inconsistencias.data || []) as any[];
  const diverg = (divergencias.data || []) as any[];
  const ri = resumoIncon.data as any;

  // Merge inconsistencies + adjustments into one list
  const allItems = useMemo(() => {
    const items: any[] = [];
    for (const i of incon) {
      items.push({
        ...i,
        source: "inconsistencia",
        tipoLabel: TIPO_LABELS[i.inconsistencia_tipo]?.label || i.inconsistencia_tipo,
        tipoColor: TIPO_LABELS[i.inconsistencia_tipo]?.color || "bg-gray-100 text-gray-600",
        resolvida: i.inconsistencia_resolvida === 1,
      });
    }
    for (const d of diverg) {
      items.push({
        ...d,
        source: "ajuste",
        tipoLabel: d.tipo || "Ajuste",
        tipoColor: "bg-blue-100 text-blue-700",
        resolvida: true,
      });
    }
    return items;
  }, [incon, diverg]);

  const filtered = useMemo(() => {
    let items = allItems;
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((i: any) => i.nomeCompleto?.toLowerCase().includes(s) || i.codigoInterno?.toLowerCase().includes(s));
    }
    if (filterTipo !== "todos") {
      items = items.filter((i: any) => i.inconsistencia_tipo === filterTipo || i.tipo === filterTipo);
    }
    if (filterStatus === "pendente") {
      items = items.filter((i: any) => !i.resolvida);
    } else if (filterStatus === "resolvida") {
      items = items.filter((i: any) => i.resolvida);
    }
    return items.sort((a: any, b: any) => (a.data || "").localeCompare(b.data || ""));
  }, [allItems, search, filterTipo, filterStatus]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <PrintHeader title={`Relatório de Divergências — ${MESES[mes - 1]}/${ano}`} />

        {/* Header */}
        <div className="flex items-center justify-between print-hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Relatório de Divergências</h1>
              <p className="text-sm text-muted-foreground">Inconsistências de ponto e ajustes realizados</p>
            </div>
          </div>
          <PrintActions />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap print-hidden">
          <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Tipos</SelectItem>
              <SelectItem value="batida_impar">Batida Ímpar</SelectItem>
              <SelectItem value="sobreposicao_horario">Sobreposição</SelectItem>
              <SelectItem value="entrada_faltando">Entrada Faltando</SelectItem>
              <SelectItem value="saida_faltando">Saída Faltando</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="resolvida">Resolvidas</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar funcionário..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        {/* Summary */}
        {ri && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-700 text-xs font-medium mb-1"><FileWarning className="w-4 h-4" /> Total</div>
              <div className="text-xl font-bold text-amber-700">{Number(ri.pendentes || 0) + Number(ri.resolvidas || 0)}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-700 text-xs font-medium mb-1"><XCircle className="w-4 h-4" /> Pendentes</div>
              <div className="text-xl font-bold text-red-700">{Number(ri.pendentes) || 0}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-700 text-xs font-medium mb-1"><CheckCircle className="w-4 h-4" /> Resolvidas</div>
              <div className="text-xl font-bold text-green-700">{Number(ri.resolvidas) || 0}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-purple-700 text-xs font-medium mb-1"><Clock className="w-4 h-4" /> Ajustes</div>
              <div className="text-xl font-bold text-purple-700">{diverg.length}</div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Funcionário</th>
                <th className="text-left px-3 py-2 font-medium">Data</th>
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-left px-3 py-2 font-medium">Detalhes</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Resolução</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any, idx: number) => (
                <tr key={`${item.source}-${item.id || idx}`} className="border-t hover:bg-gray-50/50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.nomeCompleto}</div>
                    <div className="text-xs text-muted-foreground">{item.codigoInterno}</div>
                  </td>
                  <td className="px-3 py-2">{item.data}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-xs ${item.tipoColor}`}>{item.tipoLabel}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {item.source === "inconsistencia" ? (
                      <span className="font-mono">
                        {item.entrada1 || "—"}/{item.saida1 || "—"}/{item.entrada2 || "—"}/{item.saida2 || "—"}
                        {item.num_batidas != null && <span className="ml-1">({item.num_batidas} bat.)</span>}
                      </span>
                    ) : (
                      <span>{item.descricao || item.motivo || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.resolvida ? (
                      <Badge className="bg-green-100 text-green-700 text-xs">Resolvida</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 text-xs">Pendente</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {item.resolucao_tipo && <Badge variant="outline" className="text-xs">{item.resolucao_tipo}</Badge>}
                    {item.resolucao_obs && <div className="text-muted-foreground mt-0.5">{item.resolucao_obs}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {inconsistencias.isLoading && <div className="text-center py-12 text-muted-foreground">Carregando divergências...</div>}
        {!inconsistencias.isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma divergência encontrada para {MESES[mes - 1]}/{ano}.</p>
          </div>
        )}

        <PrintFooterLGPD />
      </div>
    </DashboardLayout>
  );
}
