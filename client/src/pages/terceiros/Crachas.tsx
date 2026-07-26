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
import logoCrachaNavy from "@assets/cracha_logo_navy.png";
import logoCrachaWhite from "@assets/cracha_logo_white.png";
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

// Rev. 4609 — status de documentação/competências vindo de sprint1.aptidao.badgeStatus
interface DocStatus {
  pendencias: string[];
  ok: boolean;
  nr35: boolean;
  nr10: boolean;
  restricao: boolean;
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
  docStatus?: DocStatus | null;
}

// Texto da tag de documentação (Poka-Yoke: contagem explícita do que falta)
function docTagLabel(ds: DocStatus): string {
  if (ds.ok) return "Documentação OK";
  if (ds.pendencias.length === 1) return "Falta 1 documento";
  if (ds.pendencias.length === 2) return "Faltam 2 documentos";
  return "Documentação pendente";
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

  // Rev. 4609 — status de documentação ao vivo (mesmas regras do Controle de Documentos)
  const { data: badgeStatusData } = trpc.sprint1.aptidao.badgeStatus.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const statusByEmp = useMemo(() => {
    const m = new Map<number, DocStatus>();
    (badgeStatusData as any[] | undefined)?.forEach((s: any) => m.set(s.employeeId, s));
    return m;
  }, [badgeStatusData]);
  const [docFilter, setDocFilter] = useState<"todos" | "ok" | "pendentes">("todos");

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
        docStatus: statusByEmp.get(e.id) || null,
      }));
  }, [employeesData, companyName, statusByEmp]);

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
        docStatus: statusByEmp.get(e.id) || null,
      }));
  }, [employeesData, companyName, statusByEmp]);

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
    let badges = activeTab === "clt" ? cltBadges : activeTab === "pj" ? pjBadges : terceiroBadges;
    // Filtro de documentação só se aplica onde há status (CLT/PJ) — na aba
    // Terceiros a lista NUNCA é filtrada por documentação
    if (docFilter !== "todos" && activeTab !== "terceiro") {
      badges = badges.filter((b) => b.docStatus && (docFilter === "ok" ? b.docStatus.ok : !b.docStatus.ok));
    }
    if (!search) return badges;
    return badges.filter((b) =>
      b.nome.toLowerCase().includes(search.toLowerCase()) ||
      b.cpf?.includes(search) ||
      b.funcao?.toLowerCase().includes(search.toLowerCase())
    );
  }, [activeTab, cltBadges, pjBadges, terceiroBadges, search, docFilter]);

  // Contadores de documentação da aba atual (só CLT/PJ têm docStatus)
  const docCounts = useMemo(() => {
    const badges = activeTab === "clt" ? cltBadges : activeTab === "pj" ? pjBadges : terceiroBadges;
    const comStatus = badges.filter((b) => b.docStatus);
    return {
      total: badges.length,
      ok: comStatus.filter((b) => b.docStatus!.ok).length,
      pendentes: comStatus.filter((b) => !b.docStatus!.ok).length,
      temStatus: comStatus.length > 0,
    };
  }, [activeTab, cltBadges, pjBadges, terceiroBadges]);

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

          {/* Rev. 4609 — filtro de documentação (só onde há status: CLT/PJ) */}
          {docCounts.temStatus && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                onClick={() => setDocFilter("todos")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${docFilter === "todos" ? "bg-foreground text-background border-foreground" : "bg-white text-muted-foreground hover:bg-gray-50"}`}
              >
                Todos ({docCounts.total})
              </button>
              <button
                onClick={() => setDocFilter("ok")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${docFilter === "ok" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50"}`}
              >
                <CheckCircle className="w-3.5 h-3.5 inline mr-1 -mt-px" />Documentação OK ({docCounts.ok})
              </button>
              <button
                onClick={() => setDocFilter("pendentes")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${docFilter === "pendentes" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"}`}
              >
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-px" />Com pendência ({docCounts.pendentes})
              </button>
            </div>
          )}

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

// Rev. 4609 — selos de competência (NR-35 azul / NR-10 amarelo)
function SeloNR({ tipo, mini }: { tipo: "nr35" | "nr10"; mini?: boolean }) {
  const cfg = tipo === "nr35"
    ? { bg: "#1d4ed8", txt: "NR-35", rotulo: "ALTURA" }
    : { bg: "#d97706", txt: "NR-10", rotulo: "ELÉTRICA" };
  if (mini) {
    return (
      <span
        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-extrabold text-white leading-none"
        style={{ backgroundColor: cfg.bg }}
        title={`Treinamento ${cfg.txt} (${cfg.rotulo}) vigente`}
      >
        {cfg.txt}
      </span>
    );
  }
  return (
    <span
      className="inline-flex flex-col items-center justify-center rounded-full text-white shrink-0"
      style={{ backgroundColor: cfg.bg, width: 46, height: 46 }}
    >
      <span className="text-[10px] font-extrabold leading-none">{cfg.txt}</span>
      <span className="text-[6.5px] font-bold leading-none mt-[2px] tracking-wide">{cfg.rotulo}</span>
    </span>
  );
}

// Badge Card Component
function BadgeCard({ badge, color, label, onPreview }: { badge: BadgeData; color: string; label: string; onPreview: () => void }) {
  const ds = badge.docStatus;
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
        {/* Rev. 4609 — tag de documentação + selos NR + restrição */}
        {ds && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                ds.ok ? "bg-emerald-100 text-emerald-800" : ds.pendencias.length <= 2 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"
              }`}
              title={ds.ok ? "ASO, treinamentos, dados e foto em dia" : `Pendências: ${ds.pendencias.join("; ")}`}
            >
              {ds.ok ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {docTagLabel(ds)}
            </span>
            {ds.nr35 && <SeloNR tipo="nr35" mini />}
            {ds.nr10 && <SeloNR tipo="nr10" mini />}
            {ds.restricao && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-600 text-white" title="Restrição de atividade registrada no ASO — detalhe no Controle de Documentos">
                ⚠ Restrição
              </span>
            )}
          </div>
        )}
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

// Badge Preview Component — Rev. 4606 (iteração 3): réplica FIEL da arte.
// Detalhes da arte respeitados: margem branca em volta do painel navy (bordas),
// faixa branca no topo com slot p/ furação do cordão (logo desce), anel LARANJA
// na foto, função em texto simples (sem caixa), linhas de dados com filete só
// sob rótulo/valor, verso com rodapé navy de topo CURVO com friso laranja e
// ícone de 3 pessoas. Paleta fixa da arte: navy #0A1E3C + laranja #EE9803.
const CRACHA_NAVY = "#0A1E3C";
const CRACHA_ORANGE = "#EE9803";
// Telefone fixo do crachá (conforme arte/pedido do usuário 26/07/2026)
const CRACHA_TELEFONE = "(12) 3133-5504";

// Ícone de 3 pessoas (outline), igual ao da arte — lucide Users só tem 2
const TresPessoas = ({ color }: { color: string }) => (
  <svg width="30" height="22" viewBox="0 0 30 22" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="15" cy="6" r="3.2" />
    <path d="M9.5 20c0-3 2.4-5 5.5-5s5.5 2 5.5 5" />
    <circle cx="5.5" cy="7.5" r="2.4" />
    <path d="M1.5 18.5c0-2.4 1.7-4 4-4 .8 0 1.5.2 2.1.5" />
    <circle cx="24.5" cy="7.5" r="2.4" />
    <path d="M28.5 18.5c0-2.4-1.7-4-4-4-.8 0-1.5.2-2.1.5" />
  </svg>
);

// Marca d'água de construção (prédios à esquerda, guindaste à direita), como na arte
const Watermark = () => (
  <>
    <svg className="absolute left-0 bottom-0 pointer-events-none" style={{ opacity: 0.06 }} width="120" height="170" viewBox="0 0 120 170" fill="none">
      <g stroke="#7d8798" strokeWidth="1.3">
        <rect x="6" y="60" width="46" height="110" />
        <rect x="14" y="72" width="10" height="10" /><rect x="34" y="72" width="10" height="10" />
        <rect x="14" y="92" width="10" height="10" /><rect x="34" y="92" width="10" height="10" />
        <rect x="14" y="112" width="10" height="10" /><rect x="34" y="112" width="10" height="10" />
        <rect x="14" y="132" width="10" height="10" /><rect x="34" y="132" width="10" height="10" />
        <rect x="62" y="95" width="50" height="75" />
        <rect x="70" y="106" width="11" height="11" /><rect x="92" y="106" width="11" height="11" />
        <rect x="70" y="128" width="11" height="11" /><rect x="92" y="128" width="11" height="11" />
      </g>
    </svg>
    <svg className="absolute right-0 pointer-events-none" style={{ bottom: 40, opacity: 0.07 }} width="110" height="220" viewBox="0 0 110 220" fill="none">
      <g stroke="#7d8798" strokeWidth="1.3">
        <line x1="52" y1="220" x2="52" y2="20" /><line x1="62" y1="220" x2="62" y2="20" />
        <line x1="52" y1="40" x2="62" y2="20" /><line x1="52" y1="70" x2="62" y2="50" />
        <line x1="52" y1="100" x2="62" y2="80" /><line x1="52" y1="130" x2="62" y2="110" />
        <line x1="52" y1="20" x2="108" y2="20" /><line x1="52" y1="32" x2="98" y2="20" />
        <line x1="12" y1="20" x2="52" y2="20" /><line x1="12" y1="20" x2="12" y2="34" />
        <line x1="90" y1="20" x2="90" y2="52" />
        <rect x="83" y="52" width="14" height="16" />
      </g>
    </svg>
  </>
);

function BadgePreview({ badge, companyName, companyLogo, companyPhone, side, color, label }: {
  badge: BadgeData; companyName: string; companyLogo?: string; companyPhone?: string;
  side: "front" | "back"; color: string; label: string;
}) {
  const qrData = `${window.location.origin}/verificar/${badge.tipo}/${badge.id}`;
  const NAVY = CRACHA_NAVY;
  const OR = CRACHA_ORANGE;

  if (side === "back") {
    return (
      <div className="w-[340px] h-[540px] rounded-2xl overflow-hidden shadow-xl mx-auto relative bg-white flex flex-col">
        <Watermark />
        {/* Espaço p/ furação */}
        <div className="flex justify-center pt-[10px]">
          <div className="w-[34px] h-[7px] rounded-full" style={{ backgroundColor: "#e4e8ef" }} />
        </div>
        {/* Logo (versão fundo branco, recortada da arte) + linha laranja */}
        <div className="flex flex-col items-center pt-[6px] relative">
          <img src={logoCrachaWhite} alt="" className="h-[52px] object-contain" />
          <div className="mt-[10px] h-[2.5px] w-[228px] rounded-full" style={{ backgroundColor: OR }} />
        </div>
        {/* QR emoldurado em laranja */}
        <div className="flex flex-col items-center mt-[14px] relative">
          <div className="rounded-xl border-2 p-[9px] bg-white" style={{ borderColor: OR }}>
            <QRCodeSVG value={qrData} size={118} level="H" fgColor="#111111" />
          </div>
          <p className="text-[11px] mt-[10px] text-center leading-snug font-medium" style={{ color: NAVY }}>
            Verifique a autenticidade<br />deste crachá.
          </p>
        </div>
        {/* Slogan */}
        <div className="flex flex-col items-center mt-[16px] px-8 text-center relative">
          <TresPessoas color={NAVY} />
          <p className="text-[19px] font-extrabold leading-[1.25] mt-[6px]" style={{ color: NAVY }}>
            Grandes obras<br />começam com<br />
            <span style={{ color: OR }}>grandes pessoas.</span>
          </p>
          <div className="mt-[12px] mb-[8px] h-px w-[216px]" style={{ backgroundColor: "#dfe4ec" }} />
          <p className="text-[11px] font-semibold" style={{ color: NAVY }}>Compromisso que vira resultado.</p>
        </div>
        {/* Rodapé navy com topo curvo + friso laranja (como na arte) */}
        <div className="mt-auto relative px-[8px] pb-[8px]">
          <div className="relative overflow-hidden rounded-b-xl rounded-t-[60px]">
            <svg className="block w-full" viewBox="0 0 324 96" preserveAspectRatio="none" style={{ height: 88 }}>
              <path d="M0,26 Q162,-14 324,26 L324,96 L0,96 Z" fill={CRACHA_NAVY} />
              <path d="M0,26 Q162,-14 324,26" fill="none" stroke={CRACHA_ORANGE} strokeWidth="4" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center gap-[14px] pt-[14px]">
              <div className="w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: OR }}>
                <Phone className="w-[19px] h-[19px]" style={{ color: NAVY }} fill={NAVY} />
              </div>
              <div className="text-white">
                <p className="text-[10.5px] leading-[1.3] font-medium">Em caso de perda,<br />entre em contato:</p>
                <p className="text-[17px] font-extrabold mt-[1px] whitespace-nowrap tracking-wide">{CRACHA_TELEFONE}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // FRENTE
  const detalhes = [
    badge.matricula ? { icon: <User className="w-[15px] h-[15px]" strokeWidth={2} />, rotulo: "Nº INTERNO", valor: badge.matricula } : null,
    badge.setor ? { icon: <Briefcase className="w-[15px] h-[15px]" strokeWidth={2} />, rotulo: "SETOR", valor: badge.setor.toUpperCase() } : null,
    badge.empresaTerceira ? { icon: <Building2 className="w-[15px] h-[15px]" strokeWidth={2} />, rotulo: "EMPRESA", valor: badge.empresaTerceira } : null,
    badge.obra ? { icon: <HardHat className="w-[15px] h-[15px]" strokeWidth={2} />, rotulo: "OBRA", valor: badge.obra } : null,
    badge.dataAdmissao ? { icon: <Calendar className="w-[15px] h-[15px]" strokeWidth={2} />, rotulo: "ADMISSÃO", valor: formatDateBR(badge.dataAdmissao) } : null,
  ].filter(Boolean) as { icon: React.ReactNode; rotulo: string; valor: string }[];

  return (
    <div className="w-[340px] h-[540px] rounded-2xl overflow-hidden shadow-xl mx-auto relative bg-white">
      <Watermark />
      {/* Faixa branca no topo com slot de furação (o logo desce, como na arte) */}
      <div className="flex justify-center pt-[10px] pb-[6px]">
        <div className="w-[34px] h-[7px] rounded-full" style={{ backgroundColor: "#e4e8ef" }} />
      </div>
      {/* Painel navy com margem branca nas laterais, cantos arredondados e curva */}
      <div className="relative mx-[8px]" style={{ height: 158 }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 324 158" preserveAspectRatio="none">
          {/* faixa laranja acompanhando a curva (mais grossa à esquerda, some à direita) */}
          <path d="M12,0 H312 Q324,0 324,12 V96 C240,88 130,132 0,158 V12 Q0,0 12,0 Z" fill="none" />
          <path d="M0,158 C130,132 240,88 324,96 L324,86 C240,78 130,122 0,148 Z" fill={CRACHA_ORANGE} />
          {/* painel navy */}
          <path d="M12,0 H312 Q324,0 324,12 V88 C240,80 130,124 0,150 V12 Q0,0 12,0 Z" fill={CRACHA_NAVY} />
        </svg>
        {/* Logo da arte (fundo navy) */}
        <div className="absolute inset-x-0 top-[16px] flex justify-center">
          <img src={logoCrachaNavy} alt="" className="h-[78px] object-contain" />
        </div>
      </div>

      {/* Foto circular com anel laranja sobreposta à curva */}
      <div className="relative flex justify-center" style={{ marginTop: -52 }}>
        <div className="w-[124px] h-[124px] rounded-full bg-white p-[3px]" style={{ boxShadow: "0 6px 16px rgba(10,30,60,0.22)" }}>
          <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-white" style={{ border: `2.5px solid ${OR}` }}>
            {badge.foto ? (
              <img src={badge.foto} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-14 h-14 text-muted-foreground/40" />
            )}
          </div>
        </div>
      </div>

      {/* Nome + ponto laranja + função (texto simples, como na arte) */}
      <div className="text-center mt-[10px] px-6 relative">
        <h2 className="text-[23px] font-extrabold uppercase leading-[1.15] tracking-wide line-clamp-2 overflow-hidden" style={{ color: NAVY }}>
          {badge.nome}
        </h2>
        <div className="flex justify-center mt-[6px] mb-[6px]">
          <span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: OR }} />
        </div>
        <p className="text-[13px] leading-tight truncate" style={{ color: NAVY }}>{badge.funcao || "—"}</p>
      </div>

      {/* Rev. 4609 — selos de competência vigentes (NR-35 / NR-10) */}
      {(badge.docStatus?.nr35 || badge.docStatus?.nr10) && (
        <div className="flex justify-center gap-[8px] mt-[8px] relative">
          {badge.docStatus?.nr35 && <SeloNR tipo="nr35" />}
          {badge.docStatus?.nr10 && <SeloNR tipo="nr10" />}
        </div>
      )}

      {/* Rev. 4609 — faixa de restrição de atividade (aviso genérico, LGPD-safe) */}
      {badge.docStatus?.restricao && (
        <div className="mx-[8px] mt-[8px] relative">
          <div className="flex items-center justify-center gap-[6px] rounded-md py-[6px] px-2" style={{ backgroundColor: "#dc2626" }}>
            <AlertTriangle className="w-[14px] h-[14px] text-white shrink-0" strokeWidth={2.5} />
            <span className="text-white text-[11.5px] font-extrabold tracking-wide">RESTRIÇÃO DE ATIVIDADE</span>
          </div>
        </div>
      )}

      {/* Linhas de dados: ícone + rótulo à esquerda, valor bold à direita, filete sob rótulo/valor.
          Rev. 4609 — espaçamento compacta quando há selos NR/faixa de restrição (cartão tem 540px fixos) */}
      <div className={`${(badge.docStatus?.nr35 || badge.docStatus?.nr10 || badge.docStatus?.restricao) ? "mt-[8px]" : "mt-[16px]"} pl-[38px] pr-[34px] relative`}>
        {detalhes.map((d, i) => (
          <div key={i} className="flex items-center gap-[10px] pt-[9px]">
            <span className="shrink-0" style={{ color: NAVY }}>{d.icon}</span>
            <div className="flex-1 flex items-center border-b pb-[7px]" style={{ borderColor: "#c9d1dd" }}>
              <span className="text-[10px] font-semibold tracking-[0.13em]" style={{ color: NAVY }}>{d.rotulo}</span>
              <span className="ml-auto text-[13px] font-extrabold text-right max-w-[150px] truncate" style={{ color: NAVY }}>{d.valor}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
