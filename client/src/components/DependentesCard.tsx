// ============================================================================
// Rev. 4672 — FASE 4: DEPENDENTES DO COLABORADOR (card do dossiê)
// Cadastro completo: nome, parentesco, nascimento, CPF, IRRF, salário-família,
// anexos de certidão e caderneta de vacinação.
// ============================================================================
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Users, Plus, Trash2, Pencil, Paperclip, ExternalLink } from "lucide-react";

const PARENTESCOS = [
  { v: "filho", l: "Filho(a)" },
  { v: "conjuge", l: "Cônjuge" },
  { v: "enteado", l: "Enteado(a)" },
  { v: "pai_mae", l: "Pai/Mãe" },
  { v: "outro", l: "Outro" },
] as const;

const fmtD = (v?: string | null) => {
  const m = String(v || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

type Form = {
  id?: number; nome: string; parentesco: string; dataNascimento: string;
  cpf: string; irrf: boolean; salarioFamilia: boolean; observacoes: string;
};
const VAZIO: Form = { nome: "", parentesco: "filho", dataNascimento: "", cpf: "", irrf: false, salarioFamilia: false, observacoes: "" };

export default function DependentesCard({ companyId, employeeId }: { companyId: number; employeeId: number }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<Form | null>(null);
  const [anexando, setAnexando] = useState<string | null>(null); // `${id}-${campo}`

  const { data: deps = [], isLoading } = trpc.rhDependentes.listar.useQuery(
    { companyId, employeeId }, { enabled: !!companyId && !!employeeId }
  );

  const invalidar = () => utils.rhDependentes.listar.invalidate();
  const criarMut = trpc.rhDependentes.criar.useMutation({
    onSuccess: () => { toast.success("Dependente cadastrado!"); setForm(null); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMut = trpc.rhDependentes.atualizar.useMutation({
    onSuccess: () => { toast.success("Dependente atualizado!"); setForm(null); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMut = trpc.rhDependentes.excluir.useMutation({
    onSuccess: () => { toast.success("Dependente excluído."); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const anexarMut = trpc.rhDependentes.anexar.useMutation({
    onSuccess: () => { toast.success("Anexo salvo!"); setAnexando(null); invalidar(); },
    onError: (e) => { toast.error(e.message); setAnexando(null); },
  });

  const salvar = () => {
    if (!form) return;
    if (form.nome.trim().length < 2) { toast.error("Informe o nome do dependente."); return; }
    const payload = {
      nome: form.nome, parentesco: form.parentesco as any,
      dataNascimento: form.dataNascimento || null, cpf: form.cpf || null,
      irrf: form.irrf, salarioFamilia: form.salarioFamilia,
      observacoes: form.observacoes || null,
    };
    if (form.id) atualizarMut.mutate({ id: form.id, ...payload });
    else criarMut.mutate({ companyId, employeeId, ...payload });
  };

  const anexar = (id: number, campo: "certidao" | "vacinacao") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast.error("Arquivo acima de 5MB."); return; }
      const reader = new FileReader();
      reader.onload = () => {
        setAnexando(`${id}-${campo}`);
        anexarMut.mutate({ id, campo, base64: String(reader.result), contentType: f.type || "application/pdf", nomeArquivo: f.name });
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  const pend = criarMut.isPending || atualizarMut.isPending;

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-[#0A1E3C]" /> Dependentes {deps.length ? <Badge variant="outline" className="text-[10px]">{deps.length}</Badge> : null}
        </CardTitle>
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => setForm({ ...VAZIO })}>
          <Plus className="h-3 w-3" /> Adicionar
        </Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-[#0A1E3C]" /></div>
        ) : deps.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Nenhum dependente cadastrado.</p>
        ) : (deps as any[]).map((d) => (
          <div key={d.id} className="border rounded px-2 py-1.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-medium block break-words">{d.nome}</span>
                <span className="text-[10px] text-muted-foreground">
                  {PARENTESCOS.find(p => p.v === d.parentesco)?.l || d.parentesco}
                  {d.dataNascimento ? ` · Nasc. ${fmtD(d.dataNascimento)}` : ""}{d.cpf ? ` · CPF ${d.cpf}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setForm({
                  id: d.id, nome: d.nome, parentesco: d.parentesco,
                  dataNascimento: (d.dataNascimento || "").slice(0, 10), cpf: d.cpf || "",
                  irrf: !!d.irrf, salarioFamilia: !!d.salarioFamilia, observacoes: d.observacoes || "",
                })}><Pencil className="h-3 w-3" /></Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-600" disabled={excluirMut.isPending}
                  onClick={() => { if (confirm(`Excluir o dependente ${d.nome}?`)) excluirMut.mutate({ id: d.id }); }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {d.irrf ? <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[9px]">IRRF</Badge> : null}
              {d.salarioFamilia ? <Badge className="bg-green-100 text-green-800 border-green-300 text-[9px]">Salário-família</Badge> : null}
              {(["certidao", "vacinacao"] as const).map(campo => {
                const url = campo === "certidao" ? d.certidaoUrl : d.vacinacaoUrl;
                const rotulo = campo === "certidao" ? "Certidão" : "Vacinação";
                const key = `${d.id}-${campo}`;
                return (
                  <span key={campo} className="inline-flex items-center gap-0.5">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-[#0A1E3C] underline inline-flex items-center gap-0.5">
                        <ExternalLink className="h-2.5 w-2.5" /> {rotulo}
                      </a>
                    ) : null}
                    <Button variant="ghost" size="sm" className="h-5 px-1 text-[9px] gap-0.5 text-muted-foreground"
                      disabled={anexando === key && anexarMut.isPending}
                      onClick={() => anexar(d.id, campo)}>
                      {anexando === key && anexarMut.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Paperclip className="h-2.5 w-2.5" />}
                      {url ? `Trocar ${rotulo.toLowerCase()}` : `Anexar ${rotulo.toLowerCase()}`}
                    </Button>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>

      {/* Dialog criar/editar */}
      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="max-w-md w-[96vw]" aria-describedby={undefined}>
          <DialogHeader><DialogTitle className="text-base">{form?.id ? "Editar dependente" : "Novo dependente"}</DialogTitle></DialogHeader>
          {form ? (
            <div className="space-y-2 text-xs">
              <div>
                <label className="font-medium">Nome completo *</label>
                <Input className="h-8 text-xs mt-0.5" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium">Parentesco *</label>
                  <select className="w-full h-8 text-xs mt-0.5 border rounded px-2 bg-white"
                    value={form.parentesco} onChange={e => setForm({ ...form, parentesco: e.target.value })}>
                    {PARENTESCOS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-medium">Nascimento</label>
                  <Input type="date" className="h-8 text-xs mt-0.5" value={form.dataNascimento} onChange={e => setForm({ ...form, dataNascimento: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="font-medium">CPF</label>
                <Input className="h-8 text-xs mt-0.5" placeholder="000.000.000-00" value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} />
              </div>
              <div className="flex items-center justify-between border rounded px-2 py-1.5">
                <span>Declarado para dedução de IRRF</span>
                <Switch checked={form.irrf} onCheckedChange={v => setForm({ ...form, irrf: v })} />
              </div>
              <div className="flex items-center justify-between border rounded px-2 py-1.5">
                <span>Elegível a salário-família</span>
                <Switch checked={form.salarioFamilia} onCheckedChange={v => setForm({ ...form, salarioFamilia: v })} />
              </div>
              <div>
                <label className="font-medium">Observações</label>
                <Input className="h-8 text-xs mt-0.5" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setForm(null)}>Cancelar</Button>
            <Button size="sm" className="bg-[#0A1E3C] hover:bg-[#0A1E3C]/90" disabled={pend} onClick={salvar}>
              {pend ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
