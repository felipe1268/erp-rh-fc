import { useState, useMemo, type ReactNode } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Search, Building2, CheckCircle, Clock,
  AlertTriangle, TrendingUp, Plus, Paperclip, Trash2, RotateCcw, Loader2,
  HandCoins, Users,
} from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
function fmtDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const s = String(dateStr).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split("-").reverse().join("/");
  return s;
}
function num(v: any): number {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  a_receber:        { label: "A receber",  cls: "bg-amber-100 text-amber-800 border-amber-300" },
  recebido_parcial: { label: "Parcial",    cls: "bg-blue-100 text-blue-800 border-blue-300" },
  recebido:         { label: "Recebido",   cls: "bg-green-100 text-green-800 border-green-300" },
};

function KCard({ label, value, sub, icon, color }: { label: string; value: string; sub?: ReactNode; icon: ReactNode; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">{label}</p>
          <p className="text-lg font-bold text-slate-800 leading-tight">{value}</p>
          {sub && <p className="text-[11px] text-slate-500 leading-tight">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinanceiroContasAReceberTitulos() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [clienteFiltro, setClienteFiltro] = useState<string>("todos");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showBaixa, setShowBaixa] = useState<any>(null);
  const [showNovo, setShowNovo] = useState(false);
  const [showAnexo, setShowAnexo] = useState<any>(null);

  const { data: titulos, isLoading, refetch } = (trpc as any).financial.getContasAReceberByYear.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );
  const { data: clientesList } = (trpc as any).clientes.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: contasBancarias } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const clientesOpts: { id: number; nome: string }[] = useMemo(() => {
    const list: any[] = Array.isArray(clientesList) ? clientesList : [];
    return list.map((c) => ({ id: c.id, nome: (c.nomeFantasia || c.razaoSocial || `Cliente ${c.id}`).trim() }));
  }, [clientesList]);

  const linhas: any[] = useMemo(() => (Array.isArray(titulos) ? titulos : []), [titulos]);

  const clienteNomes = useMemo(() => {
    const s = new Set<string>();
    for (const t of linhas) s.add((t.clienteNome || "Sem cliente").trim());
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((t) => {
      if (statusFiltro !== "todos" && t.status !== statusFiltro) return false;
      const cli = (t.clienteNome || "Sem cliente").trim();
      if (clienteFiltro !== "todos" && cli !== clienteFiltro) return false;
      if (q) {
        const hay = `${t.descricao ?? ""} ${t.obraNome ?? ""} ${cli} ${t.origemDescricao ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [linhas, busca, statusFiltro, clienteFiltro]);

  const kpis = useMemo(() => {
    let aberto = 0, vencido = 0, recebido = 0, parcial = 0, qtdVenc = 0;
    for (const t of filtradas) {
      const prev = num(t.valorPrevisto);
      const real = num(t.valorRealizado);
      if (t.status === "recebido") { recebido += real || prev; continue; }
      const saldo = Math.max(0, prev - real);
      aberto += saldo;
      if (t.status === "recebido_parcial") parcial += real;
      if (num(t.diasAtraso) > 0) { vencido += saldo; qtdVenc++; }
    }
    return { aberto, vencido, recebido, parcial, qtdVenc };
  }, [filtradas]);

  // Agrupa por cliente
  const grupos = useMemo(() => {
    const map = new Map<string, { cliente: string; itens: any[]; total: number; aberto: number }>();
    for (const t of filtradas) {
      const cli = (t.clienteNome || "Sem cliente").trim();
      if (!map.has(cli)) map.set(cli, { cliente: cli, itens: [], total: 0, aberto: 0 });
      const g = map.get(cli)!;
      g.itens.push(t);
      const prev = num(t.valorPrevisto), real = num(t.valorRealizado);
      g.total += prev;
      g.aberto += t.status === "recebido" ? 0 : Math.max(0, prev - real);
    }
    return Array.from(map.values()).sort((a, b) => b.aberto - a.aberto || a.cliente.localeCompare(b.cliente, "pt-BR"));
  }, [filtradas]);

  const toggle = (k: string) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const baixaMut = (trpc as any).financial.darBaixaReceber.useMutation({
    onSuccess: (r: any) => { toast({ title: r?.quitado ? "Título recebido!" : "Baixa parcial registrada!", description: r?.quitado ? undefined : `Saldo restante: ${formatBRL(r?.saldo ?? 0)}` }); setShowBaixa(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro na baixa", description: e.message, variant: "destructive" }),
  });
  const estornarMut = (trpc as any).financial.estornarReceber.useMutation({
    onSuccess: () => { toast({ title: "Recebimento estornado!", description: "Título voltou para 'A receber'." }); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao estornar", description: e.message, variant: "destructive" }),
  });
  const deleteMut = (trpc as any).financial.deleteEntry.useMutation({
    onSuccess: () => { toast({ title: "Título excluído!" }); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });
  const criarMut = (trpc as any).financial.criarTituloReceber.useMutation({
    onSuccess: () => { toast({ title: "Título a receber criado!" }); setShowNovo(false); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao criar", description: e.message, variant: "destructive" }),
  });
  const anexarMut = (trpc as any).financial.anexarDocumento.useMutation({
    onSuccess: () => { toast({ title: "Documento anexado!" }); setShowAnexo(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao anexar", description: e.message, variant: "destructive" }),
  });

  function onEstornar(t: any) {
    if (!confirm(`Estornar o recebimento do título "${t.descricao}"?`)) return;
    estornarMut.mutate({ id: t.id, companyId });
  }
  function onExcluir(t: any) {
    const motivo = prompt("Motivo da exclusão (mín. 5 caracteres):");
    if (!motivo || motivo.trim().length < 5) { if (motivo !== null) toast({ title: "Motivo muito curto", variant: "destructive" }); return; }
    deleteMut.mutate({ id: t.id, companyId, motivo: motivo.trim() });
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <HandCoins className="h-6 w-6 text-green-600" /> Contas a Receber
            </h1>
            <p className="text-sm text-slate-500">Títulos a receber por cliente — medições (automático) e lançamentos manuais.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border bg-white px-1">
              <Button variant="ghost" size="icon" onClick={() => setAno((a) => a - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="font-bold text-slate-700 w-12 text-center">{ano}</span>
              <Button variant="ghost" size="icon" onClick={() => setAno((a) => a + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button onClick={() => setShowNovo(true)} className="gap-1"><Plus className="h-4 w-4" /> Novo título</Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KCard label="A receber (aberto)" value={formatBRL(kpis.aberto)} icon={<Clock className="h-5 w-5 text-amber-700" />} color="bg-amber-100"
            sub={kpis.qtdVenc > 0 ? <span className="text-red-600 font-medium">{formatBRL(kpis.vencido)} vencido</span> : "em dia"} />
          <KCard label="Recebido no ano" value={formatBRL(kpis.recebido)} icon={<CheckCircle className="h-5 w-5 text-green-700" />} color="bg-green-100" />
          <KCard label="Parcial recebido" value={formatBRL(kpis.parcial)} icon={<TrendingUp className="h-5 w-5 text-blue-700" />} color="bg-blue-100" />
          <KCard label="Títulos vencidos" value={String(kpis.qtdVenc)} icon={<AlertTriangle className="h-5 w-5 text-red-700" />} color="bg-red-100" />
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Buscar descrição, obra, cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
            </div>
            <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
              <SelectTrigger className="w-[220px]"><Users className="h-4 w-4 mr-1 text-slate-400" /><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os clientes</SelectItem>
                {clienteNomes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="a_receber">A receber</SelectItem>
                <SelectItem value="recebido_parcial">Parcial</SelectItem>
                <SelectItem value="recebido">Recebido</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Lista agrupada por cliente */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando...</div>
        ) : grupos.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-slate-400">Nenhum título a receber para os filtros selecionados.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {grupos.map((g) => {
              const open = expanded.has(g.cliente);
              return (
                <Card key={g.cliente} className="overflow-hidden">
                  <button onClick={() => toggle(g.cliente)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2 min-w-0">
                      {open ? <ChevronRight className="h-4 w-4 rotate-90 transition text-slate-400" /> : <ChevronRight className="h-4 w-4 transition text-slate-400" />}
                      <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-800 truncate">{g.cliente}</span>
                      <Badge variant="outline" className="text-[10px]">{g.itens.length}</Badge>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs text-slate-500">Total {formatBRL(g.total)}</span>
                      <span className="text-sm font-bold text-amber-700 tabular-nums">{formatBRL(g.aberto)} <span className="text-[10px] font-normal text-slate-400">aberto</span></span>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t divide-y">
                      {g.itens.map((t) => {
                        const prev = num(t.valorPrevisto), real = num(t.valorRealizado);
                        const saldo = Math.max(0, prev - real);
                        const meta = STATUS_META[t.status] ?? { label: t.status, cls: "bg-slate-100 text-slate-700 border-slate-300" };
                        const vencido = num(t.diasAtraso) > 0;
                        const isManual = t.origemModulo === "manual_receber" || !t.origemModulo;
                        return (
                          <div key={t.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-slate-50">
                            <div className="flex-1 min-w-[200px]">
                              <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                                {t.descricao || t.origemDescricao || "Título"}
                                {t.parcelaTotal > 1 && <Badge variant="outline" className="text-[10px]">{t.parcelaNumero}/{t.parcelaTotal}</Badge>}
                                {t.origemModulo === "revenue" && <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200">Medição</Badge>}
                              </div>
                              <div className="text-[11px] text-slate-500">{t.obraNome ?? "—"}{t.contaNome ? ` · ${t.contaNome}` : ""}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] text-slate-400 uppercase">Vencimento</div>
                              <div className={`text-xs font-medium ${vencido ? "text-red-600" : "text-slate-700"}`}>{fmtDateBR(t.dataVencimento)}{vencido && ` (${t.diasAtraso}d)`}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400 uppercase">Valor</div>
                              <div className="text-sm font-bold text-slate-800 tabular-nums">{formatBRL(prev)}</div>
                              {real > 0 && t.status !== "recebido" && <div className="text-[10px] text-blue-600">recebido {formatBRL(real)} · saldo {formatBRL(saldo)}</div>}
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                            <div className="flex items-center gap-1">
                              {t.status !== "recebido" && (
                                <Button size="sm" variant="default" className="h-7 gap-1 bg-green-600 hover:bg-green-700" onClick={() => setShowBaixa(t)}>
                                  <HandCoins className="h-3.5 w-3.5" /> Receber
                                </Button>
                              )}
                              {t.status === "recebido" && (
                                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => onEstornar(t)} disabled={estornarMut.isPending}>
                                  <RotateCcw className="h-3.5 w-3.5" /> Estornar
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar documento" onClick={() => setShowAnexo(t)}>
                                <Paperclip className={`h-3.5 w-3.5 ${t.anexoUrl ? "text-green-600" : "text-slate-400"}`} />
                              </Button>
                              {isManual && t.status === "a_receber" && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Excluir" onClick={() => onExcluir(t)} disabled={deleteMut.isPending}>
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {showBaixa && <BaixaDialog titulo={showBaixa} companyId={companyId} contasBancarias={contasBancarias} onClose={() => setShowBaixa(null)} onSubmit={(p: any) => baixaMut.mutate(p)} pending={baixaMut.isPending} />}
      {showNovo && <NovoTituloDialog companyId={companyId} clientesOpts={clientesOpts} onClose={() => setShowNovo(false)} onSubmit={(p: any) => criarMut.mutate(p)} pending={criarMut.isPending} />}
      {showAnexo && <AnexoDialog titulo={showAnexo} companyId={companyId} onClose={() => setShowAnexo(null)} onSubmit={(p: any) => anexarMut.mutate(p)} pending={anexarMut.isPending} />}
    </DashboardLayout>
  );
}

// ─────────────────────────── BAIXA (recebimento) ───────────────────────────
function BaixaDialog({ titulo, companyId, contasBancarias, onClose, onSubmit, pending }: any) {
  const { toast } = useToast();
  const prev = num(titulo.valorPrevisto), real = num(titulo.valorRealizado);
  const saldo = Math.max(0, prev - real);
  const [valor, setValor] = useState(String(saldo.toFixed(2)));
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [contaId, setContaId] = useState<string>("");
  const [forma, setForma] = useState<string>("");
  const [obs, setObs] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const contas: any[] = Array.isArray(contasBancarias) ? contasBancarias : [];

  const uploadMut = (trpc as any).financial.uploadComprovante.useMutation();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const out = await uploadMut.mutateAsync({ fileName: file.name, fileBase64: b64, contentType: file.type });
      setComprovanteUrl(out.url);
      toast({ title: "Comprovante enviado" });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err?.message, variant: "destructive" });
    } finally { setUploading(false); }
  }

  function submit() {
    const v = parseFloat(valor.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) { toast({ title: "Valor inválido", variant: "destructive" }); return; }
    onSubmit({
      id: titulo.id, companyId, valorRecebido: v, dataRecebimento: data,
      contaBancariaId: contaId ? Number(contaId) : undefined,
      formaPagamento: forma || undefined,
      comprovanteUrl: comprovanteUrl || undefined,
      observacoes: obs.trim() || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar recebimento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-slate-50 border p-3 text-sm">
            <div className="font-medium text-slate-800">{titulo.descricao}</div>
            <div className="text-xs text-slate-500">{titulo.clienteNome || "Sem cliente"} · venc. {fmtDateBR(titulo.dataVencimento)}</div>
            <div className="mt-1 flex justify-between text-xs"><span>Valor do título</span><span className="font-bold">{formatBRL(prev)}</span></div>
            {real > 0 && <div className="flex justify-between text-xs text-blue-600"><span>Já recebido</span><span>{formatBRL(real)}</span></div>}
            <div className="flex justify-between text-xs font-bold text-amber-700"><span>Saldo em aberto</span><span>{formatBRL(saldo)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Valor recebido</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" /></div>
            <div><Label className="text-xs">Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          </div>
          <p className="text-[11px] text-slate-500">Valor menor que o saldo registra <b>baixa parcial</b> (título fica "Parcial" com o restante em aberto).</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Conta bancária</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {contas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.descricao || c.banco} {c.conta ? `· ${c.conta}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Forma</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {["PIX","Transferência","Boleto","Dinheiro","Cheque","Cartão"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Comprovante (opcional)</Label>
            <Input type="file" accept="application/pdf,image/*,.doc,.docx" onChange={handleFile} disabled={uploading} />
            {uploading && <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-1"><Loader2 className="h-3 w-3 animate-spin" /> enviando...</span>}
            {comprovanteUrl && <span className="text-[11px] text-green-600 flex items-center gap-1 mt-1"><CheckCircle className="h-3 w-3" /> comprovante anexado</span>}
          </div>
          <div><Label className="text-xs">Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || uploading} className="bg-green-600 hover:bg-green-700">
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Confirmar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── NOVO TÍTULO MANUAL ───────────────────────────
function NovoTituloDialog({ companyId, clientesOpts, onClose, onSubmit, pending }: any) {
  const { toast } = useToast();
  const [clienteId, setClienteId] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [obraNome, setObraNome] = useState("");
  const [contaNome, setContaNome] = useState("");
  const [valor, setValor] = useState("");
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 10));
  const [venc, setVenc] = useState(new Date().toISOString().slice(0, 10));
  const [parcelas, setParcelas] = useState("1");
  const [obs, setObs] = useState("");

  function submit() {
    const v = parseFloat(valor.replace(",", "."));
    if (!descricao.trim()) { toast({ title: "Informe a descrição", variant: "destructive" }); return; }
    if (!Number.isFinite(v) || v <= 0) { toast({ title: "Valor inválido", variant: "destructive" }); return; }
    const np = Math.max(1, parseInt(parcelas, 10) || 1);
    const cli = clientesOpts.find((c: any) => String(c.id) === clienteId);
    onSubmit({
      companyId,
      descricao: descricao.trim(),
      valorPrevisto: v,
      dataCompetencia: comp || undefined,
      dataVencimento: venc || undefined,
      parcelas: np,
      clienteId: cli ? cli.id : undefined,
      clienteNome: cli ? cli.nome : undefined,
      obraNome: obraNome.trim() || undefined,
      contaNome: contaNome.trim() || undefined,
      observacoes: obs.trim() || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Novo título a receber</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Cliente</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clientesOpts.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Descrição</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Medição 03 — Obra X" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Obra (opcional)</Label><Input value={obraNome} onChange={(e) => setObraNome(e.target.value)} /></div>
            <div><Label className="text-xs">Categoria (opcional)</Label><Input value={contaNome} onChange={(e) => setContaNome(e.target.value)} placeholder="Faturamento de Obras" /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Valor total</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" /></div>
            <div><Label className="text-xs">Competência</Label><Input type="date" value={comp} onChange={(e) => setComp(e.target.value)} /></div>
            <div><Label className="text-xs">1º Vencimento</Label><Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">Parcelas</Label>
            <Input type="number" min={1} max={120} value={parcelas} onChange={(e) => setParcelas(e.target.value)} className="w-24" />
            <p className="text-[11px] text-slate-500 mt-1">Mais de 1 parcela gera vencimentos mensais a partir do 1º vencimento; o valor é dividido (resto na última).</p>
          </div>
          <div><Label className="text-xs">Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Criar título</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── ANEXAR DOCUMENTO ───────────────────────────
function AnexoDialog({ titulo, companyId, onClose, onSubmit, pending }: any) {
  const { toast } = useToast();
  const [url, setUrl] = useState<string>("");
  const [nome, setNome] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const uploadMut = (trpc as any).financial.uploadComprovante.useMutation();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] ?? "");
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const out = await uploadMut.mutateAsync({ fileName: file.name, fileBase64: b64, contentType: file.type });
      setUrl(out.url);
      setNome(file.name);
      toast({ title: "Arquivo enviado", description: "Clique em Anexar para vincular." });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err?.message, variant: "destructive" });
    } finally { setUploading(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Anexar documento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-slate-600">{titulo.descricao}</div>
          {titulo.anexoUrl && (
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5 text-green-600" /> Já existe um anexo
              <a href={titulo.anexoUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">abrir</a>
            </div>
          )}
          <div>
            <Label className="text-xs">Arquivo (PDF, Word ou imagem)</Label>
            <Input type="file" accept="application/pdf,image/*,.doc,.docx" onChange={handleFile} disabled={uploading} />
            {uploading && <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-1"><Loader2 className="h-3 w-3 animate-spin" /> enviando...</span>}
            {url && <span className="text-[11px] text-green-600 flex items-center gap-1 mt-1"><CheckCircle className="h-3 w-3" /> {nome}</span>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => { if (!url) { toast({ title: "Selecione um arquivo", variant: "destructive" }); return; } onSubmit({ id: titulo.id, companyId, anexoUrl: url, anexoNome: nome || undefined }); }} disabled={pending || uploading}>
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Anexar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
