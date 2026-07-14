import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Users, HardHat, ShieldCheck, ShieldAlert, ShieldX,
  AlertTriangle, GraduationCap, CheckCircle2, XCircle,
  Search, Building2, PackageCheck,
} from "lucide-react";
import { PersonPhoto } from "@/components/PersonPhoto";

function asoStatusBadge(status: string, validade?: string) {
  if (status === "valido")
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-xs"><ShieldCheck className="w-3 h-3" />ASO OK{validade ? ` até ${validade.slice(0, 10)}` : ""}</Badge>;
  if (status === "vencido")
    return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs"><ShieldX className="w-3 h-3" />ASO Vencido</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 border-slate-200 gap-1 text-xs"><ShieldAlert className="w-3 h-3" />Sem ASO</Badge>;
}

function treinBadge(validos: number, vencidos: number) {
  if (validos === 0 && vencidos === 0)
    return <Badge className="bg-slate-100 text-slate-500 border-slate-200 gap-1 text-xs"><GraduationCap className="w-3 h-3" />Sem trein.</Badge>;
  if (vencidos > 0)
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 text-xs"><GraduationCap className="w-3 h-3" />{validos}✓ {vencidos}✗</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-xs"><GraduationCap className="w-3 h-3" />{validos} trein.</Badge>;
}

function advertBadge(cnt: number) {
  if (cnt === 0)
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-xs"><CheckCircle2 className="w-3 h-3" />Sem adv.</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs"><AlertTriangle className="w-3 h-3" />{cnt} adv.</Badge>;
}

function epiCountBadge(cnt: number) {
  if (cnt === 0)
    return <Badge className="bg-slate-100 text-slate-500 border-slate-200 gap-1 text-xs"><HardHat className="w-3 h-3" />Sem EPI</Badge>;
  return <Badge className="bg-sky-100 text-sky-700 border-sky-200 gap-1 text-xs"><HardHat className="w-3 h-3" />{cnt} EPI</Badge>;
}

type Row = {
  id: number;
  nome: string;
  cargo: string;
  status: string;
  foto_url: string | null;
  dataAdmissao: string | null;
  obra_id: number;
  obra_nome: string;
  aso_validade: string | null;
  aso_resultado: string | null;
  aso_status: "valido" | "vencido" | "sem_aso";
  treinamentos_validos: number;
  treinamentos_vencidos: number;
  num_advertencias: number;
  cargo_cipa: string | null;
  epi_entregas: number;
};

type ObraGroup = {
  obra_id: number;
  obra_nome: string;
  employees: Row[];
  semAso: number;
  asoVencido: number;
  treinVencido: number;
  comAdv: number;
  semEpi: number;
};

