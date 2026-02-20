import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Clock, Upload, FileSpreadsheet, Users, CalendarDays } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function FechamentoPonto() {
  const companiesQ = trpc.companies.list.useQuery();
  const companies = companiesQ.data ?? [];
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const companyId = selectedCompanyId ?? companies[0]?.id ?? 0;

  const now = new Date();
  const [mesAno, setMesAno] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // Registros de ponto serão carregados após upload DIXI
  const records: any[] = [];

  const handleUploadDixi = () => {
    toast("Em breve", { description: "Upload de arquivo DIXI será implementado em breve." });
  };

  // Agrupar registros por funcionário
  const grouped = records.reduce((acc: any, r: any) => {
    const key = r.employeeId;
    if (!acc[key]) acc[key] = { employeeName: r.employeeName || `Func. #${r.employeeId}`, records: [] };
    acc[key].records.push(r);
    return acc;
  }, {} as Record<number, { employeeName: string; records: any[] }>);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fechamento de Ponto</h1>
            <p className="text-muted-foreground text-sm">Controle e fechamento mensal de ponto dos colaboradores</p>
          </div>
          <div className="flex items-center gap-3">
            {companies.length > 1 && (
              <Select value={String(companyId)} onValueChange={v => setSelectedCompanyId(Number(v))}>
                <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {companies.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input
              type="month"
              value={mesAno}
              onChange={e => setMesAno(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <Button onClick={handleUploadDixi} variant="outline">
            <Upload className="h-4 w-4 mr-2" /> Upload DIXI
          </Button>
          <Button variant="outline" onClick={() => toast("Em breve", { description: "Exportação em desenvolvimento." })}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{Object.keys(grouped).length}</p>
                  <p className="text-xs text-muted-foreground">Colaboradores</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{records.length}</p>
                  <p className="text-xs text-muted-foreground">Registros</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg">Nenhum registro de ponto</h3>
              <p className="text-muted-foreground text-sm mt-1">Faça o upload do arquivo DIXI para importar os registros de ponto.</p>
              <Button onClick={handleUploadDixi} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                <Upload className="h-4 w-4 mr-2" /> Upload DIXI
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registros de Ponto - {mesAno}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Colaborador</th>
                      <th className="pb-2 font-medium">Dias Trabalhados</th>
                      <th className="pb-2 font-medium">Total Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(grouped).map(([key, val]: [string, any]) => (
                      <tr key={key} className="border-b last:border-0">
                        <td className="py-2">{val.employeeName}</td>
                        <td className="py-2">{new Set(val.records.map((r: any) => r.date)).size}</td>
                        <td className="py-2">{val.records.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
