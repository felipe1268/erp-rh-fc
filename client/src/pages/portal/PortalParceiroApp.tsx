// Rev. 4701 — Portal do Parceiro nas CORES DA FC (azul-marinho + amarelo)
// 3 telas: 1) Boas-vindas (só instruções + "Acessar Sistema", sem lançamentos)
//          2) Sistema (KPIs + meus lançamentos + novo)
//          3) Novo lançamento (galeria de fotos, anexo, confirmação poka-yoke)
import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  LogOut, Plus, CheckCircle, XCircle, Clock, ArrowLeft, ArrowRight,
  Search, ShoppingCart, DollarSign, Receipt, Paperclip, User,
  CalendarDays, HelpCircle, FileText, Eye, Home, Banknote, ClipboardList,
} from "lucide-react";

// Competência do desconto (mesma regra do servidor): dia <= 15 → mês da compra; >= 16 → mês seguinte
function competenciaDaCompra(dataCompra: string): string {
  const m = dataCompra?.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  let y = Number(m[1]); let mo = Number(m[2]); const d = Number(m[3]);
  if (d >= 16) { mo += 1; if (mo > 12) { mo = 1; y += 1; } }
  const nomes = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${nomes[mo - 1]} de ${y}`;
}

const fmtBRL = (v: any) => (parseFloat(v || "0") || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d?: string | null) => {
  const m = String(d || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const iniciais = (nome: string) => nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const fotoSrc = (url?: string | null) => {
  if (!url) return null;
  return url.startsWith("/uploads") ? `${url}?w=128` : url;
};

function Avatar({ nome, fotoUrl, size = "h-12 w-12", text = "text-sm" }: { nome: string; fotoUrl?: string | null; size?: string; text?: string }) {
  const src = fotoSrc(fotoUrl);
  const [erro, setErro] = useState(false);
  if (src && !erro) {
    return <img src={src} loading="lazy" onError={() => setErro(true)} alt={nome} className={`${size} rounded-full object-cover ring-2 ring-amber-300 shrink-0`} />;
  }
  return (
    <div className={`${size} rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-amber-400 font-bold ${text} shrink-0`}>
      {iniciais(nome) || <User className="h-5 w-5" />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: any; label: string }> = {
    aprovado: { cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle, label: "Aprovado" },
    pendente: { cls: "bg-amber-100 text-amber-700", icon: Clock, label: "Aguardando RH" },
    rejeitado: { cls: "bg-red-100 text-red-700", icon: XCircle, label: "Rejeitado" },
    cancelado: { cls: "bg-gray-100 text-gray-600", icon: XCircle, label: "Cancelado" },
  };
  const s = map[status] || map.pendente;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${s.cls}`}>
      <s.icon className="h-3.5 w-3.5" />{s.label}
    </span>
  );
}

