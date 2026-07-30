/**
 * Rev. 4767 — WhatsApp RH: caixa de entrada + configuração fácil (Meta Cloud API).
 * Recepção-somente (custo zero): as mensagens enviadas ao número da empresa
 * chegam via webhook e ficam arquivadas aqui, com vínculo ao funcionário.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, Settings, Search, Paperclip, User, Link2, Copy, CheckCircle2,
  FileText, Image as ImageIcon, Mic, Video, RefreshCw, Phone,
} from "lucide-react";

function fmtFone(waId: string): string {
  const d = String(waId ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) {
    const ddd = d.slice(2, 4), resto = d.slice(4);
    return `(${ddd}) ${resto.length === 9 ? resto.slice(0, 5) + "-" + resto.slice(5) : resto.slice(0, 4) + "-" + resto.slice(4)}`;
  }
  return `+${d}`;
}

function fmtDataHora(ts?: string | null): string {
  if (!ts) return "";
  try {
    const d = typeof ts === "string" ? new Date(ts.includes("T") ? ts : ts.replace(" ", "T")) : new Date(ts as any);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

const TIPO_ICON: Record<string, any> = { image: ImageIcon, audio: Mic, video: Video, document: FileText };

export default function WhatsAppRH() {
  const { selectedCompanyId } = useCompany() as any;
  const companyId = Number(selectedCompanyId ?? 0);
  const { toast } = useToast();
  const [tab, setTab] = useState("conversas");
  const [busca, setBusca] = useState("");
  const [convSel, setConvSel] = useState<any | null>(null);
  const [showVincular, setShowVincular] = useState(false);
  const [buscaFunc, setBuscaFunc] = useState("");

  // ── Config ──
  const configQ = (trpc as any).whatsappRh.getConfig.useQuery({ companyId }, { enabled: !!companyId });
  const cfg = configQ.data;
  const [form, setForm] = useState<{ phoneNumberId: string; accessToken: string; appSecret: string; numeroExibicao: string; ativo: boolean } | null>(null);
  const f = form ?? {
    phoneNumberId: cfg?.phoneNumberId ?? "",
    accessToken: "",
    appSecret: "",
    numeroExibicao: cfg?.numeroExibicao ?? "",
    ativo: cfg?.ativo ?? true,
  };
  const salvarMut = (trpc as any).whatsappRh.salvarConfig.useMutation({
    onSuccess: () => { toast({ title: "Configuração salva!" }); setForm(null); configQ.refetch(); },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  // ── Conversas ──
  const conversasQ = (trpc as any).whatsappRh.listarConversas.useQuery(
    { companyId, busca: busca || undefined },
    { enabled: !!companyId, refetchInterval: 30000 }
  );
  const conversas: any[] = conversasQ.data ?? [];
  const mensagensQ = (trpc as any).whatsappRh.listarMensagens.useQuery(
    { conversaId: convSel?.id ?? 0 },
    { enabled: !!convSel, refetchInterval: 20000 }
  );
  const mensagens: any[] = mensagensQ.data ?? [];

  const funcionariosQ = (trpc as any).whatsappRh.listarFuncionarios.useQuery(
    { companyId },
    { enabled: !!companyId && showVincular }
  );
  const funcionarios: any[] = useMemo(() => {
    const lista = funcionariosQ.data ?? [];
    const t = buscaFunc.trim().toLowerCase();
    return t ? lista.filter((e: any) => String(e.nome).toLowerCase().includes(t)) : lista;
  }, [funcionariosQ.data, buscaFunc]);

  const vincularMut = (trpc as any).whatsappRh.vincularFuncionario.useMutation({
    onSuccess: () => { toast({ title: "Funcionário vinculado!" }); setShowVincular(false); conversasQ.refetch(); },
    onError: (e: any) => toast({ title: "Erro ao vincular", description: e.message, variant: "destructive" }),
  });

  const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;
  const copiar = (texto: string, oQue: string) => {
    navigator.clipboard?.writeText(texto).then(
      () => toast({ title: `${oQue} copiado!` }),
      () => toast({ title: "Não foi possível copiar", description: texto, variant: "destructive" })
    );
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-emerald-600" /> WhatsApp RH
            </h1>
            <p className="text-sm text-slate-500">Mensagens recebidas no número da empresa, arquivadas e vinculadas ao funcionário</p>
          </div>
          {cfg && (
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${cfg.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {cfg.ativo ? "● Conectado (recebendo)" : "○ Desativado"}
            </span>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="conversas"><MessageCircle className="w-4 h-4 mr-1" />Conversas{conversas.length > 0 ? ` (${conversas.length})` : ""}</TabsTrigger>
            <TabsTrigger value="config"><Settings className="w-4 h-4 mr-1" />Configuração</TabsTrigger>
          </TabsList>

          {/* ── CONVERSAS ── */}
          <TabsContent value="conversas" className="mt-4">
            {!cfg ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                <p className="text-amber-800 font-medium">WhatsApp ainda não configurado</p>
                <p className="text-sm text-amber-700 mt-1">Vá na aba Configuração e cadastre o número em 3 passos.</p>
                <Button className="mt-3" size="sm" onClick={() => setTab("config")}>Configurar agora</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: 480 }}>
                {/* lista */}
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-slate-100 flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                      <Input className="pl-8 h-9" placeholder="Buscar nome ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} />
                    </div>
                    <Button variant="outline" size="sm" className="h-9 px-2" onClick={() => conversasQ.refetch()} title="Atualizar">
                      <RefreshCw className={`w-4 h-4 ${conversasQ.isFetching ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  <div className="overflow-y-auto flex-1" style={{ maxHeight: 560 }}>
                    {conversas.length === 0 && (
                      <p className="text-sm text-slate-500 p-4 text-center">
                        Nenhuma conversa ainda. Assim que alguém mandar mensagem para o número da empresa, ela aparece aqui.
                      </p>
                    )}
                    {conversas.map((c) => {
                      const TIcon = TIPO_ICON[c.ultimaTipo] ?? null;
                      return (
                        <button key={c.id} onClick={() => setConvSel(c)}
                          className={`w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-emerald-50/50 ${convSel?.id === c.id ? "bg-emerald-50" : ""}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm text-slate-800 truncate" title={c.employeeNome ?? c.nomePerfil ?? fmtFone(c.waId)}>
                              {c.employeeNome ?? c.nomePerfil ?? fmtFone(c.waId)}
                            </span>
                            <span className="text-[10px] text-slate-400 flex-shrink-0">{fmtDataHora(c.ultimaMensagemEm)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {c.employeeId ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 rounded-full flex-shrink-0">✓ Funcionário</span>
                            ) : (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded-full flex-shrink-0">? Não identificado</span>
                            )}
                            <span className="text-xs text-slate-500 truncate flex items-center gap-1">
                              {TIcon && <TIcon className="w-3 h-3 flex-shrink-0" />}{c.ultimaMsg ?? (c.ultimaTipo && c.ultimaTipo !== "text" ? `[${c.ultimaTipo}]` : "")}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* chat */}
                <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white flex flex-col overflow-hidden">
                  {!convSel ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-8">
                      Selecione uma conversa ao lado para ver o histórico completo.
                    </div>
                  ) : (
                    <>
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{convSel.employeeNome ?? convSel.nomePerfil ?? fmtFone(convSel.waId)}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{fmtFone(convSel.waId)}{convSel.nomePerfil ? ` · perfil: ${convSel.nomePerfil}` : ""}</p>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { setBuscaFunc(""); setShowVincular(true); }}>
                          <Link2 className="w-3.5 h-3.5" />{convSel.employeeId ? "Trocar funcionário" : "Informar funcionário"}
                        </Button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#efeae2]/40" style={{ maxHeight: 520 }}>
                        {mensagens.length === 0 && <p className="text-center text-sm text-slate-400">Sem mensagens.</p>}
                        {mensagens.map((m) => (
                          <div key={m.id} className={`flex ${m.direcao === "out" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.direcao === "out" ? "bg-emerald-100" : "bg-white"}`}>
                              {m.midiaUrl && (
                                m.midiaMime?.startsWith("image/") ? (
                                  <a href={m.midiaUrl} target="_blank" rel="noopener noreferrer">
                                    <img src={m.midiaUrl} alt={m.midiaNome ?? "imagem"} className="rounded max-h-64 mb-1" loading="lazy" />
                                  </a>
                                ) : m.midiaMime?.startsWith("audio/") ? (
                                  <audio controls src={m.midiaUrl} className="mb-1 max-w-full" />
                                ) : m.midiaMime?.startsWith("video/") ? (
                                  <video controls src={m.midiaUrl} className="rounded max-h-64 mb-1 max-w-full" />
                                ) : (
                                  <a href={m.midiaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-700 hover:underline mb-1 break-words">
                                    <Paperclip className="w-4 h-4 flex-shrink-0" />{m.midiaNome ?? "Documento"}
                                  </a>
                                )
                              )}
                              {m.corpo && <p className="whitespace-pre-wrap break-words text-slate-800">{m.corpo}</p>}
                              <p className="text-[10px] text-slate-400 text-right mt-0.5">{fmtDataHora(m.timestampWa)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── CONFIGURAÇÃO ── */}
          <TabsContent value="config" className="mt-4 space-y-4 max-w-3xl">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-1">
              <p className="font-semibold">Como funciona (100% grátis para receber):</p>
              <p>1️⃣ Crie a conta gratuita no <b>Meta for Developers</b> (developers.facebook.com) → app do tipo Business → produto <b>WhatsApp</b>.</p>
              <p>2️⃣ Lá você pega o <b>Phone Number ID</b> e o <b>Token de Acesso</b> permanente — cole nos campos abaixo e salve.</p>
              <p>3️⃣ Ainda na Meta, em WhatsApp → Configuração → Webhook, cole a <b>URL</b> e o <b>Token de Verificação</b> mostrados abaixo e assine o campo <b>messages</b>. Pronto!</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Phone Number ID *</Label>
                  <Input value={f.phoneNumberId} onChange={(e) => setForm({ ...f, phoneNumberId: e.target.value })} placeholder="ex: 123456789012345" />
                </div>
                <div>
                  <Label className="text-xs">Número (só para exibição)</Label>
                  <Input value={f.numeroExibicao} onChange={(e) => setForm({ ...f, numeroExibicao: e.target.value })} placeholder="ex: (12) 99999-9999" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Token de Acesso da Meta {cfg?.temToken ? "(já salvo — preencha só para trocar)" : "*"}</Label>
                <Input type="password" value={f.accessToken} onChange={(e) => setForm({ ...f, accessToken: e.target.value })}
                  placeholder={cfg?.temToken ? "•••••••• (mantém o atual se deixar vazio)" : "Cole o token permanente aqui"} />
              </div>
              <div>
                <Label className="text-xs">App Secret da Meta {cfg?.temAppSecret ? "(já salvo — preencha só para trocar)" : "(recomendado — valida que a mensagem veio mesmo da Meta)"}</Label>
                <Input type="password" value={f.appSecret} onChange={(e) => setForm({ ...f, appSecret: e.target.value })}
                  placeholder={cfg?.temAppSecret ? "•••••••• (mantém o atual se deixar vazio)" : "Em Configurações do App → Básico → Chave Secreta do Aplicativo"} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={f.ativo} onCheckedChange={(v) => setForm({ ...f, ativo: v })} />
                <span className="text-sm text-slate-700">Recepção ativa</span>
              </div>
              <Button onClick={() => salvarMut.mutate({ companyId, phoneNumberId: f.phoneNumberId, accessToken: f.accessToken || undefined, appSecret: f.appSecret || undefined, numeroExibicao: f.numeroExibicao || undefined, ativo: f.ativo })}
                disabled={salvarMut.isPending || !f.phoneNumberId.trim()}>
                {salvarMut.isPending ? "Salvando..." : cfg ? "Atualizar configuração" : "Salvar e gerar tokens"}
              </Button>
            </div>

            {cfg && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Dados para colar no painel da Meta (Webhook):</p>
                <div>
                  <Label className="text-xs text-emerald-800">URL de Callback</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={webhookUrl} className="bg-white font-mono text-xs" />
                    <Button variant="outline" size="sm" onClick={() => copiar(webhookUrl, "URL")}><Copy className="w-4 h-4" /></Button>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-1 break-words">⚠️ Use a URL do app <b>publicado</b> (erp-gestao-integrada.replit.app) — a Meta precisa de um endereço fixo e público.</p>
                </div>
                <div>
                  <Label className="text-xs text-emerald-800">Token de Verificação</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={cfg.verifyToken} className="bg-white font-mono text-xs" />
                    <Button variant="outline" size="sm" onClick={() => copiar(cfg.verifyToken, "Token de verificação")}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* dialog vincular funcionário */}
        <Dialog open={showVincular} onOpenChange={(o) => { if (!o) setShowVincular(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><User className="w-5 h-5 text-emerald-600" />Informar funcionário</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600 break-words">Conversa de <b>{convSel ? (convSel.nomePerfil ?? fmtFone(convSel.waId)) : ""}</b> — escolha quem é este funcionário:</p>
            <Input placeholder="Buscar por nome..." value={buscaFunc} onChange={(e) => setBuscaFunc(e.target.value)} />
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
              {funcionarios.slice(0, 100).map((e) => (
                <button key={e.id} className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm"
                  onClick={() => convSel && vincularMut.mutate({ conversaId: convSel.id, employeeId: e.id })}>
                  <span className="font-medium text-slate-800 break-words">{e.nome}</span>
                  <span className="text-xs text-slate-500 ml-2">{e.status}{e.celular ? ` · ${e.celular}` : ""}</span>
                </button>
              ))}
              {funcionarios.length === 0 && <p className="text-sm text-slate-400 p-3 text-center">Nenhum funcionário encontrado.</p>}
            </div>
            {convSel?.employeeId && (
              <Button variant="outline" size="sm" className="text-red-600" onClick={() => vincularMut.mutate({ conversaId: convSel.id, employeeId: null })}>
                Remover vínculo atual
              </Button>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
