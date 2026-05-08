import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Building2, LogOut, MessageSquare, Star, Send, MapPin,
  CheckCircle2, ShieldCheck, Smile, Meh, Frown, Sparkles,
} from "lucide-react";

const fmtBR = (s?: string | null) => (s ? s.split("T")[0].split("-").reverse().join("/") : "—");

function NotaSelector({ value, onChange, label }: { value: number | null; onChange: (n: number | null) => void; label: string }) {
  return (
    <div>
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      <div className="flex flex-wrap gap-1 mt-2">
        {Array.from({ length: 11 }).map((_, n) => {
          const sel = value === n;
          const cor = n <= 6 ? "bg-rose-500" : n <= 8 ? "bg-amber-500" : "bg-emerald-500";
          return (
            <button
              type="button"
              key={n}
              onClick={() => onChange(sel ? null : n)}
              className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${sel ? `${cor} text-white shadow-md scale-110` : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PortalDashboardCliente() {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("portal_token") || "";
  const tipo = localStorage.getItem("portal_tipo") || "";
  const [tab, setTab] = useState<"obras" | "comentarios" | "avaliacao">("obras");

  // Guard
  useEffect(() => {
    if (!token) { navigate("/portal/login"); return; }
    if (tipo && tipo !== "cliente") { navigate("/portal/dashboard"); }
  }, [token, tipo]);

  const tokenCheck = trpc.portalExterno.auth.verificarToken.useQuery({ token }, { enabled: !!token });
  useEffect(() => {
    if (tokenCheck.data && !tokenCheck.data.valid) {
      localStorage.clear();
      toast.error("Sessão expirada");
      navigate("/portal/login");
    }
  }, [tokenCheck.data]);

  const { data: meusDados } = trpc.portalExterno.cliente.meusDados.useQuery({ token }, { enabled: !!token && tipo === "cliente" });
  const { data: minhasObras = [] } = trpc.portalExterno.cliente.minhasObras.useQuery({ token }, { enabled: !!token && tipo === "cliente" });

  // ===== Comentários =====
  const [obraFiltro, setObraFiltro] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data: comentarios = [] } = trpc.portalExterno.cliente.listarComentarios.useQuery(
    { token, obraId: obraFiltro },
    { enabled: !!token && tipo === "cliente" }
  );
  const marcarLidosMut = trpc.portalExterno.cliente.marcarComentariosLidos.useMutation();
  useEffect(() => {
    if (token && tipo === "cliente" && tab === "comentarios" && comentarios.length > 0) {
      const naoLidos = (comentarios as any[]).some((c) => c.autorTipo === "fc" && !c.lidoEm);
      if (naoLidos) marcarLidosMut.mutate({ token, obraId: obraFiltro });
    }
  }, [tab, comentarios, obraFiltro]);
  const [novoMsg, setNovoMsg] = useState("");
  const criarMsg = trpc.portalExterno.cliente.criarComentario.useMutation({
    onSuccess: () => { setNovoMsg(""); utils.portalExterno.cliente.listarComentarios.invalidate(); toast.success("Mensagem enviada!"); },
    onError: (e) => toast.error(e.message),
  });

  // ===== Avaliação =====
  const [aval, setAval] = useState<{
    obraId: number | null;
    notaEquipe: number | null; notaObra: number | null; notaAtendimento: number | null;
    notaPrazo: number | null; notaQualidade: number | null; notaGeral: number | null;
    comentarioPositivo: string; comentarioMelhoria: string; recomendaria: number | null;
  }>({
    obraId: null, notaEquipe: null, notaObra: null, notaAtendimento: null,
    notaPrazo: null, notaQualidade: null, notaGeral: null,
    comentarioPositivo: "", comentarioMelhoria: "", recomendaria: null,
  });
  const [avaliado, setAvaliado] = useState(false);
  const enviarAvalMut = trpc.portalExterno.cliente.criarAvaliacao.useMutation({
    onSuccess: () => { setAvaliado(true); toast.success("Obrigado! Sua avaliação foi enviada."); },
    onError: (e) => toast.error(e.message),
  });
  const enviarAvaliacao = () => {
    if (aval.notaGeral === null) { toast.error("Informe pelo menos a nota geral (NPS)"); return; }
    enviarAvalMut.mutate({
      token,
      obraId: aval.obraId,
      notaEquipe: aval.notaEquipe ?? undefined,
      notaObra: aval.notaObra ?? undefined,
      notaAtendimento: aval.notaAtendimento ?? undefined,
      notaPrazo: aval.notaPrazo ?? undefined,
      notaQualidade: aval.notaQualidade ?? undefined,
      notaGeral: aval.notaGeral,
      comentarioPositivo: aval.comentarioPositivo || undefined,
      comentarioMelhoria: aval.comentarioMelhoria || undefined,
      recomendaria: aval.recomendaria ?? undefined,
    });
  };

  const logout = () => { localStorage.clear(); navigate("/portal/login"); };

  const obrasOptions = useMemo(() => minhasObras.map((o: any) => ({ id: o.id, nome: o.nome })), [minhasObras]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 text-base leading-tight">Portal do Cliente</h1>
              <p className="text-xs text-slate-500">{meusDados?.razaoSocial ?? localStorage.getItem("portal_nome") ?? ""}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
            <LogOut className="w-4 h-4" /> Sair
          </Button>
        </div>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 -mb-px">
            {[
              { k: "obras", label: "Minhas Obras", icon: Building2 },
              { k: "comentarios", label: "Comentários", icon: MessageSquare },
              { k: "avaliacao", label: "Avaliação Anônima", icon: Star },
            ].map((t) => {
              const Icon = t.icon as any;
              const active = tab === t.k;
              return (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k as any)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* TAB OBRAS */}
        {tab === "obras" && (
          <div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Obras vinculadas a você</h2>
            {minhasObras.length === 0 ? (
              <div className="bg-white border rounded-xl p-12 text-center text-slate-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma obra vinculada à sua empresa no momento.</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {minhasObras.map((o: any) => (
                  <div key={o.id} className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-slate-800 text-sm leading-tight">{o.nome}</h3>
                      <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                    </div>
                    {o.codigo && <p className="text-xs text-slate-500 mb-2">{o.codigo}</p>}
                    {(o.cidade || o.estado) && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {[o.cidade, o.estado].filter(Boolean).join(" / ")}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-2 pt-2 border-t">
                      <p>Início: <span className="font-medium text-slate-700">{fmtBR(o.dataInicio)}</span></p>
                      <p>Previsão fim: <span className="font-medium text-slate-700">{fmtBR(o.dataPrevisaoFim)}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB COMENTÁRIOS */}
        {tab === "comentarios" && (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <div className="bg-white border rounded-xl p-4">
                <Label className="text-xs font-medium">Filtrar por obra</Label>
                <select
                  value={obraFiltro ?? ""}
                  onChange={(e) => setObraFiltro(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Todas / Geral</option>
                  {obrasOptions.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
                <div className="mt-4 pt-4 border-t">
                  <Label className="text-xs font-medium">Nova mensagem</Label>
                  <textarea
                    value={novoMsg}
                    onChange={(e) => setNovoMsg(e.target.value)}
                    rows={4}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                    placeholder="Escreva uma mensagem para a equipe FC..."
                  />
                  <Button
                    onClick={() => criarMsg.mutate({ token, obraId: obraFiltro, mensagem: novoMsg.trim() })}
                    disabled={!novoMsg.trim() || criarMsg.isPending}
                    className="mt-2 w-full bg-blue-600 hover:bg-blue-700 gap-2"
                  >
                    <Send className="w-4 h-4" /> Enviar
                  </Button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">Conversa</h2>
              {comentarios.length === 0 ? (
                <div className="bg-white border rounded-xl p-12 text-center text-slate-400">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem ainda. Escreva a primeira ao lado.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {comentarios.map((m: any) => {
                    const isCli = m.autorTipo === "cliente";
                    return (
                      <div key={m.id} className={`flex ${isCli ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${isCli ? "bg-blue-600 text-white" : "bg-white border"}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold ${isCli ? "text-blue-100" : "text-slate-700"}`}>
                              {m.autorNome || (isCli ? "Você" : "FC Engenharia")}
                            </span>
                            <span className={`text-[10px] ${isCli ? "text-blue-200" : "text-slate-400"}`}>
                              {fmtBR(m.criadoEm)}
                            </span>
                          </div>
                          <p className={`text-sm whitespace-pre-wrap ${isCli ? "text-white" : "text-slate-700"}`}>{m.mensagem}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB AVALIAÇÃO */}
        {tab === "avaliacao" && (
          <div className="max-w-3xl mx-auto">
            {avaliado ? (
              <div className="bg-white border rounded-2xl p-12 text-center">
                <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Obrigado pela avaliação!</h2>
                <p className="text-slate-600 mb-6">Suas respostas foram registradas <b>de forma totalmente anônima</b> e ajudarão a FC Engenharia a melhorar continuamente.</p>
                <Button onClick={() => { setAvaliado(false); setAval({ ...aval, notaGeral: null, notaEquipe: null, notaObra: null, notaAtendimento: null, notaPrazo: null, notaQualidade: null, comentarioPositivo: "", comentarioMelhoria: "", recomendaria: null, obraId: null }); }} variant="outline">
                  Enviar nova avaliação
                </Button>
              </div>
            ) : (
              <div className="bg-white border rounded-2xl p-6 space-y-5">
                <div className="flex items-start gap-3 pb-3 border-b">
                  <ShieldCheck className="w-7 h-7 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-bold text-slate-800">Avaliação 100% anônima</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Não armazenamos sua identidade, nem CNPJ, nem IP. Sinta-se à vontade para ser sincero — suas respostas ajudam a equipe FC a evoluir.
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Sobre qual obra? <span className="text-slate-400 text-xs">(opcional)</span></Label>
                  <select
                    value={aval.obraId ?? ""}
                    onChange={(e) => setAval({ ...aval, obraId: e.target.value ? Number(e.target.value) : null })}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Avaliação geral / não específica</option>
                    {obrasOptions.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <NotaSelector label="Nota geral (0 = péssimo · 10 = excelente) ★" value={aval.notaGeral} onChange={(n) => setAval({ ...aval, notaGeral: n })} />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <NotaSelector label="Equipe FC (técnica e relacionamento)" value={aval.notaEquipe} onChange={(n) => setAval({ ...aval, notaEquipe: n })} />
                  <NotaSelector label="Andamento da obra" value={aval.notaObra} onChange={(n) => setAval({ ...aval, notaObra: n })} />
                  <NotaSelector label="Atendimento e comunicação" value={aval.notaAtendimento} onChange={(n) => setAval({ ...aval, notaAtendimento: n })} />
                  <NotaSelector label="Cumprimento de prazos" value={aval.notaPrazo} onChange={(n) => setAval({ ...aval, notaPrazo: n })} />
                  <NotaSelector label="Qualidade do serviço entregue" value={aval.notaQualidade} onChange={(n) => setAval({ ...aval, notaQualidade: n })} />
                </div>

                <div>
                  <Label className="text-sm font-medium">Você recomendaria a FC para outras empresas?</Label>
                  <div className="flex gap-2 mt-2">
                    {[
                      { v: 2, label: "Sim, com certeza", icon: Smile, cor: "bg-emerald-500" },
                      { v: 1, label: "Talvez", icon: Meh, cor: "bg-amber-500" },
                      { v: 0, label: "Não", icon: Frown, cor: "bg-rose-500" },
                    ].map((opt) => {
                      const Icon = opt.icon as any;
                      const sel = aval.recomendaria === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setAval({ ...aval, recomendaria: sel ? null : opt.v })}
                          className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${sel ? `${opt.cor} text-white border-transparent shadow-md` : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                        >
                          <Icon className="w-6 h-6" />
                          <span className="text-xs font-medium">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">O que está indo bem? <span className="text-slate-400 text-xs">(opcional)</span></Label>
                  <textarea value={aval.comentarioPositivo} onChange={(e) => setAval({ ...aval, comentarioPositivo: e.target.value })}
                    rows={3} className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                    placeholder="Pontos positivos da equipe e do trabalho..." />
                </div>
                <div>
                  <Label className="text-sm font-medium">O que pode melhorar? <span className="text-slate-400 text-xs">(opcional)</span></Label>
                  <textarea value={aval.comentarioMelhoria} onChange={(e) => setAval({ ...aval, comentarioMelhoria: e.target.value })}
                    rows={3} className="mt-1 w-full border rounded-md px-3 py-2 text-sm resize-none"
                    placeholder="Sugestões e oportunidades de melhoria..." />
                </div>

                <div className="flex justify-end pt-3 border-t">
                  <Button onClick={enviarAvaliacao} disabled={enviarAvalMut.isPending || aval.notaGeral === null}
                    className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                    <Sparkles className="w-4 h-4" /> {enviarAvalMut.isPending ? "Enviando..." : "Enviar avaliação anônima"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
