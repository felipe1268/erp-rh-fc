import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Search, Package, Wrench, TrendingUp } from "lucide-react";
import { Loader2 } from "lucide-react";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function n(v: any) { return parseFloat(v || "0"); }

export default function BibliotecaOrcamento() {
  const { user } = useAuth();
  const companyId = (user as any)?.companyId ?? 0;
  const [search, setSearch] = useState("");

  const defaultTab = typeof window !== "undefined" && window.location.pathname.includes("insumos")
    ? "insumos"
    : "composicoes";

  const { data: composicoes = [], isLoading: loadComp } =
    trpc.orcamento.listarComposicoesCatalogo.useQuery({ companyId }, { enabled: companyId > 0 });

  const { data: insumos = [], isLoading: loadIns } =
    trpc.orcamento.listarInsumosCatalogo.useQuery({ companyId }, { enabled: companyId > 0 });

  const q = search.toLowerCase();

  const filtComp = composicoes.filter((c: any) =>
    !q || c.descricao?.toLowerCase().includes(q) || c.codigo?.toLowerCase().includes(q) || c.tipo?.toLowerCase().includes(q)
  );

  const filtIns = insumos.filter((i: any) =>
    !q || i.descricao?.toLowerCase().includes(q) || i.codigo?.toLowerCase().includes(q) || i.tipo?.toLowerCase().includes(q)
  );

  return (
    <DashboardLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-amber-100">
            <BookOpen className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Biblioteca de Composições e Insumos</h1>
            <p className="text-sm text-muted-foreground">
              Catálogo central da empresa — alimentado pelos orçamentos importados com aprovação do usuário.
            </p>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="py-4 flex items-center gap-4">
              <div className="p-2 rounded-full bg-blue-100">
                <Wrench className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Composições cadastradas</p>
                <p className="text-2xl font-bold text-blue-700">{composicoes.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-4">
              <div className="p-2 rounded-full bg-emerald-100">
                <Package className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Insumos cadastrados</p>
                <p className="text-2xl font-bold text-emerald-700">{insumos.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Busca */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por descrição, código ou tipo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="composicoes">
              Composições {composicoes.length > 0 && <Badge variant="secondary" className="ml-1">{filtComp.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="insumos">
              Insumos {insumos.length > 0 && <Badge variant="secondary" className="ml-1">{filtIns.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── ABA COMPOSIÇÕES ── */}
          <TabsContent value="composicoes" className="mt-4">
            {loadComp ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filtComp.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{search ? "Nenhuma composição encontrada." : "Nenhuma composição na biblioteca ainda."}</p>
                <p className="text-xs mt-1">Acesse um orçamento e use o botão "Enviar para Biblioteca".</p>
              </div>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-slate-50 text-muted-foreground">
                        <th className="text-left px-4 py-2">Código</th>
                        <th className="text-left px-3 py-2 min-w-[280px]">Descrição</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                        <th className="text-center px-3 py-2">Un</th>
                        <th className="text-right px-3 py-2 text-blue-600">Custo Mat</th>
                        <th className="text-right px-3 py-2 text-orange-500">Custo MO</th>
                        <th className="text-right px-3 py-2 font-semibold">Total</th>
                        <th className="text-center px-3 py-2">
                          <TrendingUp className="h-3 w-3 inline" /> Orçamentos
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtComp.map((c: any) => (
                        <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 font-mono text-[10px] text-slate-500">{c.codigo || "—"}</td>
                          <td className="px-3 py-2">{c.descricao}</td>
                          <td className="px-3 py-2">
                            {c.tipo && <Badge variant="outline" className="text-[10px]">{c.tipo}</Badge>}
                          </td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{c.unidade || "—"}</td>
                          <td className="px-3 py-2 text-right text-blue-600 tabular-nums">{formatBRL(n(c.custoUnitMat))}</td>
                          <td className="px-3 py-2 text-right text-orange-500 tabular-nums">{formatBRL(n(c.custoUnitMdo))}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatBRL(n(c.custoUnitTotal))}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex items-center justify-center w-7 h-5 rounded-full bg-slate-100 text-slate-600 font-medium text-[10px]">
                              {c.totalOrcamentos}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ── ABA INSUMOS ── */}
          <TabsContent value="insumos" className="mt-4">
            {loadIns ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filtIns.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{search ? "Nenhum insumo encontrado." : "Nenhum insumo na biblioteca ainda."}</p>
                <p className="text-xs mt-1">Acesse um orçamento e use o botão "Enviar para Biblioteca".</p>
              </div>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-slate-50 text-muted-foreground">
                        <th className="text-left px-4 py-2">Código</th>
                        <th className="text-left px-3 py-2 min-w-[280px]">Descrição</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                        <th className="text-center px-3 py-2">Un</th>
                        <th className="text-right px-3 py-2">Preço Médio</th>
                        <th className="text-right px-3 py-2 text-emerald-600">Mín</th>
                        <th className="text-right px-3 py-2 text-red-500">Máx</th>
                        <th className="text-center px-3 py-2">
                          <TrendingUp className="h-3 w-3 inline" /> Orçamentos
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtIns.map((i: any) => (
                        <tr key={i.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 font-mono text-[10px] text-slate-500">{i.codigo || "—"}</td>
                          <td className="px-3 py-2">{i.descricao}</td>
                          <td className="px-3 py-2">
                            {i.tipo && <Badge variant="outline" className="text-[10px]">{i.tipo}</Badge>}
                          </td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{i.unidade || "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatBRL(n(i.precoMedio))}</td>
                          <td className="px-3 py-2 text-right text-emerald-600 tabular-nums">{formatBRL(n(i.precoMin))}</td>
                          <td className="px-3 py-2 text-right text-red-500 tabular-nums">{formatBRL(n(i.precoMax))}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex items-center justify-center w-7 h-5 rounded-full bg-slate-100 text-slate-600 font-medium text-[10px]">
                              {i.totalOrcamentos}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
