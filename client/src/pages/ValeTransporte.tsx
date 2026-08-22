/**
 * Rev. 5042 — VALE TRANSPORTE (RH)
 *
 * Controle mensal (jan-dez): seleciona os funcionários que recebem o benefício,
 * lança dias trabalhados × valor da passagem/dia, soma o total do mês,
 * consolida e envia UM título ao Financeiro (com o boleto anexado e a relação
 * de colaboradores a quem se refere).
 */
import DashboardLayout from "@/components/DashboardLayout";
import PeriodSelectorCard, { type MonthDotStatus } from "@/components/PeriodSelectorCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import {
  Bus, Users, DollarSign, Plus, Trash2, Loader2, Lock, Unlock,
  Send, Paperclip, FileText, Search, CheckCircle, AlertTriangle,
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

// Mesma tolerância do servidor: "4,50" BR; "4.50" decimal; "3.000" milhar.
function parseBRL(v: string | null | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, "");
  if (/,/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseFloat(s.replace(/\./g, "")) || 0;
  return parseFloat(s) || 0;
}
function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  aberto:      { label: "Em aberto",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
  consolidado: { label: "Consolidado", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  enviado:     { label: "Enviado ao Financeiro", cls: "bg-green-50 text-green-700 border-green-200" },
};

export default function ValeTransporte() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState<number>(hoje.getMonth() + 1);
  const mesStr = `${ano}-${String(mes).padStart(2, "0")}`;
  const [busca, setBusca] = useState("");
  const [dlgAdd, setDlgAdd] = useState(false);
  const [buscaAdd, setBuscaAdd] = useState("");
  const [selIds, setSelIds] = useState<Set<number>>(new Set());
  const [dlgEnviar, setDlgEnviar] = useState(false);
  const [vencimento, setVencimento] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [edits, setEdits] = useState<Record<number, { dias: string; valor: string }>>({});

  const utils = trpc.useUtils();
  const enabled = !!companyId;
  const mesQ = trpc.valeTransporte.getMes.useQuery({ companyId, mes: mesStr }, { enabled });
  const resumoQ = trpc.valeTransporte.resumoAno.useQuery({ companyId, ano }, { enabled });
  const elegQ = trpc.valeTransporte.elegiveis.useQuery({ companyId, mes: mesStr }, { enabled: enabled && dlgAdd });
  const norm = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const elegFiltrados = useMemo(() => {
    const lista = (elegQ.data ?? []) as any[];
    const q = norm(buscaAdd.trim());
    if (!q) return lista;
    return lista.filter((e: any) => norm(e.nome).includes(q) || norm(e.funcao ?? "").includes(q));
  }, [elegQ.data, buscaAdd]);

  const invalidate = () => { utils.valeTransporte.getMes.invalidate(); utils.valeTransporte.resumoAno.invalidate(); };
  const onErr = (e: any) => toast.error(e?.message ?? "Falha na operação");

  const gerar = trpc.valeTransporte.gerarMes.useMutation({ onSuccess: (r) => { toast.success(`${r.criados} lançamento(s) criado(s) com ${r.diasPadrao} dias padrão — ajuste os dias por colaborador se preciso.`); setDlgAdd(false); setSelIds(new Set()); invalidate(); }, onError: onErr });
  const atualizar = trpc.valeTransporte.atualizarLancamento.useMutation({ onSuccess: () => invalidate(), onError: onErr });
  const remover = trpc.valeTransporte.removerLancamento.useMutation({ onSuccess: () => { toast.success("Lançamento removido."); invalidate(); }, onError: onErr });
  const consolidar = trpc.valeTransporte.consolidar.useMutation({ onSuccess: () => { toast.success("Mês consolidado — edição travada."); invalidate(); }, onError: onErr });
  const reabrir = trpc.valeTransporte.reabrir.useMutation({ onSuccess: () => { toast.success("Mês reaberto."); invalidate(); }, onError: onErr });
  const anexar = trpc.valeTransporte.anexarBoleto.useMutation({ onSuccess: () => { toast.success("Boleto anexado."); invalidate(); }, onError: onErr });
  const removerAnexo = trpc.valeTransporte.removerAnexo.useMutation({ onSuccess: () => { toast.success("Anexo removido."); invalidate(); }, onError: onErr });
  const enviar = trpc.valeTransporte.enviarFinanceiro.useMutation({ onSuccess: (r) => { toast.success(`Título #${r.entryId} de ${fmtBRL(r.total)} criado no Contas a Pagar.`); setDlgEnviar(false); invalidate(); }, onError: onErr });

  const salvarTaxas = trpc.valeTransporte.salvarTaxas.useMutation({ onSuccess: () => { toast.success("Taxas salvas."); setTaxasDirty(false); invalidate(); }, onError: onErr });

  const mesInfo = mesQ.data?.mesInfo;
  const status = mesInfo?.status ?? "aberto";
  const aberto = status === "aberto";
  const lancs = mesQ.data?.lancamentos ?? [];
  const total = mesQ.data?.total ?? 0;
  const totalColaboradores = (mesQ.data as any)?.totalColaboradores ?? 0;
  const totalTaxas = (mesQ.data as any)?.totalTaxas ?? 0;
  const anexos = (mesQ.data as any)?.anexos ?? [];

  // Taxas administrativas — rascunho local hidratado do servidor (efeito único p/ evitar corrida de cache)
  const [taxasRows, setTaxasRows] = useState<Array<{ descricao: string; valor: string }>>([]);
  const [taxasDirty, setTaxasDirty] = useState(false);
  const taxasJsonSrv = (mesQ.data as any)?.taxas ? JSON.stringify((mesQ.data as any).taxas) : null;
  React.useEffect(() => {
    if (taxasJsonSrv === null) return;
    setTaxasRows(JSON.parse(taxasJsonSrv).map((t: any) => ({ descricao: t.descricao, valor: String(t.valor).replace(".", ",") })));
    setTaxasDirty(false);
  }, [taxasJsonSrv, mesStr]);
  const handleSalvarTaxas = () => {
    salvarTaxas.mutate({
      companyId, mes: mesStr,
      taxas: taxasRows.map(r => ({ descricao: r.descricao.trim() || "Taxa administrativa", valor: parseBRL(r.valor) })).filter(t => t.valor > 0),
    });
  };

  const monthStatus = useMemo(() => {
    const out: Record<number, MonthDotStatus> = {};
    for (let m = 1; m <= 12; m++) {
      const k = `${ano}-${String(m).padStart(2, "0")}`;
      const r = (resumoQ.data as any)?.[k];
      out[m] = r?.status === "consolidado" || r?.status === "enviado" ? "consolidated" : (r?.qtd > 0 ? "data" : "none");
    }
    return out;
  }, [resumoQ.data, ano]);

  const lancsFiltrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return lancs;
    return lancs.filter((l: any) => (l.nome ?? "").toLowerCase().includes(b));
  }, [lancs, busca]);

  const handleFile = async (f: File) => {
    if (f.size > 15 * 1024 * 1024) { toast.error("Arquivo excede 15 MB."); return; }
    const b64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] ?? "");
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    anexar.mutate({ companyId, mes: mesStr, fileName: f.name, fileBase64: b64, contentType: f.type || "application/octet-stream" });
  };

  const salvarLinha = (l: any) => {
    const e = edits[l.id];
    if (!e) return;
    atualizar.mutate({ companyId, id: l.id, diasTrabalhados: parseInt(e.dias, 10) || 0, valorDiario: e.valor });
    setEdits(prev => { const n = { ...prev }; delete n[l.id]; return n; });
  };

  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.aberto;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center"><Bus className="w-5 h-5 text-white" /></div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Vale Transporte</h1>
            <p className="text-xs text-gray-500">Lançamento mensal por colaborador · consolidação · envio ao Financeiro</p>
          </div>
          <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
        </div>

        <PeriodSelectorCard ano={ano} mes={mes} onAno={setAno} onMes={(m) => { setMes(m); setEdits({}); }} monthStatus={monthStatus} showLegend />

        {/* Cards resumo */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600 bg-blue-50 rounded-lg p-1.5" />
            <div><div className="text-lg font-bold">{lancs.length}</div><div className="text-xs text-gray-500">Colaboradores no mês</div></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-green-600 bg-green-50 rounded-lg p-1.5" />
            <div><div className="text-lg font-bold">{fmtBRL(total)}</div><div className="text-xs text-gray-500">Total do mês</div></div>
          </CardContent></Card>
          <Card className="col-span-2 md:col-span-1"><CardContent className="p-4 flex items-start gap-3">
            <Paperclip className="w-8 h-8 text-indigo-600 bg-indigo-50 rounded-lg p-1.5 shrink-0" />
            <div className="min-w-0 flex-1">
              {anexos.length > 0 ? (
                <div className="space-y-0.5">
                  {anexos.map((a: any) => (
                    <div key={a.url} className="flex items-center gap-1">
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-indigo-700 underline break-all line-clamp-1 flex-1" title={a.nome}>{a.nome}</a>
                      <button type="button" className="text-red-400 hover:text-red-600 shrink-0" title="Remover anexo"
                        onClick={() => removerAnexo.mutate({ companyId, mes: mesStr, url: a.url })} disabled={removerAnexo.isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : <div className="text-sm font-semibold text-gray-400">Sem boleto anexado</div>}
              <button type="button" className="text-xs text-blue-600 underline" onClick={() => fileRef.current?.click()} disabled={anexar.isPending}>
                {anexar.isPending ? "Enviando..." : anexos.length > 0 ? "+ Adicionar outro boleto" : "Anexar boleto (PDF/JPEG/DOC)"}
              </button>
              <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); fs.forEach((f) => handleFile(f)); e.target.value = ""; }} />
            </div>
          </CardContent></Card>
        </div>

        {/* Taxas administrativas (uma por boleto/fornecedor) */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-600" /> Taxas administrativas
                {totalTaxas > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{fmtBRL(totalTaxas)}</Badge>}
              </div>
              {status !== "enviado" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setTaxasRows(p => [...p, { descricao: "", valor: "" }]); setTaxasDirty(true); }}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar taxa
                  </Button>
                  {taxasDirty && (
                    <Button size="sm" onClick={handleSalvarTaxas} disabled={salvarTaxas.isPending}>
                      {salvarTaxas.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar taxas
                    </Button>
                  )}
                </div>
              )}
            </div>
            {taxasRows.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhuma taxa lançada. Ex.: taxa administrativa do boleto de cada fornecedor.</p>
            ) : (
              <div className="space-y-1.5">
                {taxasRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder={`Descrição (ex.: Taxa adm. fornecedor ${i + 1})`}
                      value={r.descricao}
                      disabled={status === "enviado"}
                      onChange={(ev) => { setTaxasRows(p => p.map((x, j) => j === i ? { ...x, descricao: ev.target.value } : x)); setTaxasDirty(true); }}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Valor (R$)"
                      value={r.valor}
                      disabled={status === "enviado"}
                      onChange={(ev) => { setTaxasRows(p => p.map((x, j) => j === i ? { ...x, valor: ev.target.value } : x)); setTaxasDirty(true); }}
                      className="w-28 text-right"
                      inputMode="decimal"
                    />
                    {status !== "enviado" && (
                      <button type="button" className="text-red-400 hover:text-red-600" title="Remover taxa"
                        onClick={() => { setTaxasRows(p => p.filter((_, j) => j !== i)); setTaxasDirty(true); }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {totalTaxas > 0 && (
              <p className="text-xs text-gray-500">Colaboradores {fmtBRL(totalColaboradores)} + taxas {fmtBRL(totalTaxas)} = <b className="text-gray-700">{fmtBRL(total)}</b> (valor que vai ao Financeiro).</p>
            )}
          </CardContent>
        </Card>

        {/* Ações */}
        <div className="flex flex-wrap gap-2">
          {aberto && (
            <Button size="sm" onClick={() => setDlgAdd(true)}><Plus className="w-4 h-4 mr-1" /> Adicionar colaboradores</Button>
          )}
          {aberto && lancs.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => consolidar.mutate({ companyId, mes: mesStr })} disabled={consolidar.isPending}>
              {consolidar.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Lock className="w-4 h-4 mr-1" />} Consolidar mês
            </Button>
          )}
          {status === "consolidado" && (
            <>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { setVencimento(""); setDlgEnviar(true); }}>
                <Send className="w-4 h-4 mr-1" /> Enviar para Financeiro
              </Button>
              <Button size="sm" variant="outline" onClick={() => reabrir.mutate({ companyId, mes: mesStr })} disabled={reabrir.isPending}>
                <Unlock className="w-4 h-4 mr-1" /> Reabrir
              </Button>
            </>
          )}
          {status === "enviado" && (
            <>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 h-8 px-3">
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Título #{mesInfo?.entryId} {mesQ.data?.entry ? `· ${fmtBRL(parseFloat(mesQ.data.entry.valor) || 0)} · ${mesQ.data.entry.status}` : ""}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => { if (confirm("Reabrir o mês cancela o título no Financeiro (se ainda sem pagamento). Continuar?")) reabrir.mutate({ companyId, mes: mesStr }); }} disabled={reabrir.isPending}>
                <Unlock className="w-4 h-4 mr-1" /> Reabrir / cancelar título
              </Button>
            </>
          )}
        </div>

        {/* Tabela de lançamentos */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm">Lançamentos de {String(mes).padStart(2, "0")}/{ano}</CardTitle>
            <div className="relative w-56">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
              <Input className="pl-8 h-9" placeholder="Buscar colaborador..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {mesQ.isLoading ? (
              <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
            ) : lancsFiltrados.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                Nenhum lançamento neste mês.{aberto && " Clique em \"Adicionar colaboradores\" para começar."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                      <th className="px-4 py-2">Colaborador</th>
                      <th className="px-2 py-2 w-28 text-center">Dias trab.</th>
                      <th className="px-2 py-2 w-32 text-center">Passagem/dia (R$)</th>
                      <th className="px-2 py-2 w-28 text-right">Total mês</th>
                      {aberto && <th className="px-2 py-2 w-24"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lancsFiltrados.map((l: any) => {
                      const e = edits[l.id];
                      return (
                        <tr key={l.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900">{l.nome ?? `Funcionário #${l.employeeId}`}</div>
                            <div className="text-xs text-gray-400">{l.funcao ?? ""}</div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {aberto ? (
                              <Input className="h-8 w-16 mx-auto text-center" inputMode="numeric" value={e?.dias ?? String(l.diasTrabalhados)} onChange={(ev) => setEdits(p => ({ ...p, [l.id]: { dias: ev.target.value, valor: p[l.id]?.valor ?? (l.valorDiario ?? "0,00") } }))} />
                            ) : l.diasTrabalhados}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {aberto ? (
                              <Input className="h-8 w-24 mx-auto text-center" inputMode="decimal" value={e?.valor ?? (l.valorDiario ?? "0,00")} onChange={(ev) => setEdits(p => ({ ...p, [l.id]: { dias: p[l.id]?.dias ?? String(l.diasTrabalhados), valor: ev.target.value } }))} />
                            ) : (l.valorDiario ?? "0,00")}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold">{fmtBRL(e ? (parseInt(e.dias, 10) || 0) * parseBRL(e.valor) : parseBRL(l.valorTotal))}</td>
                          {aberto && (
                            <td className="px-2 py-2 text-right whitespace-nowrap">
                              {e && (
                                <Button size="sm" variant="outline" className="h-7 px-2 mr-1" onClick={() => salvarLinha(l)} disabled={atualizar.isPending}>Salvar</Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => { if (confirm(`Remover ${l.nome} do mês?`)) remover.mutate({ companyId, id: l.id }); }} disabled={remover.isPending}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-4 py-2">Total ({lancs.length} colaborador{lancs.length === 1 ? "" : "es"})</td>
                      <td colSpan={2}></td>
                      <td className="px-2 py-2 text-right text-green-700">{fmtBRL(total)}</td>
                      {aberto && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog: adicionar colaboradores */}
        <Dialog open={dlgAdd} onOpenChange={setDlgAdd}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adicionar colaboradores — {String(mes).padStart(2, "0")}/{ano}</DialogTitle>
              <DialogDescription>Marque quem recebe vale-transporte. O valor da passagem vem do cadastro (ajustável depois na tabela).</DialogDescription>
            </DialogHeader>
            {elegQ.isLoading ? (
              <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-gray-400" /></div>
            ) : (
              <div className="space-y-1">
                <Input
                  placeholder="Buscar colaborador..."
                  value={buscaAdd}
                  onChange={(ev) => setBuscaAdd(ev.target.value)}
                  className="mb-2"
                />
                <div className="flex justify-between text-xs text-gray-500 pb-1">
                  <button type="button" className="underline" onClick={() => setSelIds(new Set((elegQ.data ?? []).filter((e: any) => !e.jaLancado && e.recebeVT).map((e: any) => e.id)))}>Marcar todos com VT no cadastro</button>
                  <button type="button" className="underline" onClick={() => setSelIds(new Set())}>Limpar</button>
                </div>
                {elegFiltrados.length === 0 && (
                  <div className="text-sm text-gray-400 text-center py-4">Nenhum colaborador encontrado.</div>
                )}
                {elegFiltrados.map((e: any) => (
                  <label key={e.id} className={`flex items-center gap-2 p-2 rounded-lg border ${e.jaLancado ? "opacity-40" : "hover:bg-gray-50 cursor-pointer"}`}>
                    <Checkbox checked={selIds.has(e.id)} disabled={e.jaLancado} onCheckedChange={(c) => setSelIds(prev => { const n = new Set(prev); c ? n.add(e.id) : n.delete(e.id); return n; })} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium break-words">{e.nome}</div>
                      <div className="text-xs text-gray-400">{e.funcao ?? ""} {e.jaLancado && "· já lançado"}</div>
                    </div>
                    {e.recebeVT ? (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">VT {e.valorDiarioSugerido > 0 ? fmtBRL(e.valorDiarioSugerido) + "/dia" : ""}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-gray-400">sem VT no cadastro</Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDlgAdd(false)}>Cancelar</Button>
              <Button onClick={() => gerar.mutate({ companyId, mes: mesStr, employeeIds: Array.from(selIds) })} disabled={selIds.size === 0 || gerar.isPending}>
                {gerar.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Lançar {selIds.size} selecionado(s)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: enviar para financeiro */}
        <Dialog open={dlgEnviar} onOpenChange={setDlgEnviar}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enviar para o Financeiro</DialogTitle>
              <DialogDescription>
                Será criado UM título no Contas a Pagar de <b>{fmtBRL(total)}</b> ({lancs.length} colaboradores), categoria VALE TRANSPORTE, com a relação de todos os colaboradores{anexos.length > 0 ? ` e ${anexos.length} boleto(s) anexado(s)` : ""}.
              </DialogDescription>
            </DialogHeader>
            {anexos.length === 0 && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> Nenhum boleto anexado ainda — você pode anexar depois; o arquivo também aparece no título do Financeiro.
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Data de vencimento do boleto</Label>
              <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDlgEnviar(false)}>Cancelar</Button>
              <Button className="bg-green-600 hover:bg-green-700" disabled={enviar.isPending} onClick={() => enviar.mutate({ companyId, mes: mesStr, dataVencimento: vencimento || undefined })}>
                {enviar.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} <Send className="w-4 h-4 mr-1" /> Confirmar envio
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
