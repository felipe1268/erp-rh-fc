import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import {
  CreditCard, Search, Download, Printer, User, Building2, HardHat,
  Eye, Filter, Users, CheckCircle, AlertTriangle, Camera, Palette, RotateCcw,
  Briefcase, Calendar, Phone
} from "lucide-react";

// Rev. 4606 — cor de destaque (laranja/dourado) do novo modelo de arte do crachá
const ACCENT = "#F49D1F";

// Formata data sem risco de fuso (YYYY-MM-DD → DD/MM/YYYY, sem new Date local)
function formatDateBR(raw: string): string {
  const datePart = String(raw).split("T")[0].split(" ")[0];
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return datePart;
}

type BadgeType = "clt" | "pj" | "terceiro";

// Cores padrão
const DEFAULT_COLORS: Record<BadgeType, string> = {
  clt: "#1d4ed8",
  pj: "#15803d",
  terceiro: "#ea580c",
};

// Paleta de cores pré-definidas para seleção rápida
const COLOR_PRESETS = [
  "#1d4ed8", // Azul
  "#2563eb", // Azul claro
  "#0ea5e9", // Sky
  "#06b6d4", // Cyan
  "#14b8a6", // Teal
  "#15803d", // Verde
  "#22c55e", // Verde claro
  "#84cc16", // Lima
  "#eab308", // Amarelo
  "#f97316", // Laranja
  "#ea580c", // Laranja escuro
  "#ef4444", // Vermelho
  "#dc2626", // Vermelho escuro
  "#e11d48", // Rosa
  "#d946ef", // Fúcsia
  "#a855f7", // Roxo
  "#7c3aed", // Violeta
  "#6366f1", // Índigo
  "#1B2A4A", // Azul marinho
  "#374151", // Cinza escuro
  "#78350f", // Marrom
  "#000000", // Preto
];

// Gerar gradiente a partir de uma cor base
function makeGradient(hex: string): string {
  // Clarear a cor para o segundo ponto do gradiente
  const lighten = (h: string, pct: number) => {
    let r = parseInt(h.slice(1, 3), 16);
    let g = parseInt(h.slice(3, 5), 16);
    let b = parseInt(h.slice(5, 7), 16);
    r = Math.min(255, Math.round(r + (255 - r) * pct));
    g = Math.min(255, Math.round(g + (255 - g) * pct));
    b = Math.min(255, Math.round(b + (255 - b) * pct));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };
  return `linear-gradient(to right, ${hex}, ${lighten(hex, 0.3)})`;
}

