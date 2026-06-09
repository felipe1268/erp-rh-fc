import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shirt, Footprints, ShoppingCart, AlertTriangle, Save, Loader2, Users, PackageCheck } from "lucide-react";

interface Props {
  companyId: number;
  companyIds?: number[];
  readOnly?: boolean;
  /** Modo grupo (Construtoras): agrega várias empresas — a config é POR empresa,
   *  então o editor fica desabilitado (peça p/ selecionar uma empresa específica). */
  aggregate?: boolean;
}

type Row = {
  tamanho: string;
  funcionarios: number;
  necessidade: number;
  jaEntregue: number;
  liquida: number;
  estoque: number;
  deficit: number;
  sobra: number;
};
type Bucket = { rows: Row[]; totais: Row; semTamanho: number };

const BUCKET_META = {
  camisa: { label: "Camisa / Uniforme (superior)", icon: Shirt },
  calca: { label: "Calça", icon: Shirt },
  calcado: { label: "Calçado / Bota", icon: Footprints },
} as const;

export default function EpiNecessidade({ companyId, companyIds, readOnly = false, aggregate = false }: Props) {
  const editLocked = readOnly || aggregate;
  const utils = trpc.useUtils();
  const hasCompany = !!companyId || (companyIds && companyIds.length > 0);

  const dataQ = trpc.epis.necessidadeVsEstoque.useQuery(
    { companyId, companyIds },
    { enabled: !!hasCompany },
  );

  const [cfg, setCfg] = useState<{ camisa: string; calca: string; calcado: string }>({ camisa: "1", calca: "1", calcado: "1" });
  useEffect(() => {
    const c = dataQ.data?.config;
    if (c) setCfg({ camisa: String(c.camisa ?? 1), calca: String(c.calca ?? 1), calcado: String(c.calcado ?? 1) });
  }, [dataQ.data?.config]);

  const clampNum = (v: string) => Math.max(0, Math.min(99, parseInt(v, 10) || 0));

  const saveMut = trpc.epis.setNecessidadeConfig.useMutation({
    onSuccess: () => {
      utils.epis.necessidadeVsEstoque.invalidate();
      utils.epis.getNecessidadeConfig.invalidate();
    },
  });

  const totalDeficit =
    (dataQ.data?.camisa.totais.deficit ?? 0) +
    (dataQ.data?.calca.totais.deficit ?? 0) +
    (dataQ.data?.calcado.totais.deficit ?? 0);

  return (
    <div className="space-y-4">
      {/* Cabeçalho explicativo */}
      <div className="rounded-lg border bg-blue-50/60 border-blue-200 p-3 text-sm text-blue-900">
        <div className="flex items-start gap-2">
          <ShoppingCart className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Cruza os <strong>tamanhos cadastrados</strong> de cada funcionário ativo com o{" "}
            <strong>estoque total (central + obras)</strong>, descontando o que já foi entregue.
            A coluna <strong>"A comprar"</strong> é o que falta para atender todo mundo.
          </p>
        </div>
      </div>

      {/* Config de necessidade por tipo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <PackageCheck className="h-4 w-4" /> Necessidade por funcionário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            {(["camisa", "calca", "calcado"] as const).map((b) => (
              <div key={b}>
                <label className="text-xs text-muted-foreground block mb-1">
                  {b === "camisa" ? "Camisas / pessoa" : b === "calca" ? "Calças / pessoa" : "Calçados / pessoa"}
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={cfg[b]}
                  disabled={editLocked}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d{1,2}$/.test(v)) setCfg((c) => ({ ...c, [b]: v }));
                  }}
                  onBlur={(e) => {
                    const v = e.target.value;
                    setCfg((c) => ({ ...c, [b]: v === "" ? "" : String(clampNum(v)) }));
                  }}
                  className="h-9"
                />
              </div>
            ))}
            {!editLocked && (
              <Button
                onClick={() => saveMut.mutate({ companyId, camisa: clampNum(cfg.camisa), calca: clampNum(cfg.calca), calcado: clampNum(cfg.calcado) })}
                disabled={saveMut.isPending}
                className="h-9 gap-1 bg-[#1B2A4A] hover:bg-[#243660]"
              >
                {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            )}
          </div>
          {aggregate && (
            <p className="mt-2 text-xs text-amber-700 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              No modo grupo a necessidade é por empresa — selecione uma empresa específica para ajustá-la. O cruzamento abaixo já usa a config de cada empresa.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Resumo */}
      {dataQ.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ResumoCard icon={<Users className="h-4 w-4 text-blue-600" />} label="Funcionários ativos" value={dataQ.data.totalFuncionariosAtivos} />
          <ResumoCard icon={<ShoppingCart className="h-4 w-4 text-red-600" />} label="Total a comprar" value={totalDeficit} highlight={totalDeficit > 0} />
        </div>
      )}

      {dataQ.isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Calculando necessidade…
        </div>
      )}
      {dataQ.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Erro ao calcular: {(dataQ.error as any)?.message || "tente novamente"}
        </div>
      )}

      {dataQ.data && (["camisa", "calca", "calcado"] as const).map((b) => (
        <BucketTable key={b} bucketKey={b} bucket={dataQ.data![b] as Bucket} />
      ))}
    </div>
  );
}

function ResumoCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-red-300 bg-red-50/50" : ""}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon} {label}</div>
        <div className={`text-2xl font-bold ${highlight ? "text-red-600" : "text-gray-900"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function BucketTable({ bucketKey, bucket }: { bucketKey: keyof typeof BUCKET_META; bucket: Bucket }) {
  const meta = BUCKET_META[bucketKey];
  const Icon = meta.icon;
  const semDados = bucket.rows.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2"><Icon className="h-4 w-4" /> {meta.label}</span>
          {bucket.totais.deficit > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ShoppingCart className="h-3 w-3" /> comprar {bucket.totais.deficit}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bucket.semTamanho > 0 && (
          <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {bucket.semTamanho} funcionário(s) ativo(s) sem este tamanho cadastrado — não entram na conta.
          </div>
        )}
        {semDados ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum tamanho cadastrado nem estoque para este tipo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2 px-2">Tamanho</th>
                  <th className="text-right py-2 px-2">Funcionários</th>
                  <th className="text-right py-2 px-2">Necessidade</th>
                  <th className="text-right py-2 px-2">Já entregue</th>
                  <th className="text-right py-2 px-2">Falta</th>
                  <th className="text-right py-2 px-2">Estoque</th>
                  <th className="text-right py-2 px-2">A comprar</th>
                </tr>
              </thead>
              <tbody>
                {bucket.rows.map((r) => (
                  <tr key={r.tamanho} className={`border-b last:border-0 ${r.deficit > 0 ? "bg-red-50/40" : ""}`}>
                    <td className="py-1.5 px-2 font-medium">{r.tamanho}</td>
                    <td className="text-right px-2">{r.funcionarios}</td>
                    <td className="text-right px-2">{r.necessidade}</td>
                    <td className="text-right px-2 text-muted-foreground">{r.jaEntregue}</td>
                    <td className="text-right px-2">{r.liquida}</td>
                    <td className="text-right px-2">{r.estoque}</td>
                    <td className="text-right px-2 font-semibold">
                      {r.deficit > 0 ? (
                        <span className="text-red-600">{r.deficit}</span>
                      ) : (
                        <span className="text-emerald-600">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold text-sm">
                  <td className="py-2 px-2">Total</td>
                  <td className="text-right px-2">{bucket.totais.funcionarios}</td>
                  <td className="text-right px-2">{bucket.totais.necessidade}</td>
                  <td className="text-right px-2 text-muted-foreground">{bucket.totais.jaEntregue}</td>
                  <td className="text-right px-2">{bucket.totais.liquida}</td>
                  <td className="text-right px-2">{bucket.totais.estoque}</td>
                  <td className="text-right px-2 text-red-600">{bucket.totais.deficit || "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
