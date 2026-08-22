// Rev. 2146 — Painel "Termo de Recebimento" da aba Controle de Documentos.
// Lista TODOS os termos de responsabilidade emitidos (vários por colaborador),
// permite criar novo (com seletor de colaborador), visualizar/baixar o
// documento assinado e excluir (admin_master, soft-delete via signatures.adminDelete).
// Substitui o entry point antigo na ficha do colaborador (Rev. 2137).
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Plus, Search, Eye, Download, Trash2, Loader2, ShieldAlert, ChevronRight, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import FCSignSendDialog from "@/components/FCSignSendDialog";
import TermoResponsabilidadeDialog from "@/components/TermoResponsabilidadeDialog";
import { formatCPF } from "@/lib/formatters";

type Props = {
  companyId: number;
  companyIds?: number[];
  onClickEmployee: (id: number) => void;
};

type SessionRow = {
  id: number;
  companyId: number;
  employeeId: number;
  tipo: string;
  documentTitle: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  createdByName: string;
  finalDocumentUrl: string | null;
  finalEmployeeDocumentId: number | null;
  empNome: string | null;
  empCpf: string | null;
  empMatricula: string | null;
  empFuncao: string | null;
  signers: Array<{ role: string; nome: string; ordem: number | null; signedAt: string | null; token: string }>;
};

function statusBadge(s: string) {
  switch (s) {
    case "completo":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Assinado</Badge>;
    case "em_andamento":
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Em coleta</Badge>;
    case "pendente":
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100">Pendente</Badge>;
    case "cancelado":
      return <Badge className="bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100">Cancelado</Badge>;
    default:
      return <Badge variant="outline">{s}</Badge>;
  }
}

function fmtDateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function TermosResponsabilidadePanel({ companyId, companyIds, onClickEmployee }: Props) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdminMaster = (user as any)?.role === "admin_master";
  const userName = (user as any)?.name || (user as any)?.nome || (user as any)?.email || "Sistema";

  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("ativos");

  // Lista principal
  const { data: termos = [], isLoading } = trpc.signatures.listByTipo.useQuery(
    { companyId, companyIds, tipo: "termo_responsabilidade", includeCancelled: statusFiltro === "todos" || statusFiltro === "cancelado" },
    { enabled: !!companyId }
  );

  // Empresas (pra montar `comp` passado ao TermoResponsabilidadeDialog)
  const { data: companies = [] } = trpc.companies.list.useQuery();
  const compAtiva = useMemo(() => (companies as any[]).find((c: any) => c.id === companyId), [companies, companyId]);
  // Rev. 4984 — colaborador marcado como "JF": o termo sai com os dados do
  // empregador Julio Ferraz (logo, razão social, CNPJ) no lugar da empresa FC.
  const { data: jfCompany } = trpc.companies.empregadorJf.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  // Colaboradores ativos da empresa (pra "Novo Termo")
  const { data: empsRaw = [] } = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });
  const empsAtivos = useMemo(() => (empsRaw as any[]).filter((e: any) => {
    const s = String(e.status || "").toLowerCase();
    return s !== "desligado" && s !== "inativo";
  }), [empsRaw]);

  // Filtros / busca aplicados em memória
  const filtrados = useMemo(() => {
    let arr = termos as SessionRow[];
    if (statusFiltro === "ativos") arr = arr.filter(r => r.status !== "cancelado");
    else if (statusFiltro !== "todos") arr = arr.filter(r => r.status === statusFiltro);
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      arr = arr.filter(r =>
        (r.empNome || "").toLowerCase().includes(s) ||
        (r.empCpf || "").toLowerCase().includes(s) ||
        (r.documentTitle || "").toLowerCase().includes(s) ||
        String(r.id).includes(s)
      );
    }
    return arr;
  }, [termos, statusFiltro, search]);

  // KPIs
  const kpis = useMemo(() => {
    const all = (termos as SessionRow[]).filter(r => r.status !== "cancelado");
    return {
      total: all.length,
      assinados: all.filter(r => r.status === "completo").length,
      pendentes: all.filter(r => r.status !== "completo").length,
      colaboradores: new Set(all.map(r => r.employeeId)).size,
    };
  }, [termos]);

  // Excluir (admin_master)
  const adminDeleteMut = trpc.signatures.adminDelete.useMutation({
    onSuccess: () => {
      utils.signatures.listByTipo.invalidate();
      toast.success("Termo removido.");
    },
    onError: (e) => toast.error(e.message || "Falha ao remover."),
  });

  // Rev. 2149 — Multi-seleção + exclusão em lote
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  async function bulkDelete() {
    if (!isAdminMaster) { toast.error("Apenas o ADM Master pode excluir termos."); return; }
    if (selectedIds.size === 0) return;
    const alvos = (termos as SessionRow[]).filter(r => selectedIds.has(r.id));
    if (!confirm(`Excluir ${alvos.length} termo(s) selecionado(s)? Esta ação cancela as sessões FCSign e remove os documentos do RAIO-X dos colaboradores.`)) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const r of alvos) {
      try {
        await adminDeleteMut.mutateAsync({ id: r.id, companyId: r.companyId });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    clearSelection();
    utils.signatures.listByTipo.invalidate();
    if (fail === 0) toast.success(`${ok} termo(s) removido(s).`);
    else toast.error(`${ok} removido(s), ${fail} falharam.`);
  }

  // Fluxo de criação: 1) escolher colaborador → 2) abrir TermoResponsabilidadeDialog
  const [novoOpen, setNovoOpen] = useState(false);
  const [empSearchNovo, setEmpSearchNovo] = useState("");
  const [novoEmpId, setNovoEmpId] = useState<number | null>(null);

  const empsFiltradosNovo = useMemo(() => {
    const s = empSearchNovo.toLowerCase().trim();
    if (!s) return empsAtivos.slice(0, 50);
    return empsAtivos.filter((e: any) =>
      (e.nomeCompleto || "").toLowerCase().includes(s) ||
      (e.cpf || "").toLowerCase().includes(s) ||
      (e.matricula || "").toLowerCase().includes(s)
    ).slice(0, 50);
  }, [empsAtivos, empSearchNovo]);

  const empNovo = useMemo(() => (empsAtivos as any[]).find((e: any) => e.id === novoEmpId), [empsAtivos, novoEmpId]);

  // FCSign integrado no painel (pra invalidar listByTipo quando fechar)
  const [fcsignOpen, setFcsignOpen] = useState(false);
  const [fcsignPayload, setFcsignPayload] = useState<any>(null);

  function abrirVisualizar(r: SessionRow) {
    if (r.status === "completo" && r.finalDocumentUrl) {
      window.open(r.finalDocumentUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // Ainda em coleta — abre a tela de assinatura do primeiro signer pendente
    const pendente = r.signers.find(s => !s.signedAt);
    if (pendente) {
      window.open(`${window.location.origin}/assinar/${pendente.token}`, "_blank", "noopener,noreferrer");
      return;
    }
    toast.info("Documento ainda sem URL final disponível.");
  }

  function baixar(r: SessionRow) {
    if (!r.finalDocumentUrl) {
      toast.warning("Disponível apenas após o documento ser totalmente assinado.");
      return;
    }
    const a = document.createElement("a");
    a.href = r.finalDocumentUrl;
    a.download = `${r.documentTitle}.html`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function confirmarExcluir(r: SessionRow) {
    if (!isAdminMaster) {
      toast.error("Apenas o ADM Master pode excluir termos.");
      return;
    }
    if (!confirm(`Excluir o termo "${r.documentTitle}"? Esta ação cancela a sessão FCSign e remove o documento do RAIO-X do colaborador.`)) return;
    adminDeleteMut.mutate({ id: r.id, companyId: r.companyId });
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-indigo-100 bg-indigo-50/50">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-5 w-5 text-indigo-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-indigo-700">{kpis.total}</p>
              <p className="text-[11px] text-muted-foreground">Total de termos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-100 bg-emerald-50/50">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-emerald-700">{kpis.assinados}</p>
              <p className="text-[11px] text-muted-foreground">Assinados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-100 bg-amber-50/50">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-amber-700">{kpis.pendentes}</p>
              <p className="text-[11px] text-muted-foreground">Em coleta / pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-100 bg-slate-50/50">
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-slate-700">{kpis.colaboradores}</p>
              <p className="text-[11px] text-muted-foreground">Colaboradores com termo</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros + Novo */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por colaborador, CPF, nº do termo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFiltro} onValueChange={setStatusFiltro}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativos">Ativos (sem cancelados)</SelectItem>
            <SelectItem value="completo">Assinados</SelectItem>
            <SelectItem value="em_andamento">Em coleta</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="cancelado">Cancelados</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => { setNovoEmpId(null); setEmpSearchNovo(""); setNovoOpen(true); }}
          className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 ml-auto"
          size="sm"
          disabled={!compAtiva}
        >
          <Plus className="h-4 w-4" /> Novo Termo
        </Button>
      </div>

      {/* Rev. 2149 — Barra de ação em lote (aparece quando há seleção) */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 px-3">
          <span className="text-sm font-medium text-indigo-800">
            {selectedIds.size} termo(s) selecionado(s)
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={clearSelection} className="text-indigo-700 hover:bg-indigo-100">
              <X className="h-4 w-4 mr-1" /> Limpar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={bulkDelete}
              disabled={!isAdminMaster || bulkBusy}
              title={isAdminMaster ? "Excluir selecionados" : "Somente admin_master pode excluir"}
              className="gap-1.5"
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-20" />
              <p className="text-sm">Nenhum termo de responsabilidade encontrado.</p>
              <p className="text-xs">Clique em "Novo Termo" pra criar o primeiro.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs">
                    <th className="p-3 w-10 text-left font-medium">
                      {/* Rev. 2149 — Select all visíveis */}
                      <Checkbox
                        aria-label="Selecionar todos visíveis"
                        checked={filtrados.length > 0 && filtrados.every(r => selectedIds.has(r.id))}
                        onCheckedChange={(v) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (v) filtrados.forEach(r => next.add(r.id));
                            else filtrados.forEach(r => next.delete(r.id));
                            return next;
                          });
                        }}
                      />
                    </th>
                    <th className="p-3 text-left font-medium">Colaborador</th>
                    <th className="p-3 text-left font-medium">Termo</th>
                    <th className="p-3 text-left font-medium">Status</th>
                    <th className="p-3 text-left font-medium">Emitido em</th>
                    <th className="p-3 text-left font-medium">Concluído em</th>
                    <th className="p-3 text-left font-medium">Por</th>
                    <th className="p-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(r => (
                    <tr key={r.id} className={`border-b hover:bg-muted/20 transition-colors ${selectedIds.has(r.id) ? "bg-indigo-50/40" : ""}`}>
                      <td className="p-3">
                        <Checkbox
                          aria-label={`Selecionar termo ${r.documentTitle}`}
                          checked={selectedIds.has(r.id)}
                          onCheckedChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => onClickEmployee(r.employeeId)}
                          className="text-left text-indigo-700 hover:underline font-medium"
                        >
                          {r.empNome || `#${r.employeeId}`}
                        </button>
                        {r.empCpf && <div className="text-[11px] text-muted-foreground">CPF {formatCPF(r.empCpf)}</div>}
                      </td>
                      <td className="p-3 font-mono text-xs">{r.documentTitle}</td>
                      <td className="p-3">{statusBadge(r.status)}</td>
                      <td className="p-3 text-xs">{fmtDateBr(r.createdAt)}</td>
                      <td className="p-3 text-xs">{fmtDateBr(r.completedAt)}</td>
                      <td className="p-3 text-xs">{r.createdByName}</td>
                      <td className="p-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" title="Visualizar" onClick={() => abrirVisualizar(r)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Baixar HTML assinado" onClick={() => baixar(r)} disabled={r.status !== "completo"}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={isAdminMaster ? "Excluir (admin_master)" : "Somente admin_master pode excluir"}
                            onClick={() => confirmarExcluir(r)}
                            disabled={!isAdminMaster || adminDeleteMut.isPending}
                            className={isAdminMaster ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50" : ""}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Dialog: Escolher colaborador para Novo Termo (Rev. 2151 — FC look) ===== */}
      <Dialog open={novoOpen && !novoEmpId} onOpenChange={(v) => { if (!v) setNovoOpen(false); }}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
          <div
            className="px-6 py-4 border-b-2 border-white"
            style={{ backgroundColor: "#1B2A4A", printColorAdjust: "exact" as any }}
          >
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle
                className="text-white text-base font-bold uppercase flex items-center gap-2"
                style={{ letterSpacing: "3px" }}
              >
                <Plus className="h-4 w-4" />
                Novo Termo de Recebimento
              </DialogTitle>
              <DialogDescription className="text-indigo-100 text-xs leading-relaxed">
                Escolha o colaborador para emitir o termo. Cada colaborador pode ter
                vários termos (entregas diferentes em datas diferentes).
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-4 space-y-3 bg-slate-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF ou matrícula..."
                value={empSearchNovo}
                onChange={(e) => setEmpSearchNovo(e.target.value)}
                className="pl-10 bg-white"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Colaboradores ativos
              </p>
              <Badge variant="secondary" className="text-[10px] bg-indigo-100 text-indigo-800 border border-indigo-200">
                {empsFiltradosNovo.length} {empsFiltradosNovo.length === 1 ? "resultado" : "resultados"}
              </Badge>
            </div>

            <div className="border border-slate-200 rounded-lg max-h-[420px] overflow-y-auto divide-y divide-slate-100 bg-white shadow-sm">
              {empsFiltradosNovo.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhum colaborador ativo encontrado.
                </div>
              ) : empsFiltradosNovo.map((e: any) => {
                const iniciais = (e.nomeCompleto || "?")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p: string) => p[0]?.toUpperCase() || "")
                  .join("");
                return (
                  <button
                    key={e.id}
                    onClick={() => setNovoEmpId(e.id)}
                    className="w-full text-left p-3 hover:bg-indigo-50/60 flex items-center gap-3 transition-colors group"
                  >
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm"
                      style={{ backgroundColor: "#1B2A4A" }}
                    >
                      {iniciais}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-slate-800 truncate group-hover:text-indigo-900">
                        {e.nomeCompleto}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate flex items-center gap-2 mt-0.5">
                        {e.cpf && (
                          <span className="font-mono">CPF {formatCPF(e.cpf)}</span>
                        )}
                        {e.funcao && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="uppercase tracking-wide font-medium text-slate-600">{e.funcao}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="px-6 py-3 bg-white border-t">
            <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== TermoResponsabilidadeDialog (composer) — depois que escolheu o colaborador ===== */}
      {novoOpen && novoEmpId && empNovo && compAtiva && (
        <TermoResponsabilidadeDialog
          open={true}
          onOpenChange={(v: boolean) => { if (!v) { setNovoEmpId(null); setNovoOpen(false); } }}
          companyId={companyId}
          employeeId={novoEmpId}
          empNome={empNovo.nomeCompleto || ""}
          empCpf={empNovo.cpf}
          empRg={empNovo.rg}
          empFuncao={empNovo.funcao}
          comp={(empNovo as any).empregadorDocumentos === "JF" && jfCompany ? jfCompany : compAtiva}
          geradoPor={userName}
          isAdminMaster={isAdminMaster}
          onSendToFcSign={(payload: any) => {
            setFcsignPayload(payload);
            setFcsignOpen(true);
            setNovoEmpId(null);
            setNovoOpen(false);
          }}
        />
      )}

      {/* ===== FCSignSendDialog — fecha invalidando listByTipo (fix do bug Rev. 2146) ===== */}
      {fcsignPayload && (
        <FCSignSendDialog
          open={fcsignOpen}
          onOpenChange={(v: boolean) => {
            setFcsignOpen(v);
            if (!v) {
              setFcsignPayload(null);
              // Rev. 2146 — invalida lista pra refletir o termo recém-enviado/assinado
              utils.signatures.listByTipo.invalidate();
              utils.signatures.listByEmployee.invalidate();
              utils.signatures.getForEmployeeTipo.invalidate();
            }
          }}
          companyId={fcsignPayload.companyId}
          employeeId={fcsignPayload.employeeId}
          tipo={fcsignPayload.tipo}
          documentTitle={fcsignPayload.documentTitle}
          documentHtml={fcsignPayload.documentHtml}
          empregadoNome={fcsignPayload.empregadoNome}
          empregadoCpf={fcsignPayload.empregadoCpf}
        />
      )}

      {!isAdminMaster && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" />
          Excluir termos requer perfil ADM Master.
        </p>
      )}
    </div>
  );
}