// Gerar cor de fundo clara a partir da cor base
function makeBgColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.06)`;
}

// Chave de localStorage para persistir cores
const STORAGE_KEY = "cracha-colors";

function loadColors(): Record<BadgeType, string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_COLORS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_COLORS };
}

function saveColors(colors: Record<BadgeType, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
}

interface BadgeData {
  id: number;
  nome: string;
  cpf?: string;
  funcao?: string;
  setor?: string;
  foto?: string;
  tipo: BadgeType;
  empresa?: string;
  empresaTerceira?: string;
  obra?: string;
  matricula?: string;
  dataAdmissao?: string;
}

export default function Crachas() {
  const { user } = useAuth();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const [activeTab, setActiveTab] = useState<"clt" | "pj" | "terceiro">("clt");
  const [search, setSearch] = useState("");
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [badgeColors, setBadgeColors] = useState<Record<BadgeType, string>>(loadColors);
  const badgeRef = useRef<HTMLDivElement>(null);

  // Salvar cores quando mudam
  useEffect(() => {
    saveColors(badgeColors);
  }, [badgeColors]);

  // Fetch employees (CLT + PJ)
  const { data: employeesData, isLoading: loadingEmployees } = trpc.employees.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  // Fetch terceiros
  const { data: terceirosData, isLoading: loadingTerceiros } = trpc.terceiros.funcionarios.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  // Fetch empresas terceiras
  const { data: empresasTerceiras } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  // Fetch companies for name
  const { data: companiesData } = trpc.companies.list.useQuery();

  const companyObj = useMemo(() => {
    if (!companiesData || !companyId) return null;
    return (companiesData as any[]).find((c: any) => c.id === companyId) || null;
  }, [companiesData, companyId]);

  const companyName = companyObj?.nomeFantasia || companyObj?.razaoSocial || "";
  const companyLogo = companyObj?.logoUrl || "";
  const companyPhone = (companyObj as any)?.telefone || (companyObj as any)?.phone || "";

  // Labels por tipo
  const LABELS: Record<BadgeType, string> = { clt: "CLT", pj: "PJ", terceiro: "TERCEIRO" };

  // Transform data into BadgeData
  const cltBadges: BadgeData[] = useMemo(() => {
    if (!employeesData) return [];
    return (employeesData as any[])
      .filter((e: any) => e.tipoContrato === "CLT" && e.status === "Ativo")
      .map((e: any) => ({
        id: e.id,
        nome: e.nomeCompleto,
        cpf: e.cpf,
        funcao: e.funcao || e.cargo,
        setor: e.setor,
        foto: e.fotoUrl,
        tipo: "clt" as BadgeType,
        empresa: companyName,
        matricula: e.codigoInterno || e.matricula,
        dataAdmissao: e.dataAdmissao,
      }));
  }, [employeesData, companyName]);

  const pjBadges: BadgeData[] = useMemo(() => {
    if (!employeesData) return [];
    return (employeesData as any[])
      .filter((e: any) => e.tipoContrato === "PJ" && e.status === "Ativo")
      .map((e: any) => ({
        id: e.id,
        nome: e.nomeCompleto,
        cpf: e.cpf,
        funcao: e.funcao || e.cargo,
        setor: e.setor,
        foto: e.fotoUrl,
        tipo: "pj" as BadgeType,
        empresa: companyName,
        matricula: e.codigoInterno || e.matricula,
        dataAdmissao: e.dataAdmissao,
      }));
  }, [employeesData, companyName]);

  const terceiroBadges: BadgeData[] = useMemo(() => {
    if (!terceirosData) return [];
    return (terceirosData as any[])
      .filter((f: any) => f.status === "ativo")
      .map((f: any) => {
        const emp = empresasTerceiras?.find((e: any) => e.id === f.empresaTerceiraId);
        return {
          id: f.id,
          nome: f.nome,
          cpf: f.cpf,
          funcao: f.funcao,
          foto: f.fotoUrl,
          tipo: "terceiro" as BadgeType,
          empresa: companyName,
          empresaTerceira: emp?.razaoSocial || `Empresa #${f.empresaTerceiraId}`,
          obra: f.obraNome,
        };
      });
  }, [terceirosData, empresasTerceiras, companyName]);

  const currentBadges = useMemo(() => {
    const badges = activeTab === "clt" ? cltBadges : activeTab === "pj" ? pjBadges : terceiroBadges;
    if (!search) return badges;
    return badges.filter((b) =>
      b.nome.toLowerCase().includes(search.toLowerCase()) ||
      b.cpf?.includes(search) ||
      b.funcao?.toLowerCase().includes(search.toLowerCase())
    );
  }, [activeTab, cltBadges, pjBadges, terceiroBadges, search]);

  const handleDownload = useCallback(async () => {
    if (!badgeRef.current) return;
    try {
      const dataUrl = await toPng(badgeRef.current, { quality: 1, pixelRatio: 3 });
      const link = document.createElement("a");
      link.download = `cracha-${selectedBadge?.nome?.replace(/\s+/g, "-") || "badge"}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Crachá baixado com sucesso!");
    } catch (err) {
      toast.error("Erro ao gerar imagem do crachá");
    }
  }, [selectedBadge]);

  const handlePrint = useCallback(() => {
    setPrintMode(true);
    setTimeout(() => {
      window.print();
      setPrintMode(false);
    }, 500);
  }, []);

  const isLoading = loadingEmployees || loadingTerceiros;

  const handleColorChange = (tipo: BadgeType, color: string) => {
    setBadgeColors((prev) => ({ ...prev, [tipo]: color }));
  };

  const resetColors = () => {
    setBadgeColors({ ...DEFAULT_COLORS });
    toast.success("Cores restauradas para o padrão!");
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-[1400px] mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CreditCard className="w-7 h-7 text-orange-500" /> Emissão de Crachás
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Gere crachás com QR Code para colaboradores CLT, PJ e terceiros</p>
          </div>
          <Button
            variant={showColorPanel ? "default" : "outline"}
            size="sm"
            onClick={() => setShowColorPanel(!showColorPanel)}
            className={showColorPanel ? "bg-gradient-to-r from-purple-600 to-pink-500 text-white" : ""}
          >
            <Palette className="w-4 h-4 mr-2" />
            {showColorPanel ? "Fechar Cores" : "Personalizar Cores"}
          </Button>
        </div>

        {/* Color Customization Panel */}
        {showColorPanel && (
          <div className="border rounded-xl p-4 bg-gradient-to-r from-gray-50 to-white shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-sm">Personalizar Cores dos Crachás</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={resetColors} className="text-xs text-muted-foreground hover:text-foreground">
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restaurar Padrão
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(["clt", "pj", "terceiro"] as BadgeType[]).map((tipo) => (
                <div key={tipo} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{LABELS[tipo]}</span>
                    <div
                      className="w-8 h-8 rounded-lg border-2 border-white shadow-md"
                      style={{ background: makeGradient(badgeColors[tipo]) }}
                    />
                  </div>

                  {/* Color Input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={badgeColors[tipo]}
                      onChange={(e) => handleColorChange(tipo, e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border-0 p-0"
                    />
                    <Input
                      value={badgeColors[tipo]}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) handleColorChange(tipo, v);
                      }}
                      className="h-8 text-xs font-mono uppercase"
                      maxLength={7}
                      placeholder="#000000"
                    />
                  </div>

                  {/* Preset Colors */}
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        className={`w-6 h-6 rounded-md border-2 transition-all hover:scale-110 ${
                          badgeColors[tipo] === color ? "border-foreground ring-2 ring-offset-1 ring-purple-400 scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => handleColorChange(tipo, color)}
                        title={color}
                      />
                    ))}
                  </div>

                  {/* Mini Preview */}
                  <div
                    className="rounded-lg p-2 text-center text-white text-xs font-bold tracking-wider"
                    style={{ background: makeGradient(badgeColors[tipo]) }}
                  >
                    {LABELS[tipo]} — Preview
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Color Legend */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: badgeColors.clt }}></div>
            <span className="text-sm">CLT ({cltBadges.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: badgeColors.pj }}></div>
            <span className="text-sm">PJ ({pjBadges.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: badgeColors.terceiro }}></div>
            <span className="text-sm">Terceiros ({terceiroBadges.length})</span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="clt" className="flex items-center gap-1">
                <User className="w-4 h-4" /> CLT
              </TabsTrigger>
              <TabsTrigger value="pj" className="flex items-center gap-1">
                <Building2 className="w-4 h-4" /> PJ
              </TabsTrigger>
              <TabsTrigger value="terceiro" className="flex items-center gap-1">
                <HardHat className="w-4 h-4" /> Terceiros
              </TabsTrigger>
            </TabsList>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, CPF ou função..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
          </div>

          {/* Content */}
          {["clt", "pj", "terceiro"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3"></div>
                  Carregando...
                </div>
              ) : currentBadges.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum {tab === "clt" ? "colaborador CLT" : tab === "pj" ? "prestador PJ" : "funcionário terceiro"} ativo encontrado</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
                  {currentBadges.map((badge) => (
                    <BadgeCard
                      key={`${badge.tipo}-${badge.id}`}
                      badge={badge}
                      color={badgeColors[badge.tipo]}
                      label={LABELS[badge.tipo]}
                      onPreview={() => { setSelectedBadge(badge); setPreviewOpen(true); }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Preview Dialog */}
        <FullScreenDialog
          open={previewOpen}
          onClose={() => { setPreviewOpen(false); setSelectedBadge(null); }}
          title="Visualizar Crachá"
          subtitle={selectedBadge?.nome || ""}
          icon={<CreditCard className="w-5 h-5" />}
          headerColor={selectedBadge ? `bg-gradient-to-r` : undefined}
          headerStyle={selectedBadge ? { background: makeGradient(badgeColors[selectedBadge.tipo]) } : undefined}
          headerActions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                <Download className="w-4 h-4 mr-1" /> Baixar PNG
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint} className="bg-white/10 border-white/30 text-white hover:bg-white/20">
                <Printer className="w-4 h-4 mr-1" /> Imprimir
              </Button>
            </div>
          }
        >
          {selectedBadge && (
            <div className="p-4 sm:p-8 flex justify-center">
              <div className="space-y-6">
                {/* Badge Preview - Front */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 text-center">Frente do Crachá</h3>
                  <div ref={badgeRef}>
                    <BadgePreview
                      badge={selectedBadge}
                      companyName={companyName}
                      companyLogo={companyLogo}
                      companyPhone={companyPhone}
                      side="front"
                      color={badgeColors[selectedBadge.tipo]}
                      label={LABELS[selectedBadge.tipo]}
                    />
                  </div>
                </div>
                {/* Badge Preview - Back */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 text-center">Verso do Crachá</h3>
                  <BadgePreview
                    badge={selectedBadge}
                    companyName={companyName}
                    companyLogo={companyLogo}
                    companyPhone={companyPhone}
                    side="back"
                    color={badgeColors[selectedBadge.tipo]}
                    label={LABELS[selectedBadge.tipo]}
                  />
                </div>
              </div>
            </div>
          )}
        </FullScreenDialog>
      </div>
    </DashboardLayout>
  );
}

// Badge Card Component
function BadgeCard({ badge, color, label, onPreview }: { badge: BadgeData; color: string; label: string; onPreview: () => void }) {
  return (
    <div
      className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      style={{ backgroundColor: makeBgColor(color) }}
      onClick={onPreview}
    >
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: makeGradient(color) }}>
        <span className="text-white text-xs font-bold tracking-wider">{label}</span>
        <CreditCard className="w-4 h-4 text-white/70" />
      </div>
      <div className="p-3">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full bg-white border-2 flex items-center justify-center overflow-hidden shrink-0"
            style={{ borderColor: color }}
          >
            {badge.foto ? (
              <img src={badge.foto} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color }}>{badge.nome}</p>
            <p className="text-xs text-muted-foreground truncate">{badge.funcao || "Sem função"}</p>
            {badge.empresaTerceira && (
              <p className="text-xs text-muted-foreground truncate">{badge.empresaTerceira}</p>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{badge.cpf ? `CPF: ${badge.cpf.substring(0, 7)}...` : ""}</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> Ver Crachá
          </Button>
        </div>
      </div>
    </div>
  );
}

// Badge Preview Component — Rev. 4606: novo modelo de arte (header curvo navy +
// faixa laranja, foto circular sobreposta, linhas de dados com ícones; verso com
// QR emoldurado, slogan e rodapé de contato). Cor principal segue personalizável
// por tipo (Personalizar Cores); o laranja de destaque (ACCENT) é fixo da marca.
function BadgePreview({ badge, companyName, companyLogo, companyPhone, side, color, label }: {
  badge: BadgeData; companyName: string; companyLogo?: string; companyPhone?: string;
  side: "front" | "back"; color: string; label: string;
}) {
  const qrData = `${window.location.origin}/verificar/${badge.tipo}/${badge.id}`;

  // Marca d'água de construção (linhas leves de prédios/guindaste) usada em frente e verso
  const Watermark = () => (
    <svg className="absolute bottom-0 right-0 pointer-events-none" width="220" height="260" viewBox="0 0 220 260" fill="none" style={{ opacity: 0.07 }}>
      <g stroke={color} strokeWidth="2">
        <rect x="20" y="120" width="60" height="140" />
        <rect x="30" y="135" width="12" height="12" /><rect x="56" y="135" width="12" height="12" />
        <rect x="30" y="160" width="12" height="12" /><rect x="56" y="160" width="12" height="12" />
        <rect x="30" y="185" width="12" height="12" /><rect x="56" y="185" width="12" height="12" />
        <rect x="30" y="210" width="12" height="12" /><rect x="56" y="210" width="12" height="12" />
        <rect x="100" y="160" width="70" height="100" />
        <rect x="112" y="175" width="14" height="14" /><rect x="140" y="175" width="14" height="14" />
        <rect x="112" y="205" width="14" height="14" /><rect x="140" y="205" width="14" height="14" />
        <line x1="150" y1="160" x2="150" y2="40" />
        <line x1="150" y1="40" x2="215" y2="40" />
        <line x1="150" y1="60" x2="205" y2="40" />
        <line x1="195" y1="40" x2="195" y2="75" />
        <rect x="188" y="75" width="14" height="16" />
      </g>
    </svg>
  );

  const LogoBlock = ({ dark }: { dark: boolean }) => (
    companyLogo ? (
      <img src={companyLogo} alt="" className="h-12 object-contain" style={dark ? {} : { filter: "none" }} />
    ) : (
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-black italic tracking-tight" style={{ color: dark ? "#fff" : color }}>FC</span>
        <span className="text-[11px] font-bold tracking-[0.18em]" style={{ color: dark ? "#fff" : color }}>
          {(companyName || "ENGENHARIA").toUpperCase().replace(/^FC\s*/, "") || "ENGENHARIA"}
        </span>
      </div>
    )
  );

  if (side === "back") {
    return (
      <div className="w-[340px] h-[540px] rounded-2xl overflow-hidden shadow-xl mx-auto relative bg-white flex flex-col">
        <Watermark />
        {/* Logo topo */}
        <div className="flex flex-col items-center pt-7">
          <LogoBlock dark={false} />
          <div className="mt-2 h-[3px] w-24 rounded-full" style={{ backgroundColor: ACCENT }} />
        </div>
        {/* QR emoldurado */}
        <div className="flex flex-col items-center mt-5">
          <div className="p-3 rounded-xl border-2" style={{ borderColor: ACCENT }}>
            <QRCodeSVG value={qrData} size={140} level="H" />
          </div>
          <p className="text-[11px] mt-3 text-center leading-snug" style={{ color: "#5b6473" }}>
            Verifique a autenticidade<br />deste crachá.
          </p>
        </div>
        {/* Slogan */}
        <div className="flex flex-col items-center mt-4 px-8 text-center">
          <Users className="w-6 h-6 mb-1" style={{ color }} />
          <p className="text-lg font-extrabold leading-tight" style={{ color }}>
            Grandes obras<br />começam com{" "}
            <span style={{ color: ACCENT }}>grandes pessoas.</span>
          </p>
          <div className="my-2 h-px w-40" style={{ backgroundColor: "#e2e6ee" }} />
          <p className="text-[11px] font-medium" style={{ color: "#5b6473" }}>Compromisso que vira resultado.</p>
        </div>
        {/* Rodapé de contato */}
        <div className="mt-auto relative" style={{ backgroundColor: color }}>
          <div className="flex items-center justify-center gap-3 py-4 px-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT }}>
              <Phone className="w-5 h-5 text-white" />
            </div>
            <div className="text-white">
              <p className="text-[11px] leading-tight opacity-90">Em caso de perda,<br />entre em contato:</p>
            </div>
            <p className="text-white text-lg font-extrabold whitespace-nowrap">{companyPhone || "(12) 3133-5504"}</p>
          </div>
        </div>
      </div>
    );
  }

  // FRENTE
  const detalhes: { icon: React.ReactNode; rotulo: string; valor?: string; bold?: boolean }[] = [
    badge.matricula ? { icon: <User className="w-3.5 h-3.5" />, rotulo: "Nº INTERNO", valor: badge.matricula, bold: true } : null,
    badge.setor ? { icon: <Briefcase className="w-3.5 h-3.5" />, rotulo: "SETOR", valor: badge.setor.toUpperCase(), bold: true } : null,
    badge.empresaTerceira ? { icon: <Building2 className="w-3.5 h-3.5" />, rotulo: "EMPRESA", valor: badge.empresaTerceira } : null,
    badge.obra ? { icon: <HardHat className="w-3.5 h-3.5" />, rotulo: "OBRA", valor: badge.obra } : null,
    badge.dataAdmissao ? { icon: <Calendar className="w-3.5 h-3.5" />, rotulo: "ADMISSÃO", valor: formatDateBR(badge.dataAdmissao), bold: true } : null,
  ].filter(Boolean) as any[];

  return (
    <div className="w-[340px] h-[540px] rounded-2xl overflow-hidden shadow-xl mx-auto relative bg-white">
      <Watermark />
      {/* Header navy com curva laranja */}
      <div className="relative" style={{ height: 170 }}>
        <div className="absolute inset-0" style={{ backgroundColor: color }} />
        {/* Curvas: faixa laranja + recorte branco */}
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 340 70" preserveAspectRatio="none" style={{ height: 70 }}>
          <path d="M0,70 C90,10 240,55 340,8 L340,70 Z" fill={ACCENT} />
          <path d="M0,70 C95,22 245,62 340,20 L340,70 Z" fill="#ffffff" />
        </svg>
        {/* Selo do tipo */}
        <div className="absolute top-3 right-3 rounded-md px-2 py-0.5" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
          <span className="text-white text-[10px] font-bold tracking-wider">{label}</span>
        </div>
        {/* Logo */}
        <div className="absolute inset-x-0 top-6 flex justify-center">
          <LogoBlock dark />
        </div>
      </div>

      {/* Foto sobreposta à curva */}
      <div className="relative flex justify-center" style={{ marginTop: -64 }}>
        <div className="w-32 h-32 rounded-full bg-white border-4 border-white shadow-lg overflow-hidden flex items-center justify-center"
          style={{ boxShadow: "0 6px 18px rgba(0,0,0,0.18)" }}>
          {badge.foto ? (
            <img src={badge.foto} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-16 h-16 text-muted-foreground/40" />
          )}
        </div>
      </div>

      {/* Nome + função */}
      <div className="text-center mt-3 px-5">
        <h2 className="text-xl font-extrabold uppercase leading-tight tracking-wide line-clamp-2 overflow-hidden" style={{ color }}>
          {badge.nome}
        </h2>
        <div className="flex justify-center my-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
        </div>
        <div className="mx-auto inline-block border-t border-b py-1 px-3 max-w-[280px]" style={{ borderColor: "#dfe4ec" }}>
          <p className="text-[12px] font-semibold truncate" style={{ color: "#3d4757" }}>{badge.funcao || "—"}</p>
        </div>
      </div>

      {/* Linhas de dados */}
      <div className="mt-4 px-8 space-y-2.5 relative">
        {detalhes.map((d, i) => (
          <div key={i} className="flex items-center gap-2 border-b pb-1.5" style={{ borderColor: "#dfe4ec" }}>
            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: "rgba(0,0,0,0.04)", color }}>{d.icon}</span>
            <span className="text-[10px] font-semibold tracking-[0.12em]" style={{ color: "#5b6473" }}>{d.rotulo}</span>
            <span className={`ml-auto text-[12px] text-right max-w-[150px] truncate ${d.bold ? "font-extrabold" : "font-semibold"}`}
              style={{ color }}>{d.valor}</span>
          </div>
        ))}
      </div>

      {/* QR pequeno + ID */}
      <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3">
        <QRCodeSVG value={qrData} size={44} level="M" />
        <div className="text-[10px]" style={{ color: "#5b6473" }}>
          <p className="font-bold">ID: {badge.tipo.toUpperCase()}-{String(badge.id).padStart(5, "0")}</p>
          <p>{companyName || "FC Engenharia"}</p>
        </div>
      </div>
    </div>
  );
}
