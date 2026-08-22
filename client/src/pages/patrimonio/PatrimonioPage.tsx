/**
 * Patrimônio Imobiliário — Rev. 5089
 * Layout moderno, Plano Diretor com IA, ficha urbanística, Google Maps embed.
 * Acesso exclusivo: admin_master
 */
import { useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useModule } from "@/contexts/ModuleContext";
import { toast } from "sonner";
import {
  Building2, MapPin, Plus, Pencil, Trash2, FileText, Upload,
  Eye, X, Loader2, Paperclip, AlertTriangle, DollarSign,
  Globe, ExternalLink,
  Search, Scale, Landmark, Map, Navigation, BookOpen, Receipt,
  ChevronDown, ChevronUp, TreePine, Ruler, SquareDashed,
  Layers, Droplets, ArrowUpDown, Building, Camera, ImageIcon, Video,
  CheckCircle2, Home, TrendingUp, ArrowRight, BadgeCheck, BadgeAlert,
  Maximize2, ToggleLeft, ToggleRight, UserRound,
  Calendar, CreditCard, Clock, Banknote, Check, Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/* ── Formatadores ── */
const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (s: string | null | undefined) => {
  if (!s) return "—";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const areaFmt = (v: number | null | undefined) => v ? `${v.toLocaleString("pt-BR")} m²` : "—";
const pct = (v: number | null | undefined) => v == null ? "—" : `${v}%`;
const mt = (v: number | null | undefined) => v == null ? "—" : `${v} m`;
const coef = (v: number | null | undefined) => v == null ? "—" : v.toFixed(2);

/* ── Constantes ── */
const TIPOS_LABEL: Record<string, string> = {
  terreno: "Terreno", casa: "Casa", apartamento: "Apartamento",
  galpao: "Galpão", sala_comercial: "Sala Comercial", rural: "Rural", outro: "Outro",
};
const STATUS_LABEL: Record<string, string> = {
  disponivel: "Disponível", financiado: "Financiado", quitado: "Quitado",
  locado: "Locado", vendido: "Vendido",
};
const STATUS_COLOR: Record<string, string> = {
  disponivel: "bg-sky-100 text-sky-700 border-sky-300",
  financiado:  "bg-amber-100 text-amber-700 border-amber-300",
  quitado:     "bg-indigo-100 text-indigo-700 border-indigo-300",
  locado:      "bg-blue-100 text-blue-700 border-blue-300",
  vendido:     "bg-slate-100 text-slate-500 border-slate-300",
};

const STATUS_STRIPE: Record<string, string> = {
  disponivel: "bg-slate-400",
  financiado:  "bg-blue-500",
  quitado:     "bg-indigo-500",
  locado:      "bg-emerald-500",
  vendido:     "bg-slate-300",
};
const TIPOS_DOC_LABEL: Record<string, string> = {
  escritura: "Escritura", matricula: "Matrícula", boleto_iptu: "Boleto IPTU",
  projeto: "Projeto", laudo: "Laudo/Vistoria", contrato: "Contrato",
  foto: "Foto", video: "Vídeo", outro: "Outro",
};

/* ── Tipos ── */
interface SocioEntry {
  nome:      string;
  cpf:       string;
  doc:       string | null;
  partnerId?: number;
}

interface Imovel {
  id: number; companyId: number; tipo: string; nome: string; status: string;
  logradouro: string|null; numero: string|null; complemento: string|null;
  bairro: string|null; cidade: string|null; estado: string|null; cep: string|null;
  lat: number|null; lng: number|null;
  areaTotal: number|null; areaConstruida: number|null;
  matricula: string|null; livro: string|null; folha: string|null;
  tabelionato: string|null; cidadeCartorio: string|null;
  dataEscritura: string|null; numeroRegistro: string|null;
  vendedores: string|null; compradores: string|null; itbiValor: number|null;
  dataCompra: string|null; valorCompra: number|null;
  valorVenal: number|null; valorComercial: number|null; valorVenda: number|null;
  iptuValor: number|null; iptuVencimento: string|null;
  cadastroPrefeitura: string|null; inscricaoMunicipal: string|null;
  financiamentoBanco: string|null; financiamentoParcela: number|null;
  financiamentoSaldoDevedor: number|null; financiamentoVencimento: string|null;
  financiamentoTaxaAnual: number|null; financiamentoIndice: string|null;
  financiamentoNumeroParcelas: number|null; financiamentoParcelasPagas: number|null;
  financiamentoDataInicio: string|null;
  zoneamento: string|null; planoDiretorMunicipio: string|null;
  usoPermitido: string|null;
  coefAproveitamentoBasico: number|null; coefAproveitamentoMaximo: number|null;
  taxaOcupacao: number|null; taxaPermeabilidade: number|null;
  gabaritoMaximo: string|null;
  recuoFrontal: number|null; recuoLateral: number|null; recuoFundos: number|null;
  observacoesZoneamento: string|null; planoDiretorUrl: string|null;
  // Dimensões
  terrenoLargura: number|null; terrenoComprimento: number|null; terrenoFrente: number|null;
  // Situação construtiva
  imovelAverbado: boolean; areaAverbada: number|null; anoConstrucao: number|null;
  // Renda
  geraRenda: boolean; rendaMensal: number|null; rendaLocatario: string|null;
  rendaDiaVencimento: number|null; rendaContratoInicio: string|null; rendaContratoFim: string|null;
  ownerType: string; sociosJson: SocioEntry[];
  socioNome: string|null; socioCpf: string|null; socioDoc: string|null;
  observacoes: string|null; fotoCapaUrl: string|null; fotoCapaKey: string|null;
  createdAt: any; totalDocs: number; encargoVencido: boolean;
}
type ImovelForm = Omit<Imovel, "id"|"companyId"|"createdAt"|"totalDocs"|"fotoCapaKey">;

const emptyForm = (): ImovelForm => ({
  tipo: "outro", nome: "", status: "disponivel",
  logradouro: null, numero: null, complemento: null, bairro: null,
  cidade: null, estado: null, cep: null, lat: null, lng: null,
  areaTotal: null, areaConstruida: null,
  matricula: null, livro: null, folha: null, tabelionato: null,
  cidadeCartorio: null, dataEscritura: null, numeroRegistro: null,
  vendedores: null, compradores: null, itbiValor: null,
  dataCompra: null, valorCompra: null, valorVenal: null,
  valorComercial: null, valorVenda: null,
  iptuValor: null, iptuVencimento: null,
  cadastroPrefeitura: null, inscricaoMunicipal: null,
  financiamentoBanco: null, financiamentoParcela: null,
  financiamentoSaldoDevedor: null, financiamentoVencimento: null,
  financiamentoTaxaAnual: null, financiamentoIndice: null,
  financiamentoNumeroParcelas: null, financiamentoParcelasPagas: null, financiamentoDataInicio: null,
  zoneamento: null, planoDiretorMunicipio: null, usoPermitido: null,
  coefAproveitamentoBasico: null, coefAproveitamentoMaximo: null,
  taxaOcupacao: null, taxaPermeabilidade: null, gabaritoMaximo: null,
  recuoFrontal: null, recuoLateral: null, recuoFundos: null,
  observacoesZoneamento: null, planoDiretorUrl: null,
  terrenoLargura: null, terrenoComprimento: null, terrenoFrente: null,
  imovelAverbado: false, areaAverbada: null, anoConstrucao: null,
  geraRenda: false, rendaMensal: null, rendaLocatario: null,
  rendaDiaVencimento: null, rendaContratoInicio: null, rendaContratoFim: null,
  ownerType: "empresa", sociosJson: [], socioNome: null, socioCpf: null, socioDoc: null,
  observacoes: null, fotoCapaUrl: null,
});

/* ── Combobox de sócio com lookup do cadastro ── */
function SocioCombobox({
  value, onChange, socios,
}: {
  value: SocioEntry;
  onChange: (v: SocioEntry) => void;
  socios: { id: number; nome: string; cpf: string|null; cargo?: string|null }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value.nome || "");

  useEffect(() => { setSearch(value.nome || ""); }, [value.nome]);

  const filtered = socios.filter(s => {
    const q = search.toLowerCase();
    return !q || s.nome.toLowerCase().includes(q) || (s.cpf||"").includes(q);
  }).slice(0, 8);

  return (
    <div className="sm:col-span-2 space-y-1 relative">
      <Label>Nome completo</Label>
      <div className="relative">
        <Input
          placeholder="Buscar sócio cadastrado ou digitar nome..."
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            onChange({ ...value, nome: e.target.value, partnerId: undefined });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          className="pr-8"
        />
        <UserRound className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-0.5 max-h-52 overflow-y-auto">
          {filtered.map(s => (
            <button key={s.id} type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-sky-50 border-b border-slate-100 last:border-0 transition-colors"
              onMouseDown={() => {
                onChange({ ...value, nome: s.nome, cpf: s.cpf||value.cpf, partnerId: s.id });
                setSearch(s.nome);
                setOpen(false);
              }}>
              <p className="text-sm font-medium text-slate-800">{s.nome}</p>
              <p className="text-[11px] text-slate-400">
                {[s.cargo, s.cpf && `CPF ${s.cpf}`].filter(Boolean).join(" · ") || "Sócio cadastrado"}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function numInput(v: number|null|undefined) { return v == null ? "" : String(v); }
function parseNum(s: string): number|null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ── Helpers de dinheiro BR (ponto milhar, vírgula decimal) ── */
function formatBRMoney(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseBRMoney(s: string): number | null {
  if (!s.trim()) return null;
  // aceita tanto "1.234,56" (BR) quanto "1234.56" (numérico puro)
  const clean = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Input de dinheiro com separador de milhar em tempo real (BR).
 * Digitar "35000" exibe "35.000"; blur fecha para "35.000,00".
 * Digitar "35000,50" exibe "35.000,50".
 */
function MoneyInput({ value, onChange, placeholder }: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(() =>
    value != null && value > 0 ? formatBRMoney(value) : ""
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(value != null && value > 0 ? formatBRMoney(value) : "");
  }, [value, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const s = e.target.value;
    // só dígitos, ponto e vírgula
    const clean = s.replace(/[^0-9.,]/g, "");

    // Separa parte inteira e decimal (vírgula = separador decimal)
    const commaIdx = clean.lastIndexOf(",");
    const intRaw   = commaIdx >= 0
      ? clean.slice(0, commaIdx).replace(/\./g, "")   // remove pontos da parte inteira
      : clean.replace(/\./g, "");
    const decRaw   = commaIdx >= 0
      ? clean.slice(commaIdx + 1).replace(/[^0-9]/g, "").slice(0, 2)
      : null;

    // Formata milhar na parte inteira
    const intFmt = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    const typed = clean.endsWith(",")
      ? `${intFmt},`
      : decRaw !== null
        ? `${intFmt},${decRaw}`
        : intFmt;

    setRaw(typed);

    // Converte para número
    const numStr = `${intRaw}${decRaw !== null ? "." + decRaw : ""}`;
    const n = numStr === "" ? null : parseFloat(numStr);
    onChange(Number.isFinite(n) && n >= 0 ? n : null);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder ?? "0,00"}
      value={raw}
      onFocus={() => setFocused(true)}
      onChange={handleChange}
      onBlur={() => {
        setFocused(false);
        const n = parseBRMoney(raw);
        setRaw(n != null ? formatBRMoney(n) : "");
        onChange(n);
      }}
    />
  );
}
function fullEndereco(f: Partial<Imovel>): string {
  return [f.logradouro, f.numero, f.complemento, f.bairro, f.cidade, f.estado].filter(Boolean).join(", ");
}

/* ── Sub-componentes ── */
function SectionTitle({ icon: Icon, label, className: _cls, badge, id, color = "navy" }: {
  icon: any; label: string; className?: string; badge?: "ok" | "warn"; id?: string; color?: string;
}) {
  type Theme = { bar: string; bg: string; text: string; ic: string };
  const themes: Record<string, Theme> = {
    navy:   { bar:"#0f3460", bg:"bg-[#0f3460]/[0.06]", text:"text-[#0f3460]",  ic:"text-[#0f3460]"  },
    indigo: { bar:"#4f46e5", bg:"bg-indigo-50",         text:"text-indigo-700", ic:"text-indigo-500" },
    sky:    { bar:"#0284c7", bg:"bg-sky-50",            text:"text-sky-700",    ic:"text-sky-500"    },
    blue:   { bar:"#2563eb", bg:"bg-blue-50",           text:"text-blue-700",   ic:"text-blue-500"   },
    royal:  { bar:"#1e40af", bg:"bg-blue-50/70",        text:"text-blue-800",   ic:"text-blue-600"   },
    cyan:   { bar:"#0891b2", bg:"bg-cyan-50",           text:"text-cyan-700",   ic:"text-cyan-500"   },
    cobalt: { bar:"#1d4ed8", bg:"bg-blue-50",           text:"text-blue-700",   ic:"text-blue-500"   },
    amber:  { bar:"#d97706", bg:"bg-amber-50",          text:"text-amber-700",  ic:"text-amber-500"  },
    ocean:  { bar:"#0284c7", bg:"bg-sky-50/70",         text:"text-sky-700",    ic:"text-sky-500"    },
    deep:   { bar:"#4338ca", bg:"bg-indigo-50",         text:"text-indigo-700", ic:"text-indigo-500" },
    dark:   { bar:"#334155", bg:"bg-slate-100",         text:"text-slate-700",  ic:"text-slate-500"  },
    gray:   { bar:"#64748b", bg:"bg-slate-50",          text:"text-slate-600",  ic:"text-slate-400"  },
  };
  const t = themes[color] || themes.navy;
  return (
    <div id={id} style={{ borderLeftColor: t.bar }}
      className={`flex items-center gap-2.5 px-3.5 py-2 rounded-r-lg ${t.bg} border-l-[3px] mt-6 mb-3 scroll-mt-3`}>
      <Icon className={`h-3.5 w-3.5 ${t.ic} flex-shrink-0`} />
      <span className={`text-[10px] font-bold uppercase tracking-widest ${t.text} flex-1`}>{label}</span>
      {badge === "ok"   && <CheckCircle2 className={`h-3.5 w-3.5 ${t.ic} opacity-70 flex-shrink-0`} />}
      {badge === "warn" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
    </div>
  );
}

function InfoCell({ label, value, mono }: { label: string; value: string|null|undefined; mono?: boolean }) {
  if (!value || value === "—") return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function MapEmbed({ address }: { address: string }) {
  if (!address) return null;
  return (
    <div className="mt-3 space-y-2">
      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <iframe
          src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed&hl=pt-BR&z=17`}
          width="100%" height="220" style={{ border: 0 }} loading="lazy" title="Mapa"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg px-3 py-1.5 transition-colors">
          <Map className="h-3.5 w-3.5" /> Abrir no Google Maps
        </a>
        <a href={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&layer=c`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-1.5 transition-colors">
          <Navigation className="h-3.5 w-3.5" /> Street View
        </a>
      </div>
    </div>
  );
}

function AIScanner({
  theme, title, subtitle, lendo, progresso, resultado, pendingUrl,
  onSelect, onClear,
}: {
  theme: "blue"|"green";
  title: string; subtitle: string;
  lendo: boolean; progresso: number;
  resultado: { campos: string[]; titulo: string; arquivoUrl?: string } | null;
  pendingUrl?: string | null;
  onSelect: () => void;
  onClear: () => void;
}) {
  const b = theme === "green"
    ? "border-emerald-200 from-emerald-50 to-teal-50"
    : "border-sky-200 from-sky-50 to-indigo-50";
  const btn = theme === "green"
    ? "bg-emerald-700 hover:bg-emerald-800 text-white"
    : "bg-[#0369a1] hover:bg-[#0c4a6e] text-white";
  const bar = theme === "green"
    ? "from-emerald-400 to-teal-500"
    : "from-sky-400 to-indigo-500";
  const txt = theme === "green" ? "text-emerald-700" : "text-sky-700";
  const bar2 = theme === "green" ? "bg-emerald-100" : "bg-sky-100";

  return (
    <div className={`rounded-xl border-2 ${b} bg-gradient-to-r p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${txt} flex items-center gap-2`}>
            <FileText className="h-4 w-4 flex-shrink-0" /> {title}
          </p>
          <p className={`text-xs ${theme === "green" ? "text-emerald-600" : "text-sky-600"} mt-0.5 leading-relaxed`}>{subtitle}</p>
        </div>
        <Button type="button" className={`${btn} flex-shrink-0 text-sm`} disabled={lendo} onClick={onSelect}>
          {lendo ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Analisando…</>
            : <><Upload className="h-3.5 w-3.5 mr-1.5" /> Selecionar</>}
        </Button>
      </div>
      {lendo && (
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <p className={`text-xs ${txt} font-medium`}>Processando documento com IA…</p>
            <p className={`text-xs font-bold ${txt}`}>{progresso}%</p>
          </div>
          <div className={`w-full h-1.5 ${bar2} rounded-full overflow-hidden`}>
            <div className={`h-1.5 rounded-full bg-gradient-to-r ${bar} transition-all duration-300`}
              style={{ width: `${progresso}%` }} />
          </div>
        </div>
      )}
      {resultado && !lendo && (
        <div className="rounded-lg bg-white/80 border border-white px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs font-semibold ${txt} uppercase tracking-wide`}>{resultado.titulo}</p>
            <div className="flex items-center gap-1.5">
              {resultado.arquivoUrl && (
                <a href={resultado.arquivoUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] flex items-center gap-1 border border-slate-200 rounded px-2 py-0.5 bg-white hover:bg-slate-50 text-slate-600 transition-colors">
                  <Eye className="h-3 w-3" /> Ver
                </a>
              )}
              <button type="button" onClick={onClear} className="text-slate-400 hover:text-slate-600 p-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {resultado.campos.length > 0 && (
            <p className="text-xs text-slate-600">
              <span className="font-medium text-emerald-700">✓</span>{" "}
              {resultado.campos.join(" · ")}
            </p>
          )}
          {pendingUrl && <p className="text-xs text-slate-500">📎 Documento salvo automaticamente ao cadastrar.</p>}
        </div>
      )}
    </div>
  );
}

/* ─────────── COMPONENTE PRINCIPAL ─────────── */

export default function PatrimonioPage() {
  const { companyIdNum: companyId } = useCompany();
  const { setActiveModule } = useModule();
  const utils = trpc.useUtils();

  const listarQ = trpc.patrimonio.listar.useQuery({ companyId }, { enabled: companyId > 0 });
  const imoveis: Imovel[] = listarQ.data || [];

  // Mutations
  const criarMut     = trpc.patrimonio.criar.useMutation({ onSuccess: () => utils.patrimonio.listar.invalidate() });
  const atualizarMut = trpc.patrimonio.atualizar.useMutation({ onSuccess: () => utils.patrimonio.listar.invalidate() });
  const excluirMut   = trpc.patrimonio.excluir.useMutation({ onSuccess: () => utils.patrimonio.listar.invalidate() });
  const uploadFotoMut = trpc.patrimonio.uploadFoto.useMutation();
  const lerDocMut    = trpc.patrimonio.lerDocumento.useMutation();
  const lerPDMut     = trpc.patrimonio.lerPlanoDiretor.useMutation();
  const sociosQ      = trpc.patrimonio.listarSocios.useQuery({ companyId }, { enabled: companyId > 0 });
  const criarDocMut  = trpc.patrimonio.documentos.criar.useMutation({ onSuccess: () => utils.patrimonio.documentos.listar.invalidate() });
  const criarDocMut2 = trpc.patrimonio.documentos.criar.useMutation();
  const excluirDocMut = trpc.patrimonio.documentos.excluir.useMutation({ onSuccess: () => utils.patrimonio.documentos.listar.invalidate() });
  const uploadDocMut = trpc.patrimonio.documentos.upload.useMutation();

  // Form state
  const [form, setForm] = useState<ImovelForm>(emptyForm());
  const [editando, setEditando] = useState<Imovel|null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [finOpen, setFinOpen] = useState(false);
  const [rendaOpen, setRendaOpen] = useState(false);

  // AI — escritura
  const [lendoDoc, setLendoDoc] = useState(false);
  const [progressoDoc, setProgressoDoc] = useState(0);
  const [resultadoDoc, setResultadoDoc] = useState<{ campos: string[]; titulo: string; arquivoUrl?: string }|null>(null);
  const [pendingDocs, setPendingDocs] = useState<{ url: string; key: string; tipo: string; descricao: string }[]>([]);

  // AI — plano diretor
  const [lendoPD, setLendoPD] = useState(false);
  const [progressoPD, setProgressoPD] = useState(0);
  const [resultadoPD, setResultadoPD] = useState<{ campos: string[]; titulo: string; arquivoUrl?: string }|null>(null);
  const [pendingPD, setPendingPD] = useState<{ url: string; key: string }|null>(null);

  // Refs
  const docRef  = useRef<HTMLInputElement>(null);
  const pdRef   = useRef<HTMLInputElement>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const anexoRef  = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [formActiveSection, setFormActiveSection] = useState("identificacao");

  // Upload foto
  const [uploadingFoto,   setUploadingFoto]   = useState(false);
  const [uploadingGaleria, setUploadingGaleria] = useState(false);

  // Busca
  const [busca, setBusca] = useState("");

  // Detalhe
  const [detalhando, setDetalhando] = useState<Imovel|null>(null);
  const [detalheTab, setDetalheTab] = useState<"ficha"|"galeria"|"zoneamento"|"docs"|"encargos">("ficha");
  const docsQ = trpc.patrimonio.documentos.listar.useQuery(
    { imovelId: detalhando?.id ?? 0, companyId },
    { enabled: !!detalhando && companyId > 0 }
  );
  const pagamentosQ = trpc.patrimonio.pagamentos.listar.useQuery(
    { imovelId: detalhando?.id ?? 0, companyId },
    { enabled: !!detalhando && companyId > 0 }
  );
  const criarPagMut = trpc.patrimonio.pagamentos.criar.useMutation({
    onSuccess: () => { utils.patrimonio.pagamentos.listar.invalidate(); utils.patrimonio.listar.invalidate(); },
  });
  const marcarPagoMut = trpc.patrimonio.pagamentos.marcarPago.useMutation({
    onSuccess: () => { utils.patrimonio.pagamentos.listar.invalidate(); utils.patrimonio.listar.invalidate(); },
  });
  const excluirPagMut = trpc.patrimonio.pagamentos.excluir.useMutation({
    onSuccess: () => { utils.patrimonio.pagamentos.listar.invalidate(); utils.patrimonio.listar.invalidate(); },
  });

  // ── Avaliação de Mercado ──
  const avaliarMercadoMut = trpc.patrimonio.avaliarMercado.useMutation();
  const [avaliandoId, setAvaliandoId] = useState<number|null>(null);
  const [avaliacaoModal, setAvaliacaoModal] = useState<Imovel|null>(null);
  const [avaliacaoResult, setAvaliacaoResult] = useState<any|null>(null);
  const fecharAvaliacao = () => { setAvaliacaoModal(null); setAvaliacaoResult(null); setAvaliandoId(null); };

  const [pagForm, setPagForm] = useState({ tipo: "iptu" as string, descricao: "", valor: "", dataVencimento: "" });
  const [pagando, setPagando] = useState<number|null>(null);
  const [dataPagInput, setDataPagInput] = useState("");
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const [progressoAnexo, setProgressoAnexo] = useState(0);

  const setF = <K extends keyof ImovelForm>(k: K, v: ImovelForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // IPTU alert
  const hoje = new Date();
  const iptuAlerta = imoveis.filter((im) => {
    if (!im.iptuVencimento) return false;
    const diff = (new Date(im.iptuVencimento).getTime() - hoje.getTime()) / 86400000;
    return diff >= 0 && diff <= 30;
  });

  /* ── Abrir form ── */
  function abrirForm(im?: Imovel) {
    if (im) {
      setEditando(im);
      const { id, companyId: _, createdAt, totalDocs, fotoCapaKey, ...rest } = im;
      setForm(rest);
    } else {
      setEditando(null);
      setForm(emptyForm());
    }
    setResultadoDoc(null); setPendingDocs([]);
    setResultadoPD(null);  setPendingPD(null);
    setProgressoDoc(0); setProgressoPD(0);
    setFinOpen(false);
    setRendaOpen(false);
    setDialogOpen(true);
  }

  /* ── Helper: progresso simulado ── */
  function startProgress(setter: (v: number) => void) {
    setter(0);
    const iv = setInterval(() => {
      setter((prev) => {
        if (prev >= 90) { clearInterval(iv); return 90; }
        return Math.min(prev + (prev < 40 ? 6 : prev < 70 ? 3 : 1), 90);
      });
    }, 400);
    return iv;
  }

  /* ── Leitura IA: Escritura ── */
  async function onPickDoc(files: FileList) {
    const lista = Array.from(files);
    if (!lista.length) return;
    setLendoDoc(true);
    setProgressoDoc(0);
    let totalCampos = 0;
    const tipoMap: Record<string,string> = {
      escritura:"escritura", contrato_compra_venda:"contrato",
      matricula:"matricula", boleto_iptu:"boleto_iptu", laudo:"laudo", outro:"outro",
    };
    const novos: { url: string; key: string; tipo: string; descricao: string }[] = [];
    let ultimoTitulo = "";
    try {
      for (const file of lista) {
        const b64 = await toBase64(file);
        const res = await lerDocMut.mutateAsync({ companyId, base64: b64, contentType: file.type||"application/pdf", nomeOriginal: file.name });
        const campos: string[] = [];
        setForm((prev) => {
          const next = { ...prev };
          function ts<K extends keyof ImovelForm>(k: K, v: ImovelForm[K], l: string) {
            if (v != null && v !== "" && !prev[k]) { (next as any)[k] = v; campos.push(l); }
          }
          ts("nome", res.nome as any, "Nome");
          ts("tipo", res.tipo as any, "Tipo");
          ts("logradouro", res.logradouro, "Logradouro");
          ts("numero", res.numero, "Número");
          ts("complemento", res.complemento, "Complemento");
          ts("bairro", res.bairro, "Bairro");
          ts("cidade", res.cidade, "Cidade");
          ts("estado", res.estado, "UF");
          ts("cep", res.cep, "CEP");
          ts("areaTotal", res.areaTotal as any, "Área total");
          ts("areaConstruida", res.areaConstruida as any, "Área construída");
          ts("matricula", res.matricula, "Matrícula");
          ts("livro", res.livro, "Livro");
          ts("folha", res.folha, "Folha");
          ts("tabelionato", res.tabelionato, "Tabelionato");
          ts("cidadeCartorio", res.cidadeCartorio, "Cidade cartório");
          ts("dataEscritura", res.dataEscritura, "Data escritura");
          ts("numeroRegistro", res.numeroRegistro, "Nº registro");
          ts("vendedores", res.vendedores, "Vendedor(es)");
          ts("compradores", res.compradores, "Comprador(es)");
          ts("itbiValor", res.itbiValor as any, "ITBI");
          ts("dataCompra", res.dataCompra, "Data compra");
          ts("valorCompra", res.valorCompra as any, "Valor compra");
          ts("valorVenal", res.valorVenal as any, "Valor venal");
          ts("iptuValor", res.iptuValor as any, "IPTU");
          ts("iptuVencimento", res.iptuVencimento, "Vencimento IPTU");
          ts("cadastroPrefeitura", res.cadastroPrefeitura, "Cadastro Prefeitura");
          ts("inscricaoMunicipal", res.inscricaoMunicipal, "Inscrição Municipal");
          ts("financiamentoBanco", res.financiamentoBanco, "Banco");
          if (res.observacoes && !prev.observacoes) { next.observacoes = res.observacoes; campos.push("Observações"); }
          // Sócios/proprietários extraídos pela IA
          const aiSocios = (res as any).sociosProprietarios as {nome:string;cpf:string}[]|undefined;
          if (aiSocios?.length && (!(prev.sociosJson||[]).length || !(prev.sociosJson||[]).some(s=>s.nome))) {
            const extracted: SocioEntry[] = aiSocios.slice(0,2)
              .map(p=>({ nome:p.nome||"", cpf:p.cpf||"", doc:null as string|null }))
              .filter(p=>!!p.nome);
            if (extracted.length) {
              (next as any).ownerType = "socio";
              (next as any).sociosJson = extracted;
              campos.push(`Proprietário${extracted.length>1?"s":""} (IA)`);
            }
          }
          return next;
        });
        totalCampos += campos.length;
        novos.push({ url: res.arquivoUrl, key: res.arquivoKey, tipo: tipoMap[res.tipoDocumento]||"outro", descricao: file.name.slice(0,100) });
        ultimoTitulo = `Documento lido: ${res.tipoDocumento.replace(/_/g," ")}`;
        setProgressoDoc(Math.round((novos.length / lista.length) * 100));
      }
      setPendingDocs(prev => [...prev, ...novos]);
      setResultadoDoc({ campos: [], titulo: lista.length > 1 ? `${lista.length} documentos lidos — ${totalCampos} campos preenchidos` : ultimoTitulo, arquivoUrl: novos[0]?.url });
      toast.success(totalCampos > 0 ? `IA preencheu ${totalCampos} campo${totalCampos>1?"s":""} com ${lista.length} documento${lista.length>1?"s":""}.` : "Lidos — nenhum campo reconhecido.");
    } catch (e: any) {
      setProgressoDoc(0);
      toast.error(e?.message || "Falha na leitura.");
    } finally { setLendoDoc(false); }
  }

  /* ── Leitura IA: Plano Diretor ── */
  async function onPickPD(files: FileList) {
    const lista = Array.from(files);
    if (!lista.length) return;
    setLendoPD(true);
    setProgressoPD(0);
    let totalCampos = 0;
    let processados = 0;
    try {
      for (const file of lista) {
        const b64 = await toBase64(file);
        const res = await lerPDMut.mutateAsync({
          companyId, base64: b64, contentType: file.type||"application/pdf",
          municipio: form.cidade || undefined,
        });
        const campos: string[] = [];
        setForm((prev) => {
          const next = { ...prev };
          function ts<K extends keyof ImovelForm>(k: K, v: ImovelForm[K], l: string) {
            if (v != null && v !== "") { (next as any)[k] = v; campos.push(l); }
          }
          ts("zoneamento", res.zoneamento, "Zoneamento");
          ts("planoDiretorMunicipio", res.municipio, "Município");
          ts("usoPermitido", res.usoPermitido, "Usos permitidos");
          ts("coefAproveitamentoBasico", res.coefAproveitamentoBasico as any, "CA Básico");
          ts("coefAproveitamentoMaximo", res.coefAproveitamentoMaximo as any, "CA Máximo");
          ts("taxaOcupacao", res.taxaOcupacao as any, "Taxa Ocupação");
          ts("taxaPermeabilidade", res.taxaPermeabilidade as any, "Permeabilidade");
          ts("gabaritoMaximo", res.gabaritoMaximo, "Gabarito");
          ts("recuoFrontal", res.recuoFrontal as any, "Recuo Frontal");
          ts("recuoLateral", res.recuoLateral as any, "Recuo Lateral");
          ts("recuoFundos", res.recuoFundos as any, "Recuo Fundos");
          ts("observacoesZoneamento", res.observacoesZoneamento, "Obs. Zoneamento");
          (next as any).planoDiretorUrl = res.arquivoUrl;
          return next;
        });
        totalCampos += campos.length;
        processados++;
        setPendingPD({ url: res.arquivoUrl, key: res.arquivoKey });
        setResultadoPD({ campos, titulo: `Plano Diretor lido: ${res.municipio || "—"}`, arquivoUrl: res.arquivoUrl });
        setProgressoPD(Math.round((processados / lista.length) * 100));
      }
      toast.success(totalCampos > 0 ? `IA extraiu ${totalCampos} parâmetro${totalCampos>1?"s":""} urbanístico${totalCampos>1?"s":""}${lista.length>1?` de ${lista.length} arquivos`:""}.` : "Lido — nenhum parâmetro reconhecido.");
    } catch (e: any) {
      setProgressoPD(0);
      toast.error(e?.message || "Falha na leitura do Plano Diretor.");
    } finally { setLendoPD(false); }
  }

  /* ── Galeria: upload foto/vídeo ── */
  async function onPickGaleria(files: FileList) {
    if (!detalhando) return;
    setUploadingGaleria(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 100_000_000) { toast.error(`${file.name}: máx. 100 MB.`); continue; }
        const isVideo = file.type.startsWith("video/");
        const b64 = await toBase64(file);
        const { url, key } = await uploadDocMut.mutateAsync({
          companyId, imovelId: detalhando.id, base64: b64,
          contentType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
          nomeOriginal: file.name,
        });
        await criarDocMut.mutateAsync({
          imovelId: detalhando.id, companyId,
          tipo: isVideo ? "video" : "foto",
          descricao: file.name.slice(0, 100),
          arquivoUrl: url, arquivoKey: key,
        });
        ok++;
      }
      if (ok > 0) toast.success(`${ok} arquivo${ok > 1 ? "s adicionados" : " adicionado"}.`);
    } catch { toast.error("Falha ao enviar arquivo."); }
    finally { setUploadingGaleria(false); }
  }

  /* ── Foto capa ── */
  async function onPickFoto(file: File) {
    if (file.size > 10_000_000) { toast.error("Máx. 10 MB."); return; }
    setUploadingFoto(true);
    try {
      const b64 = await toBase64(file);
      const { url } = await uploadFotoMut.mutateAsync({ companyId, base64: b64, contentType: file.type||"image/jpeg" });
      setF("fotoCapaUrl", url);
      toast.success("Foto carregada.");
    } catch { toast.error("Falha ao carregar foto."); }
    finally { setUploadingFoto(false); }
  }

  /* ── Anexar docs no detalhe (suporta múltiplos) ── */
  async function onPickAnexo(files: FileList) {
    if (!detalhando || files.length === 0) return;
    const lista = Array.from(files);
    setUploadingAnexo(true);
    setProgressoAnexo(0);
    let ok = 0, fail = 0;
    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      try {
        const b64 = await toBase64(file);
        const { url, key } = await uploadDocMut.mutateAsync({ companyId, imovelId: detalhando.id, base64: b64, contentType: file.type||"application/octet-stream" });
        await criarDocMut.mutateAsync({ imovelId: detalhando.id, companyId, tipo: "outro", descricao: file.name.slice(0,100), arquivoUrl: url, arquivoKey: key });
        ok++;
      } catch { fail++; }
      setProgressoAnexo(Math.round(((i + 1) / lista.length) * 100));
    }
    if (ok)   toast.success(`${ok} documento${ok>1?"s":""} anexado${ok>1?"s":""}.`);
    if (fail) toast.error(`${fail} arquivo${fail>1?"s":""} falharam.`);
    setUploadingAnexo(false);
    setProgressoAnexo(0);
  }

  /* ── Salvar ── */
  async function salvar() {
    if (!form.nome.trim()) { toast.error("Informe o nome/apelido."); return; }
    setSalvando(true);
    try {
      let targetId: number;
      if (editando) {
        await atualizarMut.mutateAsync({ id: editando.id, companyId, ...form });
        targetId = editando.id;
        toast.success("Imóvel atualizado.");
      } else {
        const { id } = await criarMut.mutateAsync({ companyId, ...form });
        targetId = id;
        toast.success("Imóvel cadastrado.");
      }
      for (const pd of pendingDocs) {
        await criarDocMut2.mutateAsync({ imovelId: targetId, companyId, tipo: pd.tipo as any, descricao: pd.descricao||null, arquivoUrl: pd.url, arquivoKey: pd.key }).catch(()=>{});
      }
      setDialogOpen(false);
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar."); }
    finally { setSalvando(false); }
  }

  /* ── Helpers ── */
  function toBase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]||"");
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  // Stats
  const totalInvestido = imoveis.reduce((s,im)=>s+(im.valorCompra||0),0);
  const portfolioComercial = imoveis.reduce((s,im)=>s+(im.valorComercial||im.valorCompra||0),0);
  const imoveisFiltrados = imoveis.filter((im) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return im.nome.toLowerCase().includes(q) || (im.cidade||"").toLowerCase().includes(q) || (im.tipo||"").toLowerCase().includes(q);
  });
  const enderecoDetalhe = detalhando ? fullEndereco(detalhando) : "";

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <DashboardLayout>
    <div className="p-4 md:p-6 space-y-5" onClick={() => setActiveModule("patrimonio")}>

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-[#0c2340] via-[#0f3460] to-[#1a4a7a] rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Landmark className="h-6 w-6 text-sky-300" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Patrimônio Imobiliário</h1>
            <p className="text-sky-300 text-xs">Gestão de imóveis, documentos e valores do grupo.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { l:"Total de imóveis", v: String(imoveis.length) },
            { l:"Total investido",  v: brl(totalInvestido) },
            { l:"Portfólio comercial", v: brl(portfolioComercial) },
            { l:"IPTU vencendo", v: String(iptuAlerta.length), alert: iptuAlerta.length>0 },
          ].map((s) => (
            <div key={s.l} className={`rounded-xl px-3 py-2.5 ${s.alert ? "bg-amber-400/20 border border-amber-400/30" : "bg-white/10"}`}>
              <p className="text-[10px] font-medium text-sky-200 uppercase tracking-wide">{s.l}</p>
              <p className={`text-lg font-bold ${s.alert ? "text-amber-300" : "text-white"}`}>{s.v}</p>
            </div>
          ))}
        </div>
        {iptuAlerta.length > 0 && (
          <div className="mt-3 bg-amber-400/10 border border-amber-400/30 rounded-xl px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300 flex-shrink-0" />
            <p className="text-xs text-amber-200">
              IPTU vencendo: <span className="font-medium">{iptuAlerta.map(im=>im.nome).join(" · ")}</span>
            </p>
          </div>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            placeholder="Buscar por nome, cidade, tipo…" value={busca} onChange={e=>setBusca(e.target.value)} />
        </div>
        <Button onClick={()=>abrirForm()} className="bg-[#0f3460] hover:bg-[#0c2340] text-white gap-2">
          <Plus className="h-4 w-4" /> Adicionar imóvel
        </Button>
      </div>

      {/* ── Cards ── */}
      {listarQ.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>
      ) : imoveisFiltrados.length === 0 ? (
        <div className="text-center py-20 text-slate-400 space-y-2">
          <Building2 className="h-12 w-12 mx-auto opacity-25" />
          <p className="text-sm">Nenhum imóvel cadastrado ainda.</p>
          <Button size="sm" variant="outline" onClick={()=>abrirForm()}>
            <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro imóvel
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {imoveisFiltrados.map((im) => {
            const end = fullEndereco(im);
            const difValor = im.valorComercial && im.valorCompra ? im.valorComercial - im.valorCompra : null;
            const difPct   = difValor != null && im.valorCompra ? (difValor/im.valorCompra*100) : null;
            const diasIptu = im.iptuVencimento ? Math.ceil((new Date(im.iptuVencimento).getTime()-hoje.getTime())/86400000) : null;
            const alertaIptu = diasIptu!=null && diasIptu>=0 && diasIptu<=30;
            const diasFin = im.financiamentoVencimento
              ? Math.ceil((new Date(im.financiamentoVencimento).getTime()-hoje.getTime())/86400000)
              : null;
            const parcelasPct = im.financiamentoNumeroParcelas && (im.financiamentoParcelasPagas??0)>=0
              ? Math.min(100,Math.round((im.financiamentoParcelasPagas??0)/im.financiamentoNumeroParcelas*100))
              : null;
            return (
              <div key={im.id}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer"
                onClick={()=>{ setDetalhando(im); setDetalheTab("ficha"); }}>
                {/* Status stripe */}
                <div className={`h-1.5 flex-shrink-0 ${STATUS_STRIPE[im.status]||"bg-slate-300"}`} />
                {/* Foto */}
                <div className="relative h-36 bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0 overflow-hidden">
                  {im.fotoCapaUrl
                    ? <img src={im.fotoCapaUrl} alt={im.nome} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="h-12 w-12 text-slate-300" />
                      </div>}
                  {/* Tipo + Status top-left */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border backdrop-blur-sm bg-white/85 text-slate-500 border-slate-200 leading-none">
                      {TIPOS_LABEL[im.tipo]||im.tipo}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm bg-white/85 leading-none ${STATUS_COLOR[im.status]||STATUS_COLOR.disponivel}`}>
                      {STATUS_LABEL[im.status]||im.status}
                    </span>
                  </div>
                  {/* Alerta encargo / IPTU */}
                  {(alertaIptu || im.encargoVencido) && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow">
                      <AlertTriangle className="h-2.5 w-2.5" />{im.encargoVencido?"Encargo":"IPTU"}
                    </div>
                  )}
                  {/* Valorização bottom-right */}
                  {difPct != null && (
                    <div className={`absolute bottom-2 right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm shadow ${difPct>=0?"bg-emerald-600/90":"bg-rose-600/90"}`}>
                      {difPct>=0?"+":""}{difPct.toFixed(1)}%
                    </div>
                  )}
                  {/* Zoneamento bottom-left */}
                  {im.zoneamento && (
                    <div className="absolute bottom-2 left-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full backdrop-blur-sm bg-white/80 text-slate-600 border border-slate-200 leading-none">
                      {im.zoneamento.split(" ")[0]}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 flex-1 flex flex-col gap-2.5">
                  <div>
                    <p className="text-sm font-bold text-slate-800 leading-snug line-clamp-2">{im.nome}</p>
                    {end && (
                      <p className="text-[11px] text-slate-500 flex items-start gap-1 mt-0.5 line-clamp-1">
                        <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0 text-slate-400" />{end}
                      </p>
                    )}
                  </div>

                  {/* Painel financiamento — imóvel financiado */}
                  {im.financiamentoParcela && (
                    <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wide leading-none">Parcela</p>
                          <p className="text-base font-bold text-blue-700 leading-tight mt-0.5">{brl(im.financiamentoParcela)}</p>
                        </div>
                        {im.financiamentoSaldoDevedor && (
                          <div className="text-right">
                            <p className="text-[9px] font-bold text-blue-400 uppercase tracking-wide leading-none">Saldo devedor</p>
                            <p className="text-sm font-bold text-blue-700 leading-tight mt-0.5">{brl(im.financiamentoSaldoDevedor)}</p>
                          </div>
                        )}
                      </div>
                      {parcelasPct != null && (
                        <div className="space-y-0.5">
                          <div className="flex justify-between">
                            <span className="text-[9px] text-blue-500">{im.financiamentoParcelasPagas} de {im.financiamentoNumeroParcelas} pagas</span>
                            <span className="text-[9px] font-bold text-blue-600">{parcelasPct}%</span>
                          </div>
                          <div className="h-1.5 bg-blue-200 rounded-full overflow-hidden">
                            <div className="h-1.5 bg-blue-500 rounded-full" style={{width:`${parcelasPct}%`}} />
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {im.financiamentoTaxaAnual && (
                          <span className="text-[10px] font-semibold text-blue-600 flex items-center gap-0.5">
                            <Percent className="h-3 w-3" />{im.financiamentoTaxaAnual}% a.a.{im.financiamentoIndice&&` + ${im.financiamentoIndice}`}
                          </span>
                        )}
                        {diasFin != null && diasFin > 0 && (
                          <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${diasFin<=90?"text-red-600":"text-blue-500"}`}>
                            <Clock className="h-3 w-3" />
                            {diasFin>365?`${Math.floor(diasFin/365)}a ${Math.floor((diasFin%365)/30)}m`:`${diasFin}d`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Painel renda mensal — imóvel locado */}
                  {!im.financiamentoParcela && im.geraRenda && im.rendaMensal && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wide leading-none">Renda mensal</p>
                        <p className="text-base font-bold text-emerald-700 leading-tight mt-0.5">{brl(im.rendaMensal)}</p>
                      </div>
                      {im.rendaContratoFim && (()=>{
                        const d=Math.ceil((new Date(im.rendaContratoFim!).getTime()-hoje.getTime())/86400000);
                        return (
                          <div className="text-right">
                            <p className="text-[9px] font-bold text-emerald-400 uppercase leading-none">Contrato</p>
                            <p className={`text-xs font-bold mt-0.5 ${d<30?"text-red-600":"text-emerald-600"}`}>{d<=0?"Vencido":`${d}d restantes`}</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Valores e área */}
                  <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                    {im.valorCompra && (
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">{brl(im.valorCompra)}</span>
                    )}
                    {im.valorComercial && im.valorComercial !== im.valorCompra && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${difValor!=null&&difValor>=0?"bg-emerald-50 border-emerald-200 text-emerald-700":"bg-rose-50 border-rose-200 text-rose-600"}`}>
                        {difValor!=null&&difValor>=0?"+":""}{difPct!=null?`${difPct.toFixed(1)}%`:"—"}
                      </span>
                    )}
                    {im.areaTotal && (
                      <span className="text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">{areaFmt(im.areaTotal)}</span>
                    )}
                    {im.dataEscritura && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
                        <BadgeCheck className="h-2.5 w-2.5"/>Escritura
                      </span>
                    )}
                    {im.totalDocs>0 && (
                      <span className="ml-auto text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full font-medium text-slate-500">
                        {im.totalDocs} doc{im.totalDocs>1?"s":""}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs"
                      onClick={e=>{e.stopPropagation(); abrirForm(im);}}>
                      <Pencil className="h-3 w-3 mr-1" />Editar
                    </Button>
                    <Button size="sm" variant="outline"
                      title="Avaliar valor de mercado (busca online + IA)"
                      className="h-7 w-7 p-0 text-sky-500 hover:text-sky-700 hover:border-sky-300 hover:bg-sky-50"
                      disabled={avaliandoId === im.id}
                      onClick={e=>{
                        e.stopPropagation();
                        setAvaliandoId(im.id);
                        setAvaliacaoResult(null);
                        setAvaliacaoModal(im);
                        avaliarMercadoMut.mutate({ imovelId: im.id, companyId }, {
                          onSuccess: (r) => { setAvaliacaoResult(r); setAvaliandoId(null); },
                          onError: (err: any) => { toast.error("Erro: " + err.message); fecharAvaliacao(); },
                        });
                      }}>
                      {avaliandoId === im.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Globe className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="outline"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:border-red-300"
                      onClick={e=>{
                        e.stopPropagation();
                        if(confirm(`Excluir "${im.nome}"?`)) excluirMut.mutate({id:im.id,companyId});
                      }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════
          DIALOG: Cadastrar / Editar
          ═══════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">

          {/* ── Top bar ── */}
          <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0 bg-[#0f3460]">
            <div className="flex items-center gap-3 min-w-0">
              <Building2 className="h-4 w-4 text-white/60 flex-shrink-0" />
              <div className="min-w-0">
                <DialogTitle className="text-sm font-semibold text-white leading-none tracking-wide">
                  {editando ? "Editar imóvel" : "Cadastrar imóvel"}
                </DialogTitle>
                {form.nome && (
                  <p className="text-[11px] text-white/50 mt-0.5 leading-none truncate max-w-sm">{form.nome}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm"
                className="text-white/70 hover:text-white hover:bg-white/10 border border-white/20"
                onClick={()=>setDialogOpen(false)}>Cancelar</Button>
              <Button size="sm"
                className="bg-white text-[#0f3460] hover:bg-blue-50 font-semibold shadow-none"
                disabled={salvando} onClick={salvar}>
                {salvando?<><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5"/>Salvando…</>:editando?"Salvar alterações":"Cadastrar"}
              </Button>
            </div>
          </div>

          {/* ── Body: sidebar + content ── */}
          <div className="flex flex-row flex-1 min-h-0">

            {/* ── Left sidebar ── */}
            <div className="w-48 border-r border-blue-900/30 bg-[#0f3460] flex-shrink-0 flex flex-col overflow-y-auto">

              {/* AI Tools */}
              <div className="px-3 pt-3 pb-2.5 border-b border-white/10 space-y-1.5">
                <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest px-1 mb-1">Ferramentas IA</p>
                <button type="button" disabled={lendoDoc}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/10 border border-white/20 text-sky-200 text-xs font-medium hover:bg-white/15 disabled:opacity-50 transition-colors"
                  onClick={()=>{ if(docRef.current){docRef.current.value=""; docRef.current.click();} }}>
                  {lendoDoc
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                    : <FileText className="h-3.5 w-3.5 flex-shrink-0 text-sky-300" />}
                  <span className="flex-1 text-left leading-snug">Ler escritura</span>
                  {lendoDoc && <span className="text-[10px] font-bold">{progressoDoc}%</span>}
                  {resultadoDoc && !lendoDoc && <CheckCircle2 className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" />}
                </button>
                <button type="button" disabled={lendoPD}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/10 border border-white/20 text-blue-200 text-xs font-medium hover:bg-white/15 disabled:opacity-50 transition-colors"
                  onClick={()=>{ if(pdRef.current){pdRef.current.value=""; pdRef.current.click();} }}>
                  {lendoPD
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                    : <Map className="h-3.5 w-3.5 flex-shrink-0 text-blue-300" />}
                  <span className="flex-1 text-left leading-snug">Plano Diretor</span>
                  {lendoPD && <span className="text-[10px] font-bold">{progressoPD}%</span>}
                  {resultadoPD && !lendoPD && <CheckCircle2 className="h-3.5 w-3.5 text-blue-300 flex-shrink-0" />}
                </button>
              </div>

              {/* Section nav */}
              <nav className="flex-1 px-2 py-2 space-y-0.5">
                {([
                  { id:"identificacao", label:"Identificação",  icon:Building2,  ok: !!form.nome },
                  { id:"proprietario",  label:"Proprietário",   icon:UserRound,   ok: form.ownerType==="socio" },
                  { id:"dimensoes",     label:"Dimensões",      icon:Ruler,       ok: !!(form.terrenoLargura||form.areaConstruida) },
                  { id:"cartorio",      label:"Cartório",       icon:BookOpen,    ok: !!form.matricula },
                  { id:"localizacao",   label:"Localização",    icon:MapPin,      ok: !!form.logradouro },
                  { id:"valores",       label:"Valores",        icon:DollarSign,  ok: !!(form.valorCompra||form.valorComercial) },
                  { id:"iptu",          label:"IPTU",           icon:Receipt,     ok: !!form.iptuValor },
                  { id:"renda",         label:"Renda Mensal",   icon:TrendingUp,  ok: form.geraRenda },
                  { id:"financiamento", label:"Financiamento",  icon:Landmark,    ok: !!form.financiamentoBanco },
                  { id:"zoneamento",    label:"Zoneamento",     icon:Layers,      ok: !!form.zoneamento },
                  { id:"observacoes",   label:"Observações",    icon:FileText,    ok: !!form.observacoes },
                ] as const).map(s=>(
                  <button key={s.id} type="button"
                    onClick={()=>{
                      rightPanelRef.current?.querySelector(`#fs-${s.id}`)?.scrollIntoView({behavior:"smooth",block:"start"});
                      setFormActiveSection(s.id);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      formActiveSection===s.id
                        ? "bg-white/20 text-white"
                        : "text-white/60 hover:bg-white/10 hover:text-white"
                    }`}>
                    <s.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="flex-1 text-left">{s.label}</span>
                    {s.ok && <span className="h-1.5 w-1.5 rounded-full bg-blue-300 flex-shrink-0" />}
                  </button>
                ))}
              </nav>
            </div>

            {/* ── Right: scrollable form ── */}
            <div ref={rightPanelRef} className="flex-1 overflow-y-auto">
              {/* hidden inputs */}
              <input ref={docRef} type="file" className="hidden" multiple accept="image/*,application/pdf,.pdf"
                onChange={e => e.target.files && e.target.files.length > 0 && onPickDoc(e.target.files)} />
              <input ref={pdRef} type="file" className="hidden" multiple accept="application/pdf,.pdf,image/*"
                onChange={e => e.target.files && e.target.files.length > 0 && onPickPD(e.target.files)} />
              <input ref={fotoRef} type="file" className="hidden" accept="image/*"
                onChange={e => e.target.files?.[0] && onPickFoto(e.target.files[0])} />

              {/* AI result banners — compact, only visible when active */}
              {(lendoDoc||resultadoDoc||lendoPD||resultadoPD) && (
                <div className="px-6 pt-4 space-y-2">
                  {(lendoDoc||resultadoDoc) && (
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-sky-200">
                      {lendoDoc
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs text-sky-700 font-medium">Analisando escritura… {progressoDoc}%</p>
                              <div className="mt-1 h-1 bg-sky-100 rounded-full overflow-hidden">
                                <div className="h-1 bg-sky-500 rounded-full transition-all" style={{width:`${progressoDoc}%`}} />
                              </div>
                            </div>
                          </>
                        : <><CheckCircle2 className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />
                            <p className="text-xs text-sky-700 font-medium flex-1">{resultadoDoc!.titulo}</p>
                            {resultadoDoc!.arquivoUrl && (
                              <a href={resultadoDoc!.arquivoUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[11px] border border-slate-200 rounded px-2 py-0.5 bg-white hover:bg-slate-50 text-slate-600 flex items-center gap-1 flex-shrink-0">
                                <Eye className="h-3 w-3" /> Ver
                              </a>
                            )}
                            <button type="button" onClick={()=>setResultadoDoc(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
                          </>}
                    </div>
                  )}
                  {(lendoPD||resultadoPD) && (
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-emerald-200">
                      {lendoPD
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs text-emerald-700 font-medium">Lendo Plano Diretor… {progressoPD}%</p>
                              <div className="mt-1 h-1 bg-emerald-100 rounded-full overflow-hidden">
                                <div className="h-1 bg-emerald-500 rounded-full transition-all" style={{width:`${progressoPD}%`}} />
                              </div>
                            </div>
                          </>
                        : <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                            <p className="text-xs text-emerald-700 font-medium flex-1">{resultadoPD!.titulo}</p>
                            <button type="button" onClick={()=>setResultadoPD(null)} className="text-emerald-400 hover:text-emerald-600 flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
                          </>}
                    </div>
                  )}
                </div>
              )}

              <div className="px-6 py-4 space-y-1">

            {/* ══ Identificação ══ */}
            <SectionTitle id="fs-identificacao" icon={Building2} label="Identificação" color="navy" />
            <div className="flex items-center gap-3 mb-3">
              {form.fotoCapaUrl
                ? <img src={form.fotoCapaUrl} alt="capa" className="h-20 w-28 object-cover rounded-xl border border-slate-200 flex-shrink-0" />
                : <div className="h-20 w-28 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 flex-shrink-0">
                    <Building2 className="h-8 w-8" />
                  </div>}
              <div className="space-y-1.5">
                <Button size="sm" variant="outline" disabled={uploadingFoto} onClick={()=>fotoRef.current?.click()}>
                  {uploadingFoto?<Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/>:<Upload className="h-3.5 w-3.5 mr-1"/>}
                  {form.fotoCapaUrl?"Trocar foto":"Adicionar foto"}
                </Button>
                {form.fotoCapaUrl && <Button size="sm" variant="ghost" className="text-red-500 block" onClick={()=>setF("fotoCapaUrl",null)}>Remover</Button>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3 space-y-1">
                <Label>Nome / Apelido <span className="text-red-500">*</span></Label>
                <Input placeholder='Ex: "Terreno Rio Comprido" ou "Apto Centro SP"'
                  value={form.nome} onChange={e=>setF("nome",e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v=>setF("tipo",v)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{Object.entries(TIPOS_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v=>setF("status",v)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_LABEL).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Área total (m²)</Label>
                <Input type="number" min="0" step="0.01" value={numInput(form.areaTotal)}
                  onChange={e=>setF("areaTotal",parseNum(e.target.value))} />
              </div>
            </div>

            {/* ══ Proprietário ══ */}
            <SectionTitle id="fs-proprietario" icon={UserRound} label="Proprietário do Imóvel" color="indigo" />
            <div className="space-y-3">
              <div className="flex gap-2">
                {([["empresa","🏢  Empresa"],["socio","👤  Sócio / Pessoa Física"]] as const).map(([v,l])=>(
                  <button key={v} type="button"
                    className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                      form.ownerType===v
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    }`}
                    onClick={()=>{
                      setF("ownerType",v);
                      if(v==="empresa") setF("sociosJson",[]);
                      if(v==="socio" && (!form.sociosJson||form.sociosJson.length===0))
                        setF("sociosJson",[{nome:"",cpf:"",doc:null}]);
                    }}>
                    {l}
                  </button>
                ))}
              </div>
              {form.ownerType==="socio" && (
                <div className="space-y-2">
                  {(form.sociosJson||[]).map((s,idx)=>(
                    <div key={idx} className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {idx===0 ? "1º Proprietário" : "2º Proprietário"}
                        </span>
                        {(form.sociosJson||[]).length > 1 && (
                          <button type="button" className="text-red-400 hover:text-red-600 p-0.5 rounded transition-colors"
                            onClick={()=>setF("sociosJson",(form.sociosJson||[]).filter((_,i)=>i!==idx))}>
                            <X className="h-3.5 w-3.5"/>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <SocioCombobox
                          value={s}
                          socios={sociosQ.data||[]}
                          onChange={updated=>setF("sociosJson",(form.sociosJson||[]).map((x,i)=>i===idx?updated:x))}
                        />
                        <div className="space-y-1">
                          <Label>CPF</Label>
                          <Input placeholder="000.000.000-00" value={s.cpf}
                            onChange={e=>setF("sociosJson",(form.sociosJson||[]).map((x,i)=>i===idx?{...x,cpf:e.target.value}:x))} />
                        </div>
                        <div className="sm:col-span-3 space-y-1">
                          <Label>Documento complementar (RG, outro)</Label>
                          <Input placeholder="Ex: RG 12.345.678-9 SSP/SP" value={s.doc||""}
                            onChange={e=>setF("sociosJson",(form.sociosJson||[]).map((x,i)=>i===idx?{...x,doc:e.target.value||null}:x))} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {(form.sociosJson||[]).length < 2 && (
                    <button type="button"
                      className="w-full py-2 rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-400 hover:border-sky-300 hover:text-sky-600 transition-colors flex items-center justify-center gap-1.5"
                      onClick={()=>setF("sociosJson",[...(form.sociosJson||[]),{nome:"",cpf:"",doc:null}])}>
                      <Plus className="h-3.5 w-3.5"/> Adicionar 2º sócio / proprietário
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ══ Dimensões do Terreno / Lote ══ */}
            <SectionTitle id="fs-dimensoes" icon={Maximize2} label="Dimensões do Terreno / Lote"
              color="sky" badge={form.terrenoLargura||form.terrenoComprimento ? "ok" : undefined} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>Largura (m)</Label>
                <Input type="number" min="0" step="0.01" placeholder="Ex: 12"
                  value={numInput(form.terrenoLargura)}
                  onChange={e=>setF("terrenoLargura",parseNum(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Comprimento (m)</Label>
                <Input type="number" min="0" step="0.01" placeholder="Ex: 30"
                  value={numInput(form.terrenoComprimento)}
                  onChange={e=>setF("terrenoComprimento",parseNum(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Frentes</Label>
                <Select value={String(form.terrenoFrente??"")}
                  onValueChange={v=>setF("terrenoFrente",v?Number(v):null)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4].map(n=>(
                      <SelectItem key={n} value={String(n)}>{n} frente{n>1?"s":""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Área total (m²)</Label>
                <Input type="number" min="0" step="0.01"
                  value={numInput(form.areaTotal)}
                  onChange={e=>setF("areaTotal",parseNum(e.target.value))} />
              </div>
            </div>
            {/* Calculadora L × C */}
            {!!(form.terrenoLargura && form.terrenoComprimento) && (() => {
              const calc = +(form.terrenoLargura! * form.terrenoComprimento!).toFixed(2);
              const match = form.areaTotal != null && Math.abs(form.areaTotal - calc) < 1;
              return (
                <div className={`rounded-xl px-4 py-2.5 flex items-center gap-3 ${
                  match ? "bg-emerald-50 border border-emerald-200" : "bg-indigo-50 border border-indigo-200"
                }`}>
                  <Ruler className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                  <span className="text-sm text-indigo-700">
                    {form.terrenoLargura} m × {form.terrenoComprimento} m ={" "}
                    <strong>{calc.toLocaleString("pt-BR")} m²</strong>
                  </span>
                  {match
                    ? <div className="ml-auto flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Área confirmada
                      </div>
                    : <button type="button" className="ml-auto text-xs font-semibold text-indigo-600 underline"
                        onClick={()=>setF("areaTotal",calc)}>
                        Usar como área total
                      </button>}
                </div>
              );
            })()}

            {/* ══ Situação Construtiva ══ */}
            <SectionTitle id="fs-construtiva" icon={Home} label="Situação Construtiva"
              color="blue" badge={form.imovelAverbado ? "ok" : undefined} />
            <div className="space-y-3">
              {/* Toggle averbado */}
              <button type="button"
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-colors ${
                  form.imovelAverbado
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                }`}
                onClick={()=>setF("imovelAverbado",!form.imovelAverbado)}>
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${form.imovelAverbado?"bg-emerald-100":"bg-slate-100"}`}>
                    <Home className={`h-4 w-4 ${form.imovelAverbado?"text-emerald-600":"text-slate-400"}`} />
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-semibold ${form.imovelAverbado?"text-emerald-700":"text-slate-600"}`}>
                      {form.imovelAverbado?"Tem imóvel averbado na matrícula":"Sem imóvel averbado"}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {form.imovelAverbado
                        ? "Construção registrada no Cartório de Imóveis"
                        : "Apenas o terreno / lote está registrado"}
                    </p>
                  </div>
                </div>
                {form.imovelAverbado
                  ? <ToggleRight className="h-6 w-6 text-emerald-500 flex-shrink-0" />
                  : <ToggleLeft  className="h-6 w-6 text-slate-300 flex-shrink-0" />}
              </button>
              {form.imovelAverbado && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Área averbada (m²)</Label>
                    <Input type="number" min="0" step="0.01" placeholder="Ex: 120"
                      value={numInput(form.areaAverbada)}
                      onChange={e=>setF("areaAverbada",parseNum(e.target.value))} /></div>
                  <div className="space-y-1"><Label>Ano de construção</Label>
                    <Input type="number" min="1800" max={new Date().getFullYear()} placeholder="Ex: 2005"
                      value={numInput(form.anoConstrucao)}
                      onChange={e=>setF("anoConstrucao",parseNum(e.target.value))} /></div>
                </div>
              )}
              {!form.imovelAverbado && form.tipo !== "terreno" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    Tipo é <strong>{TIPOS_LABEL[form.tipo]}</strong> mas sem averbação — confirme se a construção está registrada no cartório.
                  </p>
                </div>
              )}
            </div>

            {/* ══ Dados Cartoriais ══ */}
            <SectionTitle id="fs-cartorio" icon={BookOpen} label="Dados Cartoriais / Escritura"
              color="royal" badge={form.matricula && form.dataEscritura ? "ok" : form.matricula ? "warn" : undefined} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Matrícula (CRI)</Label>
                <Input placeholder="Nº da matrícula" value={form.matricula||""} onChange={e=>setF("matricula",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Data da escritura</Label>
                <Input type="date" value={form.dataEscritura||""} onChange={e=>setF("dataEscritura",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Nº Registro</Label>
                <Input placeholder="Protocolo cartório" value={form.numeroRegistro||""} onChange={e=>setF("numeroRegistro",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Livro</Label>
                <Input placeholder="Ex: 837" value={form.livro||""} onChange={e=>setF("livro",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Folha / Págs</Label>
                <Input placeholder="Ex: 115/119" value={form.folha||""} onChange={e=>setF("folha",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>ITBI pago (R$)</Label>
                <MoneyInput value={form.itbiValor} onChange={v=>setF("itbiValor",v)}/></div>
              <div className="col-span-2 space-y-1"><Label>Tabelionato / Cartório</Label>
                <Input placeholder="Ex: 2º Tabelião de Notas de Guaratinguetá" value={form.tabelionato||""} onChange={e=>setF("tabelionato",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Cidade do cartório</Label>
                <Input value={form.cidadeCartorio||""} onChange={e=>setF("cidadeCartorio",e.target.value||null)}/></div>
              <div className="col-span-full space-y-1"><Label>Vendedor(es)</Label>
                <Input placeholder="Nomes completos dos vendedores" value={form.vendedores||""} onChange={e=>setF("vendedores",e.target.value||null)}/></div>
              <div className="col-span-full space-y-1"><Label>Comprador(es)</Label>
                <Input placeholder="Nomes completos dos compradores" value={form.compradores||""} onChange={e=>setF("compradores",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Área construída (m²)</Label>
                <Input type="number" min="0" step="0.01" value={numInput(form.areaConstruida)} onChange={e=>setF("areaConstruida",parseNum(e.target.value))}/></div>
            </div>

            {/* ══ Localização ══ */}
            <SectionTitle id="fs-localizacao" icon={MapPin} label="Localização" color="cyan" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1"><Label>Logradouro</Label>
                <Input placeholder="Rua, Avenida, Estrada…" value={form.logradouro||""} onChange={e=>setF("logradouro",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Número</Label>
                <Input placeholder="S/N" value={form.numero||""} onChange={e=>setF("numero",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Complemento</Label>
                <Input placeholder="Ap, Bloco, Lote…" value={form.complemento||""} onChange={e=>setF("complemento",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Bairro</Label>
                <Input value={form.bairro||""} onChange={e=>setF("bairro",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Cidade</Label>
                <Input value={form.cidade||""} onChange={e=>setF("cidade",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>UF</Label>
                <Input placeholder="SP" maxLength={2} value={form.estado||""} onChange={e=>setF("estado",e.target.value.toUpperCase().slice(0,2)||null)}/></div>
              <div className="space-y-1"><Label>CEP</Label>
                <Input placeholder="00000-000" value={form.cep||""} onChange={e=>setF("cep",e.target.value||null)}/></div>
            </div>
            {(form.logradouro||form.cidade) && <MapEmbed address={fullEndereco(form as any)} />}

            {/* ══ Valores Financeiros ══ */}
            <SectionTitle id="fs-valores" icon={DollarSign} label="Valores Financeiros" color="cobalt" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Data de compra</Label>
                <Input type="date" value={form.dataCompra||""} onChange={e=>setF("dataCompra",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Valor de compra (R$)</Label>
                <MoneyInput value={form.valorCompra} onChange={v=>setF("valorCompra",v)}/></div>
              <div className="space-y-1"><Label>Valor venal (R$)</Label>
                <MoneyInput value={form.valorVenal} onChange={v=>setF("valorVenal",v)}/></div>
              <div className="space-y-1"><Label>Valor comercial atual (R$)</Label>
                <MoneyInput value={form.valorComercial} onChange={v=>setF("valorComercial",v)}/></div>
              <div className="col-span-2 sm:col-span-1 space-y-1"><Label>Valor pretendido de venda (R$)</Label>
                <MoneyInput value={form.valorVenda} onChange={v=>setF("valorVenda",v)}/></div>
            </div>
            {/* Indicador preço/m² em tempo real */}
            {form.areaTotal != null && form.areaTotal > 0 && (form.valorCompra||form.valorVenal||form.valorComercial) && (
              <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 flex flex-wrap gap-5">
                <div className="flex items-center gap-1.5 mr-2">
                  <SquareDashed className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Preço por m² · {areaFmt(form.areaTotal)}</span>
                </div>
                {form.valorCompra   && <div><p className="text-[10px] text-indigo-400 font-semibold uppercase">Compra</p>
                  <p className="text-sm font-bold text-indigo-700">{brl(form.valorCompra / form.areaTotal!)}</p></div>}
                {form.valorVenal    && <div><p className="text-[10px] text-indigo-400 font-semibold uppercase">Venal</p>
                  <p className="text-sm font-bold text-indigo-700">{brl(form.valorVenal / form.areaTotal!)}</p></div>}
                {form.valorComercial && <div><p className="text-[10px] text-indigo-400 font-semibold uppercase">Comercial</p>
                  <p className="text-sm font-bold text-indigo-700">{brl(form.valorComercial / form.areaTotal!)}</p></div>}
                {form.valorComercial && form.valorCompra && form.valorComercial > form.valorCompra && (
                  <div><p className="text-[10px] text-emerald-500 font-semibold uppercase">Valorização</p>
                    <p className="text-sm font-bold text-emerald-600">+{((form.valorComercial - form.valorCompra) / form.valorCompra * 100).toFixed(1)}%</p></div>
                )}
              </div>
            )}

            {/* ══ IPTU / Prefeitura ══ */}
            <SectionTitle id="fs-iptu" icon={Receipt} label="IPTU / Prefeitura" color="amber" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Valor do IPTU (R$)</Label>
                <MoneyInput value={form.iptuValor} onChange={v=>setF("iptuValor",v)}/></div>
              <div className="space-y-1"><Label>Vencimento</Label>
                <Input type="date" value={form.iptuVencimento||""} onChange={e=>setF("iptuVencimento",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Cadastro Prefeitura</Label>
                <Input placeholder="Ex: 09.128.006.04" value={form.cadastroPrefeitura||""} onChange={e=>setF("cadastroPrefeitura",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Inscrição Municipal</Label>
                <Input value={form.inscricaoMunicipal||""} onChange={e=>setF("inscricaoMunicipal",e.target.value||null)}/></div>
            </div>

            {/* ══ Renda Mensal (colapsável) ══ */}
            <div id="fs-renda" className="scroll-mt-3" />
            <button type="button" style={{ borderLeftColor:"#0284c7" }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-r-lg bg-sky-50 border-l-[3px] mt-6 mb-3 transition-colors hover:bg-sky-100"
              onClick={()=>{
                const next = !form.geraRenda;
                setF("geraRenda", next);
                setRendaOpen(next);
                if (next && form.status !== "locado") setF("status","locado");
              }}>
              <TrendingUp className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-sky-700 flex-1">Renda Mensal</span>
              {form.geraRenda && form.rendaMensal && (
                <span className="text-[10px] font-semibold text-sky-700 bg-white px-2 py-0.5 rounded-full border border-sky-200">
                  {brl(form.rendaMensal)}/mês
                </span>
              )}
              {!form.geraRenda && (
                <span className="text-[10px] text-sky-400 font-normal normal-case">— clique para ativar</span>
              )}
              {form.geraRenda
                ? <ToggleRight className="h-5 w-5 text-sky-500 flex-shrink-0" />
                : <ToggleLeft  className="h-5 w-5 text-sky-300 flex-shrink-0" />}
            </button>
            {form.geraRenda && (
              <div className="space-y-3 mb-2">
                {form.status !== "locado" && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-50 border border-sky-200">
                    <ArrowRight className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />
                    <p className="text-xs text-sky-700">
                      Status atualizado para <strong>Locado</strong> automaticamente.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1"><Label>Valor do aluguel (R$)</Label>
                    <MoneyInput value={form.rendaMensal} onChange={v=>setF("rendaMensal",v)}/></div>
                  <div className="space-y-1"><Label>Dia do vencimento</Label>
                    <Input type="number" min="1" max="31" placeholder="Ex: 10"
                      value={numInput(form.rendaDiaVencimento)}
                      onChange={e=>setF("rendaDiaVencimento",parseNum(e.target.value)?Math.round(parseNum(e.target.value)!):null)} /></div>
                  <div className="space-y-1 sm:col-span-1 col-span-2"><Label>Locatário / Inquilino</Label>
                    <Input placeholder="Nome completo" value={form.rendaLocatario||""}
                      onChange={e=>setF("rendaLocatario",e.target.value||null)}/></div>
                  <div className="space-y-1"><Label>Início do contrato</Label>
                    <Input type="date" value={form.rendaContratoInicio||""}
                      onChange={e=>setF("rendaContratoInicio",e.target.value||null)}/></div>
                  <div className="space-y-1"><Label>Fim do contrato</Label>
                    <Input type="date" value={form.rendaContratoFim||""}
                      onChange={e=>setF("rendaContratoFim",e.target.value||null)}/></div>
                  {form.rendaContratoFim && (() => {
                    const dias = Math.ceil((new Date(form.rendaContratoFim!).getTime() - Date.now()) / 86400000);
                    return dias < 90 ? (
                      <div className={`col-span-full flex items-center gap-2 px-3 py-2 rounded-lg border ${dias < 30?"bg-rose-50 border-rose-200":"bg-amber-50 border-amber-200"}`}>
                        <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 ${dias<30?"text-rose-500":"text-amber-500"}`} />
                        <p className={`text-xs font-semibold ${dias<30?"text-rose-700":"text-amber-700"}`}>
                          {dias <= 0 ? "Contrato vencido!" : `Contrato vence em ${dias} dia${dias!==1?"s":""}`}
                        </p>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            )}

            {/* ══ Zoneamento / Plano Diretor ══ */}
            <SectionTitle id="fs-zoneamento" icon={Layers} label="Zoneamento / Plano Diretor" color="deep" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-2 space-y-1"><Label>Zona / Zoneamento</Label>
                <Input placeholder="Ex: ZM-1 — Zona Mista de Baixa Densidade" value={form.zoneamento||""} onChange={e=>setF("zoneamento",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Município do Plano Diretor</Label>
                <Input placeholder="Cidade" value={form.planoDiretorMunicipio||""} onChange={e=>setF("planoDiretorMunicipio",e.target.value||null)}/></div>
              <div className="col-span-full space-y-1"><Label>Usos Permitidos</Label>
                <Input placeholder="Ex: Residencial, Comercial varejista, Serviços, Industrial nível I" value={form.usoPermitido||""} onChange={e=>setF("usoPermitido",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>CA Básico</Label>
                <Input type="number" min="0" step="0.1" placeholder="Ex: 1.5" value={numInput(form.coefAproveitamentoBasico)} onChange={e=>setF("coefAproveitamentoBasico",parseNum(e.target.value))}/></div>
              <div className="space-y-1"><Label>CA Máximo</Label>
                <Input type="number" min="0" step="0.1" placeholder="Ex: 3.0" value={numInput(form.coefAproveitamentoMaximo)} onChange={e=>setF("coefAproveitamentoMaximo",parseNum(e.target.value))}/></div>
              <div className="space-y-1"><Label>Gabarito Máximo</Label>
                <Input placeholder="Ex: 8 pav. ou 25m" value={form.gabaritoMaximo||""} onChange={e=>setF("gabaritoMaximo",e.target.value||null)}/></div>
              <div className="space-y-1"><Label>Taxa Ocupação (%)</Label>
                <Input type="number" min="0" max="100" step="1" placeholder="Ex: 60" value={numInput(form.taxaOcupacao)} onChange={e=>setF("taxaOcupacao",parseNum(e.target.value))}/></div>
              <div className="space-y-1"><Label>Permeabilidade (%)</Label>
                <Input type="number" min="0" max="100" step="1" placeholder="Ex: 20" value={numInput(form.taxaPermeabilidade)} onChange={e=>setF("taxaPermeabilidade",parseNum(e.target.value))}/></div>
              <div className="space-y-1"><Label>Recuo Frontal (m)</Label>
                <Input type="number" min="0" step="0.5" placeholder="Ex: 5" value={numInput(form.recuoFrontal)} onChange={e=>setF("recuoFrontal",parseNum(e.target.value))}/></div>
              <div className="space-y-1"><Label>Recuo Lateral (m)</Label>
                <Input type="number" min="0" step="0.5" placeholder="Ex: 1.5" value={numInput(form.recuoLateral)} onChange={e=>setF("recuoLateral",parseNum(e.target.value))}/></div>
              <div className="space-y-1"><Label>Recuo Fundos (m)</Label>
                <Input type="number" min="0" step="0.5" placeholder="Ex: 2" value={numInput(form.recuoFundos)} onChange={e=>setF("recuoFundos",parseNum(e.target.value))}/></div>
              <div className="col-span-full space-y-1"><Label>Observações urbanísticas</Label>
                <Textarea rows={2} placeholder="Outorga onerosa, EIV, IPTU progressivo, instrumentos de política urbana…"
                  value={form.observacoesZoneamento||""} onChange={e=>setF("observacoesZoneamento",e.target.value||null)}/></div>
            </div>

            {/* ══ Financiamento (colapsável) ══ */}
            <div id="fs-financiamento" className="scroll-mt-3" />
            <button type="button" style={{ borderLeftColor:"#334155" }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-r-lg bg-slate-100 border-l-[3px] mt-6 mb-3 transition-colors hover:bg-slate-200"
              onClick={()=>setFinOpen(v=>!v)}>
              <Landmark className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex-1">Financiamento</span>
              {finOpen?<ChevronUp className="h-4 w-4 text-slate-400"/>:<ChevronDown className="h-4 w-4 text-slate-400"/>}
            </button>
            {finOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-2">
                {/* Banco */}
                <div className="col-span-2 space-y-1"><Label>Banco / Financiadora</Label>
                  <Input placeholder="Ex: Caixa Econômica Federal" value={form.financiamentoBanco||""} onChange={e=>setF("financiamentoBanco",e.target.value||null)}/></div>
                {/* Data início */}
                <div className="space-y-1"><Label>Data de início</Label>
                  <Input type="date" value={form.financiamentoDataInicio||""} onChange={e=>setF("financiamentoDataInicio",e.target.value||null)}/></div>
                {/* Parcela */}
                <div className="space-y-1"><Label>Parcela mensal (R$)</Label>
                  <MoneyInput value={form.financiamentoParcela} onChange={v=>setF("financiamentoParcela",v)}/></div>
                {/* Saldo devedor */}
                <div className="space-y-1"><Label>Saldo devedor (R$)</Label>
                  <MoneyInput value={form.financiamentoSaldoDevedor} onChange={v=>setF("financiamentoSaldoDevedor",v)}/></div>
                {/* Vencimento final */}
                <div className="space-y-1"><Label>Vencimento final</Label>
                  <Input type="date" value={form.financiamentoVencimento||""} onChange={e=>setF("financiamentoVencimento",e.target.value||null)}/></div>
                {/* Taxa anual */}
                <div className="space-y-1">
                  <Label>Taxa anual (%)</Label>
                  <Input type="number" min="0" max="50" step="0.1" placeholder="Ex: 8.5"
                    value={form.financiamentoTaxaAnual != null ? String(form.financiamentoTaxaAnual) : ""}
                    onChange={e=>setF("financiamentoTaxaAnual", e.target.value ? Number(e.target.value) : null)} />
                </div>
                {/* Índice */}
                <div className="space-y-1">
                  <Label>Índice de correção</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.financiamentoIndice||""}
                    onChange={e=>setF("financiamentoIndice",e.target.value||null)}>
                    <option value="">Sem índice / Prefixado</option>
                    <option value="TR">TR</option>
                    <option value="IPCA">IPCA</option>
                    <option value="INPC">INPC</option>
                    <option value="TJLP">TJLP</option>
                    <option value="PREFIXADO">Prefixado</option>
                  </select>
                </div>
                {/* Parcelas totais */}
                <div className="space-y-1"><Label>Total de parcelas</Label>
                  <Input type="number" min="1" step="1" placeholder="Ex: 360"
                    value={form.financiamentoNumeroParcelas != null ? String(form.financiamentoNumeroParcelas) : ""}
                    onChange={e=>setF("financiamentoNumeroParcelas", e.target.value ? Math.round(Number(e.target.value)) : null)} /></div>
                {/* Parcelas pagas */}
                <div className="space-y-1"><Label>Parcelas pagas</Label>
                  <Input type="number" min="0" step="1" placeholder="Ex: 48"
                    value={form.financiamentoParcelasPagas != null ? String(form.financiamentoParcelasPagas) : ""}
                    onChange={e=>setF("financiamentoParcelasPagas", e.target.value ? Math.round(Number(e.target.value)) : null)} /></div>
                {/* Progress indicator */}
                {form.financiamentoNumeroParcelas && (form.financiamentoParcelasPagas??0)>=0 && (
                  <div className="col-span-full rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1.5">
                    {(() => {
                      const pct = Math.min(100,Math.round((form.financiamentoParcelasPagas??0)/form.financiamentoNumeroParcelas!*100));
                      return <>
                        <div className="flex justify-between text-xs text-blue-700 font-semibold">
                          <span>{form.financiamentoParcelasPagas??0} de {form.financiamentoNumeroParcelas} parcelas pagas</span>
                          <span>{pct}% quitado</span>
                        </div>
                        <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                          <div className="h-2 bg-blue-500 rounded-full transition-all" style={{width:`${pct}%`}} />
                        </div>
                      </>;
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ══ Observações ══ */}
            <SectionTitle id="fs-observacoes" icon={FileText} label="Observações" color="gray" />
            <Textarea rows={3} placeholder="Histórico, pendências, anotações livres…"
              value={form.observacoes||""} onChange={e=>setF("observacoes",e.target.value||null)} />
          </div>
            </div>{/* /right panel */}
          </div>{/* /body */}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════
          DIALOG: Detalhe
          ═══════════════════════════════════════ */}
      <Dialog open={!!detalhando} onOpenChange={o=>!o&&setDetalhando(null)}>
        <DialogContent className="max-w-2xl max-h-[93vh] flex flex-col p-0 gap-0">
          {detalhando && (
            <>
              {/* Header */}
              <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{TIPOS_LABEL[detalhando.tipo]||detalhando.tipo}</p>
                    <DialogTitle className="text-base font-bold text-slate-900 leading-snug mt-0.5">{detalhando.nome}</DialogTitle>
                    {(detalhando.cidade||detalhando.estado) && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        {[detalhando.cidade,detalhando.estado].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLOR[detalhando.status]||STATUS_COLOR.disponivel}`}>
                      {STATUS_LABEL[detalhando.status]||detalhando.status}
                    </span>
                    {detalhando.zoneamento && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700">
                        {detalhando.zoneamento.split(" ")[0]}
                      </span>
                    )}
                    {detalhando.ownerType==="socio" && detalhando.sociosJson?.length>0 && detalhando.sociosJson[0].nome && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-indigo-300 bg-indigo-50 text-indigo-700 flex items-center gap-1">
                        <UserRound className="h-3 w-3" />
                        {detalhando.sociosJson[0].nome.split(" ")[0]}
                        {detalhando.sociosJson.length > 1 && ` +${detalhando.sociosJson.length-1}`}
                      </span>
                    )}
                  </div>
                </div>
                {/* Métricas rápidas */}
                {(detalhando.valorCompra||detalhando.areaTotal) && (
                  <div className="flex gap-4 mt-3">
                    {detalhando.valorCompra && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Valor compra</p>
                        <p className="text-sm font-bold text-slate-800">{brl(detalhando.valorCompra)}</p>
                      </div>
                    )}
                    {detalhando.valorComercial && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Valor comercial</p>
                        <p className="text-sm font-bold text-slate-800">{brl(detalhando.valorComercial)}</p>
                      </div>
                    )}
                    {detalhando.areaTotal && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Área</p>
                        <p className="text-sm font-bold text-slate-800">{areaFmt(detalhando.areaTotal)}</p>
                      </div>
                    )}
                  </div>
                )}
                {/* Tabs */}
                <div className="flex gap-0 mt-4 -mb-4 border-b-0">
                  {([
                    { k:"ficha", l:"Ficha" },
                    { k:"galeria", l:`Galeria${((docsQ.data||[]).filter(d=>d.tipo==="foto"||d.tipo==="video").length)>0?` (${(docsQ.data||[]).filter(d=>d.tipo==="foto"||d.tipo==="video").length})`:""}` },
                    ...(detalhando.zoneamento||detalhando.usoPermitido ? [{ k:"zoneamento", l:"Zoneamento" }] : []),
                    { k:"docs", l:`Docs${((docsQ.data||[]).filter(d=>d.tipo!=="foto"&&d.tipo!=="video").length)>0?` (${(docsQ.data||[]).filter(d=>d.tipo!=="foto"&&d.tipo!=="video").length})`:""}` },
                    { k:"encargos", l:`Encargos${(pagamentosQ.data||[]).length>0?` (${(pagamentosQ.data||[]).length})`:""}` },
                  ] as { k:"ficha"|"galeria"|"zoneamento"|"docs"|"encargos"; l:string }[]).map(t=>(
                    <button key={t.k} type="button"
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${detalheTab===t.k ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}${t.k==="encargos"&&detalhando.encargoVencido?" after:content-['●'] after:text-red-500 after:text-[8px] after:ml-1":""}`}
                      onClick={()=>setDetalheTab(t.k)}>{t.l}</button>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4">

                {/* Tab: Ficha */}
                {detalheTab==="ficha" && (
                  <div className="space-y-0">
                    {/* Foto */}
                    {detalhando.fotoCapaUrl && (
                      <img src={detalhando.fotoCapaUrl} alt={detalhando.nome}
                        className="w-full h-44 object-cover rounded-xl border border-slate-200 mb-4" />
                    )}

                    {/* Proprietário(s) */}
                    {detalhando.ownerType==="socio" && (detalhando.sociosJson||[]).length > 0 ? (
                      <div className="space-y-1.5 mb-4">
                        {(detalhando.sociosJson||[]).map((s,i)=>(
                          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50">
                            <div className="p-1.5 rounded-lg bg-indigo-100 flex-shrink-0">
                              <UserRound className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-indigo-800">{s.nome||"Sócio"}</p>
                              <p className="text-[11px] text-indigo-500">
                                {[s.cpf&&`CPF ${s.cpf}`, s.doc].filter(Boolean).join(" · ")||"Proprietário pessoal"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 mb-4">
                        <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <p className="text-xs text-slate-500 font-medium">Propriedade da empresa</p>
                      </div>
                    )}

                    {/* Cartorial */}
                    {(detalhando.matricula||detalhando.livro||detalhando.tabelionato||detalhando.vendedores||detalhando.compradores) && (
                      <>
                        <SectionTitle icon={BookOpen} label="Dados Cartoriais" />
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mb-4">
                          <InfoCell label="Matrícula (CRI)" value={detalhando.matricula} mono />
                          <InfoCell label="Data da escritura" value={dataBR(detalhando.dataEscritura)} />
                          <InfoCell label="Nº Registro" value={detalhando.numeroRegistro} mono />
                          <InfoCell label="Livro" value={detalhando.livro} />
                          <InfoCell label="Folha / Págs" value={detalhando.folha} />
                          <InfoCell label="ITBI pago" value={detalhando.itbiValor?brl(detalhando.itbiValor):null} />
                          {detalhando.tabelionato && (
                            <div className="col-span-full">
                              <InfoCell label="Tabelionato" value={detalhando.tabelionato} />
                            </div>
                          )}
                          <InfoCell label="Cidade cartório" value={detalhando.cidadeCartorio} />
                          {detalhando.vendedores && (
                            <div className="col-span-full"><InfoCell label="Vendedor(es)" value={detalhando.vendedores} /></div>
                          )}
                          {detalhando.compradores && (
                            <div className="col-span-full"><InfoCell label="Comprador(es)" value={detalhando.compradores} /></div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Localização + Mapa */}
                    {enderecoDetalhe && (
                      <>
                        <SectionTitle icon={MapPin} label="Localização" />
                        <p className="text-sm text-slate-700 mb-1">{enderecoDetalhe}</p>
                        <MapEmbed address={enderecoDetalhe} />
                        <div className="mb-4" />
                      </>
                    )}

                    {/* Área */}
                    {(detalhando.areaTotal||detalhando.areaConstruida) && (
                      <>
                        <SectionTitle icon={Scale} label="Área" />
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
                          <InfoCell label="Área total" value={areaFmt(detalhando.areaTotal)} />
                          <InfoCell label="Área construída" value={areaFmt(detalhando.areaConstruida)} />
                        </div>
                      </>
                    )}

                    {/* Valores */}
                    {(detalhando.valorCompra||detalhando.valorVenal||detalhando.valorComercial||detalhando.valorVenda) && (
                      <>
                        <SectionTitle icon={DollarSign} label="Valores" />
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mb-4">
                          <InfoCell label="Data de compra" value={dataBR(detalhando.dataCompra)} />
                          <InfoCell label="Valor de compra" value={brl(detalhando.valorCompra)} />
                          <InfoCell label="Valor venal" value={brl(detalhando.valorVenal)} />
                          <InfoCell label="Valor comercial" value={brl(detalhando.valorComercial)} />
                          <InfoCell label="Valor de venda" value={brl(detalhando.valorVenda)} />
                        </div>
                      </>
                    )}

                    {/* IPTU */}
                    {(detalhando.iptuValor||detalhando.cadastroPrefeitura||detalhando.inscricaoMunicipal) && (
                      <>
                        <SectionTitle icon={Receipt} label="IPTU / Prefeitura" />
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mb-4">
                          <InfoCell label="IPTU anual" value={brl(detalhando.iptuValor)} />
                          <InfoCell label="Vencimento" value={dataBR(detalhando.iptuVencimento)} />
                          <InfoCell label="Cadastro Prefeitura" value={detalhando.cadastroPrefeitura} mono />
                          <InfoCell label="Inscrição Municipal" value={detalhando.inscricaoMunicipal} mono />
                        </div>
                      </>
                    )}

                    {/* Financiamento */}
                    {detalhando.financiamentoBanco && (
                      <>
                        <SectionTitle icon={Landmark} label="Financiamento" />
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mb-4">
                          <InfoCell label="Banco" value={detalhando.financiamentoBanco} />
                          <InfoCell label="Parcela mensal" value={brl(detalhando.financiamentoParcela)} />
                          <InfoCell label="Saldo devedor" value={brl(detalhando.financiamentoSaldoDevedor)} />
                          <InfoCell label="Vencimento" value={dataBR(detalhando.financiamentoVencimento)} />
                        </div>
                      </>
                    )}

                    {/* Observações */}
                    {detalhando.observacoes && (
                      <>
                        <SectionTitle icon={FileText} label="Observações" />
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{detalhando.observacoes}</p>
                      </>
                    )}
                  </div>
                )}

                {/* Tab: Galeria */}
                {detalheTab==="galeria" && (
                  <div className="space-y-4">
                    <input ref={galeriaRef} type="file" className="hidden"
                      accept="image/*,video/*" multiple
                      onChange={e=>e.target.files&&e.target.files.length>0&&onPickGaleria(e.target.files)} />
                    {/* Toolbar */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        {(()=>{
                          const fotos=(docsQ.data||[]).filter(d=>d.tipo==="foto").length;
                          const videos=(docsQ.data||[]).filter(d=>d.tipo==="video").length;
                          return [fotos>0&&`${fotos} foto${fotos>1?"s":""}`, videos>0&&`${videos} vídeo${videos>1?"s":""}`].filter(Boolean).join(" · ") || "Nenhuma mídia ainda";
                        })()}
                      </p>
                      <Button size="sm" variant="outline" disabled={uploadingGaleria}
                        onClick={()=>{if(galeriaRef.current){galeriaRef.current.value="";galeriaRef.current.click();}}}>
                        {uploadingGaleria
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/>Enviando…</>
                          : <><Camera className="h-3.5 w-3.5 mr-1"/>Adicionar fotos/vídeos</>}
                      </Button>
                    </div>
                    {/* Fotos grid */}
                    {(()=>{
                      const fotos = (docsQ.data||[]).filter(d=>d.tipo==="foto");
                      const videos = (docsQ.data||[]).filter(d=>d.tipo==="video");
                      const total = fotos.length + videos.length;
                      if (total === 0) return (
                        <div className="text-center py-16 text-slate-400 space-y-3">
                          <Camera className="h-12 w-12 mx-auto opacity-20" />
                          <div>
                            <p className="text-sm font-medium">Nenhuma foto ou vídeo</p>
                            <p className="text-xs mt-1">Clique em "Adicionar fotos/vídeos" para documentar o imóvel.</p>
                          </div>
                        </div>
                      );
                      return (
                        <div className="space-y-4">
                          {fotos.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1">
                                <ImageIcon className="h-3 w-3"/> Fotos ({fotos.length})
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {fotos.map(foto=>(
                                  <div key={foto.id} className="group relative rounded-xl overflow-hidden bg-slate-100 aspect-square shadow-sm">
                                    <img src={foto.arquivoUrl||""} alt={foto.descricao||"foto"}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                      <a href={foto.arquivoUrl||""} target="_blank" rel="noopener noreferrer"
                                        className="bg-white/20 hover:bg-white/40 text-white rounded-full p-2 transition-colors">
                                        <Eye className="h-4 w-4"/>
                                      </a>
                                      <button className="bg-red-500/80 hover:bg-red-600 text-white rounded-full p-2 transition-colors"
                                        onClick={()=>{if(confirm("Remover esta foto?"))excluirDocMut.mutate({id:foto.id,companyId});}}>
                                        <Trash2 className="h-4 w-4"/>
                                      </button>
                                    </div>
                                    {foto.descricao && (
                                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                                        <p className="text-[10px] text-white/90 truncate">{foto.descricao}</p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {videos.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1">
                                <Video className="h-3 w-3"/> Vídeos ({videos.length})
                              </p>
                              <div className="space-y-3">
                                {videos.map(vid=>(
                                  <div key={vid.id} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shadow-sm">
                                    <video src={vid.arquivoUrl||""} controls
                                      className="w-full max-h-56 object-contain bg-black"/>
                                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-200">
                                      <p className="text-xs text-slate-600 truncate">{vid.descricao||"Vídeo"}</p>
                                      <button className="text-red-400 hover:text-red-600 p-1 rounded transition-colors"
                                        onClick={()=>{if(confirm("Remover este vídeo?"))excluirDocMut.mutate({id:vid.id,companyId});}}>
                                        <Trash2 className="h-3.5 w-3.5"/>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Tab: Zoneamento */}
                {detalheTab==="zoneamento" && (
                  <div className="space-y-4">
                    {/* Card de zona */}
                    {detalhando.zoneamento && (
                      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-lg">
                        <div className="flex items-start gap-3">
                          <div className="bg-white/20 rounded-xl p-2">
                            <Layers className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-emerald-100 text-xs font-medium uppercase tracking-wide">Zona de Uso</p>
                            <p className="text-xl font-bold leading-tight mt-0.5">{detalhando.zoneamento}</p>
                            {detalhando.planoDiretorMunicipio && (
                              <p className="text-emerald-200 text-sm mt-1">📍 {detalhando.planoDiretorMunicipio}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Usos permitidos */}
                    {detalhando.usoPermitido && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <TreePine className="h-3.5 w-3.5" /> Usos Permitidos
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {detalhando.usoPermitido.split(/[,;]/).map((uso,i) => (
                            <span key={i}
                              className="text-xs bg-white border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-full font-medium">
                              {uso.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Parâmetros urbanísticos */}
                    {(detalhando.coefAproveitamentoBasico||detalhando.coefAproveitamentoMaximo||
                      detalhando.taxaOcupacao||detalhando.taxaPermeabilidade||detalhando.gabaritoMaximo||
                      detalhando.recuoFrontal||detalhando.recuoLateral||detalhando.recuoFundos) && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Parâmetros Urbanísticos</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {[
                            { icon: SquareDashed, label:"CA Básico", value: coef(detalhando.coefAproveitamentoBasico), color:"bg-sky-50 border-sky-200 text-sky-800" },
                            { icon: Building, label:"CA Máximo", value: coef(detalhando.coefAproveitamentoMaximo), color:"bg-sky-50 border-sky-200 text-sky-800" },
                            { icon: ArrowUpDown, label:"Gabarito Máximo", value: detalhando.gabaritoMaximo||"—", color:"bg-indigo-50 border-indigo-200 text-indigo-800" },
                            { icon: Scale, label:"Taxa Ocupação", value: pct(detalhando.taxaOcupacao), color:"bg-amber-50 border-amber-200 text-amber-800" },
                            { icon: Droplets, label:"Permeabilidade", value: pct(detalhando.taxaPermeabilidade), color:"bg-teal-50 border-teal-200 text-teal-800" },
                            { icon: Ruler, label:"Recuo Frontal", value: mt(detalhando.recuoFrontal), color:"bg-slate-50 border-slate-200 text-slate-700" },
                            { icon: Ruler, label:"Recuo Lateral", value: mt(detalhando.recuoLateral), color:"bg-slate-50 border-slate-200 text-slate-700" },
                            { icon: Ruler, label:"Recuo Fundos", value: mt(detalhando.recuoFundos), color:"bg-slate-50 border-slate-200 text-slate-700" },
                          ].filter(p=>p.value&&p.value!=="—").map((p) => (
                            <div key={p.label} className={`rounded-xl border p-3 ${p.color}`}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <p.icon className="h-3.5 w-3.5 opacity-60" />
                                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{p.label}</p>
                              </div>
                              <p className="text-lg font-bold">{p.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Observações zoneamento */}
                    {detalhando.observacoesZoneamento && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Observações Urbanísticas</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{detalhando.observacoesZoneamento}</p>
                      </div>
                    )}

                    {/* Link Plano Diretor */}
                    {detalhando.planoDiretorUrl && (
                      <a href={detalhando.planoDiretorUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl px-4 py-2.5 transition-colors">
                        <Eye className="h-4 w-4" /> Ver Plano Diretor / Lei de Zoneamento
                      </a>
                    )}

                    {!detalhando.zoneamento && !detalhando.usoPermitido && (
                      <div className="text-center py-12 text-slate-400">
                        <Layers className="h-10 w-10 mx-auto opacity-25 mb-2" />
                        <p className="text-sm">Nenhum dado de zoneamento cadastrado.</p>
                        <p className="text-xs mt-1">Use o leitor de Plano Diretor com IA ao editar este imóvel.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Documentos (exclui fotos/vídeos — ficam na Galeria) */}
                {detalheTab==="docs" && (
                  <div className="space-y-3">
                    <input ref={anexoRef} type="file" className="hidden" multiple
                      accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.zip"
                      onChange={e=>e.target.files&&e.target.files.length>0&&onPickAnexo(e.target.files)} />
                    <div className="flex items-center gap-3">
                      <Button size="sm" variant="outline" disabled={uploadingAnexo}
                        onClick={()=>{ if(anexoRef.current){anexoRef.current.value=""; anexoRef.current.click();} }}>
                        {uploadingAnexo
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/>Enviando…</>
                          : <><Paperclip className="h-3.5 w-3.5 mr-1"/>Anexar documentos</>}
                      </Button>
                      {uploadingAnexo && (
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-sky-500 rounded-full transition-all duration-300"
                              style={{ width: `${progressoAnexo}%` }} />
                          </div>
                          <span className="text-xs font-bold text-sky-600 tabular-nums w-9 text-right">
                            {progressoAnexo}%
                          </span>
                        </div>
                      )}
                    </div>
                    {docsQ.isLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300"/></div>
                    ) : (()=>{
                      const docs = (docsQ.data||[]).filter(d=>d.tipo!=="foto"&&d.tipo!=="video");
                      if (docs.length===0) return (
                        <div className="text-center py-10 text-slate-400">
                          <Paperclip className="h-8 w-8 mx-auto opacity-25 mb-1.5"/>
                          <p className="text-sm">Nenhum documento anexado.</p>
                          <p className="text-xs mt-1 text-slate-300">Fotos e vídeos ficam na aba Galeria.</p>
                        </div>
                      );
                      return (
                        <div className="space-y-1.5">
                          {docs.map(doc => (
                            <div key={doc.id}
                              className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                              <FileText className="h-4 w-4 text-slate-400 flex-shrink-0"/>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{doc.descricao||TIPOS_DOC_LABEL[doc.tipo]||doc.tipo}</p>
                                <p className="text-[10px] text-slate-400">{TIPOS_DOC_LABEL[doc.tipo]||doc.tipo}{doc.dataDocumento?` · ${dataBR(doc.dataDocumento)}`:""}</p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {doc.arquivoUrl && (
                                  <a href={doc.arquivoUrl} target="_blank" rel="noopener noreferrer"
                                    className="p-1.5 text-sky-500 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors">
                                    <Eye className="h-4 w-4"/>
                                  </a>
                                )}
                                <button
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  onClick={()=>{ if(confirm("Remover este documento?")) excluirDocMut.mutate({id:doc.id,companyId}); }}>
                                  <Trash2 className="h-4 w-4"/>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Tab: Encargos */}
                {detalheTab==="encargos" && (
                  <div className="space-y-5">
                    {/* Novo encargo */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5"/> Lançar novo encargo
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 sm:col-span-1">
                          <Label className="text-[11px] text-slate-500 mb-1 block">Tipo</Label>
                          <select className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                            value={pagForm.tipo} onChange={e=>setPagForm(f=>({...f,tipo:e.target.value}))}>
                            <option value="iptu">IPTU</option>
                            <option value="laudemio">Laudêmio</option>
                            <option value="itbi">ITBI</option>
                            <option value="condominio">Condomínio</option>
                            <option value="outro">Outro</option>
                          </select>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <Label className="text-[11px] text-slate-500 mb-1 block">Vencimento *</Label>
                          <Input type="date" className="h-8 text-sm" value={pagForm.dataVencimento}
                            onChange={e=>setPagForm(f=>({...f,dataVencimento:e.target.value}))} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <Label className="text-[11px] text-slate-500 mb-1 block">Valor (R$)</Label>
                          <Input type="text" placeholder="0,00" className="h-8 text-sm" value={pagForm.valor}
                            onChange={e=>setPagForm(f=>({...f,valor:e.target.value}))} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <Label className="text-[11px] text-slate-500 mb-1 block">Descrição (opcional)</Label>
                          <Input type="text" placeholder="Ex: IPTU 2025 parcela única" className="h-8 text-sm" value={pagForm.descricao}
                            onChange={e=>setPagForm(f=>({...f,descricao:e.target.value}))} />
                        </div>
                      </div>
                      <Button size="sm" className="mt-3 bg-[#0f3460] hover:bg-[#0c2340] text-white text-xs"
                        disabled={!pagForm.dataVencimento || criarPagMut.isPending}
                        onClick={async ()=>{
                          if (!pagForm.dataVencimento) return;
                          const valorNum = pagForm.valor ? parseBRMoney(pagForm.valor) : null;
                          await criarPagMut.mutateAsync({
                            imovelId: detalhando.id, companyId,
                            tipo: pagForm.tipo as any,
                            descricao: pagForm.descricao || null,
                            valor: valorNum,
                            dataVencimento: pagForm.dataVencimento,
                          });
                          setPagForm({ tipo: "iptu", descricao: "", valor: "", dataVencimento: "" });
                          toast.success("Encargo lançado.");
                        }}>
                        {criarPagMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Plus className="h-3.5 w-3.5 mr-1"/>}
                        Lançar encargo
                      </Button>
                    </div>

                    {/* Lista de pagamentos */}
                    {pagamentosQ.isLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300"/></div>
                    ) : (pagamentosQ.data||[]).length === 0 ? (
                      <div className="text-center py-10 text-slate-400">
                        <Banknote className="h-8 w-8 mx-auto opacity-25 mb-1.5"/>
                        <p className="text-sm">Nenhum encargo lançado.</p>
                        <p className="text-xs mt-1 text-slate-300">Use o formulário acima para registrar IPTU, laudêmio, etc.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(()=>{
                          const pags = pagamentosQ.data || [];
                          // agrupar por ano de vencimento
                          const anos: Record<number, typeof pags> = {};
                          pags.forEach(p=>{ const a=Number(p.dataVencimento.slice(0,4)); if(!anos[a]) anos[a]=[]; anos[a].push(p); });
                          return Object.keys(anos).sort((a,b)=>Number(b)-Number(a)).map(anoStr=>{
                            const ano = Number(anoStr);
                            const lista = anos[ano];
                            return (
                              <div key={ano}>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{ano}</p>
                                <div className="space-y-1.5">
                                  {lista.map(p=>{
                                    const isPago = p.status==="pago";
                                    const isVencido = p.status==="vencido";
                                    return (
                                      <div key={p.id} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${isPago?"border-slate-200 bg-white":isVencido?"border-red-200 bg-red-50":"border-amber-200 bg-amber-50"}`}>
                                        <div className={`flex-shrink-0 p-1.5 rounded-lg ${isPago?"bg-slate-100":isVencido?"bg-red-100":"bg-amber-100"}`}>
                                          {isPago ? <Check className="h-3.5 w-3.5 text-slate-500"/>
                                            : isVencido ? <AlertTriangle className="h-3.5 w-3.5 text-red-500"/>
                                            : <Clock className="h-3.5 w-3.5 text-amber-500"/>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-semibold text-slate-800">
                                            {p.tipo==="iptu"?"IPTU":p.tipo==="laudemio"?"Laudêmio":p.tipo==="itbi"?"ITBI":p.tipo==="condominio"?"Condomínio":"Outro"}
                                            {p.descricao && <span className="text-slate-500 font-normal"> · {p.descricao}</span>}
                                          </p>
                                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isPago?"border-slate-200 bg-slate-100 text-slate-500":isVencido?"border-red-300 bg-red-100 text-red-700":"border-amber-300 bg-amber-100 text-amber-700"}`}>
                                              {isPago?"Pago":isVencido?"Vencido":"Em aberto"}
                                            </span>
                                            <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                              <Calendar className="h-3 w-3"/> Venc. {dataBR(p.dataVencimento)}
                                            </span>
                                            {p.dataPagamento && (
                                              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                                <Check className="h-3 w-3"/> Pago {dataBR(p.dataPagamento)}
                                              </span>
                                            )}
                                            {p.valor && (
                                              <span className="text-[11px] font-semibold text-slate-700">{brl(p.valor)}</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          {p.comprovanteUrl && (
                                            <a href={p.comprovanteUrl} target="_blank" rel="noopener noreferrer"
                                              className="p-1.5 text-sky-500 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors">
                                              <Eye className="h-4 w-4"/>
                                            </a>
                                          )}
                                          {!isPago && (
                                            pagando===p.id ? (
                                              <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 py-1 bg-white">
                                                <Input type="date" className="h-6 text-xs w-32 border-0 p-0 focus-visible:ring-0"
                                                  value={dataPagInput||new Date().toISOString().slice(0,10)}
                                                  onChange={e=>setDataPagInput(e.target.value)} />
                                                <Button size="sm" className="h-6 text-[10px] bg-slate-700 hover:bg-slate-900 text-white px-2"
                                                  disabled={marcarPagoMut.isPending}
                                                  onClick={async ()=>{
                                                    await marcarPagoMut.mutateAsync({
                                                      id: p.id, companyId,
                                                      dataPagamento: dataPagInput||new Date().toISOString().slice(0,10),
                                                    });
                                                    setPagando(null); setDataPagInput("");
                                                    toast.success("Pagamento registrado.");
                                                  }}>
                                                  {marcarPagoMut.isPending?<Loader2 className="h-3 w-3 animate-spin"/>:<Check className="h-3 w-3"/>}
                                                </Button>
                                                <button className="text-slate-400 hover:text-slate-600"
                                                  onClick={()=>{ setPagando(null); setDataPagInput(""); }}>
                                                  <X className="h-3.5 w-3.5"/>
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors whitespace-nowrap"
                                                onClick={()=>{ setPagando(p.id); setDataPagInput(new Date().toISOString().slice(0,10)); }}>
                                                Marcar pago
                                              </button>
                                            )
                                          )}
                                          <button
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            onClick={()=>{ if(confirm("Excluir este encargo?")) excluirPagMut.mutate({id:p.id,companyId}); }}>
                                            <Trash2 className="h-4 w-4"/>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
                <Button variant="outline" onClick={()=>setDetalhando(null)}>Fechar</Button>
                <Button className="bg-[#0f3460] hover:bg-[#0c2340] text-white"
                  onClick={()=>{ setDetalhando(null); abrirForm(detalhando); }}>
                  <Pencil className="h-4 w-4 mr-1.5"/> Editar imóvel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* ══════════════════════════════════════
          MODAL: Avaliação de Valor de Mercado
          ══════════════════════════════════════ */}
      <Dialog open={!!avaliacaoModal} onOpenChange={open => { if (!open) fecharAvaliacao(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sky-700">
              <Globe className="h-5 w-5" /> Valor de Mercado
              {avaliacaoModal && (
                <span className="text-sm font-normal text-slate-500 ml-1 truncate max-w-[240px]">{avaliacaoModal.nome}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Carregando */}
          {!avaliacaoResult && !!avaliacaoModal && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Loader2 className="h-9 w-9 animate-spin text-sky-400" />
              <p className="text-sm text-slate-500">Pesquisando anúncios similares e estimando valor...</p>
              <p className="text-xs text-slate-400">
                {avaliacaoModal.cidade || ""}
                {avaliacaoModal.bairro ? ` · ${avaliacaoModal.bairro}` : ""}
                {avaliacaoModal.areaTotal ? ` · ${areaFmt(avaliacaoModal.areaTotal)}` : ""}
              </p>
            </div>
          )}

          {/* Resultado */}
          {avaliacaoResult && (() => {
            const est = avaliacaoResult.estimativa;
            const confCls = est.confianca === "alta"
              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
              : est.confianca === "media"
              ? "bg-amber-100 text-amber-700 border-amber-200"
              : "bg-slate-100 text-slate-600 border-slate-200";
            return (
              <div className="space-y-4">
                {/* Faixa de valor */}
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 text-center">
                  <p className="text-[11px] font-bold text-sky-600 uppercase tracking-widest mb-2">Estimativa de Mercado</p>
                  {est.valorMin && est.valorMax ? (
                    <p className="text-2xl font-bold text-sky-800">
                      {brl(est.valorMin)}<span className="text-sky-400 mx-2">—</span>{brl(est.valorMax)}
                    </p>
                  ) : (
                    <p className="text-base text-slate-400">Não foi possível estimar</p>
                  )}
                  {est.valorPorM2Min && est.valorPorM2Max && (
                    <p className="text-xs text-sky-600 mt-1.5">
                      {brl(est.valorPorM2Min)} — {brl(est.valorPorM2Max)}<span className="ml-1 text-sky-400">/m²</span>
                    </p>
                  )}
                  <span className={`inline-flex items-center gap-1 mt-3 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${confCls}`}>
                    Confiança: {est.confianca}
                  </span>
                </div>

                {/* Metodologia */}
                {est.metodologia && (
                  <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200 leading-relaxed">
                    <span className="font-semibold text-slate-700">Metodologia — </span>{est.metodologia}
                  </div>
                )}

                {/* Anúncios pesquisados */}
                {est.buscas?.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Fontes pesquisadas na internet</p>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {est.buscas.map((f: any, i: number) => (
                        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-start gap-2 text-[11px] bg-white border border-slate-200 rounded-lg p-2.5 hover:border-sky-300 hover:bg-sky-50 transition-colors group">
                          <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 text-slate-400 group-hover:text-sky-500" />
                          <div className="min-w-0">
                            <p className="font-semibold text-sky-700 truncate">{f.titulo}</p>
                            {f.snippet && <p className="text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{f.snippet}</p>}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observações / ressalvas */}
                {est.observacoes && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-3 border border-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{est.observacoes}</span>
                  </div>
                )}

                <p className="text-[10px] text-slate-400 text-center">
                  Gerado em {new Date(avaliacaoResult.geradoEm).toLocaleString("pt-BR")} · Estimativa por IA — não substitui laudo profissional
                </p>
              </div>
            );
          })()}

          <div className="flex justify-end pt-1">
            <Button variant="outline" onClick={fecharAvaliacao}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
    </DashboardLayout>
  );
}
