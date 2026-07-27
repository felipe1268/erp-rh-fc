// ============================================================================
// Rev. 4644 — FICHA DE EPI (aba lateral SST)
// Rev. 4648 — layout moderno em cards responsivos: foto grande (clique amplia
// p/ identificar o colaborador), KPIs no topo, filtro rápido de pendências e
// leitura fluida no iPad. Clique no card abre a Ficha de EPI consolidada.
// ============================================================================
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, Search, ShieldCheck, FileSignature, Users, CheckCircle2, AlertTriangle, X, HardHat } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FichaEpiDialog from "@/components/FichaEpiDialog";
import { formatCPF } from "@/lib/formatters";

function removeAccents(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
// Miniatura de /uploads (memória: originais quebram no Safari/iPad — usar ?w=)
function thumb(u?: string | null, w = 128): string {
  if (!u) return "";
  if (!u.startsWith("/uploads")) return u;
  return u.includes("?") ? `${u}&w=${w}` : `${u}?w=${w}`;
}
function initials(nome?: string | null): string {
  const p = (nome || "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

type FiltroStatus = "todos" | "pendentes" | "completos";

export default function EpiFichaFuncionario() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = isConstrutoras ? 0 : (selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0);
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : !!companyId;

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  // Rev. 4651 — filtro por obra (localizar onde o pessoal está)
  const [obraFiltro, setObraFiltro] = useState<string>("todas");
  const [fichaEmpId, setFichaEmpId] = useState<number | null>(null);
  // Rev. 4648 — lightbox da foto (clique na foto amplia p/ identificar)
  const [fotoZoom, setFotoZoom] = useState<{ url: string; nome: string; funcao?: string | null } | null>(null);

  const resumoQ = trpc.epis.fichaEpiResumo.useQuery(
    { companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined },
    { enabled: hasValidCompany }
  );

  const all = (resumoQ.data?.funcionarios || []) as any[];
  const totais = useMemo(() => {
    const completos = all.filter(f => (f.total_entregas || 0) > 0 && (f.entregas_assinadas || 0) >= (f.total_entregas || 0)).length;
    return { colaboradores: all.length, completos, pendentes: all.length - completos };
  }, [all]);

  // Obras presentes na lista (p/ montar o filtro)
  const obras = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of all) {
      if (f.obra_id) m.set(String(f.obra_id), f.obra_nome || `Obra ${f.obra_id}`);
    }
    return Array.from(m.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [all]);
  const temSemObra = useMemo(() => all.some(f => !f.obra_id), [all]);

  const funcionarios = useMemo(() => {
    let arr = all;
    if (obraFiltro === "sem_obra") arr = arr.filter(f => !f.obra_id);
    else if (obraFiltro !== "todas") arr = arr.filter(f => String(f.obra_id || "") === obraFiltro);
    if (filtro === "pendentes") arr = arr.filter(f => (f.entregas_assinadas || 0) < (f.total_entregas || 0));
    if (filtro === "completos") arr = arr.filter(f => (f.total_entregas || 0) > 0 && (f.entregas_assinadas || 0) >= (f.total_entregas || 0));
    const s = removeAccents(search.trim());
    if (!s) return arr;
    return arr.filter(f => removeAccents(f.nomeCompleto || "").includes(s) || removeAccents(f.funcao || "").includes(s) || removeAccents(f.obra_nome || "").includes(s) || String(f.cpf || "").replace(/\D/g, "").includes(s.replace(/\D/g, "") || "\u0000"));
  }, [all, search, filtro, obraFiltro]);

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 space-y-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="rounded-xl bg-[#0A1E3C] text-white px-4 py-4 sm:px-6 sm:py-5">
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#EE9803]" /> Ficha de EPI
          </h1>
          <p className="text-xs sm:text-sm text-white/70 mt-0.5">
            Ficha consolidada por colaborador — entregas com assinatura digital autenticada (NR-06 / CLT), pronta p/ clientes ou Ministério do Trabalho.
          </p>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-3">
            {[
              { k: "todos" as FiltroStatus, label: "Colaboradores", val: totais.colaboradores, icon: Users, cls: "text-white" },
              { k: "completos" as FiltroStatus, label: "Fichas completas", val: totais.completos, icon: CheckCircle2, cls: "text-green-400" },
              { k: "pendentes" as FiltroStatus, label: "Com pendência", val: totais.pendentes, icon: AlertTriangle, cls: "text-[#EE9803]" },
            ].map(({ k, label, val, icon: Icon, cls }) => (
              <button key={k} type="button" onClick={() => setFiltro(filtro === k ? "todos" : k)}
                className={`rounded-lg px-2 py-2 sm:px-3 text-left transition-colors ${filtro === k ? "bg-white/20 ring-1 ring-white/50" : "bg-white/10 hover:bg-white/15"}`}>
                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-white/70"><Icon className={`h-3.5 w-3.5 ${cls}`} /> {label}</div>
                <div className={`text-lg sm:text-2xl font-bold ${cls}`}>{val}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Busca + filtro por obra */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, função, obra ou CPF..." className="pl-9 h-10 rounded-lg" />
          </div>
          <Select value={obraFiltro} onValueChange={setObraFiltro}>
            <SelectTrigger className="h-10 rounded-lg w-full sm:w-[240px]">
              <span className="flex items-center gap-1.5 truncate"><HardHat className="h-4 w-4 text-[#EE9803] shrink-0" /><SelectValue placeholder="Todas as obras" /></span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              {temSemObra ? <SelectItem value="sem_obra">Sem obra alocada</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>

        {resumoQ.isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground"><Loader2 className="animate-spin mr-2 h-5 w-5" /> Carregando...</div>
        ) : funcionarios.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            {all.length === 0 ? "Nenhum colaborador com entrega de EPI registrada." : "Nenhum colaborador encontrado com esse filtro."}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {funcionarios.map((f: any) => {
              const total = f.total_entregas || 0;
              const ok = f.entregas_assinadas || 0;
              const pend = total - ok;
              const pct = total > 0 ? Math.round((ok / total) * 100) : 0;
              return (
                <div key={f.id} role="button" tabIndex={0}
                  onClick={() => setFichaEmpId(f.id)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") setFichaEmpId(f.id); }}
                  className="group rounded-xl border bg-white p-3 sm:p-3.5 flex gap-3 items-start cursor-pointer transition-all hover:shadow-md hover:border-[#0A1E3C]/40 active:scale-[0.99]">
                  {/* Foto — clique AMPLIA (não abre a ficha) */}
                  <button type="button" title="Ampliar foto"
                    onClick={(ev) => { ev.stopPropagation(); if (f.fotoUrl) setFotoZoom({ url: f.fotoUrl, nome: f.nomeCompleto, funcao: f.funcao }); }}
                    className="shrink-0 relative">
                    {f.fotoUrl ? (
                      <img src={thumb(f.fotoUrl, 128)} alt={f.nomeCompleto} loading="lazy"
                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border-2 border-gray-200 group-hover:border-[#EE9803] transition-colors" />
                    ) : (
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-[#0A1E3C]/10 text-[#0A1E3C] flex items-center justify-center font-bold text-lg border-2 border-gray-200">
                        {initials(f.nomeCompleto)}
                      </div>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[13px] sm:text-sm text-[#0A1E3C] leading-snug break-words">{f.nomeCompleto}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{f.funcao || "—"} · {formatCPF(f.cpf)}</p>
                    <p className="text-[10.5px] mt-0.5 flex items-center gap-1 truncate">
                      <HardHat className="h-3 w-3 text-[#EE9803] shrink-0" />
                      <span className={f.obra_nome ? "text-[#0A1E3C] font-medium truncate" : "text-muted-foreground italic"}>{f.obra_nome || "Sem obra alocada"}</span>
                    </p>

                    {/* Progresso de assinaturas */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${pend === 0 ? "bg-green-500" : "bg-[#EE9803]"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[10px] font-bold whitespace-nowrap ${pend === 0 ? "text-green-600" : "text-amber-600"}`}>
                        {ok}/{total}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        Última: {f.ultima_entrega ? f.ultima_entrega.split("-").reverse().join("/") : "—"}
                      </span>
                      {pend > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600"><AlertTriangle className="h-3 w-3" /> {pend} sem assinatura</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600"><CheckCircle2 className="h-3 w-3" /> Completa</span>
                      )}
                    </div>
                  </div>

                  <FileSignature className="h-4 w-4 text-gray-300 group-hover:text-[#0A1E3C] shrink-0 mt-1 transition-colors" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox da foto do colaborador */}
      <Dialog open={!!fotoZoom} onOpenChange={(o) => { if (!o) setFotoZoom(null); }}>
        <DialogContent className="max-w-md w-[92vw] p-0 overflow-hidden bg-black border-0" aria-describedby={undefined}>
          {fotoZoom && (
            <div className="relative">
              <img src={thumb(fotoZoom.url, 1024)} alt={fotoZoom.nome} className="w-full max-h-[70vh] object-contain bg-black" />
              <button type="button" onClick={() => setFotoZoom(null)}
                className="absolute top-2 right-2 rounded-full bg-black/60 text-white p-1.5"><X className="h-4 w-4" /></button>
              <div className="bg-[#0A1E3C] text-white px-4 py-2.5">
                <p className="font-semibold text-sm">{fotoZoom.nome}</p>
                {fotoZoom.funcao ? <p className="text-xs text-white/70">{fotoZoom.funcao}</p> : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FichaEpiDialog
        employeeId={fichaEmpId}
        open={!!fichaEmpId}
        onClose={() => setFichaEmpId(null)}
        companyId={queryCompanyId}
        companyIds={isConstrutoras ? companyIds : undefined}
      />
    </DashboardLayout>
  );
}
