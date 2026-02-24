import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatDateTime } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Bug, Sparkles, Shield, Zap, Wrench, Calendar, User, Tag, Printer, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

const TIPO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  feature: { label: "Nova Funcionalidade", color: "bg-blue-100 text-blue-800 border-blue-200", icon: <Sparkles className="h-3.5 w-3.5" /> },
  bugfix: { label: "Correção de Bug", color: "bg-red-100 text-red-800 border-red-200", icon: <Bug className="h-3.5 w-3.5" /> },
  melhoria: { label: "Melhoria", color: "bg-green-100 text-green-800 border-green-200", icon: <Wrench className="h-3.5 w-3.5" /> },
  seguranca: { label: "Segurança", color: "bg-amber-100 text-amber-800 border-amber-200", icon: <Shield className="h-3.5 w-3.5" /> },
  performance: { label: "Performance", color: "bg-purple-100 text-purple-800 border-purple-200", icon: <Zap className="h-3.5 w-3.5" /> },
};

export default function Revisoes() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const revisionsQuery = trpc.revisions.list.useQuery(undefined, { enabled: isMaster });

  const handlePrint = () => {
    window.print();
  };

  if (!isMaster) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <Shield className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Acesso Restrito</p>
          <p className="text-sm">Apenas o Admin Master pode acessar o Controle de Revisões.</p>
        </div>
      </div>
    );
  }

  const revisions = revisionsQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <GitBranch className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold">Controle de Revisões</h1>
          </div>
          <p className="text-muted-foreground mt-1">Histórico detalhado de todas as atualizações do sistema</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <div className="bg-background border rounded-lg p-2.5 text-center">
          <p className="text-xl font-bold text-primary">{revisions.length}</p>
          <p className="text-[10px] leading-tight text-muted-foreground">Total</p>
        </div>
        {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
          <div key={key} className="bg-background border rounded-lg p-2.5 text-center">
            <p className="text-xl font-bold">{revisions.filter(r => r.tipo === key).length}</p>
            <p className="text-[10px] leading-tight text-muted-foreground flex items-center justify-center gap-0.5">{cfg.icon} <span className="truncate">{cfg.label}</span></p>
          </div>
        ))}
      </div>

      {/* Revision Timeline */}
      <div className="space-y-0">
        {revisions.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma revisão registrada ainda.</p>
          </div>
        )}
        {revisions.map((rev, idx) => {
          const cfg = TIPO_CONFIG[rev.tipo] || TIPO_CONFIG.feature;
          const isLatest = idx === 0;
          return (
            <div key={rev.id} className={`relative border-l-4 ${isLatest ? "border-primary" : "border-muted"} pl-6 pb-8 ml-4`}>
              {/* Timeline dot */}
              <div className={`absolute -left-[11px] top-0 w-[18px] h-[18px] rounded-full border-2 ${isLatest ? "bg-primary border-primary" : "bg-muted border-muted-foreground/30"}`} />

              <div className={`bg-background border rounded-lg p-5 ${isLatest ? "ring-2 ring-primary/20" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant="outline" className="text-sm font-mono font-bold px-2.5 py-0.5">
                        Rev. {rev.version}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${cfg.color} border`}>
                        {cfg.icon}
                        <span className="ml-1">{cfg.label}</span>
                      </Badge>
                      {isLatest && (
                        <Badge className="bg-primary text-primary-foreground text-xs">
                          Atual
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold mt-2">{rev.titulo}</h3>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{rev.descricao}</p>
                    {rev.modulos && (
                      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        {rev.modulos.split(",").map((m, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{m.trim()}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> {rev.criadoPor}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" /> {formatDateTime(rev.dataPublicacao)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
