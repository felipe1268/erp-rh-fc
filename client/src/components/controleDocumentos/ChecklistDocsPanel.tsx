// ============================================================================
// Rev. 4671 — CHECKLIST GERAL DE DOCUMENTOS (Controle de Documentos)
// Matriz funcionário × documento: todos os modelos de RH (Fase 1 do dossiê
// digital) campo a campo + ASO / OS / Treinamentos / Anexos. Quem não tem o
// documento aparece em vermelho, com geração direto na célula.
// ============================================================================
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { removeAccents } from "@/lib/searchUtils";
import PersonPhoto from "@/components/PersonPhoto";
import {
  Search, CheckCircle2, PenTool, Plus, Loader2, ExternalLink,
  Stethoscope, HardHat, GraduationCap, Paperclip, ClipboardCheck,
} from "lucide-react";

// Rótulos curtos p/ caber na matriz (título completo no tooltip)
const SHORT_LABELS: Record<string, string> = {
  ficha_registro: "Ficha Reg.",
  contrato_experiencia: "Contrato Exp.",
  termo_equipamentos: "Equipam.",
  termo_confidencialidade: "Confidenc.",
  regulamento_interno: "Regulam.",
  codigo_etica: "Ética",
  termo_lgpd: "LGPD",
  acordo_banco_horas: "Bco. Horas",
  acordo_compensacao: "Compens.",
};

