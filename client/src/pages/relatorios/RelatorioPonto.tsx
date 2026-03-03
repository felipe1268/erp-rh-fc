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
import { Clock, Search, Users, CheckCircle, XCircle, AlertTriangle, Eye } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function formatHoras(min: number | string | null): string {
  if (!min) return "0:00";
  const m = typeof min === "string" ? parseInt(min) : min;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}:${String(r).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<string, string> = {
  registrado: "bg-green-100 text-green-700",
  escuro: "bg-gray-100 text-gray-600",
  aferido: "bg-blue-100 text-blue-700",
  falta: "bg-red-100 text-red-700",
};

const ORIGEM_COLORS: Record<string, string> = {
  dixi: "bg-blue-100 text-blue-700",
  manual: "bg-yellow-100 text-yellow-700",
  rateado: "bg-purple-100 text-purple-700",
  escuro: "bg-gray-100 text-gray-600",
  aferido: "bg-green-100 text-green-700",
};

export default function RelatorioPonto() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;

  const timecards = trpc.payrollEngine.listarTimecardDaily.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );
  const resumo = trpc.payrollEngine.resumoCompetencia.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );

  const data = (timecards.data || []) as any[];
  const r = resumo.data as any;

  const filtered = useMemo(() => {
    let items = data;
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((t: any) => t.nomeCompleto?.toLowerCase().includes(s) || t.codigoInterno?.toLowerCase().includes(s));
    }
    if (filterStatus !== "todos") {
      items = items.filter((t: any) => t.statusDia === filterStatus);
    }
    return items;
  }, [data, search, filterStatus]);

  // Group by employee
  const grouped = useMemo(() => {
    const map = new Map<number, { nome: string; codigo: string; funcao: string; registros: any[] }>();
    for (const t of filtered) {
      if (!map.has(t.employeeId)) {
        map.set(t.employeeId, { nome: t.nomeCompleto, codigo: t.codigoInterno, funcao: t.funcao, registros: [] });
      }
      map.get(t.employeeId)!.registros.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filtered]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <PrintHeader title={`Relatório de Ponto — ${MESES[mes - 1]}/${ano}`} />

        {/* Header */}
        <div className="flex items-center justify-between print-hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Relatório de Ponto</h1>
              <p className="text-sm text-muted-foreground">Registros diários de ponto por funcionário</p>
            </div>
          </div>
          <PrintActions />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 print-hidden">
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
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="registrado">Registrado</SelectItem>
              <SelectItem value="escuro">No Escuro</SelectItem>
              <SelectItem value="aferido">Aferido</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar funcionário..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        {/* Summary Cards */}
        {r && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 print-hidden">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-700 text-xs font-medium mb-1"><Users className="w-4 h-4" /> Funcionários</div>
              <div className="text-xl font-bold text-blue-700">{r.timecard?.totalFuncionarios || 0}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-700 text-xs font-medium mb-1"><CheckCircle className="w-4 h-4" /> Registros</div>
              <div className="text-xl font-bold text-green-700">{r.timecard?.totalRegistros || 0}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-700 text-xs font-medium mb-1"><XCircle className="w-4 h-4" /> Faltas</div>
              <div className="text-xl font-bold text-red-700">{r.timecard?.totalFaltas || 0}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-700 text-xs font-medium mb-1"><AlertTriangle className="w-4 h-4" /> Atrasos</div>
              <div className="text-xl font-bold text-amber-700">{r.timecard?.totalAtrasos || 0}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-purple-700 text-xs font-medium mb-1"><Eye className="w-4 h-4" /> No Escuro</div>
              <div className="text-xl font-bold text-purple-700">{data.filter((t: any) => t.statusDia === "escuro").length}</div>
            </div>
          </div>
        )}

        {/* Report Table */}
        {grouped.map((emp) => (
          <div key={emp.codigo} className="border rounded-lg overflow-hidden page-break-before">
            <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
              <div>
                <span className="font-bold">{emp.nome}</span>
                <span className="text-sm text-muted-foreground ml-2">{emp.codigo} — {emp.funcao}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {emp.registros.length} registro(s)
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Data</th>
                  <th className="text-left px-3 py-1.5 font-medium">Entrada 1</th>
                  <th className="text-left px-3 py-1.5 font-medium">Saída 1</th>
                  <th className="text-left px-3 py-1.5 font-medium">Entrada 2</th>
                  <th className="text-left px-3 py-1.5 font-medium">Saída 2</th>
                  <th className="text-right px-3 py-1.5 font-medium">Horas</th>
                  <th className="text-right px-3 py-1.5 font-medium">HE</th>
                  <th className="text-center px-3 py-1.5 font-medium">Status</th>
                  <th className="text-center px-3 py-1.5 font-medium">Origem</th>
                </tr>
              </thead>
              <tbody>
                {emp.registros.sort((a: any, b: any) => a.data?.localeCompare(b.data)).map((t: any) => (
                  <tr key={t.id} className={`border-t ${t.isFalta ? "bg-red-50/50" : ""}`}>
                    <td className="px-3 py-1.5">{t.data}</td>
                    <td className="px-3 py-1.5 font-mono">{t.entrada1 || "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{t.saida1 || "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{t.entrada2 || "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{t.saida2 || "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatHoras(t.totalMinutosTrabalhados)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatHoras(t.minutosExtras)}</td>
                    <td className="px-3 py-1.5 text-center">
                      <Badge className={`text-[10px] ${STATUS_COLORS[t.statusDia] || "bg-gray-100 text-gray-600"}`}>
                        {t.statusDia}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Badge className={`text-[10px] ${ORIGEM_COLORS[t.origem_registro] || "bg-gray-100 text-gray-600"}`}>
                        {t.origem_registro || "—"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {timecards.isLoading && <div className="text-center py-12 text-muted-foreground">Carregando registros de ponto...</div>}
        {!timecards.isLoading && grouped.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum registro de ponto encontrado para {MESES[mes - 1]}/{ano}.</p>
          </div>
        )}

        <PrintFooterLGPD />
      </div>
    </DashboardLayout>
  );
}
