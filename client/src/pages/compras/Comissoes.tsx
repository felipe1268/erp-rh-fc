import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingDown, Loader2, DollarSign, Award, BarChart3 } from "lucide-react";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  em_aberto:        { label: "Em Aberto",  cls: "bg-gray-100 text-gray-600" },
  aprovada_diretor: { label: "Aprovada",   cls: "bg-green-100 text-green-700" },
  paga:             { label: "Paga",       cls: "bg-blue-100 text-blue-700" },
};

export default function ComprasComissoes() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const { data: configData } = trpc.purchase.getConfigCompras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data, isLoading } = trpc.purchase.listarComissoes.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: obras } = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });

  const comissoes = data ?? [];
  const pctConfig = Number(configData?.config?.comissaoPercentual ?? 10);
  const totalEconomia = comissoes.reduce((s: number, c: any) => s + Number(c.economiaTotal || 0), 0);
  const totalComissao = comissoes.reduce((s: number, c: any) => s + Number(c.valorComissao || 0), 0);
  const totalPagas = comissoes.filter((c: any) => c.status === "paga").length;
  const totalAberto = comissoes.filter((c: any) => c.status === "em_aberto").length;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const obraMap = Object.fromEntries((obras ?? []).map((o: any) => [String(o.id), o.nome]));

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-100 rounded-lg">
            <Award className="h-6 w-6 text-yellow-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analise de Comissoes</h1>
            <p className="text-sm text-gray-500">
              Percentual configurado: <span className="font-bold text-yellow-700">{pctConfig}%</span> sobre a economia negociada
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <TrendingDown className="h-7 w-7 text-green-600 shrink-0" />
                <div>
                  <p className="text-lg font-bold text-green-700">{fmt(totalEconomia)}</p>
                  <p className="text-xs text-green-600">Economia Gerada</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-7 w-7 text-yellow-600 shrink-0" />
                <div>
                  <p className="text-lg font-bold text-yellow-700">{fmt(totalComissao)}</p>
                  <p className="text-xs text-yellow-600">Comissoes Acumuladas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-7 w-7 text-blue-600 shrink-0" />
                <div>
                  <p className="text-lg font-bold text-blue-700">{totalPagas}</p>
                  <p className="text-xs text-blue-600">Comissoes Pagas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200 bg-gray-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <Award className="h-7 w-7 text-gray-500 shrink-0" />
                <div>
                  <p className="text-lg font-bold text-gray-700">{totalAberto}</p>
                  <p className="text-xs text-gray-500">Aguardando Aprovacao</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : comissoes.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Award className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Nenhuma comissao registrada ainda</p>
                <p className="text-xs mt-1 text-gray-400">As comissoes serao calculadas automaticamente quando houver economia nas compras</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-right">Meta (Orcamento)</TableHead>
                    <TableHead className="text-right">Valor Comprado</TableHead>
                    <TableHead className="text-right">Economia</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead className="text-right">Comissao</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoes.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.compradorNome || "—"}</TableCell>
                      <TableCell>{c.obraNome || obraMap[String(c.obraId)] || "—"}</TableCell>
                      <TableCell className="text-right">{fmt(Number(c.valorMetaTotal || 0))}</TableCell>
                      <TableCell className="text-right">{fmt(Number(c.valorCompradoTotal || 0))}</TableCell>
                      <TableCell className="text-right font-medium text-green-700">{fmt(Number(c.economiaTotal || 0))}</TableCell>
                      <TableCell className="text-center">{Number(c.percentualParticipacao || 0).toFixed(0)}%</TableCell>
                      <TableCell className="text-right font-bold text-yellow-700">{fmt(Number(c.valorComissao || 0))}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={(STATUS_CFG[c.status] || STATUS_CFG.em_aberto).cls}>
                          {(STATUS_CFG[c.status] || STATUS_CFG.em_aberto).label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700">
            <span className="font-bold">Como funciona:</span> A comissao e calculada sobre a economia real — a diferenca entre o orcamento (meta) e o valor efetivamente negociado pelo comprador. O percentual de {pctConfig}% e configuravel pelo usuario master em Configuracoes Gerais, secao Compras.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
