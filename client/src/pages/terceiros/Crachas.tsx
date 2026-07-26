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
import logoCrachaWhite from "@assets/cracha_logo_white.png";
// Rev. 4611 — crachá aparece p/ TODO funcionário empregado (Ativo/Férias/Afastado/Aviso/Recluso)
// e some quando desligado (Desligado/Lista_Negra/Inativo) — fonte única de shared/modules
import { EMPLOYEE_STATUS_DESLIGADOS } from "@shared/modules";
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
  /** Rev. 4614 — rótulos dos treinamentos VIGENTES (dedup, ex.: ["NR-06","NR-18","NR-35"]) */
  treinamentos?: string[];
}

// Rev. 4614 — pill sutil de treinamento vigente (contorno navy, fundo claro)
function TreinoPill({ rotulo, denso }: { rotulo: string; denso?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full font-bold leading-none"
      style={{
        color: CRACHA_NAVY,
        border: `1.2px solid ${CRACHA_NAVY}`,
        backgroundColor: "#f4f6fa",
        fontSize: denso ? 8 : 9,
        padding: denso ? "2px 5px" : "3px 6px",
        letterSpacing: "0.03em",
      }}
      title={`Treinamento ${rotulo} vigente`}
    >
      {rotulo}
    </span>
  );
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
      .filter((e: any) => e.tipoContrato === "CLT" && !EMPLOYEE_STATUS_DESLIGADOS.includes(e.status))
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
      .filter((e: any) => e.tipoContrato === "PJ" && !EMPLOYEE_STATUS_DESLIGADOS.includes(e.status))
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
function SeloNR({ tipo, mini, size = 46 }: { tipo: "nr35" | "nr10"; mini?: boolean; size?: number }) {
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
      style={{ backgroundColor: cfg.bg, width: size, height: size }}
    >
      <span className="font-extrabold leading-none" style={{ fontSize: size >= 44 ? 10 : 9 }}>{cfg.txt}</span>
      <span className="font-bold leading-none mt-[2px] tracking-wide" style={{ fontSize: size >= 44 ? 6.5 : 6 }}>{cfg.rotulo}</span>
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
            {(ds.treinamentos || []).slice(0, 4).map((r) => (
              <TreinoPill key={r} rotulo={r} />
            ))}
            {(ds.treinamentos || []).length > 4 && (
              <span className="text-[9px] font-bold text-muted-foreground" title={(ds.treinamentos || []).join(", ")}>
                +{(ds.treinamentos || []).length - 4}
              </span>
            )}
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
    // VERSO — layout "Opção 5": fundo branco, logo, QR em cartão com sombra,
    // "Verifique a autenticidade deste crachá", ID laranja e chevron navy no rodapé.
    const idLabel = `${(badge.tipo || "").toUpperCase()}-${badge.id}`;
    return (
      <div className="w-[340px] h-[540px] rounded-2xl overflow-hidden shadow-xl mx-auto relative bg-white flex flex-col">
        <Watermark />
        {/* Espaço p/ furação */}
        <div className="flex justify-center pt-[12px]">
          <div className="w-[34px] h-[7px] rounded-full" style={{ backgroundColor: "#e4e8ef" }} />
        </div>
        {/* Logo (fundo branco) */}
        <div className="flex justify-center pt-[16px] relative">
          <img src={logoCrachaWhite} alt="" className="h-[58px] object-contain" />
        </div>
        {/* QR em cartão branco com sombra suave */}
        <div className="flex flex-col items-center mt-[34px] relative">
          <div className="rounded-[18px] bg-white p-[16px]" style={{ boxShadow: "0 8px 24px rgba(10,30,60,0.14)", border: "1px solid #eef1f6" }}>
            <QRCodeSVG value={qrData} size={132} level="H" fgColor="#111111" />
          </div>
          <p className="text-[13px] mt-[22px] text-center leading-snug font-medium" style={{ color: NAVY }}>
            Verifique a autenticidade<br />deste crachá
          </p>
          <p className="text-[15px] mt-[16px] font-extrabold tracking-wide" style={{ color: OR }}>
            ID: {idLabel}
          </p>
        </div>
        {/* Rodapé navy em chevron + friso laranja (como na arte) */}
        <div className="mt-auto relative">
          <svg className="block w-full" viewBox="0 0 340 110" preserveAspectRatio="none" style={{ height: 104 }}>
            <path d="M0,58 L190,16 L340,52 L340,110 L0,110 Z" fill={CRACHA_NAVY} />
            <path d="M0,50 L190,8 L340,44 L340,52 L190,16 L0,58 Z" fill={CRACHA_ORANGE} />
          </svg>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[10px]" style={{ height: 62 }}>
            <Phone className="w-[15px] h-[15px] text-white shrink-0" fill="white" />
            <p className="text-white text-[11px] font-medium leading-tight">
              Em caso de perda, entre em contato:{" "}
              <span className="font-extrabold text-[12.5px] whitespace-nowrap">{CRACHA_TELEFONE}</span>
            </p>
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

  // Rev. 4611 — modo compacto: quando há selos NR / faixa de restrição ou 4+ linhas
  // de dados, TODOS os blocos encolhem proporcionalmente pra caber nos 540px fixos
  // do cartão (antes o Setor/Admissão estouravam pra fora da frente).
  const temSelos = !!(badge.docStatus?.nr35 || badge.docStatus?.nr10);
  const temFaixa = !!badge.docStatus?.restricao;
  // Rev. 4614 — pills de treinamentos vigentes na frente (sem repetir NR-35/NR-10,
  // que já aparecem como selos redondos)
  const treinoPills = (badge.docStatus?.treinamentos || []).filter(
    (r) => !(badge.docStatus?.nr35 && r === "NR-35") && !(badge.docStatus?.nr10 && r === "NR-10"),
  );
  const temPills = treinoPills.length > 0;
  const blocosExtras = (temSelos ? 1 : 0) + (temFaixa ? 1 : 0) + (temPills ? 1 : 0);
  const compact = blocosExtras > 0 || detalhes.length >= 4;
  const denso = blocosExtras >= 2 || (blocosExtras >= 1 && detalhes.length >= 4);

  const fotoH = denso ? 104 : compact ? 118 : 144;
  const fotoW = denso ? 118 : compact ? 132 : 158;
  const logoH = denso ? 40 : compact ? 46 : 54;
  const nomePx = denso ? 16 : compact ? 18 : 21;

  return (
    <div className="w-[340px] h-[540px] rounded-2xl overflow-hidden shadow-xl mx-auto relative bg-white flex flex-col">
      {/* Canto navy diagonal no topo-esquerdo + faixa laranja paralela (arte "Opção 5") */}
      <svg className="absolute left-0 top-0 pointer-events-none" width="120" height="440" viewBox="0 0 120 440" fill="none">
        <path d="M0,0 L64,0 C52,120 30,260 0,368 Z" fill={CRACHA_NAVY} />
        <path d="M74,0 L88,0 C74,140 48,290 14,412 L0,412 L0,392 C32,278 60,132 74,0 Z" fill={CRACHA_ORANGE} />
      </svg>
      {/* Slot de furação */}
      <div className={`flex justify-center ${denso ? "pt-[8px]" : "pt-[12px]"} pb-[4px] relative shrink-0`}>
        <div className="w-[34px] h-[7px] rounded-full" style={{ backgroundColor: "#e4e8ef" }} />
      </div>
      {/* Logo em fundo branco, centralizado */}
      <div className={`flex justify-center ${denso ? "pt-[2px]" : compact ? "pt-[4px]" : "pt-[8px]"} relative shrink-0`}>
        <img src={logoCrachaWhite} alt="" className="object-contain" style={{ height: logoH }} />
      </div>

      {/* Foto quadrada arredondada com borda navy */}
      <div className={`relative flex justify-center ${denso ? "mt-[8px]" : compact ? "mt-[12px]" : "mt-[18px]"} shrink-0`}>
        <div className="rounded-[20px] overflow-hidden flex items-center justify-center bg-white" style={{ width: fotoW, height: fotoH, border: `${denso ? 3 : 4}px solid ${NAVY}`, boxShadow: "0 6px 16px rgba(10,30,60,0.16)" }}>
          {badge.foto ? (
            <img src={badge.foto} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-14 h-14 text-muted-foreground/40" />
          )}
        </div>
      </div>

      {/* Nome + função laranja entre traços (— FUNÇÃO —) */}
      <div className={`text-center ${denso ? "mt-[8px]" : "mt-[12px]"} px-6 relative shrink-0`}>
        <h2 className="font-extrabold uppercase leading-[1.12] tracking-wide line-clamp-2 overflow-hidden" style={{ color: NAVY, fontSize: nomePx }}>
          {badge.nome}
        </h2>
        <div className={`flex items-center justify-center gap-[8px] ${denso ? "mt-[4px]" : "mt-[6px]"}`}>
          <span className="h-[2px] w-[18px] rounded-full shrink-0" style={{ backgroundColor: OR }} />
          <p className="font-extrabold uppercase tracking-[0.08em] leading-tight truncate max-w-[190px]" style={{ color: OR, fontSize: denso ? 11 : 12.5 }}>
            {badge.funcao || "—"}
          </p>
          <span className="h-[2px] w-[18px] rounded-full shrink-0" style={{ backgroundColor: OR }} />
        </div>
      </div>

      {/* Rev. 4609 — selos de competência vigentes (NR-35 / NR-10) */}
      {temSelos && (
        <div className={`flex justify-center gap-[8px] ${denso ? "mt-[6px]" : "mt-[8px]"} relative shrink-0`}>
          {badge.docStatus?.nr35 && <SeloNR tipo="nr35" size={denso ? 38 : 44} />}
          {badge.docStatus?.nr10 && <SeloNR tipo="nr10" size={denso ? 38 : 44} />}
        </div>
      )}

      {/* Rev. 4614 — fileira sutil de treinamentos vigentes (pills navy) */}
      {temPills && (
        <div className={`flex flex-wrap justify-center gap-[4px] px-[26px] ${denso ? "mt-[5px]" : "mt-[7px]"} relative shrink-0`}>
          {treinoPills.slice(0, 8).map((r) => (
            <TreinoPill key={r} rotulo={r} denso={denso} />
          ))}
          {treinoPills.length > 8 && (
            <span className="font-extrabold leading-none" style={{ color: CRACHA_NAVY, fontSize: denso ? 8 : 9 }}>
              +{treinoPills.length - 8}
            </span>
          )}
        </div>
      )}

      {/* Rev. 4609 — faixa de restrição de atividade (aviso genérico, LGPD-safe) */}
      {temFaixa && (
        <div className={`mx-[10px] ${denso ? "mt-[6px]" : "mt-[8px]"} relative shrink-0`}>
          <div className={`flex items-center justify-center gap-[6px] rounded-md ${denso ? "py-[4px]" : "py-[6px]"} px-2`} style={{ backgroundColor: "#dc2626" }}>
            <AlertTriangle className="w-[13px] h-[13px] text-white shrink-0" strokeWidth={2.5} />
            <span className="text-white text-[11px] font-extrabold tracking-wide">RESTRIÇÃO DE ATIVIDADE</span>
          </div>
        </div>
      )}

      {/* Linhas de dados: ícone + rótulo à esquerda, valor bold à direita, filete sob rótulo/valor.
          flex-1 + distribuição uniforme: as linhas ocupam SÓ o espaço restante, sem estourar o cartão */}
      <div className={`flex-1 min-h-0 flex flex-col justify-evenly ${denso ? "mt-[2px] mb-[26px]" : compact ? "mt-[4px] mb-[28px]" : "mt-[10px] mb-[30px]"} pl-[40px] pr-[34px] relative`}>
        {detalhes.map((d, i) => (
          <div key={i} className="flex items-center gap-[11px]">
            {/* Ícone em caixinha arredondada com contorno navy (como na arte) */}
            <span className={`shrink-0 ${denso ? "w-[22px] h-[22px]" : "w-[26px] h-[26px]"} rounded-[7px] flex items-center justify-center`} style={{ color: NAVY, border: `1.5px solid ${NAVY}` }}>{d.icon}</span>
            <div className={`flex-1 flex items-center border-b ${denso ? "pb-[4px]" : "pb-[6px]"}`} style={{ borderColor: "#c9d1dd" }}>
              <span className="text-[10px] font-semibold tracking-[0.13em]" style={{ color: NAVY }}>{d.rotulo}</span>
              <span className={`ml-auto ${denso ? "text-[12px]" : "text-[13px]"} font-extrabold text-right max-w-[145px] truncate`} style={{ color: NAVY }}>{d.valor}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 3 pontinhos do rodapé (navy • laranja • navy), como na arte */}
      <div className="absolute inset-x-0 bottom-[10px] flex justify-center gap-[8px]">
        <span className="w-[8px] h-[8px] rounded-full" style={{ backgroundColor: NAVY }} />
        <span className="w-[8px] h-[8px] rounded-full" style={{ backgroundColor: OR }} />
        <span className="w-[8px] h-[8px] rounded-full" style={{ backgroundColor: NAVY }} />
      </div>
    </div>
  );
}
