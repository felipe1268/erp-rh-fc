// ----------------------------------------------------------------------------
// MÓDULO REEMBOLSO (Rev. 5052) — Painel único
// Abas: Solicitações (avulso + prestações de caixinha) | Caixinhas (fundo fixo)
// - Usuário comum: vê e cria as PRÓPRIAS solicitações (login → employee).
// - Admin: fila de aprovação item a item; aprovar gera título no Contas a Pagar.
// ----------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogMaximizeButton } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import DashboardLayout from "@/components/DashboardLayout";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PersonPhoto } from "@/components/PersonPhoto";
import { ChevronsUpDown, BarChart3 } from "lucide-react";
import {
  Receipt, Plus, Wallet, Loader2, Paperclip, Trash2, CheckCircle2, XCircle,
  Eye, PiggyBank, AlertTriangle, Clock, Search, Sparkles, Pencil,
  Utensils, Fuel, Car, BedDouble, Hammer, Coins, Tag, User, MessageSquareText, Landmark, QrCode, Settings,
  Wrench, Truck, Lock, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import ObraCombobox, { type ObraOption } from "@/components/ObraCombobox";

const CATEGORIAS = [
  { v: "transporte",         l: "Transporte / Uber / Táxi" },
  { v: "alimentacao",        l: "Alimentação" },
  { v: "combustivel",        l: "Combustível" },
  { v: "pedagio",            l: "Pedágio / Estacionamento" },
  { v: "material",           l: "Material / Ferramenta" },
  { v: "hospedagem",         l: "Hospedagem" },
  { v: "manutencao_veiculo", l: "Manutenção de Veículo" },
  { v: "outros",             l: "Outros" },
] as const;
const CATS_COM_VEICULO = ["combustivel", "manutencao_veiculo"] as const;
const catLabel = (v: string) => CATEGORIAS.find((c) => c.v === v)?.l || v;

// Rev. 5056 — visual por categoria (ícone + cores) p/ o layout do dialog
const CAT_META: Record<string, { icon: any; text: string; bg: string; border: string; bar: string }> = {
  transporte:  { icon: Car,       text: "text-sky-700",     bg: "bg-sky-50",     border: "border-sky-200",     bar: "from-sky-400 to-sky-600" },
  alimentacao: { icon: Utensils,  text: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200",  bar: "from-orange-400 to-orange-600" },
  combustivel: { icon: Fuel,      text: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-200",    bar: "from-rose-400 to-rose-600" },
  pedagio:     { icon: Coins,     text: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   bar: "from-amber-400 to-amber-600" },
  material:    { icon: Hammer,    text: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200",  bar: "from-violet-400 to-violet-600" },
  hospedagem:        { icon: BedDouble, text: "text-teal-700",    bg: "bg-teal-50",    border: "border-teal-200",    bar: "from-teal-400 to-teal-600" },
  manutencao_veiculo:{ icon: Wrench,    text: "text-indigo-700", bg: "bg-indigo-50",  border: "border-indigo-200",  bar: "from-indigo-400 to-indigo-600" },
  outros:            { icon: Tag,       text: "text-slate-700",  bg: "bg-slate-50",   border: "border-slate-200",   bar: "from-slate-400 to-slate-600" },
};
const catMeta = (v: string) => CAT_META[v] || CAT_META.outros;

const brl = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (s?: string | null) => {
  if (!s) return "-";
  const d = String(s).slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(s);
};
// data + hora BR: "20/08/2026 às 21:46"
const dtBR = (v?: string | Date | null) => {
  if (!v) return null;
  try {
    const d = typeof v === "string" ? new Date(v) : v;
    if (isNaN(d.getTime())) return null;
    const dt = dataBR(d.toISOString().slice(0, 10));
    const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dt} às ${hm}`;
  } catch { return null; }
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pendente:         { label: "Aguardando aprovação",  cls: "bg-amber-100 text-amber-700 border-amber-300" },
  aprovada:         { label: "Aguardando pagamento",  cls: "bg-sky-100 text-sky-700 border-sky-300" },
  aprovada_parcial: { label: "Ag. pagamento (parcial)", cls: "bg-orange-100 text-orange-700 border-orange-300" },
  reprovada:        { label: "Reprovada",             cls: "bg-red-100 text-red-700 border-red-300" },
  cancelada:        { label: "Cancelada",             cls: "bg-slate-100 text-slate-600 border-slate-300" },
};

interface DespesaForm {
  obraId: number | null;
  categoria: string;
  descricao: string;
  dataDespesa: string;
  valor: string; // texto BR digitado
  comprovanteUrl: string | null;
  comprovanteKey: string | null;
  // Alocação no planejamento orçamentário (EAP) — opcional
  orcamentoItemId: number | null;
  eapCodigo: string | null;
  eapDescricao: string | null;
  // Estabelecimento lido da notinha pela IA
  estabelecimentoNome: string | null;
  estabelecimentoCnpj: string | null;
  estabelecimentoEndereco: string | null;
  // Rastreio do documento fiscal (anti-duplicidade)
  docChave: string | null;
  docNumero: string | null;
  // Rev. 5080 — itens discriminados da nota (IA)
  itens: { qtd: string | null; descricao: string; valor: number }[] | null;
  // Rev. 5081 — vínculo com veículo da Frota (poka-yoke)
  vehicleId: number | null;
  vehiclePlaca: string | null;
  vehicleModelo: string | null;
  // Rev. 5082 — km do hodômetro + próxima manutenção
  kmNaManutencao: string | null;
  kmProxima: string | null;
  _uploading?: boolean;
  // Rev. 5086 — resultado de verificação de duplicidade (após IA ler a nota)
  _duplicatas?: { solicitacaoId: number; employeeNome: string | null; valor: number; dataDespesa: string; estabelecimentoNome: string | null; nivel: "exato" | "provavel" | "parecido" }[];
}

const novaDespesa = (): DespesaForm => ({
  obraId: null, categoria: "outros", descricao: "",
  dataDespesa: new Date().toISOString().slice(0, 10),
  valor: "", comprovanteUrl: null, comprovanteKey: null,
  orcamentoItemId: null, eapCodigo: null, eapDescricao: null,
  estabelecimentoNome: null, estabelecimentoCnpj: null, estabelecimentoEndereco: null,
  docChave: null, docNumero: null, itens: null,
  vehicleId: null, vehiclePlaca: null, vehicleModelo: null,
  kmNaManutencao: null, kmProxima: null,
  _duplicatas: undefined,
});

const parseValor = (s: string) => {
  const t = String(s || "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

export default function ReembolsoPainel() {
  const { companyIdNum, getCompanyIdsForQuery } = useCompany();
  const companyIds = getCompanyIdsForQuery();
  const utils = trpc.useUtils();

  const ctxQuery = trpc.reembolsos.contexto.useQuery({ companyId: companyIdNum, companyIds }, { enabled: companyIdNum > 0 });
  const isAdmin = !!ctxQuery.data?.isAdmin;
  // Rev. 5083 — seletor de mês/ano
  const [anoSelecionado, setAnoSelecionado] = useState(() => new Date().getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState<number | null>(null);

  const solsQuery = trpc.reembolsos.solicitacoes.list.useQuery({ companyId: companyIdNum, companyIds }, { enabled: companyIdNum > 0 });
  const mesesQuery = trpc.reembolsos.solicitacoes.getMesesStatus.useQuery(
    { companyId: companyIdNum, companyIds, ano: anoSelecionado },
    { enabled: companyIdNum > 0 },
  );
  const fundosQuery = trpc.reembolsos.fundos.list.useQuery({ companyId: companyIdNum, companyIds }, { enabled: companyIdNum > 0 });
  // Rev. 5062 — só obras ATIVAS e que o usuário tem permissão de ver
  const obrasQuery = trpc.obras.listActive.useQuery({ companyId: companyIdNum, companyIds }, { enabled: companyIdNum > 0 });
  const employeesQuery = trpc.employees.list.useQuery({ companyId: companyIdNum, companyIds }, { enabled: companyIdNum > 0 && isAdmin });

  const invalidar = () => {
    utils.reembolsos.solicitacoes.list.invalidate();
    utils.reembolsos.fundos.list.invalidate();
    utils.reembolsos.solicitacoes.getMesesStatus.invalidate();
  };

  // ── Nova solicitação ────────────────────────────────────────────────────────
  const [novoOpen, setNovoOpen] = useState(false);
  const [fundoDoNovo, setFundoDoNovo] = useState<number | null>(null); // prestação de contas
  const [empDoNovo, setEmpDoNovo] = useState<number | null>(null);     // admin em nome de alguém
  const [motivo, setMotivo] = useState("");
  const [pagTipo, setPagTipo] = useState<"pix" | "conta">("pix");
  const [pagChave, setPagChave] = useState("");
  const [salvarDados, setSalvarDados] = useState(true);
  const [despesas, setDespesas] = useState<DespesaForm[]>([novaDespesa()]);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const uploadMut = trpc.reembolsos.uploadComprovante.useMutation();
  const lerMut = trpc.reembolsos.lerComprovante.useMutation();
  const aiFileRef = useRef<HTMLInputElement | null>(null);
  const [lendoIA, setLendoIA] = useState(0); // qtde de notinhas em leitura
  const [lendoTotal, setLendoTotal] = useState(0); // total do lote atual (p/ % de progresso)
  const [empPickerOpen, setEmpPickerOpen] = useState(false); // combobox de colaborador
  // Rev. 5062 — picker de alocação no planejamento orçamentário (EAP)
  const [eapPickerIdx, setEapPickerIdx] = useState<number | null>(null);
  const [eapBusca, setEapBusca] = useState("");
  // Rev. 5081 — picker de veículo (poka-yoke: combustível/manutenção víncula Frota)
  const [veicPickerIdx, setVeicPickerIdx] = useState<number | null>(null);
  const [veicBusca, setVeicBusca] = useState("");
  const veiculosQuery = trpc.frotas.listVehicles.useQuery(
    { companyId: companyIdNum, status: "Ativo" },
    { staleTime: 60_000, enabled: novoOpen },
  );
  const eapObraId = eapPickerIdx != null ? (despesas[eapPickerIdx]?.obraId ?? null) : null;
  const eapQuery = trpc.compras.getEapParaObra.useQuery(
    { obraId: eapObraId!, companyId: companyIdNum },
    { enabled: eapPickerIdx != null && !!eapObraId, staleTime: 60_000 },
  );
  // Rev. 5067 — edição de solicitação pendente + seleção múltipla
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const toggleSel = (id: number) => setSelecionadas((prev) => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });
  const atualizarMut = trpc.reembolsos.solicitacoes.atualizar.useMutation({
    onSuccess: () => { toast.success("Solicitação atualizada!"); setNovoOpen(false); setEditandoId(null); invalidar(); },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar."),
  });
  const excluirMut = trpc.reembolsos.solicitacoes.excluir.useMutation({
    onSuccess: (r: any) => {
      if (r.apagadas > 0) toast.success(`${r.apagadas} solicitação(ões) apagada(s).`);
      if (r.bloqueadas?.length) toast.error(`Não apagadas: ${r.bloqueadas.join("; ")}`);
      setSelecionadas(new Set()); invalidar();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao apagar."),
  });
  const [aprovandoLote, setAprovandoLote] = useState(false);
  // Rev. 5079 — o menu lateral NÃO muda a URL: ele grava os parâmetros em
  // sessionStorage('_navParams') e dispara o evento 'navParamsUpdated'.
  // Lemos dos DOIS lugares (URL e _navParams) e reagimos ao evento.
  const search = useSearch();
  const lerParams = () => {
    const nav = sessionStorage.getItem("_navParams") || "";
    const p = new URLSearchParams(nav || search);
    return { novo: p.get("novo") === "1", dash: p.get("view") === "dash" };
  };
  const [verDash, setVerDash] = useState(() => lerParams().dash);
  useEffect(() => {
    const aplicar = () => {
      const { novo, dash } = lerParams();
      setVerDash(dash);
      if (novo) {
        setFundoOpen(true);
        // consome o "novo=1" pra não reabrir o dialog em toda navegação seguinte
        const nav = sessionStorage.getItem("_navParams") || "";
        sessionStorage.setItem("_navParams", nav.replace(/&?novo=1/, ""));
      }
    };
    aplicar();
    window.addEventListener("navParamsUpdated", aplicar);
    return () => window.removeEventListener("navParamsUpdated", aplicar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Rev. 5076 — trocar o colaborador no dialog re-detecta a caixinha automaticamente
  useEffect(() => {
    if (!novoOpen || editandoId != null) return;
    const f = (fundosQuery.data || []).find((x: any) => x.status === "ativo" && x.employeeId === empDoNovo);
    setFundoDoNovo(f ? f.id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empDoNovo, novoOpen]);
  const fundoAtivoDoNovo = (fundosQuery.data || []).find((f: any) => f.id === fundoDoNovo) || null;

  // Rev. 5072 — critérios do módulo (prazo de pagamento configurável)
  const configQuery = trpc.reembolsos.config.get.useQuery({ companyId: companyIdNum }, { enabled: !!companyIdNum });
  const prazoDias = configQuery.data?.prazoDias ?? 5;
  const [criteriosOpen, setCriteriosOpen] = useState(false);
  const [prazoDraft, setPrazoDraft] = useState("");
  const setPrazoMut = trpc.reembolsos.config.setPrazoDias.useMutation({
    onSuccess: () => { toast.success("Critério salvo!"); setCriteriosOpen(false); configQuery.refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar."),
  });
  // Rev. 5070 — confirmação poka-yoke colorida (substitui o confirm() nativo do navegador)
  const [confirmCfg, setConfirmCfg] = useState<{ titulo: string; descricao: string; tom: "aprovar" | "apagar" | "neutro"; rotulo: string; acao: () => void } | null>(null);
  const criarMut = trpc.reembolsos.solicitacoes.criar.useMutation({
    onSuccess: () => { toast.success("Solicitação enviada para aprovação!"); setNovoOpen(false); invalidar(); },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 5067 — abre o mesmo dialog pré-preenchido para EDITAR uma pendente
  const abrirEditar = (s: any) => {
    setEditandoId(s.id);
    setFundoDoNovo(s.fundoId ?? null);
    setEmpDoNovo(s.employeeId ?? null);
    setMotivo(s.motivo || "");
    setPagTipo(s.pagamentoTipo === "conta" ? "conta" : "pix");
    setPagChave(s.pagamentoChave || "");
    setDespesas((s.despesas || []).map((d: any) => ({
      obraId: d.obraId ?? null, categoria: d.categoria, descricao: d.descricao || "",
      dataDespesa: d.dataDespesa, valor: String(d.valor ?? "").replace(".", ","),
      comprovanteUrl: d.comprovanteUrl ?? null, comprovanteKey: d.comprovanteKey ?? null,
      orcamentoItemId: d.orcamentoItemId ?? null, eapCodigo: d.eapCodigo ?? null, eapDescricao: d.eapDescricao ?? null,
      estabelecimentoNome: d.estabelecimentoNome ?? null, estabelecimentoCnpj: d.estabelecimentoCnpj ?? null,
      estabelecimentoEndereco: d.estabelecimentoEndereco ?? null,
      docChave: d.docChave ?? null, docNumero: d.docNumero ?? null,
      itens: (Array.isArray(d.itensJson) && d.itensJson.length > 0) ? d.itensJson : null,
      vehicleId: d.vehicleId ?? null, vehiclePlaca: d.vehiclePlaca ?? null, vehicleModelo: d.vehicleModelo ?? null,
      kmNaManutencao: d.kmNaManutencao ?? null, kmProxima: d.kmProxima ?? null,
    })));
    setNovoOpen(true);
  };
  const abrirNovo = (fundoId: number | null = null, employeeId: number | null = null) => {
    setEditandoId(null);
    // Rev. 5057 — já entra com o PRÓPRIO colaborador selecionado (user→employee)
    // Rev. 5076 — quem tem caixinha ativa cadastrada é separado AUTOMATICAMENTE
    const emp = employeeId ?? ctxQuery.data?.employeeId ?? null;
    const fundoAuto = fundoId ?? ((fundosQuery.data || []).find((f: any) => f.status === "ativo" && f.employeeId === emp)?.id ?? null);
    setFundoDoNovo(fundoAuto); setEmpDoNovo(emp);
    setMotivo(""); setPagTipo("pix");
    setPagChave(ctxQuery.data?.dadosBancarios?.chavePix || "");
    setSalvarDados(true);
    setDespesas([novaDespesa()]);
    setNovoOpen(true);
  };

  const onPickFile = async (idx: number, file: File) => {
    if (file.size > 15 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 15 MB)."); return; }
    setDespesas((ds) => ds.map((d, i) => i === idx ? { ...d, _uploading: true } : d));
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] || "");
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const out = await uploadMut.mutateAsync({ companyId: companyIdNum, base64, contentType: file.type || "image/jpeg" });
      setDespesas((ds) => ds.map((d, i) => i === idx ? { ...d, comprovanteUrl: out.url, comprovanteKey: out.key, _uploading: false } : d));
      toast.success("Comprovante anexado.");
    } catch (e: any) {
      setDespesas((ds) => ds.map((d, i) => i === idx ? { ...d, _uploading: false } : d));
      toast.error("Falha ao enviar o comprovante: " + (e?.message || ""));
    }
  };

  // IA lê a(s) notinha(s): anexa, extrai e pré-preenche as despesas de uma vez
  const onPickAIFiles = async (files: FileList) => {
    const lista = Array.from(files).slice(0, 10);
    setLendoIA(lista.length); setLendoTotal(lista.length);
    let ok = 0;
    for (const file of lista) {
      try {
        if (file.size > 15 * 1024 * 1024) { toast.error(`"${file.name}" é muito grande (máx. 15 MB).`); continue; }
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(",")[1] || "");
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const out = await lerMut.mutateAsync({ companyId: companyIdNum, base64, contentType: file.type || "image/jpeg" });
        if (out.despesas.length === 0) {
          // IA não leu — cria uma despesa vazia já com o comprovante anexado
          if (out.aviso) toast.warning(out.aviso);
          setDespesas((ds) => {
            const vazia = { ...novaDespesa(), comprovanteUrl: out.url, comprovanteKey: out.key };
            const soVazia = ds.length === 1 && !ds[0].descricao && !ds[0].valor && !ds[0].comprovanteUrl;
            return soVazia ? [vazia] : [...ds, vazia];
          });
        } else {
          const novas: DespesaForm[] = out.despesas.map((d: any) => ({
            obraId: null, categoria: d.categoria, descricao: d.descricao,
            dataDespesa: d.dataDespesa,
            valor: Number(d.valor).toFixed(2).replace(".", ","),
            comprovanteUrl: out.url, comprovanteKey: out.key,
            orcamentoItemId: null, eapCodigo: null, eapDescricao: null,
            estabelecimentoNome: d.estabelecimentoNome ?? null,
            estabelecimentoCnpj: d.estabelecimentoCnpj ?? null,
            estabelecimentoEndereco: d.estabelecimentoEndereco ?? null,
            docChave: d.docChave ?? null, docNumero: d.docNumero ?? null,
            itens: (Array.isArray(d.itens) && d.itens.length > 0) ? d.itens : null,
            vehicleId: null, vehiclePlaca: null, vehicleModelo: null,
            kmNaManutencao: null, kmProxima: null,
            _duplicatas: undefined,
          }));
          setDespesas((ds) => {
            const soVazia = ds.length === 1 && !ds[0].descricao && !ds[0].valor && !ds[0].comprovanteUrl;
            return soVazia ? novas : [...ds, ...novas];
          });
          ok += out.despesas.length;
          // Rev. 5086 — verificar duplicidade de cada nota logo após extração da IA
          for (let ni = 0; ni < novas.length; ni++) {
            const nova = novas[ni];
            const temDados = nova.valor && (nova.docChave || nova.docNumero || nova.dataDespesa);
            if (!temDados) continue;
            try {
              const dups = await utils.reembolsos.solicitacoes.verificarDuplicidade.fetch({
                companyId: companyIdNum,
                companyIds,
                docChave: nova.docChave,
                docNumero: nova.docNumero,
                estabelecimentoCnpj: nova.estabelecimentoCnpj,
                estabelecimentoNome: nova.estabelecimentoNome,
                dataDespesa: nova.dataDespesa,
                valor: parseValor(nova.valor),
                excludeSolicitacaoId: editandoId,
              });
              if (dups.length > 0) {
                setDespesas((ds) => {
                  // localizar a despesa recém-adicionada pelo comprovanteKey e posição
                  const idx = ds.findIndex((x) => x.comprovanteKey === nova.comprovanteKey && x.docChave === nova.docChave && x._duplicatas === undefined);
                  if (idx === -1) return ds;
                  const copia = [...ds];
                  copia[idx] = { ...copia[idx], _duplicatas: dups as any };
                  return copia;
                });
              }
            } catch { /* silencioso — não bloqueia o fluxo */ }
          }
        }
      } catch (e: any) {
        toast.error(`Falha ao ler "${file.name}": ` + (e?.message || ""));
      } finally {
        setLendoIA((n) => n - 1);
      }
    }
    if (ok > 0) toast.success(`IA lançou ${ok} despesa(s) — revise e ajuste a obra se precisar.`);
  };

  const totalNovo = despesas.reduce((s, d) => s + parseValor(d.valor), 0);

  const submitNovo = () => {
    for (const d of despesas) {
      if (!d.descricao.trim() || parseValor(d.valor) <= 0) { toast.error("Preencha descrição e valor de todas as despesas."); return; }
      if (!d.comprovanteUrl) { toast.error(`A despesa "${d.descricao || "sem descrição"}" está sem comprovante.`); return; }
    }
    if (!fundoDoNovo) {
      if (pagTipo !== "pix") { toast.error("O reembolso é feito exclusivamente via PIX. Selecione PIX e informe sua chave."); return; }
      if (!pagChave.trim()) { toast.error("Informe sua chave PIX para receber o reembolso."); return; }
    }
    if (editandoId != null) {
      atualizarMut.mutate({
        companyId: companyIdNum, id: editandoId,
        motivo: motivo || null,
        pagamentoTipo: fundoDoNovo ? null : pagTipo,
        pagamentoChave: fundoDoNovo ? null : pagChave.trim(),
        despesas: despesas.map((d) => ({
          obraId: d.obraId, categoria: d.categoria as any, descricao: d.descricao.trim(),
          dataDespesa: d.dataDespesa, valor: parseValor(d.valor),
          comprovanteUrl: d.comprovanteUrl, comprovanteKey: d.comprovanteKey,
          orcamentoItemId: d.orcamentoItemId, eapCodigo: d.eapCodigo, eapDescricao: d.eapDescricao,
          estabelecimentoNome: d.estabelecimentoNome?.trim() || null,
          estabelecimentoCnpj: d.estabelecimentoCnpj?.trim() || null,
          estabelecimentoEndereco: d.estabelecimentoEndereco?.trim() || null,
          docChave: d.docChave, docNumero: d.docNumero,
          itens: d.itens ?? null,
          vehicleId: d.vehicleId ?? null, vehiclePlaca: d.vehiclePlaca ?? null, vehicleModelo: d.vehicleModelo ?? null,
          kmNaManutencao: d.kmNaManutencao ?? null, kmProxima: d.kmProxima ?? null,
        })),
      });
      return;
    }
    criarMut.mutate({
      companyId: companyIdNum,
      employeeId: isAdmin ? (empDoNovo ?? undefined) : undefined,
      fundoId: fundoDoNovo,
      motivo: motivo || null,
      pagamentoTipo: fundoDoNovo ? null : pagTipo,
      pagamentoChave: fundoDoNovo ? null : pagChave.trim(),
      salvarDadosBancarios: salvarDados && pagTipo === "pix",
      despesas: despesas.map((d) => ({
        obraId: d.obraId, categoria: d.categoria as any, descricao: d.descricao.trim(),
        dataDespesa: d.dataDespesa, valor: parseValor(d.valor),
        comprovanteUrl: d.comprovanteUrl, comprovanteKey: d.comprovanteKey,
        orcamentoItemId: d.orcamentoItemId, eapCodigo: d.eapCodigo, eapDescricao: d.eapDescricao,
        estabelecimentoNome: d.estabelecimentoNome?.trim() || null,
        estabelecimentoCnpj: d.estabelecimentoCnpj?.trim() || null,
        estabelecimentoEndereco: d.estabelecimentoEndereco?.trim() || null,
        docChave: d.docChave, docNumero: d.docNumero,
        itens: d.itens ?? null,
        vehicleId: d.vehicleId ?? null, vehiclePlaca: d.vehiclePlaca ?? null, vehicleModelo: d.vehicleModelo ?? null,
        kmNaManutencao: d.kmNaManutencao ?? null, kmProxima: d.kmProxima ?? null,
      })),
    });
  };

  // ── Aprovação / detalhe ────────────────────────────────────────────────────
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [decisoes, setDecisoes] = useState<Record<number, { aprovar: boolean; motivo: string }>>({});
  const decidirMut = trpc.reembolsos.solicitacoes.decidir.useMutation({
    onSuccess: (r) => { toast.success(r.status === "reprovada" ? "Solicitação reprovada." : `Aprovado ${brl(r.valorAprovado)} — título gerado no Contas a Pagar.`); setDetalhe(null); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelarMut = trpc.reembolsos.solicitacoes.cancelar.useMutation({
    onSuccess: () => { toast.success("Solicitação cancelada."); setDetalhe(null); invalidar(); },
    onError: (e) => toast.error(e.message),
  });

  const abrirDetalhe = (s: any) => {
    setDetalhe(s);
    const init: Record<number, { aprovar: boolean; motivo: string }> = {};
    for (const d of s.despesas || []) init[d.id] = { aprovar: d.status !== "reprovada", motivo: d.motivoReprovacao || "" };
    setDecisoes(init);
  };

  const submitDecisao = () => {
    if (!detalhe) return;
    decidirMut.mutate({
      companyId: detalhe.companyId, id: detalhe.id,
      itens: (detalhe.despesas || []).map((d: any) => ({
        despesaId: d.id, aprovar: !!decisoes[d.id]?.aprovar,
        motivoReprovacao: decisoes[d.id]?.aprovar ? null : (decisoes[d.id]?.motivo || null),
      })),
    });
  };

  // ── Fundos (caixinha) ──────────────────────────────────────────────────────
  const [fundoOpen, setFundoOpen] = useState(false);
  const [fundoEmp, setFundoEmp] = useState<number | null>(null);
  const [fundoValor, setFundoValor] = useState("");
  const [fundoEmpPickerOpen, setFundoEmpPickerOpen] = useState(false);
  const [fundoDesc, setFundoDesc] = useState("");
  const criarFundoMut = trpc.reembolsos.fundos.criar.useMutation({
    onSuccess: () => { toast.success("Fundo fixo criado — título do crédito inicial gerado no Contas a Pagar."); setFundoOpen(false); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const encerrarFundoMut = trpc.reembolsos.fundos.encerrar.useMutation({
    onSuccess: () => { toast.success("Fundo encerrado."); invalidar(); },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 5084 — desfazer aprovação (admin only)
  const [desfazendoLote, setDesfazendoLote] = useState(false);
  const desfazerAprovacaoMut = trpc.reembolsos.solicitacoes.desfazerAprovacao.useMutation({
    onSuccess: (r) => {
      if (r.erros.length > 0) r.erros.forEach((m: string) => toast.error(m));
      if (r.revertidas > 0) toast.success(`${r.revertidas} aprovação(ões) desfeita(s) — solicitações voltaram para Aguardando Aprovação.`);
      setSelecionadas(new Set()); invalidar();
    },
    onError: (e) => toast.error(e.message),
  });

  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "avulso" | "caixinha">("todos");
  const solsFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let list = solsQuery.data || [];
    if (tipoFiltro !== "todos") list = list.filter((s: any) => (tipoFiltro === "caixinha" ? s.tipo === "caixinha" : s.tipo !== "caixinha"));
    // Rev. 5083 — filtro por ano e mês
    list = list.filter((s: any) => {
      const d = new Date(s.criadoEm);
      if (d.getFullYear() !== anoSelecionado) return false;
      if (mesSelecionado !== null && d.getMonth() + 1 !== mesSelecionado) return false;
      return true;
    });
    if (!q) return list;
    return list.filter((s: any) => (s.employeeNome || "").toLowerCase().includes(q) || String(s.id).includes(q) || String(s.numero || "").toLowerCase().includes(q));
  }, [solsQuery.data, busca, tipoFiltro, anoSelecionado, mesSelecionado]);

  const pendentes = (solsQuery.data || []).filter((s: any) => s.status === "pendente").length;

  const statusBadge = (s: any) => {
    if (s.paga) return (
      <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
        ✓ Pago{s.dataPagamento ? ` em ${dataBR(s.dataPagamento)}` : ""}
      </Badge>
    );
    const b = STATUS_BADGE[s.status] || STATUS_BADGE.pendente;
    return (
      <div className="flex flex-col items-end gap-0.5">
        <Badge variant="outline" className={b.cls}>{b.label}</Badge>
        {(s.status === "aprovada" || s.status === "aprovada_parcial") && s.dataPrevistaPagamento && (
          <span className="text-[10px] text-slate-400 whitespace-nowrap">
            Prev. {dataBR(s.dataPrevistaPagamento)}
          </span>
        )}
      </div>
    );
  };

  // ── Rev. 5151+ — Dashboard de Reembolsos (KPIs expandidos, gráficos e análise) ──
  if (verDash) {
    const anoAtual = new Date().getFullYear();
    const mesAtualNum = new Date().getMonth(); // 0-based
    const sols = (solsQuery.data || []).filter((s: any) => s.status !== "cancelada");
    const valAprov = (s: any) => Number(s.valorAprovado ?? s.valorTotal ?? 0);
    const aprovadas = sols.filter((s: any) => s.status === "aprovada" || s.status === "aprovada_parcial");
    const reprovadas = sols.filter((s: any) => s.status === "reprovada");
    const pendentesL = sols.filter((s: any) => s.status === "pendente");
    const pagas = sols.filter((s: any) => s.paga);
    const aguardandoPgto = aprovadas.filter((s: any) => !s.paga);
    const fundosAtivos = (fundosQuery.data || []).filter((f: any) => f.status === "ativo");

    // Totais
    const totalAno = aprovadas
      .filter((s: any) => String(s.criadoEm || "").slice(0, 4) === String(anoAtual))
      .reduce((a: number, s: any) => a + valAprov(s), 0);
    const totalMesAtual = aprovadas
      .filter((s: any) => {
        const d = new Date(String(s.criadoEm || ""));
        return d.getFullYear() === anoAtual && d.getMonth() === mesAtualNum;
      })
      .reduce((a: number, s: any) => a + valAprov(s), 0);
    const totalMesAnterior = aprovadas
      .filter((s: any) => {
        const d = new Date(String(s.criadoEm || ""));
        const ma = mesAtualNum === 0 ? 11 : mesAtualNum - 1;
        const ya = mesAtualNum === 0 ? anoAtual - 1 : anoAtual;
        return d.getFullYear() === ya && d.getMonth() === ma;
      })
      .reduce((a: number, s: any) => a + valAprov(s), 0);
    const varMes = totalMesAnterior > 0 ? ((totalMesAtual - totalMesAnterior) / totalMesAnterior) * 100 : null;

    // Taxa de aprovação
    const decididas = aprovadas.length + reprovadas.length;
    const taxaAprovacao = decididas > 0 ? Math.round((aprovadas.length / decididas) * 100) : null;

    // Ticket médio
    const ticketMedio = aprovadas.length > 0 ? totalAno / aprovadas.length : null;

    // Tempo médio de pagamento (criação → baixa)
    const temposPg = pagas.map((s: any) => {
      const c = new Date(String(s.criadoEm));
      const p = new Date(String(s.dataPagamento) + "T12:00:00");
      const d = Math.round((p.getTime() - c.getTime()) / 86400000);
      return isFinite(d) && d >= 0 ? d : null;
    }).filter((d: any) => d != null) as number[];
    const tempoMedio = temposPg.length ? Math.round(temposPg.reduce((a, b) => a + b, 0) / temposPg.length) : null;

    // Pendentes mais antigos (dias aguardando)
    const diasPendente = pendentesL.map((s: any) => {
      const d = Math.round((Date.now() - new Date(String(s.criadoEm)).getTime()) / 86400000);
      return isFinite(d) ? d : 0;
    });
    const maxDiasPendente = diasPendente.length ? Math.max(...diasPendente) : null;

    // Despesas vivas (não reprovadas)
    const despesasVivas: any[] = sols.flatMap((s: any) =>
      (s.despesas || []).filter((d: any) => d.status !== "reprovada").map((d: any) => ({
        ...d, _emp: s.employeeNome || `#${s.employeeId}`, _status: s.status, _paga: s.paga,
      })));

    // Por mês (últimos 6) — aprovadas vs pendentes
    const meses: { chave: string; rotulo: string; aprov: number; pend: number; isCurrent: boolean }[] = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - i);
      const chave = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      meses.push({ chave, rotulo: dt.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), aprov: 0, pend: 0, isCurrent: i === 0 });
    }
    sols.forEach((s: any) => {
      const chave = String(s.criadoEm || "").slice(0, 7);
      const m = meses.find((x) => x.chave === chave);
      if (!m) return;
      if (s.status === "pendente") m.pend += Number(s.valorTotal || 0);
      else if (s.status === "aprovada" || s.status === "aprovada_parcial") m.aprov += valAprov(s);
    });
    const maxMes = Math.max(1, ...meses.map((m) => m.aprov + m.pend));

    // Por categoria
    const CAT_LABEL: Record<string, string> = { transporte: "Transporte", alimentacao: "Alimentação", material: "Material", hospedagem: "Hospedagem", combustivel: "Combustível", pedagio: "Pedágio", outros: "Outros" };
    const CAT_COLOR: Record<string, string> = { transporte: "#3B82F6", alimentacao: "#F59E0B", material: "#8B5CF6", hospedagem: "#06B6D4", combustivel: "#EF4444", pedagio: "#10B981", outros: "#94A3B8" };
    const porCat = Object.entries(despesasVivas.reduce((acc: Record<string, number>, d: any) => {
      const k = d.categoria || "outros"; acc[k] = (acc[k] || 0) + Number(d.valor || 0); return acc;
    }, {})).sort((a, b) => b[1] - a[1]);
    const totalCat = porCat.reduce((s, [, v]) => s + v, 0) || 1;
    const maxCat = Math.max(1, ...porCat.map(([, v]) => v));

    // Ranking por colaborador (com aprovadas + pendentes + reprovadas)
    const porEmp = Object.entries(sols.reduce((acc: Record<string, { aprov: number; pend: number; reprov: number; qtd: number }>, s: any) => {
      const k = s.employeeNome || `#${s.employeeId}`;
      if (!acc[k]) acc[k] = { aprov: 0, pend: 0, reprov: 0, qtd: 0 };
      acc[k].qtd += 1;
      if (s.status === "aprovada" || s.status === "aprovada_parcial") acc[k].aprov += valAprov(s);
      else if (s.status === "pendente") acc[k].pend += Number(s.valorTotal || 0);
      else if (s.status === "reprovada") acc[k].reprov += Number(s.valorTotal || 0);
      return acc;
    }, {})).sort((a: any, b: any) => (b[1].aprov + b[1].pend) - (a[1].aprov + a[1].pend));
    const maxEmp = Math.max(1, ...porEmp.map(([, v]: any) => v.aprov + v.pend));

    // Últimas compras
    const ultimas = [...despesasVivas].sort((a, b) => String(b.dataDespesa).localeCompare(String(a.dataDespesa))).slice(0, 20);

    const valorPendente = pendentesL.reduce((a: number, s: any) => a + Number(s.valorTotal || 0), 0);
    const valorAguardandoPgto = aguardandoPgto.reduce((a: number, s: any) => a + valAprov(s), 0);
    const valorReprovado = reprovadas.reduce((a: number, s: any) => a + Number(s.valorTotal || 0), 0);
    const saldoCaixinhas = fundosAtivos.reduce((a: number, f: any) => a + Number(f.saldoAtual ?? f.valorFundo ?? 0), 0);

    return (
      <DashboardLayout>
        <div className="p-4 md:p-6 space-y-5 bg-slate-50 min-h-screen">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-sky-600" /> Dashboard de Reembolsos
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {sols.length} solicitação(ões) · {despesasVivas.length} despesa(s) · {anoAtual}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { sessionStorage.removeItem("_navParams"); setVerDash(false); }}>
              <Receipt className="h-3.5 w-3.5 mr-1" /> Ver Solicitações
            </Button>
          </div>

          {/* ── KPIs linha 1 ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Aprovado no ano */}
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Aprovado no ano</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{brl(totalAno)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{aprovadas.length} solicitação(ões) aprovadas</p>
            </div>
            {/* Mês atual com variação */}
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Este mês</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{brl(totalMesAtual)}</p>
              {varMes != null ? (
                <p className={`text-xs mt-0.5 flex items-center gap-0.5 ${varMes >= 0 ? "text-red-500" : "text-sky-600"}`}>
                  {varMes >= 0 ? "▲" : "▼"} {Math.abs(varMes).toFixed(0)}% vs mês anterior
                </p>
              ) : <p className="text-xs text-slate-400 mt-0.5">—</p>}
            </div>
            {/* Ticket médio */}
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Ticket médio</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{ticketMedio ? brl(ticketMedio) : "—"}</p>
              <p className="text-xs text-slate-400 mt-0.5">por solicitação aprovada</p>
            </div>
            {/* Caixinhas */}
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Saldo caixinhas</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{brl(saldoCaixinhas)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{fundosAtivos.length} caixinha(s) ativa(s)</p>
            </div>
          </div>

          {/* ── KPIs linha 2 — status ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Aguardando aprovação */}
            <div className={`rounded-2xl p-4 border shadow-sm ${pendentesL.length > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">Aguardando aprovação</p>
              <p className="mt-1 text-2xl font-bold text-amber-800">{brl(valorPendente)}</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {pendentesL.length} pendente(s)
                {maxDiasPendente != null && maxDiasPendente > 2 ? ` · mais antiga: ${maxDiasPendente}d` : ""}
              </p>
            </div>
            {/* Aguardando pagamento */}
            <div className={`rounded-2xl p-4 border shadow-sm ${aguardandoPgto.length > 0 ? "bg-sky-50 border-sky-200" : "bg-white border-slate-200"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-700">Aguardando pagamento</p>
              <p className="mt-1 text-2xl font-bold text-sky-800">{brl(valorAguardandoPgto)}</p>
              <p className="text-xs text-sky-600 mt-0.5">{aguardandoPgto.length} aprovada(s) a pagar</p>
            </div>
            {/* Taxa de aprovação */}
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Taxa de aprovação</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{taxaAprovacao != null ? `${taxaAprovacao}%` : "—"}</p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${taxaAprovacao ?? 0}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{decididas} decisão(ões) no período</p>
            </div>
            {/* Tempo médio de pagamento */}
            <div className="rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Tempo médio pagamento</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {tempoMedio == null ? "—" : `${tempoMedio}d`}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div className={`h-1.5 rounded-full ${tempoMedio == null ? "bg-slate-200" : tempoMedio <= 3 ? "bg-sky-500" : tempoMedio <= 7 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: tempoMedio == null ? "0%" : `${Math.min(100, (tempoMedio / 14) * 100)}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{pagas.length} paga(s) · da criação à baixa</p>
            </div>
          </div>

          {/* ── Gráficos ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Por mês */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-sky-600" /> Evolução mensal (últimos 6 meses)
              </h2>
              <div className="flex items-end gap-2 h-40">
                {meses.map((m) => {
                  const tot = m.aprov + m.pend;
                  const hAprov = tot > 0 ? Math.max(4, (m.aprov / maxMes) * 100) : 2;
                  const hPend  = m.pend > 0 ? Math.max(3, (m.pend / maxMes) * 100) : 0;
                  return (
                    <div key={m.chave} className="flex-1 flex flex-col items-center gap-1">
                      {tot > 0 && (
                        <div className="text-[9px] font-semibold text-slate-500 text-center leading-tight">
                          {brl(tot).replace("R$\u00a0", "").replace("R$ ", "")}
                        </div>
                      )}
                      <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                        {hPend > 0 && <div className="w-full rounded-t bg-amber-300" style={{ height: `${hPend}%` }} />}
                        <div className={`w-full ${hPend > 0 ? "" : "rounded-t"} rounded-b bg-sky-500`} style={{ height: `${hAprov}%`, minHeight: m.isCurrent ? "3px" : "2px" }} />
                      </div>
                      <div className={`text-[10px] capitalize font-medium ${m.isCurrent ? "text-sky-600" : "text-slate-500"}`}>{m.rotulo}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-100">
                <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" />Aprovado</span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block" />Pendente</span>
              </div>
            </div>

            {/* Por categoria */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-sky-600" /> Distribuição por categoria
              </h2>
              {porCat.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Sem despesas ainda.</p>
              ) : (
                <div className="space-y-2.5">
                  {porCat.map(([k, v]) => {
                    const pct = Math.round((v / totalCat) * 100);
                    const cor = CAT_COLOR[k] || "#94A3B8";
                    return (
                      <div key={k}>
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ background: cor }} />
                            {CAT_LABEL[k] || k}
                          </span>
                          <span className="text-xs text-slate-500">{brl(v)} <span className="text-slate-400">({pct}%)</span></span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${(v / maxCat) * 100}%`, background: cor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Ranking por colaborador ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-sky-600" /> Ranking de solicitantes
            </h2>
            {porEmp.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Sem solicitações ainda.</p>
            ) : (
              <div className="space-y-3">
                {porEmp.map(([nome, v]: any, i: number) => {
                  const tot = v.aprov + v.pend;
                  const wAprov = tot > 0 ? (v.aprov / maxEmp) * 100 : 0;
                  const wPend  = tot > 0 ? (v.pend / maxEmp) * 100 : 0;
                  return (
                    <div key={nome} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-600" : "bg-slate-100 text-slate-500"}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="font-semibold text-slate-700 truncate">{nome}</span>
                          <span className="text-slate-500 shrink-0 ml-2">{brl(tot)} · {v.qtd}x</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
                          <div className="h-2 bg-sky-500 rounded-l" style={{ width: `${wAprov}%` }} />
                          <div className="h-2 bg-amber-300" style={{ width: `${wPend}%` }} />
                        </div>
                        {v.reprov > 0 && (
                          <p className="text-[10px] text-red-400 mt-0.5">{brl(v.reprov)} reprovado(s)</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Últimas despesas ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-sky-600" /> Últimas despesas
            </h2>
            {ultimas.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Nada lançado ainda.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {ultimas.map((d: any) => (
                  <div key={d.id} className="py-2.5 flex items-center gap-3">
                    <span className="text-[11px] text-slate-400 w-14 shrink-0 tabular-nums">{dataBR(d.dataDespesa)}</span>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLOR[d.categoria] || "#94A3B8" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{d.descricao}</p>
                      <p className="text-[11px] text-slate-400 truncate">{d._emp}{d.estabelecimentoNome ? ` · ${d.estabelecimentoNome}` : ""}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-700 shrink-0 tabular-nums">{brl(d.valor)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${d._paga ? "bg-blue-100 text-blue-700" : d._status === "pendente" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                      {d._paga ? "Paga" : d._status === "pendente" ? "Pendente" : "Aprovada"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="h-6 w-6 text-emerald-600" /> Reembolsos</h1>
          <p className="text-sm text-muted-foreground">Um lugar só pra lançar. Quem tem caixinha cadastrada é pré-pago: o lançamento abate do caixa automaticamente.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => { setPrazoDraft(String(prazoDias)); setCriteriosOpen(true); }}>
              <Settings className="h-4 w-4 mr-1" /> Critérios
            </Button>
          )}
        </div>
      </div>

      {/* Rev. 5082 — página ÚNICA: cards vivos que contam a história do módulo */}
      {(() => {
        const allSols = solsQuery.data || [];
        const agPgto   = allSols.filter((s: any) => !s.paga && (s.status === "aprovada" || s.status === "aprovada_parcial"));
        const pagas    = allSols.filter((s: any) => s.paga);
        const totalAgPgto = agPgto.reduce((a: number, s: any) => a + Number(s.valorAprovado ?? s.valorTotal ?? 0), 0);
        const totalPagas  = pagas.reduce((a: number, s: any)  => a + Number(s.valorAprovado ?? s.valorTotal ?? 0), 0);
        return (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {/* 1 — Lançar */}
            <button type="button" onClick={() => abrirNovo()}
              className="col-span-2 lg:col-span-1 rounded-2xl p-4 text-left text-white shadow-sm bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-colors">
              <div className="flex items-center gap-2 text-emerald-50 text-xs font-semibold uppercase tracking-wide">
                <Plus className="h-4 w-4" /> Lançar Reembolso
              </div>
              <div className="mt-1 text-lg md:text-xl font-bold">Anexe a notinha</div>
              <div className="text-xs text-emerald-100">A IA lê tudo — você só revisa e envia. Prazo: {prazoDias} dia{prazoDias === 1 ? "" : "s"} út{prazoDias === 1 ? "il" : "eis"}.</div>
            </button>
            {/* 2 — Aguardando aprovação */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm">
              <div className="flex items-center gap-2 text-amber-50 text-xs font-semibold uppercase tracking-wide">
                <Clock className="h-4 w-4" /> Ag. aprovação
              </div>
              <div className="mt-1 text-lg md:text-xl font-bold">
                {brl(allSols.filter((s: any) => s.status === "pendente").reduce((a: number, s: any) => a + Number(s.valorTotal || 0), 0))}
              </div>
              <div className="text-xs text-amber-100">{allSols.filter((s: any) => s.status === "pendente").length} solicitação(ões)</div>
            </div>
            {/* 3 — Aguardando pagamento (novo) */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-sm">
              <div className="flex items-center gap-2 text-orange-50 text-xs font-semibold uppercase tracking-wide">
                <Landmark className="h-4 w-4" /> Ag. pagamento
              </div>
              <div className="mt-1 text-lg md:text-xl font-bold">{brl(totalAgPgto)}</div>
              <div className="text-xs text-orange-100">{agPgto.length} solicitação(ões)</div>
            </div>
            {/* 4 — Pagos (novo) */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-sm">
              <div className="flex items-center gap-2 text-blue-50 text-xs font-semibold uppercase tracking-wide">
                <CheckCircle2 className="h-4 w-4" /> Pagos
              </div>
              <div className="mt-1 text-lg md:text-xl font-bold">{brl(totalPagas)}</div>
              <div className="text-xs text-blue-100">{pagas.length} solicitação(ões)</div>
            </div>
            {/* 5 — Caixinhas */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-sm">
              <div className="flex items-center gap-2 text-violet-50 text-xs font-semibold uppercase tracking-wide">
                <PiggyBank className="h-4 w-4" /> Caixinhas
              </div>
              <div className="mt-1 text-lg md:text-xl font-bold">
                {brl((fundosQuery.data || []).filter((f: any) => f.status === "ativo").reduce((a: number, f: any) => a + Number(f.valorFundo || 0), 0))}
              </div>
              <div className="text-xs text-violet-100">{(fundosQuery.data || []).filter((f: any) => f.status === "ativo").length} pessoa(s) com caixa</div>
            </div>
          </div>
        );
      })()}

      {/* ── Caixinhas: quem tem caixa (pré-pago) ── */}
      <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-violet-900 flex items-center gap-1.5 uppercase tracking-wide">
            <PiggyBank className="h-4 w-4 text-violet-600" /> Quem tem caixinha
          </h2>
          {isAdmin && (
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => { setFundoEmp(null); setFundoValor(""); setFundoDesc(""); setFundoOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Cadastrar Caixinha
            </Button>
          )}
        </div>
        {(fundosQuery.data || []).filter((f: any) => f.status === "ativo").length === 0 ? (
          <p className="text-sm text-violet-800/70">Ninguém com caixinha ainda. {isAdmin ? "Cadastre quem anda com dinheiro da empresa (ex.: vendedor externo) — os lançamentos dele abatem do caixa automaticamente." : ""}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(fundosQuery.data || []).filter((f: any) => f.status === "ativo").map((f: any) => (
              <Card key={f.id} className="border-violet-200">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-violet-600" />{f.employeeNome || `#${f.employeeId}`}</div>
                    <Badge variant="outline" className={Number(f.saldo) < 0 ? "bg-red-100 text-red-700 border-red-300" : "bg-emerald-100 text-emerald-800 border-emerald-300"}>
                      {Number(f.saldo) < 0 ? "Negativo" : "Positivo"}
                    </Badge>
                  </div>
                  {f.descricao && <div className="text-xs text-muted-foreground">{f.descricao}</div>}
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div><div className="text-xs text-muted-foreground">Recebeu</div><div className="font-bold">{brl(f.valorFundo)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Em aberto</div><div className="font-bold text-amber-600">{brl(f.gastoAberto)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Saldo</div><div className={`font-bold ${Number(f.saldo) < 0 ? "text-red-600" : "text-emerald-600"}`}>{brl(f.saldo)}</div></div>
                  </div>
                  {Number(f.devendo) > 0 && (
                    <div className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {brl(f.devendo)} em notas reprovadas (não repostas)</div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => abrirNovo(f.id, f.employeeId)}>
                      <Receipt className="h-4 w-4 mr-1" /> Lançar Despesa
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="outline" onClick={() => setConfirmCfg({
                        tom: "neutro", rotulo: "Encerrar fundo",
                        titulo: "Encerrar este fundo fixo?",
                        descricao: "A caixinha deixa de aparecer como ativa. As solicitações já feitas não são alteradas.",
                        acao: () => encerrarFundoMut.mutate({ companyId: f.companyId, id: f.id }),
                      })}>
                        Encerrar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Solicitações ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
            <Receipt className="h-4 w-4 text-emerald-600" /> Solicitações
            {pendentes > 0 && isAdmin ? <Badge className="ml-1 bg-amber-500 text-white">{pendentes}</Badge> : null}
          </h2>
          <Button onClick={() => abrirNovo()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4 mr-1" /> Lançar Reembolso
          </Button>
        </div>

        {/* Rev. 5083 — Seletor de mês/ano */}
        {(() => {
          const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
          const meses = mesesQuery.data || [];
          return (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 space-y-2 shadow-sm">
              {/* Linha superior: ano + legenda */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => { setAnoSelecionado((a) => a - 1); setMesSelecionado(null); }}
                    className="h-7 w-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-bold text-slate-800 text-sm w-12 text-center">{anoSelecionado}</span>
                  <button onClick={() => { setAnoSelecionado((a) => a + 1); setMesSelecionado(null); }}
                    className="h-7 w-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500 inline-block" /> Com lançamento</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> Consolidado</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-200 inline-block" /> Sem dados</span>
                </div>
              </div>
              {/* Pills dos meses */}
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {MESES.map((label, idx) => {
                  const m = idx + 1;
                  const info = meses[idx];
                  const st = info?.status ?? "sem_dados";
                  const selecionado = mesSelecionado === m;
                  const base = "relative flex flex-col items-center justify-center rounded-lg py-1.5 px-1 text-xs font-semibold cursor-pointer transition-all select-none border";
                  const cor = st === "consolidado"
                    ? "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600"
                    : st === "com_lancamento"
                    ? "bg-blue-500 text-white border-blue-500 hover:bg-blue-600"
                    : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100";
                  const ring = selecionado ? " ring-2 ring-offset-1 ring-slate-800" : "";
                  return (
                    <button key={m} className={base + " " + cor + ring}
                      onClick={() => setMesSelecionado((prev) => prev === m ? null : m)}>
                      <span>{label}</span>
                      {st === "consolidado" && <Lock className="h-2.5 w-2.5 mt-0.5 opacity-80" />}
                      {st === "consolidado" && info?.aprovadoPorNome && (
                        <span className="absolute -bottom-4 left-0 right-0 text-center text-[9px] text-slate-500 truncate leading-tight hidden sm:block">
                          {info.aprovadoPorNome.split(" ")[0]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Espaço para nomes abaixo das pills (só visível quando há consolidados com nome) */}
              {meses.some((m: any) => m?.status === "consolidado" && m?.aprovadoPorNome) && (
                <div className="h-3 hidden sm:block" />
              )}
            </div>
          );
        })()}
          {isAdmin && (
            <div className="relative max-w-sm">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por colaborador ou nº..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          )}
          {solsQuery.isLoading ? (
            <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando...</div>
          ) : solsFiltradas.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">
              Nenhuma solicitação ainda. Toque em <b>Nova Solicitação</b> para pedir um reembolso.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {selecionadas.size > 0 && (
                <div className="sticky top-0 z-10 rounded-lg border border-slate-300 bg-white shadow-md px-3 py-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{selecionadas.size} selecionada(s)</span>
                  <span className="flex gap-2 ml-auto">
                    {isAdmin && (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={aprovandoLote}
                        onClick={() => {
                          const pendentes = (solsQuery.data || []).filter((s: any) => selecionadas.has(s.id) && s.status === "pendente");
                          if (pendentes.length === 0) { toast.error("Nenhuma pendente entre as selecionadas."); return; }
                          const totalSel = pendentes.reduce((a: number, s: any) => a + Number(s.valorTotal || 0), 0);
                          setConfirmCfg({
                            tom: "aprovar", rotulo: "Aprovar tudo",
                            titulo: `Aprovar ${pendentes.length} solicitação(ões)?`,
                            descricao: `TODAS as despesas serão aprovadas, somando ${brl(totalSel)}, e os títulos serão gerados no Contas a Pagar.`,
                            acao: async () => {
                              setAprovandoLote(true);
                              let ok = 0;
                              for (const s of pendentes) {
                                try {
                                  await decidirMut.mutateAsync({
                                    companyId: s.companyId, id: s.id,
                                    itens: (s.despesas || []).map((d: any) => ({ despesaId: d.id, aprovar: true })),
                                  });
                                  ok++;
                                } catch (e: any) { toast.error(`Nº ${s.numero ?? s.id}: ${e?.message || "erro"}`); }
                              }
                              setAprovandoLote(false);
                              if (ok > 0) toast.success(`${ok} solicitação(ões) aprovada(s) — títulos gerados no Contas a Pagar.`);
                              setSelecionadas(new Set()); invalidar();
                            },
                          });
                        }}>
                        {aprovandoLote ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Aprovar
                      </Button>
                    )}
                    {isAdmin && (() => {
                      const aprovadas = (solsQuery.data || []).filter((s: any) => selecionadas.has(s.id) && ["aprovada", "aprovada_parcial"].includes(s.status));
                      if (aprovadas.length === 0) return null;
                      return (
                        <Button size="sm" variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-50" disabled={desfazendoLote}
                          onClick={() => setConfirmCfg({
                            tom: "reprovar", rotulo: "Desfazer",
                            titulo: `Desfazer aprovação de ${aprovadas.length} solicitação(ões)?`,
                            descricao: "As solicitações voltarão para 'Aguardando Aprovação' e os títulos gerados no Contas a Pagar serão cancelados (desde que não pagos).",
                            acao: async () => {
                              setDesfazendoLote(true);
                              await desfazerAprovacaoMut.mutateAsync({ companyId: companyIdNum, ids: aprovadas.map((s: any) => s.id) });
                              setDesfazendoLote(false);
                            },
                          })}>
                          {desfazendoLote ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />} Cancelar aprovação
                        </Button>
                      );
                    })()}
                    <Button size="sm" variant="destructive" disabled={excluirMut.isPending}
                      onClick={() => setConfirmCfg({
                        tom: "apagar", rotulo: "Apagar",
                        titulo: `Apagar ${selecionadas.size} solicitação(ões)?`,
                        descricao: "Esta ação não pode ser desfeita. Títulos em aberto no Financeiro serão cancelados; títulos já pagos bloqueiam a exclusão.",
                        acao: () => excluirMut.mutate({ companyId: companyIdNum, ids: [...selecionadas] }),
                      })}>
                      <Trash2 className="h-4 w-4 mr-1" /> Apagar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSelecionadas(new Set())}>Limpar</Button>
                  </span>
                </div>
              )}
              {solsFiltradas.map((s: any) => (
                <Card key={s.id} className={`hover:shadow-sm transition cursor-pointer border-l-4 ${s.tipo === "caixinha" ? "border-l-violet-500" : "border-l-emerald-500"}`} onClick={() => abrirDetalhe(s)}>
                  <CardContent className="p-3 md:p-4 flex flex-wrap items-center gap-3 justify-between">
                    <div className="min-w-0 flex items-center gap-3">
                      <span onClick={(e) => e.stopPropagation()} className="flex items-center">
                        <Checkbox className="h-5 w-5" checked={selecionadas.has(s.id)} onCheckedChange={() => toggleSel(s.id)} />
                      </span>
                      <PersonPhoto src={s.employeeFotoUrl} alt={s.employeeNome || "Colaborador"} size="md" clickable={false} />
                      <div className="min-w-0">
                        <div className="font-semibold flex items-center gap-2 flex-wrap">
                          <span className="truncate">{s.employeeNome || "Colaborador"}</span>
                          <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 font-mono text-[11px]">Nº {s.numero ?? s.id}</Badge>
                          {s.tipo === "caixinha"
                            ? <Badge variant="outline" className="bg-violet-100 text-violet-800 border-violet-300"><PiggyBank className="h-3 w-3 mr-1" />Caixinha</Badge>
                            : <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300"><Receipt className="h-3 w-3 mr-1" />Reembolso</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <div>
                            <span className="font-medium text-slate-500">Solicitado por</span>{" "}
                            {s.criadoPorNome || s.employeeNome || "—"}
                            {dtBR(s.criadoEm) ? <span className="text-slate-400"> · {dtBR(s.criadoEm)}</span> : null}
                            <span className="text-slate-400"> · {(s.despesas || []).length} despesa(s)</span>
                          </div>
                          {(s.aprovadoPorNome || s.aprovadoEm) && (
                            <div>
                              <span className={`font-medium ${s.status === "reprovada" ? "text-red-500" : "text-emerald-600"}`}>
                                {s.status === "reprovada" ? "Reprovado por" : "Aprovado por"}
                              </span>{" "}
                              {s.aprovadoPorNome || "—"}
                              {dtBR(s.aprovadoEm) ? <span className="text-slate-400"> · {dtBR(s.aprovadoEm)}</span> : null}
                            </div>
                          )}
                          {s.motivo && <div className="text-slate-400 italic truncate">{s.motivo}</div>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-bold">{brl(s.valorAprovado ?? s.valorTotal)}</div>
                        {s.valorAprovado != null && Number(s.valorAprovado) !== Number(s.valorTotal) && (
                          <div className="text-xs text-muted-foreground line-through">{brl(s.valorTotal)}</div>
                        )}
                      </div>
                      {statusBadge(s)}
                      <span className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        {(s.status === "pendente" || (isAdmin && ["aprovada", "aprovada_parcial"].includes(s.status))) && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-blue-600"
                            title={s.status === "pendente" ? "Editar" : "Editar (cancela aprovação antes)"}
                            onClick={() => {
                              if (s.status !== "pendente") {
                                setConfirmCfg({
                                  tom: "reprovar", rotulo: "Cancelar aprovação e editar",
                                  titulo: "Cancelar aprovação para editar?",
                                  descricao: "A solicitação voltará para 'Aguardando Aprovação', o título no Contas a Pagar será cancelado (se não pago), e você poderá editá-la.",
                                  acao: async () => {
                                    const r = await desfazerAprovacaoMut.mutateAsync({ companyId: companyIdNum, ids: [s.id] });
                                    if (r.revertidas > 0) {
                                      // Buscar a solicitação atualizada e abrir edição
                                      await utils.reembolsos.solicitacoes.list.invalidate();
                                      const fresh = (solsQuery.data || []).find((x: any) => x.id === s.id);
                                      if (fresh) abrirEditar({ ...fresh, status: "pendente" });
                                    }
                                  },
                                });
                              } else {
                                abrirEditar(s);
                              }
                            }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-red-600" title="Apagar" disabled={excluirMut.isPending}
                          onClick={() => setConfirmCfg({
                            tom: "apagar", rotulo: "Apagar",
                            titulo: `Apagar a solicitação Nº ${s.numero ?? s.id}?`,
                            descricao: `${s.employeeNome || "Colaborador"} — ${brl(s.valorAprovado ?? s.valorTotal)}. Esta ação não pode ser desfeita.${s.status !== "pendente" ? " O título em aberto no Financeiro será cancelado." : ""}`,
                            acao: () => excluirMut.mutate({ companyId: companyIdNum, ids: [s.id] }),
                          })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Eye className="h-4 w-4 text-muted-foreground ml-1" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      </section>

      {/* ── Dialog: nova solicitação (Rev. 5056 — layout moderno + poka-yoke) ── */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent showCloseButton={false} maximizable={false} className="max-w-3xl h-[92dvh] max-h-[92dvh] p-0 overflow-hidden flex flex-col gap-0">
          {/* Cabeçalho colorido (botões próprios — os flutuantes padrão ficam fora p/ não sobrepor) */}
          <div className={`flex items-start gap-3 px-4 py-4 sm:px-6 text-white bg-gradient-to-r ${fundoDoNovo ? "from-violet-600 to-purple-700" : "from-emerald-600 to-teal-700"}`}>
            <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              {fundoDoNovo ? <PiggyBank className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}
            </span>
            <DialogHeader className="flex-1 min-w-0 space-y-1 text-left">
              <DialogTitle className="text-white text-base sm:text-lg leading-snug">
                {editandoId != null ? "Editar Solicitação" : fundoDoNovo ? "Prestação de Contas — Caixinha" : "Nova Solicitação de Reembolso"}
              </DialogTitle>
              <p className="text-xs text-white/80">
                {fundoDoNovo
                  ? "As despesas aprovadas serão repostas ao fundo fixo do colaborador."
                  : "Anexe as notinhas, a IA preenche tudo e você só revisa antes de enviar."}
              </p>
            </DialogHeader>
            <div className="flex items-center gap-1 flex-shrink-0">
              <DialogMaximizeButton className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center text-white" />
              <DialogClose className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center text-white">
                <XCircle className="h-5 w-5" />
                <span className="sr-only">Fechar</span>
              </DialogClose>
            </div>
          </div>

          {/* Corpo rolável */}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5 bg-slate-50/60">
            {/* Passo 1 — Quem e por quê */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">1</span>
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><User className="h-4 w-4 text-blue-600" /> Quem está pedindo</h3>
              </div>
              {fundoAtivoDoNovo && editandoId == null && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 shrink-0 text-violet-600" />
                  <span>
                    Este colaborador tem <b>caixinha cadastrada</b> — o lançamento será debitado dela automaticamente.
                    {" "}Saldo atual: <b>{brl(fundoAtivoDoNovo.saldo ?? fundoAtivoDoNovo.valorFundo)}</b>.
                  </span>
                </div>
              )}
              {(
                isAdmin ? (
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Colaborador</Label>
                    {(() => {
                      const lista = (employeesQuery.data || []).filter((e: any) => e.status === "Ativo" || e.status === "Aviso" || e.id === ctxQuery.data?.employeeId);
                      const sel = lista.find((e: any) => e.id === empDoNovo);
                      return (
                        <Popover open={empPickerOpen && editandoId == null} onOpenChange={(v) => { if (editandoId == null) setEmpPickerOpen(v); }}>
                          <PopoverTrigger asChild>
                            <button type="button" disabled={editandoId != null}
                              className="w-full rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 flex items-center gap-2.5 text-left disabled:opacity-70 disabled:cursor-not-allowed">
                              {sel ? (
                                <>
                                  <PersonPhoto src={sel.fotoUrl} alt={sel.nomeCompleto} size="xs" clickable={false} />
                                  <span className="text-sm font-medium text-slate-800 truncate">
                                    {sel.nomeCompleto}{sel.id === ctxQuery.data?.employeeId ? " (eu)" : ""}
                                  </span>
                                </>
                              ) : (
                                <span className="text-sm text-slate-500">Selecione o colaborador</span>
                              )}
                              <ChevronsUpDown className="h-4 w-4 text-slate-400 ml-auto flex-shrink-0" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0 w-[--radix-popover-trigger-width] max-w-[92vw]" align="start">
                            <Command>
                              <CommandInput placeholder="Digite o nome para filtrar..." />
                              <CommandList className="max-h-64">
                                <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                                <CommandGroup>
                                  {lista.map((e: any) => (
                                    <CommandItem key={e.id} value={e.nomeCompleto}
                                      onSelect={() => { setEmpDoNovo(e.id); setEmpPickerOpen(false); }}>
                                      <PersonPhoto src={e.fotoUrl} alt={e.nomeCompleto} size="xs" clickable={false} />
                                      <span className="ml-2 truncate">{e.nomeCompleto}{e.id === ctxQuery.data?.employeeId ? " (eu)" : ""}</span>
                                      {e.id === empDoNovo && <CheckCircle2 className="h-4 w-4 text-emerald-600 ml-auto" />}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      );
                    })()}
                  </div>
                ) : (
                  // Usuário comum: identificado automaticamente pelo login — nada a escolher
                  <div className="flex items-center gap-2.5 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5">
                    <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {(ctxQuery.data?.dadosBancarios?.nome || "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-blue-900">{ctxQuery.data?.dadosBancarios?.nome || "Colaborador não identificado"}</div>
                      <div className="text-[11px] text-blue-600">Identificado automaticamente pelo seu login</div>
                    </div>
                  </div>
                )
              )}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600 flex items-center gap-1"><MessageSquareText className="h-3.5 w-3.5" /> Motivo / contexto (opcional)</Label>
                <Textarea rows={2} className="bg-slate-50" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: viagem à obra do Residencial X em 12/08" />
              </div>
            </section>

            {/* Passo 2 — Despesas */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Receipt className="h-4 w-4 text-indigo-600" /> Despesas</h3>
              </div>

              {/* Botão IA em destaque */}
              <input ref={aiFileRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
                onChange={(e) => { if (e.target.files?.length) onPickAIFiles(e.target.files); e.target.value = ""; }} />
              <button type="button" disabled={lendoIA > 0} onClick={() => aiFileRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-indigo-300 bg-gradient-to-r from-indigo-50 to-violet-50 hover:from-indigo-100 hover:to-violet-100 transition-colors p-4 flex items-center gap-3 text-left disabled:opacity-70">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center flex-shrink-0 shadow">
                  {lendoIA > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-indigo-900">
                    {lendoIA > 0
                      ? `Lendo notinhas com IA... ${Math.round(((lendoTotal - lendoIA) / Math.max(lendoTotal, 1)) * 100)}%`
                      : "Anexar notinhas — a IA lê e lança tudo"}
                  </span>
                  <span className="block text-xs text-indigo-600/80">
                    {lendoIA > 0
                      ? `${lendoTotal - lendoIA} de ${lendoTotal} lida(s) — pode aguardar nesta tela.`
                      : "Escolha uma ou várias fotos (ou PDF). Descrição, categoria, data e valor entram sozinhos — você só revisa."}
                  </span>
                  {lendoIA > 0 && (
                    <span className="block mt-2 h-2 w-full rounded-full bg-indigo-100 overflow-hidden">
                      <span className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-500"
                        style={{ width: `${Math.max(Math.round(((lendoTotal - lendoIA) / Math.max(lendoTotal, 1)) * 100), 4)}%` }} />
                    </span>
                  )}
                </span>
              </button>

              {despesas.map((d, i) => {
                const meta = catMeta(d.categoria);
                const Icone = meta.icon;
                const valorOk = parseValor(d.valor) > 0;
                const completa = valorOk && !!d.descricao.trim() && !!d.comprovanteUrl;
                return (
                  <div key={i} className={`relative rounded-xl border ${meta.border} bg-white overflow-hidden shadow-sm`}>
                    <div className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${meta.bar}`} />
                    <div className="p-3.5 pl-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-8 h-8 rounded-lg ${meta.bg} ${meta.text} flex items-center justify-center flex-shrink-0`}><Icone className="h-4 w-4" /></span>
                          <span className="text-sm font-semibold text-slate-800">Despesa {i + 1}</span>
                          {completa
                            ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">Completa</Badge>
                            : <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px]">Faltam dados</Badge>}
                        </div>
                        {despesas.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => setDespesas((ds) => ds.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                      {/* Rev. 5086 — alerta de duplicidade */}
                      {d._duplicatas && d._duplicatas.length > 0 && (() => {
                        const dup = d._duplicatas[0];
                        const isExato = dup.nivel === "exato";
                        return (
                          <div className={`rounded-lg border-2 px-3 py-2.5 flex items-start gap-2.5 ${isExato ? "border-red-400 bg-red-50" : "border-amber-400 bg-amber-50"}`}>
                            <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isExato ? "text-red-600" : "text-amber-600"}`} />
                            <div className="text-xs space-y-0.5 min-w-0">
                              <p className={`font-bold ${isExato ? "text-red-800" : "text-amber-800"}`}>
                                {isExato ? "⛔ Documento fiscal já utilizado" : "⚠️ Provável reembolso em duplicidade"}
                              </p>
                              <p className={isExato ? "text-red-700" : "text-amber-700"}>
                                Esta nota já aparece na <b>Solicitação #{dup.solicitacaoId}</b>
                                {dup.employeeNome ? ` (${dup.employeeNome.split(" ")[0]})` : ""} — {brl(dup.valor)} em {dataBR(dup.dataDespesa)}.
                                {dup.estabelecimentoNome ? ` ${dup.estabelecimentoNome}.` : ""}
                              </p>
                              {d._duplicatas.length > 1 && (
                                <p className="text-slate-500">+{d._duplicatas.length - 1} ocorrência(s) adicional(is).</p>
                              )}
                              <p className="text-slate-500 italic">Verifique antes de enviar — se for legítima, você pode prosseguir.</p>
                            </div>
                            <button className="ml-auto text-slate-400 hover:text-slate-700 flex-shrink-0"
                              onClick={() => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, _duplicatas: [] } : x))}>
                              ✕
                            </button>
                          </div>
                        );
                      })()}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-slate-600">Categoria</Label>
                          <Select value={d.categoria} onValueChange={(v) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, categoria: v } : x))}>
                            <SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger>
                            <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-slate-600">Obra (alocação do custo)</Label>
                          <ObraCombobox
                            value={d.obraId ? String(d.obraId) : "0"}
                            onValueChange={(v) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, obraId: v === "0" ? null : Number(v), orcamentoItemId: null, eapCodigo: null, eapDescricao: null } : x))}
                            obras={(obrasQuery.data || []) as ObraOption[]}
                          />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-slate-600">Data</Label>
                          <Input type="date" className="bg-slate-50 w-full min-w-0 max-w-full appearance-none" value={d.dataDespesa} onChange={(e) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, dataDespesa: e.target.value } : x))} />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-slate-600">Valor (R$)</Label>
                          <Input inputMode="decimal" placeholder="0,00" value={d.valor}
                            className={`bg-slate-50 w-full min-w-0 font-semibold ${valorOk ? "text-emerald-700" : ""}`}
                            onChange={(e) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-600">Descrição</Label>
                        <Input className="bg-slate-50" value={d.descricao} placeholder="Ex.: Uber aeroporto → obra" onChange={(e) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))} />
                      </div>
                      {/* Rev. 5081 — Vínculo com veículo da Frota (poka-yoke) */}
                      {(CATS_COM_VEICULO as readonly string[]).includes(d.categoria) && (
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600 flex items-center gap-1">
                            <Truck className="h-3.5 w-3.5 text-indigo-500" /> Veículo <span className="text-slate-400 font-normal">(opcional — registra na Frota sem re-lançar)</span>
                          </Label>
                          {d.vehicleId ? (
                            <div className="flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm text-indigo-900">
                              <Truck className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                              <span className="font-semibold">{d.vehiclePlaca}</span>
                              {d.vehicleModelo && <span className="text-indigo-600 truncate">— {d.vehicleModelo}</span>}
                              <Button size="sm" variant="ghost" className="ml-auto h-7 text-indigo-600 hover:text-red-600 px-2"
                                onClick={() => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, vehicleId: null, vehiclePlaca: null, vehicleModelo: null, kmNaManutencao: null, kmProxima: null } : x))}>
                                Remover
                              </Button>
                            </div>
                          ) : (
                            <Popover open={veicPickerIdx === i} onOpenChange={(o) => { setVeicPickerIdx(o ? i : null); setVeicBusca(""); }}>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-between bg-slate-50 font-normal text-slate-500">
                                  Selecionar veículo...
                                  <ChevronsUpDown className="h-4 w-4 opacity-40 ml-2" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="p-0 w-72" align="start">
                                <Command>
                                  <CommandInput placeholder="Placa ou modelo..." value={veicBusca} onValueChange={setVeicBusca} />
                                  <CommandList>
                                    <CommandEmpty>Nenhum veículo ativo.</CommandEmpty>
                                    <CommandGroup>
                                      {(veiculosQuery.data || [])
                                        .filter((v: any) => !veicBusca || `${v.placa || ""} ${v.modelo || ""} ${v.marca || ""}`.toLowerCase().includes(veicBusca.toLowerCase()))
                                        .map((v: any) => (
                                          <CommandItem key={v.id} value={String(v.id)} onSelect={() => {
                                            setDespesas((ds) => ds.map((x, j) => j === i
                                              ? { ...x, vehicleId: v.id, vehiclePlaca: v.placa || "", vehicleModelo: `${v.modelo || ""} ${v.marca || ""}`.trim() }
                                              : x));
                                            setVeicPickerIdx(null);
                                          }}>
                                            <Truck className="h-4 w-4 mr-2 text-slate-400 flex-shrink-0" />
                                            <span className="font-medium">{v.placa || "—"}</span>
                                            <span className="ml-2 text-muted-foreground truncate">{v.modelo} {v.marca}</span>
                                          </CommandItem>
                                        ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          )}
                          {/* Rev. 5082 — km do hodômetro + próxima manutenção (só após veículo selecionado) */}
                          {d.vehicleId && (
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <div className="space-y-1">
                                <Label className="text-xs text-slate-600">Km atual (hodômetro)</Label>
                                <Input inputMode="numeric" placeholder="Ex.: 45.230" className="bg-slate-50 text-sm"
                                  value={d.kmNaManutencao ?? ""}
                                  onChange={(e) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, kmNaManutencao: e.target.value || null } : x))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-slate-600">Próxima manutenção (km)</Label>
                                <Input inputMode="numeric" placeholder="Ex.: 50.230" className="bg-slate-50 text-sm"
                                  value={d.kmProxima ?? ""}
                                  onChange={(e) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, kmProxima: e.target.value || null } : x))} />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Tabela de itens discriminados — preenchida pela IA */}
                      {d.itens && d.itens.length > 0 && (
                        <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
                          <table className="w-full">
                            <thead className="bg-slate-100 text-slate-500">
                              <tr>
                                <th className="text-left px-3 py-1.5 font-medium w-12">Qtd</th>
                                <th className="text-left px-3 py-1.5 font-medium">Item</th>
                                <th className="text-right px-3 py-1.5 font-medium w-28">Valor (R$)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {d.itens.map((it, k) => (
                                <tr key={k} className="bg-white">
                                  <td className="px-3 py-1.5 text-slate-500">{it.qtd ?? "—"}</td>
                                  <td className="px-3 py-1.5 text-slate-700">{it.descricao}</td>
                                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                    {it.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-700">
                              <tr>
                                <td className="px-3 py-1.5" colSpan={2}>Total</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                  {d.itens.reduce((s, it) => s + it.valor, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-slate-600">Estabelecimento</Label>
                          <Input className="bg-slate-50" value={d.estabelecimentoNome ?? ""} placeholder="A IA preenche pela notinha"
                            onChange={(e) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, estabelecimentoNome: e.target.value } : x))} />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs text-slate-600">CNPJ</Label>
                          <Input className="bg-slate-50" inputMode="numeric" value={d.estabelecimentoCnpj ?? ""} placeholder="00.000.000/0000-00"
                            onChange={(e) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, estabelecimentoCnpj: e.target.value } : x))} />
                        </div>
                      </div>
                      {(d.estabelecimentoEndereco != null && d.estabelecimentoEndereco !== "") && (
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-600">Endereço do estabelecimento</Label>
                          <Input className="bg-slate-50" value={d.estabelecimentoEndereco}
                            onChange={(e) => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, estabelecimentoEndereco: e.target.value } : x))} />
                        </div>
                      )}
                      {!!d.obraId && (
                        d.eapCodigo ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-cyan-50 border border-cyan-200 px-3 py-2 text-sm text-cyan-900">
                            <Landmark className="h-4 w-4 flex-shrink-0 text-cyan-600" />
                            <span className="min-w-0 truncate"><b>{d.eapCodigo}</b> — {d.eapDescricao}</span>
                            <span className="flex gap-1 ml-auto">
                              <Button size="sm" variant="ghost" className="h-7 text-cyan-700" onClick={() => { setEapBusca(""); setEapPickerIdx(i); }}>Trocar</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-cyan-700" onClick={() => setDespesas((ds) => ds.map((x, j) => j === i ? { ...x, orcamentoItemId: null, eapCodigo: null, eapDescricao: null } : x))}>Remover</Button>
                            </span>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full border-cyan-300 bg-cyan-50 text-cyan-800 hover:bg-cyan-100" onClick={() => { setEapBusca(""); setEapPickerIdx(i); }}>
                            <Landmark className="h-4 w-4 mr-1" /> Alocar no planejamento orçamentário (EAP)
                          </Button>
                        )
                      )}
                      <div>
                        <input ref={(el) => { fileRefs.current[i] = el; }} type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(i, f); e.target.value = ""; }} />
                        {d.comprovanteUrl ? (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Comprovante anexado
                            <span className="flex gap-1 ml-auto">
                              <Button size="sm" variant="ghost" className="h-7 text-emerald-700" onClick={() => window.open(d.comprovanteUrl!, "_blank")}>Ver</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-emerald-700" onClick={() => fileRefs.current[i]?.click()}>Trocar</Button>
                            </span>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" disabled={d._uploading} onClick={() => fileRefs.current[i]?.click()}>
                            {d._uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Paperclip className="h-4 w-4 mr-1" />}
                            Anexar comprovante (obrigatório)
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <Button variant="outline" className="w-full border-dashed" onClick={() => setDespesas((d) => [...d, novaDespesa()])}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar despesa manualmente
              </Button>
            </section>

            {/* Passo 3 — Como receber */}
            {!fundoDoNovo && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">3</span>
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Wallet className="h-4 w-4 text-emerald-600" /> Como quer receber</h3>
                </div>
                {/* Prazo de pagamento */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-blue-600" />
                  <span><b>Pagamento em até {prazoDias} dia{prazoDias === 1 ? "" : "s"} útil{prazoDias === 1 ? "" : "s"}</b> após aprovação — o título já entra no Contas a Pagar com a data prevista.</span>
                </div>

                {/* ALERTA OBRIGATÓRIO — conta do colaborador */}
                <div className="rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-3 flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 space-y-0.5">
                    <p className="font-bold text-sm text-amber-800">⚠️ Atenção — conta exclusiva do colaborador</p>
                    <p>O reembolso será feito <b>exclusivamente</b> para a <b>conta/PIX do próprio colaborador</b>. Pagamentos para contas de terceiros <b>não serão processados</b> e o reembolso ficará suspenso até regularização.</p>
                  </div>
                </div>

                {/* PIX — único método aceito */}
                <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3 flex items-center gap-2.5">
                  <QrCode className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-800">PIX</span>
                  <span className="text-xs text-emerald-600 ml-1">(único método aceito)</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 ml-auto" />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-semibold">Chave PIX do colaborador <span className="text-red-500">*</span></Label>
                  <Input className={`bg-slate-50 ${!pagChave.trim() ? "border-amber-400 focus:border-emerald-400" : "border-emerald-400"}`}
                    value={pagChave} onChange={(e) => setPagChave(e.target.value)}
                    placeholder="CPF, e-mail, celular ou chave aleatória" />
                  {!pagChave.trim() && (
                    <p className="text-[11px] text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Chave PIX obrigatória para enviar a solicitação.
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" className="accent-emerald-600" checked={salvarDados} onChange={(e) => setSalvarDados(e.target.checked)} />
                  Salvar esta chave PIX no meu cadastro para as próximas
                </label>
              </section>
            )}
          </div>

          {/* Rodapé fixo: total + ações */}
          <div className="border-t bg-white px-4 py-3 sm:px-6 flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Total do pedido</div>
              <div className="text-xl font-extrabold text-emerald-700">{brl(totalNovo)}</div>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={criarMut.isPending || atualizarMut.isPending || despesas.some((d) => d._uploading)} onClick={submitNovo}>
                {(criarMut.isPending || atualizarMut.isPending) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} {editandoId != null ? "Salvar alterações" : "Enviar para aprovação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: picker de alocação no planejamento orçamentário (EAP) ── */}
      <Dialog open={eapPickerIdx != null} onOpenChange={(v) => !v && setEapPickerIdx(null)}>
        <DialogContent className="max-w-2xl h-[85dvh] max-h-[85dvh] p-0 overflow-hidden flex flex-col gap-0">
          <div className="px-4 py-3.5 sm:px-5 text-white bg-gradient-to-r from-cyan-600 to-sky-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2 text-base">
                <Landmark className="h-5 w-5" /> Alocar no planejamento orçamentário
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-white/80 mt-1">Escolha em qual item da EAP da obra este custo entra.</p>
          </div>
          <div className="p-3 border-b bg-white">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input autoFocus className="pl-9 bg-slate-50" placeholder="Buscar por código ou descrição..." value={eapBusca} onChange={(e) => setEapBusca(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-50/60 p-2 space-y-1">
            {eapQuery.isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando planejamento...</div>
            ) : (eapQuery.data as any)?.semOrcamento ? (
              <div className="py-10 text-center text-sm text-muted-foreground px-6">Esta obra ainda não tem orçamento cadastrado. Dá para enviar sem alocação — o custo fica na obra, sem item de EAP.</div>
            ) : (() => {
              const q = eapBusca.trim().toLowerCase();
              const items = ((eapQuery.data as any)?.items || []).filter((it: any) =>
                !q || String(it.eapCodigo || "").toLowerCase().includes(q) || String(it.descricao || "").toLowerCase().includes(q));
              if (items.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">Nenhum item encontrado.</div>;
              return items.map((it: any) => {
                const nivel = Number(it.nivel || 1);
                const isEtapa = it.tipo !== "item" && nivel <= 1;
                return (
                  <button key={it.id} type="button"
                    disabled={isEtapa}
                    onClick={() => {
                      if (eapPickerIdx == null) return;
                      setDespesas((ds) => ds.map((x, j) => j === eapPickerIdx ? { ...x, orcamentoItemId: it.id, eapCodigo: it.eapCodigo || null, eapDescricao: it.descricao || null } : x));
                      setEapPickerIdx(null);
                    }}
                    className={`w-full text-left rounded-lg px-3 py-2 flex items-center gap-2 ${isEtapa ? "bg-slate-100 text-slate-500 font-semibold text-xs uppercase tracking-wide" : "bg-white border border-slate-200 hover:border-cyan-400 hover:bg-cyan-50"}`}
                    style={{ marginLeft: Math.min(Math.max(nivel - 1, 0), 4) * 12 }}>
                    <span className={`text-xs font-mono flex-shrink-0 ${isEtapa ? "" : "text-cyan-700 font-bold"}`}>{it.eapCodigo}</span>
                    <span className="text-sm min-w-0 truncate">{it.descricao}</span>
                    {!isEtapa && it.unidade && <span className="text-[10px] text-slate-400 ml-auto flex-shrink-0">{it.unidade}</span>}
                  </button>
                );
              });
            })()}
          </div>
          <div className="border-t bg-white px-4 py-2.5 flex justify-end">
            <Button variant="outline" onClick={() => setEapPickerIdx(null)}>Fechar sem alocar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: detalhe / aprovação ── */}
      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Solicitação Nº {detalhe?.numero ?? detalhe?.id} — {detalhe?.employeeNome || ""}</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(detalhe)}
                {detalhe.tipo === "caixinha" && <Badge variant="outline" className="bg-violet-100 text-violet-800 border-violet-300">Prestação de caixinha</Badge>}
                <span className="text-sm text-muted-foreground">Criada em {dataBR(String(detalhe.criadoEm).slice(0, 10))}{detalhe.criadoPorNome ? ` por ${detalhe.criadoPorNome}` : ""}</span>
              </div>
              {detalhe.motivo && <div className="text-sm"><b>Motivo:</b> {detalhe.motivo}</div>}
              {detalhe.pagamentoChave && <div className="text-sm"><b>Receber via:</b> {detalhe.pagamentoTipo === "pix" ? "PIX" : "Conta"} — {detalhe.pagamentoChave}</div>}
              {detalhe.motivoDecisao && <div className="text-sm text-amber-700"><b>Observação do aprovador:</b> {detalhe.motivoDecisao}</div>}

              <div className="space-y-2">
                {(detalhe.despesas || []).map((d: any) => {
                  const emDecisao = isAdmin && detalhe.status === "pendente";
                  const dec = decisoes[d.id];
                  return (
                    <div key={d.id} className={`rounded-md border p-3 ${d.status === "reprovada" ? "border-red-200 bg-red-50" : d.status === "aprovada" ? "border-emerald-200 bg-emerald-50" : "bg-slate-50"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium">{d.descricao}</div>
                          <div className="text-xs text-muted-foreground">{catLabel(d.categoria)} · {dataBR(d.dataDespesa)}{d.obraId ? ` · Obra #${d.obraId}` : ""}{d.eapCodigo ? ` · EAP ${d.eapCodigo}` : ""}</div>
                          {(d.estabelecimentoNome || d.estabelecimentoCnpj) && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {d.estabelecimentoNome}{d.estabelecimentoCnpj ? ` · CNPJ ${d.estabelecimentoCnpj}` : ""}
                              {d.estabelecimentoEndereco ? <span className="block truncate">{d.estabelecimentoEndereco}</span> : null}
                            </div>
                          )}
                          {/* Rev. 5081 — badge de veículo vinculado */}
                          {(d as any).vehicleId && (
                            <div className={`flex items-center gap-1.5 text-xs mt-1 ${(d as any).frotaManutencaoId ? "text-emerald-700" : "text-indigo-700"}`}>
                              <Truck className="h-3.5 w-3.5 flex-shrink-0" />
                              <span>
                                <b>{(d as any).vehiclePlaca || `Veículo #${(d as any).vehicleId}`}</b>
                                {(d as any).vehicleModelo ? ` — ${(d as any).vehicleModelo}` : ""}
                              </span>
                              {(d as any).frotaManutencaoId
                                ? <span className="ml-1 font-medium">· ✓ Registrado na Frota automaticamente</span>
                                : <span className="ml-1 text-slate-400">· Será registrado na Frota ao aprovar</span>}
                            </div>
                          )}
                          {/* Rev. 5082 — km registrada */}
                          {(d as any).vehicleId && ((d as any).kmNaManutencao || (d as any).kmProxima) && (
                            <div className="text-[11px] text-slate-500 mt-0.5 ml-5 flex flex-wrap gap-3">
                              {(d as any).kmNaManutencao && <span>Km atual: <b>{(d as any).kmNaManutencao}</b></span>}
                              {(d as any).kmProxima && <span>Próxima manutenção: <b>{(d as any).kmProxima} km</b></span>}
                            </div>
                          )}
                          {/* Tabela de itens discriminados (lida pela IA da notinha) */}
                          {Array.isArray(d.itensJson) && d.itensJson.length > 0 && (
                            <div className="mt-2 rounded border border-slate-200 overflow-hidden text-xs">
                              <table className="w-full">
                                <thead className="bg-slate-100 text-slate-500">
                                  <tr>
                                    <th className="text-left px-2 py-1 font-medium w-10">Qtd</th>
                                    <th className="text-left px-2 py-1 font-medium">Item</th>
                                    <th className="text-right px-2 py-1 font-medium w-24">R$</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {(d.itensJson as any[]).map((it: any, k: number) => (
                                    <tr key={k} className="bg-white">
                                      <td className="px-2 py-1 text-slate-400">{it.qtd ?? "—"}</td>
                                      <td className="px-2 py-1 text-slate-700">{it.descricao}</td>
                                      <td className="px-2 py-1 text-right font-mono tabular-nums">
                                        {Number(it.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-600">
                                  <tr>
                                    <td className="px-2 py-1" colSpan={2}>Total</td>
                                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                                      {(d.itensJson as any[]).reduce((s: number, it: any) => s + Number(it.valor), 0)
                                        .toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                          {d.status === "reprovada" && d.motivoReprovacao && <div className="text-xs text-red-600">Reprovada: {d.motivoReprovacao}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{brl(d.valor)}</span>
                          {d.comprovanteUrl && <Button size="sm" variant="outline" onClick={() => window.open(d.comprovanteUrl, "_blank")}><Paperclip className="h-4 w-4 mr-1" />Nota</Button>}
                        </div>
                      </div>
                      {emDecisao && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button size="sm" variant={dec?.aprovar ? "default" : "outline"} className={dec?.aprovar ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                            onClick={() => setDecisoes((m) => ({ ...m, [d.id]: { ...(m[d.id] || { motivo: "" }), aprovar: true } }))}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                          </Button>
                          <Button size="sm" variant={dec && !dec.aprovar ? "destructive" : "outline"}
                            onClick={() => setDecisoes((m) => ({ ...m, [d.id]: { ...(m[d.id] || { motivo: "" }), aprovar: false } }))}>
                            <XCircle className="h-4 w-4 mr-1" /> Reprovar
                          </Button>
                          {dec && !dec.aprovar && (
                            <Input className="flex-1 min-w-[180px]" placeholder="Motivo da reprovação" value={dec.motivo}
                              onChange={(e) => setDecisoes((m) => ({ ...m, [d.id]: { ...m[d.id], motivo: e.target.value } }))} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between font-bold">
                <span>Total solicitado: {brl(detalhe.valorTotal)}</span>
                {isAdmin && detalhe.status === "pendente" && (
                  <span className="text-emerald-700">
                    Aprovando: {brl((detalhe.despesas || []).reduce((s: number, d: any) => s + (decisoes[d.id]?.aprovar ? Number(d.valor) : 0), 0))}
                  </span>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {detalhe && detalhe.status === "pendente" && (
              <Button variant="outline" className="text-red-600" disabled={cancelarMut.isPending}
                onClick={() => setConfirmCfg({
                  tom: "apagar", rotulo: "Cancelar solicitação",
                  titulo: `Cancelar a solicitação Nº ${detalhe.numero ?? detalhe.id}?`,
                  descricao: "Ela ficará marcada como cancelada e o título em aberto no Financeiro (se houver) será cancelado junto.",
                  acao: () => cancelarMut.mutate({ companyId: detalhe.companyId, id: detalhe.id }),
                })}>
                Cancelar solicitação
              </Button>
            )}
            {detalhe && isAdmin && detalhe.status === "pendente" && (
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={decidirMut.isPending} onClick={submitDecisao}>
                {decidirMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Confirmar decisão
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: novo fundo fixo ── */}
      <Dialog open={fundoOpen} onOpenChange={setFundoOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
          {/* Header colorido no padrão do módulo */}
          <div className="flex items-start gap-3 px-4 py-4 sm:px-6 text-white bg-gradient-to-r from-violet-600 to-purple-700">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <PiggyBank className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-white text-base sm:text-lg">Nova Caixinha (Fundo Fixo)</DialogTitle>
              <p className="text-xs text-violet-100 mt-0.5">Pré-pago: a pessoa recebe o valor e os lançamentos dela vão abatendo.</p>
            </div>
            <DialogClose className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center text-white flex-shrink-0">
              <XCircle className="h-5 w-5" /><span className="sr-only">Fechar</span>
            </DialogClose>
          </div>

          <div className="px-4 py-4 sm:px-6 space-y-4 bg-slate-50/60 max-h-[70vh] overflow-y-auto">
            {/* Passo 1 — Quem */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">1</span>
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><User className="h-4 w-4 text-violet-600" /> Quem vai ter a caixinha</h3>
              </div>
              {(() => {
                const lista = (employeesQuery.data || []).filter((e: any) => e.status === "Ativo" || e.status === "Aviso");
                const sel = lista.find((e: any) => e.id === fundoEmp);
                const jaTem = !!(fundosQuery.data || []).find((f: any) => f.status === "ativo" && f.employeeId === fundoEmp);
                return (
                  <>
                    <Popover open={fundoEmpPickerOpen} onOpenChange={setFundoEmpPickerOpen}>
                      <PopoverTrigger asChild>
                        <button type="button" className="w-full rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-2 flex items-center gap-2.5 text-left">
                          {sel ? (
                            <>
                              <PersonPhoto src={sel.fotoUrl} alt={sel.nomeCompleto} size="xs" clickable={false} />
                              <span className="text-sm font-medium text-slate-800 truncate">{sel.nomeCompleto}</span>
                            </>
                          ) : (
                            <span className="text-sm text-slate-500">Selecione o funcionário ou terceiro</span>
                          )}
                          <ChevronsUpDown className="h-4 w-4 text-slate-400 ml-auto flex-shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] max-w-[92vw]" align="start">
                        <Command>
                          <CommandInput placeholder="Digite o nome para filtrar..." />
                          <CommandList>
                            <CommandEmpty>Ninguém encontrado.</CommandEmpty>
                            {lista.map((e: any) => (
                              <CommandItem key={e.id} value={e.nomeCompleto} onSelect={() => { setFundoEmp(e.id); setFundoEmpPickerOpen(false); }}>
                                <PersonPhoto src={e.fotoUrl} alt={e.nomeCompleto} size="xs" clickable={false} />
                                <span className="ml-2 truncate">{e.nomeCompleto}</span>
                              </CommandItem>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {jaTem && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" /> Esta pessoa <b>já tem caixinha ativa</b> — encerre a atual antes de criar outra.
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Pode ser funcionário ou terceiro, mas <b>precisa ter login no sistema</b> — o sistema confere na hora de criar.
                    </p>
                  </>
                );
              })()}
            </section>

            {/* Passo 2 — Valor */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">2</span>
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Wallet className="h-4 w-4 text-violet-600" /> Valor do fundo</h3>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold">R$</span>
                <Input inputMode="decimal" placeholder="500,00" className="pl-9 text-lg font-semibold bg-slate-50" value={fundoValor} onChange={(e) => setFundoValor(e.target.value)} />
              </div>
              <Input value={fundoDesc} onChange={(e) => setFundoDesc(e.target.value)} placeholder="Descrição (opcional) — ex.: caixinha do vendedor externo" className="bg-slate-50" />
            </section>

            {/* Resumo poka-yoke do que vai acontecer */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
              <span>
                Ao criar: <b>1)</b> entra um título no Contas a Pagar com o crédito inicial{parseValor(fundoValor) > 0 ? <> de <b>{brl(parseValor(fundoValor))}</b></> : ""};{" "}
                <b>2)</b> os lançamentos dessa pessoa passam a <b>debitar da caixinha automaticamente</b>;{" "}
                <b>3)</b> o saldo (positivo/negativo) fica visível nesta tela.
              </span>
            </div>
          </div>

          <DialogFooter className="p-4 sm:px-6 border-t bg-white flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setFundoOpen(false)}>Cancelar</Button>
            <Button className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={criarFundoMut.isPending || !fundoEmp || parseValor(fundoValor) <= 0 || !!(fundosQuery.data || []).find((f: any) => f.status === "ativo" && f.employeeId === fundoEmp)}
              onClick={() => {
                if (!fundoEmp || parseValor(fundoValor) <= 0) { toast.error("Selecione a pessoa e o valor."); return; }
                criarFundoMut.mutate({ companyId: companyIdNum, employeeId: fundoEmp, valorFundo: parseValor(fundoValor), descricao: fundoDesc || null });
              }}>
              {criarFundoMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PiggyBank className="h-4 w-4 mr-1" />} Criar caixinha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Critérios do módulo ── */}
      <Dialog open={criteriosOpen} onOpenChange={setCriteriosOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className="p-4 sm:p-5 text-left bg-gradient-to-r from-emerald-600 to-teal-600">
            <DialogTitle className="text-white text-base sm:text-lg flex items-center gap-2">
              <Settings className="h-5 w-5 shrink-0" /> Critérios de Reembolso
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Prazo para pagar o reembolso (dias úteis)</Label>
              <Input type="number" inputMode="numeric" min={1} max={60} className="bg-slate-50 w-32" value={prazoDraft}
                onChange={(e) => setPrazoDraft(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Contado a partir da <b>criação</b> da solicitação (não da aprovação). Ao aprovar, o título entra no Contas a Pagar com esse vencimento. Vale para esta empresa.
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Anti-duplicidade: a IA lê a chave de acesso/nº do cupom de cada notinha e o sistema <b>bloqueia automaticamente</b> o mesmo documento fiscal em mais de uma solicitação.
            </div>
          </div>
          <DialogFooter className="p-4 pt-0 flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setCriteriosOpen(false)}>Voltar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={setPrazoMut.isPending}
              onClick={() => {
                const n = parseInt(prazoDraft, 10);
                if (!Number.isFinite(n) || n < 1 || n > 60) { toast.error("Informe um prazo entre 1 e 60 dias."); return; }
                setPrazoMut.mutate({ companyId: companyIdNum, prazoDias: n });
              }}>
              {setPrazoMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmação poka-yoke colorida ── */}
      <Dialog open={!!confirmCfg} onOpenChange={(v) => { if (!v) setConfirmCfg(null); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className={`p-4 sm:p-5 text-left ${
            confirmCfg?.tom === "aprovar" ? "bg-gradient-to-r from-emerald-600 to-teal-600"
            : confirmCfg?.tom === "apagar" ? "bg-gradient-to-r from-red-600 to-rose-600"
            : "bg-gradient-to-r from-slate-600 to-slate-700"}`}>
            <DialogTitle className="text-white text-base sm:text-lg flex items-center gap-2">
              {confirmCfg?.tom === "aprovar" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
              {confirmCfg?.titulo}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 sm:p-5 text-sm text-slate-700">{confirmCfg?.descricao}</div>
          <DialogFooter className="p-4 pt-0 flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmCfg(null)}>Voltar</Button>
            <Button
              className={confirmCfg?.tom === "aprovar" ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : confirmCfg?.tom === "apagar" ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-slate-700 hover:bg-slate-800 text-white"}
              onClick={() => { const a = confirmCfg?.acao; setConfirmCfg(null); a?.(); }}>
              {confirmCfg?.rotulo || "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
