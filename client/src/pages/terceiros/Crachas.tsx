import { useState, useMemo, useRef, useCallback } from "react";
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
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import {
  CreditCard, Search, Download, Printer, User, Building2, HardHat,
  Eye, Filter, Users, CheckCircle, AlertTriangle, Camera
} from "lucide-react";

type BadgeType = "clt" | "pj" | "terceiro";

const BADGE_COLORS: Record<BadgeType, { bg: string; header: string; accent: string; label: string }> = {
  clt: { bg: "bg-blue-50", header: "bg-gradient-to-r from-blue-700 to-blue-500", accent: "text-blue-700", label: "CLT" },
  pj: { bg: "bg-green-50", header: "bg-gradient-to-r from-green-700 to-green-500", accent: "text-green-700", label: "PJ" },
  terceiro: { bg: "bg-orange-50", header: "bg-gradient-to-r from-orange-600 to-orange-400", accent: "text-orange-700", label: "TERCEIRO" },
};

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
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const [activeTab, setActiveTab] = useState<"clt" | "pj" | "terceiro">("clt");
  const [search, setSearch] = useState("");
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);

  // Fetch employees (CLT + PJ)
  const { data: employeesData, isLoading: loadingEmployees } = trpc.employees.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  // Fetch terceiros
  const { data: terceirosData, isLoading: loadingTerceiros } = trpc.terceiros.funcionarios.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  // Fetch empresas terceiras
  const { data: empresasTerceiras } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  // Fetch companies for name
  const { data: companiesData } = trpc.companies.list.useQuery();

  const companyName = useMemo(() => {
    if (!companiesData || !companyId) return "";
    const c = (companiesData as any[]).find((c: any) => c.id === companyId);
    return c?.nomeFantasia || c?.razaoSocial || "";
  }, [companiesData, companyId]);

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
        matricula: e.matricula || e.codigoInterno,
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
        matricula: e.matricula || e.codigoInterno,
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

  const generateQRData = (badge: BadgeData) => {
    return JSON.stringify({
      id: badge.id,
      nome: badge.nome,
      tipo: badge.tipo,
      empresa: badge.empresa,
      funcao: badge.funcao,
      ...(badge.empresaTerceira ? { terceira: badge.empresaTerceira } : {}),
    });
  };

  const isLoading = loadingEmployees || loadingTerceiros;

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
        </div>

        {/* Color Legend */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500"></div>
            <span className="text-sm">CLT ({cltBadges.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500"></div>
            <span className="text-sm">PJ ({pjBadges.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-500"></div>
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
                    <BadgeCard key={`${badge.tipo}-${badge.id}`} badge={badge} onPreview={() => { setSelectedBadge(badge); setPreviewOpen(true); }} />
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
          headerColor={selectedBadge ? BADGE_COLORS[selectedBadge.tipo].header : undefined}
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
                    <BadgePreview badge={selectedBadge} companyName={companyName} side="front" />
                  </div>
                </div>
                {/* Badge Preview - Back */}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 text-center">Verso do Crachá</h3>
                  <BadgePreview badge={selectedBadge} companyName={companyName} side="back" />
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
function BadgeCard({ badge, onPreview }: { badge: BadgeData; onPreview: () => void }) {
  const colors = BADGE_COLORS[badge.tipo];
  return (
    <div className={`border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer ${colors.bg}`} onClick={onPreview}>
      <div className={`${colors.header} px-3 py-2 flex items-center justify-between`}>
        <span className="text-white text-xs font-bold tracking-wider">{colors.label}</span>
        <CreditCard className="w-4 h-4 text-white/70" />
      </div>
      <div className="p-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white border-2 border-current flex items-center justify-center overflow-hidden shrink-0"
            style={{ borderColor: badge.tipo === "clt" ? "#1d4ed8" : badge.tipo === "pj" ? "#15803d" : "#ea580c" }}>
            {badge.foto ? (
              <img src={badge.foto} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className={`font-semibold text-sm truncate ${colors.accent}`}>{badge.nome}</p>
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

// Badge Preview Component (actual badge design)
function BadgePreview({ badge, companyName, side }: { badge: BadgeData; companyName: string; side: "front" | "back" }) {
  const colors = BADGE_COLORS[badge.tipo];
  const qrData = JSON.stringify({
    id: badge.id,
    nome: badge.nome,
    tipo: badge.tipo,
    empresa: badge.empresa,
    funcao: badge.funcao,
    ...(badge.empresaTerceira ? { terceira: badge.empresaTerceira } : {}),
  });

  if (side === "back") {
    return (
      <div className="w-[340px] h-[540px] rounded-xl overflow-hidden shadow-xl border-2 mx-auto"
        style={{ borderColor: badge.tipo === "clt" ? "#1d4ed8" : badge.tipo === "pj" ? "#15803d" : "#ea580c" }}>
        <div className={`${colors.header} h-16 flex items-center justify-center`}>
          <span className="text-white text-lg font-bold tracking-widest">{companyName || "FC ENGENHARIA"}</span>
        </div>
        <div className={`${colors.bg} flex-1 flex flex-col items-center justify-center p-6`} style={{ height: "calc(100% - 4rem)" }}>
          <div className="bg-white p-4 rounded-xl shadow-md">
            <QRCodeSVG value={qrData} size={180} level="H" includeMargin={true} />
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">Escaneie o QR Code para verificar a identidade</p>
          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">ID: {badge.tipo.toUpperCase()}-{String(badge.id).padStart(5, "0")}</p>
          </div>
          <div className="mt-auto pt-4 text-center">
            <p className="text-[10px] text-muted-foreground">Em caso de perda, devolver ao departamento de RH</p>
            <p className="text-[10px] text-muted-foreground">{companyName || "FC Engenharia"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[340px] h-[540px] rounded-xl overflow-hidden shadow-xl border-2 mx-auto"
      style={{ borderColor: badge.tipo === "clt" ? "#1d4ed8" : badge.tipo === "pj" ? "#15803d" : "#ea580c" }}>
      {/* Header */}
      <div className={`${colors.header} px-4 py-3 flex items-center justify-between`}>
        <div>
          <p className="text-white text-sm font-bold">{companyName || "FC ENGENHARIA"}</p>
          <p className="text-white/70 text-[10px]">Gestão Integrada</p>
        </div>
        <div className="bg-white/20 rounded-md px-2 py-1">
          <span className="text-white text-xs font-bold tracking-wider">{colors.label}</span>
        </div>
      </div>

      {/* Body */}
      <div className={`${colors.bg} p-4 flex flex-col items-center`} style={{ height: "calc(100% - 3.5rem)" }}>
        {/* Photo */}
        <div className="w-28 h-28 rounded-full bg-white border-4 flex items-center justify-center overflow-hidden mt-2 shadow-md"
          style={{ borderColor: badge.tipo === "clt" ? "#1d4ed8" : badge.tipo === "pj" ? "#15803d" : "#ea580c" }}>
          {badge.foto ? (
            <img src={badge.foto} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-14 h-14 text-muted-foreground/40" />
          )}
        </div>

        {/* Name */}
        <h2 className={`text-lg font-bold mt-3 text-center leading-tight ${colors.accent}`}>
          {badge.nome}
        </h2>

        {/* Function */}
        <p className="text-sm text-muted-foreground mt-1 text-center">{badge.funcao || "—"}</p>

        {/* Details */}
        <div className="w-full mt-4 space-y-2 px-2">
          {badge.matricula && (
            <div className="flex justify-between text-xs border-b border-current/10 pb-1">
              <span className="text-muted-foreground">Matrícula:</span>
              <span className="font-medium">{badge.matricula}</span>
            </div>
          )}
          {badge.setor && (
            <div className="flex justify-between text-xs border-b border-current/10 pb-1">
              <span className="text-muted-foreground">Setor:</span>
              <span className="font-medium">{badge.setor}</span>
            </div>
          )}
          {badge.empresaTerceira && (
            <div className="flex justify-between text-xs border-b border-current/10 pb-1">
              <span className="text-muted-foreground">Empresa:</span>
              <span className="font-medium text-right max-w-[180px] truncate">{badge.empresaTerceira}</span>
            </div>
          )}
          {badge.obra && (
            <div className="flex justify-between text-xs border-b border-current/10 pb-1">
              <span className="text-muted-foreground">Obra:</span>
              <span className="font-medium text-right max-w-[180px] truncate">{badge.obra}</span>
            </div>
          )}
          {badge.dataAdmissao && (
            <div className="flex justify-between text-xs border-b border-current/10 pb-1">
              <span className="text-muted-foreground">Admissão:</span>
              <span className="font-medium">{new Date(badge.dataAdmissao).toLocaleDateString("pt-BR")}</span>
            </div>
          )}
        </div>

        {/* QR Code small */}
        <div className="mt-auto pt-3 flex items-center gap-3">
          <QRCodeSVG value={qrData} size={50} level="M" />
          <div className="text-[10px] text-muted-foreground">
            <p>ID: {badge.tipo.toUpperCase()}-{String(badge.id).padStart(5, "0")}</p>
            <p>{companyName || "FC Engenharia"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
