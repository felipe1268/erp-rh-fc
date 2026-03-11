import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Package, Search, Loader2, Upload, CheckCircle, AlertCircle } from "lucide-react";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function n(v: any) { return parseFloat(v || "0"); }

/* ── COMPOSIÇÕES ─────────────────────────────────────────────── */
function ComposicoesView({ companyId }: { companyId: number }) {
  const [search, setSearch] = useState("");
  const { data: composicoes = [], isLoading } =
    trpc.orcamento.listarComposicoesCatalogo.useQuery({ companyId }, { enabled: companyId > 0 });

  const q = search.toLowerCase();
  const filt = composicoes.filter((c: any) =>
    !q || c.descricao?.toLowerCase().includes(q) || c.codigo?.toLowerCase().includes(q) || c.tipo?.toLowerCase().includes(q)
  );

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-blue-100">
          <Wrench className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Composições</h1>
          <p className="text-sm text-muted-foreground">Catálogo central de composições da empresa</p>
        </div>
        <span className="ml-auto text-sm text-muted-foreground font-mono">{composicoes.length} registros</span>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por descrição, código ou tipo..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filt.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Wrench className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">{search ? "Nenhuma composição encontrada para esta busca." : "Nenhuma composição cadastrada ainda."}</p>
          <p className="text-xs mt-1">Acesse um orçamento e use o botão "Biblioteca" para enviar itens.</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-muted-foreground">
                  <th className="text-left px-4 py-2 w-28">Código</th>
                  <th className="text-left px-3 py-2 min-w-[300px]">Descrição</th>
                  <th className="text-left px-3 py-2 w-32">Tipo</th>
                  <th className="text-center px-3 py-2 w-16">Un</th>
                  <th className="text-right px-3 py-2 w-28 text-blue-600">Custo Mat</th>
                  <th className="text-right px-3 py-2 w-28 text-orange-500">Custo MO</th>
                  <th className="text-right px-3 py-2 w-28 font-semibold">Total Unit</th>
                  <th className="text-center px-3 py-2 w-24">Orçamentos</th>
                </tr>
              </thead>
              <tbody>
                {filt.map((c: any) => (
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
    </>
  );
}

/* ── INSUMOS ─────────────────────────────────────────────────── */
function InsumosView({ companyId }: { companyId: number }) {
  const [search, setSearch] = useState("");
  const [importResult, setImportResult] = useState<{ total: number; inseridos: number; atualizados: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: insumos = [], isLoading } =
    trpc.orcamento.listarInsumosCatalogo.useQuery({ companyId }, { enabled: companyId > 0 });

  const importMut = trpc.orcamento.importarInsumosCatalogo.useMutation({
    onSuccess: (res) => {
      setImportResult(res);
      setImportError(null);
      utils.orcamento.listarInsumosCatalogo.invalidate({ companyId });
    },
    onError: (err) => {
      setImportError(err.message);
      setImportResult(null);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      if (!base64) return;
      importMut.mutate({ companyId, fileBase64: base64, fileName: file.name });
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be reimportado
    e.target.value = "";
  }

  const q = search.toLowerCase();
  const filt = insumos.filter((i: any) =>
    !q || i.descricao?.toLowerCase().includes(q) || i.codigo?.toLowerCase().includes(q) || i.tipo?.toLowerCase().includes(q)
  );

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-emerald-100">
          <Package className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Insumos</h1>
          <p className="text-sm text-muted-foreground">Catálogo central de insumos da empresa</p>
        </div>
        <span className="ml-auto text-sm text-muted-foreground font-mono mr-3">{insumos.length} registros</span>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          size="sm"
          variant="outline"
          className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          onClick={() => fileRef.current?.click()}
          disabled={importMut.isPending}
        >
          {importMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
            : <><Upload className="h-4 w-4" /> Importar Planilha</>
          }
        </Button>
      </div>

      {/* Resultado da importação */}
      {importResult && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>
            Importação concluída: <strong>{importResult.total}</strong> insumos processados —{" "}
            <strong>{importResult.inseridos}</strong> inseridos,{" "}
            <strong>{importResult.atualizados}</strong> atualizados.
          </span>
          <button onClick={() => setImportResult(null)} className="ml-auto text-emerald-600 hover:text-emerald-800">✕</button>
        </div>
      )}
      {importError && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{importError}</span>
          <button onClick={() => setImportError(null)} className="ml-auto text-red-600 hover:text-red-800">✕</button>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por descrição, código ou tipo..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filt.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">{search ? "Nenhum insumo encontrado para esta busca." : "Nenhum insumo cadastrado ainda."}</p>
          <p className="text-xs mt-1">
            {search ? "" : 'Use o botão "Importar Planilha" acima para carregar os insumos da empresa.'}
          </p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-muted-foreground">
                  <th className="text-left px-4 py-2 w-28">Código</th>
                  <th className="text-left px-3 py-2 min-w-[300px]">Descrição</th>
                  <th className="text-left px-3 py-2 w-40">Grupo</th>
                  <th className="text-center px-3 py-2 w-14">Un</th>
                  <th className="text-right px-3 py-2 w-28 font-semibold">Preço (c/enc.)</th>
                  <th className="text-right px-3 py-2 w-28 text-slate-500">Preço Base</th>
                  <th className="text-center px-3 py-2 w-24">Orçamentos</th>
                </tr>
              </thead>
              <tbody>
                {filt.map((i: any) => (
                  <tr key={i.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-[10px] text-slate-500">{i.codigo || "—"}</td>
                    <td className="px-3 py-2">{i.descricao}</td>
                    <td className="px-3 py-2">
                      {i.tipo && <Badge variant="outline" className="text-[10px]">{i.tipo}</Badge>}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{i.unidade || "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatBRL(n(i.precoMedio))}</td>
                    <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{formatBRL(n(i.precoMin))}</td>
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
    </>
  );
}

/* ── PÁGINA PRINCIPAL ────────────────────────────────────────── */
export default function BibliotecaOrcamento() {
  const { user } = useAuth();
  const companyId = (user as any)?.companyId ?? 0;
  const isInsumos = typeof window !== "undefined" && window.location.pathname.includes("insumos");

  return (
    <DashboardLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {isInsumos
          ? <InsumosView companyId={companyId} />
          : <ComposicoesView companyId={companyId} />
        }
      </div>
    </DashboardLayout>
  );
}