export default function GestorSSTPorObra() {
  const { companyId } = useCompany();
  const [search, setSearch] = useState("");
  const [obraFiltro, setObraFiltro] = useState<number | null>(null);

  const { data: rows = [], isLoading } = trpc.scorecard.getGestorSSTPorObra.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId, staleTime: 60_000 },
  );

  const obras = useMemo<ObraGroup[]>(() => {
    const map = new Map<number, ObraGroup>();
    for (const r of rows as Row[]) {
      if (!map.has(r.obra_id)) {
        map.set(r.obra_id, { obra_id: r.obra_id, obra_nome: r.obra_nome, employees: [], semAso: 0, asoVencido: 0, treinVencido: 0, comAdv: 0, semEpi: 0 });
      }
      const g = map.get(r.obra_id)!;
      g.employees.push(r);
      if (r.aso_status === "sem_aso") g.semAso++;
      if (r.aso_status === "vencido") g.asoVencido++;
      if (r.treinamentos_vencidos > 0) g.treinVencido++;
      if (r.num_advertencias > 0) g.comAdv++;
      if (r.epi_entregas === 0) g.semEpi++;
    }
    return Array.from(map.values()).sort((a, b) => a.obra_nome.localeCompare(b.obra_nome));
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return obras
      .filter(g => obraFiltro === null || g.obra_id === obraFiltro)
      .map(g => ({
        ...g,
        employees: s
          ? g.employees.filter(e => e.nome.toLowerCase().includes(s) || (e.cargo || "").toLowerCase().includes(s))
          : g.employees,
      }))
      .filter(g => g.employees.length > 0);
  }, [obras, obraFiltro, search]);

  const totalEmp   = (rows as Row[]).length;
  const totalSemAso   = (rows as Row[]).filter(r => r.aso_status !== "valido").length;
  const totalTreinVenc = (rows as Row[]).filter(r => r.treinamentos_vencidos > 0).length;
  const totalComAdv    = (rows as Row[]).filter(r => r.num_advertencias > 0).length;

  return (
    <DashboardLayout module="sst">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            Gestor SST por Obra
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Status SST de todos os colaboradores ativos, agrupados por obra.</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">Colaboradores</span>
              </div>
              <div className="text-2xl font-bold text-slate-800">{isLoading ? "…" : totalEmp}</div>
              <div className="text-xs text-slate-400">{obras.length} obras ativas</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span className="text-xs text-slate-500">ASO pendente</span>
              </div>
              <div className="text-2xl font-bold text-red-600">{isLoading ? "…" : totalSemAso}</div>
              <div className="text-xs text-slate-400">sem ASO ou vencido</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <GraduationCap className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-500">Trein. vencidos</span>
              </div>
              <div className="text-2xl font-bold text-amber-600">{isLoading ? "…" : totalTreinVenc}</div>
              <div className="text-xs text-slate-400">com ≥1 trein. vencido</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <span className="text-xs text-slate-500">Com advertência</span>
              </div>
              <div className="text-2xl font-bold text-orange-600">{isLoading ? "…" : totalComAdv}</div>
              <div className="text-xs text-slate-400">ocorrências registradas</div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm bg-white">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar colaborador ou cargo…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={obraFiltro ?? ""}
              onChange={e => setObraFiltro(e.target.value === "" ? null : Number(e.target.value))}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[200px]"
            >
              <option value="">Todas as obras</option>
              {obras.map(g => (
                <option key={g.obra_id} value={g.obra_id}>{g.obra_nome}</option>
              ))}
            </select>
          </CardContent>
        </Card>

        {/* Conteúdo */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">Nenhum colaborador encontrado.</div>
        ) : (
          filtered.map(g => (
            <Card key={g.obra_id} className="border-0 shadow-sm bg-white">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  {g.obra_nome}
                  <span className="ml-auto text-xs font-normal text-slate-400">{g.employees.length} colaborador{g.employees.length !== 1 ? "es" : ""}</span>
                </CardTitle>
                {/* Resumo da obra */}
                <div className="flex flex-wrap gap-2 mt-1">
                  {g.semAso > 0 && <Badge className="bg-red-50 text-red-600 border-red-200 text-xs gap-1"><ShieldX className="w-3 h-3" />{g.semAso} sem ASO/vencido</Badge>}
                  {g.treinVencido > 0 && <Badge className="bg-amber-50 text-amber-600 border-amber-200 text-xs gap-1"><GraduationCap className="w-3 h-3" />{g.treinVencido} trein. vencido</Badge>}
                  {g.comAdv > 0 && <Badge className="bg-orange-50 text-orange-600 border-orange-200 text-xs gap-1"><AlertTriangle className="w-3 h-3" />{g.comAdv} com advertência</Badge>}
                  {g.semAso === 0 && g.treinVencido === 0 && g.comAdv === 0 && (
                    <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Tudo em dia</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 pr-4 font-medium text-slate-500 text-xs w-8"></th>
                        <th className="text-left py-2 pr-4 font-medium text-slate-500 text-xs">Colaborador</th>
                        <th className="text-left py-2 pr-4 font-medium text-slate-500 text-xs">Cargo</th>
                        <th className="text-left py-2 pr-4 font-medium text-slate-500 text-xs">ASO</th>
                        <th className="text-left py-2 pr-4 font-medium text-slate-500 text-xs">Treinamentos</th>
                        <th className="text-left py-2 pr-4 font-medium text-slate-500 text-xs">Advertências</th>
                        <th className="text-left py-2 pr-4 font-medium text-slate-500 text-xs">EPI</th>
                        <th className="text-left py-2 font-medium text-slate-500 text-xs">CIPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.employees.map(emp => (
                        <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                          <td className="py-2.5 pr-2">
                            <PersonPhoto
                              src={emp.foto_url}
                              name={emp.nome}
                              size={28}
                              className="rounded-full"
                            />
                          </td>
                          <td className="py-2.5 pr-4">
                            <span className="font-medium text-slate-800 break-words">{emp.nome}</span>
                          </td>
                          <td className="py-2.5 pr-4 text-slate-500 text-xs">{emp.cargo || "—"}</td>
                          <td className="py-2.5 pr-4">{asoStatusBadge(emp.aso_status, emp.aso_validade ?? undefined)}</td>
                          <td className="py-2.5 pr-4">{treinBadge(Number(emp.treinamentos_validos), Number(emp.treinamentos_vencidos))}</td>
                          <td className="py-2.5 pr-4">{advertBadge(Number(emp.num_advertencias))}</td>
                          <td className="py-2.5 pr-4">{epiCountBadge(Number(emp.epi_entregas))}</td>
                          <td className="py-2.5">
                            {emp.cargo_cipa
                              ? <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs">{emp.cargo_cipa}</Badge>
                              : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