export default function PortalParceiroApp() {
  const [, navigate] = useLocation();
  const token = localStorage.getItem("portal_token") || "";
  const nomeLS = localStorage.getItem("portal_nome") || "Parceiro";

  const [page, setPage] = useState<"welcome" | "sistema" | "lancar">("welcome");
  const [busca, setBusca] = useState("");
  const [selEmp, setSelEmp] = useState<any>(null);
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verLancamento, setVerLancamento] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dados = trpc.portalExterno.parceiro.meusDados.useQuery({ token }, { enabled: !!token });
  const lancQuery = trpc.portalExterno.parceiro.meusLancamentos.useQuery({ token }, { enabled: !!token });
  const empsQuery = trpc.portalExterno.parceiro.buscarFuncionarios.useQuery({ token, busca: "" }, { enabled: !!token, staleTime: 60_000 });

  const criarMut = trpc.portalExterno.parceiro.criarLancamento.useMutation();
  const uploadMut = trpc.portalExterno.parceiro.uploadNotaFiscal.useMutation();

  const parceiro = dados.data as any;
  const nomeParceiro = parceiro?.nomeFantasia || parceiro?.razaoSocial || nomeLS;
  const lancamentos = (lancQuery.data || []) as any[];

  const hoje = new Date().toISOString().slice(0, 10);
  const mesAtual = hoje.slice(0, 7);
  const doMes = lancamentos.filter((l: any) => String(l.dataCompra || "").slice(0, 7) === mesAtual);
  const totalMes = doMes.reduce((s: number, l: any) => s + (parseFloat(l.valor || "0") || 0), 0);
  const pendentes = lancamentos.filter((l: any) => l.status === "pendente").length;
  const aprovados = lancamentos.filter((l: any) => l.status === "aprovado").length;

  const employees = useMemo(() => {
    const all = (empsQuery.data || []) as any[];
    const t = busca.trim().toLowerCase();
    const tNum = t.replace(/\D/g, "");
    const filtered = !t ? all : all.filter((e: any) =>
      (e.nomeCompleto || "").toLowerCase().includes(t) || (tNum && (e.cpf || "").replace(/\D/g, "").includes(tNum))
    );
    return [...filtered].sort((a: any, b: any) => (a.nomeCompleto || "").localeCompare(b.nomeCompleto || "", "pt-BR"));
  }, [empsQuery.data, busca]);

  const valorNum = parseFloat(String(valor).replace(/\./g, "").replace(",", ".")) || 0;
  const dataFutura = dataCompra > hoje;
  const prontoParaEnviar = !!selEmp && valorNum > 0 && !!dataCompra && !dataFutura;

  const handleLogout = () => {
    ["portal_token", "portal_tipo", "portal_nome", "portal_cnpj"].forEach((k) => localStorage.removeItem(k));
    navigate("/portal/login");
  };

  const limparForm = () => {
    setSelEmp(null); setBusca(""); setValor(""); setDescricao(""); setObservacoes("");
    setArquivo(null); setDataCompra(new Date().toISOString().slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleArquivo = (f: File | null) => {
    if (!f) { setArquivo(null); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 10MB)"); return; }
    setArquivo(f);
  };

  const confirmarEnvio = async () => {
    if (!prontoParaEnviar || enviando) return;
    setEnviando(true);
    try {
      const res = await criarMut.mutateAsync({
        token,
        employeeId: selEmp.id,
        employeeNome: selEmp.nomeCompleto,
        dataCompra,
        descricaoItens: descricao.trim() || undefined,
        valor: valorNum.toFixed(2),
        observacoes: observacoes.trim() || undefined,
      });
      if (arquivo && res.id) {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              await uploadMut.mutateAsync({
                token,
                lancamentoId: Number(res.id),
                fileName: arquivo.name,
                fileBase64: (reader.result as string).split(",")[1],
                contentType: arquivo.type || "application/octet-stream",
              });
            } catch (e: any) {
              toast.error("Lançamento salvo, mas o comprovante falhou: " + (e?.message || "erro"));
            }
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(arquivo);
        });
      }
      toast.success("Lançamento enviado para aprovação do RH!");
      setConfirmOpen(false);
      limparForm();
      lancQuery.refetch();
      setPage("sistema");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao registrar lançamento");
    } finally {
      setEnviando(false);
    }
  };

  // ── Header FC (azul-marinho + amarelo) ──────────────────────────────────
  const Header = (
    <header className="bg-slate-900 text-white sticky top-0 z-20 shadow-lg border-b-2 border-amber-400">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/logo-fc-branco-amarelo.png" alt="FC Engenharia" className="h-9 max-h-9 w-auto object-contain shrink-0" />
          <div className="min-w-0 hidden sm:block">
            <h1 className="font-bold leading-tight truncate text-sm">{nomeParceiro}</h1>
            <p className="text-[11px] text-amber-400/90">Portal do Parceiro</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {page !== "welcome" && (
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={() => setPage("welcome")}>
              <Home className="h-4 w-4 mr-1" /> Início
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </div>
    </header>
  );

  // ══════════════════════ TELA 3 — NOVO LANÇAMENTO ══════════════════════
  if (page === "lancar") {
    return (
      <div className="min-h-screen bg-slate-50 pb-28">
        {Header}
        <div className="max-w-5xl mx-auto px-4 pt-5 space-y-5">
          <button onClick={() => setPage("sistema")} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Voltar aos lançamentos
          </button>

          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-amber-500" /> Novo Lançamento</h2>
            <p className="text-sm text-slate-500 mt-0.5">Escolha o colaborador, informe a compra e anexe o comprovante.</p>
          </div>

          {/* Passo 1 — Colaborador */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-7 w-7 rounded-full bg-slate-900 text-amber-400 text-sm font-bold flex items-center justify-center">1</span>
              <h3 className="font-semibold text-slate-900">Quem fez a compra?</h3>
            </div>
            {selEmp ? (
              <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-400 rounded-xl p-3">
                <Avatar nome={selEmp.nomeCompleto} fotoUrl={selEmp.fotoUrl} size="h-14 w-14" text="text-base" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 break-words">{selEmp.nomeCompleto}</p>
                  <p className="text-xs text-slate-500">{selEmp.funcao || selEmp.cargo || "Colaborador"}{selEmp.cpf ? ` · CPF ${selEmp.cpf}` : ""}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelEmp(null)}>Trocar</Button>
              </div>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite o nome ou CPF do colaborador..." className="pl-10 h-11 text-base" />
                </div>
                {empsQuery.isLoading ? (
                  <div className="text-center py-8 text-slate-400 text-sm">Carregando colaboradores...</div>
                ) : employees.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">Nenhum colaborador encontrado</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[340px] overflow-y-auto pr-1">
                    {employees.map((e: any) => (
                      <button
                        key={e.id}
                        onClick={() => setSelEmp(e)}
                        className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 hover:border-amber-400 hover:bg-amber-50 active:scale-[0.98] transition text-center"
                      >
                        <Avatar nome={e.nomeCompleto} fotoUrl={e.fotoUrl} size="h-16 w-16" text="text-lg" />
                        <span className="text-xs font-medium text-slate-800 leading-snug break-words w-full">{e.nomeCompleto}</span>
                        <span className="text-[10px] text-slate-400 leading-none">{e.funcao || e.cargo || ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Passo 2 — Dados da compra */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-7 w-7 rounded-full bg-slate-900 text-amber-400 text-sm font-bold flex items-center justify-center">2</span>
              <h3 className="font-semibold text-slate-900">Dados da compra</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Data da compra *</label>
                <Input type="date" value={dataCompra} max={hoje} onChange={(e) => setDataCompra(e.target.value)} className="mt-1 h-11" />
                {dataFutura && <p className="text-xs text-red-600 mt-1">A data não pode ser futura.</p>}
                {!dataFutura && dataCompra && (
                  <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5 text-amber-500" /> Desconto na folha de <strong className="capitalize">{competenciaDaCompra(dataCompra)}</strong>
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Valor (R$) *</label>
                <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" className="mt-1 h-11 text-lg font-semibold" />
                {valor && valorNum <= 0 && <p className="text-xs text-red-600 mt-1">Informe um valor maior que zero.</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-slate-700">Descrição dos itens</label>
                <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Medicamentos, combustível..." className="mt-1 h-11" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-slate-700">Observações</label>
                <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional" rows={2} className="mt-1" />
              </div>
            </div>
          </section>

          {/* Passo 3 — Comprovante */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-7 w-7 rounded-full bg-slate-900 text-amber-400 text-sm font-bold flex items-center justify-center">3</span>
              <h3 className="font-semibold text-slate-900">Comprovante da compra</h3>
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => handleArquivo(e.target.files?.[0] || null)} />
            {arquivo ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <Receipt className="h-6 w-6 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 break-all">{arquivo.name}</p>
                  <p className="text-xs text-slate-500">{(arquivo.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setArquivo(null); if (fileRef.current) fileRef.current.value = ""; }}>Remover</Button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-amber-300 rounded-xl p-6 text-center hover:bg-amber-50 transition"
              >
                <Paperclip className="h-7 w-7 text-amber-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-800">Toque para anexar o comprovante</p>
                <p className="text-xs text-slate-400 mt-1">Foto, PDF ou qualquer arquivo · máx. 10MB</p>
              </button>
            )}
          </section>
        </div>

        {/* Barra fixa de envio */}
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-20">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Total do lançamento</p>
              <p className="text-lg font-bold text-slate-900">{valorNum > 0 ? fmtBRL(valorNum) : "R$ 0,00"}</p>
            </div>
            <Button
              size="lg"
              className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold h-12 px-6 text-base"
              disabled={!prontoParaEnviar || enviando}
              onClick={() => setConfirmOpen(true)}
            >
              Revisar e Enviar <ArrowRight className="h-5 w-5 ml-1.5" />
            </Button>
          </div>
        </div>

        {/* Confirmação poka-yoke */}
        <Dialog open={confirmOpen} onOpenChange={(o) => !o && !enviando && setConfirmOpen(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-amber-500" /> Confirmar Lançamento</DialogTitle></DialogHeader>
            {selEmp && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                  <Avatar nome={selEmp.nomeCompleto} fotoUrl={selEmp.fotoUrl} size="h-12 w-12" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 break-words">{selEmp.nomeCompleto}</p>
                    <p className="text-xs text-slate-500">{selEmp.funcao || selEmp.cargo || "Colaborador"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-500">Data</p><p className="font-medium">{fmtData(dataCompra)}</p></div>
                  <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-500">Valor</p><p className="font-bold text-slate-900">{fmtBRL(valorNum)}</p></div>
                  <div className="bg-slate-50 rounded-lg p-2.5 col-span-2"><p className="text-xs text-slate-500">Desconto na folha de</p><p className="font-medium capitalize">{competenciaDaCompra(dataCompra)}</p></div>
                  {descricao.trim() && <div className="bg-slate-50 rounded-lg p-2.5 col-span-2"><p className="text-xs text-slate-500">Itens</p><p className="break-words">{descricao}</p></div>}
                  <div className="bg-slate-50 rounded-lg p-2.5 col-span-2">
                    <p className="text-xs text-slate-500">Comprovante</p>
                    {arquivo ? <p className="break-all text-emerald-700 font-medium">{arquivo.name}</p> : <p className="text-amber-600 font-medium">Sem comprovante anexado</p>}
                  </div>
                </div>
                {!arquivo && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    Recomendamos anexar o comprovante — o RH pode rejeitar lançamentos sem nota.
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" disabled={enviando} onClick={() => setConfirmOpen(false)}>Voltar</Button>
              <Button className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold" disabled={enviando} onClick={confirmarEnvio}>
                {enviando ? "Enviando..." : "Confirmar e Enviar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ══════════════════════ TELA 2 — SISTEMA (LANÇAMENTOS) ══════════════════════
  if (page === "sistema") {
    return (
      <div className="min-h-screen bg-slate-50 pb-10">
        {Header}
        <div className="max-w-5xl mx-auto px-4 pt-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Meus Lançamentos</h2>
              <p className="text-sm text-slate-500">Acompanhe o status de cada consumo registrado.</p>
            </div>
            <Button size="lg" className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold h-11" onClick={() => setPage("lancar")}>
              <Plus className="h-5 w-5 mr-1.5" /> Novo Lançamento
            </Button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Lançamentos no mês", value: String(doMes.length), icon: ShoppingCart },
              { label: "Total do mês", value: fmtBRL(totalMes), icon: DollarSign },
              { label: "Aguardando RH", value: String(pendentes), icon: Clock },
              { label: "Aprovados", value: String(aprovados), icon: CheckCircle },
            ].map((k) => (
              <div key={k.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
                <div className="h-8 w-8 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center"><k.icon className="h-4 w-4" /></div>
                <p className="text-lg font-bold text-slate-900 mt-2 break-words leading-tight">{k.value}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Lista */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold text-slate-900">Histórico</h3>
            </div>
            {lancQuery.isLoading ? (
              <div className="text-center py-10 text-slate-400 text-sm">Carregando...</div>
            ) : lancamentos.length === 0 ? (
              <div className="text-center py-12 px-4">
                <ShoppingCart className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Nenhum lançamento ainda. Toque em <strong>Novo Lançamento</strong> para começar!</p>
              </div>
            ) : (
              <ul className="divide-y">
                {lancamentos.map((l: any) => (
                  <li key={l.id}>
                    <button onClick={() => setVerLancamento(l)} className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 text-left">
                      <Avatar nome={l.employeeNome || "?"} fotoUrl={null} size="h-10 w-10" text="text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 break-words">{l.employeeNome}</p>
                        <p className="text-xs text-slate-500">{fmtData(l.dataCompra)}{l.descricaoItens ? ` · ${l.descricaoItens}` : ""}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-900">{fmtBRL(l.valor)}</p>
                        <StatusBadge status={l.status} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Detalhe do lançamento */}
        <Dialog open={!!verLancamento} onOpenChange={(o) => !o && setVerLancamento(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-amber-500" /> Lançamento</DialogTitle></DialogHeader>
            {verLancamento && (
              <div className="space-y-2 text-sm">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="font-semibold text-slate-900 break-words">{verLancamento.employeeNome}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Compra em {fmtData(verLancamento.dataCompra)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-500">Valor</p><p className="font-bold text-slate-900">{fmtBRL(verLancamento.valor)}</p></div>
                  <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-xs text-slate-500">Status</p><StatusBadge status={verLancamento.status} /></div>
                  {verLancamento.descricaoItens && <div className="bg-slate-50 rounded-lg p-2.5 col-span-2"><p className="text-xs text-slate-500">Itens</p><p className="break-words">{verLancamento.descricaoItens}</p></div>}
                  {verLancamento.observacoes && <div className="bg-slate-50 rounded-lg p-2.5 col-span-2"><p className="text-xs text-slate-500">Observações</p><p className="break-words">{verLancamento.observacoes}</p></div>}
                </div>
                {verLancamento.comprovanteUrl ? (
                  <a href={verLancamento.comprovanteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-slate-900 font-medium bg-amber-50 border border-amber-200 rounded-lg p-2.5 hover:bg-amber-100">
                    <Receipt className="h-4 w-4 text-amber-600" /> Ver comprovante anexado
                  </a>
                ) : (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">Sem comprovante anexado.</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setVerLancamento(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ══════════════════════ TELA 1 — BOAS-VINDAS (SÓ INSTRUÇÕES) ══════════════════════
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {Header}

      <div className="flex-1 w-full">
        {/* Hero de boas-vindas */}
        <div className="max-w-3xl mx-auto px-4 pt-10 pb-8 text-center">
          <img src="/logo-fc-branco-amarelo.png" alt="FC Engenharia" className="h-16 max-h-16 w-auto object-contain mx-auto mb-5" />
          <p className="text-amber-400 font-semibold tracking-wide text-sm uppercase">Portal do Parceiro Conveniado</p>
          <h2 className="text-3xl sm:text-4xl font-bold mt-2 break-words">Bem-vindo, {nomeParceiro}!</h2>
          <p className="text-slate-300 mt-3 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            Este é o seu canal oficial com a FC Engenharia para registrar o consumo dos
            nossos colaboradores no seu estabelecimento — simples, rápido e sem papelada.
          </p>
          <Button
            size="lg"
            className="mt-7 bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold h-14 px-8 text-lg shadow-xl shadow-amber-400/20"
            onClick={() => setPage("sistema")}
          >
            Acessar Sistema <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </div>

        {/* Instruções */}
        <div className="bg-slate-50 text-slate-900 rounded-t-[2rem] pt-8 pb-10">
          <div className="max-w-4xl mx-auto px-4 space-y-5">
            <h3 className="text-center font-bold text-lg flex items-center justify-center gap-2">
              <HelpCircle className="h-5 w-5 text-amber-500" /> Como funciona
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="h-10 w-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center mb-3"><ClipboardList className="h-5 w-5" /></div>
                <p className="font-bold text-sm">Cadastro das compras</p>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Registre cada compra <strong>no dia em que ela acontecer</strong>, de preferência na hora:
                  escolha o colaborador pela foto ou nome, informe data, valor e itens, e anexe o
                  comprovante (foto da nota ou cupom).
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="h-10 w-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center mb-3"><CalendarDays className="h-5 w-5" /></div>
                <p className="font-bold text-sm">Datas e fechamento</p>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  O ciclo fecha todo <strong>dia 15</strong>: compras de <strong>16 a 15</strong> entram
                  na folha do mês seguinte. Ex.: compra em 20/07 → desconto na folha de agosto.
                  Lance dentro do ciclo para não perder o fechamento.
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className="h-10 w-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center mb-3"><Banknote className="h-5 w-5" /></div>
                <p className="font-bold text-sm">Fluxo de pagamento</p>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  O RH da FC confere e <strong>aprova</strong> cada lançamento. Os valores aprovados são
                  descontados dos colaboradores em folha e o <strong>repasse ao seu estabelecimento</strong> é
                  feito pelo financeiro da FC após o fechamento do ciclo.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center">
              <p className="text-xs text-slate-600">
                <strong>Dúvidas?</strong> Fale com o RH da FC Engenharia pelos canais habituais de contato.
                Você pode acompanhar o status de todos os seus lançamentos dentro do sistema.
              </p>
            </div>

            <div className="text-center">
              <Button
                size="lg"
                className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold h-12 px-8"
                onClick={() => setPage("sistema")}
              >
                Acessar Sistema <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
