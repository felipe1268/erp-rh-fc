import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Clock, Calendar, User, HardHat, Search, Bell, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { fmtNum } from "@/lib/formatters";

export default function EpiValidade() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const [diasAntecedencia, setDiasAntecedencia] = useState(30);
  const [search, setSearch] = useState("");

  const vencimentoQ = trpc.epiAvancado.episProximosVencimento.useQuery(
    { companyId, diasAntecedencia },
    { enabled: !!companyId }
  );

  const items = vencimentoQ.data ?? [];
  const vencidos = items.filter((i: any) => i.vencido);
  const proximosVencer = items.filter((i: any) => !i.vencido);

  const filtered = items.filter((i: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (i.nomeEpi || "").toLowerCase().includes(s) || (i.nomeFunc || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1B3A5C] flex items-center gap-2">
            <Clock className="h-5 w-5" /> Controle de Validade de EPIs
          </h2>
          <p className="text-sm text-muted-foreground">EPIs próximos do vencimento ou já vencidos</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Antecedência:</span>
          <select className="border rounded px-2 py-1 text-sm" value={diasAntecedencia}
            onChange={e => setDiasAntecedencia(parseInt(e.target.value))}>
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-3 text-center">
            <ShieldAlert className="h-6 w-6 text-red-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-700">{fmtNum(vencidos.length)}</p>
            <p className="text-xs text-red-600">Vencidos</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-amber-700">{fmtNum(proximosVencer.length)}</p>
            <p className="text-xs text-amber-600">Próximos a vencer</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-3 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-700">{items.length === 0 ? "OK" : items.length}</p>
            <p className="text-xs text-green-600">Total monitorado</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por EPI ou funcionário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {/* List */}
      {vencimentoQ.isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
            <p className="font-semibold text-green-700">Nenhum EPI próximo do vencimento!</p>
            <p className="text-sm text-muted-foreground mt-1">Todos os EPIs estão dentro da validade.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item: any) => (
            <Card key={item.id} className={`overflow-hidden ${item.vencido ? "border-red-300 bg-red-50/30" : "border-amber-200 bg-amber-50/20"}`}>
              <div className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${item.vencido ? "bg-red-100" : "bg-amber-100"}`}>
                    {item.vencido ? <ShieldAlert className="h-5 w-5 text-red-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm truncate">{item.nomeEpi}</h4>
                      {item.caEpi && <Badge variant="outline" className="text-[10px]">CA {item.caEpi}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {item.nomeFunc}</span>
                      {item.funcaoFunc && <span>{item.funcaoFunc}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Entrega: {item.dataEntrega ? new Date(item.dataEntrega + "T12:00:00").toLocaleDateString("pt-BR") : "N/A"}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Validade: {item.dataValidade ? new Date(item.dataValidade + "T12:00:00").toLocaleDateString("pt-BR") : "N/A"}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {item.vencido ? (
                    <Badge variant="destructive" className="text-xs">
                      <ShieldAlert className="h-3 w-3 mr-1" /> VENCIDO
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-xs">
                      <Bell className="h-3 w-3 mr-1" /> {item.diasRestantes}d restantes
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