export default function ChecklistDocsPanel({ companyId, companyIds, onClickEmployee }: {
  companyId: number; companyIds?: number[]; onClickEmployee: (id: number) => void;
}) {
  const enabled = !!companyId || (companyIds?.length ?? 0) > 0;
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.rhDocumentos.checklistGeral.useQuery({ companyId, companyIds }, { enabled });
  const [busca, setBusca] = useState("");
  const [soPendencias, setSoPendencias] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null); // `${empId}|${tipo}`

  const gerarMut = trpc.rhDocumentos.gerar.useMutation({
    onSuccess: () => {
      toast.success("Documento gerado! Abra o dossiê do colaborador para assinar.");
      setGerando(null);
      utils.rhDocumentos.checklistGeral.invalidate();
    },
    onError: (e) => { toast.error(e.message); setGerando(null); },
  });

  const modelos = data?.modelos ?? [];
  const funcionarios = useMemo(() => {
    let list = (data?.funcionarios ?? []) as any[];
    if (busca) {
      const s = removeAccents(busca);
      list = list.filter((f) => removeAccents(f.nomeCompleto || "").includes(s) || removeAccents(f.funcao || "").includes(s));
    }
    if (soPendencias) {
      list = list.filter((f) =>
        modelos.some((m: any) => m.obrigatorio && f.docs[m.tipo]?.situacao === "faltando") ||
        !f.asoVigente || !f.osAssinada
      );
    }
    return list;
  }, [data, busca, soPendencias, modelos]);

  const totalPend = useMemo(() => (data?.funcionarios ?? []).reduce((acc: number, f: any) => {
    let n = modelos.filter((m: any) => m.obrigatorio && f.docs[m.tipo]?.situacao === "faltando").length;
    if (!f.asoVigente) n++;
    if (!f.osAssinada) n++;
    return acc + n;
  }, 0), [data, modelos]);

  const cell = (f: any, m: any) => {
    const d = f.docs[m.tipo];
    const key = `${f.id}|${m.tipo}`;
    if (d?.situacao === "assinado") {
      return (
        <Link href={`/documentos-colaborador?emp=${f.id}`} title="Assinado — abrir dossiê">
          <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
        </Link>
      );
    }
    if (d?.situacao === "gerado") {
      return (
        <Link href={`/documentos-colaborador?emp=${f.id}`} title="Gerado — falta assinar (abrir dossiê)">
          <PenTool className="h-4 w-4 text-amber-500 mx-auto" />
        </Link>
      );
    }
    // faltando
    return (
      <button
        className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${m.obrigatorio ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100" : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100"}`}
        title={`${m.titulo} — faltando${m.obrigatorio ? " (obrigatório)" : ""}. Clique para gerar.`}
        disabled={gerando === key || gerarMut.isPending}
        onClick={() => { setGerando(key); gerarMut.mutate({ companyId: f.companyId, employeeId: f.id, tipo: m.tipo } as any); }}
      >
        {gerando === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-[#0A1E3C]" /> Checklist Geral de Documentos
              {totalPend > 0 && <Badge variant="destructive" className="text-[10px]">{totalPend} pendência(s)</Badge>}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Funcionário × documento. Verde = assinado · Âmbar = gerado (falta assinar) · Vermelho = faltando (clique no + para gerar).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={soPendencias ? "default" : "outline"} size="sm" className={soPendencias ? "bg-[#0A1E3C]" : ""} onClick={() => setSoPendencias(v => !v)}>
              Só pendências
            </Button>
            <Link href="/documentos-colaborador">
              <Button variant="outline" size="sm" className="gap-1"><ExternalLink className="h-3.5 w-3.5" /> Documentos do Colaborador</Button>
            </Link>
          </div>
        </div>
        <div className="relative mt-2 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou função..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9 h-9" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando checklist...</div>
        ) : funcionarios.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhum funcionário encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left p-2 font-medium sticky left-0 bg-slate-50 z-10 min-w-[180px]">Funcionário</th>
                  {modelos.map((m: any) => (
                    <th key={m.tipo} className="p-2 font-medium text-center text-[11px] whitespace-nowrap" title={m.titulo}>
                      {SHORT_LABELS[m.tipo] || m.titulo}
                      {m.obrigatorio && <span className="text-red-500">*</span>}
                    </th>
                  ))}
                  <th className="p-2 font-medium text-center text-[11px]" title="ASO vigente"><Stethoscope className="h-3.5 w-3.5 mx-auto" /></th>
                  <th className="p-2 font-medium text-center text-[11px]" title="Ordem de Serviço assinada"><HardHat className="h-3.5 w-3.5 mx-auto" /></th>
                  <th className="p-2 font-medium text-center text-[11px]" title="Treinamentos vigentes"><GraduationCap className="h-3.5 w-3.5 mx-auto" /></th>
                  <th className="p-2 font-medium text-center text-[11px]" title="Anexos no dossiê"><Paperclip className="h-3.5 w-3.5 mx-auto" /></th>
                </tr>
              </thead>
              <tbody>
                {funcionarios.map((f: any) => (
                  <tr key={f.id} className="border-b hover:bg-muted/20">
                    <td className="p-2 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2 min-w-0">
                        <PersonPhoto src={f.fotoUrl} alt={f.nomeCompleto || ""} size="sm" />
                        <div className="min-w-0">
                          <button className="text-blue-600 hover:underline font-medium text-left block truncate max-w-[160px]" title={f.nomeCompleto} onClick={() => onClickEmployee(f.id)}>
                            {f.nomeCompleto}
                          </button>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{f.funcao || "-"}</div>
                        </div>
                      </div>
                    </td>
                    {modelos.map((m: any) => <td key={m.tipo} className="p-1.5 text-center">{cell(f, m)}</td>)}
                    <td className="p-1.5 text-center">
                      {f.asoVigente ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full border border-red-300 bg-red-50 text-red-600 text-[10px] font-bold" title="Sem ASO vigente">!</span>}
                    </td>
                    <td className="p-1.5 text-center">
                      {f.osAssinada ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full border border-red-300 bg-red-50 text-red-600 text-[10px] font-bold" title="OS não assinada">!</span>}
                    </td>
                    <td className="p-1.5 text-center text-xs font-medium">{f.treinamentosVigentes > 0 ? <span className="text-green-700">{f.treinamentosVigentes}</span> : <span className="text-muted-foreground">0</span>}</td>
                    <td className="p-1.5 text-center text-xs font-medium">{f.anexos > 0 ? f.anexos : <span className="text-muted-foreground">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-2">* documento obrigatório · Colunas: modelos de RH · <Stethoscope className="inline h-3 w-3" /> ASO vigente · <HardHat className="inline h-3 w-3" /> OS assinada · <GraduationCap className="inline h-3 w-3" /> treinamentos vigentes · <Paperclip className="inline h-3 w-3" /> anexos</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
