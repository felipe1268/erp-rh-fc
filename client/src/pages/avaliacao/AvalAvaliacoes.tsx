import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Search, Eye, Trash2, Calendar, Clock, User, Star, Filter } from "lucide-react";

const PILARES = [
  { nome: "Postura e Disciplina", cor: "#1e3a5f", criterios: ["comportamento", "pontualidade", "assiduidade", "segurancaEpis"] },
  { nome: "Desempenho Técnico", cor: "#059669", criterios: ["qualidadeAcabamento", "produtividadeRitmo", "cuidadoFerramentas", "economiaMateriais"] },
  { nome: "Atitude e Crescimento", cor: "#D97706", criterios: ["trabalhoEquipe", "iniciativaProatividade", "disponibilidadeFlexibilidade", "organizacaoLimpeza"] },
];

const CRITERIO_LABELS: Record<string, string> = {
  comportamento: "Comportamento", pontualidade: "Pontualidade", assiduidade: "Assiduidade",
  segurancaEpis: "Segurança/EPIs", qualidadeAcabamento: "Qualidade/Acabamento",
  produtividadeRitmo: "Produtividade/Ritmo", cuidadoFerramentas: "Cuidado Ferramentas",
  economiaMateriais: "Economia Materiais", trabalhoEquipe: "Trabalho Equipe",
  iniciativaProatividade: "Iniciativa", disponibilidadeFlexibilidade: "Disponibilidade",
  organizacaoLimpeza: "Organização/Limpeza",
};

const NOTA_COLORS: Record<number, string> = { 1: "#EF4444", 2: "#F97316", 3: "#EAB308", 4: "#22C55E", 5: "#1e3a5f" };
const REC_COLORS: Record<string, string> = {
  "SUGERIR DEMISSÃO": "bg-red-100 text-red-700",
  "ATENÇÃO - ACOMPANHAR": "bg-orange-100 text-orange-700",
  "TREINAMENTO": "bg-yellow-100 text-yellow-700",
  "PROMOÇÃO / PREMIAÇÃO": "bg-green-100 text-green-700",
};

function getMediaColor(media: number): string {
  if (media < 2) return "#EF4444";
  if (media < 3) return "#F97316";
  if (media < 4) return "#EAB308";
  if (media < 5) return "#22C55E";
  return "#1e3a5f";
}

export default function AvalAvaliacoes() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const utils = trpc.useUtils();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterRec, setFilterRec] = useState("all");
  const [selectedEval, setSelectedEval] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const avaliacoes = trpc.avaliacao.avaliacoes.list.useQuery({ companyId }, { enabled: !!companyId });
  const deleteMut = trpc.avaliacao.avaliacoes.delete.useMutation({
    onSuccess: () => { toast.success("Avaliação excluída"); utils.avaliacao.avaliacoes.list.invalidate(); setDeleteConfirm(null); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!avaliacoes.data) return [];
    let list = avaliacoes.data;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter((a: any) => a.employeeName?.toLowerCase().includes(term) || a.evaluatorName?.toLowerCase().includes(term));
    }
    if (filterRec !== "all") list = list.filter((a: any) => a.recomendacao === filterRec);
    return list;
  }, [avaliacoes.data, searchTerm, filterRec]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0F172A]">Avaliações Realizadas</h2>
        <span className="text-xs text-[#94A3B8]">{filtered.length} registros</span>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <Input placeholder="Buscar por funcionário ou avaliador..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterRec} onValueChange={setFilterRec}>
          <SelectTrigger className="w-[200px]"><Filter className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Recomendações</SelectItem>
            <SelectItem value="SUGERIR DEMISSÃO">Demissão</SelectItem>
            <SelectItem value="ATENÇÃO - ACOMPANHAR">Atenção</SelectItem>
            <SelectItem value="TREINAMENTO">Treinamento</SelectItem>
            <SelectItem value="PROMOÇÃO / PREMIAÇÃO">Promoção</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {avaliacoes.isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[#94A3B8]"><Star className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhuma avaliação encontrada.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((aval: any) => {
            const media = Number(aval.mediaGeral);
            return (
              <div key={aval.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] transition-colors">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: getMediaColor(media) }}>
                  {media.toFixed(1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0F172A] truncate">{aval.employeeName}</p>
                  <div className="flex items-center gap-2 text-xs text-[#64748B]">
                    <span>{aval.mesReferencia || new Date(aval.createdAt).toLocaleDateString("pt-BR")}</span>
                    <span>•</span>
                    <span>por {aval.evaluatorName || "Admin"}</span>
                    {aval.durationSeconds && <span>• {Math.floor(aval.durationSeconds / 60)}min</span>}
                  </div>
                </div>
                <Badge className={REC_COLORS[aval.recomendacao || ""] || "bg-gray-100 text-gray-700"} variant="secondary">{aval.recomendacao}</Badge>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setSelectedEval(aval)}><Eye className="w-4 h-4 text-[#64748B]" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteConfirm(aval.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedEval} onOpenChange={() => setSelectedEval(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Avaliação</DialogTitle>
          </DialogHeader>
          {selectedEval && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: getMediaColor(Number(selectedEval.mediaGeral)) }}>
                  {Number(selectedEval.mediaGeral).toFixed(1)}
                </div>
                <div>
                  <p className="font-bold text-[#0F172A]">{selectedEval.employeeName}</p>
                  <p className="text-sm text-[#64748B]">{selectedEval.mesReferencia} • por {selectedEval.evaluatorName}</p>
                </div>
                <Badge className={REC_COLORS[selectedEval.recomendacao || ""] || ""} variant="secondary">{selectedEval.recomendacao}</Badge>
              </div>

              {PILARES.map((pilar) => (
                <div key={pilar.nome}>
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: pilar.cor }}>{pilar.nome}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {pilar.criterios.map((key) => {
                      const val = selectedEval[key] || 0;
                      return (
                        <div key={key} className="flex items-center gap-2 p-2 rounded bg-[#F8FAFC]">
                          <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: NOTA_COLORS[val] || "#94A3B8" }}>{val}</span>
                          <span className="text-xs text-[#475569]">{CRITERIO_LABELS[key]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {selectedEval.observacoes && (
                <div>
                  <h4 className="text-xs font-bold text-[#64748B] mb-1">Observações</h4>
                  <p className="text-sm text-[#475569] bg-[#F8FAFC] p-3 rounded">{selectedEval.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Avaliação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. A avaliação será permanentemente removida.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteConfirm && deleteMut.mutate({ id: deleteConfirm })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
