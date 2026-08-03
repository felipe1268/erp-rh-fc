/**
 * Outras Receitas em Folha (módulo RH).
 * Lançamentos mensais manuais de PROVENTO por funcionário e competência
 * (reembolso, bonificação, outros). Somam no líquido da Folha de Pagamento;
 * natureza indenizatória — fora da base de INSS/IRRF/FGTS.
 */
import DashboardLayout from "@/components/DashboardLayout";
import MonthSelector from "@/components/MonthSelector";
import PersonPhoto from "@/components/PersonPhoto";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { removeAccents } from "@/lib/searchUtils";

const nomeEmp = (e: any): string => String(e?.nomeCompleto || e?.nome || "");
import {
  BadgeDollarSign, Plus, Trash2, Pencil, Search, Loader2, ReceiptText,
  Gift, MoreHorizontal, AlertTriangle,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

const TIPOS = [
  { key: "reembolso", label: "Reembolso", Icon: ReceiptText, color: "text-emerald-700", bg: "bg-emerald-100 text-emerald-800", hint: "Ex.: reembolso de despesas — soma no líquido da folha" },
  { key: "bonificacao", label: "Bonificação", Icon: Gift, color: "text-blue-700", bg: "bg-blue-100 text-blue-800", hint: "Soma no líquido da folha" },
  { key: "outros", label: "Outras Receitas", Icon: MoreHorizontal, color: "text-slate-700", bg: "bg-slate-100 text-slate-700", hint: "Soma no líquido da folha" },
] as const;
type TipoKey = typeof TIPOS[number]["key"];

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseValorBR = (s: string): number => {
  const limpo = s.replace(/[^\d.,-]/g, "");
  let normalizado: string;
  if (limpo.includes(",")) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else {
    normalizado = limpo;
  }
  const n = Number(normalizado);
  return isNaN(n) ? 0 : n;
};

function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FolhaProventos() {
  const { selectedCompanyId } = useCompany();
  // CompanyContext guarda o id como STRING — sem Number() o tRPC rejeita
  const companyId = Number(selectedCompanyId) || 0;
  const [mes, setMes] = useState(mesAtual());
  const [tipoAtivo, setTipoAtivo] = useState<TipoKey | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState<any | null>(null);

  const [formEmpId, setFormEmpId] = useState<number | null>(null);
  const [formEmpBusca, setFormEmpBusca] = useState("");
  const [formTipo, setFormTipo] = useState<TipoKey>("reembolso");
  const [formValor, setFormValor] = useState("");
  const [formDescricao, setFormDescricao] = useState("");

  const utils = trpc.useUtils();
  const { data: proventos = [], isLoading } = trpc.folhaProventos.list.useQuery(
    { companyId, mesReferencia: mes },
    { enabled: !!companyId },
  );
  const { data: emps = [] } = trpc.employees.list.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const invalidate = () => utils.folhaProventos.list.invalidate({ companyId, mesReferencia: mes });

  const criarMut = trpc.folhaProventos.criar.useMutation({
    onSuccess: () => { toast.success("Provento lançado"); invalidate(); fecharDialog(); },
    onError: (e) => toast.error(e.message || "Erro ao lançar provento"),
  });
  const atualizarMut = trpc.folhaProventos.atualizar.useMutation({
    onSuccess: () => { toast.success("Provento atualizado"); invalidate(); fecharDialog(); },
    onError: (e) => toast.error(e.message || "Erro ao atualizar"),
  });
  const excluirMut = trpc.folhaProventos.excluir.useMutation({
    onSuccess: () => { toast.success("Provento excluído"); invalidate(); setConfirmExcluir(null); },
    onError: (e) => toast.error(e.message || "Erro ao excluir"),
  });

  const empsAtivos = useMemo(() =>
    (emps as any[])
      .filter((e) => !["Desligado", "Lista_Negra", "Inativo"].includes(e.status))
      .sort((a, b) => nomeEmp(a).localeCompare(nomeEmp(b))),
    [emps]);

  const empsFiltrados = useMemo(() => {
    if (!formEmpBusca.trim()) return empsAtivos.slice(0, 50);
    const q = removeAccents(formEmpBusca.toLowerCase());
    return empsAtivos.filter((e) => removeAccents(nomeEmp(e).toLowerCase()).includes(q)).slice(0, 50);
  }, [empsAtivos, formEmpBusca]);

  const listaFiltrada = useMemo(() => {
    let l = proventos as any[];
    if (tipoAtivo !== "todos") l = l.filter((d) => d.tipo === tipoAtivo);
    if (busca.trim()) {
      const q = removeAccents(busca.toLowerCase());
      l = l.filter((d) => removeAccents((d.employeeNome || "").toLowerCase()).includes(q));
    }
    return l;
  }, [proventos, tipoAtivo, busca]);

  const totaisPorTipo = useMemo(() => {
    const t: Record<string, { qtd: number; valor: number }> = {};
    for (const d of proventos as any[]) {
      if (!t[d.tipo]) t[d.tipo] = { qtd: 0, valor: 0 };
      t[d.tipo].qtd++;
      t[d.tipo].valor += parseValorBR(String(d.valor));
    }
    return t;
  }, [proventos]);
  const totalGeral = Object.values(totaisPorTipo).reduce((s, t) => s + t.valor, 0);

  function abrirNovo() {
    setEditando(null);
    setFormEmpId(null);
    setFormEmpBusca("");
    setFormTipo(tipoAtivo !== "todos" ? tipoAtivo : "reembolso");
    setFormValor("");
    setFormDescricao("");
    setDialogOpen(true);
  }
  function abrirEdicao(d: any) {
    setEditando(d);
    setFormEmpId(d.employeeId);
    setFormEmpBusca(d.employeeNome || "");
    setFormTipo(d.tipo);
    setFormValor(String(d.valor).replace(".", ","));
    setFormDescricao(d.descricao || "");
    setDialogOpen(true);
  }
  function fecharDialog() {
    setDialogOpen(false);
    setEditando(null);
  }
  function salvar() {
    const valor = parseValorBR(formValor);
    if (valor <= 0) { toast.error("Informe um valor maior que zero"); return; }
    if (editando) {
      atualizarMut.mutate({ id: editando.id, valor, descricao: formDescricao, tipo: formTipo });
    } else {
      if (!formEmpId) { toast.error("Selecione o funcionário"); return; }
      criarMut.mutate({ companyId, employeeId: formEmpId, mesReferencia: mes, tipo: formTipo, valor, descricao: formDescricao || undefined });
    }
  }

  const isSaving = criarMut.isPending || atualizarMut.isPending;
  const tipoInfo = (k: string) => TIPOS.find((t) => t.key === k);

  return (
    <DashboardLayout title="Outras Receitas em Folha">
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><BadgeDollarSign className="h-5 w-5 text-emerald-700" /></div>
            <div>
              <h1 className="text-lg font-bold">Outras Receitas em Folha</h1>
              <p className="text-xs text-muted-foreground">Reembolsos, bonificações e outros proventos — somam automaticamente no líquido da Folha de Pagamento da competência (fora da base de INSS/IRRF).</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MonthSelector value={mes} onChange={setMes} />
            <Button onClick={abrirNovo} className="gap-1.5"><Plus className="h-4 w-4" />Lançar Provento</Button>
          </div>
        </div>

        {/* Cards por tipo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={() => setTipoAtivo("todos")} className={cn("rounded-xl border p-3 text-left transition", tipoAtivo === "todos" ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300" : "bg-white hover:bg-slate-50")}>
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Todos</p>
            <p className="text-lg font-bold">{fmtBRL(totalGeral)}</p>
            <p className="text-[11px] text-muted-foreground">{(proventos as any[]).length} lançamento(s)</p>
          </button>
          {TIPOS.map((t) => (
            <button key={t.key} onClick={() => setTipoAtivo(t.key)} className={cn("rounded-xl border p-3 text-left transition", tipoAtivo === t.key ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300" : "bg-white hover:bg-slate-50")}>
              <div className="flex items-center gap-1.5">
                <t.Icon className={cn("h-3.5 w-3.5", t.color)} />
                <p className="text-[11px] font-semibold uppercase text-muted-foreground leading-tight">{t.label}</p>
              </div>
              <p className="text-lg font-bold">{fmtBRL(totaisPorTipo[t.key]?.valor || 0)}</p>
              <p className="text-[11px] text-muted-foreground">{totaisPorTipo[t.key]?.qtd || 0} lançamento(s)</p>
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar funcionário..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
        </div>

        {/* Lista */}
        <div className="rounded-xl border bg-white overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
          ) : listaFiltrada.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum provento lançado nesta competência{tipoAtivo !== "todos" ? " para este tipo" : ""}.</div>
          ) : (
            <div className="divide-y">
              {listaFiltrada.map((d: any) => {
                const t = tipoInfo(d.tipo);
                return (
                  <div key={d.id} className="flex items-center gap-3 p-3">
                    <PersonPhoto src={d.employeeFotoUrl} alt={d.employeeNome || "?"} size="sm" caption={d.employeeFuncao || undefined} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold break-words">{d.employeeNome || "—"}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {t && <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold", t.bg)}>{t.label}</span>}
                        {d.employeeFuncao && <span className="text-[11px] text-muted-foreground">{d.employeeFuncao}</span>}
                        {d.descricao && <span className="text-[11px] text-muted-foreground break-words">• {d.descricao}</span>}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-emerald-700 whitespace-nowrap">+ {fmtBRL(parseValorBR(String(d.valor)))}</p>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setConfirmExcluir(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dialog lançar/editar */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) fecharDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Provento" : "Lançar Provento"} — {mes.split("-").reverse().join("/")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Funcionário (combobox digitável — iPad friendly) */}
            <div>
              <label className="text-xs font-semibold">Funcionário</label>
              {editando ? (
                <p className="text-sm mt-1 font-medium">{editando.employeeNome}</p>
              ) : (
                <div className="mt-1">
                  <Input
                    placeholder="Digite o nome..."
                    value={formEmpBusca}
                    onChange={(e) => { setFormEmpBusca(e.target.value); setFormEmpId(null); }}
                  />
                  {!formEmpId && formEmpBusca.trim().length > 0 && (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-white shadow-sm">
                      {empsFiltrados.length === 0 ? (
                        <p className="p-2 text-xs text-muted-foreground">Nenhum funcionário encontrado</p>
                      ) : empsFiltrados.map((e: any) => (
                        <button key={e.id} className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-slate-50" onClick={() => { setFormEmpId(e.id); setFormEmpBusca(nomeEmp(e)); }}>
                          {nomeEmp(e)}<span className="text-[11px] text-muted-foreground ml-1.5">{e.funcao || ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Tipo */}
            <div>
              <label className="text-xs font-semibold">Tipo de Provento</label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {TIPOS.map((t) => (
                  <button key={t.key} onClick={() => setFormTipo(t.key)} className={cn("rounded-lg border px-2 py-1.5 text-xs text-left flex items-center gap-1.5", formTipo === t.key ? "border-emerald-400 bg-emerald-50 font-semibold" : "hover:bg-slate-50")}>
                    <t.Icon className={cn("h-3.5 w-3.5 shrink-0", t.color)} />
                    <span className="break-words">{t.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{tipoInfo(formTipo)?.hint}</p>
            </div>
            {/* Valor */}
            <div>
              <label className="text-xs font-semibold">Valor (R$)</label>
              <Input inputMode="decimal" placeholder="0,00" value={formValor} onChange={(e) => setFormValor(e.target.value)} className="mt-1" />
            </div>
            {/* Descrição */}
            <div>
              <label className="text-xs font-semibold">Descrição / Observação (opcional)</label>
              <Textarea rows={2} value={formDescricao} onChange={(e) => setFormDescricao(e.target.value)} className="mt-1" placeholder="Ex.: reembolso de combustível — viagem obra X" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharDialog} disabled={isSaving}>Cancelar</Button>
            <Button onClick={salvar} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {editando ? "Salvar" : "Lançar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão (Poka-Yoke) */}
      <Dialog open={!!confirmExcluir} onOpenChange={(o) => { if (!o) setConfirmExcluir(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" />Excluir provento?</DialogTitle>
          </DialogHeader>
          {confirmExcluir && (
            <p className="text-sm break-words">
              <b>{tipoInfo(confirmExcluir.tipo)?.label}</b> de <b>{fmtBRL(parseValorBR(String(confirmExcluir.valor)))}</b> do funcionário <b>{confirmExcluir.employeeNome}</b> na competência {mes.split("-").reverse().join("/")}. O valor deixará de ser somado na folha.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmExcluir(null)} disabled={excluirMut.isPending}>Cancelar</Button>
            <Button variant="destructive" onClick={() => excluirMut.mutate({ id: confirmExcluir.id })} disabled={excluirMut.isPending}>
              {excluirMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
