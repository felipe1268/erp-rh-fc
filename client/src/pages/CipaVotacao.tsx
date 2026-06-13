import { useRoute } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, Vote, Users } from "lucide-react";
import { toast } from "sonner";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  if (!y || !m || !day) return s;
  return `${day}/${m}/${y}`;
}

export default function CipaVotacao() {
  const [, params] = useRoute("/cipa/votar/:token");
  const token = params?.token || "";
  const [selecionado, setSelecionado] = useState<number | null | undefined>(undefined);
  const [confirmando, setConfirmando] = useState(false);
  const [votouAgora, setVotouAgora] = useState(false);

  const q = trpc.cipa.eleicaoDigital.getCedula.useQuery({ token }, { enabled: token.length >= 10, retry: false });
  const registrar = trpc.cipa.eleicaoDigital.registrarVoto.useMutation({
    onSuccess: () => { setVotouAgora(true); },
    onError: (e: any) => { toast.error(e.message); setConfirmando(false); },
  });

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">{children}</div>
    </div>
  );

  if (token.length < 10) {
    return <Frame><div className="p-10 text-center"><AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-3" /><p className="text-lg font-semibold">Link inválido</p><p className="text-sm text-muted-foreground mt-1">O link de votação está incompleto.</p></div></Frame>;
  }

  if (q.isLoading) {
    return <Frame><div className="p-16 text-center"><Loader2 className="h-10 w-10 mx-auto animate-spin text-blue-500" /><p className="text-sm text-muted-foreground mt-4">Carregando cédula...</p></div></Frame>;
  }

  if (q.isError || !q.data) {
    return <Frame><div className="p-10 text-center"><AlertTriangle className="h-12 w-12 mx-auto text-red-500 mb-3" /><p className="text-lg font-semibold">Link de votação inválido</p><p className="text-sm text-muted-foreground mt-1">{(q.error as any)?.message || "Não foi possível carregar a votação."}</p></div></Frame>;
  }

  const data = q.data;
  const empresaNome = data.empresa?.nomeFantasia || data.empresa?.razaoSocial || "FC Engenharia";

  const Header = (
    <div className="bg-[#1B2A4A] text-white px-6 py-5 text-center">
      {data.empresa?.logoUrl ? (
        <img src={data.empresa.logoUrl} alt={empresaNome} className="h-12 mx-auto object-contain mb-2" />
      ) : null}
      <p className="text-xs uppercase tracking-[3px] opacity-80">{empresaNome}</p>
      <h1 className="text-lg font-bold tracking-wide mt-1 flex items-center justify-center gap-2"><Vote className="h-5 w-5" /> Eleição CIPA</h1>
      <p className="text-[11px] opacity-70 mt-1">Mandato {formatDate(data.eleicao.mandatoInicio)} — {formatDate(data.eleicao.mandatoFim)}</p>
    </div>
  );

  if (votouAgora || data.jaVotou) {
    return (
      <Frame>
        {Header}
        <div className="p-10 text-center">
          <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-500 mb-4" />
          <p className="text-xl font-bold">Voto registrado!</p>
          <p className="text-sm text-muted-foreground mt-2">Obrigado por participar da eleição da CIPA. Seu voto é secreto e foi computado com sucesso.</p>
          <div className="flex items-center justify-center gap-1.5 mt-5 text-xs text-slate-400"><ShieldCheck className="h-4 w-4" /> Voto anônimo e único por link</div>
        </div>
      </Frame>
    );
  }

  if (!data.aberta) {
    return (
      <Frame>
        {Header}
        <div className="p-10 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-3" />
          <p className="text-lg font-semibold">Votação indisponível</p>
          <p className="text-sm text-muted-foreground mt-1">A votação não está aberta no momento. Procure a Comissão Eleitoral.</p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      {Header}
      <div className="p-6">
        {data.eleitorNome && <p className="text-sm text-center text-muted-foreground mb-4">Olá, <strong className="text-slate-700">{data.eleitorNome}</strong>. Escolha <strong>um</strong> candidato:</p>}

        {data.candidatos.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground"><Users className="h-10 w-10 mx-auto mb-2 opacity-30" />Nenhum candidato disponível.</div>
        ) : (
          <div className="space-y-2.5">
            {data.candidatos.map((c: any) => {
              const ativo = selecionado === c.id;
              const foto = c.fotoUrl || c.employeeFoto;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelecionado(c.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${ativo ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                    {foto ? <img src={foto} alt={c.employeeName} className="w-full h-full object-cover" /> : <span className="text-base font-bold text-slate-400">{(c.employeeName || "?")[0]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{c.employeeName}</p>
                    <p className="text-xs text-slate-500">{c.employeeCargo || "—"}{c.numero ? ` · Nº ${c.numero}` : ""}</p>
                    {c.proposta && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{c.proposta}</p>}
                  </div>
                  {ativo && <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0" />}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setSelecionado(null)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${selecionado === null ? "border-slate-500 bg-slate-50 ring-2 ring-slate-200" : "border-dashed border-slate-200 hover:border-slate-300"}`}
            >
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-400 text-xl font-bold">—</div>
              <div className="flex-1"><p className="font-semibold text-slate-600">Voto em branco</p><p className="text-xs text-slate-400">Não escolher nenhum candidato</p></div>
              {selecionado === null && <CheckCircle2 className="h-5 w-5 text-slate-500 shrink-0" />}
            </button>
          </div>
        )}

        {!confirmando ? (
          <Button
            className="w-full mt-5 h-12 text-base"
            disabled={selecionado === undefined || data.candidatos.length === 0}
            onClick={() => setConfirmando(true)}
          >
            Confirmar voto
          </Button>
        ) : (
          <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-medium text-amber-900 text-center">Confirmar seu voto? Esta ação é definitiva.</p>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" className="flex-1" disabled={registrar.isPending} onClick={() => setConfirmando(false)}>Voltar</Button>
              <Button className="flex-1" disabled={registrar.isPending} onClick={() => registrar.mutate({ token, candidateId: selecionado ?? null })}>
                {registrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, votar"}
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 mt-5 text-[11px] text-slate-400"><ShieldCheck className="h-3.5 w-3.5" /> Voto anônimo — não registramos em quem você votou junto à sua identidade.</div>
      </div>
    </Frame>
  );
}
