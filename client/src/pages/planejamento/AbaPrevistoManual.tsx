import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload, Trash2, CheckCircle2, AlertTriangle, FileUp, TrendingUp, Loader2, Info, Settings,
} from "lucide-react";
import { toast } from "sonner";
import { parseMSProjectFull } from "./ImportarCronograma";

// Rev. 2633 — Aba "Previsto" (MODO MANUAL): o engenheiro sobe 1 XML por semana e
// o ERP lê a coluna "% Concluída" (PercentComplete) da raiz e de cada atividade,
// gravando a curva "% Previsto" sem nenhum cálculo próprio.
export default function AbaPrevistoManual({ projetoId, revisaoAtiva, companyId }: any) {
  const revisaoId: number = revisaoAtiva?.id ?? 0;
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [dataManual, setDataManual] = useState<string>("");

  const utils = trpc.useUtils();

  const { data: cfg } = trpc.purchase.getConfigCompras.useQuery(
    { companyId: Number(companyId) || 0 },
    { enabled: !!companyId }
  );
  const fonteManualAtiva = (cfg?.config as any)?.previstoFonte === "manual";

  const { data, isLoading } = trpc.planejamento.getPrevistoManual.useQuery(
    { projetoId, revisaoId },
    { enabled: !!projetoId && !!revisaoId }
  );

  const salvarMut = trpc.planejamento.salvarPrevistoManualSemana.useMutation({
    onSuccess: (r: any) => {
      if (r.aplicado) {
        toast.success(`Semana salva — % Previsto atualizado (${r.casados}/${r.total} atividades casadas).`);
      } else {
        toast.warning(`Upload salvo, mas a fonte global está em "Motor". Ative "Manual" nos Critérios do Sistema para a curva refletir.`);
      }
      utils.planejamento.getPrevistoManual.invalidate({ projetoId, revisaoId });
      utils.planejamento.getProjetoById.invalidate();
    },
    onError: (e: any) => toast.error(`Erro ao salvar semana: ${e?.message ?? ""}`),
  });

  const limparMut = trpc.planejamento.limparPrevistoManualSemana.useMutation({
    onSuccess: () => {
      toast.success("Semana removida.");
      utils.planejamento.getPrevistoManual.invalidate({ projetoId, revisaoId });
      utils.planejamento.getProjetoById.invalidate();
    },
    onError: (e: any) => toast.error(`Erro ao remover: ${e?.message ?? ""}`),
  });

  async function handleFile(file: File) {
    if (!revisaoId) { toast.error("Sem revisão ativa."); return; }
    setParsing(true);
    try {
      const text = await file.text();
      const parsed = parseMSProjectFull(text);
      const statusDate = (parsed.statusDateIso || parsed.statusDate || "").slice(0, 10) || dataManual;
      if (!statusDate || !/^\d{4}-\d{2}-\d{2}$/.test(statusDate)) {
        toast.error("O XML não tem Data de Status (StatusDate). Informe a data da semana manualmente abaixo e tente de novo.");
        setParsing(false);
        return;
      }
      const itens = (parsed.tarefas || [])
        .filter((t: any) => !t.isGrupo && t.mspUid)
        .map((t: any) => ({ mspUid: String(t.mspUid), pct: Number(t.percentConcluido ?? 0) }));
      const raizPct = parsed.realizadoMspRaiz != null ? Number(parsed.realizadoMspRaiz) : null;
      await salvarMut.mutateAsync({
        projetoId, revisaoId, statusDate, raizPct, itens, arquivo: file.name,
      });
    } catch (e: any) {
      toast.error(`Falha ao ler o XML: ${e?.message ?? "arquivo inválido"}`);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const semanas = data?.semanas ?? [];
  const fmtBR = (iso: string) => { if (!iso) return "—"; const [y, mo, d] = iso.split("-"); return `${d}/${mo}/${y}`; };
  const fmtDateTime = (iso: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Previsto (Manual)
          </h2>
          <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">
            Suba 1 XML do MS Project por semana. O ERP lê a coluna <span className="font-mono">% Concluída (PercentComplete)</span> da
            raiz e de cada atividade e alimenta a curva "% Previsto" — sem cálculo próprio.
          </p>
        </div>
        {revisaoAtiva && (
          <span className="text-xs text-slate-400 whitespace-nowrap">
            Rev. {String(revisaoAtiva.numero ?? "").padStart(2, "0")}
          </span>
        )}
      </div>

      {/* Banner: fonte global */}
      {!fonteManualAtiva && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">A fonte global do "% Previsto" está em <span className="font-mono">Motor</span>.</p>
            <p className="mt-0.5 text-amber-700">
              Você pode subir os XMLs aqui mesmo assim — mas a curva só passará a usar estes valores quando você ativar
              <span className="inline-flex items-center gap-1 font-medium"><Settings className="w-3.5 h-3.5" /> Critérios do Sistema → Planejamento → Fonte do "% Previsto" → Manual</span>.
            </p>
          </div>
        </div>
      )}
      {fonteManualAtiva && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Fonte global em <span className="font-mono font-medium">Manual</span> — a curva "% Previsto" reflete os uploads abaixo.
        </div>
      )}

      {/* Zona de upload */}
      <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <Label className="text-xs text-slate-600">Data da semana (opcional)</Label>
            <Input
              type="date"
              value={dataManual}
              onChange={(e) => setDataManual(e.target.value)}
              className="mt-1 max-w-[200px] bg-white"
            />
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Info className="w-3 h-3" /> Usada só se o XML não trouxer a Data de Status.
            </p>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={parsing || salvarMut.isPending || !revisaoId}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {parsing || salvarMut.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando…</>
                : <><Upload className="w-4 h-4 mr-2" /> Subir XML da semana</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Lista de semanas */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Semanas enviadas</span>
          <span className="text-xs text-slate-400">{semanas.length} semana{semanas.length !== 1 ? "s" : ""}</span>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" /> Carregando…
          </div>
        ) : semanas.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            <FileUp className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Nenhuma semana enviada ainda. Suba o 1º XML acima.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {semanas.map((s: any) => (
              <div key={s.statusDate} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-indigo-100 text-indigo-700 flex flex-col items-center justify-center shrink-0">
                    <span className="text-sm font-bold leading-none">{s.raiz != null ? `${Math.round(s.raiz)}%` : "—"}</span>
                    <span className="text-[9px] uppercase tracking-wide mt-0.5">raiz</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm">{fmtBR(s.statusDate)}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {s.atividades} atividade{s.atividades !== 1 ? "s" : ""}
                      {s.arquivo ? ` · ${s.arquivo}` : ""}
                      {s.uploadedEm ? ` · enviado ${fmtDateTime(s.uploadedEm)}` : ""}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 shrink-0"
                  disabled={limparMut.isPending}
                  onClick={() => {
                    if (confirm(`Remover a semana de ${fmtBR(s.statusDate)}?`))
                      limparMut.mutate({ projetoId, revisaoId, statusDate: s.statusDate });
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
