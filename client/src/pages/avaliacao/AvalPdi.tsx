// ============================================================================
// Rev. 4672 — FASE 4: PDI (Plano de Desenvolvimento Individual) + FEEDBACKS
// Aba do módulo Avaliação de Desempenho: registre planos de desenvolvimento
// com prazo/progresso e feedbacks estruturados (positivo, construtivo, 1:1).
// ============================================================================
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Loader2, Target, MessageSquare, Plus, Trash2, CheckCircle2, Search } from "lucide-react";

const fmtD = (v?: string | null) => {
  const m = String(v || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const TIPOS_FB = [
  { v: "positivo", l: "Positivo", cls: "bg-green-100 text-green-800 border-green-300" },
  { v: "construtivo", l: "Construtivo", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  { v: "one_on_one", l: "1:1", cls: "bg-blue-100 text-blue-800 border-blue-300" },
] as const;

export default function AvalPdi() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const utils = trpc.useUtils();

  const [busca, setBusca] = useState("");
  const [novoPdi, setNovoPdi] = useState<{ employeeId: number; titulo: string; objetivo: string; acoes: string; prazo: string } | null>(null);
  const [novoFb, setNovoFb] = useState<{ employeeId: number; data: string; tipo: string; resumo: string } | null>(null);

  const { data: emps = [] } = trpc.employees.list.useQuery(
    { companyId, excludeTerminated: true } as any, { enabled: !!companyId }
  );
  const { data: pdis = [], isLoading: loadingPdi } = trpc.avaliacaoPdi.listarPdis.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: fbs = [], isLoading: loadingFb } = trpc.avaliacaoPdi.listarFeedbacks.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const invalidar = () => { utils.avaliacaoPdi.listarPdis.invalidate(); utils.avaliacaoPdi.listarFeedbacks.invalidate(); };
  const criarPdiMut = trpc.avaliacaoPdi.criarPdi.useMutation({
    onSuccess: () => { toast.success("PDI criado!"); setNovoPdi(null); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarPdiMut = trpc.avaliacaoPdi.atualizarPdi.useMutation({
    onSuccess: () => invalidar(), onError: (e) => toast.error(e.message),
  });
  const excluirPdiMut = trpc.avaliacaoPdi.excluirPdi.useMutation({
    onSuccess: () => { toast.success("PDI excluído."); invalidar(); }, onError: (e) => toast.error(e.message),
  });
  const criarFbMut = trpc.avaliacaoPdi.criarFeedback.useMutation({
    onSuccess: () => { toast.success("Feedback registrado!"); setNovoFb(null); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirFbMut = trpc.avaliacaoPdi.excluirFeedback.useMutation({
    onSuccess: () => { toast.success("Feedback excluído."); invalidar(); }, onError: (e) => toast.error(e.message),
  });

  const q = busca.trim().toLowerCase();
  const filtraEmp = (r: any) => !q || (r.empregado?.nomeCompleto || "").toLowerCase().includes(q);
  const pdisFilt = useMemo(() => (pdis as any[]).filter(filtraEmp), [pdis, q]);
  const fbsFilt = useMemo(() => (fbs as any[]).filter(filtraEmp), [fbs, q]);

  const SelEmp = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <select className="w-full h-8 text-xs border rounded px-2 bg-white" value={value} onChange={e => onChange(parseInt(e.target.value, 10))}>
      <option value={0}>Selecione o colaborador…</option>
      {(emps as any[]).map((e: any) => <option key={e.id} value={e.id}>{e.nomeCompleto}</option>)}
    </select>
  );

  const stPdi = (s: string) =>
    s === "concluido" ? <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">Concluído</Badge>
    : s === "cancelado" ? <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">Cancelado</Badge>
    : <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px]">Em andamento</Badge>;

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar por colaborador…" className="pl-7 h-8 text-xs" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* PDIs */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-[#0A1E3C]" /> Planos de Desenvolvimento (PDI)
            </CardTitle>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"
              onClick={() => setNovoPdi({ employeeId: 0, titulo: "", objetivo: "", acoes: "", prazo: "" })}>
              <Plus className="h-3 w-3" /> Novo PDI
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-[65vh] overflow-y-auto">
            {loadingPdi ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#0A1E3C]" /></div>
            : pdisFilt.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum PDI registrado.</p>
            : pdisFilt.map((p: any) => (
              <div key={p.id} className="border rounded px-2 py-1.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-medium block break-words">{p.titulo}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {p.empregado?.nomeCompleto || `#${p.employeeId}`}{p.prazo ? ` · Prazo ${fmtD(p.prazo)}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {stPdi(p.status)}
                    {p.status === "em_andamento" ? (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-700" title="Concluir"
                        disabled={atualizarPdiMut.isPending}
                        onClick={() => atualizarPdiMut.mutate({ id: p.id, status: "concluido" })}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-600" disabled={excluirPdiMut.isPending}
                      onClick={() => { if (confirm("Excluir este PDI?")) excluirPdiMut.mutate({ id: p.id }); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {p.objetivo ? <p className="text-[10px] text-muted-foreground break-words"><b>Objetivo:</b> {p.objetivo}</p> : null}
                {p.acoes ? <p className="text-[10px] text-muted-foreground break-words"><b>Ações:</b> {p.acoes}</p> : null}
                {p.status === "em_andamento" ? (
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={100} step={5} defaultValue={p.progresso ?? 0} className="flex-1 h-1.5 accent-[#EE9803]"
                      onMouseUp={(e: any) => atualizarPdiMut.mutate({ id: p.id, progresso: parseInt(e.target.value, 10) })}
                      onTouchEnd={(e: any) => atualizarPdiMut.mutate({ id: p.id, progresso: parseInt(e.target.value, 10) })} />
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{p.progresso ?? 0}%</span>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Feedbacks */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#0A1E3C]" /> Registros de Feedback
            </CardTitle>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1"
              onClick={() => setNovoFb({ employeeId: 0, data: hojeIso(), tipo: "one_on_one", resumo: "" })}>
              <Plus className="h-3 w-3" /> Novo feedback
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-[65vh] overflow-y-auto">
            {loadingFb ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#0A1E3C]" /></div>
            : fbsFilt.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum feedback registrado.</p>
            : fbsFilt.map((f: any) => {
              const t = TIPOS_FB.find(x => x.v === f.tipo);
              return (
                <div key={f.id} className="border rounded px-2 py-1.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-medium block break-words">{f.empregado?.nomeCompleto || `#${f.employeeId}`}</span>
                      <span className="text-[10px] text-muted-foreground">{fmtD(f.data)}{f.autorNome ? ` · por ${f.autorNome}` : ""}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge className={`${t?.cls || ""} text-[10px]`}>{t?.l || f.tipo}</Badge>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-600" disabled={excluirFbMut.isPending}
                        onClick={() => { if (confirm("Excluir este feedback?")) excluirFbMut.mutate({ id: f.id }); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] break-words">{f.resumo}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Dialog novo PDI */}
      <Dialog open={!!novoPdi} onOpenChange={(o) => { if (!o) setNovoPdi(null); }}>
        <DialogContent className="max-w-md w-[96vw]" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="text-base">Novo PDI</DialogTitle></DialogHeader>
          {novoPdi ? (
            <div className="space-y-2 text-xs">
              <div><label className="font-medium">Colaborador *</label><div className="mt-0.5"><SelEmp value={novoPdi.employeeId} onChange={v => setNovoPdi({ ...novoPdi, employeeId: v })} /></div></div>
              <div><label className="font-medium">Título *</label><Input className="h-8 text-xs mt-0.5" placeholder="Ex.: Desenvolver liderança de equipe" value={novoPdi.titulo} onChange={e => setNovoPdi({ ...novoPdi, titulo: e.target.value })} /></div>
              <div><label className="font-medium">Objetivo</label><Textarea className="text-xs mt-0.5 min-h-[56px]" value={novoPdi.objetivo} onChange={e => setNovoPdi({ ...novoPdi, objetivo: e.target.value })} /></div>
              <div><label className="font-medium">Ações planejadas</label><Textarea className="text-xs mt-0.5 min-h-[56px]" placeholder="Cursos, mentorias, entregas…" value={novoPdi.acoes} onChange={e => setNovoPdi({ ...novoPdi, acoes: e.target.value })} /></div>
              <div><label className="font-medium">Prazo</label><Input type="date" className="h-8 text-xs mt-0.5" value={novoPdi.prazo} onChange={e => setNovoPdi({ ...novoPdi, prazo: e.target.value })} /></div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setNovoPdi(null)}>Cancelar</Button>
            <Button size="sm" className="bg-[#0A1E3C] hover:bg-[#0A1E3C]/90" disabled={criarPdiMut.isPending}
              onClick={() => {
                if (!novoPdi) return;
                if (!novoPdi.employeeId) { toast.error("Selecione o colaborador."); return; }
                if (novoPdi.titulo.trim().length < 2) { toast.error("Informe o título do PDI."); return; }
                criarPdiMut.mutate({ companyId, employeeId: novoPdi.employeeId, titulo: novoPdi.titulo, objetivo: novoPdi.objetivo || null, acoes: novoPdi.acoes || null, prazo: novoPdi.prazo || null });
              }}>
              {criarPdiMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Criar PDI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog novo feedback */}
      <Dialog open={!!novoFb} onOpenChange={(o) => { if (!o) setNovoFb(null); }}>
        <DialogContent className="max-w-md w-[96vw]" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="text-base">Novo feedback</DialogTitle></DialogHeader>
          {novoFb ? (
            <div className="space-y-2 text-xs">
              <div><label className="font-medium">Colaborador *</label><div className="mt-0.5"><SelEmp value={novoFb.employeeId} onChange={v => setNovoFb({ ...novoFb, employeeId: v })} /></div></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-medium">Data *</label><Input type="date" className="h-8 text-xs mt-0.5" value={novoFb.data} onChange={e => setNovoFb({ ...novoFb, data: e.target.value })} /></div>
                <div><label className="font-medium">Tipo *</label>
                  <select className="w-full h-8 text-xs mt-0.5 border rounded px-2 bg-white" value={novoFb.tipo} onChange={e => setNovoFb({ ...novoFb, tipo: e.target.value })}>
                    {TIPOS_FB.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="font-medium">Resumo *</label><Textarea className="text-xs mt-0.5 min-h-[72px]" placeholder="O que foi conversado/observado…" value={novoFb.resumo} onChange={e => setNovoFb({ ...novoFb, resumo: e.target.value })} /></div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setNovoFb(null)}>Cancelar</Button>
            <Button size="sm" className="bg-[#0A1E3C] hover:bg-[#0A1E3C]/90" disabled={criarFbMut.isPending}
              onClick={() => {
                if (!novoFb) return;
                if (!novoFb.employeeId) { toast.error("Selecione o colaborador."); return; }
                if (novoFb.resumo.trim().length < 3) { toast.error("Escreva o resumo do feedback."); return; }
                criarFbMut.mutate({ companyId, employeeId: novoFb.employeeId, data: novoFb.data, tipo: novoFb.tipo as any, resumo: novoFb.resumo });
              }}>
              {criarFbMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
