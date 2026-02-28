import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/contexts/CompanyContext";
import { Search, Shield, Clock } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  login: "bg-purple-100 text-purple-700",
  evaluate: "bg-amber-100 text-amber-700",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Criação",
  update: "Atualização",
  delete: "Exclusão",
  login: "Login",
  evaluate: "Avaliação",
};

export default function AvalAuditoria() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [searchTerm, setSearchTerm] = useState("");

  const logs = trpc.avaliacao.auditoria.list.useQuery({ companyId, limit: 100 }, { enabled: !!companyId });

  const filtered = useMemo(() => {
    if (!logs.data) return [];
    if (!searchTerm) return logs.data;
    const term = searchTerm.toLowerCase();
    return logs.data.filter((l: any) => l.userName?.toLowerCase().includes(term) || l.action?.toLowerCase().includes(term) || l.details?.toLowerCase().includes(term));
  }, [logs.data, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0F172A]">Auditoria</h2>
        <span className="text-xs text-[#94A3B8]">{filtered.length} registros</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
        <Input placeholder="Buscar por usuário, ação ou detalhes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      {logs.isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[#94A3B8]"><Shield className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhum registro de auditoria.</p></div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((log: any) => (
            <div key={log.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#E2E8F0] bg-white">
              <div className="w-8 h-8 rounded-full bg-[#F1F5F9] flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-[#64748B]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[#0F172A]">{log.userName || "Sistema"}</p>
                  <Badge variant="secondary" className={ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"}>
                    {ACTION_LABELS[log.action] || log.action}
                  </Badge>
                </div>
                <p className="text-xs text-[#64748B] truncate">{log.details || "—"}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-[#94A3B8] shrink-0">
                <Clock className="w-3 h-3" />
                <span>{new Date(log.createdAt).toLocaleString("pt-BR")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
