import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Wallet, Upload, FileSpreadsheet, CalendarDays, DollarSign, CreditCard } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function FolhaPagamento() {
  const companiesQ = trpc.companies.list.useQuery();
  const companies = companiesQ.data ?? [];
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const companyId = selectedCompanyId ?? companies[0]?.id ?? 0;

  const now = new Date();
  const [mesAno, setMesAno] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // Folha de pagamento será carregada após importação
  const payrolls: any[] = [];

  const vales = payrolls.filter((p: any) => p.tipo === "vale" || p.tipo === "adiantamento");
  const pagamentos = payrolls.filter((p: any) => p.tipo === "pagamento" || p.tipo === "salario" || !p.tipo);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Folha de Pagamento</h1>
            <p className="text-muted-foreground text-sm">Gestão de vales, adiantamentos e pagamentos</p>
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
          <Button variant="outline" onClick={() => toast("Em breve", { description: "Upload de folha em desenvolvimento." })}>
            <Upload className="h-4 w-4 mr-2" /> Importar Folha
          </Button>
          <Button variant="outline" onClick={() => toast("Em breve", { description: "Exportação em desenvolvimento." })}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{vales.length}</p>
                  <p className="text-xs text-muted-foreground">Vales / Adiantamentos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pagamentos.length}</p>
                  <p className="text-xs text-muted-foreground">Pagamentos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{payrolls.length}</p>
                  <p className="text-xs text-muted-foreground">Total Registros</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="vale" className="w-full">
          <TabsList>
            <TabsTrigger value="vale">Vale / Adiantamento</TabsTrigger>
            <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
          </TabsList>

          <TabsContent value="vale">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vales e Adiantamentos</CardTitle>
              </CardHeader>
              <CardContent>
                {vales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <CreditCard className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhum vale ou adiantamento registrado para este período.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-medium">Colaborador</th>
                          <th className="pb-2 font-medium">Valor</th>
                          <th className="pb-2 font-medium">Data</th>
                          <th className="pb-2 font-medium">Tipo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vales.map((v: any) => (
                          <tr key={v.id} className="border-b last:border-0">
                            <td className="py-2">{v.employeeName || `#${v.employeeId}`}</td>
                            <td className="py-2">R$ {v.valor || v.amount || "-"}</td>
                            <td className="py-2">{v.data || v.date || "-"}</td>
                            <td className="py-2">{v.tipo || "Vale"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pagamento">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pagamentos</CardTitle>
              </CardHeader>
              <CardContent>
                {pagamentos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <DollarSign className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhum pagamento registrado para este período.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-medium">Colaborador</th>
                          <th className="pb-2 font-medium">Salário Base</th>
                          <th className="pb-2 font-medium">Descontos</th>
                          <th className="pb-2 font-medium">Líquido</th>
                          <th className="pb-2 font-medium">Mês Ref.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagamentos.map((p: any) => (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="py-2">{p.employeeName || `#${p.employeeId}`}</td>
                            <td className="py-2">R$ {p.salarioBase || p.amount || "-"}</td>
                            <td className="py-2">R$ {p.descontos || "-"}</td>
                            <td className="py-2 font-medium">R$ {p.liquido || p.amount || "-"}</td>
                            <td className="py-2">{p.mesReferencia || p.month || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
