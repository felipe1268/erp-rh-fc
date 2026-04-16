import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Search, RefreshCw, HardHat, Handshake, DollarSign } from "lucide-react";

type Aba = "convenios" | "epi" | "outros";
type PendItem = {
  tipo: Aba;
  id: number;
  employeeId: number;
  nomeCompleto: string;
  codigoInterno?: string;
  funcao?: string;
  descricao?: string;
  valor: number;
  raw: any;
};

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FolhaAprovacoesRh({
  companyId,
  mesAno,
  onBack,
}: {
  companyId: number;
  mesAno: string;
  onBack: () => void;
}) {
  const [aba, setAba] = useState<Aba>("convenios");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [motivoLote, setMotivoLote] = useState("");

  const utils = trpc.useUtils();
  const pend = trpc.payrollEngine.listarPendenciasAprovacaoRh.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 && !!mesAno, refetchOnWindowFocus: true },
  );

  const aprovarAdj = trpc.payrollEngine.aprovarAdjustmentRh.useMutation({
    onSuccess: () => { pend.refetch(); toast.success("Lançamento processado!"); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarEpi = trpc.payrollEngine.aprovarEpiCobranca.useMutation({
    onSuccess: () => { pend.refetch(); toast.success("Cobrança EPI processada!"); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarConv = trpc.payrollEngine.aprovarLancamentoParceiro.useMutation({
    onSuccess: () => { pend.refetch(); toast.success("Convênio processado!"); },
    onError: (e) => toast.error(e.message),
  });

  // Normaliza os 3 feeds em um formato único
  const { convenios, epi, outros, totais } = useMemo(() => {
    const d = pend.data;
    const convenios: PendItem[] = (d?.convenios || [])
      .filter((r: any) => r.status === "pendente")
      .map((r: any) => ({
        tipo: "convenios" as const, id: r.id, employeeId: r.employeeId, nomeCompleto: r.nomeCompleto,
        codigoInterno: r.codigoInterno, funcao: r.funcao,
        descricao: r.descricao || "Compra em parceiro",
        valor: Number(r.valor || 0), raw: r,
      }));
    const epi: PendItem[] = (d?.epi || [])
      .filter((r: any) => r.status === "pendente")
      .map((r: any) => ({
        tipo: "epi" as const, id: r.id, employeeId: r.employeeId, nomeCompleto: r.nomeCompleto,
        codigoInterno: r.codigoInterno, funcao: r.funcao,
        descricao: `${r.epi_nome}${r.ca ? " (CA " + r.ca + ")" : ""}${r.quantidade ? " × " + r.quantidade : ""} — ${r.motivo_cobranca || "cobrança"}`,
        valor: Number(r.valor_total || 0), raw: r,
      }));
    const outros: PendItem[] = (d?.adjustments || [])
      .filter((r: any) => r.tipo === "outros" && r.aprovadoRh !== true)
      .map((r: any) => ({
        tipo: "outros" as const, id: r.id, employeeId: r.employeeId, nomeCompleto: r.nomeCompleto,
        codigoInterno: r.codigoInterno, funcao: r.funcao,
        descricao: r.descricao || "Ajuste manual",
        valor: Number(r.valorDesconto || 0), raw: r,
      }));
    return {
      convenios, epi, outros,
      totais: {
        convenios: { qtd: convenios.length, valor: convenios.reduce((s, x) => s + x.valor, 0) },
        epi: { qtd: epi.length, valor: epi.reduce((s, x) => s + x.valor, 0) },
        outros: { qtd: outros.length, valor: outros.reduce((s, x) => s + x.valor, 0) },
      },
    };
  }, [pend.data]);

  const itens = aba === "convenios" ? convenios : aba === "epi" ? epi : outros;
  const filtrados = itens.filter(
    (i) =>
      !busca ||
      i.nomeCompleto?.toLowerCase().includes(busca.toLowerCase()) ||
      i.codigoInterno?.toLowerCase().includes(busca.toLowerCase()) ||
      i.descricao?.toLowerCase().includes(busca.toLowerCase()),
  );

  const selecionadosIds = Object.entries(selecionados).filter(([k, v]) => v && k.startsWith(aba + ":")).map(([k]) => Number(k.split(":")[1]));
  const todosSelecionados = filtrados.length > 0 && filtrados.every((i) => selecionados[`${aba}:${i.id}`]);
  const totalSelecionado = filtrados.filter((i) => selecionados[`${aba}:${i.id}`]).reduce((s, i) => s + i.valor, 0);

  const toggleTodos = () => {
    const next = { ...selecionados };
    if (todosSelecionados) filtrados.forEach((i) => delete next[`${aba}:${i.id}`]);
    else filtrados.forEach((i) => (next[`${aba}:${i.id}`] = true));
    setSelecionados(next);
  };

  const processar = (aprovado: boolean, ids: number[], motivo?: string) => {
    if (ids.length === 0) { toast.warning("Selecione ao menos 1 item"); return; }
    if (!aprovado && !motivo) { toast.warning("Motivo obrigatório para rejeição"); return; }
    for (const id of ids) {
      if (aba === "convenios") aprovarConv.mutate({ lancamentoId: id, aprovado, motivo });
      else if (aba === "epi") aprovarEpi.mutate({ epiAlertId: id, aprovado, justificativa: motivo });
      else aprovarAdj.mutate({ adjustmentId: id, aprovado, motivo });
    }
    setSelecionados({});
    setMotivoLote("");
  };

  const abas = [
    { key: "convenios" as Aba, label: "Convênios", icon: Handshake, ...totais.convenios, cor: "text-sky-700", bg: "bg-sky-50" },
    { key: "epi" as Aba, label: "EPIs", icon: HardHat, ...totais.epi, cor: "text-amber-700", bg: "bg-amber-50" },
    { key: "outros" as Aba, label: "Outros Descontos", icon: DollarSign, ...totais.outros, cor: "text-purple-700", bg: "bg-purple-50" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-xl font-bold">Aprovações Pendentes — RH</h1>
            <p className="text-xs text-muted-foreground">Competência {mesAno} · aprove os descontos antes de rodar a folha</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => pend.refetch()}>
          <RefreshCw className={`h-4 w-4 mr-1 ${pend.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Cards-aba */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {abas.map((a) => (
          <button
            key={a.key}
            onClick={() => { setAba(a.key); setSelecionados({}); }}
            className={`rounded-lg p-4 text-left transition-all border-2 ${aba === a.key ? "border-primary shadow-md" : "border-transparent"} ${a.bg}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <a.icon className={`h-5 w-5 ${a.cor}`} />
                <p className="font-semibold text-sm">{a.label}</p>
              </div>
              <span className={`inline-flex items-center justify-center min-w-[24px] h-6 rounded-full text-xs font-bold ${a.qtd > 0 ? "bg-red-500 text-white" : "bg-gray-300 text-gray-700"}`}>{a.qtd}</span>
            </div>
            <p className={`text-lg font-bold mt-2 ${a.cor}`}>{fmtBRL(a.valor)}</p>
            <p className="text-[11px] text-muted-foreground">em descontos pendentes</p>
          </button>
        ))}
      </div>

      {/* Busca + ações em lote */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar colaborador / descrição…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background"
          />
        </div>
        {selecionadosIds.length > 0 && (
          <>
            <span className="text-sm font-medium">
              {selecionadosIds.length} selecionado(s) · {fmtBRL(totalSelecionado)}
            </span>
            <Input
              placeholder="Motivo (opcional p/ aprovar · obrigatório p/ rejeitar)"
              value={motivoLote}
              onChange={(e) => setMotivoLote(e.target.value)}
              className="w-[280px]"
            />
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => processar(true, selecionadosIds, motivoLote)}>
              <Check className="h-4 w-4 mr-1" /> Aprovar ({selecionadosIds.length})
            </Button>
            <Button size="sm" variant="destructive" onClick={() => processar(false, selecionadosIds, motivoLote)}>
              <X className="h-4 w-4 mr-1" /> Rejeitar ({selecionadosIds.length})
            </Button>
          </>
        )}
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {pend.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando…</div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nada pendente nessa categoria 🎉
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-2.5 w-8">
                      <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} className="h-4 w-4 accent-primary" />
                    </th>
                    <th className="p-2.5 font-medium">Cód.</th>
                    <th className="p-2.5 font-medium">Colaborador</th>
                    <th className="p-2.5 font-medium">Função</th>
                    <th className="p-2.5 font-medium">Descrição</th>
                    <th className="p-2.5 font-medium text-right">Valor</th>
                    <th className="p-2.5 font-medium text-center w-[180px]">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((i) => {
                    const key = `${aba}:${i.id}`;
                    return (
                      <tr key={key} className="border-b hover:bg-muted/30">
                        <td className="p-2.5">
                          <input
                            type="checkbox"
                            checked={!!selecionados[key]}
                            onChange={(e) => setSelecionados((s) => ({ ...s, [key]: e.target.checked }))}
                            className="h-4 w-4 accent-primary"
                          />
                        </td>
                        <td className="p-2.5 font-mono text-xs">{i.codigoInterno || "-"}</td>
                        <td className="p-2.5 font-medium">{i.nomeCompleto}</td>
                        <td className="p-2.5 text-xs text-muted-foreground">{i.funcao || "-"}</td>
                        <td className="p-2.5 text-xs">{i.descricao}</td>
                        <td className="p-2.5 text-right font-semibold">{fmtBRL(i.valor)}</td>
                        <td className="p-2.5">
                          <div className="flex gap-1 justify-center">
                            <Button
                              size="sm"
                              className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => processar(true, [i.id])}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2"
                              onClick={() => {
                                const m = prompt("Motivo da rejeição:");
                                if (m) processar(false, [i.id], m);
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        💡 Pensão alimentícia, INSS, IRRF, FGTS e Sindicato são automáticos (não precisam de aprovação).
        Faltas/atrasos também são auto-aplicados (regra CLT art. 473).
      </p>
    </div>
  );
}
